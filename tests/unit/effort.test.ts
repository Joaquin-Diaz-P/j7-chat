import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialEffort, resolveEffort } from "../../src/shared/effort.js";
import { claudeEfforts } from "../../src/main/providers/claude.js";
import { SettingsStore } from "../../src/main/settings.js";
import { SqliteChatStore } from "../../src/main/chat/sqlite-store.js";
import { ChatService } from "../../src/main/chat/service.js";
import { ModelCatalog } from "../../src/main/chat/catalog.js";
import { MockProvider } from "../../src/main/providers/mock.js";
const model=(await new MockProvider("mock-a").listModels())[0]!;
describe("N10",()=>{
 it("starts low, uses the lowest available and clamps unsupported levels",()=>{
  expect(initialEffort(model)).toBe("low");
  expect(initialEffort({...model,reasoningEfforts:["medium","high"]})).toBe("medium");
  expect(resolveEffort(model,"max")).toBe("xhigh");
  expect(resolveEffort(model,"normal")).toBe("low");
 });
 it("remembers effort by model across settings reload and new chats",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"j7-effort-"));
  const settings=new SettingsStore(join(dir,"settings.json"));
  const catalog=new ModelCatalog(settings,[new MockProvider("mock-a"),new MockProvider("mock-b")]);
  await catalog.refresh(); const service=new ChatService(catalog,()=>{},()=>{},undefined,undefined,undefined,undefined,settings);
  try {
   service.updateChat({effort:"high"}); expect(service.snapshot().effort).toBe("high");
   service.newChat();expect(service.snapshot().effort).toBe("high");
   expect(new SettingsStore(join(dir,"settings.json")).value.effortByModel).toEqual({"mock-a:mock-a":"high"});
   service.send("/think");await service.waitForIdle();expect(service.snapshot().messages.at(-1)).toMatchObject({effort:"high",status:"complete"});
   expect(service.snapshot().messages.at(-1)?.thinking).toBeTruthy();
  } finally {await service.dispose();rmSync(dir,{recursive:true,force:true});}
 });
 it("migrates persisted normal to low and preserves high",()=>{
  const dir=mkdtempSync(join(tmpdir(),"j7-migrate-")); const path=join(dir,"chat.db");
  let store=new SqliteChatStore(path);
  for(const effort of ["normal","high"]) store.createChat({id:effort,model:"mock:a",provider:"mock",webSearch:true,effort});
  store.db.exec("PRAGMA user_version=1");store.db.close();store=new SqliteChatStore(path);
  expect(store.getChat("normal")?.effort).toBe("low");expect(store.getChat("high")?.effort).toBe("high");store.db.close();rmSync(dir,{recursive:true,force:true});
 });
});

it("resolving levels during rendering has no logging side effects",()=>{
 const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
 try {expect(resolveEffort(model,"max")).toBe("xhigh");expect(warn).not.toHaveBeenCalled();}finally{warn.mockRestore();}
});
it("offers CLI Ultracode only for effort-capable Opus 5.5",()=>{
 expect(claudeEfforts({value:"claude-opus-5-5",supportsEffort:true})).toContain("ultracode");
 expect(claudeEfforts({value:"claude-opus-5-5",supportedEffortLevels:["high"]})).toEqual(["high","ultracode"]);
 expect(claudeEfforts({value:"opus",displayName:"Opus 5.5",supportsEffort:true})).toContain("ultracode");
 expect(claudeEfforts({value:"claude-opus-5",displayName:"Opus 5",supportsEffort:true})).not.toContain("ultracode");
 expect(claudeEfforts({value:"claude-opus-5-5"})).toEqual([]);
 expect(claudeEfforts({value:"claude-sonnet-5",supportsEffort:true})).not.toContain("ultracode");
});
