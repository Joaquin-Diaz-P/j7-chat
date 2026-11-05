import { afterEach, expect, it, vi } from "vitest";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GeminiProvider } from "../src/main/providers/gemini.js";
import { buildChatInstructions } from "../src/main/chat/instructions.js";
import type { ChatEvent } from "../src/main/providers/types.js";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("speaks ACP, preserves legacy model catalog, sends native PDF, resumes and rejects permissions with a synthetic peer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "j7-acp-"));
  temporary.push(directory);
  await mkdir(join(directory, ".gemini"));
  await writeFile(join(directory, ".gemini/oauth_creds.json"), "{}");
  const binaryPath = join(directory, "gemini"),
    logPath = join(directory, "wire.jsonl"),
    pdfPath = join(directory, "synthetic.pdf");
  await writeFile(pdfPath, "synthetic fixture, not sent to any service");
  await writeFile(
    binaryPath,
    `#!${process.execPath}
const {createInterface}=require('node:readline');const {appendFileSync}=require('node:fs');const log=${JSON.stringify(logPath)};
function send(x){process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\\n')}
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(log,JSON.stringify(m)+'\\n');
if(m.method==='initialize')return send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true,promptCapabilities:{image:true,embeddedContext:true}}}});
if(m.method==='session/new')return send({id:m.id,result:{sessionId:'acp-1',models:{currentModelId:'gemini-2.5-flash',availableModels:[{modelId:'gemini-2.5-flash',name:'Flash'}]}}});
if(m.method==='session/load')return send({id:m.id,result:{}});
if(m.method==='session/prompt'){send({id:900,method:'session/request_permission',params:{sessionId:'acp-1',options:[{kind:'allow_once',optionId:'allow',name:'Allow'}],toolCall:{toolCallId:'tool-1',title:'Forbidden read'}}});send({method:'session/update',params:{sessionId:'acp-1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'47'}}}});setTimeout(()=>send({id:m.id,result:{stopReason:'end_turn'}}),10);return;}
});`,
  );
  await chmod(binaryPath, 0o755);
  const provider = new GeminiProvider({
    binaryPath,
    dataDir: join(directory, "data"),
    environment: { HOME: directory },
  });
  try {
    const models = await provider.listModels();
    expect(models).toEqual([
      {
        id: "gemini-2.5-flash",
        label: "Flash",
        provider: "gemini",
        supportsImages: true,
        supportsPdf: true,
        supportsEffort: true,
      },
    ]);
    const events: ChatEvent[] = [];
    for await (const event of provider.runTurn({
      model: "gemini-2.5-flash",
      effort: "normal",
      webSearch: false,
      instructions: buildChatInstructions(),
      nativeSessionId: "previous-acp",
      text: "¿Número?",
      attachments: [
        {
          kind: "pdf",
          path: pdfPath,
          mime: "application/pdf",
          name: "synthetic.pdf",
        },
      ],
      signal: new AbortController().signal,
    }))
      events.push(event);
    expect(events).toContainEqual({ type: "text-delta", text: "47" });
    expect(events.at(-1)).toEqual({ type: "done" });
    // The peer logs the permission reply asynchronously; wait for it.
    const messages = await vi.waitFor(async () => {
      const lines = (await readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      if (!lines.some((m) => m.id === 900)) throw new Error("reply not logged");
      return lines;
    });
    expect(
      messages.some(
        (m) =>
          m.method === "session/load" && m.params.sessionId === "previous-acp",
      ),
    ).toBe(true);
    expect(
      messages.find((m) => m.method === "session/prompt").params.prompt[1],
    ).toMatchObject({
      type: "resource",
      resource: {
        mimeType: "application/pdf",
        blob: Buffer.from(
          "synthetic fixture, not sent to any service",
        ).toString("base64"),
      },
    });
    expect(messages.find((m) => m.id === 900).result).toEqual({
      outcome: { outcome: "cancelled" },
    });
  } finally {
    await provider.dispose();
  }
});
it("reports unauthenticated without launching OAuth when isolated credentials are absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "j7-noauth-"));
  temporary.push(directory);
  const binaryPath = join(directory, "gemini");
  await writeFile(binaryPath, "#!/bin/sh\nexit 9\n");
  await chmod(binaryPath, 0o755);
  const provider = new GeminiProvider({
    binaryPath,
    dataDir: join(directory, "data"),
    environment: { HOME: directory },
  });
  try {
    expect((await provider.getStatus()).state).toBe("not_authenticated");
  } finally {
    await provider.dispose();
  }
});
