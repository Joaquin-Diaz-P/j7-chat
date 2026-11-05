import { describe, expect, it } from "vitest";
import claude from "./fixtures/claude-events.json" with { type: "json" };
import codex from "./fixtures/codex-events.json" with { type: "json" };
import gemini from "./fixtures/gemini-events.json" with { type: "json" };
import opencode from "./fixtures/opencode-events.json" with { type: "json" };
import { translateClaudeEvent } from "../src/main/providers/claude.js";
import { translateCodexEvent } from "../src/main/providers/codex.js";
import { translateGeminiEvent } from "../src/main/providers/gemini.js";
import {
  translateOpenCodeEvent,
  parseSse,
} from "../src/main/providers/opencode.js";
import { object } from "../src/main/providers/runtime.js";

describe("captured Claude protocol", () => {
  it("streams text without repeating the final assistant snapshot", () => {
    const output = claude.flatMap(translateClaudeEvent);
    const text = output
      .filter((event) => event.type === "text-delta")
      .map((event) => event.text)
      .join("");
    expect(text).toContain("J7 42");
    expect(text).toContain("47");
    expect(text).toContain("El faro violeta cuenta 47 estrellas.");
    expect(output.filter((event) => event.type === "done")).toHaveLength(10);
    expect(
      translateClaudeEvent({
        type: "assistant",
        message: { content: [{ type: "text", text: "already streamed" }] },
      }),
    ).toEqual([]);
  });
  it("maps the actual session initialization and checks inventories", () => {
    const init = claude.find((event) => event.type === "system")!;
    expect(translateClaudeEvent(init)).toEqual([
      { type: "session", nativeSessionId: "session-redacted" },
    ]);
    const inits = claude.filter((event) => event.type === "system").map(object);
    expect(
      inits.every(
        (event) =>
          Array.isArray(event.mcp_servers) && event.mcp_servers.length === 0,
      ),
    ).toBe(true);
    expect(
      inits.every(
        (event) => Array.isArray(event.skills) && event.skills.length === 0,
      ),
    ).toBe(true);
    expect(
      inits.some(
        (event) => JSON.stringify(event.tools) === '["WebFetch","WebSearch"]',
      ),
    ).toBe(true);
  });
  it("emits actual web result URLs", () => {
    const web = claude
      .flatMap(translateClaudeEvent)
      .filter((event) => event.type === "web-search");
    expect(
      web.some((event) => event.urls.some((url) => url.includes("nodejs.org"))),
    ).toBe(true);
  });
});
describe("captured Codex JSON-RPC", () => {
  it("maps deltas, session and successful completion", () => {
    const events = codex.flatMap(translateCodexEvent);
    expect(events.some((event) => event.type === "session")).toBe(true);
    expect(
      events
        .filter((event) => event.type === "text-delta")
        .map((event) => event.text)
        .join(""),
    ).toContain("J7 42");
    expect(events.filter((event) => event.type === "done")).toHaveLength(10);
  });
  it("reads URLs from results, rather than assuming action contains them", () => {
    const raw = codex.find(
      (raw) =>
        object(object(object(raw).params).item).type === "webSearch" &&
        object(raw).method === "item/completed",
    )!;
    const event = translateCodexEvent(raw)[0];
    expect(event?.type).toBe("web-search");
    if (event?.type === "web-search") {
      expect(event.query).toBe("site:nodejs.org latest stable Node.js release");
      expect(event.urls).toContain("https://nodejs.org/en/download/current");
      expect(event.urls.length).toBeGreaterThan(5);
    }
  });
  it("never marks failed/interrupted turns as done", () => {
    expect(
      translateCodexEvent({
        method: "turn/completed",
        params: { turn: { status: "interrupted" } },
      })[0],
    ).toMatchObject({ type: "error", kind: "other" });
    expect(
      translateCodexEvent({
        method: "turn/completed",
        params: { turn: { status: "failed", error: { message: "quota" } } },
      })[0],
    ).toMatchObject({ type: "error", kind: "quota" });
    expect(
      translateCodexEvent({
        method: "error",
        params: { willRetry: true, error: { message: "429" } },
      }),
    ).toEqual([]);
  });
});
describe("captured Gemini ACP", () => {
  it("records advertised binary/PDF input and the real service rejection", () => {
    const init = gemini
      .map(object)
      .find((raw) => object(raw.result).agentCapabilities);
    expect(
      object(object(object(init?.result).agentCapabilities).promptCapabilities),
    ).toMatchObject({ image: true, embeddedContext: true });
    expect(
      gemini
        .flatMap(translateGeminiEvent)
        .some(
          (event) =>
            event.type === "error" &&
            event.kind === "unsupported" &&
            event.message.includes("Antigravity"),
        ),
    ).toBe(true);
  });
  // Synthetic transport samples below are deliberately separate from real captures:
  // this account is rejected before Gemini can stream inference.
  it("maps synthetic ACP text and thought chunks", () => {
    expect(
      translateGeminiEvent({
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hola" },
        },
      }),
    ).toEqual([{ type: "text-delta", text: "Hola" }]);
    expect(
      translateGeminiEvent({
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Pensando" },
        },
      }),
    ).toEqual([{ type: "thinking-delta", text: "Pensando" }]);
  });
  it("maps synthetic web tool output URLs", () =>
    expect(
      translateGeminiEvent({
        update: {
          sessionUpdate: "tool_call_update",
          kind: "search",
          rawOutput: "https://example.org/news",
        },
      }),
    ).toEqual([{ type: "web-search", urls: ["https://example.org/news"] }]));
});
describe("OpenCode V2 SSE", () => {
  it("maps the real provider.free-limit failure without leaking its raw response", () => {
    const events = opencode.flatMap((raw) => translateOpenCodeEvent(raw));
    expect(
      events.some((event) => event.type === "error" && event.kind === "quota"),
    ).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });
  it("maps synthetic V2 streaming and web tool correlation", () => {
    const tools = new Map<string, string>();
    expect(
      translateOpenCodeEvent({
        type: "session.text.delta",
        data: { delta: "Hola" },
      }),
    ).toEqual([{ type: "text-delta", text: "Hola" }]);
    expect(
      translateOpenCodeEvent({
        type: "session.reasoning.delta",
        data: { delta: "Pienso" },
      }),
    ).toEqual([{ type: "thinking-delta", text: "Pienso" }]);
    translateOpenCodeEvent(
      {
        type: "session.tool.input.started",
        data: { id: "tool-1", name: "websearch" },
      },
      tools,
    );
    expect(
      translateOpenCodeEvent(
        {
          type: "session.tool.success",
          data: {
            id: "tool-1",
            content: [{ type: "text", text: "https://example.org" }],
          },
        },
        tools,
      ),
    ).toEqual([{ type: "web-search", urls: ["https://example.org"] }]);
    expect(
      translateOpenCodeEvent({ type: "session.execution.succeeded" }),
    ).toEqual([{ type: "done" }]);
  });
  it.each(["\n", "\r\n"])(
    "decodes split UTF-8 and SSE frame boundaries (%j)",
    async (newline) => {
      const bytes = new TextEncoder().encode(
        'data: {"text":"á"}\n\ndata: {"done":true}\n\n'.replaceAll(
          "\n",
          newline,
        ),
      );
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i++)
            controller.enqueue(bytes.slice(i, i + 1));
          controller.close();
        },
      });
      const result = [];
      for await (const value of parseSse(stream)) result.push(value);
      expect(result).toEqual([{ text: "á" }, { done: true }]);
    },
  );
});
