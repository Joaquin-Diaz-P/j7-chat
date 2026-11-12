import { afterEach, expect, it, vi } from "vitest";
import {
  chmod,
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
it("uses Antigravity ACP config options, sends extracted PDF text, resumes and rejects permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "j7-acp-"));
  temporary.push(directory);
  const binaryPath = join(directory, "agy"),
    logPath = join(directory, "wire.jsonl"),
    pdfPath = join(directory, "synthetic.pdf");
  await writeFile(pdfPath, "synthetic fixture, not sent to any service");
  await writeFile(
    binaryPath,
    `#!${process.execPath}
const {createInterface}=require('node:readline');const {appendFileSync}=require('node:fs');const log=${JSON.stringify(logPath)};
const options=[{id:'model',name:'Model',category:'model',type:'select',currentValue:'gemini-3.8-flash',options:[{value:'gemini-3.8-flash',name:'Flash'},{value:'claude-sonnet-4-6',name:'Claude'}]},{id:'thought_level',name:'Thinking',category:'thought_level',type:'select',currentValue:'high',options:[{value:'low',name:'Low'},{value:'medium',name:'Medium'},{value:'high',name:'High'}]}];
function send(x){process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\\n')}
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(log,JSON.stringify(m)+'\\n');
if(m.method==='initialize')return send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true,promptCapabilities:{image:true,embeddedContext:true}}}});
if(m.method==='session/new')return send({id:m.id,result:{sessionId:'acp-1',configOptions:options}});
if(m.method==='session/load')return send({id:m.id,result:{configOptions:options}});
if(m.method==='session/set_config_option'){options.find(o=>o.id===m.params.configId).currentValue=m.params.value;return send({id:m.id,result:{configOptions:options}});}
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
        id: "gemini-3.8-flash",
        label: "Flash",
        provider: "gemini",
        supportsImages: true,
        supportsPdf: false,
        supportsEffort: true,
        reasoningEfforts: ["low", "medium", "high"],
      },
    ]);
    const config = JSON.parse(await readFile(join(directory, "data/providers/gemini/antigravity-cli/settings.json"), "utf8"));
    expect(config).toMatchObject({ toolPermission: "strict", useG1Credits: false });
    expect(await readFile(join(directory, "data/providers/gemini/workspace/.agents/agents/j7-chat.md"), "utf8")).toContain("tools: []");
    const events: ChatEvent[] = [];
    for await (const event of provider.runTurn({
      model: "gemini-3.8-flash",
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
          extractedText: "PDF fixture 271",
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
    expect(messages.filter(m => m.method === "session/set_config_option").map(m => [m.params.configId, m.params.value])).toEqual([
      ["model", "gemini-3.8-flash"], ["thought_level", "low"],
    ]);
    const prompt = messages.find(m => m.method === "session/prompt").params.prompt;
    expect(prompt).toHaveLength(1);
    expect(prompt[0].text).toContain("PDF fixture 271");
    expect(messages.find((m) => m.id === 900).result).toEqual({
      outcome: { outcome: "cancelled" },
    });
  } finally {
    await provider.dispose();
  }
});
it("reports unauthenticated when Antigravity requires login without launching OAuth", async () => {
  const directory = await mkdtemp(join(tmpdir(), "j7-noauth-"));
  temporary.push(directory);
  const binaryPath = join(directory, "agy");
  await writeFile(binaryPath, `#!${process.execPath}
const {createInterface}=require('node:readline');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(m.method==='initialize'?{result:{protocolVersion:1,agentCapabilities:{}}}:{error:{code:-32000,message:'Authentication required'}})})+'\\n');});`);
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

it("permits only web actions when enabled and cancels an active Antigravity turn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "j7-agy-web-"));
  temporary.push(directory);
  const binaryPath = join(directory, "agy"), logPath = join(directory, "wire.jsonl");
  await writeFile(binaryPath, `#!${process.execPath}
const {createInterface}=require('node:readline');const {appendFileSync}=require('node:fs');
const log=${JSON.stringify(logPath)};let promptId;
const send=x=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(log,JSON.stringify(m)+'\\n');
if(m.method==='initialize')return send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true}}});
if(m.method==='session/new')return send({id:m.id,result:{sessionId:'web-session'}});
if(m.method==='session/load')return send({id:m.id,error:{code:-32000,message:'Conversation no longer exists'}});
if(m.method==='session/prompt'){promptId=m.id;for(const [id,kind] of [[91,'search'],[92,'fetch'],[93,'execute']])send({id,method:'session/request_permission',params:{sessionId:'web-session',toolCall:{toolCallId:String(id),title:'tool',kind},options:[{kind:'allow_always',optionId:'forever',name:'Always'},{kind:'allow_once',optionId:'once',name:'Once'}]}});}
if(m.id===93)send({method:'session/update',params:{sessionId:'web-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'started'}}}});
if(m.method==='session/cancel')send({id:promptId,result:{stopReason:'cancelled'}});
});`);
  await chmod(binaryPath, 0o755);
  const provider = new GeminiProvider({ binaryPath, dataDir: join(directory, "data") });
  const controller = new AbortController();
  const input = { model: "gemini-test", effort: "low", webSearch: true, instructions: buildChatInstructions(), text: "Search", attachments: [], signal: controller.signal };
  try {
    const events: ChatEvent[] = [];
    for await (const event of provider.runTurn(input)) {
      events.push(event);
      if (event.type === "text-delta") controller.abort();
    }
    expect(events.at(-1)).toMatchObject({ type: "error" });
    const messages = (await readFile(logPath, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    for (const id of [91,92]) expect(messages.find(m => m.id === id).result).toEqual({ outcome: { outcome: "selected", optionId: "once" } });
    expect(messages.find(m => m.id === 93).result).toEqual({ outcome: { outcome: "cancelled" } });
    expect(messages.some(m => m.method === "session/cancel")).toBe(true);
    expect(await readFile(join(directory, "data/providers/gemini/workspace/.agents/agents/j7-chat.md"), "utf8")).toContain('tools: ["search_web","read_url_content"]');
    const missing: ChatEvent[] = [];
    for await (const event of provider.runTurn({ ...input, signal: new AbortController().signal, nativeSessionId: "lost-session" })) missing.push(event);
    expect(missing).toEqual([expect.objectContaining({ type: "error", recovery: "session" })]);
  } finally { await provider.dispose(); }
});
