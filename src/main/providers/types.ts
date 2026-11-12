export type ProviderId = "mock" | "mock-a" | "mock-b" | "claude" | "codex" | "gemini" | "opencode";

export interface ProviderStatus {
  state: "ready" | "not_installed" | "not_authenticated" | "error";
  detail?: string;
}

export type Effort = string;

export interface ModelInfo {
  reasoningEfforts?: string[];
  id: string;
  label: string;
  provider: ProviderId;
  supportsImages: boolean;
  supportsPdf: boolean;
  supportsEffort: boolean;
  free?: boolean;
}

export interface Attachment {
  id?: string;
  pages?: number;
  sentPages?: number;
  hasText?: boolean;
  truncated?: boolean;
  kind: "image" | "pdf" | "text";
  path: string;
  name: string;
  mime: string;
  extractedText?: string;
}

export interface TurnInput {
  model: string;
  effort: Effort;
  webSearch: boolean;
  instructions: string;
  nativeSessionId?: string;
  text: string;
  attachments: Attachment[];
  signal: AbortSignal;
}

export type ChatEvent =
  | { type: "session"; nativeSessionId: string }
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "web-search"; query?: string; urls: string[] }
  | { type: "done" }
  | {
      type: "error";
      kind: "auth" | "quota" | "unsupported" | "other";
      message: string;
      recovery?: "session" | "process";
    };

export type TurnHint = Pick<TurnInput, "model" | "effort" | "webSearch" | "instructions">;

export interface ChatProvider {
  id: ProviderId;
  getStatus(): Promise<ProviderStatus>;
  connectionAccount?(): { email?: string; plan?: string } | undefined;
  listModels(): Promise<ModelInfo[]>;
  runTurn(input: TurnInput): AsyncIterable<ChatEvent>;
  /** Starts a fresh session with these options, so the first turn of a new chat doesn't wait for the program to start. */
  prepare?(hint: TurnHint): Promise<void>;
  dispose(): Promise<void>;
  shutdown?(): Promise<void>;
}
