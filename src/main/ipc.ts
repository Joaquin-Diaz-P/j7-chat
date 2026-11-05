import { ipcMain } from "electron";
import type { Panel } from "./window.js";
import type { ChatService } from "./chat/service.js";
export function registerIpc(panel: Panel, chat: ChatService) {
  const trusted = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
  ) =>
    event.sender === panel.window.webContents &&
    event.senderFrame === panel.window.webContents.mainFrame;
  ipcMain.handle("chat:snapshot", (event) => {
    if (trusted(event)) return chat.snapshot();
  });
  ipcMain.handle("chat:send", (event, text: unknown) => {
    if (trusted(event) && typeof text === "string" && text.length <= 100_000)
      chat.send(text);
  });
  ipcMain.handle("chat:stop", (event) => {
    if (trusted(event)) chat.stop();
  });
  ipcMain.handle("chat:new", (event) => {
    if (trusted(event)) chat.newChat();
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
