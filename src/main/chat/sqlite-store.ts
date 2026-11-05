import { DatabaseSync } from 'node:sqlite';
import { statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate } from '../db/migrations.js';
import type { Chat, ChatStore, ProviderSession } from './store.js';
import type { Message } from '../../shared/ipc.js';
import type { ProviderId, Attachment } from '../providers/types.js';
export interface HistoryChat extends Chat { title: string; titleSource: string; createdAt: number; updatedAt: number; pinned: boolean; snippet?: string }
export class SqliteChatStore implements ChatStore {
 readonly db: DatabaseSync;
 constructor(path: string, private directory?: string, private now = Date.now) {
  this.db = new DatabaseSync(path); migrate(this.db);
  for (const row of this.db.prepare("SELECT id,chat_id FROM messages WHERE status IN ('streaming','queued')").all()) this.updateMessage(String(row.chat_id),String(row.id),{status:'interrupted'});
 }
 createChat(c: Chat) { this.db.prepare('INSERT INTO chats(id,model,provider,web_search,effort,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(c.id,c.model,c.provider,+c.webSearch,c.effort,this.now(),this.now()); }
 getChat(id: string): HistoryChat | undefined {
  const r=this.db.prepare('SELECT * FROM chats WHERE id=?').get(id);
  return r ? {id:String(r.id),model:String(r.model),provider:r.provider as ProviderId,webSearch:!!r.web_search,effort:r.effort as Chat['effort'],title:String(r.title),titleSource:String(r.title_source),createdAt:Number(r.created_at),updatedAt:Number(r.updated_at),pinned:!!r.pinned} : undefined;
 }
 updateChat(id: string, changes: Partial<Omit<Chat,'id'>>) { const c=this.getChat(id); if(!c) throw new Error('Unknown chat'); Object.assign(c,changes); this.db.prepare('UPDATE chats SET model=?,provider=?,web_search=?,effort=? WHERE id=?').run(c.model,c.provider,+c.webSearch,c.effort,id); }
 listMessages(id: string): Message[] { return this.db.prepare('SELECT meta FROM messages WHERE chat_id=? ORDER BY rowid').all(id).map(r=>JSON.parse(String(r.meta)) as Message); }
 appendMessage(id: string,m: Message) {
  this.db.prepare('INSERT INTO messages(id,chat_id,role,content,model,provider,status,created_at,meta) VALUES(?,?,?,?,?,?,?,?,?)').run(m.id,id,m.role,m.text,m.model??null,m.provider??null,m.status,this.now(),JSON.stringify(m));
  for(const a of m.attachments??[]) this.saveAttachment(a,m.id);
  this.db.prepare('UPDATE chats SET updated_at=? WHERE id=?').run(this.now(),id);
 }
 updateMessage(chatId: string,id: string,changes: Partial<Omit<Message,'id'>>) {
  const r=this.db.prepare('SELECT meta FROM messages WHERE id=? AND chat_id=?').get(id,chatId); if(!r) throw new Error('Unknown message');
  const m={...JSON.parse(String(r.meta)),...changes};
  this.db.prepare('UPDATE messages SET content=?,status=?,meta=? WHERE id=?').run(m.text,m.status,JSON.stringify(m),id);
 }
 deleteMessagesFrom(chatId: string,id: string) {
  const row=this.db.prepare('SELECT rowid FROM messages WHERE id=? AND chat_id=?').get(id,chatId); if(!row)return;
  this.db.prepare('DELETE FROM messages WHERE chat_id=? AND rowid>=?').run(chatId,row.rowid!);
  this.db.prepare('DELETE FROM provider_sessions WHERE chat_id=?').run(chatId);
 }
 getProviderSession(id: string,provider: ProviderId): ProviderSession | undefined {
  const r=this.db.prepare('SELECT * FROM provider_sessions WHERE chat_id=? AND provider=?').get(id,provider);
  return r ? {chatId:id,provider,nativeSessionId:String(r.native_session_id),lastMessageId:String(r.last_seen_message_id),instructionsHash:String(r.instructions_hash)}:undefined;
 }
 upsertProviderSession(s: ProviderSession) { this.db.prepare('INSERT INTO provider_sessions(chat_id,provider,native_session_id,last_seen_message_id,instructions_hash,model) VALUES(?,?,?,?,?,?) ON CONFLICT(chat_id,provider) DO UPDATE SET native_session_id=excluded.native_session_id,last_seen_message_id=excluded.last_seen_message_id,instructions_hash=excluded.instructions_hash,model=excluded.model').run(s.chatId,s.provider,s.nativeSessionId,s.lastMessageId,s.instructionsHash,this.getChat(s.chatId)?.model??null); }
 saveAttachment(a: Attachment,messageId?: string) { this.db.prepare('INSERT INTO attachments(id,message_id,kind,name,mime,path,size,pages,meta) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET message_id=coalesce(excluded.message_id,attachments.message_id),meta=excluded.meta').run(a.id!,messageId??null,a.kind,a.name??'',a.mime??'',a.path,statSync(a.path).size,a.pages??null,JSON.stringify(a)); }
 getAttachment(id:string): Attachment | undefined {const r=this.db.prepare('SELECT meta FROM attachments WHERE id=?').get(id);return r?JSON.parse(String(r.meta)) as Attachment:undefined;}
 attachments() { return this.db.prepare('SELECT meta FROM attachments').all().map(r=>JSON.parse(String(r.meta)) as Attachment); }
 list(query='',offset=0): HistoryChat[] {
  if(!query.trim()) return this.db.prepare('SELECT id FROM chats ORDER BY pinned DESC,updated_at DESC LIMIT 200 OFFSET ?').all(offset).map(r=>this.getChat(String(r.id))!);
  const words=query.match(/[\p{L}\p{N}_]+/gu)??[]; if(!words.length)return [];
  const term=words.map(w=>'"'+w+'"*').join(' AND ');
  const rows=this.db.prepare(`SELECT c.id, coalesce(
    (SELECT snippet(title_search,0,'[',']','…',18) FROM title_search WHERE rowid=c.rowid AND title_search MATCH ?),
    (SELECT snippet(message_search,0,'[',']','…',18) FROM message_search JOIN messages m ON m.rowid=message_search.rowid WHERE m.chat_id=c.id AND message_search MATCH ? LIMIT 1)
   ) fragment FROM chats c WHERE c.rowid IN (SELECT rowid FROM title_search WHERE title_search MATCH ?)
   OR c.id IN (SELECT m.chat_id FROM message_search JOIN messages m ON m.rowid=message_search.rowid WHERE message_search MATCH ?)
   ORDER BY c.pinned DESC,c.updated_at DESC LIMIT 200 OFFSET ?`).all(term,term,term,term,offset);
  return [...new Map(rows.map(r=>[String(r.id),{...this.getChat(String(r.id))!,snippet:String(r.fragment)}])).values()];
 }
 rename(id:string,title:string,manual=true) { this.db.prepare("UPDATE chats SET title=?,title_source=? WHERE id=? AND (title_source!='manual' OR ?=1)").run(title.slice(0,300),manual?'manual':'auto',id,+manual); }
 pin(id:string,value:boolean) {this.db.prepare('UPDATE chats SET pinned=? WHERE id=?').run(+value,id);}
 deleteChat(id:string) {
  const files=this.db.prepare('SELECT path FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)').all(id);
  for(const f of files) if(this.directory && dirname(resolve(String(f.path)))===resolve(this.directory)) { try {unlinkSync(String(f.path));} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;} }
  this.db.prepare('DELETE FROM chats WHERE id=?').run(id);
 }
}
