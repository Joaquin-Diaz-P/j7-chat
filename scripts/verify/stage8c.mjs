// Reproducible CDP workload. Uses only its own mock Electron process and temporary SQLite data.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const label = process.argv[2] ?? 'after';
const folder = resolve('docs/evidence/stage8c'); await mkdir(folder,{recursive:true});
const data = await mkdtemp(join(tmpdir(),'j7-stage8c-'));
await writeFile(join(data,'settings.json'),JSON.stringify({firstRunDone:true,positionsVersion:2}));
const env={...process.env,J7_TEST:'1',J7_MOCK:'1',J7_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
const started=performance.now();
const app = await electron.launch({...(process.argv[3] ? {executablePath:resolve(process.argv[3]),args:[]} : {args:['.']}),env});
try {
 const page=await app.firstWindow();await page.waitForLoadState('load');
 const result={readyMs:performance.now()-started};
 const show=async()=>app.evaluate(()=>globalThis.j7Show?.());
 const startShow=performance.now();await show();await page.locator('.shell').waitFor({state:'visible'});result.showMs=performance.now()-startShow;
 await page.waitForTimeout(1200);
 result.metrics=await app.evaluate(({app})=>app.getAppMetrics().map(m=>({pid:m.pid,type:m.type,memory:m.memory,cpu:m.cpu})));
 const top=async name=>{const ids=await app.evaluate(({app})=>app.getAppMetrics().map(m=>m.pid));try {await writeFile(join(folder,`${label}-${name}-top.txt`),execFileSync('/usr/bin/top',['-l','2','-s','2','-stats','pid,command,cpu,idlew,power',...ids.flatMap(id=>['-pid',String(id)])],{timeout:15000}));}catch(e){result.topError=String(e);}};
 await top('visible');await page.evaluate(()=>window.j7.hide());await page.waitForTimeout(200);await top('hidden');await show();
 const db=new DatabaseSync(join(data,'j7.db'));
 db.exec('BEGIN');
 for(let i=0;i<1000;i++)db.prepare("INSERT INTO chats(id,title,title_source,created_at,updated_at,model,provider,web_search,effort) VALUES(?,?,'manual',?,?, 'mock-a:mock-a','mock-a',1,'low')").run('load'+i,'Carga '+i,Date.now(),Date.now());
 for(let i=0;i<200;i++){const text=`Mensaje ${i}\n\n$$E=mc^2$$\n\n\`\`\`js\nconst value = ${i};\n\`\`\``;const m={id:'msg'+i,role:i%2?'assistant':'user',text,status:'complete'};db.prepare('INSERT INTO messages(id,chat_id,role,content,status,created_at,meta) VALUES(?,?,?,?,?,?,?)').run(m.id,'load0',m.role,text,m.status,Date.now(),JSON.stringify(m));}
 db.exec('COMMIT');db.close();
 await page.evaluate(()=>window.j7.selectChat('load0'));await page.waitForTimeout(1500);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,cc',transferMode:'ReturnAsStream'});
 result.frames=await page.evaluate(async()=>{
  const intervals=[];let previous=performance.now(),running=true;
  const tick=now=>{intervals.push(now-previous);previous=now;if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
  for(let i=0;i<6;i++){await window.j7.historyAction('open','',i%2===0);await new Promise(r=>setTimeout(r,300));}
  const scroller=document.querySelector('.conversation');for(let i=0;i<60;i++){if(scroller)scroller.scrollTop=i*100;await new Promise(requestAnimationFrame);}
  running=false;intervals.sort((a,b)=>a-b);return {samples:intervals.length,p95:intervals[Math.floor(intervals.length*.95)],max:Math.max(...intervals),over25ms:intervals.filter(n=>n>25).length};
 });
 await page.evaluate(()=>window.j7.historyAction('open','',true));
 const search=page.getByPlaceholder('Buscar en el historial');await search.fill('Carga 999');await page.waitForTimeout(250);
 await page.locator('textarea').first().fill('Prueba streaming');await page.locator('textarea').first().press('Enter');await page.waitForTimeout(2000);
 const complete=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await complete;let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});await writeFile(join(folder,`${label}-trace.json.gz`),gzipSync(trace));
 await writeFile(join(folder,`${label}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await app.close();await rm(data,{recursive:true,force:true});}
