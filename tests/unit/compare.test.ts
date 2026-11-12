import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatService } from "../../src/main/chat/service.js";
import { ModelCatalog } from "../../src/main/chat/catalog.js";
import { SqliteChatStore } from "../../src/main/chat/sqlite-store.js";
import { MemoryChatStore } from "../../src/main/chat/memory-store.js";
import type { ChatProvider, ChatEvent, ModelInfo, TurnInput } from "../../src/main/providers/types.js";

class CompareProvider implements ChatProvider {
  inputs: TurnInput[] = [];
  concurrent = 0;
  maximumConcurrent = 0;
  blocked = false;
  fail = false;
  constructor(readonly id: "claude" | "codex", private ids = ["one", "two"], private vision = true) {}
  async getStatus() { return { state: "ready" as const }; }
  async listModels(): Promise<ModelInfo[]> { return this.ids.map(id => ({id, provider: this.id, label: `${this.id} ${id}`, supportsImages: this.vision, supportsPdf: false, supportsEffort: false})); }
  async *runTurn(input: TurnInput): AsyncIterable<ChatEvent> {
    this.inputs.push(input);
    this.maximumConcurrent = Math.max(this.maximumConcurrent, ++this.concurrent);
    try {
      yield {type: "session", nativeSessionId: `${this.id}-${this.inputs.length}`};
      if (this.fail) { yield {type: "error", kind: "quota", message: "limit"}; return; }
      yield {type: "text-delta", text: `${this.id}/${input.model} independent answer`};
      if (this.blocked) await new Promise<void>(resolve => {
        if (input.signal.aborted) resolve();
        else input.signal.addEventListener("abort", () => resolve(), {once:true});
      });
      if (!input.signal.aborted) yield {type: "done"};
    } finally { this.concurrent--; }
  }
  async dispose() {}
}
async function setup(providers = [new CompareProvider("claude"), new CompareProvider("codex", ["one"])], store = new MemoryChatStore() as MemoryChatStore | SqliteChatStore) {
  const catalog = new ModelCatalog(undefined, providers);
  await catalog.refresh();
  const service = new ChatService(catalog, () => {}, () => {}, undefined, undefined, undefined, store);
  return {service, store};
}
afterEach(() => vi.useRealTimers());

