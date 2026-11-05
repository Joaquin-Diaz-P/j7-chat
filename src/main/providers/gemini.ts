import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type ContentBlock,
  type NewSessionResponse,
  type InitializeResponse,
} from "@agentclientprotocol/sdk/unstable";
import { Readable, Writable } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { textWithAttachments } from "../attachments/content.js";
import { buildChatInstructions } from "../chat/instructions.js";
import {
  AsyncQueue,
  BaseProvider,
  cleanEnvironment,
  linkExisting,
  object,
  privateHome,
  ProviderError,
  urlsIn,
  classifyError,
  stopChild,
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnInput } from "./types.js";

export function geminiSettings(
  webSearch: boolean,
  model: string,
  effort: string,
) {
  return {
    security: { auth: { selectedType: "oauth-personal" } },
    tools: {
      core: webSearch ? ["google_web_search", "web_fetch"] : [],
      exclude: [],
      autoAccept: false,
    },
    context: {
      fileName: [],
      discoveryMaxDirs: 0,
      loadMemoryFromIncludeDirectories: false,
    },
    mcpServers: {},
    hooksConfig: { enabled: false },
    skills: { enabled: false },
    general: {
      enableAutoUpdate: false,
      enableAutoUpdateNotification: false,
      enablePromptCompletion: false,
    },
    telemetry: { enabled: false },
    modelConfigs: {
      customOverrides: [
        {
          match: { model },
          modelConfig: {
            generateContentConfig: {
              thinkingConfig: model.startsWith("gemini-2.5")
                ? { thinkingBudget: effort === "high" ? 8192 : 0 }
                : { thinkingLevel: effort === "high" ? "HIGH" : "LOW" },
            },
          },
        },
      ],
    },
  };
}
export function translateGeminiEvent(raw: unknown): ChatEvent[] {
  const message = object(raw),
    update = object(message.update ?? object(message.params).update);
  if (message.error)
    return [classifyError(new Error(String(object(message.error).message)))];
  const content = object(update.content);
  if (
    update.sessionUpdate === "agent_message_chunk" &&
    content.type === "text" &&
    typeof content.text === "string"
  )
    return [{ type: "text-delta", text: content.text }];
  if (
    update.sessionUpdate === "agent_thought_chunk" &&
    content.type === "text" &&
    typeof content.text === "string"
  )
    return [{ type: "thinking-delta", text: content.text }];
  if (
    (update.sessionUpdate === "tool_call" ||
      update.sessionUpdate === "tool_call_update") &&
    (update.kind === "search" ||
      /google_web_search|web_fetch|search|fetch/i.test(String(update.title)))
  ) {
    const query = object(update.rawInput).query;
    return [
      {
        type: "web-search",
        ...(typeof query === "string" ? { query } : {}),
        urls: urlsIn(update.rawOutput ?? update.content ?? update.rawInput),
      },
    ];
  }
  return [];
}
interface GeminiSession extends NewSessionResponse {
  models?: { availableModels: { modelId: string; name: string }[] };
}

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini" as const;
  private child: ChildProcessWithoutNullStreams | undefined;
  private connection: ClientConnection | undefined;
  private key = "";
  private capabilities: InitializeResponse["agentCapabilities"];
  private nativePdf = false;
  private session: GeminiSession | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private async connect(input?: TurnInput) {
    const model = input?.model ?? "gemini-2.5-flash";
    const key = JSON.stringify([
      model,
      input?.effort ?? "normal",
      input?.webSearch ?? false,
      input?.instructions ?? buildChatInstructions(),
    ]);
    if (this.connection && input && this.key !== key) await this.dispose();
    if (this.connection) return this.connection;
    const start = performance.now(),
      paths = await privateHome(this.id, this.options);
    const config = join(paths.root, ".gemini");
    await mkdir(config, { recursive: true, mode: 0o700 });
    for (const file of ["oauth_creds.json", "google_accounts.json"])
      await linkExisting(
        join(paths.userHome, ".gemini", file),
        join(config, file),
      );
    try {
      await access(join(config, "oauth_creds.json"));
    } catch {
      throw new ProviderError(
        "auth",
        "Inicia sesión en Gemini desde la terminal con tu cuenta de Google.",
      );
    }
    const settings = geminiSettings(
      input?.webSearch ?? false,
      model,
      input?.effort ?? "normal",
    );
    await writeFile(join(config, "settings.json"), JSON.stringify(settings), {
      mode: 0o600,
    });
    const system = join(paths.root, "system.md");
    await writeFile(system, input?.instructions ?? buildChatInstructions(), {
      mode: 0o600,
    });
    const empty = join(paths.root, "empty-settings.json");
    await writeFile(empty, "{}", { mode: 0o600 });
    const child = spawn(
      await this.binary(),
      ["--acp", "--model", model, "--extensions", "none"],
      {
        cwd: paths.workspace,
        env: {
          ...cleanEnvironment(this.options.environment),
          GEMINI_CLI_HOME: paths.root,
          GEMINI_SYSTEM_MD: system,
          GEMINI_CLI_SYSTEM_SETTINGS_PATH: empty,
          GEMINI_CLI_SYSTEM_DEFAULTS_PATH: empty,
        },
        stdio: "pipe",
      },
    );
    this.child = child;
    this.key = key;
    child.stderr.on("data", () => {});
    child.on("error", (error) => {
      this.events?.push(classifyError(error));
      this.events?.end();
    });
    const app = client({ name: "J7 Chat" })
      .onRequest("session/request_permission", () => {
        this.diagnostic({ type: "permission-rejected" });
        return { outcome: { outcome: "cancelled" as const } };
      })
      .onRequest("*", () => {
        throw new Error(
          "J7 no permite acceder a archivos, terminal ni conectores.",
        );
      })
      .onNotification("session/update", ({ params }) => {
        this.raw(params);
        for (const event of translateGeminiEvent(params))
          this.events?.push(event);
      });
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    );
    const readable = stream.readable.pipeThrough(
      new TransformStream({
        transform: (message, controller) => {
          this.raw(message);
          controller.enqueue(message);
        },
      }),
    );
    const connection = app.connect({ ...stream, readable });
    this.connection = connection;
    child.on("exit", () => {
      connection.close();
      if (this.connection === connection) this.connection = undefined;
      this.events?.push({
        type: "error",
        kind: "other",
        message: "El proceso de Gemini terminó.",
      });
      this.events?.end();
    });
    try {
      const init = await connection.agent.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "j7_chat", version: "0.0.0" },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      });
      this.capabilities = init.agentCapabilities;
      this.nativePdf =
        init.agentCapabilities?.promptCapabilities?.embeddedContext ?? false;
      this.raw({
        type: "initialize",
        agentCapabilities: init.agentCapabilities,
      });
      this.diagnostic({
        type: "isolation",
        allowedTools: settings.tools.core,
        extensions: [],
        mcpServers: [],
        note: "ACP no publica inventario de herramientas; allowlist en settings.json.",
      });
      this.diagnostic({
        type: "startup",
        durationMs: performance.now() - start,
      });
      return connection;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  private async newSession(input?: TurnInput) {
    const connection = await this.connect(input),
      paths = await privateHome(this.id, this.options);
    if (!input && this.session) return { connection, session: this.session };
    if (
      input?.nativeSessionId &&
      this.session?.sessionId !== input.nativeSessionId
    ) {
      if (!this.capabilities?.loadSession)
        throw new ProviderError(
          "unsupported",
          "Esta versión de Gemini no permite retomar sesiones.",
        );
      const result = await connection.agent.request("session/load", {
        sessionId: input.nativeSessionId,
        cwd: paths.workspace,
        mcpServers: [],
      });
      this.session = { ...result, sessionId: input.nativeSessionId };
    } else if (!this.session || !input?.nativeSessionId) {
      this.session = await connection.agent.request<GeminiSession>(
        "session/new",
        { cwd: paths.workspace, mcpServers: [] },
      );
    }
    return { connection, session: this.session };
  }
  protected async checkAuth() {
    await this.newSession();
  }
  async listModels(): Promise<ModelInfo[]> {
    const { session } = await this.newSession();
    return (session.models?.availableModels ?? []).map((model) => ({
      id: model.modelId,
      label: model.name,
      provider: this.id,
      supportsImages: this.capabilities?.promptCapabilities?.image ?? false,
      supportsPdf: this.nativePdf,
      supportsEffort: /gemini-(2\.5|3)/.test(model.modelId),
    }));
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    const { connection, session } = await this.newSession(input);
    yield { type: "session", nativeSessionId: session.sessionId };
    const events = new AsyncQueue<ChatEvent>();
    this.events = events;
    const prompt: ContentBlock[] = [
      { type: "text", text: await textWithAttachments(input, this.nativePdf) },
    ];
    for (const attachment of input.attachments) {
      if (attachment.kind === "pdf" && this.nativePdf)
        prompt.push({
          type: "resource",
          resource: {
            uri: pathToFileURL(attachment.path).href,
            mimeType: "application/pdf",
            blob: (await readFile(attachment.path)).toString("base64"),
          },
        });
      if (attachment.kind === "image") {
        if (!this.capabilities?.promptCapabilities?.image)
          throw new ProviderError(
            "unsupported",
            "Gemini no admite imágenes en esta conexión.",
          );
        prompt.push({
          type: "image",
          mimeType: attachment.mime,
          data: (await readFile(attachment.path)).toString("base64"),
        });
      }
    }
    const abort = () => {
      void connection.agent
        .notify("session/cancel", { sessionId: session.sessionId })
        .catch(() => {});
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      const pending = connection.agent
        .request("session/prompt", { sessionId: session.sessionId, prompt })
        .then((result) => {
          this.raw({ type: "prompt-result", ...result });
          events.push(
            result.stopReason === "end_turn"
              ? { type: "done" }
              : result.stopReason === "cancelled"
                ? classifyError(new Error("cancelled"))
                : {
                    type: "error",
                    kind: "other",
                    message: `Gemini terminó con estado ${result.stopReason}.`,
                  },
          );
        })
        .catch((error) => events.push(classifyError(error)))
        .finally(() => events.end());
      yield* events;
      await pending;
    } finally {
      input.signal.removeEventListener("abort", abort);
      this.events = undefined;
    }
  }
  async dispose() {
    const child = this.child;
    this.child = undefined;
    this.connection?.close();
    this.connection = undefined;
    this.session = undefined;
    if (child) await stopChild(child);
  }
}
