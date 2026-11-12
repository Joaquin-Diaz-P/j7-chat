import { useState } from "react";
import type { ModelInfo } from "../../main/providers/types.js";
import { strings as s } from "../strings.js";
import { ProviderIcon } from "./ProviderIcon.js";

interface Props {
  models: ModelInfo[];
  selected: string[];
  current: string | undefined;
  onApply: (keys: string[]) => Promise<void>;
  onClose: () => void;
}
const keyOf = (model: ModelInfo) => `${model.provider}:${model.id}`;
export function ComparePicker({ models, selected, current, onApply, onClose }: Props) {
  const [keys, setKeys] = useState(() => {
    const available = selected.filter(key => models.some(model => keyOf(model) === key));
    if (available.length >= 2) return available;
    return [...new Set([models.some(model => keyOf(model) === current) ? current : undefined, ...models.map(keyOf)].filter((key): key is string => !!key))].slice(0, 2);
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function apply(selection: string[]) {
    setSaving(true);
    try { await onApply(selection); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : s.compareInvalid); }
    finally { setSaving(false); }
  }
  return <section className="compare-picker" role="dialog" aria-labelledby="compare-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <h2 id="compare-title">{s.compareTitle}</h2>
    <p>{s.compareHint}</p>
    <div className="compare-models">
      {models.map((model, index) => {
        const key = keyOf(model), checked = keys.includes(key);
        return <label key={key}>
          <input type="checkbox" autoFocus={index === 0} checked={checked} disabled={saving || (!checked && keys.length >= 3)} onChange={() => setKeys(previous => checked ? previous.filter(item => item !== key) : [...previous, key])}/>
          <ProviderIcon provider={model.provider} size={14}/><span>{model.label}</span>
        </label>;
      })}
    </div>
    {models.length < 2 && <p role="status">{s.compareUnavailable}</p>}
    <p className="compare-help">{s.compareIndependent}</p>
    {error && <p role="alert">{error}</p>}
    <div className="compare-picker-actions">
      <button disabled={saving} onClick={() => void apply([])}>{s.compareNormal}</button>
      <button disabled={saving} onClick={onClose}>{s.cancel}</button>
      <button className="compare-apply" disabled={saving || keys.length < 2} onClick={() => void apply(keys)}>{s.compareApply}</button>
    </div>
  </section>;
}
