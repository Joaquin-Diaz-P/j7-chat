import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9437');
try {
 const page=browser.contexts()[0].pages().find(p=>p.url().includes('index.html'));
 if(!page)throw Error('No packaged renderer');
 await page.waitForFunction(async()=>{const s=await window.j7.snapshot();return s.catalog?.models.some(m=>m.provider==='claude'&&m.id==='haiku');},{},{timeout:45000});
 if((await page.evaluate(()=>window.j7.snapshot())).messages.length)throw Error('Verification data must be empty: refusing another real turn');
 await page.evaluate(async()=>{await window.j7.updateChat({model:'claude:haiku',webSearch:false});await window.j7.send('Responde solo OK.');});
 await page.waitForFunction(async()=>{const s=await window.j7.snapshot();return s.messages.some(m=>m.role==='assistant' && ['complete','error','stopped'].includes(m.status));},{},{timeout:90000});
 const result=await page.evaluate(()=>window.j7.snapshot());
 const response=result.messages.filter(m=>m.role==='assistant').at(-1);
 console.log(JSON.stringify({model:result.model,status:response?.status,text:response?.text}));
 await page.evaluate(()=>window.j7.openSettings());
 const settings=await browser.contexts()[0].waitForEvent('page');
 await settings.waitForLoadState();
 console.log(JSON.stringify(await settings.evaluate(async()=>{const d=await window.j7.settingsData();return {programs:d.catalog.statuses,hex:d.hex,permissions:d.permissions};})));
}finally{await browser.close();}
