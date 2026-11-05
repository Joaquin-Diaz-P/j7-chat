import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "../src/main/attachments/pdf.js";
import { textWithAttachments } from "../src/main/attachments/content.js";
import { buildChatInstructions } from "../src/main/chat/instructions.js";
const path = fileURLToPath(
  new URL("./fixtures/attachments/j7-30-pages.pdf", import.meta.url),
);
describe("PDF attachment fallback", () => {
  it("extracts every page without silent truncation", async () => {
    const pdf = await extractPdfText(path);
    expect(pdf.pages).toBe(30);
    expect(pdf.truncated).toBe(false);
    expect(pdf.text).toContain("El faro violeta cuenta 47 estrellas.");
    expect(pdf.text).toContain("pagina 30 de 30");
  });
  it("reports deliberate truncation", async () => {
    const pdf = await extractPdfText(path, 25);
    expect(pdf.truncated).toBe(true);
    expect(pdf.text).toHaveLength(0);
    expect(pdf.sentPages).toBe(0);
  });
  it("passes extracted text for non-native models and omits it for native PDF", async () => {
    const input = {
      model: "test",
      effort: "normal" as const,
      webSearch: false,
      instructions: buildChatInstructions(),
      text: "Pregunta",
      attachments: [
        {
          kind: "pdf" as const,
          path,
          name: "test.pdf",
          mime: "application/pdf",
          extractedText: "Texto extraído",
        },
      ],
      signal: new AbortController().signal,
    };
    expect(await textWithAttachments(input, false)).toContain("Texto extraído");
    expect(await textWithAttachments(input, true)).toBe("Pregunta");
  });
});
