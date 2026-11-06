import { ProviderIcon } from "./components/ProviderIcon.js";
import { levels } from "../shared/effort.js";
import { isSettingsShortcut } from "../shared/shortcut.js";
import { SettingsView } from "./settings-view.js";
import { voiceDelivery } from "./voice-delivery.js";
import { History } from "./components/History.js";
import { Mic, LoaderCircle, ArrowUp, Copy, Check, RotateCcw, ArrowLeftRight, Pencil, AlertTriangle, Menu, Paperclip, X, Square, Plus, Pin, ArrowDown, FileText, File, FileUp, SquareDashed } from "lucide-react";
import { effortLabel, ModelSelector } from "./components/ModelSelector.js";
import { ResponseMarkdown } from "./components/Markdown.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "./store.js";
import { strings as s } from "./strings.js";
import "./style.css";
import type { Attachment } from "../main/providers/types.js";
import { nativePdf } from "../main/attachments/policy.js";
function AttachmentChips({ files, remove }: { files: Attachment[]; remove?: (id: string) => void }) {
  return <div className="attachment-chips">{files.map(file => <div className={`attachment-chip ${file.kind === "image" ? "image" : "file"}`} key={file.id ?? file.path}>
    <button className="attachment-open" onClick={() => void window.j7.attachments("preview", file.id)} title={file.name} aria-label={file.name}>
      {file.kind === "image" ? <img src={`j7-file://attachment/${file.id}`} alt={file.name}/> : <>
        <span className="attachment-icon">{file.kind === "pdf" ? <FileText size={16}/> : <File size={16}/>}</span>
        <span className="attachment-text"><span className="attachment-name">{file.name}</span><small>{fileMeta(file)}</small></span>
      </>}
    </button>
    {remove && <button className="attachment-remove" title={s.removeAttachment} aria-label={s.removeAttachment} onClick={() => remove(file.id!)}><X size={10} strokeWidth={2.5}/></button>}
  </div>)}</div>;
}
function fileMeta(file: Attachment) {
  const type = file.kind === "pdf" ? "PDF" : (/\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1] ?? s.textFile).toUpperCase();
  return file.pages !== undefined ? `${type} · ${s.pages(file.pages)}` : type;
}
function useLeaving<T>(value: T, delay: number): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value) { setShown(value); return; }
    const timer = setTimeout(() => setShown(value), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return value || shown;
}
function App() {
  const chat = useChat();
  const [offset, setOffset] = useState({x:0,y:0});
  const [prewarm, setPrewarm] = useState(false);
  const [compactHeight, setCompactHeight] = useState(106);
  const [hiding, setHiding] = useState(false);
  const [appeared, setAppeared] = useState(0);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const attachmentRegion = useRef<HTMLDivElement>(null);
  function closeAttachments() { setAttachmentMenu(false); input.current?.focus(); }
  useEffect(() => {
    if (!attachmentMenu) return;
    const outside = (event: PointerEvent) => {
      if (attachmentRegion.current?.contains(event.target as Node) || (event.target as Element).closest(".attachment-menu")) return;
      setAttachmentMenu(false);
      if (!(event.target as Element).closest?.("button,input,textarea,select,a,[tabindex]")) input.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [attachmentMenu]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [searchFocus,setSearchFocus]=useState(0);
  const historyRef=useRef(false);
  function toggleHistory(open=!historyRef.current) {historyRef.current=open;void window.j7.historyAction('open','',open);}
  const [capture, setCapture] = useState<import('../shared/capture.js').CaptureState>({phase:'idle',seconds:0});
  const pendingVoice = useRef(false);
  const voiceBusy = useRef(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const attachmentLock = useRef(false);
  async function attach(action: "files" | "data" | "paste" | "dialog" | "capture", value?: unknown) {
    if (attachmentLock.current) return;
    attachmentLock.current = true; setLoadingAttachments(true);
    try { const files = await window.j7.attachments(action, value, attachments.length); setAttachments(previous => [...previous, ...files]); setAttachmentError(""); return files.length; }
    catch (error) { setAttachmentError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : s.attachmentFailed); }
    finally { attachmentLock.current = false; setLoadingAttachments(false); }
  }
  const [selector, setSelector] = useState<"model" | "other" | null>(null);
  const shownSelector = useLeaving(selector, 150);
  const shownAttachmentMenu = useLeaving(attachmentMenu, 150);
  const shownMessages = useLeaving(chat.messages.length > 0, 190);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1500); return () => clearTimeout(timer); }, [copied]);
  const model = chat.catalog?.models.find(m => `${m.provider}:${m.id}` === chat.model);

  const imageBlocked = attachments.some(f => f.kind === "image") && !model?.supportsImages;
  const lastAnswer = chat.messages.findLast(m => m.role === "assistant")?.id;
  const lastQuestion = chat.messages.findLast(m => m.role === "user")?.id;

  const [away, setAway] = useState(false);
  const following = useRef(true);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Parameters<ReturnType<typeof useChat.getState>["event"]>[0][] = [];
    const flush = () => {
      clearTimeout(timer); timer = undefined;
      for (const event of pending) useChat.getState().event(event);
      pending = [];
    };
    const disposers = [
      window.j7.onHiding(() => setHiding(true)),
      window.j7.onCapture(event => {
        setCapture(previous => ({...previous,busy:false,recoverable:false,locked:false,hexBusy:false,...event.state}));
        voiceBusy.current = ['transcribing','recovering','listening','capturing','opening'].includes(event.state.phase);
        if (event.attachment) setAttachments(files => [...files,event.attachment!]);
        if (event.removeId) setAttachments(files => files.filter(f => f.id !== event.removeId));
        if (event.text) { setDraft(text => [text,event.text].filter(Boolean).join('\n')); pendingVoice.current = !!event.autoSend; }
      }),
      window.j7.onSnapshot((snapshot) => { flush(); useChat.getState().setSnapshot(snapshot); }),
      window.j7.onChat((event) => { pending.push(event); timer ??= setTimeout(flush, 34); }),
      window.j7.onPanel((state) => {
        const wasHistoryOpen = historyRef.current;
        setPinned(state.pinned);
        if(state.offset) setOffset(state.offset);
        if(state.historyOpen!==undefined){historyRef.current=state.historyOpen;setHistoryOpen(state.historyOpen);}
        if (state.appeared) { setHiding(false); setAppeared(n => n + 1); }
        document.documentElement.classList.toggle("dark", state.dark);
        if (!state.resume) { setDraft(""); setAttachments([]); }
        if ((state.appeared && !state.historyOpen) || (wasHistoryOpen && !state.historyOpen)) input.current?.focus();
      }),
    ];
    void window.j7
      .snapshot()
      .then((snapshot) => useChat.getState().setSnapshot(snapshot));
    window.j7.ready();
    void window.j7.captureAction("status");
    return () => { clearTimeout(timer); disposers.forEach((dispose) => dispose()); };
  }, []);
  useEffect(() => {
    if (!appeared || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelector(".shell")?.animate([{ opacity: 0, transform: "scale(.98)" }, { opacity: 1, transform: "scale(1)" }], { duration: 150, easing: "cubic-bezier(.32,.72,0,1)" });
  }, [appeared]);
  useLayoutEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    }
  }, [draft]);
  useEffect(() => {
    let frame = 0;
    let composerHeight = 90;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (content.current) {
          const root = content.current;
          if (following.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
          setCompactHeight(16 + composerHeight);
        }
      });
    };
    const observer = new ResizeObserver(entries => {
      for(const entry of entries) if(entry.target.matches(".composer")) composerHeight=entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      measure();
    });
    if (content.current) {
      observer.observe(content.current);
      for (const el of content.current.querySelectorAll(
        ".composer,.transcript,.model-selector",
      ))
        observer.observe(el);
    }
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chat.messages.length, selector, historyOpen]);
  const expanded = !!(chat.messages.length || selector || historyOpen);
  useEffect(() => { window.j7.layout(expanded ? 680 : compactHeight, historyOpen); }, [expanded, compactHeight, historyOpen]);
  useEffect(() => {
    if (!appeared) return;
    const timer = setTimeout(() => void window.j7.refreshModels(), 300);
    const idle = requestIdleCallback(() => setPrewarm(true));
    return () => { clearTimeout(timer); cancelIdleCallback(idle); };
  }, [appeared]);
  const lastRegions = useRef("");
  useEffect(() => {
    if (hiding) return;
    let frame = 0;
    let moving = 0;
    const update = () => {
      const surface = document.querySelector(".card-surface");
      if (!surface) return;
      const elements = [surface, ...(attachmentMenu ? document.querySelectorAll('.attachment-menu') : [])];
      const regions = elements.map(el => {
        const r = el.getBoundingClientRect();
        return {left:r.left, top:r.top, right:r.right, bottom:r.bottom};
      });
      const serialized = JSON.stringify(regions);
      if (serialized !== lastRegions.current) {
        lastRegions.current = serialized;
        window.j7.setRegions(regions);
      }
      if (moving) frame = requestAnimationFrame(update);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const start = () => { moving++; schedule(); };
    const end = () => { moving = Math.max(0, moving - 1); schedule(); };
    const shell = document.querySelector('.shell')!;
    const observer = new ResizeObserver(schedule);
    for (const el of shell.querySelectorAll('.card-surface,.attachment-menu,.model-selector')) observer.observe(el);
    shell.addEventListener('transitionrun', start);
    shell.addEventListener('transitionend', end);
    shell.addEventListener('transitioncancel', end);
    schedule();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      shell.removeEventListener('transitionrun', start);
      shell.removeEventListener('transitionend', end);
      shell.removeEventListener('transitioncancel', end);
    };
  }, [attachmentMenu, shownAttachmentMenu, expanded, compactHeight, historyOpen, offset, appeared, hiding]);
  useLayoutEffect(() => {
    const el = conversation.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);
  const dictating = ['capturing', 'opening', 'listening'].includes(capture.phase);
  const transcribing = ['transcribing', 'recovering'].includes(capture.phase);
  async function submit() {
    if (voiceBusy.current) { await window.j7.captureAction("finish"); return; }
    if (pendingVoice.current) return;
    await send();
  }
  async function toggleDictation() {
    input.current?.focus();
    await window.j7.captureAction(dictating ? "transcribe" : "dictate");
  }
  async function send() {
    if (sending.current || chat.active || (!draft.trim() && !attachments.length) || !chat.model || imageBlocked || loadingAttachments) return;
    sending.current = true;
    const submitted = draft;
    const ids = attachments.map(file => file.id!);
    try {
      await window.j7.send(submitted, ids);
      setAttachments(files => files.filter(file => !ids.includes(file.id!)));
      setDraft(value => value === submitted ? "" : value);

    } catch (error) { setAttachmentError(error instanceof Error ? error.message : s.attachmentFailed); } finally {
      sending.current = false;
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !event.defaultPrevented && voiceBusy.current) { event.preventDefault(); void window.j7.captureAction("finish"); return; }
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        if (selector) { setSelector(null); input.current?.focus(); return; }
        if (attachmentMenu) { closeAttachments(); return; }
        if (historyRef.current) { toggleHistory(false); input.current?.focus(); return; }
        if (voiceBusy.current) { void window.j7.captureAction("cancel"); return; }
        window.j7.hide();
      }
      if (event.metaKey && ['b','f'].includes(event.key.toLowerCase())) {
        event.preventDefault();toggleHistory(event.key.toLowerCase()==='f'?true:!historyRef.current);
        if(event.key.toLowerCase()==='f')setSearchFocus(n=>n+1);
      }
      if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (voiceBusy.current || pendingVoice.current) return;
        setDraft(""); setAttachments([]); setAttachmentError(""); setSelector(null); setEditing(null);
        void window.j7.newChat();
        input.current?.focus();
      }
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        const last = useChat.getState().messages.findLast(m => m.role === "assistant");
        if (last) void navigator.clipboard.writeText(last.text);
      }
      if (event.metaKey && event.key === ".") {
        event.preventDefault();
        void window.j7.stop();
      }
    };
    const settingsListener = (event: KeyboardEvent) => {
      if (isSettingsShortcut(event)) {
        event.preventDefault(); event.stopPropagation(); void window.j7.openSettings();
      }
    };
    window.addEventListener("keydown", settingsListener, true);
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", settingsListener, true);
      window.removeEventListener("keydown", listener);
    };
  }, [attachmentMenu, selector]);
  useEffect(() => {
    const decision=voiceDelivery(pendingVoice.current,chat.active,!!chat.model,imageBlocked,loadingAttachments);
    if(decision==='none' || decision==='wait')return;
    if(decision==='queued'){void window.j7.captureAction('queued');return;}
    pendingVoice.current=false;
    if(decision!=='send'){void window.j7.captureAction(decision==='blocked-image'?'idle':'failed');return;}
    void send().then(()=>window.j7.captureAction('idle'));
  }, [draft, chat.active, chat.model, imageBlocked, loadingAttachments]);
  return (
    <div onPointerDown={event => {
      if(event.button!==0 || (event.target as Element).closest('button,input,textarea,a,.conversation,.history,.model-selector'))return;
      if(!(event.target as Element).closest('.window-bar,.composer'))return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      let x=event.screenX,y=event.screenY;
      const move=(e:PointerEvent)=>{window.j7.moveCard(e.screenX-x,e.screenY-y);x=e.screenX;y=e.screenY;};
      const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.j7.endMoveCard();input.current?.focus();};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true});
    }} data-selector-closing={!selector} data-attachment-closing={!attachmentMenu} style={{ "--compact-height": `${compactHeight}px`, "--offset-x": `${offset.x}px`, "--offset-y": `${offset.y}px` } as React.CSSProperties} className={`shell ${hiding ? "hiding" : ""} ${historyOpen ? "history-open" : ""} ${historyOpen ? "history-visible" : ""} ${chat.messages.length || selector || historyOpen ? "expanded" : "compact"}`}>
      <div className="card-surface" aria-hidden="true"/>
          {shownAttachmentMenu && <div className="attachment-menu" role="menu" onKeyDown={e => {
            if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeAttachments(); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const buttons = [...e.currentTarget.querySelectorAll('button')]; buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
          }}>
            <button autoFocus tabIndex={-1} role="menuitem" aria-label={s.attachFile} title={s.attachFile} onClick={() => { closeAttachments(); void attach('dialog').finally(() => input.current?.focus()); }}><FileUp size={15}/>{s.attachFile}</button>
            <button tabIndex={-1} role="menuitem" aria-label={s.capture} title={s.capture} onClick={() => { closeAttachments(); void attach('capture').finally(() => input.current?.focus()); }}><SquareDashed size={15}/>{s.capture}</button>
          </div>}
      <div className="card-clip">
      <header className="window-bar" inert={!expanded}>
        {<button className="hide-dot" aria-label={s.hide} title={s.hide} onClick={() => window.j7.hide()}><X size={8}/></button>}
        <div>
          <button onClick={() => toggleHistory()} aria-label={s.history} title={s.history}><Menu size={16}/></button>
          <button
            title={s.newChat}
            aria-label={s.newChat}
            onClick={() => {
              if (voiceBusy.current || pendingVoice.current) return;
              setDraft(""); setAttachments([]); setAttachmentError(""); setSelector(null); setEditing(null);
              void window.j7.newChat();
              input.current?.focus();
            }}
          >
            <Plus size={16}/>
          </button>
          <button
            title={s.pin}
            aria-label={s.pin}
            aria-pressed={pinned}
            onClick={() => window.j7.setPinned(!pinned)}
          >
            <Pin size={16}/>
          </button>
        </div>
      </header>
    <div className="history-reveal" inert={!historyOpen}><History open={historyOpen} current={chat.chatId} revision={chat.messages} focus={searchFocus} onSelect={()=>{following.current=true;setDraft("");setAttachments([]);}}/></div>
    <div className="panel"  ref={content}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={event => {
        event.preventDefault(); setDragging(false);
        const files = [...event.dataTransfer.files];
        const paths = files.map(file => window.j7.filePath(file));
        if (files.length) void Promise.all(files.map(async (file, index) => paths[index] || new Uint8Array(await file.arrayBuffer()))).then(entries => attach("files", entries));
        else { const data = event.dataTransfer.getData("text/uri-list"); if (data.startsWith("data:image/")) void fetch(data).then(r => r.arrayBuffer()).then(bytes => attach("data", new Uint8Array(bytes))); }
      }}>
      {dragging && <div className="drop-overlay">{s.dropAttachments}</div>}
      {(shownSelector || prewarm) && chat.catalog && <div className="selector-host" inert={!selector} style={{visibility:shownSelector ? "visible" : "hidden"}}><ModelSelector open={!!selector} catalog={chat.catalog} selected={chat.model} effort={chat.effort} onClose={() => { setSelector(null); input.current?.focus(); }} onSelect={(key, effort) => {
        if (selector === "other") void window.j7.askOther(key, effort);
        else void window.j7.updateChat({ model: key, ...(effort ? { effort } : {}) });
        setSelector(null); input.current?.focus();
      }}/></div>}

      {shownMessages && (
        <div className="conversation" ref={conversation} onScroll={() => {
          const el = conversation.current!;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          setAway(!following.current);
        }}>
          <div className="transcript">
            {chat.messages.map((message) => (
              message.role === "notice" ? <p className="model-notice" key={message.id}>{message.text}</p> :
              <article key={message.id} className={`${message.role}-message ${message.id === lastAnswer ? "last-answer" : ""} ${message.status === "error" ? "response-error" : ""}`}>
                {message.status === "error" && <AlertTriangle size={14} aria-label={s.error}/>}
                {message.attachments && <AttachmentChips files={message.attachments}/>}
                {message.thinking && <details><summary>{s.reasoning}</summary><ResponseMarkdown text={message.thinking}/></details>}
                {editing === message.id ? <div className="inline-edit" onKeyDown={e => {
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                }}>
                  <textarea autoFocus value={editDraft} aria-label={s.edit} onChange={e => setEditDraft(e.target.value)} onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void window.j7.edit(editDraft); setEditing(null); }
                  }}/>
                  <button title={s.send} aria-label={s.send} disabled={!editDraft.trim()} onClick={() => { void window.j7.edit(editDraft); setEditing(null); }}>{s.send}</button>
                  <button title={s.cancel} aria-label={s.cancel} onClick={() => setEditing(null)}>{s.cancel}</button>
                </div> : message.role === "assistant" ? <ResponseMarkdown text={message.text}/> : <div className="user-text">{message.text}</div>}
                {message.status === "queued" && <p role="status">{s.queued}</p>}
                {message.status === "streaming" && !message.text && <p role="status">{s.thinking}</p>}
                {message.status === "interrupted" && <small>{s.interrupted}</small>}
                {message.status === "stopped" && <small>{s.stopped}</small>}
                {message.sources && message.sources.length > 0 && <details><summary>{s.sources(message.sources.length)}</summary><ul>{message.sources.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a></li>)}</ul></details>}
                {message.role === "assistant" && <>

                  <div className="response-actions">
                    <button title={s.copy} aria-label={s.copy} onClick={() => { void navigator.clipboard.writeText(message.text).then(() => setCopied(message.id)); }}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>}</button>
                    {message.id === lastAnswer && !chat.active && <>
                      {message.errorKind !== "quota" && message.errorKind !== "unsupported" && <button title={s.retry} aria-label={s.retry} onClick={() => void window.j7.retry()}><RotateCcw size={14}/></button>}
                      {(!message.errorKind || message.errorKind === "quota" || message.errorKind === "unsupported") && <button title={s.askOther} aria-label={s.askOther} onClick={() => setSelector("other")}><ArrowLeftRight size={14}/></button>}
                    </>}
                    <small className="model-label">{message.modelLabel ?? message.model}{message.effort && chat.catalog?.models.some(m => `${m.provider}:${m.id}` === message.model && levels(m).length > 0) && <span className="effort-label"> · {effortLabel(message.effort)}</span>}</small>
                  </div>
                </>}
                {message.role === "user" && message.id === lastQuestion && !chat.active && editing !== message.id && <button className="edit-question" title={s.edit} aria-label={s.edit} onClick={() => { setEditing(message.id); setEditDraft(message.text); }}><Pencil size={14}/></button>}
              </article>
            ))}
          </div>
        </div>
      )}
      {away && <button className="scroll-bottom" aria-label={s.bottom} title={s.bottom} onClick={() => { following.current = true; setAway(false); const el = conversation.current; if (el) el.scrollTop = el.scrollHeight; }}><ArrowDown size={16}/></button>}
      <div className="composer">
        <div className="attachment-draft">
          {chat.warning && <div className="notice" role="status">{chat.warning}</div>}
          {capture.permission && <p role="alert">{capture.permission === 'screen' ? s.captureScreen : s.captureInput} <button onClick={() => void window.j7.captureAction(capture.permission!)}>{s.systemSettings}</button></p>}
          {capture.conflict && <p role="alert">{s.hexConflict}</p>}
          {capture.missingHex && <p role="alert">{s.hexMissing} <button onClick={() => void window.j7.openSettings()}>{s.settings}</button></p>}
          {capture.busy && <p role="status">{s.captureBusy}</p>}
          {capture.phase === 'listening' && (capture.locked
            ? <p role="status">{s.captureListeningLocked} <button onClick={() => void window.j7.captureAction('finish')}>{s.captureSend}</button> <button onClick={() => void window.j7.captureAction('cancel')}>{s.captureDiscard}</button></p>
            : <p role="status">{s.captureListening}</p>)}
          {capture.hexBusy && <p role="status">{s.hexBusy}</p>}
          {capture.phase === 'opening' && <p role="status">{s.captureOpening}</p>}
          {capture.phase === 'empty' && <p role="status">{s.captureEmpty}</p>}
          {capture.phase === 'queued' && <p role="status">{s.queued}</p>}
          {capture.phase === 'transcribing' && <p role="status">{s.captureTranscribing} {capture.seconds >= 3 ? capture.seconds + ' s' : ''} <button onClick={() => void window.j7.captureAction('cancel')}>{s.cancel}</button></p>}
          {capture.phase === 'recovering' && <p role="status">{s.captureRecovering}</p>}
          {capture.phase === 'failed' && !capture.permission && <p role="alert">{capture.recoverable ? s.captureFailed : s.captureUnavailable} {capture.recoverable && <button onClick={() => void window.j7.captureAction('recover')}>{s.captureRetry}</button>}</p>}

          <AttachmentChips files={attachments} remove={id => { setAttachmentError(""); setAttachments(files => files.filter(file => file.id !== id)); }}/>
          {attachmentError && <p role="alert">{attachmentError}</p>}
          {imageBlocked && <p role="alert">{s.noVision(model?.label ?? s.model)}</p>}
          {attachments.filter(file => file.kind === "pdf" && model && !nativePdf(file, model)).map(file => <p key={file.id} role="status">{!file.hasText ? s.scannedPdf(model!.label) : file.truncated ? s.pdfTruncated(file.sentPages ?? 0, file.pages ?? 0) : ""}</p>)}
        </div>
        <textarea
          ref={input}
          onPaste={event => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            const start = event.currentTarget.selectionStart, end = event.currentTarget.selectionEnd;
            void attach("paste").then(count => { if (!count && text) setDraft(value => value.slice(0, start) + text + value.slice(end)); });
          }}
          aria-label={s.input}
          placeholder={
            s.newPlaceholder
          }
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-tools">
          <div ref={attachmentRegion} onKeyDown={e => { if (attachmentMenu && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAttachments(); } }} >
          <button disabled={loadingAttachments} aria-haspopup="menu" aria-expanded={attachmentMenu} onClick={() => setAttachmentMenu(!attachmentMenu)} title={s.attach} aria-label={s.attach}><Paperclip size={16}/></button>
          </div>
          {!(chat.messages.length || selector || historyOpen) && <div className="compact-tools">
            <button onClick={() => toggleHistory()} aria-label={s.history} title={s.history}><Menu size={16}/></button>
            <button title={s.pin} aria-label={s.pin} aria-pressed={pinned} onClick={() => window.j7.setPinned(!pinned)}><Pin size={16}/></button>
          </div>}
          <button className="model-trigger" title={s.model} aria-expanded={!!selector} onClick={() => setSelector(selector ? null : "model")}>{model && <ProviderIcon provider={model.provider} size={14}/> }{model?.label ?? chat.providerLabel ?? s.model}{model && levels(model).length > 0 && chat.effort && <span className="effort-label">{effortLabel(chat.effort)}</span>}</button>
          <button className={`dictation-button ${dictating ? "recording" : ""}`} title={dictating ? s.transcribe : transcribing ? s.captureTranscribing : s.dictate} aria-label={dictating ? s.transcribe : transcribing ? s.captureTranscribing : s.dictate} aria-pressed={dictating} disabled={transcribing || pendingVoice.current || capture.phase === 'queued' || capture.phase === 'sending'} onClick={() => void toggleDictation()}>
            {transcribing ? <LoaderCircle size={15} className="dictation-spinner"/> : dictating ? <Square size={12} fill="currentColor"/> : <Mic size={16}/>}
          </button>
          {!chat.active && <button className="send-button" title={dictating || transcribing ? s.sendDictation : s.captureSend} aria-label={dictating || transcribing ? s.sendDictation : s.captureSend} disabled={!chat.model || imageBlocked || loadingAttachments || (!dictating && !transcribing && !draft.trim() && !attachments.length)} onClick={() => void submit()}><ArrowUp size={16}/></button>}
          {chat.active && <button className="stop" title={s.stop} aria-label={s.stop} onClick={() => void window.j7.stop()}><Square size={12} fill="currentColor"/></button>}
        </div>
      </div>
    </div></div></div>
  );
}
createRoot(document.getElementById("root")!).render(location.hash === "#/settings" ? <SettingsView/> : <App />);
