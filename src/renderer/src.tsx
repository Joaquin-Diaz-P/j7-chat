import { Menu, Paperclip, Scissors, Globe, ArrowUp, Square, Plus, Pin, ArrowDown } from "lucide-react";
import { ResponseMarkdown } from "./components/Markdown.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "./store.js";
import { strings as s } from "./strings.js";
import "./style.css";
function App() {
  const chat = useChat();
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
      window.j7.onSnapshot((snapshot) => { flush(); useChat.getState().setSnapshot(snapshot); }),
      window.j7.onChat((event) => { pending.push(event); timer ??= setTimeout(flush, 34); }),
      window.j7.onPanel((state) => {
        setPinned(state.pinned);
        document.documentElement.classList.toggle("dark", state.dark);
        if (!state.resume) setDraft("");
        input.current?.focus();
      }),
    ];
    void window.j7
      .snapshot()
      .then((snapshot) => useChat.getState().setSnapshot(snapshot));
    window.j7.ready();
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
            28 + (root.querySelector(".notice")?.getBoundingClientRect().height ?? 0) +
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
        ".composer,.transcript",
      ))
        observer.observe(el);
    }
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chat.messages.length]);
  useLayoutEffect(() => {
    const el = conversation.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);
  async function send() {
    if (sending.current || chat.active || !draft.trim()) return;
    sending.current = true;
    try {
      await window.j7.send(draft);
      setDraft("");
    } finally {
      sending.current = false;
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.j7.hide();
      }
      if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDraft("");
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
  return (
    <div className="panel" ref={content}>
      <header>
        <span>{s.appName}</span>
        <div>
          <button
            title={s.newChat}
            aria-label={s.newChat}
            onClick={() => {
              setDraft("");
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
              <article key={message.id}>
                <small>{message.role === "user" ? s.user : (chat.providerLabel ?? s.assistant)}</small>
                {message.thinking && <details><summary>{s.reasoning}</summary><ResponseMarkdown text={message.thinking}/></details>}
                {message.role === "assistant" ? <ResponseMarkdown text={message.text}/> : <div className="user-text">{message.text}</div>}
                {message.status === "streaming" && !message.text && <p role="status">{s.thinking}</p>}
                {message.status === "stopped" && <small>{s.stopped}</small>}
              </article>
            ))}
          </div>
        </div>
      )}
      {away && <button className="scroll-bottom" aria-label={s.bottom} title={s.bottom} onClick={() => { following.current = true; setAway(false); const el = conversation.current; if (el) el.scrollTop = el.scrollHeight; }}><ArrowDown size={16}/></button>}
      <div className="composer">
        <button disabled aria-label={s.history} title={s.soon}><Menu size={17}/></button>
        <textarea
          ref={input}
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
          <button disabled title={s.soon} aria-label={s.attach}><Paperclip size={16}/></button>
          <button disabled title={s.soon} aria-label={s.capture}><Scissors size={16}/></button>
          <button disabled title={s.soon} aria-label={s.web}><Globe size={16}/></button>
          <button disabled title={s.soon} aria-label={s.thinkMore}>{s.thinkMore}</button>
          <button disabled title={s.soon} aria-label={s.model}>{chat.providerLabel ?? s.model}</button>
        </div>
        <button
          title={chat.active ? s.stop : s.send}
          aria-label={chat.active ? s.stop : s.send}
          disabled={!chat.active && !draft.trim()}
          onClick={() => (chat.active ? void window.j7.stop() : void send())}
        >
          {chat.active ? <Square size={17}/> : <ArrowUp size={17}/>}
        </button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
