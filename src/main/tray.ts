import { Hex, hotkeyConflicts } from "./voice/hex.js";
import { strings as s } from "../renderer/strings.js";
import { app, Tray, Menu, nativeImage, dialog } from "electron";
import { fileURLToPath } from "node:url";
import type { Panel } from "./window.js";
import type { SettingsStore } from "./settings.js";
export function createTray(panel: Panel, settings: SettingsStore) {
  const icon = nativeImage.createFromPath(
    fileURLToPath(new URL("../../assets/iconTemplate.png", import.meta.url)),
  );
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip(s.appName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: s.openApp,
        accelerator: settings.value.shortcut,
        click: () => panel.show(),
      },
      {
        label: s.settings,
        click: () => { void showSettingsNotice(panel); },
      },
      { type: "separator" },
      { label: s.quitApp, click: () => app.quit() },
    ]),
  );
  return tray;
}

export async function showSettingsNotice(panel: Panel) {
  panel.suppressHide = true;
  try {
    await dialog.showMessageBox({ type: "info", title: s.appName, message: s.settingsLater + (hotkeyConflicts(panel.voiceModifier, await new Hex().hotkey()) ? "\n\n" + s.hexConflict : ""), buttons: [s.accept] });
  } finally { panel.suppressHide = false; }
}
