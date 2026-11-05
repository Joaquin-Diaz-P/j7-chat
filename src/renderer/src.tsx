import { SettingsView } from "./settings-view.js";
import { voiceDelivery } from "./voice-delivery.js";
import { History } from "./components/History.js";
import { Menu, Paperclip, Scissors, Globe, ArrowUp, Square, Plus, Pin, ArrowDown } from "lucide-react";
import { ModelSelector } from "./components/ModelSelector.js";
import { ResponseMarkdown } from "./components/Markdown.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "./store.js";
import { strings as s } from "./strings.js";
import "./style.css";
import type { Attachment } from "../main/providers/types.js";
import { nativePdf } from "../main/attachments/policy.js";
function AttachmentChips({ files, remove }: { files: Attachment[]; remove?: (id: string) => void }) {
  return <div className="attachment-chips">{files.map(file => <div className="attachment-chip" key={file.id ?? file.path}>
    <button onClick={() => void window.j7.attachments("preview", file.id)} title={file.name}>
      {file.kind === "image" ? <img src={`j7-file://attachment/${file.id}`} alt={file.name}/> : <span>{file.kind === "pdf" ? "📄" : "📃"}</span>}
      <span>{file.name}{file.pages !== undefined && <small>{s.pages(file.pages)}</small>}</span>
    </button>
    {remove && <button aria-label={s.removeAttachment} onClick={() => remove(file.id!)}>×</button>}
  </div>)}</div>;
}
function App() {
  const chat = useChat();
  const [historyOpen,setHistoryOpen]=useState(false);
  const [searchFocus,setSearchFocus]=useState(0);
  const historyRef=useRef(false);
  function toggleHistory(open=!historyRef.current) {historyRef.current=open;setHistoryOpen(open);void window.j7.historyAction('open','',open);}
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
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
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
      window.j7.onCapture(event => {
        setCapture(previous => ({...previous,busy:false,recoverable:false,...event.state}));
        voiceBusy.current = ['transcribing','recovering','listening','capturing','opening'].includes(event.state.phase);
        if (event.attachment) setAttachments(files => [...files,event.attachment!]);
        if (event.removeId) setAttachments(files => files.filter(f => f.id !== event.removeId));
        if (event.text) { setDraft(text => [text,event.text].filter(Boolean).join('\n')); pendingVoice.current = !!event.autoSend; }
      }),
      window.j7.onSnapshot((snapshot) => { flush(); useChat.getState().setSnapshot(snapshot); }),
      window.j7.onChat((event) => { pending.push(event); timer ??= setTimeout(flush, 34); }),
      window.j7.onPanel((state) => {
        setPinned(state.pinned);
        if(state.historyOpen!==undefined){historyRef.current=state.historyOpen;setHistoryOpen(state.historyOpen);}
        if (state.appeared && content.current) {
          content.current.classList.remove("appear");
          void content.current.offsetWidth;
          content.current.classList.add("appear");
        }
        document.documentElement.classList.toggle("dark", state.dark);
        if (!state.resume) { setDraft(""); setAttachments([]); }
        input.current?.focus();
      }),
    ];
    void window.j7
      .snapshot()
      .then((snapshot) => useChat.getState().setSnapshot(snapshot));
    window.j7.ready();
    void window.j7.captureAction("status");
    return () => { clearTimeout(timer); disposers.forEach((dispose) => dispose()); };
  }, []);
  useLayoutEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
    }
  }, [draft]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (content.current) {
          const root = content.current;
          if (following.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
          window.j7.setContentHeight(
            28 + (root.querySelector(".model-selector")?.getBoundingClientRect().height ?? 0) + (selector ? 16 : 0) + (root.querySelector(".notice")?.getBoundingClientRect().height ?? 0) +
              (root.querySelector(".composer")?.getBoundingClientRect()
                .height ?? 60) +
              (root.querySelector(".transcript")?.getBoundingClientRect()
                .height ?? 0),
          );
        }
      });
    };
    const observer = new ResizeObserver(measure);
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
  useLayoutEffect(() => {
    const el = conversation.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);
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
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        if (voiceBusy.current) { void window.j7.captureAction("cancel"); return; }
        window.j7.hide();
      }
      if (event.metaKey && ['b','f'].includes(event.key.toLowerCase())) {
        event.preventDefault();toggleHistory(event.key.toLowerCase()==='f'?true:!historyRef.current);
        if(event.key.toLowerCase()==='f')setSearchFocus(n=>n+1);
      }
      if (event.metaKey && (event.code === "Comma" || event.key === ",")) {
        event.preventDefault(); void window.j7.openSettings();
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
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    const decision=voiceDelivery(pendingVoice.current,chat.active,!!chat.model,imageBlocked,loadingAttachments);
    if(decision==='none' || decision==='wait')return;
    if(decision==='queued'){void window.j7.captureAction('queued');return;}
    pendingVoice.current=false;
    if(decision!=='send'){void window.j7.captureAction(decision==='blocked-image'?'idle':'failed');return;}
    void send().then(()=>window.j7.captureAction('idle'));
  }, [draft, chat.active, chat.model, imageBlocked, loadingAttachments]);
  return (
    <div className={historyOpen?"shell history-open":"shell"}>
    {historyOpen&&<History current={chat.chatId} revision={chat.messages} focus={searchFocus} onSelect={()=>{following.current=true;setDraft("");setAttachments([]);}}/>}
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
      {selector && chat.catalog && <ModelSelector catalog={chat.catalog} onClose={() => { setSelector(null); input.current?.focus(); }} onSelect={key => {
        if (selector === "other") void window.j7.askOther(key);
        else void window.j7.updateChat({ model: key });
        setSelector(null); input.current?.focus();
      }}/>}

      <header>
        <span>{s.appName}</span>
        <div>
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
      {chat.warning && <div className="notice" role="status">{chat.warning}</div>}
      {chat.messages.length > 0 && (
        <div className="conversation" ref={conversation} onScroll={() => {
          const el = conversation.current!;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          setAway(!following.current);
        }}>
          <div className="transcript">
            {chat.messages.map((message) => (
              message.role === "notice" ? <p className="model-notice" key={message.id}>{message.text}</p> :
              <article key={message.id} className={message.status === "error" ? "response-error" : undefined}>
                <small>{message.role === "user" ? s.user : s.assistant}</small>
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
                {message.attachments && <AttachmentChips files={message.attachments}/>}
                {message.status === "queued" && <p role="status">{s.queued}</p>}
                {message.status === "streaming" && !message.text && <p role="status">{s.thinking}</p>}
                {message.status === "interrupted" && <small>{s.interrupted}</small>}
                {message.status === "stopped" && <small>{s.stopped}</small>}
                {message.sources && message.sources.length > 0 && <details><summary>{s.sources(message.sources.length)}</summary><ul>{message.sources.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a></li>)}</ul></details>}
                {message.role === "assistant" && <>
                  <small className="model-label">{message.modelLabel ?? s.assistant}</small>
                  <div className="response-actions">
                    <button title={s.copy} aria-label={s.copy} onClick={() => { void navigator.clipboard.writeText(message.text).then(() => setCopied(message.id)); }}>{copied === message.id ? s.copied : s.copy}</button>
                    {message.id === lastAnswer && !chat.active && <>
                      {message.errorKind !== "quota" && message.errorKind !== "unsupported" && <button title={s.retry} aria-label={s.retry} onClick={() => void window.j7.retry()}>{s.retry}</button>}
                      {(!message.errorKind || message.errorKind === "quota" || message.errorKind === "unsupported") && <button title={s.askOther} aria-label={s.askOther} onClick={() => setSelector("other")}>{s.askOther}</button>}
                    </>}
                  </div>
                </>}
                {message.role === "user" && message.id === lastQuestion && !chat.active && editing !== message.id && <button title={s.edit} aria-label={s.edit} onClick={() => { setEditing(message.id); setEditDraft(message.text); }}>✎</button>}
              </article>
            ))}
          </div>
        </div>
      )}
      {away && <button className="scroll-bottom" aria-label={s.bottom} title={s.bottom} onClick={() => { following.current = true; setAway(false); const el = conversation.current; if (el) el.scrollTop = el.scrollHeight; }}><ArrowDown size={16}/></button>}
      <div className="composer">
        <div className="attachment-draft">
          {capture.permission && <p role="alert">{capture.permission === 'screen' ? s.captureScreen : s.captureInput} <button onClick={() => void window.j7.captureAction(capture.permission!)}>{s.systemSettings}</button></p>}
          {capture.conflict && <p role="alert">{s.hexConflict}</p>}
          {capture.missingHex && <p role="alert">{s.hexMissing} <button onClick={() => void window.j7.openSettings()}>{s.settings}</button></p>}
          {capture.busy && <p role="status">{s.captureBusy}</p>}
          {capture.phase === 'listening' && <p role="status">{s.captureListening}</p>}
          {capture.phase === 'opening' && <p role="status">{s.captureOpening}</p>}
          {capture.phase === 'empty' && <p role="status">{s.captureEmpty}</p>}
          {capture.phase === 'queued' && <p role="status">{s.queued}</p>}
          {capture.phase === 'transcribing' && <p role="status">{s.captureTranscribing} {capture.seconds >= 3 ? capture.seconds + ' s' : ''} <button onClick={() => void window.j7.captureAction('cancel')}>{s.cancel}</button></p>}
          {capture.phase === 'recovering' && <p role="status">{s.captureRecovering}</p>}
          {capture.phase === 'failed' && <p role="alert">{capture.recoverable ? s.captureFailed : s.captureUnavailable} {capture.recoverable && <button onClick={() => void window.j7.captureAction('recover')}>{s.captureRetry}</button>}</p>}

          <AttachmentChips files={attachments} remove={id => { setAttachmentError(""); setAttachments(files => files.filter(file => file.id !== id)); }}/>
          {attachmentError && <p role="alert">{attachmentError}</p>}
          {imageBlocked && <p role="alert">{s.noVision(model?.label ?? s.model)}</p>}
          {attachments.filter(file => file.kind === "pdf" && model && !nativePdf(file, model)).map(file => <p key={file.id} role="status">{!file.hasText ? s.scannedPdf(model!.label) : file.truncated ? s.pdfTruncated(file.sentPages ?? 0, file.pages ?? 0) : ""}</p>)}
        </div>
        <button onClick={()=>toggleHistory()} aria-label={s.history} title={s.history}><Menu size={17}/></button>
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
            chat.messages.length ? s.followPlaceholder : s.newPlaceholder
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
              void send();
            }
          }}
        />
        <div className="composer-tools">
          <button disabled={loadingAttachments} onClick={() => void attach("dialog")} title={s.attach} aria-label={s.attach}><Paperclip size={16}/></button>
          <button disabled={loadingAttachments} onClick={() => void attach("capture")} title={s.capture} aria-label={s.capture}><Scissors size={16}/></button>
          <button title={s.web} aria-label={s.web} aria-pressed={chat.webSearch ?? true} onClick={() => void window.j7.updateChat({ webSearch: !chat.webSearch })}><Globe size={16}/></button>
          {model?.supportsEffort && <button title={s.thinkMore} aria-label={s.thinkMore} aria-pressed={chat.effort === "high"} onClick={() => void window.j7.updateChat({ effort: chat.effort === "high" ? "normal" : "high" })}>{s.thinkMore}</button>}
          <button title={s.model} aria-label={s.model} aria-expanded={!!selector} onClick={() => setSelector(selector ? null : "model")}>{chat.providerLabel ?? s.model}</button>
        </div>
        <button
          title={chat.active ? s.stop : s.send}
          aria-label={chat.active ? s.stop : s.send}
          disabled={!chat.active && ((!draft.trim() && !attachments.length) || !chat.model || imageBlocked || loadingAttachments)}
          onClick={() => (chat.active ? void window.j7.stop() : void send())}
        >
          {chat.active ? <Square size={17}/> : <ArrowUp size={17}/>}
        </button>
      </div>
    </div></div>
  );
}
createRoot(document.getElementById("root")!).render(location.hash === "#/settings" ? <SettingsView/> : <App />);
