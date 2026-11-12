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

// Every web permission is denied except copying to the clipboard and, for the bar alone, the
// microphone: the voice wave reads its loudness while Hex dictates (never recording it).
export function allowPermission(permission: string, mediaTypes: readonly string[] | undefined, fromBar: boolean): boolean {
  if (permission === 'clipboard-sanitized-write') return true;
  return permission === 'media' && fromBar && !!mediaTypes?.length && mediaTypes.every(type => type === 'audio');
}
