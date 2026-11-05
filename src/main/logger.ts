import {
  mkdirSync,
  statSync,
  renameSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
export type LogEvent =
  | "effort-adjusted"
  | "startup"
  | "shutdown"
  | "shortcut-failed"
  | "renderer-failed"
  | "turn-start"
  | "turn-end"
  | "settings-failed";
// Deliberately accepts no arbitrary payloads: prompts, tokens and protocol data cannot enter logs.
export function createLogger(data: string) {
  const directory = join(data, "logs");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "main.log");
  return (event: LogEvent) => {
    try {
      if (statSync(path).size >= 5 * 1024 * 1024) {
        rmSync(path + ".1", { force: true });
        renameSync(path, path + ".1");
      }
    } catch {}
    appendFileSync(path, `${new Date().toISOString()} ${event}\n`, {
      mode: 0o600,
    });
  };
}
