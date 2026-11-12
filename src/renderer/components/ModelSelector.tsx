import { useEffect, useRef, useState } from "react";
import type { CatalogSnapshot } from "../../shared/ipc.js";
import type { ProviderId } from "../../main/providers/types.js";
import { initialEffort, levels } from "../../shared/effort.js";
import { strings as s } from "../strings.js";
import { Star, Check, Search } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon.js";
export const effortLabel = (value: string) => s.effortLabels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
export function selectorModels(catalog: CatalogSnapshot, group: string, query: string) {
 const favorites = catalog.favorites.filter(k=>catalog.models.some(m=>`${m.provider}:${m.id}`===k));
 return catalog.models.filter(m=>query.trim() ? `${m.label} ${m.provider}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) : group==="favorites" ? !favorites.length || favorites.includes(`${m.provider}:${m.id}`) : m.provider===group).sort((a,b)=>query.trim()?a.provider.localeCompare(b.provider):0);
}
export function ModelSelector({ catalog, selected, effort, onSelect, onClose, open = true }: { open?: boolean; catalog: CatalogSnapshot; selected?: string | undefined; effort?: string | undefined; onSelect: (key: string, effort?: string) => void; onClose: () => void }) {
 const [query,setQuery]=useState(""); const [group,setGroup]=useState("favorites");
 const [index,setIndex]=useState(Math.max(0,catalog.models.findIndex(m=>`${m.provider}:${m.id}`===selected))); const [column,setColumn]=useState(false); const [levelIndex,setLevelIndex]=useState(0);
 const root=useRef<HTMLDivElement>(null);
 const models=selectorModels(catalog,group,query);
 const activeIndex=Math.min(index,Math.max(0,models.length-1));
 const active=models[activeIndex]; const supported=active ? levels(active) : [];
 const key=active ? `${active.provider}:${active.id}` : "";
 const chosen=key===selected ? effort : active ? initialEffort(active,catalog.effortByModel) : "";
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>root.current?.querySelector("input")?.focus());return()=>cancelAnimationFrame(frame);},[open]);
 useEffect(()=>{setIndex(Math.max(0,models.findIndex(m=>`${m.provider}:${m.id}`===selected)));setColumn(false);},[query,group]);
 useEffect(()=>{setLevelIndex(Math.max(0,supported.indexOf(chosen ?? "")));},[key,chosen]);
 useEffect(()=>{if(column) root.current?.querySelectorAll<HTMLButtonElement>(".model-reasoning button")[levelIndex]?.focus();},[column,levelIndex,key]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>root.current?.querySelector('[data-focused="true"]')?.scrollIntoView({block:"nearest"}));return()=>cancelAnimationFrame(frame);},[index,open]);
 useEffect(()=>{if(!open)return;const dismiss=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node) && !(e.target as Element).closest(".model-trigger"))onClose();};document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss);},[onClose,open]);
 return <div ref={root} className="model-selector with-effort" tabIndex={-1} onClick={e=>{if(!(e.target as Element).closest("button,input"))root.current?.querySelector("input")?.focus();}} role="dialog" aria-label={s.model} onKeyDown={e=>{
  if(e.metaKey && /^[1-9]$/.test(e.key)){e.preventDefault();e.stopPropagation();const m=models[Number(e.key)-1];if(m)onSelect(`${m.provider}:${m.id}`);return;}
  if(!["Escape","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(e.key))return;
  e.stopPropagation();
  if(e.key==="Escape"){e.preventDefault();onClose();return;}
  if(e.key==="ArrowRight" && supported.length && (!(e.target instanceof HTMLInputElement) || e.target.selectionStart===e.target.value.length)){e.preventDefault();setColumn(true);return;}
  if(e.key==="ArrowLeft" && column){e.preventDefault();setColumn(false);root.current?.querySelector("input")?.focus();return;}
  if(e.key==="ArrowUp"||e.key==="ArrowDown"){e.preventDefault();const delta=e.key==="ArrowDown"?1:-1;if(column)setLevelIndex(i=>(i+delta+supported.length)%supported.length);else setIndex(i=>models.length?(i+delta+models.length)%models.length:0);return;}
  if(e.key==="Enter" && (e.target instanceof HTMLInputElement || column)){e.preventDefault();if(active)onSelect(key,column?supported[levelIndex]:undefined);}
 }}>
 <nav className="model-sidebar" aria-label={s.programs}>
 <button aria-label={s.favorites} aria-pressed={group==="favorites"} onClick={()=>setGroup("favorites")}><Star size={21} fill="currentColor"/></button><hr/>
 {[...new Set(catalog.models.map(m=>m.provider))].map(p=><button key={p} aria-label={s.programLabels[p]} aria-pressed={group===p} onClick={()=>setGroup(p)}><ProviderIcon provider={p} size={21}/></button>)}
 </nav>
 <section className="model-main"><label className="model-search"><Search size={15}/><input role="combobox" aria-haspopup="grid" aria-expanded="true" aria-controls="model-options" aria-activedescendant={active ? `model-option-${activeIndex}` : undefined} value={query} aria-label={s.searchModels} placeholder={s.searchModels} onChange={e=>setQuery(e.target.value)}/></label>
 <div id="model-options" className="model-list" role="grid" aria-label={s.model}>{models.map((m,i)=>{const k=`${m.provider}:${m.id}`;return <div className="model-row" role="row" id={`model-option-${i}`} aria-selected={k===selected} key={k} data-focused={!column && i===activeIndex} onMouseEnter={()=>{setIndex(i);setColumn(false);}}>
 {query.trim() && (i===0 || models[i-1]?.provider!==m.provider) && <span role="gridcell" className="search-provider">{s.programLabels[m.provider]}</span>}<span role="gridcell" className="model-name"><button title={m.label} onClick={()=>onSelect(k)}><ProviderIcon provider={m.provider}/><span>{m.label}</span>{k===selected&&<Check size={13}/ >}</button></span>
 <span role="gridcell"><button className="model-favorite" aria-label={`${s.favorite}: ${m.label}`} aria-pressed={catalog.favorites.includes(k)} onClick={()=>void window.j7.favorite(k)}><Star size={12} fill={catalog.favorites.includes(k)?"currentColor":"none"}/></button></span>
 {i<9&&<kbd role="gridcell">⌘{i+1}</kbd>}
 </div>;})}{!models.length&&<div role="row"><span role="gridcell">{query.trim() && catalog.models.length ? s.noResults : catalog.models.length ? s.noAvailableModels : s.noModels}</span></div>}</div>
 {Object.entries(catalog.statuses).filter(([,v])=>v.state!=="ready").map(([id])=><div className="unavailable" key={id}><button onClick={()=>void window.j7.openSettings()}>{s.unavailable(s.programLabels[id as ProviderId])}</button></div>)}
 </section>
 <section className="model-reasoning" role="menu" aria-label={s.reasoning}><header>{s.reasoning}<small>{active?.label}</small></header>{!supported.length&&<p className="no-levels">{s.noEffortLevels}</p>}{supported.map((value,i)=><button role="menuitemradio" aria-checked={chosen===value} key={value} data-focused={column&&levelIndex===i} onClick={()=>onSelect(key,value)}>{effortLabel(value)}{chosen===value&&<Check size={13}/>}</button>)}</section>
 </div>;
}
