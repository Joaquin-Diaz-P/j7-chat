import { ipcMain, protocol } from 'electron';
import { ArtifactRegistry } from './artifact-registry.js';
import { fromMainFrame } from './ipc-trust.js';
import type { Panel } from './window.js';
const registry = new ArtifactRegistry();
export function registerArtifactProtocol() {
  const origin = process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : 'file:';
  protocol.handle('j7-artifact', request => registry.respond(request.url, origin, request.method));
}
export function registerArtifacts(panel: Panel) {
  const owner = panel.window.webContents.id;
  ipcMain.handle('artifact:register', (event, html: unknown) => {
    if (!fromMainFrame(panel.window, event)) throw new Error('Origen inválido');
    return registry.register(owner, html);
  });
  ipcMain.handle('artifact:release', (event, url: unknown) => {
    if (fromMainFrame(panel.window, event)) registry.release(owner, url);
  });
  panel.window.webContents.on('render-process-gone', () => registry.clear(owner));
  panel.window.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) registry.clear(owner); });
  panel.window.on('closed', () => registry.clear(owner));
}
