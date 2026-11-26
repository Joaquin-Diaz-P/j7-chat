import { readFile, realpath, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { AttachmentStore } from './index.js';

// Codex runs with its CODEX_HOME and cwd inside this data directory. Never delete an
// arbitrary path supplied by a model, including a symlink escaping that directory.
export async function storeGeneratedImage(item: Record<string, unknown>, dataDirectory: string) {
  let source: string | undefined;
  try {
    const candidate = typeof item.savedPath === 'string' ? item.savedPath : typeof item.result === 'string' && isAbsolute(item.result) ? item.result : undefined;
    if (candidate) {
      const resolved = await realpath(candidate), root = await realpath(dataDirectory);
      const child = relative(root, resolved);
      if (child.startsWith('..') || isAbsolute(child) || !['workspace/', 'providers/codex/'].some(prefix => child.startsWith(prefix))) throw new Error('Imagen fuera de los datos de J7');
      source = resolved;
    }
    const bytes = source ? await readFile(source) : Buffer.from(String(item.result ?? ''), 'base64');
    return await new AttachmentStore(join(dataDirectory, 'attachments')).addGenerated(bytes);
  } finally {
    // Codex saves one folder per thread; rmdir only removes it once it is empty.
    if (source) { await unlink(source).catch(() => {}); if (basename(dirname(dirname(source))) === 'generated_images') await rmdir(dirname(source)).catch(() => {}); }
  }
}
