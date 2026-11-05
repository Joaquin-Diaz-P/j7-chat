import { contextBridge, ipcRenderer } from "electron";
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
  snapshot: () => ipcRenderer.invoke("chat:snapshot"),
  send: (text) => ipcRenderer.invoke("chat:send", text),
  stop: () => ipcRenderer.invoke("chat:stop"),
  newChat: () => ipcRenderer.invoke("chat:new"),
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
