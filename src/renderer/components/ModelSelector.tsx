import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogSnapshot } from "../../shared/ipc.js";
import { strings as s } from "../strings.js";
import { Star, Check, Sparkles, Bot, Zap, FlaskConical } from "lucide-react";
import type { ProviderId } from "../../main/providers/types.js";
const icons = { claude: Sparkles, codex: Bot, opencode: Zap, mock: FlaskConical, "mock-a": FlaskConical, "mock-b": FlaskConical, gemini: Sparkles };
export function ModelSelector({ catalog, onSelect, onClose }: { catalog: CatalogSnapshot; onSelect: (key: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const models = useMemo(() => {
    // Favorites of unavailable programs must not hide the models that are available.
    const favorites = catalog.favorites.filter(key => catalog.models.some(m => `${m.provider}:${m.id}` === key));
    return catalog.models.filter(m => (all || query || !favorites.length || favorites.includes(`${m.provider}:${m.id}`)) && m.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  }, [catalog, all, query]);
  const activeIndex = Math.min(index, Math.max(0, models.length - 1));
  useEffect(() => { void window.j7.refreshModels(); }, []);
  useEffect(() => { setIndex(0); }, [query, all]);
  useEffect(() => { root.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: "nearest" }); }, [index]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [onClose]);
  return <div className="model-selector" role="dialog" aria-label={s.model} ref={root} onKeyDown={event => {
    if (["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex(i => models.length ? (i + (event.key === "ArrowDown" ? 1 : -1) + models.length) % models.length : 0); }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && models[activeIndex]) { event.preventDefault(); onSelect(`${models[activeIndex]!.provider}:${models[activeIndex]!.id}`); }
  }}>
    <input autoFocus value={query} aria-label={s.searchModels} placeholder={s.searchModels} onChange={e => setQuery(e.target.value)}/>
    <div className="model-list" role="listbox" aria-label={s.model}>
      {models.map((model, i) => {
        const key = `${model.provider}:${model.id}`;
        const Icon = icons[model.provider];
        return <div key={key}>
          {models[i - 1]?.provider !== model.provider && <small className="model-group"><Icon size={13}/>{s.programLabels[model.provider]}</small>}
          <div className="model-row" data-focused={i === activeIndex}>
            <button role="option" aria-selected={i === activeIndex} title={model.label} aria-label={model.label} onClick={() => onSelect(key)}>{model.label}</button>
            {all && <>
              <button title={s.favorite} aria-label={`${s.favorite}: ${model.label}`} aria-pressed={catalog.favorites.includes(key)} onClick={() => void window.j7.favorite(key)}><Star size={14} fill={catalog.favorites.includes(key) ? "currentColor" : "none"}/></button>
              <button title={catalog.defaultModel === key ? s.defaultSelected : s.defaultModel} aria-label={`${s.defaultModel}: ${model.label}`} aria-pressed={catalog.defaultModel === key} onClick={() => void window.j7.setDefaultModel(key)}><Check size={14}/></button>
            </>}
          </div>
        </div>;
      })}
      {!models.length && <p>{Object.keys(catalog.statuses).length ? s.noAvailableModels : s.noModels}</p>}
    </div>
    <button title={s.allModels} aria-label={s.allModels} aria-expanded={all} onClick={() => setAll(!all)}>{s.allModels}</button>
    {Object.entries(catalog.statuses).filter(([, status]) => status.state !== "ready").map(([id]) => <div className="unavailable" key={id}><button title={s.settings} aria-label={s.unavailable(s.programLabels[id as ProviderId])} onClick={() => { void window.j7.openSettings(); }}>{s.unavailable(s.programLabels[id as ProviderId])}</button></div>)}
  </div>;
}
