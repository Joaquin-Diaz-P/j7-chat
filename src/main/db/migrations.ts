import type { DatabaseSync } from 'node:sqlite';
export const migrations = [`
CREATE TABLE chats(id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',title_source TEXT NOT NULL DEFAULT 'auto',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,model TEXT,provider TEXT,web_search INTEGER,effort TEXT);
CREATE INDEX chat_order ON chats(pinned DESC,updated_at DESC);
CREATE TABLE messages(id TEXT PRIMARY KEY,chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,role TEXT,content TEXT,model TEXT,provider TEXT,status TEXT,created_at INTEGER,meta TEXT);
CREATE INDEX message_chat ON messages(chat_id);
CREATE TABLE attachments(id TEXT PRIMARY KEY,message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,kind TEXT,name TEXT,mime TEXT,path TEXT,size INTEGER,pages INTEGER,text_path TEXT,meta TEXT);
CREATE TABLE provider_sessions(chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,provider TEXT,native_session_id TEXT,last_seen_message_id TEXT,model TEXT,instructions_hash TEXT,PRIMARY KEY(chat_id,provider));
CREATE VIRTUAL TABLE message_search USING fts5(content,content=messages,content_rowid=rowid,tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE title_search USING fts5(title,content=chats,content_rowid=rowid,tokenize='unicode61 remove_diacritics 2');
` + ['messages:message_search:content','chats:title_search:title'].map(spec => {
 const [table,fts,col] = spec.split(':');
 return `
 CREATE TRIGGER ${table}_ai AFTER INSERT ON ${table} BEGIN INSERT INTO ${fts}(rowid,${col}) VALUES(new.rowid,new.${col}); END;
 CREATE TRIGGER ${table}_ad AFTER DELETE ON ${table} BEGIN INSERT INTO ${fts}(${fts},rowid,${col}) VALUES('delete',old.rowid,old.${col}); END;
 CREATE TRIGGER ${table}_au AFTER UPDATE ON ${table} BEGIN INSERT INTO ${fts}(${fts},rowid,${col}) VALUES('delete',old.rowid,old.${col}); INSERT INTO ${fts}(rowid,${col}) VALUES(new.rowid,new.${col}); END;`;
}).join(''), `UPDATE chats SET effort='low' WHERE effort='normal';`];
export function migrate(db: DatabaseSync) {
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
 const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
 if (version > migrations.length) throw new Error('Unsupported database version');
 for (let i=version;i<migrations.length;i++) {
  db.exec('BEGIN');
  try { db.exec(migrations[i]!); db.exec(`PRAGMA user_version=${i+1}; COMMIT`); }
  catch(error) { db.exec('ROLLBACK'); throw error; }
 }
}
