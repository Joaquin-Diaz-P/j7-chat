import { strings as s } from "../../renderer/strings.js";
import {
  query,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import { textWithAttachments } from "../attachments/content.js";
import { buildChatInstructions } from "../chat/instructions.js";
import {
  AsyncQueue,
  BaseProvider,
  cleanEnvironment,
  object,
  privateHome,
  ProviderError,
  urlsIn,
  classifyError,
  resumeError,
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnHint, TurnInput } from "./types.js";

export function translateClaudeEvent(raw: unknown): ChatEvent[] {
  const message = object(raw);
  if (
    message.type === "system" &&
    message.subtype === "init" &&
    typeof message.session_id === "string"
  )
    return [{ type: "session", nativeSessionId: message.session_id }];
  if (message.type === "stream_event") {
    const event = object(message.event),
      delta = object(event.delta);
    if (
      event.type === "content_block_delta" &&
      delta.type === "text_delta" &&
      typeof delta.text === "string"
    )
      return [{ type: "text-delta", text: delta.text }];
    if (
      event.type === "content_block_delta" &&
      delta.type === "thinking_delta" &&
      typeof delta.thinking === "string"
    )
      return [{ type: "thinking-delta", text: delta.thinking }];
  }
  if (message.type === "user") {
    const content = object(message.message).content;
    if (Array.isArray(content)) {
      const urls = urlsIn(
        content.filter((block) => object(block).type === "tool_result"),
      );
      if (urls.length) return [{ type: "web-search", urls }];
    }
  }
  if (message.type === "assistant") {
    const content = object(message.message).content;
    if (Array.isArray(content))
      return content.flatMap((block) => {
        const item = object(block);
        if (
          item.type === "tool_use" &&
          (item.name === "WebSearch" || item.name === "WebFetch")
        ) {
          const query = object(item.input).query;
          return [
            {
              type: "web-search" as const,
              ...(typeof query === "string" ? { query } : {}),
              urls: urlsIn(item.input),
            },
          ];
        }
        return [];
      });
  }
  if (message.type === "result") {
    if (message.is_error === true)
      return [
        classifyError(
          new Error(
            JSON.stringify(message.errors ?? message.result ?? message.subtype),
          ),
        ),
      ];
    return [{ type: "done" }];
  }
  return [];
}

// CLI 2.1.309's help and SDK 0.3.318 omit Ultracode, but the installed
// binary explicitly handles "--effort ultracode" ("/effort <level> turns it off").
// Pass it through extraArgs because the SDK effort union cannot represent it.
export function claudeEfforts(model: {value: string; displayName?: string; description?: string; supportsEffort?: boolean; supportedEffortLevels?: string[]}): string[] {
 const values = model.supportedEffortLevels ?? (model.supportsEffort ? (model.value.includes("opus") ? ["low","medium","high","xhigh","max"] : ["low","medium","high"]) : []);
 // The catalog id can be an alias ("opus", "default"), so match the display name too.
 return /opus[ -.]?5[-.]5/i.test(`${model.value} ${model.displayName ?? ""} ${model.description ?? ""}`) && values.length ? [...new Set([...values,"ultracode"])] : values;
}
export class ClaudeProvider extends BaseProvider {
  readonly id = "claude" as const;
  private query: Query | undefined;
  private prompts: AsyncQueue<SDKUserMessage> | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private key = "";
  private sessionId: string | undefined;
  private pump: Promise<void> | undefined;
  // A process that already answered holds that chat's conversation; an unused one can start any new chat.
  private used = false;
  private async connect(input?: TurnHint & Pick<TurnInput, "nativeSessionId">) {
    const key = JSON.stringify([
      input?.instructions ?? buildChatInstructions(),
      input?.webSearch ?? false,
      input?.effort ?? "low",
    ]);
    if (
      this.query &&
      input &&
      (this.key !== key ||
        (this.used && !input.nativeSessionId) ||
        (input?.nativeSessionId && this.sessionId !== input.nativeSessionId))
    )
      await this.dispose();
    if (this.query) {
      if (input) await this.query.setModel(input.model);
      return this.query;
    }
    const start = performance.now(),
      paths = await privateHome(this.id, this.options);
    this.prompts = new AsyncQueue<SDKUserMessage>();
    this.key = key;
    this.used = false;
    const webTools = input?.webSearch ? ["WebSearch", "WebFetch"] : [];
    const binary = await this.binary();
    this.assertOpen();
    this.query = query({
      prompt: this.prompts,
      options: {
        pathToClaudeCodeExecutable: binary,
        cwd: paths.workspace,
        env: {
          ...cleanEnvironment(this.options.environment),
          CLAUDE_CODE_SAFE_MODE: "1",
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
          CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: "1",
        },
        systemPrompt: input?.instructions ?? buildChatInstructions(),
        settingSources: [],
        skills: [],
        plugins: [],
        settings: {
          disableAllHooks: true,
          enabledPlugins: {
            "cc-plugin-agents-md@builtin": false,
            "cc-plugin-telemetry@builtin": false,
            "cc-plugin-plugin-authoring@builtin": false,
          },
        },
        tools: webTools,
        allowedTools: webTools,
        mcpServers: {},
        strictMcpConfig: true,
        permissionMode: "dontAsk",
        canUseTool: async () => ({
          behavior: "deny",
          message: s.permissionDenied,
        }),
        includePartialMessages: true,
        persistSession: true,
        ...(input
          ? {
              model: input.model,
              ...(input.effort === "ultracode" ? {} : {effort:
                input.effort as "low" | "medium" | "high" | "xhigh" | "max"}),
            }
          : {}),
        ...(input?.nativeSessionId ? { resume: input.nativeSessionId } : {}),
        extraArgs: {
          ...(input?.effort === "ultracode" ? {effort: "ultracode"} : {}),
          "safe-mode": null,
          "disable-slash-commands": null,
          "system-prompt-snapshot": "off",
        },
      },
    });
    const active = this.query;
    this.pump = (async () => {
      try {
        for await (const message of active) {
          this.raw(message);
          if (message.type === "system" && message.subtype === "init") {
            const init = object(message);
            const tools = Array.isArray(init.tools)
              ? (init.tools as string[])
              : [];
            this.diagnostic({
              type: "tools",
              tools,
              mcpServers: init.mcp_servers,
              plugins: init.plugins,
              skills: init.skills,
            });
            if (
              tools.some((tool) => !webTools.includes(tool)) ||
              (Array.isArray(init.mcp_servers) && init.mcp_servers.length)
            ) {
              this.events?.push({
                type: "error",
                kind: "unsupported",
                message:
                  s.claudeUnsafeTools,
              });
              this.events?.end();
              active.close();
              break;
            }
            this.sessionId = message.session_id;
          }
          for (const event of translateClaudeEvent(message)) {
            this.events?.push(event);
            if (event.type === "done" || event.type === "error")
              this.events?.end();
          }
        }
      } catch (error) {
        this.events?.push(classifyError(error));
      } finally {
        this.events?.end();
        if (this.query === active) this.query = undefined;
      }
    })();
    await active.initializationResult();
    this.diagnostic({ type: "startup", durationMs: performance.now() - start });
    return active;
  }
  protected async checkAuth() {
    const account = await (await this.connect()).accountInfo();
    if (!account.subscriptionType || account.apiProvider !== "firstParty")
      throw new ProviderError("auth", s.claudeLogin);
    // API-key accounts must never be used by this app.
    if (account.apiKeySource && account.apiKeySource !== "none")
      throw new ProviderError(
        "auth",
        s.subscriptionRequired,
      );
  }
  async listModels(): Promise<ModelInfo[]> {
    return (await (await this.connect()).supportedModels()).filter(model => model.value !== "default").map((model) => ({
      id: model.value,
      label: model.displayName,
      provider: this.id,
      supportsImages: true,
      supportsPdf: true,
      // Prefer SDK metadata. Fallback for older SDK catalogs: Opus gets all SDK
      // levels, other effort-capable families low/medium/high.
      reasoningEfforts: claudeEfforts(model),
      supportsEffort: model.supportsEffort ?? false,
    }));
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    let connection: Query;
    try { connection = await this.connect(input); }
    catch (error) { yield input.nativeSessionId ? resumeError(error) : classifyError(error); return; }
    const account = await connection.accountInfo();
    if (
      !account.subscriptionType ||
      account.apiProvider !== "firstParty" ||
      (account.apiKeySource && account.apiKeySource !== "none")
    )
      throw new ProviderError(
        "auth",
        s.subscriptionRequired,
      );
    const events = new AsyncQueue<ChatEvent>();
    this.events = events;
    if (this.sessionId)
      events.push({ type: "session", nativeSessionId: this.sessionId });
    const content: Exclude<
      Extract<SDKUserMessage["message"], { role: "user" }>["content"],
      string
    > = [{ type: "text", text: await textWithAttachments(input, true) }];
    for (const attachment of input.attachments) {
      if (attachment.kind === "image")
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: attachment.mime as "image/png",
            data: (await readFile(attachment.path)).toString("base64"),
          },
        });
      if (attachment.kind === "pdf")
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: (await readFile(attachment.path)).toString("base64"),
          },
        });
    }
    const abort = () => {
      void connection.interrupt().catch(() => {});
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      this.used = true;
      this.prompts!.push({
        type: "user",
        session_id: this.sessionId ?? "",
        parent_tool_use_id: null,
        message: { role: "user", content },
      });
      yield* events;
    } finally {
      input.signal.removeEventListener("abort", abort);
      this.events = undefined;
    }
  }
  async dispose() {
    const active = this.query;
    this.query = undefined;
    this.prompts?.end();
    active?.close();
    await this.pump;
    this.sessionId = undefined;
    this.used = false;
  }
  async prepare(hint: TurnHint) {
    if (!this.busy) await this.connect(hint);
  }
}
