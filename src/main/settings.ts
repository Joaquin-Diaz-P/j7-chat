import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
export interface Position {
  x: number;
  y: number;
}
export interface Settings {
  shortcut: string;
  pinned: boolean;
  theme: "system" | "light" | "dark";
  positions: Record<string, Position>;
  favorites: string[];
  defaultModel: string | null;
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
        positions[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  return {
    shortcut:
      typeof v.shortcut === "string" &&
      /^(?:(?:Alt|Option|Command|Cmd|CommandOrControl|Control|Ctrl|Shift)\+)+[A-Za-z0-9]$/.test(
        v.shortcut,
      )
        ? v.shortcut
        : "Alt+J",
    pinned: typeof v.pinned === "boolean" ? v.pinned : false,
    theme: v.theme === "light" || v.theme === "dark" ? v.theme : "system",
    positions,
    favorites: Array.isArray(v.favorites) ? [...new Set(v.favorites.filter((id): id is string => typeof id === "string"))] : [],
    defaultModel: typeof v.defaultModel === "string" ? v.defaultModel : null,
    personalInstructions: typeof v.personalInstructions === "string" ? v.personalInstructions : "",
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
