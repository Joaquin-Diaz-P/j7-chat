import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "./store.js";
import { strings as s } from "./strings.js";
import "./style.css";
function App() {
  const chat = useChat();
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    const disposers = [
      window.j7.onSnapshot((snapshot) =>
        useChat.getState().setSnapshot(snapshot),
      ),
      window.j7.onChat((event) => useChat.getState().event(event)),
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
    return () => disposers.forEach((dispose) => dispose());
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
          window.j7.setContentHeight(
            28 +
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
    if (el) el.scrollTop = el.scrollHeight;
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
            ＋
          </button>
          <button
            title={s.pin}
            aria-label={s.pin}
            aria-pressed={pinned}
            onClick={() => window.j7.setPinned(!pinned)}
          >
            📌
          </button>
        </div>
      </header>
      {chat.messages.length > 0 && (
        <div className="conversation" ref={conversation}>
          <div className="transcript">
            {chat.messages.map((message) => (
              <article key={message.id}>
                <small>{message.role === "user" ? s.user : s.assistant}</small>
                <div>{message.text}</div>
                {message.status === "stopped" && <small>{s.stopped}</small>}
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="composer">
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
        <button
          title={chat.active ? s.stop : s.send}
          aria-label={chat.active ? s.stop : s.send}
          disabled={!chat.active && !draft.trim()}
          onClick={() => (chat.active ? void window.j7.stop() : void send())}
        >
          {chat.active ? "■" : "↑"}
        </button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
