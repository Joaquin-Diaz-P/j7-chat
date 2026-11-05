import { describe, expect, it } from "vitest";
import { buildRecap, RECAP_LIMIT } from "../../src/main/chat/recap.js";
import type { Message } from "../../src/shared/ipc.js";
import type { Attachment } from "../../src/main/providers/types.js";
const m = (id: string, role: Message["role"], text: string, extra: Partial<Message> = {}): Message => ({ id, role, text, status: "complete", ...extra });
const image = (name: string): Attachment => ({ kind: "image", name, path: `/tmp/${name}`, mime: "image/png" });
describe("F2 literal recap", () => {
  it("includes only GPT's unseen exchange when Claude returns", () => {
    const messages = [m("1", "user", "me llamo Ana"), m("2", "assistant", "Hola Ana", { modelLabel: "Haiku" }), m("n", "notice", "changed"), m("3", "user", "¿cómo me llamo?"), m("4", "assistant", "Ana", { modelLabel: "GPT-6-Luna" })];
    expect(buildRecap(messages, "2").text).toBe("[Contexto de J7 Chat: en esta conversación hubo mensajes con otros modelos que no viste. Transcripción:]\nUsuario: ¿cómo me llamo?\nAsistente (GPT-6-Luna): Ana\n[Fin del contexto]\n\n");
    expect(buildRecap(messages, "4")).toEqual({ text: "", attachments: [] });
    expect(buildRecap(messages, "missing").text).toContain("me llamo Ana");
    expect(buildRecap([])).toEqual({ text: "", attachments: [] });
  });
  it("keeps text and PDF extraction while context fits, and keeps names when it does not", () => {
    const file: Attachment = { kind: "pdf", path: "/tmp/report.pdf", name: "report.pdf", mime: "application/pdf", extractedText: "extracted text" };
    const text: Attachment = { ...file, kind: "text", name: "note.txt" };
    const messages = [m("1", "user", "question", { attachments: [file, text] })];
    const recap = buildRecap(messages);
    expect(recap.text).toContain("[adjunto: report.pdf]\nextracted text");
    expect(recap.text).toContain("[adjunto: note.txt]\nextracted text");
    file.extractedText = "X".repeat(RECAP_LIMIT);
    const large = buildRecap(messages);
    expect(large.text).toContain("[adjunto: report.pdf]");
    expect(large.text).not.toContain("XXXX");
    expect(large.text.length).toBeLessThanOrEqual(RECAP_LIMIT);
  });
  it("caps oversized transcripts at exactly 100k and explicitly reports truncation", () => {
    const recap = buildRecap([m("1", "user", "A".repeat(110_000)), m("2", "assistant", "recent answer")]);
    expect(recap.text.length).toBe(RECAP_LIMIT);
    expect(recap.text).toContain("recortada");
    expect(recap.text).toContain("recent answer");
    expect(recap.text.endsWith("[Fin del contexto]\n\n")).toBe(true);
  });
  it("reattaches images only from the last four messages when supported", () => {
    const messages = Array.from({ length: 8 }, (_, i) => m(String(i), i % 2 ? "assistant" : "user", "message", { attachments: [image(`${i}.png`)] }));
    expect(buildRecap(messages, undefined, true).attachments.map(a => a.name)).toEqual(["4.png", "5.png", "6.png", "7.png"]);
    expect(buildRecap(messages, "5", true).attachments.map(a => a.name)).toEqual(["6.png", "7.png"]);
    expect(buildRecap(messages).attachments).toEqual([]);
    expect(messages[4]?.attachments?.[0]?.name).toBe("4.png");
  });
  it("does not mutate the transcript or duplicate the seen exchange", () => {
    const messages = [m("1", "user", "$raw$\ncode\n"), m("2", "assistant", "**markdown**", { model: "codex:luna" })];
    const copy = structuredClone(messages);
    expect(buildRecap(messages).text).toContain("Usuario: $raw$\ncode\n");
    expect(buildRecap(messages, "1").text).toContain("Asistente (codex:luna): **markdown**");
    expect(messages).toEqual(copy);
  });
});
it("does not count model-change notices against the four-message image window", () => {
  const messages = [m("1", "user", "image", { attachments: [image("one.png")] }), m("2", "assistant", "answer"), m("n", "notice", "model change"), m("3", "user", "next"), m("4", "assistant", "answer")];
  expect(buildRecap(messages, undefined, true).attachments.map(a => a.name)).toEqual(["one.png"]);
});
