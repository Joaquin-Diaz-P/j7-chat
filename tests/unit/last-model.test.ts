import { expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../../src/main/settings.js";
import { ModelCatalog } from "../../src/main/chat/catalog.js";
import { ChatService } from "../../src/main/chat/service.js";
import { MockProvider } from "../../src/main/providers/mock.js";
import { ClaudeProvider } from "../../src/main/providers/claude.js";
it("migrates the old preference on disk, preserving an explicit lastModel", () => {
 const dir=mkdtempSync(join(tmpdir(),"j7-last-")), path=join(dir,"settings.json");
 try {
  writeFileSync(path,JSON.stringify({defaultModel:"claude:opus"}));
  expect(new SettingsStore(path).value.lastModel).toBe("claude:opus");
  expect(JSON.parse(readFileSync(path,"utf8"))).not.toHaveProperty("defaultModel");
  writeFileSync(path,JSON.stringify({defaultModel:"claude:opus",lastModel:"codex:gpt"}));
  expect(new SettingsStore(path).value.lastModel).toBe("codex:gpt");
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it("starts new chats with the last selection and effort, and remembers turns and askOther", async () => {
 const dir=mkdtempSync(join(tmpdir(),"j7-last-"));
 const settings=new SettingsStore(join(dir,"settings.json"));
 const catalog=new ModelCatalog(settings,[new MockProvider("mock-a"),new MockProvider("mock-b")]);
 await catalog.refresh();
 const service=new ChatService(catalog,()=>{},()=>{},undefined,undefined,undefined,undefined,settings);
 try {
  service.updateChat({model:"mock-a:mock-a",effort:"high"});
  service.updateChat({model:"mock-b:mock-b"}); service.newChat();
  expect(service.snapshot().model).toBe("mock-b:mock-b");
  service.send("hello"); await service.waitForIdle();
  service.askOther("mock-a:mock-a"); await service.waitForIdle(); service.newChat();
  expect(service.snapshot()).toMatchObject({model:"mock-a:mock-a",effort:"high"});
  expect(new SettingsStore(join(dir,"settings.json")).value.lastModel).toBe("mock-a:mock-a");
  settings.update({lastModel:"missing",favorites:["mock-b:mock-b"]}); service.newChat();
  expect(service.snapshot().model).toBe("mock-b:mock-b");
 } finally {await service.dispose();rmSync(dir,{recursive:true,force:true});}
});
it("omits Claude's default alias from the SDK catalog", async () => {
 const provider=new ClaudeProvider();
 const connect=vi.spyOn(provider as unknown as {connect:()=>Promise<unknown>},"connect").mockResolvedValue({supportedModels:async()=>[{value:"default",displayName:"Default (recommended)"},{value:"opus",displayName:"Opus"}]});
 try {expect((await provider.listModels()).map(m=>m.id)).toEqual(["opus"]);} finally {connect.mockRestore();}
});
it("continues saved Claude alias chats with Opus", async () => {
 const requests: string[]=[];
 const catalog=new ModelCatalog(undefined,[{id:"claude",async getStatus(){return {state:"ready"};},async listModels(){return [{id:"opus",label:"Opus",provider:"claude",supportsImages:false,supportsPdf:false,supportsEffort:false}];},async *runTurn(input){requests.push(input.model);yield {type:"done"};},async dispose(){}}]);
 await catalog.refresh(); const service=new ChatService(catalog,()=>{});
 try {
  service.store.createChat({id:"old",model:"claude:default",provider:"claude",effort:"low",webSearch:true});
  service.selectChat("old"); expect(service.snapshot().model).toBe("claude:opus");
  service.send("hello"); await service.waitForIdle(); expect(requests).toEqual(["opus"]);
 } finally {await service.dispose();}
});
import { canonicalModelKey } from "../../src/shared/model-key.js";
it("the hidden Claude alias resolves to Opus", () => {
  expect(canonicalModelKey("claude:default")).toBe("claude:opus");
  expect(canonicalModelKey("codex:gpt-6")).toBe("codex:gpt-6");
});
