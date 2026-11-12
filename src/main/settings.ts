import type { ProviderId } from './providers/types.js';
import { validateDisabledProviders } from '../shared/connections.js';
import { isAccelerator } from "../shared/shortcut.js";
import { canonicalModelKey } from "../shared/model-key.js";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
export interface Position {
  x: number;
  y: number;
}
export interface Settings {
  disabledProviders: ProviderId[];
  firstRunDone: boolean;
  openAtLogin: boolean;
  shortcut: string;
  captureShortcut: string;
  voiceModifier: string;
  pinned: boolean;
  historyOpen: boolean;
  theme: "system" | "light" | "dark";
  positionsVersion: 2;
  positions: Record<string, Position>;
  favorites: string[];
  effortByModel: Record<string, string>;
  lastModel: string | null;
  personalInstructions: string;
}
export function validateSettings(value: unknown): Settings {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const positions: Record<string, Position> = {};
  if (v.positions && typeof v.positions === "object")
    for (const [id, p] of Object.entries(v.positions)) {
      if (
        p &&
        typeof p === "object" &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y)
      )
        positions[id] = { x: Math.round(p.x) + (v.positionsVersion === 2 ? 0 : 340), y: Math.round(p.y) + (v.positionsVersion === 2 ? 0 : 88) };
    }
  return {
    disabledProviders: validateDisabledProviders(v.disabledProviders),
    effortByModel: Object.fromEntries(Object.entries(v.effortByModel && typeof v.effortByModel === "object" ? v.effortByModel : {}).filter((entry): entry is [string,string] => typeof entry[1] === "string" && /^[a-z0-9_-]{1,40}$/i.test(entry[1])).map(([key, value]) => [canonicalModelKey(key), value])),
    firstRunDone: v.firstRunDone === true,
    openAtLogin: v.openAtLogin !== false,
    shortcut: isAccelerator(v.shortcut) ? v.shortcut : "Alt+Space",
    captureShortcut: isAccelerator(v.captureShortcut) ? v.captureShortcut : "Alt+Shift+J",
    voiceModifier: typeof v.voiceModifier === "string" && /^(?:(?:left|right)-(?:option|command|shift|control)|fn)$/.test(v.voiceModifier) ? v.voiceModifier : "right-option",
    historyOpen: v.historyOpen === true,
    pinned: typeof v.pinned === "boolean" ? v.pinned : false,
    theme: v.theme === "light" || v.theme === "dark" ? v.theme : "system",
    positionsVersion: 2,
    positions,
    favorites: Array.isArray(v.favorites) ? [...new Set(v.favorites.filter((id): id is string => typeof id === "string"))] : [],
    lastModel: typeof v.lastModel === "string" ? canonicalModelKey(v.lastModel) : !("lastModel" in v) && typeof v.defaultModel === "string" ? canonicalModelKey(v.defaultModel) : null,
    personalInstructions: typeof v.personalInstructions === "string" ? v.personalInstructions.slice(0,4000) : "",
  };
}
export class SettingsStore {
  value: Settings;
  constructor(private path: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      raw = {};
    }
    this.value = validateSettings(raw);
    this.save();
  }
  update(value: Partial<Settings>) {
    this.value = validateSettings({ ...this.value, ...value });
    this.save();
  }
  private save() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path + ".tmp", JSON.stringify(this.value, null, 2), {
      mode: 0o600,
    });
    renameSync(this.path + ".tmp", this.path);
  }
}
