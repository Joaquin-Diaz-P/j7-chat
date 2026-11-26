import { lazy, Suspense, memo, useEffect, useMemo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Copy } from "lucide-react";
import { codeText, normalizeMath, splitBlocks } from "../markdown.js";
import { MessageImage } from "./MessageImage.js";
const Artifact = lazy(() => import("./Artifact.js").then(module => ({ default: module.Artifact })));
import { extractArtifacts } from "../artifacts.js";
import { strings as s } from "../strings.js";
import "katex/dist/katex.min.css";
let highlighter: ReturnType<typeof import("shiki/core")["createHighlighterCore"]> | undefined;
function highlight() {
  // The CSP forbids WebAssembly, so Shiki uses its JavaScript regex engine instead of Oniguruma.
  // Only these languages and themes are imported, so the bundle doesn't carry all of Shiki's grammars.
  return highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) => createHighlighterCore({
    themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
    langs: [import("shiki/langs/mermaid.mjs"), import("shiki/langs/javascript.mjs"), import("shiki/langs/typescript.mjs"), import("shiki/langs/tsx.mjs"), import("shiki/langs/jsx.mjs"), import("shiki/langs/json.mjs"), import("shiki/langs/python.mjs"), import("shiki/langs/bash.mjs"), import("shiki/langs/css.mjs"), import("shiki/langs/html.mjs"), import("shiki/langs/sql.mjs"), import("shiki/langs/swift.mjs"), import("shiki/langs/markdown.mjs")],
    engine: createJavaScriptRegexEngine(),
  }));
}
export function Code({ text, language }: { text: string; language: string }) {
  const [highlighted, setHighlighted] = useState({ text: "", html: "" });
  const html = highlighted.text === text ? highlighted.html : "";
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void highlight().then(h => {
      const requested = language === "svg" ? "html" : language;
      const lang = h.getLoadedLanguages().includes(requested) ? requested : "text";
      const result = h.codeToHtml(text, { lang, themes: { light: "github-light", dark: "github-dark" } });
      if (live) setHighlighted({ text, html: result });
    }).catch(() => {});
    return () => { live = false; };
  }, [text, language]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); }, [copied]);
  return <section className="code-block"><div className="code-toolbar"><span>{language || s.plainText}</span><button title={s.copy} aria-label={s.copy} onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}><Copy size={13}/>{copied ? s.copied : s.copy}</button></div>{html ? <div dangerouslySetInnerHTML={{ __html: html }}/> : <pre><code>{text}</code></pre>}</section>;
}
const components: Components = {
    img: ({ src, alt }) => <MessageImage src={typeof src === "string" ? src : ""} alt={alt || s.image}/>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    pre: ({ children }) => <>{children}</>,
    code: ({ children, className, node }) => {
      const language = /language-(\S+)/.exec(className ?? "")?.[1] ?? "";
      const value = String(children);
      return language || node?.position?.start.line !== node?.position?.end.line ? <Code text={codeText(value)} language={language}/> : <code>{children}</code>;
    },
};
const Block = memo(function Block({ source }: { source: string }) {
  return <Markdown remarkRehypeOptions={{ footnoteLabel: s.footnotes }} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]} components={components}>{normalizeMath(source)}</Markdown>;
});
export function ResponseMarkdown({ text }: { text: string }) {
  const parts = useMemo(() => extractArtifacts(text), [text]);
  return <div className="markdown">{parts.map((part, index) => part.kind ? <Suspense key={index} fallback={<Code text={part.source} language={part.kind}/>}><Artifact source={part.source} kind={part.kind}/></Suspense> : splitBlocks(part.source).map((block, blockIndex) => <Block key={`${index}-${blockIndex}`} source={block.source}/>))}</div>;
}
