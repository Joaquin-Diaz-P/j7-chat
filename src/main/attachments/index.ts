import { copyFile, mkdir, stat, realpath, unlink, readdir } from 'node:fs/promises';
import { basename, extname, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Attachment } from '../providers/types.js';
import { normalizeImage } from './image.js';
import { readUtf8 } from './text.js';
import { extractPdfText } from './pdf.js';
const images = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic']);
export const TEXT_EXTENSIONS = ['txt','md','csv','json','js','ts','tsx','py','html','css','xml','yaml','yml','sh','sql','jsx','mjs','cjs','c','h','cpp','rs','go','swift','rb','toml','log','ini'];
export function validateFile(name: string, size: number) {
  if (/^\.env(?:\.|$)/i.test(basename(name))) throw new Error('Archivo de entorno no permitido');
  const extension = extname(name).slice(1).toLowerCase();
  const kind = images.has(extension) ? 'image' : extension === 'pdf' ? 'pdf' : TEXT_EXTENSIONS.includes(extension) ? 'text' : undefined;
  if (!kind) throw new Error(`J7 todavía no puede leer archivos .${extension}`);
  const maximum = kind === 'image' ? 20 : kind === 'pdf' ? 50 : 2;
  if (size > maximum * 1024 * 1024) throw new Error(`El tamaño máximo es ${maximum} MB`);
  return { kind, extension } as const;
}
export class AttachmentStore {
  readonly files = new Map<string, Attachment>();
  constructor(readonly directory: string, private persistence?: import('../chat/sqlite-store.js').SqliteChatStore) {
    for (const file of persistence?.attachments() ?? []) this.files.set(file.id!,file);
  }
  async cleanup(now = Date.now()) {
    await mkdir(this.directory,{recursive:true});
    const known = new Set((this.persistence?.attachments() ?? [...this.files.values()]).map(f=>f.path));
    for (const name of await readdir(this.directory)) {
      const path=join(this.directory,name), info=await stat(path);
      if(info.isFile() && !known.has(path) && now-info.mtimeMs>86400000) await unlink(path);
    }
  }
  async ingest(paths: string[], existing = 0) {
    if (existing + paths.length > 10) throw new Error('Hasta 10 adjuntos por mensaje');
    const result: Attachment[] = [];
    try {
      for (const source of paths) result.push(await this.add(source));
      return result;
    } catch (error) {
      for (const file of result) { this.files.delete(file.id!); await unlink(file.path).catch(() => {}); }
      throw error;
    }
  }
  private async add(source: string): Promise<Attachment> {
    const info = await stat(source);
    if (!info.isFile()) throw new Error('Selecciona un archivo');
    const { kind, extension } = validateFile(source, info.size);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    let path = join(this.directory, `${id}-${basename(source)}`);
    await copyFile(source, path);
    try {
      const file: Attachment = { id, kind, path, name: basename(source), mime: kind === 'pdf' ? 'application/pdf' : kind === 'text' ? 'text/plain' : `image/${['jpg','jpeg','heic'].includes(extension) ? 'jpeg' : extension}` };
      if (kind === 'image') { const normalized = await normalizeImage(path, extension === 'heic'); if (normalized !== path) await unlink(path); path = normalized; file.path = path; }
      if (kind === 'text') file.extractedText = await readUtf8(path);
      if (kind === 'pdf') { const pdf = await extractPdfText(path, 400_000); file.extractedText = pdf.text; file.pages = pdf.pages; file.sentPages = pdf.sentPages; file.hasText = pdf.hasText; file.truncated = pdf.truncated; }
      this.files.set(id, file); return file;
    } catch (error) { await unlink(path).catch(() => {}); throw error; }
  }
  async resolveUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'j7-file:' || url.hostname !== 'attachment' || url.search || url.hash || !/^\/[a-f0-9-]{36}$/.test(url.pathname)) throw new Error('Ruta de adjunto no permitida');
    return this.resolve(url.pathname.slice(1));
  }
  async resolve(id: string) {
    const file = this.persistence?.getAttachment(id) ?? this.files.get(id);
    if (!file) throw new Error('Adjunto desconocido');
    const path = await realpath(file.path);
    if (dirname(path) !== await realpath(this.directory)) throw new Error('Ruta de adjunto no permitida');
    return path;
  }
}
