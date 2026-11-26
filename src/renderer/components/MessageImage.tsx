import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { strings as s } from "../strings.js";
export function Overlay({ close, children }: { close: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [close]);
  return createPortal(<div className="media-overlay" role="dialog" aria-modal="true" aria-label={s.preview} onClick={close}><div className="media-dialog" onClick={e => e.stopPropagation()}><button className="media-close" onClick={close} aria-label={s.close}>×</button>{children}</div></div>, document.body);
}
export function safeImageUrl(src: string) {
  try { const url = new URL(src); return url.protocol === "https:" || url.protocol === "j7-file:" && url.hostname === "attachment" && /^\/[a-f0-9-]{36}$/.test(url.pathname); } catch { return false; }
}
export function MessageImage({ src, alt = s.image }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false), [open, setOpen] = useState(false), [error, setError] = useState("");
  const actions = <span className="media-actions">{(["copy", "save"] as const).map(action => <button key={action} onClick={() => { setError(""); void window.j7.imageAction(action, src).catch(() => setError(s.imageActionFailed)); }}>{action === "copy" ? s.copyImage : s.saveImage}</button>)}{error && <span role="alert">{error}</span>}</span>;
  if (!safeImageUrl(src) || failed) return <a href={src} target="_blank" rel="noreferrer">{alt}</a>;
  return <span className="message-image"><img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" role="button" tabIndex={0} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); } }} onError={() => setFailed(true)} onClick={() => setOpen(true)}/>{actions}{open && <Overlay close={() => setOpen(false)}><img src={src} alt={alt} referrerPolicy="no-referrer"/>{actions}</Overlay>}</span>;
}
