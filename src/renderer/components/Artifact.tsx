import { useEffect, useMemo, useRef, useState } from 'react';
import { Code } from './Markdown.js';
import { Overlay } from './MessageImage.js';
import { type ArtifactKind } from '../artifacts.js';
import { strings as s } from '../strings.js';

function documentSource(source: string, kind: ArtifactKind, dark: boolean, mermaidSource: string) {
  const doc = new DOMParser().parseFromString(kind === 'html' ? source : '', 'text/html');
  for (const meta of doc.querySelectorAll('meta[http-equiv],base')) meta.remove();
  if (kind === 'svg') doc.body.innerHTML = source;
  if (kind === 'mermaid') {
    const target = doc.createElement('pre'); target.className = 'mermaid'; target.textContent = source; doc.body.append(target);
    const library = doc.createElement('script'); library.textContent = mermaidSource.replace(/<\/script/gi, '<\\/script'); doc.body.append(library);
    const render = doc.createElement('script'); render.textContent = `mermaid.initialize({startOnLoad:true,securityLevel:'strict',theme:'${dark ? 'dark' : 'default'}'});`; doc.body.append(render);
  }
  doc.documentElement.classList.add(dark ? 'dark' : 'light');
  const style = doc.createElement('style'); style.textContent = `:root{color-scheme:${dark ? 'dark' : 'light'};--text:${dark ? '#eee' : '#222'};--background:transparent;--border:${dark ? '#ffffff30' : '#00000030'}}html,body{background:transparent!important;color:var(--text);font:14px system-ui;margin:0;padding:0}body{padding:12px;box-sizing:border-box}svg,canvas,img{max-width:100%}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:#8886;border-radius:8px}`; doc.head.prepend(style);
  const bridge = doc.createElement('script'); bridge.textContent = `document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();if(e.isTrusted)parent.postMessage({j7:'link',url:a.href?.baseVal||a.href},'*')}});document.addEventListener('keydown',e=>{if(e.key==='Escape')parent.postMessage({j7:'escape'},'*')});new ResizeObserver(()=>parent.postMessage({j7:'height',height:Math.ceil(document.body.getBoundingClientRect().height)},'*')).observe(document.body);`;
  doc.body.append(bridge);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
function Frame({ source, kind, close }: { source: string; kind: ArtifactKind; close?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null), [height, setHeight] = useState(240);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => { const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark'))); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); return () => observer.disconnect(); }, []);
  const [mermaid, setMermaid] = useState("");
  useEffect(() => { if (kind === "mermaid") void import("mermaid/dist/mermaid.min.js?raw").then(m => setMermaid(m.default)); }, [kind]);
  const html = useMemo(() => documentSource(source, kind, dark, mermaid), [source, kind, dark, mermaid]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (kind === "mermaid" && !mermaid) return;
    let disposed = false, registered: string | undefined;
    setUrl(undefined);
    void window.j7.registerArtifact(html).then(value => {
      registered = value;
      if (disposed) void window.j7.releaseArtifact(value);
      else setUrl(value);
    }).catch(() => {});
    return () => { disposed = true; if (registered) void window.j7.releaseArtifact(registered); };
  }, [html, kind, mermaid]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data) return;
      if (event.data.j7 === 'height' && Number.isFinite(event.data.height)) setHeight(Math.max(80, Math.min(close ? window.innerHeight - 120 : 480, event.data.height)));
      // An artifact's own script can post this message; only a real click (user activation
      // propagates to ancestor frames) may open the browser.
      if (event.data.j7 === 'link' && typeof event.data.url === 'string' && navigator.userActivation?.isActive) void window.j7.openArtifactLink(event.data.url);
      if (event.data.j7 === 'escape') close?.();
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [close]);
  return <iframe ref={frame} title={kind} sandbox="allow-scripts" src={url} style={{ height }} referrerPolicy="no-referrer"/>;
}
export function Artifact({ source, kind }: { source: string; kind: ArtifactKind }) {
  const [code, setCode] = useState(false), [open, setOpen] = useState(false);
  const title = kind === 'html' ? new DOMParser().parseFromString(source, 'text/html').title || 'HTML' : kind.toUpperCase();
  return <section className="artifact"><div className="code-toolbar"><span>{title}</span><button onClick={() => setCode(!code)}>{code ? s.artifactPreview : s.artifactCode}</button><button onClick={() => void navigator.clipboard.writeText(source)}>{s.copy}</button><button onClick={() => setOpen(true)} aria-label={s.expand}>⤢</button></div>{code ? <Code text={source} language={kind}/> : <Frame source={source} kind={kind}/ >}{open && <Overlay close={() => setOpen(false)}><Frame source={source} kind={kind} close={() => setOpen(false)}/></Overlay>}</section>;
}
