import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('glass receives presented intermediate geometry and both opacity ramps, then stops reporting at rest',async()=>{
 const data=await mkdtemp(join(tmpdir(),'j7-motion-'));
 await writeFile(join(data,'settings.json'),JSON.stringify({firstRunDone:true,positionsVersion:2}));
 const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),J7_TEST:'1',J7_MOCK:'1',J7_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:['.'],env});
 try {
  const page=await app.firstWindow();await page.waitForLoadState('load');
  await app.evaluate(({ipcMain})=>{
   const g=globalThis as typeof globalThis & {motion:number[][]};g.motion=[];
   ipcMain.on('window:regions',(_e,regions,opacity)=>g.motion.push([regions[0].right-regions[0].left,opacity]));
   (globalThis as typeof globalThis & {j7Show:()=>void}).j7Show();
  });
  const samples=()=>app.evaluate(()=>(globalThis as typeof globalThis & {motion:number[][]}).motion);
  await page.waitForTimeout(400);
  expect((await samples()).some(([,a])=>a!>0 && a!<1)).toBe(true);
  await page.evaluate(()=>window.j7.historyAction('open','',true));await page.waitForTimeout(400);
  expect((await samples()).some(([w])=>w!>520 && w!<780)).toBe(true);
  const count=(await samples()).length;await page.waitForTimeout(300);expect((await samples()).length).toBe(count);
  await app.evaluate(()=>(globalThis as typeof globalThis & {motion:number[][]}).motion=[]);
  await page.evaluate(()=>window.j7.hide());await page.waitForTimeout(200);
  expect((await samples()).some(([,a])=>a!>0 && a!<1)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(()=>{const g=globalThis as typeof globalThis & {motion:number[][];j7Show:()=>void};g.motion=[];g.j7Show();});
  await expect.poll(async()=>(await samples()).at(-1)?.[1]).toBe(1);
 }finally{await app.close();await rm(data,{recursive:true,force:true});}
});
