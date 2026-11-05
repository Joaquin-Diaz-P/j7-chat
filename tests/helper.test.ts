import {it,expect} from 'vitest';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NativeHelper} from '../src/main/native/helper.js';
it('JSON protocol, malformed lines, events and restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'j7-helper-')); const binary=join(dir,'helper');
  await writeFile(binary, '#!/usr/bin/env node\nconst r=require("readline").createInterface({input:process.stdin});r.on("line",l=>{const m=JSON.parse(l);if(m.command==="crash")process.exit(1);console.log("bad");console.log(JSON.stringify({id:m.id,ok:true,screen:true}));if(m.command==="watchModifier")console.log(JSON.stringify({event:"holdStart"}));});');
  await chmod(binary,0o700);const helper=new NativeHelper(binary);
  try {
    let events=0;helper.on('holdStart',()=>events++);
    expect((await helper.watch(61)).ok).toBe(true);
    await expect(helper.request('crash')).rejects.toThrow('disconnected');
    await new Promise(r=>setTimeout(r,1200));
    expect((await helper.request('permissions')).screen).toBe(true); expect(events).toBeGreaterThan(0);
  } finally {helper.dispose();await rm(dir,{recursive:true,force:true});}
});
