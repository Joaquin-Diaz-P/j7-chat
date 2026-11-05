import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  J7Api,
  ChatEnvelope,
  ChatSnapshot,
  PanelState,
} from "../shared/ipc.js";
function subscribe<T>(channel: string, callback: (value: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, value: T) =>
    callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}
const api: J7Api = {
  captureAction: action => ipcRenderer.invoke("capture:action", action),
  onCapture: callback => subscribe("capture:event", callback),
  snapshot: () => ipcRenderer.invoke("chat:snapshot"),
  send: (text, ids) => ipcRenderer.invoke("chat:send", text, ids),
  filePath: file => webUtils.getPathForFile(file),
  attachments: (action, value, count = 0) => ipcRenderer.invoke("attachments:action", action, value, count),
  stop: () => ipcRenderer.invoke("chat:stop"),
  newChat: () => ipcRenderer.invoke("chat:new"),
  selectChat: (id) => ipcRenderer.invoke("chat:select", id),
  updateChat: (options) => ipcRenderer.invoke("chat:update", options),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  refreshModels: () => ipcRenderer.invoke("models:refresh"),
  favorite: (model) => ipcRenderer.invoke("models:favorite", model),
  setDefaultModel: (model) => ipcRenderer.invoke("models:default", model),
  retry: () => ipcRenderer.invoke("chat:retry"),
  edit: (text) => ipcRenderer.invoke("chat:edit", text),
  askOther: (model) => ipcRenderer.invoke("chat:other", model),
  hide: () => ipcRenderer.send("window:hide"),
  ready: () => ipcRenderer.send("window:ready"),
  setContentHeight: (height) =>
    ipcRenderer.send("window:setContentHeight", height),
  setPinned: (pinned) => ipcRenderer.send("window:setPinned", pinned),
  onChat: (callback) => subscribe<ChatEnvelope>("chat:event", callback),
  onSnapshot: (callback) => subscribe<ChatSnapshot>("chat:snapshot", callback),
  onPanel: (callback) => subscribe<PanelState>("window:state", callback),
};
contextBridge.exposeInMainWorld("j7", api);
