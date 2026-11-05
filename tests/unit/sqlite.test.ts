import { describe,it,expect } from 'vitest';
import { realpathSync,mkdtempSync,writeFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteChatStore } from '../../src/main/chat/sqlite-store.js';
import { migrate,migrations } from '../../src/main/db/migrations.js';
import { chatStoreContract } from './chat-store.contract.js';
import { generateTitle } from '../../src/main/titles.js';
import { historyGroup } from '../../src/shared/history.js';
import { AttachmentStore } from '../../src/main/attachments/index.js';
const chat={id:'a',model:'mock:a',provider:'mock' as const,webSearch:false,effort:'high' as const};
chatStoreContract('SQLite',()=>new SqliteChatStore(':memory:'));
describe('history persistence',()=>{
 it('migrates empty and previous databases idempotently',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);migrate(db);
  expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(migrations.length);
  expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1);
 });
 it('searches prefixes, accents and safely handles operators and quotes',()=>{
  const s=new SqliteChatStore(':memory:');s.createChat(chat);
  s.appendMessage('a',{id:'u',role:'user',text:'fisiología del cuerpo',status:'complete'});
  expect(s.list('fisio')[0]?.snippet).toContain('[fisiología]');
  expect(s.list('fisiologia')).toHaveLength(1);
  expect(()=>s.list('" OR (fisio*)')).not.toThrow();
  s.rename('a','Prueba título');expect(s.list('titu')).toHaveLength(1);
  s.updateMessage('a','u',{text:'otra cosa'});expect(s.list('fisio')).toHaveLength(0);
 });
 it('persists attachment metadata and marks interrupted messages across restarts, deletes cascade and files',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'j7-db-'));const path=join(dir,'j7.db'),file=join(dir,'a.txt');writeFileSync(file,'hello');
  try {
   let s=new SqliteChatStore(path,dir);s.createChat(chat);
   s.appendMessage('a',{id:'u',role:'user',text:'hello',status:'complete',attachments:[{id:'file',path:file,name:'a.txt',kind:'text',mime:'text/plain'}]});
   s.appendMessage('a',{id:'r',role:'assistant',text:'partial',status:'streaming'});
   s.upsertProviderSession({chatId:'a',provider:'mock',nativeSessionId:'n',lastMessageId:'r',instructionsHash:'h'});
   s.db.close();s=new SqliteChatStore(path,dir);
   expect(s.listMessages('a')[1]?.status).toBe('interrupted');
   expect(await new AttachmentStore(dir,s).resolve('file')).toBe(realpathSync(file));
   s.deleteChat('a');expect(existsSync(file)).toBe(false);expect(s.listMessages('a')).toEqual([]);expect(s.attachments()).toEqual([]);expect(s.getProviderSession('a','mock')).toBeUndefined();s.db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('loads 200 of 2000 chats within 50ms',()=>{
  const s=new SqliteChatStore(':memory:');
  s.db.exec('BEGIN');for(let i=0;i<2000;i++)s.createChat({...chat,id:String(i)});s.db.exec('COMMIT');
  const start=performance.now();expect(s.list()).toHaveLength(200);expect(performance.now()-start).toBeLessThan(50);
  expect(s.list('',200)).toHaveLength(200);
 });
 it('uses generated and fallback titles without replacing manual titles',async()=>{
  expect(await generateTitle('uno dos tres cuatro cinco seis siete',async()=> 'Título local')).toBe('Título local');
  expect(await generateTitle('uno dos tres cuatro cinco seis siete',async()=>{throw Error();})).toBe('uno dos tres cuatro cinco seis');
  expect(await generateTitle('alternativa',()=>new Promise(()=>{}),1)).toBe('alternativa');
  const s=new SqliteChatStore(':memory:');s.createChat(chat);s.rename('a','Manual');s.rename('a','Auto',false);expect(s.getChat('a')?.title).toBe('Manual');
 });
 it('groups dates with an injected clock',()=>{
  const now=+new Date(2026,10,5,12);
  expect(historyGroup({pinned:true,updatedAt:0},now)).toBe(0);
  for(const [days,group] of [[0,1],[1,2],[4,3],[9,4]])expect(historyGroup({pinned:false,updatedAt:now-days!*86400000},now)).toBe(group);
 });
 it('cleans only unreferenced files older than 24h',async()=>{
  const {utimes}=await import('node:fs/promises');
  const dir=mkdtempSync(join(tmpdir(),'j7-clean-'));
  try{
   const old=join(dir,'old'),fresh=join(dir,'fresh'),known=join(dir,'known');
   for(const path of [old,fresh,known])writeFileSync(path,'text');
   await utimes(old,new Date(0),new Date(0));await utimes(known,new Date(0),new Date(0));
   const s=new SqliteChatStore(':memory:');s.saveAttachment({id:'known',kind:'text',path:known,name:'known',mime:'text/plain'});
   await new AttachmentStore(dir,s).cleanup();expect(existsSync(old)).toBe(false);expect(existsSync(fresh)).toBe(true);expect(existsSync(known)).toBe(true);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
it('does not persist empty chats when changing settings; restores saved options',async()=>{
 const { ChatService }=await import('../../src/main/chat/service.js');
 const { MockProvider }=await import('../../src/main/providers/mock.js');
 const store=new SqliteChatStore(':memory:');
 const service=new ChatService(new MockProvider(),()=>{},()=>{},undefined,undefined,undefined,store);
 service.updateChat({webSearch:false,effort:'high'});expect(store.list()).toHaveLength(0);
 service.send('hola');const id=service.snapshot().chatId!;
 await service.waitForIdle();service.newChat();service.selectChat(id);
 expect(service.snapshot()).toMatchObject({webSearch:false,effort:'high'});
 await service.dispose();
});
