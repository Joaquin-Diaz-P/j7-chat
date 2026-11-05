import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(path: string, maxCharacters = 400_000) {
  const start = performance.now();
  const document = await getDocumentProxy(new Uint8Array(await readFile(path)));
  try {
    const result = await extractText(document, { mergePages: false });
    const hasText = result.text.some(page => page.trim().length > 0);
    let text = ''; let sentPages = 0;
    for (const page of result.text) {
      if ((text + page + '\n').length > maxCharacters) break;
      text += page + '\n'; sentPages++;
    }
    return {
      text: text.slice(0, maxCharacters),
      pages: result.totalPages, sentPages, hasText,
      truncated: sentPages < result.totalPages,
      durationMs: performance.now() - start,
    };
  } finally {
    await document.loadingTask.destroy();
  }
}
