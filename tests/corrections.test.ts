import { it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linkExisting } from '../src/main/providers/runtime.js';
import { freeZenModels, reapOpenCode, type ZenModel } from '../src/main/providers/opencode.js';
import { isSettingsShortcut } from '../src/shared/shortcut.js';
it('links multi-provider authentication and keeps only free opencode models', async () => {
 const dir = await mkdtemp(join(tmpdir(),'j7-auth-test-'));
 try {
  const source=join(dir,'auth.json'), target=join(dir,'private/auth.json');
  await mkdir(join(dir,'private'));
  const providers=['opencode','openai','openrouter','opencode-go'];
  await writeFile(source,JSON.stringify(Object.fromEntries(providers.map(id=>[id,{type:'api'}]))));
  await linkExisting(source,target);
  expect(await readlink(target)).toBe(source);
  const base: ZenModel={providerID:'opencode',id:'free',name:'Free',type:'chat',capabilities:{input:['text']},variants:[],cost:[{input:0,output:0,cache:{read:0,write:0}}]};
  expect(freeZenModels([...providers.map(providerID=>({...base,providerID})),{...base,id:'paid',cost:[{input:1,output:1}]}]).map(m=>m.id)).toEqual(['free']);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
it('reaps only the recorded loopback server PID and ignores unrelated services',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'j7-pid-test-')), file=join(dir,'opencode.pid');
 const kill=vi.fn();
 try {
  for(const command of ['/opt/homebrew/bin/opencode serve --hostname 127.0.0.1 --port 1234','opencode serve --service','opencode serve --hostname 127.0.0.1 --port 1234 --service','unrelated']) {
   await writeFile(file,'987654');
   await reapOpenCode(file,async()=>command,kill);
  }
  expect(kill).toHaveBeenCalledExactlyOnceWith(987654);
  await reapOpenCode(file,async()=>{throw Error('must not inspect');},kill);
 } finally {await rm(dir,{recursive:true,force:true});}
});
it('recognizes physical comma with Spanish key values and rejects other chords',()=>{
 const event={metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,code:'Comma',key:';'};
 expect(isSettingsShortcut(event)).toBe(true);
 expect(isSettingsShortcut({...event,code:'',key:','})).toBe(true);
 expect(isSettingsShortcut({...event,metaKey:false})).toBe(false);
 expect(isSettingsShortcut({...event,altKey:true})).toBe(false);
});
