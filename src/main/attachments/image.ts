import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function normalizeImage(path: string, heic: boolean) {
  const destination = heic ? path.replace(/\.heic$/i, '.jpg') : path;
  await exec('/usr/bin/sips', [...(heic ? ['-s', 'format', 'jpeg'] : []), '-Z', '2000', path, '--out', destination]);
  return destination;
}
