import { strings as s } from "../../renderer/strings.js";
import type { ChatProvider, ChatEvent, TurnInput, ModelInfo } from "./types.js";
export class MockProvider implements ChatProvider {
  constructor(readonly id: "mock" | "mock-a" | "mock-b" = "mock") {}
  private sessions = new Map<string, string[]>();
  private sequence = 0;
  private crashed = false;
  async getStatus() {
    if (process.env.J7_MOCK_UNAVAILABLE?.split(",").includes(this.id)) return { state: "not_installed" as const };
    return { state: "ready" as const };
  }
  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: this.id === "mock" ? "mock-a" : this.id,
        label: this.id === "mock-b" ? s.mockB : s.mockA,
        provider: this.id,
        supportsImages: false,
        supportsPdf: false,
        supportsEffort: this.id !== "mock-b",
      },
    ];
  }
  async *runTurn(input: TurnInput): AsyncIterable<ChatEvent> {
    const history = input.nativeSessionId ? this.sessions.get(input.nativeSessionId) : [];
    if (!history) { yield { type: "error", kind: "other", message: s.responseFailed, recovery: "session" }; return; }
    const session = input.nativeSessionId ?? `${this.id}-${++this.sequence}`;
    this.sessions.set(session, history);
    yield { type: "session", nativeSessionId: session };
    const command = input.text.split(`${s.recapEnd}\n\n`).at(-1)!;
    if (command.includes("/crash-always") || (command.includes("/crash") && !this.crashed)) {
      this.crashed = true;
      yield { type: "error", kind: "other", message: s.processFailed, recovery: "process" };
      return;
    }
    if (command.includes("/lose-session") && input.nativeSessionId) {
      this.sessions.delete(input.nativeSessionId);
      yield { type: "error", kind: "other", message: s.responseFailed, recovery: "session" };
      return;
    }
    const error = command.match(/\/err (auth|quota|unsupported|other)/)?.[1];
    if (error) {
      yield {
        type: "error",
        kind: error as "auth" | "quota" | "unsupported" | "other",
        message: s.mockError + error,
      };
      return;
    }
    if (input.webSearch && command.includes("/web"))
      yield {
        type: "web-search",
        urls: ["https://example.com"],
        query: s.mockSearch,
      };
    const thinking = !command.includes("/echo-context") && (command.includes("/think") || input.effort === "high");
    const text = command.includes("/echo-context") ? input.text
      : command.includes("/md")
      ? s.mockMarkdown
      : thinking
        ? s.mockReasoning
        : command.includes("/slow")
          ? s.mockSlow.repeat(80)
          : s.mockResponse;
    history.push(input.text);
    try {
      for (const chunk of text.match(/[\s\S]{1,8}/g) ?? []) {
        await wait(command.includes("/slow") ? 140 : 20, input.signal);
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
