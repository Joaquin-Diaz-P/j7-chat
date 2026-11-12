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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  stopChild,
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnInput } from "./types.js";

export function geminiSettings(webSearch: boolean) {
  return {
    toolPermission: "strict",
    allowNonWorkspaceAccess: false,
    useG1Credits: false,
    permissions: {
      deny: [
        "command(*)", "read_file(*)", "write_file(*)", "execute_url(*)", "mcp(*)",
        ...(!webSearch ? ["read_url(*)"] : []),
      ],
    },
    disableSlashCommands: true,
  };
}
export function geminiAgent(instructions: string, webSearch: boolean) {
  return `---\nname: j7-chat\ndescription: Asistente de chat de J7 Chat.\nmainAgent: true\nsubagent: false\ncommandExecutionPolicy: off\ntools: ${JSON.stringify(webSearch ? ["search_web", "read_url_content"] : [])}\nmcpServers: []\nskills: []\nplugins: []\n---\n${instructions}\n`;
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
      /google_web_search|web_fetch|search_web|read_url_content|search|fetch/i.test(String(update.title)))
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
  // Antigravity also publishes the older ACP model catalog.
  models?: { availableModels: { modelId: string; name: string }[] };
}

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini" as const;
  private child: ChildProcessWithoutNullStreams | undefined;
  private connection: ClientConnection | undefined;
  private key = "";
  private account: { email?: string; plan?: string } | undefined;
  connectionAccount() { return this.account; }
  private readAccount(value: unknown) {
    const record = object(value), account = object(record.account);
    const email = account.email ?? record.email;
    const plan = account.plan ?? record.plan;
    const fields = { ...(typeof email === "string" ? {email} : {}), ...(typeof plan === "string" ? {plan} : {}) };
    if (Object.keys(fields).length) this.account = fields;
  }
  private capabilities: InitializeResponse["agentCapabilities"];
  private session: GeminiSession | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private async paths() {
    const paths = await privateHome(this.id, this.options);
    const workspace = join(paths.root, "workspace");
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    return { ...paths, workspace };
  }
  private async connect(input?: TurnInput) {
    const key = JSON.stringify([
      input?.webSearch ?? false,
      input?.instructions ?? buildChatInstructions(),
    ]);
    if (this.connection && input && this.key !== key) await this.dispose();
    if (this.connection) return this.connection;
    const start = performance.now(),
      paths = await this.paths();
    const config = join(paths.root, "antigravity-cli");
    const agents = join(paths.workspace, ".agents", "agents");
    await Promise.all([config, agents].map(path => mkdir(path, { recursive: true, mode: 0o700 })));
    const settings = geminiSettings(input?.webSearch ?? false);
    await writeFile(join(config, "settings.json"), JSON.stringify(settings), {
      mode: 0o600,
    });
    await writeFile(join(agents, "j7-chat.md"), geminiAgent(input?.instructions ?? buildChatInstructions(), input?.webSearch ?? false), { mode: 0o600 });
    const child = spawn(
      await this.binary(),
      ["acp", "--agent", "j7-chat", "--gemini-dir", paths.root,
        "--include-default-customizations=false", "--disable-telemetry"],
      {
        cwd: paths.workspace,
        env: {
          ...cleanEnvironment(this.options.environment),
          AGY_CLI_DISABLE_AUTO_UPDATE: "true",
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
      .onRequest("session/request_permission", ({ params }) => {
        const tool = params.toolCall;
        // The custom agent only exposes these two tools. Everything else is denied.
        if (input?.webSearch && (tool.kind === "search" || tool.kind === "fetch")) {
          const allow = params.options.find(option => option.kind === "allow_once");
          if (allow) return { outcome: { outcome: "selected" as const, optionId: allow.optionId } };
        }
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
        message: "El proceso de Antigravity terminó.",
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
      this.readAccount(init);
      this.raw({
        type: "initialize",
        agentCapabilities: init.agentCapabilities,
      });
      this.diagnostic({
        type: "isolation",
        allowedTools: input?.webSearch ? ["search_web", "read_url_content"] : [],
        extensions: [],
        mcpServers: [],
        note: "Agente propio, configuración aislada y permisos ACP restringidos.",
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
      paths = await this.paths();
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
        sessionId: input.nativeSessionId, cwd: paths.workspace, mcpServers: [],
      });
      this.session = { ...result, sessionId: input.nativeSessionId };
    } else if (!this.session || !input?.nativeSessionId) {
      this.session = await connection.agent.request<GeminiSession>(
        "session/new",
        { cwd: paths.workspace, mcpServers: [] },
      );
    }
    this.readAccount(this.session);
    return { connection, session: this.session };
  }
  protected async checkAuth() {
    await this.newSession();
  }
  async listModels(): Promise<ModelInfo[]> {
    const { session } = await this.newSession();
    const config = session.configOptions?.find(option => option.category === "model");
    const effort = session.configOptions?.find(option => option.id === "thought_level");
    const values = config?.type === "select" ? config.options.flatMap(option => "group" in option ? option.options : [option]) : undefined;
    const reasoningEfforts = effort?.type === "select" ? effort.options.flatMap(option => "group" in option ? option.options.map(value => value.value) : [option.value]) : [];
    return (values?.map(option => ({ modelId: option.value, name: option.name })) ?? session.models?.availableModels ?? [])
      .filter(model => model.modelId.startsWith("gemini-"))
      .map((model) => ({
      id: model.modelId,
      label: model.name,
      provider: this.id,
      supportsImages: this.capabilities?.promptCapabilities?.image ?? false,
      // Antigravity 1.5.6 advertises embeddedContext but drops application/pdf blobs.
      supportsPdf: false,
      supportsEffort: reasoningEfforts.length > 0,
      ...(reasoningEfforts.length ? { reasoningEfforts } : {}),
    }));
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    let state: Awaited<ReturnType<GeminiProvider["newSession"]>>;
    try {
      state = await this.newSession(input);
    } catch (error) {
      yield input.nativeSessionId ? resumeError(error) : classifyError(error);
      return;
    }
    const { connection, session } = state;
    if (session.configOptions?.some(option => option.category === "model")) {
      const result = await connection.agent.request("session/set_config_option", {
        sessionId: session.sessionId, configId: "model", value: input.model,
      });
      session.configOptions = result.configOptions;
      if (session.configOptions.some(option => option.id === "thought_level")) {
        const result = await connection.agent.request("session/set_config_option", {
          sessionId: session.sessionId, configId: "thought_level", value: input.effort === "normal" ? "low" : input.effort,
        });
        session.configOptions = result.configOptions;
      }
    } else if (session.models) {
      await connection.agent.request("session/set_model", { sessionId: session.sessionId, modelId: input.model });
    }
    yield { type: "session", nativeSessionId: session.sessionId };
    const prompt: ContentBlock[] = [
      { type: "text", text: await textWithAttachments(input, false) },
    ];
    for (const attachment of input.attachments) {
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
    const events = new AsyncQueue<ChatEvent>();
    this.events = events;
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
    this.account = undefined;
    if (child) await stopChild(child);
  }
}
