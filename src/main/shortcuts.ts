import { strings as s } from "../renderer/strings.js";
import { globalShortcut, Notification } from "electron";
import type { LogEvent } from "./logger.js";
export function registerShortcut(
  shortcut: string,
  toggle: () => void,
  log: (event: LogEvent) => void,
) {
  let registered = false;
  try {
    registered = globalShortcut.register(shortcut, toggle);
  } catch {}
  if (!registered) {
    log("shortcut-failed");
    new Notification({
      title: s.appName,
      body: s.shortcutFailed,
    }).show();
  }
  return registered;
}
