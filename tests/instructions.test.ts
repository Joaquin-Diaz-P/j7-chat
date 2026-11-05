import { describe, expect, it } from "vitest";
import {
  BASE_CHAT_INSTRUCTIONS,
  buildChatInstructions,
} from "../src/main/chat/instructions.js";
describe("chat instructions", () => {
  it("defines identity, boundaries, Markdown and language", () => {
    for (const text of [
      "J7 Chat",
      "No eres un agente de programación",
      "No tienes acceso a archivos",
      "terminal",
      "Markdown",
      "idioma del usuario",
      "deshabilitada no busques",
    ])
      expect(BASE_CHAT_INSTRUCTIONS).toContain(text);
  });
  it("keeps the base when personal instructions are blank", () =>
    expect(buildChatInstructions(" \n ")).toBe(BASE_CHAT_INSTRUCTIONS));
  it("appends personal instructions without replacing the base", () =>
    expect(buildChatInstructions("  Usa ejemplos breves. \n")).toBe(
      `${BASE_CHAT_INSTRUCTIONS}\n\nInstrucciones personales del usuario:\nUsa ejemplos breves.`,
    ));
});
