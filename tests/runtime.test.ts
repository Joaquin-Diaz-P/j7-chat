import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  writeFile,
  chmod,
  rm,
  readFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexProvider } from "../src/main/providers/codex.js";
import { buildChatInstructions } from "../src/main/chat/instructions.js";
import type { ChatEvent, TurnInput } from "../src/main/providers/types.js";
import { AsyncQueue } from "../src/main/providers/runtime.js";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fakeCodex(account: "chatgpt" | "apiKey" | null = "chatgpt", holdStartup = false) {
  const directory = await mkdtemp(join(tmpdir(), "j7-rpc-"));
  temporary.push(directory);
  const binaryPath = join(directory, "codex");
  // A local fake peer records only methods/pids; it never reads real credentials or uses a network.
  const source = `#!${process.execPath}
const {createInterface}=require('node:readline');const {appendFileSync}=require('node:fs');const log=${JSON.stringify(join(directory, "methods.jsonl"))};
function send(x){process.stdout.write(JSON.stringify(x)+'\\n')}
let pendingTurn;createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(log,JSON.stringify({pid:process.pid,method:m.method})+'\\n');
if(m.method==='initialize'){if(${holdStartup})return;return send({id:m.id,result:{}});}
if(m.method==='mcpServerStatus/list')return send({id:m.id,result:{data:[]}});
if(m.method==='account/read')return send({id:m.id,result:{account:${JSON.stringify(account === null ? null : { type: account })}}});
if(m.method==='thread/start'||m.method==='thread/resume')return send({id:m.id,result:{thread:{id:m.params.threadId||'session-1'}}});
if(m.method==='turn/start'){pendingTurn='turn-1';send({id:m.id,result:{turn:{id:pendingTurn}}});send({id:800,method:'item/commandExecution/requestApproval',params:{threadId:'session-1'}});send({method:'item/agentMessage/delta',params:{threadId:'session-1',delta:'Hola'}});if(m.params.input[0].text!=='hold')setTimeout(()=>send({method:'turn/completed',params:{threadId:'session-1',turn:{id:pendingTurn,status:'completed'}}}),10);return;}
if(m.method==='turn/interrupt'){send({id:m.id,result:{}});send({method:'turn/completed',params:{threadId:'session-1',turn:{status:'interrupted'}}});return;}
if(m.id===800)appendFileSync(log,JSON.stringify({approval:m.result})+'\\n');
});`;
  await writeFile(binaryPath, source);
  await chmod(binaryPath, 0o755);
  const dataDir = join(directory, "data");
  const diagnostics: unknown[] = [];
  const provider = new CodexProvider({
    binaryPath,
    dataDir,
    environment: { HOME: directory },
    onDiagnostic: (event) => diagnostics.push(event),
  });
  return {
    provider,
    dataDir,
    diagnostics,
    log: async () =>
      (await readFile(join(directory, "methods.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(
          (line) =>
            JSON.parse(line) as {
              pid?: number;
              method?: string;
              approval?: unknown;
            },
        ),
  };
}
function input(
  text = "hola",
  signal = new AbortController().signal,
): TurnInput {
  return {
    model: "test",
    effort: "normal",
    webSearch: false,
    instructions: buildChatInstructions(),
    text,
    attachments: [],
    signal,
  };
}
describe("process lifecycle without network", () => {
  it("shuts down while initialization is pending and cannot spawn a late replacement", async () => {
    const { provider, log } = await fakeCodex("chatgpt", true);
    const starting = provider.getStatus();
    let pid = 0;
    await vi.waitFor(async () => { pid = (await log()).find(entry => entry.method === "initialize")?.pid ?? 0; expect(pid).toBeGreaterThan(0); });
    await provider.shutdown();
    expect(() => process.kill(pid, 0)).toThrow();
    expect((await starting).state).toBe("error");
    await expect(provider.listModels()).rejects.toThrow("Provider shut down");
    expect(new Set((await log()).map(entry => entry.pid)).size).toBe(1);
  });

  it("reuses one Codex process, rejects approval and disposes it", async () => {
    const { provider, log, dataDir } = await fakeCodex();
    const first: ChatEvent[] = [];
    for await (const event of provider.runTurn(input())) first.push(event);
    const second: ChatEvent[] = [];
    for await (const event of provider.runTurn({
      ...input(),
      nativeSessionId: "session-1",
    }))
      second.push(event);
    const entries = await log();
    expect(
      new Set(entries.map((entry) => entry.pid).filter(Boolean)).size,
    ).toBe(1);
    expect(
      entries.filter((entry) => entry.method === "initialize"),
    ).toHaveLength(1);
    expect(entries.some((entry) => entry.method === "thread/resume")).toBe(
      true,
    );
    expect(entries.find((entry) => entry.approval)?.approval).toEqual({
      decision: "decline",
    });
    expect(first).toContainEqual({ type: "text-delta", text: "Hola" });
    expect(second.at(-1)).toEqual({ type: "done" });
    expect(await readdir(join(dataDir, "workspace"))).toEqual([]);
    const pid = entries.find((entry) => entry.pid)!.pid!;
    await provider.dispose();
    expect(() => process.kill(pid, 0)).toThrow();
  });
  it("cancels an active turn with turn/interrupt", async () => {
    const { provider, log } = await fakeCodex();
    const controller = new AbortController();
    const events: ChatEvent[] = [];
    try {
      for await (const event of provider.runTurn(
        input("hold", controller.signal),
      )) {
        events.push(event);
        if (event.type === "text-delta") controller.abort();
      }
    } finally {
      await provider.dispose();
    }
    expect(
      (await log()).some((entry) => entry.method === "turn/interrupt"),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "error", kind: "other" });
  });
  it.each([null, "apiKey"] as const)(
    "rejects missing/API credentials before starting inference (%s)",
    async (account) => {
      const { provider, log } = await fakeCodex(account);
      const events: ChatEvent[] = [];
      try {
        expect((await provider.getStatus()).state).toBe("not_authenticated");
        for await (const event of provider.runTurn(input())) events.push(event);
      } finally {
        await provider.dispose();
      }
      expect(events).toMatchObject([{ type: "error", kind: "auth" }]);
      expect((await log()).some((entry) => entry.method === "turn/start")).toBe(
        false,
      );
    },
  );
  it("does not start a process for an already cancelled turn", async () => {
    const { provider, log } = await fakeCodex();
    const controller = new AbortController();
    controller.abort();
    const events = [];
    for await (const event of provider.runTurn(
      input("hola", controller.signal),
    ))
      events.push(event);
    expect(events).toMatchObject([{ type: "error", kind: "other" }]);
    await expect(log()).rejects.toMatchObject({ code: "ENOENT" });
    await provider.dispose();
  });
  it("wakes an async queue and drains items before closing", async () => {
    const queue = new AsyncQueue<number>();
    const iterator = queue[Symbol.asyncIterator]();
    const pending = iterator.next();
    queue.push(47);
    expect(await pending).toEqual({ value: 47, done: false });
    queue.push(42);
    queue.end();
    expect(await iterator.next()).toEqual({ value: 42, done: false });
    expect((await iterator.next()).done).toBe(true);
  });
});
