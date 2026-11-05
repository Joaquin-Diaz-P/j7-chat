import { strings as s } from "../../renderer/strings.js";
import { clipboard, dialog, ipcMain, net, protocol, nativeImage } from 'electron';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Panel } from '../window.js';
import { AttachmentStore, TEXT_EXTENSIONS } from './index.js';
export function registerAttachments(panel: Panel, store: AttachmentStore) {
  protocol.handle('j7-file', async request => {
    try {
      return await net.fetch(pathToFileURL(await store.resolveUrl(request.url)).href);
    } catch { return new Response(null, { status: 404 }); }
  });
  let busy = false;
  ipcMain.handle('attachments:action', async (event, action: unknown, value: unknown, count: unknown) => {
    if (event.sender !== panel.window.webContents || event.senderFrame !== panel.window.webContents.mainFrame || busy) return [];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 10) throw new Error('Cantidad inválida');
    busy = true;
    let temporary: string | undefined;
    try {
      if (action === 'preview' && typeof value === 'string') { try { const path=await store.resolve(value); await access(path); panel.window.previewFile(path); } catch { await dialog.showMessageBox(panel.window,{type:'error',message:s.attachmentMissing}); } return []; }
      let paths: string[] = [];
      if (action === 'files' && Array.isArray(value)) {
        if (count + value.length > 10) throw new Error('Hasta 10 adjuntos por mensaje');
        for (const entry of value) {
          if (typeof entry === 'string') paths.push(entry);
          else if (entry instanceof Uint8Array) {
            if (entry.length > 20 * 1024 * 1024) throw new Error('El tamaño máximo es 20 MB');
            temporary ??= await mkdtemp(join(tmpdir(), 'j7-drop-'));
            const image = nativeImage.createFromBuffer(Buffer.from(entry));
            if (image.isEmpty()) throw new Error('Imagen inválida');
            const path = join(temporary, `Imagen-${paths.length + 1}.png`);
            await writeFile(path, image.toPNG()); paths.push(path);
          } else throw new Error('Adjunto inválido');
        }
      }
      if (action === 'dialog') {
        panel.suppressHide = true;
        const result = await dialog.showOpenDialog(panel.window, { properties: ['openFile','multiSelections'], filters: [{ name: 'Adjuntos', extensions: ['png','jpg','jpeg','gif','webp','heic','pdf', ...TEXT_EXTENSIONS] }] });
        paths = result.filePaths;
      }
      if (action === 'paste') {
        const items = await clipboard.read();
        for (const item of items) {
          // Electron exposes copied Finder files as text/uri-list.
          const format = item.types.find(type => type === 'text/uri-list' || type.includes('public.file-url') || type.includes('public/file-url'));
          if (format) {
            const payload = await item.getType(format);
            if (!('text' in payload)) continue;
            const urls = await payload.text();
            paths.push(...urls.split(/[\r\n\0]+/).filter(url => url.startsWith('file://')).map(url => fileURLToPath(url)));
          }
        }
        if (!paths.length) {
          const item = items.find(entry => entry.types.includes('image/png'));
          if (item) { temporary = await mkdtemp(join(tmpdir(), 'j7-paste-')); const path = join(temporary, 'Pegado.png'); await writeFile(path, new Uint8Array(await (await item.getType('image/png')).arrayBuffer())); paths = [path]; }
        }
      }
      if (action === 'data' && value instanceof Uint8Array) {
        if (value.length > 20 * 1024 * 1024) throw new Error('El tamaño máximo es 20 MB');
        temporary = await mkdtemp(join(tmpdir(), 'j7-drop-')); const path = join(temporary, 'Imagen.png'); const image = nativeImage.createFromBuffer(Buffer.from(value));
        if (image.isEmpty()) throw new Error('Imagen inválida');
        await writeFile(path, image.toPNG()); paths = [path];
      }
      if (action === 'capture') {
        panel.suppressHide = true;
        temporary = await mkdtemp(join(tmpdir(), 'j7-capture-')); const path = join(temporary, 'Captura.png');
        panel.window.hide();
        try { await promisify(execFile)('/usr/sbin/screencapture', ['-i','-x',path]); await access(path); paths = [path]; } catch { paths = []; }
        finally { panel.window.show(); panel.window.focus(); }
      }
      return await store.ingest(paths, count);
    } finally { panel.suppressHide = false; busy = false; if (temporary) await rm(temporary, { recursive: true, force: true }); }
  });
}
