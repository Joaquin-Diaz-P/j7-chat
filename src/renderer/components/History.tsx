import { Search, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { HistoryChat } from '../../main/chat/sqlite-store.js';
import { historyGroup } from '../../shared/history.js';
import { strings as s } from '../strings.js';
// SQLite's snippet() wraps each match in [ ]; show it as a highlight instead of literal brackets.
const highlight = (text: string) => text.split(/(\[[^\]]*\])/).map((part, i) => part.startsWith('[') && part.endsWith(']') ? <mark key={i}>{part.slice(1, -1)}</mark> : part);
export function History({current,revision,focus,open,onSelect}:{open:boolean;current:string|null;revision:unknown;focus:number;onSelect:()=>void}) {
 const [query,setQuery]=useState(''),[rows,setRows]=useState<HistoryChat[]>([]);
 const [menu,setMenu]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[title,setTitle]=useState('');
 const [confirm,setConfirm]=useState<HistoryChat|null>(null);
 useEffect(()=>{
  if(!confirm)return;
  const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setConfirm(null);}};
  document.addEventListener('keydown',cancel,true);
  return()=>document.removeEventListener('keydown',cancel,true);
 },[confirm]);
 const search=useRef<HTMLInputElement>(null);
 const sequence=useRef(0);
 const [more,setMore]=useState(true);
 async function load(offset=0) {
  const token=++sequence.current;
  const result=await window.j7.history(query,offset);
  if(token!==sequence.current)return;
  setRows(previous=>offset?[...previous,...result]:result);setMore(result.length===200);
 }
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),150);return()=>{clearTimeout(timer);++sequence.current;};},[query,revision,open]);
 useEffect(()=>{if(!open || !focus)return;const frame=requestAnimationFrame(()=>search.current?.focus());return()=>cancelAnimationFrame(frame);},[focus,open]);
 async function action(action:'pin'|'rename'|'delete',id:string,value?:string|boolean) {await window.j7.historyAction(action,id,value);setMenu(null);void load();}
 return <aside className="history"><div className="history-search"><Search size={14}/><input ref={search} aria-label={s.historySearch} placeholder={s.historySearch} value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="history-list" onScroll={e=>{const el=e.currentTarget;if(more && el.scrollHeight-el.scrollTop-el.clientHeight<40){setMore(false);void load(rows.length);}}}>
 {s.historyGroups.map((group,index)=><section key={group}>{rows.some(r=>historyGroup(r)===index)&&<h3>{group}</h3>}
 {rows.filter(r=>historyGroup(r)===index).map(row=>{return <div key={row.id} className="history-row" onContextMenu={e=>{e.preventDefault();setMenu(row.id);}}>
 {confirm?.id===row.id?<div role="alertdialog" aria-label={s.deleteChat}><span>¿Borrar?</span><button autoFocus onClick={()=>{void action('delete',row.id);setConfirm(null);}}>{s.deleteChat}</button><button onClick={()=>setConfirm(null)}>{s.cancel}</button></div>:<>{editing===row.id?<input autoFocus aria-label={s.renameChat} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{
 if(e.key==='Escape'){e.stopPropagation();setEditing(null);}
 if(e.key==='Enter'){void action('rename',row.id,title);setEditing(null);}
 }}/>:<button aria-current={current===row.id} onClick={()=>{onSelect();void window.j7.selectChat(row.id).then(()=>window.j7.historyAction("open","",false));}}><span>{row.title||s.newChat}</span>{query.trim() && row.snippet && <small>{highlight(row.snippet)}</small>}</button>}
 <button className="history-actions" title={s.historyActions} aria-label={s.historyActions} onClick={()=>setMenu(menu===row.id?null:row.id)}><MoreHorizontal size={14}/></button>
 {menu===row.id&&<div className="history-menu"><button onClick={()=>void action('pin',row.id,!row.pinned)}>{row.pinned?s.unpinChat:s.pinChat}</button><button onClick={()=>{setEditing(row.id);setTitle(row.title);setMenu(null);}}>{s.renameChat}</button><button onClick={()=>{setMenu(null);setConfirm(row);}}>{s.deleteChat}</button></div>}
 </>}</div>;})}</section>)}
 {!rows.length&&<p>{s.noResults}</p>}
 </div>
 </aside>;
}
