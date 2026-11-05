import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(path: string, maxCharacters = 200_000) {
  const start = performance.now();
  const document = await getDocumentProxy(new Uint8Array(await readFile(path)));
  try {
    const result = await extractText(document, { mergePages: true });
    const text = result.text;
    return {
      text: text.slice(0, maxCharacters),
      pages: result.totalPages,
      truncated: text.length > maxCharacters,
      durationMs: performance.now() - start,
    };
  } finally {
    await document.loadingTask.destroy();
  }
}
