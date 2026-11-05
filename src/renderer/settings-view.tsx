import {Settings as SettingsIcon, Sparkles, Keyboard, FileText, Plug, ShieldCheck} from 'lucide-react';
import logo from '../../assets/logo.svg?raw';
import {ProviderIcon} from './components/ProviderIcon.js';
import {initialEffort,levels} from '../shared/effort.js';
import {useEffect,useState,useRef} from 'react';
import {settingsCommands as commands, settingsStrings as t, strings as s} from './strings.js';
import type {SettingsData} from '../shared/ipc.js';
import type {Settings} from '../main/settings.js';
import {accelerator,voiceModifier,shortcutLabel,recorderAction} from '../shared/shortcut.js';
export function SettingsView() {
 const [data,setData]=useState<SettingsData>(); const [section,setSection]=useState(0);const [record,setRecord]=useState(-1);const [message,setMessage]=useState('');
 const saveTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 useEffect(()=>{if(message!==t.saved)return;const timer=setTimeout(()=>setMessage(''),2600);return ()=>clearTimeout(timer);},[message]);
 useEffect(()=>()=>clearTimeout(saveTimer.current),[]);
 const load=()=>window.j7.settingsData().then(next=>setData(current=>current?{...next,settings:{...next.settings,personalInstructions:current.settings.personalInstructions}}:next)).catch(e=>setMessage(String(e)));
 useEffect(()=>{document.title=s.settingsTitle;void load();},[]);
 useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const update=()=>document.documentElement.classList.toggle("dark",data?.settings.theme==="dark" || (data?.settings.theme!=="light" && media.matches));update();media.addEventListener("change",update);return ()=>media.removeEventListener("change",update);},[data?.settings.theme]);
 const saveQueue=useRef(Promise.resolve());
 async function save(value:Partial<Settings>) {
  setMessage('');
  const pending=saveQueue.current.then(()=>window.j7.saveSettings(value));
  saveQueue.current=pending.catch(()=>{});
  try {await pending;setData(current=>current?{...current,settings:{...current.settings,...value,effortByModel:{...current.settings.effortByModel,...value.effortByModel},personalInstructions:current.settings.personalInstructions}}:current);setMessage(t.saved);}
  catch(e){setMessage(String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}
 }

 if(!data)return <><p>{t.loading}</p><div role="status"/><div role="alert">{message}</div></>;
 const v=data.settings;

 return <main className="settings-view"><div className="settings-titlebar" aria-hidden="true"/><nav aria-label={s.settingsTitle}><div className="settings-brand"><span dangerouslySetInnerHTML={{__html:logo}}/>{s.appName}</div>{t.sections.map((name,i)=>{const Icon=[SettingsIcon,Sparkles,Keyboard,FileText,Plug,ShieldCheck][i]!;return <button key={name} aria-pressed={section===i} onClick={()=>{setSection(i);setRecord(-1);}}><Icon size={16}/>{name}</button>;})}</nav><section><h2>{t.sections[section]}</h2><div className="settings-card">
 {section===0&&<><label className="settings-row">{t.theme} <select value={v.theme} onChange={e=>void save({theme:e.target.value as Settings['theme']})}>{['system','light','dark'].map((x,i)=><option key={x} value={x}>{t.themes[i]}</option>)}</select></label><label className="settings-row">{t.login}<input role="switch" aria-label={t.login} type="checkbox" checked={v.openAtLogin} onChange={e=>void save({openAtLogin:e.target.checked})}/></label></>}
 {section===2&&<>{(['shortcut','captureShortcut','voiceModifier'] as const).map((key,i)=><p key={key}><label className="settings-row">{t.shortcuts[i]} <button aria-label={t.shortcuts[i]+': '+(record===i?t.record:shortcutLabel(v[key]))} className="shortcut-recorder" onBlur={()=>setRecord(-1)} onClick={()=>{setMessage('');setRecord(i);}} onKeyDown={e=>{if(record!==i)return;const action=recorderAction(e.code);if(action!=='record'){setRecord(-1);setMessage('');if(action==='cancel')e.preventDefault();return;}e.preventDefault();const value=i===2?voiceModifier(e.code):accelerator(e);if(value){setRecord(-1);void save({[key]:value});}else setMessage(s.invalidShortcut);}}>{record===i?t.record:shortcutLabel(v[key]).split(" ").map((part,index)=>/^(derecho|izquierdo)$/.test(part)?<span key={index}>{part}</span>:<kbd key={index}>{part}</kbd>)}</button></label></p>)}<button onClick={()=>void save({shortcut:'Alt+J',captureShortcut:'Alt+Shift+J',voiceModifier:'right-option'})}>{t.restore}</button>{data.hex.conflict&&<p role="alert">{s.hexConflict}</p>}</>}
 {section===1&&<>{[...new Set(data.catalog.models.map(m=>m.provider))].map(provider=><div key={provider}><h3>{provider}</h3>{data.catalog.models.filter(m=>m.provider===provider).map(m=>{const key=m.provider+':'+m.id;return <p className="settings-row" key={key}><span className="settings-model"><ProviderIcon provider={m.provider}/>{m.label}</span><span className="settings-model-controls"><button aria-pressed={v.favorites.includes(key)} aria-label={t.favorite+' '+m.label} onClick={async()=>{setMessage('');try{await window.j7.settingsModel(key,true);await load();setMessage(t.saved);}catch(e){setMessage(String(e));}}}>{v.favorites.includes(key)?'★':'☆'}</button>{levels(m).length>0&&<select aria-label={s.reasoning+' '+m.label} value={initialEffort(m,v.effortByModel)} onChange={e=>void save({effortByModel:{[key]:e.target.value}})}>{levels(m).map(level=><option key={level} value={level}>{s.effortLabels[level]??level.charAt(0).toUpperCase()+level.slice(1)}</option>)}</select>}</span></p>;})}</div>)}</>}
 {section===3&&<><textarea aria-label={t.instructions} maxLength={4000} onBlur={()=>{clearTimeout(saveTimer.current);void save({personalInstructions:v.personalInstructions});}} value={v.personalInstructions} onChange={e=>{const text=e.target.value;setData({...data,settings:{...v,personalInstructions:text}});clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>void save({personalInstructions:text}),400);}}/><p className="settings-counter">{v.personalInstructions.length}/4000</p></>}
 {section===4&&<>{['claude','codex','opencode','hex'].map(id=>{const state=id==='hex'?(data.hex.installed?(data.hex.status?.code===0?'ready':'error'):'not_installed'):data.catalog.statuses[id as keyof typeof data.catalog.statuses]?.state??'error';return <div className="settings-program" key={id}><h3><span className={"status-dot "+state}/>{id} <small>{t.states[state]}</small></h3><p>{id!=='hex'&&data.catalog.statuses[id as keyof typeof data.catalog.statuses]?.detail}</p>{state!=='ready'&&commands[id]!.map(command=><p className="settings-command" key={command}><code>{command}</code> <button onClick={()=>void navigator.clipboard.writeText(command)}>{t.copy}</button></p>)}</div>;})}<button onClick={async()=>{await window.j7.settingsRefresh();await load();}}>{t.refresh}</button></>}
 {section===5&&<>{(['screen','input'] as const).map(kind=><p className="settings-row" key={kind}><span><span className={"status-dot "+(data.permissions[kind]?"ready":"not_authenticated")}/>{t[kind]}<small>{data.permissions[kind]?t.granted:t.missing}</small></span> <button onClick={()=>void window.j7.settingsPermission(kind)}>{t.system}</button></p>)}<button onClick={()=>void load()}>{t.refresh}</button></>}
 </div><div className={message===t.saved?"settings-toast":undefined} role="status">{message===t.saved?message:''}</div><div className={message&&message!==t.saved?"settings-toast":undefined} role="alert">{message!==t.saved?message:''}</div></section></main>;
}
