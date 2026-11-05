import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('barra, markdown, cambio de modelo, adjunto e historial',async()=>{
 const data=await mkdtemp(join(tmpdir(),'j7-e2e-'));
 const env: Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),J7_MOCK:'1',J7_TEST:'1',J7_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:['.'],env});
 try {
 await app.evaluate(()=>{(globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.();});
 const page=await app.firstWindow();await page.locator('textarea').first().fill('/md');await page.locator('textarea').first().press('Enter');
 await expect.poll(()=>page.evaluate(async()=>(await window.j7.snapshot()).messages.some(m=>m.role==='assistant'&&m.status==='complete'))).toBe(true);
 await expect(page.locator('table')).toBeVisible();
 await page.locator('.model-trigger').click();
 await page.locator('.model-list').getByRole('button',{name:'Mock B',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await window.j7.snapshot()).model)).toBe('mock-b:mock-b');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('tests/fixtures/attachments/j7-42.png'));
 await page.getByRole('button',{name:'Adjuntar',exact:true}).click();await page.getByRole('menuitem',{name:'Adjuntar archivo…'}).click();await expect(page.locator('.attachment-chip')).toHaveCount(1);
 await page.locator('textarea').first().press('Meta+b');
 await expect(page.getByPlaceholder('Buscar en el historial')).toBeVisible();
 await page.getByPlaceholder('Buscar en el historial').fill('/md');
 await expect(page.locator('.history-row')).toHaveCount(1);
 }finally{await app.close();await rm(data,{recursive:true,force:true});}
});
