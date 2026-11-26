import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('glass tints, overlay width, all resize edges, fill/restore and remembered size',async()=>{
 const data=await mkdtemp(join(tmpdir(),'j7-glass-resize-'));
 await writeFile(join(data,'settings.json'),JSON.stringify({firstRunDone:true,positionsVersion:2}));
 const env: Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),J7_TEST:'1',J7_MOCK:'1',J7_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:['.'],env});
 try {
  const page=await app.firstWindow();await page.waitForLoadState('load');
  await app.evaluate(()=> (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
  await page.evaluate(()=>window.j7.historyAction('open','',true));
  const card=page.locator('.card-surface');
  await expect.poll(async()=>Math.round((await card.boundingBox())!.width)).toBe(780);
  expect(await page.locator('.resize-edge').count()).toBe(8);
  expect(await page.locator('.shell,.panel,.history').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'))).toBe(true);
  const widths=await page.locator('.history-list').evaluate(el=>{const short=el.clientWidth;const filler=document.createElement('div');filler.style.height='3000px';el.append(filler);const long=el.clientWidth;filler.remove();return {short,long};});
  expect(widths.short).toBe(widths.long);
  await page.evaluate(()=>{window.j7.beginResize('se');window.j7.resize(100,50);window.j7.endResize();});
  await expect.poll(async()=>Math.round((await card.boundingBox())!.width)).toBe(880);
  const chosen=(await card.boundingBox())!;
  await page.getByRole('button',{name:'Llenar área visible',exact:true}).click();
  await expect(page.getByRole('button',{name:'Restaurar tamaño',exact:true})).toBeVisible();
  expect((await card.boundingBox())!.width).toBeGreaterThan(chosen.width);
  await page.getByRole('button',{name:'Restaurar tamaño',exact:true}).click();
  await expect.poll(async()=>Math.round((await card.boundingBox())!.width)).toBe(880);
  await page.evaluate(()=>window.j7.hide());await page.waitForTimeout(200);
  await app.evaluate(()=> (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
  await expect.poll(async()=>Math.round((await card.boundingBox())!.width)).toBe(880);
 } finally {await app.close();await rm(data,{recursive:true,force:true});}
});
