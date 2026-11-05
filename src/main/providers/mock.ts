import { strings as s } from "../../renderer/strings.js";
import type { ChatProvider, ChatEvent, TurnInput, ModelInfo } from "./types.js";
export class MockProvider implements ChatProvider {
  readonly id = "mock" as const;
  async getStatus() {
    return { state: "ready" as const };
  }
  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "mock",
        label: "Mock",
        provider: "mock",
        supportsImages: false,
        supportsPdf: false,
        supportsEffort: true,
      },
    ];
  }
  async *runTurn(input: TurnInput): AsyncIterable<ChatEvent> {
    const error = input.text.match(/\/err (auth|quota|unsupported|other)/)?.[1];
    if (error) {
      yield {
        type: "error",
        kind: error as "auth" | "quota" | "unsupported" | "other",
        message: s.mockError + error,
      };
      return;
    }
    if (input.text.includes("/web"))
      yield {
        type: "web-search",
        urls: ["https://example.com"],
        query: s.mockSearch,
      };
    const thinking = input.text.includes("/think");
    const text = input.text.includes("/md")
      ? s.mockMarkdown
      : thinking
        ? s.mockReasoning
        : input.text.includes("/slow")
          ? s.mockSlow.repeat(80)
          : s.mockResponse;
    try {
      for (const chunk of text.match(/.{1,8}|\n/g) ?? []) {
        await wait(input.text.includes("/slow") ? 140 : 20, input.signal);
        yield { type: thinking ? "thinking-delta" : "text-delta", text: chunk };
      }
    } catch {
      if (input.signal.aborted) return;
      throw new Error("Mock timer failed");
    }
    if (thinking && !input.signal.aborted) yield { type: "text-delta", text: s.mockThoughtAnswer };
    if (!input.signal.aborted) yield { type: "done" };
  }
  async dispose() {}
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
