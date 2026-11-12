import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatService } from "../../src/main/chat/service.js";
import { ModelCatalog } from "../../src/main/chat/catalog.js";
import { MemoryChatStore } from "../../src/main/chat/memory-store.js";
import { SettingsStore } from "../../src/main/settings.js";
import { MockProvider } from "../../src/main/providers/mock.js";
import { classifyError } from "../../src/main/providers/runtime.js";
import type { ChatEvent, ChatProvider, ProviderId, TurnHint, TurnInput } from "../../src/main/providers/types.js";
class RecordingProvider implements ChatProvider {
  inputs: TurnInput[] = [];
  hints: TurnHint[] = [];
  disposed = 0;
  script: (input: TurnInput, count: number) => AsyncIterable<ChatEvent> = async function* (_input, count) {
    yield { type: "session", nativeSessionId: `session-${count}` };
    yield { type: "text-delta", text: `answer-${count}` };
    yield { type: "done" };
  };
  constructor(readonly id: ProviderId) {}
  async getStatus() { return { state: "ready" as const }; }
  async listModels() { return [{ id: this.id, provider: this.id, label: this.id, supportsImages: true, supportsPdf: false, supportsEffort: this.id !== "mock-b" }]; }
  async *runTurn(input: TurnInput) { this.inputs.push(input); yield* this.script(input, this.inputs.length); }
  async prepare(hint: TurnHint) { this.hints.push(hint); }
  async dispose() { this.disposed++; }
}
async function setup(providers: ChatProvider[] = [new RecordingProvider("claude"), new RecordingProvider("codex")], settings?: SettingsStore) {
  const catalog = new ModelCatalog(settings, providers);
  await catalog.refresh();
  const store = new MemoryChatStore();
  const service = new ChatService(catalog, () => {}, () => {}, undefined, undefined, undefined, store, settings);
  const send = async (text: string) => { service.send(text); await service.waitForIdle(); };
  return { service, store, catalog, send };
}
afterEach(() => { vi.useRealTimers(); });
describe("F1–F5 turn and session service", () => {
  it("hands off Claude → GPT → Claude, resuming only with the unseen exchange", async () => {
    const claude = new RecordingProvider("claude"), codex = new RecordingProvider("codex");
    const { service, store, send } = await setup([claude, codex]);
    await send("me llamo Ana");
    const chat = service.snapshot().chatId!;
    expect(store.getProviderSession(chat, "claude")?.lastMessageId).toBe(service.snapshot().messages.at(-1)?.id);
    service.updateChat({ model: "codex:codex" });
    await send("¿cómo me llamo?");
    expect(codex.inputs[0]?.text).toContain("Usuario: me llamo Ana");
    expect(codex.inputs[0]?.text).toContain("Asistente (claude): answer-1");
    service.updateChat({ model: "claude:claude" });
    await send("sigue");
    expect(claude.inputs[1]?.nativeSessionId).toBe("session-1");
    expect(claude.inputs[1]?.text).toContain("Usuario: ¿cómo me llamo?");
    expect(claude.inputs[1]?.text).toContain("Asistente (codex): answer-1");
    expect(claude.inputs[1]?.text).not.toContain("me llamo Ana");
    expect(service.snapshot().messages.filter(m => m.role === "notice")).toHaveLength(2);
    expect(service.snapshot().messages.filter(m => m.role === "assistant").map(m => m.modelLabel)).toEqual(["claude", "codex", "claude"]);
    await service.dispose();
  });
  it("starts again with complete context if the native session is lost", async () => {
    const p = new RecordingProvider("claude");
    p.script = async function* (_input, count) {
      if (count === 2) { yield { type: "error", kind: "other", message: "missing", recovery: "session" }; return; }
      yield { type: "session", nativeSessionId: `session-${count}` };
      yield { type: "text-delta", text: "Ana" }; yield { type: "done" };
    };
    const { service, send } = await setup([p]);
    await send("me llamo Ana"); await send("¿cómo me llamo?");
    expect(p.inputs).toHaveLength(3);
    expect(p.inputs[2]?.nativeSessionId).toBeUndefined();
    expect(p.inputs[2]?.text).toContain("me llamo Ana");
    expect(service.snapshot().messages.at(-1)).toMatchObject({ text: "Ana", status: "complete" });
    await service.dispose();
  });
  it("ignores a saved watermark when its native ID is missing", async () => {
    const p = new RecordingProvider("claude"); const { service, store, send } = await setup([p]);
    await send("first");
    const chatId = service.snapshot().chatId!;
    store.upsertProviderSession({ ...store.getProviderSession(chatId, "claude")!, nativeSessionId: "" });
    await send("next");
    expect(p.inputs[1]?.nativeSessionId).toBeUndefined();
    expect(p.inputs[1]?.text).toContain("Usuario: first");
    await service.dispose();
  });
  it("retries with a new native session, omitting both the discarded reply and its current question from recap", async () => {
    const p = new RecordingProvider("claude"); const { service, send } = await setup([p]);
    await send("earlier"); await send("retry-question");
    service.retry(); await service.waitForIdle();
    expect(p.inputs[2]?.nativeSessionId).toBeUndefined();
    expect(p.inputs[2]?.text).toContain("Asistente (claude): answer-1");
    expect(p.inputs[2]?.text).not.toContain("answer-2");
    expect(p.inputs[2]?.text.match(/retry-question/g)).toHaveLength(1);
    expect(service.snapshot().messages.map(m => m.text)).toEqual(["earlier", "answer-1", "retry-question", "answer-3"]);
    await service.dispose();
  });
  it("edits inclusively and invalidates native sessions of every program", async () => {
    const a = new RecordingProvider("claude"), b = new RecordingProvider("codex");
    const { service, send } = await setup([a, b]);
    await send("first"); service.updateChat({ model: "codex:codex" }); await send("old-question");
    service.edit("new-question"); await service.waitForIdle();
    expect(b.inputs[1]?.nativeSessionId).toBeUndefined();
    expect(b.inputs[1]?.text).not.toContain("old-question");
    expect(b.inputs[1]?.text).not.toContain("Asistente (codex): answer-1");
    expect(service.snapshot().messages.filter(m => m.role === "user").map(m => m.text)).toEqual(["first", "new-question"]);
    service.updateChat({ model: "claude:claude" }); await send("again");
    expect(a.inputs[1]?.nativeSessionId).toBeUndefined();
    await service.dispose();
  });
  it("sends the same question to the chosen model below the old answer", async () => {
    const a = new RecordingProvider("claude"), b = new RecordingProvider("codex");
    const { service, send } = await setup([a, b]); await send("question");
    service.askOther("codex:codex"); await service.waitForIdle();
    expect(service.snapshot().model).toBe("codex:codex");
    expect(service.snapshot().messages.filter(m => m.role === "assistant")).toHaveLength(2);
    expect(service.snapshot().messages.filter(m => m.role === "user")).toHaveLength(1);
    expect(service.snapshot().messages).toHaveLength(4);
    expect(service.snapshot().messages[2]?.text).toBe("→ codex responde la misma pregunta");
    expect(b.inputs[0]?.text.endsWith("question")).toBe(true);
    await service.dispose();
  });
  it("resets the native session and sends the full recap when personal instructions change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "j7-instructions-")); const settings = new SettingsStore(join(dir, "settings.json"));
    const p = new RecordingProvider("claude"); const { service, send } = await setup([p], settings);
    try {
      await send("first"); settings.update({ personalInstructions: "responde en inglés" }); await send("second");
      expect(p.inputs[1]?.nativeSessionId).toBeUndefined();
      expect(p.inputs[1]?.instructions).toContain("responde en inglés");
      expect(p.inputs[1]?.text).toContain("Usuario: first");
    } finally { await service.dispose(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("always permits web search and preserves selected chat effort", async () => {
    const a = new RecordingProvider("mock-a"), b = new RecordingProvider("mock-b");
    const { service, send } = await setup([a, b]);
    service.updateChat({ webSearch: false, effort: "high" }); await send("first");
    const id = service.snapshot().chatId!;
    expect(a.inputs[0]).toMatchObject({ webSearch: true, effort: "high" });
    service.updateChat({ model: "mock-b:mock-b" }); await send("second");
    expect(b.inputs[0]).toMatchObject({webSearch:true,effort:"low"});
    service.updateChat({ model: "mock-a:mock-a" }); await send("third");
    expect(a.inputs[1]).toMatchObject({webSearch:true,effort:"low"});
    service.newChat(); expect(service.snapshot()).toMatchObject({ webSearch: true, effort: "low" });
    service.selectChat(id); expect(service.snapshot()).toMatchObject({ webSearch: true, effort: "low" });
    await service.dispose();
  });
});
describe("F6–F7 persistence, queues and supervision", () => {
  it("persists deltas within 500 ms and continues after changing chat", async () => {
    vi.useFakeTimers();
    const p = new MockProvider("mock-a"); const { service, store } = await setup([p]);
    service.send("/slow"); const first = service.snapshot().chatId!;
    service.send("overlap"); expect(service.snapshot().messages).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(450);
    expect(store.listMessages(first)[1]?.text.length).toBeGreaterThan(0);
    service.newChat(); service.send("second"); const second = service.snapshot().chatId!;
    expect(service.snapshot().queued).toBe(true);
    await vi.runAllTimersAsync(); await service.waitForIdle();
    service.selectChat(first); expect(service.snapshot().messages.at(-1)?.status).toBe("complete");
    service.selectChat(second); expect(service.snapshot().messages.at(-1)?.status).toBe("complete");
    await service.dispose();
  });
  it("cancels a queued turn immediately without starting it", async () => {
    vi.useFakeTimers(); const p = new MockProvider("mock-a");
    const run = vi.spyOn(p, "runTurn"); const { service } = await setup([p]);
    service.send("/slow"); const first = service.snapshot().chatId!;
    await vi.advanceTimersByTimeAsync(200);
    service.newChat(); service.send("queued");
    expect(service.snapshot().queued).toBe(true);
    service.stop(); await vi.advanceTimersByTimeAsync(0);
    expect(service.snapshot()).toMatchObject({ active: false });
    expect(service.snapshot().messages.at(-1)?.status).toBe("stopped");
    expect(run).toHaveBeenCalledTimes(1);
    service.selectChat(first); service.stop(); await vi.runAllTimersAsync();
    await service.dispose();
  });
  it("runs another program immediately while a program's second chat waits", async () => {
    vi.useFakeTimers();
    const a = new MockProvider("mock-a"), b = new MockProvider("mock-b"); const { service } = await setup([a, b]);
    service.send("/slow"); const first = service.snapshot().chatId!;
    await vi.advanceTimersByTimeAsync(200);
    service.newChat(); service.updateChat({ model: "mock-b:mock-b" }); service.send("fast");
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot().active).toBe(false);
    service.selectChat(first); expect(service.snapshot().active).toBe(true);
    service.stop(); await vi.runAllTimersAsync(); await service.dispose();
  });
  it("restarts once on a crash, preserves session on process restart, and exposes a second crash", async () => {
    const p = new RecordingProvider("codex");
    p.script = async function* (input, count) {
      if (count === 2 || input.text.endsWith("always")) { yield { type: "error", kind: "other", message: "crash", recovery: "process" }; return; }
      yield { type: "session", nativeSessionId: "native" }; yield { type: "text-delta", text: "ok" }; yield { type: "done" };
    };
    const { service, send } = await setup([p]);
    await send("first"); await send("second");
    expect(p.disposed).toBe(1); expect(p.inputs[2]?.nativeSessionId).toBe("native");
    expect(service.snapshot().messages.at(-1)?.text).toBe("ok");
    await send("always"); expect(p.inputs).toHaveLength(5);
    expect(service.snapshot().messages.at(-1)).toMatchObject({ status: "error", errorKind: "other" });
    await service.dispose();
  });
  it("prewarms five seconds after start and cancels the timer at shutdown", async () => {
    vi.useFakeTimers(); const { service, catalog } = await setup(); const warm = vi.spyOn(catalog, "prewarm");
    service.start(); await vi.advanceTimersByTimeAsync(4999); expect(warm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(warm).toHaveBeenCalledOnce();
    await service.dispose(); await vi.advanceTimersByTimeAsync(10_000); expect(warm).toHaveBeenCalledOnce();
  });
  it("prepares the program for an empty chat with the options its first turn will use, never for a chat with messages", async () => {
    const claude = new RecordingProvider("claude");
    const { service, catalog, send } = await setup([claude]);
    service.newChat(); await catalog.exclusive("claude", async () => {});
    expect(claude.hints).toHaveLength(1);
    await send("hola");
    const { model, effort, webSearch, instructions } = claude.inputs[0]!;
    expect(claude.hints[0]).toEqual({ model, effort, webSearch, instructions });
    service.updateChat({ effort: "high" }); await catalog.exclusive("claude", async () => {});
    expect(claude.hints).toHaveLength(1);
  });
  it("never retries auth/quota errors automatically and formats each E4 error", async () => {
    const p = new RecordingProvider("codex"); const { service } = await setup([p]);
    for (const kind of ["auth", "quota", "unsupported", "other"] as const) {
      p.script = async function* () { yield { type: "error", kind, message: "detail" }; };
      const count = p.inputs.length; service.send(kind); await service.waitForIdle();
      expect(p.inputs).toHaveLength(count + 1);
      expect(service.snapshot().messages.at(-1)).toMatchObject({ status: "error", errorKind: kind });
      if (kind === "auth") expect(service.snapshot().messages.at(-1)?.text).toContain("`codex login`");
      if (kind === "quota") expect(service.snapshot().messages.at(-1)?.text).toBe("Llegaste al límite de uso de GPT.");
    }
    expect(classifyError(new Error('{"type":"provider.free-limit"}')).kind).toBe("quota");
    await service.dispose();
  });
  it("echoes the exact assembled context and saves web sources with the offline mock", async () => {
    vi.useFakeTimers(); const { service } = await setup([new MockProvider("mock-a"), new MockProvider("mock-b")]);
    service.send("/web"); await vi.runAllTimersAsync(); await service.waitForIdle();
    expect(service.snapshot().messages.at(-1)?.sources).toEqual(["https://example.com"]);
    service.updateChat({ model: "mock-b:mock-b" }); service.send("/echo-context"); await vi.runAllTimersAsync(); await service.waitForIdle();
    expect(service.snapshot().messages.at(-1)?.text).toContain("Usuario: /web");
    expect(service.snapshot().messages.at(-1)?.text.endsWith("[Fin del contexto]\n\n/echo-context")).toBe(true);
    await service.dispose();
  });
});
it("preserves every character in /echo-context, including CRLF and Unicode separators", async () => {
  vi.useFakeTimers();
  try {
    const mock = new MockProvider("mock-a");
    const text = "/echo-context\r\nA\u2028B\u2029C";
    let result = "";
    const task = (async () => {
      for await (const event of mock.runTurn({ model: "mock-a", text, instructions: "", attachments: [], webSearch: false, effort: "high", signal: new AbortController().signal })) if (event.type === "text-delta") result += event.text;
    })();
    await vi.runAllTimersAsync(); await task;
    expect(result).toBe(text);
  } finally { vi.useRealTimers(); }
});
it('uses the turn provider login command and never suggests login for Zen', async () => {
  for (const id of ['claude', 'codex', 'gemini', 'opencode'] as const) {
    const p = new RecordingProvider(id);
    p.script = async function* () { yield { type: 'error', kind: 'auth', message: 'auth' }; };
    const { service, send } = await setup([p]); await send('question');
    const error = service.snapshot().messages.at(-1)!.text;
    if (id === 'claude') { expect(error).toContain('claude auth login'); expect(error).not.toContain('codex login'); }
    if (id === 'codex') { expect(error).toContain('codex login'); expect(error).not.toContain('/login'); }
    if (id === 'gemini') { expect(error).toContain('`agy`'); expect(error).not.toContain('`gemini`'); }
    if (id === 'opencode') expect(error).not.toContain('Terminal');
    await service.dispose();
  }
});

it("askOther adds one notice and carries the selected effort",async()=>{
 const codex=new RecordingProvider("codex");
 const {service,send}=await setup([new RecordingProvider("claude"),codex]);
 try { await send("hola"); service.askOther("codex:codex","high"); await service.waitForIdle();
 expect(service.snapshot().messages.filter(m=>m.role==="notice")).toHaveLength(1);
 expect(codex.inputs[0]?.effort).toBe("high");
 } finally {await service.dispose();}
});
it("logs effort adjustment only when a turn executes",async()=>{
 const {service,store,send}=await setup(); const log=vi.fn();
 // Inject the logger through the same constructor hook used by main.
 const catalog=service.catalog;
 const runner=new ChatService(catalog,()=>{},()=>{},undefined,undefined,undefined,store,undefined,log);
 try {
 await send("hola");
 store.updateChat(service.snapshot().chatId!,{effort:"max"});
 runner.selectChat(service.snapshot().chatId!);
 expect(log).not.toHaveBeenCalled();
 runner.send("otra");await runner.waitForIdle();expect(log).toHaveBeenCalledExactlyOnceWith("effort-adjusted");
 } finally {await runner.dispose();await service.dispose();}
});
