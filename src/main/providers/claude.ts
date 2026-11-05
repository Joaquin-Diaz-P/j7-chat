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
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnInput } from "./types.js";

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

export class ClaudeProvider extends BaseProvider {
  readonly id = "claude" as const;
  private query: Query | undefined;
  private prompts: AsyncQueue<SDKUserMessage> | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private key = "";
  private sessionId: string | undefined;
  private pump: Promise<void> | undefined;
  private async connect(input?: TurnInput) {
    const key = JSON.stringify([
      input?.instructions ?? buildChatInstructions(),
      input?.webSearch ?? false,
      input?.effort ?? "normal",
    ]);
    if (
      this.query &&
      input &&
      (this.key !== key ||
        (input && this.sessionId && !input.nativeSessionId) ||
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
    const webTools = input?.webSearch ? ["WebSearch", "WebFetch"] : [];
    this.query = query({
      prompt: this.prompts,
      options: {
        pathToClaudeCodeExecutable: await this.binary(),
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
          message: "J7 rechaza los pedidos de permiso.",
        }),
        includePartialMessages: true,
        persistSession: true,
        ...(input
          ? {
              model: input.model,
              effort:
                input.effort === "high" ? ("high" as const) : ("low" as const),
            }
          : {}),
        ...(input?.nativeSessionId ? { resume: input.nativeSessionId } : {}),
        extraArgs: {
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
                  "Claude inició con herramientas no permitidas. Se bloqueó el turno.",
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
      throw new ProviderError("auth", "Inicia sesión con claude auth login.");
    // API-key accounts must never be used by this app.
    if (account.apiKeySource && account.apiKeySource !== "none")
      throw new ProviderError(
        "auth",
        "J7 requiere una sesión de suscripción de Claude, sin API key.",
      );
  }
  async listModels(): Promise<ModelInfo[]> {
    return (await (await this.connect()).supportedModels()).map((model) => ({
      id: model.value,
      label: model.displayName,
      provider: this.id,
      supportsImages: true,
      supportsPdf: true,
      supportsEffort: model.supportsEffort ?? false,
    }));
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    const connection = await this.connect(input);
    const account = await connection.accountInfo();
    if (
      !account.subscriptionType ||
      account.apiProvider !== "firstParty" ||
      (account.apiKeySource && account.apiKeySource !== "none")
    )
      throw new ProviderError(
        "auth",
        "J7 requiere una sesión de suscripción de Claude, sin API key.",
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
  }
}
