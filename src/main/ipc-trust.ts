import type { BrowserWindow } from 'electron';
// Messages can still arrive while a window is closing (for example on quit). Reading a destroyed
// window or its webContents throws, so treat those messages as untrusted instead of crashing main.
export function fromMainFrame(window: Pick<BrowserWindow, 'webContents'> & Partial<Pick<BrowserWindow, 'isDestroyed'>> | undefined, event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  try {
    if (!window || window.isDestroyed?.()) return false;
    const contents = window.webContents;
    return !contents.isDestroyed?.() && event.sender === contents && event.senderFrame === contents.mainFrame;
  } catch { return false; }
}
