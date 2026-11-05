import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, unlink, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import sharp from 'sharp';
import { AttachmentStore, validateFile } from '../src/main/attachments/index.js';
import { extractPdfText } from '../src/main/attachments/pdf.js';
import { nativePdf, prepareAttachments } from '../src/main/attachments/policy.js';
const dirs: string[] = [];
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'j7-attachments-test-')); dirs.push(dir); return dir; }
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
describe('attachment ingestion', () => {
  it('enforces extensions, sizes and count before processing', async () => {
    expect(() => validateFile('x.docx', 1)).toThrow('.docx');
    expect(() => validateFile('x.png', 25 * 1024 * 1024)).toThrow('20 MB');
    expect(() => validateFile('x.pdf', 51 * 1024 * 1024)).toThrow('50 MB');
    expect(() => validateFile('x.txt', 3 * 1024 * 1024)).toThrow('2 MB');
    expect(validateFile('a.tsx', 2).kind).toBe('text');
    await expect(new AttachmentStore(await directory()).ingest(Array(11).fill('x.txt'))).rejects.toThrow('10 adjuntos');
  });
  it('copies UTF-8 text, survives original deletion, rejects invalid UTF-8', async () => {
    const dir = await directory(); const source = join(dir, 'original.txt');
    await writeFile(source, 'á texto'); const store = new AttachmentStore(join(dir, 'attachments'));
    const [file] = await store.ingest([source]); await unlink(source);
    expect(await readFile(await store.resolve(file!.id!), 'utf8')).toBe('á texto');
    expect(file!.path).toMatch(/attachments\/.*-original.txt$/);
    await writeFile(source, Buffer.from([0xff, 0xfe]));
    await expect(store.ingest([source])).rejects.toThrow('UTF-8');
    await expect(store.resolve('../original.txt')).rejects.toThrow();
    expect(await store.resolveUrl(`j7-file://attachment/${file!.id}`)).toBe(await realpath(file!.path));
    for (const url of ['j7-file://attachment/../../secret', 'j7-file://elsewhere/secret', 'file:///etc/passwd', `j7-file://attachment/${file!.id}?path=/etc/passwd`]) await expect(store.resolveUrl(url)).rejects.toThrow();
    await unlink(file!.path); await symlink(source, file!.path);
    await expect(store.resolve(file!.id!)).rejects.toThrow('Ruta');
  });
  it('shrinks images and converts actual HEIC with sips', async () => {
    const dir = await directory(); const png = join(dir, 'large.png');
    await sharp({ create: { width: 3000, height: 1000, channels: 3, background: 'red' } }).png().toFile(png);
    const store = new AttachmentStore(join(dir, 'attachments'));
    const [image] = await store.ingest([png]);
    expect((await sharp(image!.path).metadata()).width).toBe(2000);
    const heic = join(dir, 'sample.heic');
    await promisify(execFile)('/usr/bin/sips', ['-s','format','heic',png,'--out',heic]);
    const [converted] = await store.ingest([heic]);
    expect(converted!.mime).toBe('image/jpeg');
    expect((await sharp(converted!.path).metadata()).format).toBe('jpeg');
  });
  it('cuts PDF at page boundaries and uses native PDFs only within verified limits', async () => {
    const path = 'tests/fixtures/attachments/j7-30-pages.pdf';
    const complete = await extractPdfText(path, 400_000);
    const cut = await extractPdfText(path, 200);
    expect(complete.pages).toBe(30); expect(complete.hasText).toBe(true);
    expect(cut.sentPages).toBeGreaterThan(0); expect(cut.sentPages).toBeLessThan(30); expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(200);
    const file = { kind: 'pdf' as const, name: 'a.pdf', path, mime: 'application/pdf', pages: 30, extractedText: complete.text };
    const model = { id: 'test', label: 'test', provider: 'claude' as const, supportsPdf: true, supportsImages: true, supportsEffort: false };
    expect(nativePdf(file, model)).toBe(true);
    expect(nativePdf({ ...file, pages: 31 }, model)).toBe(false);
    expect(prepareAttachments([file], { ...model, supportsPdf: false })[0]?.extractedText).toContain('<documento nombre="a.pdf" paginas="30">');
    expect(() => prepareAttachments([{ ...file, kind: 'image' }], { ...model, supportsImages: false })).toThrow('no ve imágenes');
  });
});
it('recognizes a PDF without text as scanned', async () => {
  const dir = await directory(); const path = join(dir, 'scanned.pdf');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await writeFile(path, pdf);
  const [file] = await new AttachmentStore(join(dir, 'attachments')).ingest([path]);
  expect(file?.pages).toBe(1); expect(file?.hasText).toBe(false);
});
