import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Attachment, ModelInfo } from '../providers/types.js';
import { extractOfficeImages, extractOfficeText, OFFICE_EXTENSIONS, OFFICE_NOTE } from './office.js';

const exec = promisify(execFile);
interface Manifest { version: 1; images: { number: number; file: string; mime: string }[]; failed: number[] }
const pending = new Map<string, Promise<Manifest>>();

// Extracted images are cached next to the copied original, so retries reuse them.
export const officeMediaDirectory = (path: string) => `${path}.media`;

async function extract(file: Attachment, extension: string): Promise<Manifest> {
  const directory = officeMediaDirectory(file.path);
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Manifest;
    if (manifest.version === 1) { await Promise.all(manifest.images.map(image => stat(join(directory, image.file)))); return manifest; }
  } catch { /* Not extracted yet, or the cache is incomplete. */ }
  const temporary = `${directory}.${process.pid}.${Date.now()}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true, mode: 0o700 });
  try {
    const manifest: Manifest = { version: 1, images: [], failed: [] };
    for (const image of await extractOfficeImages(file.path, extension)) {
      if (!image.data) { manifest.failed.push(image.number); continue; }
      const source = join(temporary, `source-${image.number}${extname(image.name).toLowerCase()}`);
      const jpeg = /\.(jpe?g|jpe)$/i.test(image.name), output = `imagen-${image.number}.${jpeg ? 'jpg' : 'png'}`;
      await writeFile(source, image.data);
      try {
        await exec('/usr/bin/sips', ['-s', 'format', jpeg ? 'jpeg' : 'png', '-Z', '2000', source, '--out', join(temporary, output)]);
        await stat(join(temporary, output));
        manifest.images.push({ number: image.number, file: output, mime: jpeg ? 'image/jpeg' : 'image/png' });
      } catch { manifest.failed.push(image.number); }
      finally { await rm(source, { force: true }); }
    }
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest));
    await rm(directory, { recursive: true, force: true });
    await rename(temporary, directory);
    return manifest;
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}

function manifestFor(file: Attachment, extension: string) {
  let job = pending.get(file.path);
  if (!job) { job = extract(file, extension).finally(() => pending.delete(file.path)); pending.set(file.path, job); }
  return job;
}

// Word and PowerPoint become their text (with chart data) plus their embedded images for vision models.
export async function expandOfficeAttachments(files: Attachment[], model: Pick<ModelInfo, 'supportsImages'>): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const file of files) {
    const extension = extname(file.name).slice(1).toLowerCase();
    if (file.kind !== 'text' || !OFFICE_EXTENSIONS.includes(extension)) { result.push(file); continue; }
    let text = file.extractedText, imageCount: number | undefined;
    // Attachments saved before charts and images were supported get re-read from the local copy.
    if (!text?.startsWith(OFFICE_NOTE)) {
      try { const extracted = await extractOfficeText(file.path, extension); text = extracted.text; imageCount = extracted.imageCount; }
      catch { /* Keep the text saved when the file was attached. */ }
    }
    const marked = !!text && /\[Imagen \d+/.test(text);
    const notes: string[] = [];
    const images: Attachment[] = [];
    if (marked && model.supportsImages) {
      try {
        const manifest = await manifestFor(file, extension), directory = officeMediaDirectory(file.path);
        for (const image of manifest.images) images.push({ kind: 'image', path: join(directory, image.file), name: `${file.name} · Imagen ${image.number}`, mime: image.mime });
        if (images.length) notes.push(`[J7: Las imágenes de este documento se adjuntan aparte, en orden: ${manifest.images.map(image => `Imagen ${image.number}`).join(', ')}.]`);
        if (manifest.failed.length) notes.push(`[J7: No se pudieron preparar estas imágenes: ${manifest.failed.map(number => `Imagen ${number}`).join(', ')}.]`);
      } catch { notes.push('[J7: No se pudieron preparar las imágenes de este documento; solo se envía el texto.]'); }
    } else if (marked || imageCount) notes.push('[J7: Este modelo no ve imágenes; las imágenes del documento no se enviaron.]');
    result.push({ ...file, ...(text !== undefined ? { extractedText: notes.length ? `${text}\n${notes.join('\n')}` : text } : {}) }, ...images);
  }
  return result;
}