describe("comparison turns", () => {
  it("sends the same prior context and attachments to three fresh independent sessions, serializing one provider", async () => {
    const a = new CompareProvider("claude"), b = new CompareProvider("codex", ["one"]);
    const {service, store} = await setup([a,b]);
    try {
      service.send("my name is Ana"); await service.waitForIdle();
      const id = service.snapshot().chatId!;
      const nativeBefore = store.getProviderSession(id, "claude");
      service.updateChat({compareModels:["claude:one", "claude:two", "codex:one"]});
      const attachment = {id:"file", kind:"text" as const, path:"/synthetic.txt", name:"document.docx", mime:"text/plain", extractedText:"document text"};
      service.send("compare this", [attachment]); await service.waitForIdle();
      const inputs = [...a.inputs.slice(1), ...b.inputs];
      expect(inputs).toHaveLength(3);
      expect(new Set(inputs.map(input => input.text)).size).toBe(1);
      expect(inputs[0]?.text).toContain("my name is Ana");
      expect(inputs.every(input => !input.nativeSessionId)).toBe(true);
      expect(inputs.every(input => input.attachments[0]?.extractedText === "document text")).toBe(true);
      expect(inputs.every(input => !input.text.includes("claude/two independent answer"))).toBe(true);
      expect(a.maximumConcurrent).toBe(1);
      expect(store.getProviderSession(id,"claude")).toEqual(nativeBefore);
      const comparison = service.snapshot().messages.slice(-4);
      expect(comparison.map(message => message.role)).toEqual(["user","assistant","assistant","assistant"]);
      expect(new Set(comparison.map(message => message.comparisonId)).size).toBe(1);
      expect(comparison.every(message => message.status === "complete")).toBe(true);
    } finally { await service.dispose(); }
  });

  it("cancels a streaming answer and all queued answers before their providers start them", async () => {
    const provider = new CompareProvider("claude"); provider.blocked = true;
    const {service} = await setup([provider]);
    try {
      service.updateChat({compareModels:["claude:one","claude:two"]}); service.send("stop both");
      await vi.waitFor(() => expect(provider.inputs).toHaveLength(1));
      expect(service.snapshot().active).toBe(true);
      service.stop(); await service.waitForIdle();
      expect(provider.inputs).toHaveLength(1);
      expect(service.snapshot().active).toBe(false);
      expect(service.snapshot().messages.filter(message => message.role === "assistant").map(message => message.status)).toEqual(["stopped","stopped"]);
    } finally { await service.dispose(); }
  });

  it("keeps the other answer running when one provider fails", async () => {
    const a = new CompareProvider("claude"), b = new CompareProvider("codex", ["one"]); a.fail = true; b.blocked = true;
    const {service} = await setup([a,b]);
    try {
      service.updateChat({compareModels:["claude:one","codex:one"]}); service.send("question");
      await vi.waitFor(() => expect(service.snapshot().messages.some(message => message.status === "error")).toBe(true));
      expect(service.snapshot().active).toBe(true);
      expect(service.snapshot().messages.find(message => message.provider === "codex")?.status).toBe("streaming");
      service.stop(); await service.waitForIdle();
      expect(service.snapshot().messages.find(message => message.provider === "claude")?.status).toBe("error");
    } finally { await service.dispose(); }
  });

  it("retries a whole comparison once, then permits an ordinary askOther and retry without duplicating the question", async () => {
    const a = new CompareProvider("claude"), b = new CompareProvider("codex", ["one"]);
    const {service} = await setup([a,b]);
    try {
      service.updateChat({compareModels:["claude:one","claude:two"]}); service.send("question"); await service.waitForIdle();
      service.retry(); await service.waitForIdle();
      expect(service.snapshot().messages.filter(message => message.role === "user")).toHaveLength(1);
      expect(service.snapshot().messages.filter(message => message.role === "assistant")).toHaveLength(2);
      expect(a.inputs).toHaveLength(4);
      service.askOther("codex:one"); await service.waitForIdle();
      service.retry(); await service.waitForIdle();
      expect(a.inputs).toHaveLength(4);
      expect(b.inputs).toHaveLength(2);
      expect(service.snapshot().messages.filter(message => message.role === "assistant")).toHaveLength(3);
      service.updateChat({compareModels:[]}); service.send("normal again"); await service.waitForIdle();
      expect(service.snapshot().messages.at(-1)?.comparisonId).toBeUndefined();
    } finally { await service.dispose(); }
  });

  it("validates every model and image capability before saving any new chat", async () => {
    const {service} = await setup([new CompareProvider("claude"),new CompareProvider("codex",["one"],false)]);
    try {
      for (const compareModels of [["claude:one"],["claude:one","claude:one"],["claude:one","missing"],["claude:one","claude:two","codex:one","extra"]]) expect(() => service.updateChat({compareModels})).toThrow();
      service.updateChat({compareModels:["claude:one","codex:one"]});
      expect(() => service.send("image",[{id:"image",name:"a.png",path:"/a.png",kind:"image",mime:"image/png"}])).toThrow("no ve imágenes");
      expect(service.snapshot().chatId).toBeNull();
      expect(service.snapshot().messages).toEqual([]);
    } finally { await service.dispose(); }
  });

  it("reopens comparison selections, grouped answers and document copies from SQLite after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(),"j7-compare-")), path = join(directory,"j7.db"), file=join(directory,"document.txt");
    writeFileSync(file,"kept text");
    let store = new SqliteChatStore(path,directory);
    let {service} = await setup(undefined,store);
    try {
      service.updateChat({compareModels:["claude:one","codex:one"]});
      service.send("saved question",[{id:"file",kind:"text",path:file,name:"document.docx",mime:"text/plain",extractedText:"kept text"}]);
      await service.waitForIdle();
      const before = service.snapshot(), id = before.chatId!;
      await service.dispose(); store.db.close();
      store = new SqliteChatStore(path,directory); ({service}=await setup(undefined,store));
      service.selectChat(id);
      expect(service.snapshot().compareModels).toEqual(["claude:one","codex:one"]);
      expect(service.snapshot().messages).toEqual(before.messages);
      expect(store.getAttachment("file")?.extractedText).toBe("kept text");
      expect(store.list("saved")).toHaveLength(1);
    } finally { await service.dispose(); store.db.close(); rmSync(directory,{recursive:true,force:true}); }
  });
});
