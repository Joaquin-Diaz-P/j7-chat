import { providerIcons } from './ModelSelector.js';
import { useEffect, useRef, useState } from 'react';
import type { HistoryChat } from '../../main/chat/sqlite-store.js';
import { historyGroup } from '../../shared/history.js';
import { strings as s } from '../strings.js';
export function History({current,revision,focus,onSelect}:{current:string|null;revision:unknown;focus:number;onSelect:()=>void}) {
 const [query,setQuery]=useState(''),[rows,setRows]=useState<HistoryChat[]>([]);
 const [menu,setMenu]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[title,setTitle]=useState('');
 const [confirm,setConfirm]=useState<HistoryChat|null>(null);
 const search=useRef<HTMLInputElement>(null);
 const sequence=useRef(0);
 const [more,setMore]=useState(true);
 async function load(offset=0) {
  const token=++sequence.current;
  const result=await window.j7.history(query,offset);
  if(token!==sequence.current)return;
  setRows(previous=>offset?[...previous,...result]:result);setMore(result.length===200);
 }
 useEffect(()=>{const timer=setTimeout(()=>void load(),150);return()=>{clearTimeout(timer);++sequence.current;};},[query,revision]);
 useEffect(()=>{if(focus)search.current?.focus();},[focus]);
 async function action(action:'pin'|'rename'|'delete',id:string,value?:string|boolean) {await window.j7.historyAction(action,id,value);setMenu(null);void load();}
 return <aside className="history"><input ref={search} aria-label={s.historySearch} placeholder={s.historySearch} value={query} onChange={e=>setQuery(e.target.value)}/>
 <div className="history-list" onScroll={e=>{const el=e.currentTarget;if(more && el.scrollHeight-el.scrollTop-el.clientHeight<40){setMore(false);void load(rows.length);}}}>
 {s.historyGroups.map((group,index)=><section key={group}>{rows.some(r=>historyGroup(r)===index)&&<h3>{group}</h3>}
 {rows.filter(r=>historyGroup(r)===index).map(row=>{const Icon=providerIcons[row.provider];return <div key={row.id} className="history-row" onContextMenu={e=>{e.preventDefault();setMenu(row.id);}}>
 {editing===row.id?<input autoFocus aria-label={s.renameChat} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{
 if(e.key==='Escape'){e.stopPropagation();setEditing(null);}
 if(e.key==='Enter'){void action('rename',row.id,title);setEditing(null);}
 }}/>:<button aria-current={current===row.id} onClick={()=>{onSelect();void window.j7.selectChat(row.id);}}><span><Icon size={13} aria-label={s.programLabels[row.provider]}/> {row.title||s.newChat}</span>{row.snippet&&<small>{row.snippet.split(/(\[[^\]]*\])/g).map((part,i)=>part.startsWith('[')?<mark key={i}>{part.slice(1,-1)}</mark>:part)}</small>}</button>}
 <button aria-label={s.historyActions} onClick={()=>setMenu(menu===row.id?null:row.id)}>⋯</button>
 {menu===row.id&&<div className="history-menu"><button onClick={()=>void action('pin',row.id,!row.pinned)}>{row.pinned?s.unpinChat:s.pinChat}</button><button onClick={()=>{setEditing(row.id);setTitle(row.title);setMenu(null);}}>{s.renameChat}</button><button onClick={()=>setConfirm(row)}>{s.deleteChat}</button></div>}
 </div>;})}</section>)}
 {!rows.length&&<p>{s.noResults}</p>}
 </div>{confirm&&<div role="alertdialog" aria-modal="true" aria-label={s.deleteChat}><p>{s.confirmDelete(confirm.title)}</p><button onClick={()=>{void action('delete',confirm.id);setConfirm(null);}}>{s.deleteChat}</button><button onClick={()=>setConfirm(null)}>{s.cancel}</button></div>}
 </aside>;
}
