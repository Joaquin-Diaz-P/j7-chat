import { readFile } from 'node:fs/promises';
export async function readUtf8(path: string) {
  const bytes = await readFile(path);
  if (bytes.includes(0)) throw new Error('El archivo no es texto UTF-8');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('El archivo no es texto UTF-8'); }
}
