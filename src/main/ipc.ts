import { ipcMain } from "electron";
import { showSettingsNotice } from "./tray.js";
import type { Panel } from "./window.js";
import type { ChatService } from "./chat/service.js";
import type { AttachmentStore } from "./attachments/index.js";
export function registerIpc(panel: Panel, chat: ChatService, attachments: AttachmentStore) {
  const trusted = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
  ) =>
    event.sender === panel.window.webContents &&
    event.senderFrame === panel.window.webContents.mainFrame;
  ipcMain.handle("chat:snapshot", (event) => {
    if (trusted(event)) return chat.snapshot();
  });
  ipcMain.handle("chat:send", (event, text: unknown, ids: unknown = []) => {
    if (trusted(event) && typeof text === "string" && text.length <= 100_000 && Array.isArray(ids) && ids.length <= 10) {
      const files = ids.map(id => attachments.files.get(String(id)));
      if (files.some(f => !f)) throw new Error("Adjunto desconocido");
      chat.send(text, files.filter(f => f !== undefined));
    }
  });
  ipcMain.handle("chat:stop", (event) => {
    if (trusted(event)) chat.stop();
  });
  ipcMain.handle("chat:new", (event) => {
    if (trusted(event)) chat.newChat();
  });
  ipcMain.handle("chat:select", (event, id: unknown) => {
    if (trusted(event) && typeof id === "string") chat.selectChat(id);
  });
  ipcMain.handle("chat:update", (event, options: unknown) => {
    if (!trusted(event) || !options || typeof options !== "object") return;
    const value = options as Record<string, unknown>;
    chat.updateChat({
      ...(typeof value.model === "string" ? { model: value.model } : {}),
      ...(typeof value.webSearch === "boolean" ? { webSearch: value.webSearch } : {}),
      ...(value.effort === "normal" || value.effort === "high" ? { effort: value.effort } : {}),
    });
  });
  ipcMain.handle("settings:open", (event) => { if (trusted(event)) return showSettingsNotice(panel); });
  ipcMain.handle("models:refresh", (event) => {
    if (trusted(event)) { void chat.catalog.refresh(true).catch(() => {}); chat.notify(); }
  });
  ipcMain.handle("models:favorite", (event, key: unknown) => {
    if (trusted(event) && typeof key === "string") chat.catalog.favorite(key);
  });
  ipcMain.handle("models:default", (event, key: unknown) => {
    if (trusted(event) && typeof key === "string") chat.catalog.setDefault(key);
  });
  ipcMain.handle("chat:retry", (event) => { if (trusted(event)) chat.retry(); });
  ipcMain.handle("chat:edit", (event, text: unknown) => {
    if (trusted(event) && typeof text === "string" && text.length <= 100_000) chat.edit(text);
  });
  ipcMain.handle("chat:other", (event, key: unknown) => {
    if (trusted(event) && typeof key === "string") chat.askOther(key);
  });
  ipcMain.on("window:hide", (event) => {
    if (trusted(event)) panel.hide();
  });
  ipcMain.on("window:ready", (event) => {
    if (trusted(event)) panel.rendererReady();
  });
  ipcMain.on("window:setContentHeight", (event, height: unknown) => {
    if (trusted(event) && typeof height === "number") panel.setHeight(height);
  });
  ipcMain.on("window:setPinned", (event, pinned: unknown) => {
    if (trusted(event) && typeof pinned === "boolean") panel.setPinned(pinned);
  });
}
