import { readFile } from "node:fs/promises";
import type { TurnInput } from "../providers/types.js";
import { extractPdfText } from "./pdf.js";
import { extname } from "node:path";
import { extractOfficeText, OFFICE_EXTENSIONS } from "./office.js";

export async function textWithAttachments(
  input: TurnInput,
  nativePdf: boolean,
): Promise<string> {
  let text = input.text;
  for (const attachment of input.attachments) {
    if (attachment.kind === "text") {
      const extension = extname(attachment.name).slice(1).toLowerCase();
      const extracted = attachment.extractedText ?? (OFFICE_EXTENSIONS.includes(extension)
        ? (await extractOfficeText(attachment.path, extension)).text
        : await readFile(attachment.path, "utf8"));
      text += `\n\nAdjunto de texto (${attachment.name}):\n${extracted}`;
    }
    if (attachment.kind === "pdf" && !nativePdf) {
      const extracted =
        attachment.extractedText === undefined
          ? await extractPdfText(attachment.path)
          : { text: attachment.extractedText, truncated: false };
      text += `\n\nTexto del PDF adjunto (${attachment.name}):\n${extracted.text}`;
      if (extracted.truncated)
        text += "\n[AVISO: J7 recortó el texto del PDF a 400000 caracteres.]";
    }
  }
  return text;
}
