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
it('preserves UTF-8 title characters split across stdout chunks',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'j7-title-utf8-'));const binary=join(dir,'helper');
  await writeFile(binary, `#!/usr/bin/env node
require('readline').createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line), bytes=Buffer.from(JSON.stringify({id:m.id,ok:true,title:'Supresión de la ovulación y fecundación'})+'\\n');
 let i=0; const emit=()=>{if(i<bytes.length){process.stdout.write(bytes.subarray(i,i+1));i++;setTimeout(emit,1);}};emit();
});`);
  await chmod(binary,0o700);const helper=new NativeHelper(binary);
  try {expect((await helper.request('generateTitle')).title).toBe('Supresión de la ovulación y fecundación');}
  finally {helper.dispose();await rm(dir,{recursive:true,force:true});}
});
