import { describe, expect, it } from "vitest";
import { codeText, normalizeMath, splitBlocks } from "../src/renderer/markdown.js";
describe("math normalization", () => {
  it("normalizes both delimiters while preserving dollar notation", () => {
    expect(normalizeMath(String.raw`\(a\) and \[\frac{a}{b}\] $x$`)).toBe("$a$ and \n$$\n\\frac{a}{b}\n$$\n $x$");
  });
  it("preserves fenced, inline and indented code including unfinished fences", () => {
    for (const text of ["```tex\n\\(x\\)\n```\n", "~~~\n\\[x\\]\n~~~\n", "`\\(x\\)`", "    \\(x\\)\n", "```\n\\(x\\)"]) expect(normalizeMath(text)).toBe(text);
  });
});
describe("stream blocks", () => {
  it("keeps completed sources stable as the tail grows (memo comparison)", () => {
    const first = splitBlocks("First\n\nSecond");
    const next = splitBlocks("First\n\nSecond extended");
    expect(first[0]).toEqual({source: "First\n\n", complete: true});
    expect(next[0]?.source).toBe(first[0]?.source);
    expect(next.at(-1)?.source).toBe("Second extended");
    expect(next.map(b => b.source).join("")).toBe("First\n\nSecond extended");
  });
  it("keeps display math together across blank lines", () => {
    expect(splitBlocks("\\[a\n\n+b\\]")).toHaveLength(1);
    expect(splitBlocks("$$a\n\n+b$$")).toHaveLength(1);
  });
  it("never splits inside a fence, list, table or reference context", () => {
    for (const text of ["```ts\nfoo\n\nbar\n```", "- a\n\n- b", "|a|b|\n|-|-|\n|c|d|", "[link][ref]\n\n[ref]: https://example.com"]) expect(splitBlocks(text)).toHaveLength(1);
  });
});
it("copies exact code, preserving whitespace and intentional final newlines", () => {
  expect(codeText("  const x = 1;\n\tfoo();\n")).toBe("  const x = 1;\n\tfoo();");
  expect(codeText("x\n\n")).toBe("x\n");
});
it("keeps reasoning separate through the service and renderer store", async () => {
  const { ChatService } = await import("../src/main/chat/service.js");
  const { useChat } = await import("../src/renderer/store.js");
  const provider = {
    id: "mock" as const,
    getStatus: async () => ({ state: "ready" as const }),
    listModels: async () => [],
    async *runTurn() {
      yield { type: "thinking-delta" as const, text: "private reasoning" };
      yield { type: "text-delta" as const, text: "answer" };
    },
    dispose: async () => {},
  };
  let finish!: () => void;
  const complete = new Promise<void>(resolve => { finish = resolve; });
  const service = new ChatService(provider, envelope => useChat.getState().event(envelope), snapshot => { useChat.getState().setSnapshot(snapshot); if (!snapshot.active) finish(); });
  service.send("question");
  await complete;
  expect(service.snapshot().messages.at(-1)).toMatchObject({ text: "answer", thinking: "private reasoning", status: "complete" });
  await service.dispose();
  useChat.getState().setSnapshot({ chatId: "chat", active: true, messages: [{ id: "reply", role: "assistant", text: "", status: "streaming" }] });
  for (const event of [{ type: "thinking-delta" as const, text: "reason" }, { type: "text-delta" as const, text: "answer" }]) useChat.getState().event({ chatId: "chat", messageId: "reply", event });
  expect(useChat.getState().messages[0]).toMatchObject({ text: "answer", thinking: "reason" });
});
it("renders single-line dollar and bracket formulas as katex display blocks", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Markdown } = await import("react-markdown");
  const { default: math } = await import("remark-math");
  const { default: katex } = await import("rehype-katex");
  for (const source of ["$$E=mc^2$$", String.raw`\[\frac{a}{b}\]`]) {
    const html = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [math], rehypePlugins: [katex], children: normalizeMath(source) }));
    expect(html).toContain('class="katex-display"');
  }
  for (const source of ["`$$x$$`", "```tex\n$$x$$\n```", "    $$x$$\n"]) expect(normalizeMath(source)).toBe(source);
});
