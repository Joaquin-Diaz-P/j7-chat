import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
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
  stopChild,
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnInput } from "./types.js";

export interface ZenModel {
  providerID: string;
  type: string;
  id: string;
  name: string;
  enabled?: boolean;
  status?: string;
  capabilities: { input: string[] };
  variants: { id: string }[];
  cost?: {
    input: number;
    output: number;
    cache?: { read?: number; write?: number };
  }[];
}
export function freeZenModels(models: ZenModel[]): ModelInfo[] {
  return models
    .filter(
      (model) =>
        model.providerID === "opencode" &&
        model.type === "chat" &&
        model.enabled !== false &&
        model.status !== "deprecated" &&
        model.cost &&
        model.cost.length > 0 &&
        model.cost.every(
          (tier) =>
            tier.input === 0 &&
            tier.output === 0 &&
            tier.cache?.read === 0 &&
            tier.cache?.write === 0,
        ),
    )
    .map((model) => ({
      id: model.id,
      label: model.name,
      provider: "opencode",
      supportsImages: model.capabilities.input.includes("image"),
      supportsPdf: false,
      supportsEffort: model.variants.some((variant) => variant.id === "high"),
      free: true,
    }));
}
export const openCodePermissions = (web: boolean) => [
  { action: "*", resource: "*", effect: "deny" },
  ...(web
    ? [
        { action: "websearch", resource: "*", effect: "allow" },
        { action: "webfetch", resource: "*", effect: "allow" },
      ]
    : []),
];
export function openCodeConfig(instructions: string) {
  return {
    update: "disable",
    share: "disabled",
    snapshots: false,
    formatter: false,
    lsp: false,
    warming: false,
    instructions: [],
    skills: [],
    plugins: [],
    mcp: { servers: {} },
    permissions: openCodePermissions(false),
    policies: [
      ...["mcp.use", "skill.use", "plugin.use"].map((action) => ({
        action,
        resource: "*",
        effect: "deny",
      })),
    ],
    agents: {
      j7: {
        description: "Asistente de J7 Chat sin herramientas",
        mode: "primary",
        system: instructions,
        permissions: openCodePermissions(false),
      },
      "j7-web": {
        description: "Asistente de J7 Chat con búsqueda web",
        mode: "primary",
        system: instructions,
        permissions: openCodePermissions(true),
      },
    },
    default_agent: "j7",
    experimental: {
      todo: false,
      schedules: false,
      artifacts: false,
      subagent_depth: 0,
      image_generate: false,
    },
  };
}
export function translateOpenCodeEvent(
  raw: unknown,
  tools = new Map<string, string>(),
): ChatEvent[] {
  const event = object(raw),
    data = object(event.data);
  if (event.type === "session.text.delta" && typeof data.delta === "string")
    return [{ type: "text-delta", text: data.delta }];
  if (
    event.type === "session.reasoning.delta" &&
    typeof data.delta === "string"
  )
    return [{ type: "thinking-delta", text: data.delta }];
  if (
    event.type === "session.tool.input.started" &&
    typeof data.id === "string" &&
    typeof data.name === "string"
  )
    tools.set(data.id, data.name);
  if (
    event.type === "session.tool.called" ||
    event.type === "session.tool.success"
  ) {
    const name =
      typeof data.name === "string" ? data.name : tools.get(String(data.id));
    if (name === "websearch" || name === "webfetch") {
      const query = object(data.input).query;
      return [
        {
          type: "web-search",
          ...(typeof query === "string" ? { query } : {}),
          urls: urlsIn(data.content ?? data.input),
        },
      ];
    }
  }
  if (event.type === "session.execution.succeeded") return [{ type: "done" }];
  if (event.type === "session.execution.interrupted")
    return [classifyError(new Error("cancelled"))];
  if (event.type === "session.execution.failed")
    return [classifyError(new Error(JSON.stringify(data.error)))];
  return [];
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No se pudo reservar un puerto.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = stream.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let delimiter: RegExpExecArray | null;
      while ((delimiter = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const frame = buffer.slice(0, delimiter.index);
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield JSON.parse(data) as unknown;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class OpenCodeProvider extends BaseProvider {
  readonly id = "opencode" as const;
  private child: ChildProcessWithoutNullStreams | undefined;
  private url = "";
  private authorization = "";
  private instructions = "";
  private streamController: AbortController | undefined;
  private pump: Promise<void> | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private activeSession: string | undefined;
  private models: ModelInfo[] | undefined;
  private async api<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(
        `OpenCode HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  private async connect(
    instructions = this.instructions || buildChatInstructions(),
  ) {
    if (this.child && this.instructions !== instructions) await this.dispose();
    if (this.child) return;
    const start = performance.now(),
      paths = await privateHome(this.id, this.options),
      port = await freePort();
    const password = randomUUID();
    this.authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
    this.url = `http://127.0.0.1:${port}`;
    this.instructions = instructions;
    const dirs = {
      config: join(paths.root, "config"),
      data: join(paths.root, "data"),
      state: join(paths.root, "state"),
      cache: join(paths.root, "cache"),
    };
    await Promise.all(
      Object.values(dirs).map((path) =>
        mkdir(path, { recursive: true, mode: 0o700 }),
      ),
    );
    const child = spawn(
      await this.binary(),
      ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: paths.workspace,
        env: {
          ...cleanEnvironment(this.options.environment),
          HOME: paths.root,
          XDG_CONFIG_HOME: dirs.config,
          XDG_DATA_HOME: dirs.data,
          XDG_STATE_HOME: dirs.state,
          XDG_CACHE_HOME: dirs.cache,
          OPENCODE_TEST_HOME: paths.root,
          OPENCODE_DISABLE_PROJECT_CONFIG: "1",
          OPENCODE_DISABLE_CLAUDE_CODE: "1",
          OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
          OPENCODE_CONFIG_DIR: join(dirs.config, "opencode"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify(openCodeConfig(instructions)),
          OPENCODE_PASSWORD: password,
        },
        stdio: "pipe",
      },
    );
    this.child = child;
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("exit", () => {
      if (this.child === child) this.child = undefined;
      this.events?.push({
        type: "error",
        kind: "other",
        message: "El proceso de OpenCode terminó.",
      });
      this.events?.end();
    });
    try {
      let ready = false;
      while (performance.now() - start < 20_000) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null)
          throw new Error("OpenCode terminó durante el inicio.");
        try {
          await this.api("/api/info");
          ready = true;
          break;
        } catch {
          await delay(100);
        }
      }
      if (!ready) throw new Error("OpenCode no respondió a tiempo.");
      const agents = await this.api<{
        data: { id: string; permissions: unknown; system?: string }[];
      }>("/api/agent");
      if (
        !agents.data.some(
          (agent) => agent.id === "j7" && agent.system === instructions,
        )
      )
        throw new ProviderError(
          "unsupported",
          "OpenCode no cargó el agente aislado de J7.",
        );
      const sources =
        await this.api<
          { type: string; path?: string; info?: Record<string, unknown> }[]
        >("/api/config");
      this.diagnostic({
        type: "config-paths",
        paths: sources.map((source) => source.path),
      });
      if (
        sources.some(
          (source) => source.path && !source.path.startsWith(paths.root),
        )
      )
        throw new ProviderError(
          "unsupported",
          "OpenCode cargó configuración externa a J7.",
        );
      this.diagnostic({
        type: "isolation",
        agents: agents.data
          .filter((agent) => agent.id.startsWith("j7"))
          .map((agent) => ({ id: agent.id, permissions: agent.permissions })),
        configSources: sources.map((source) => ({
          type: source.type,
          path: source.path,
        })),
        mcpServers: [],
        plugins: [],
        toolInventory:
          "V2 publica permisos de agentes; no un inventario de herramientas.",
      });
      this.streamController = new AbortController();
      const response = await fetch(`${this.url}/api/event`, {
        headers: {
          Authorization: this.authorization,
          Accept: "text/event-stream",
        },
        signal: this.streamController.signal,
      });
      if (!response.ok || !response.body)
        throw new Error("No se pudo abrir SSE de OpenCode.");
      const tools = new Map<string, string>();
      this.pump = (async () => {
        try {
          for await (const event of parseSse(response.body!)) {
            const envelope = object(event),
              data = object(envelope.data);
            if (data.sessionID !== this.activeSession) continue;
            this.raw(event);
            if (envelope.type === "permission.asked") {
              this.diagnostic({ type: "permission-rejected" });
              await this.api(
                `/api/session/${encodeURIComponent(String(data.sessionID))}/permission/${encodeURIComponent(String(data.id))}/reply`,
                "POST",
                { decision: "reject" },
              );
            }
            if (envelope.type === "session.tool.input.started")
              this.diagnostic({ type: "tool", name: data.name });
            for (const translated of translateOpenCodeEvent(event, tools)) {
              this.events?.push(translated);
              if (translated.type === "done" || translated.type === "error")
                this.events?.end();
            }
          }
          if (!this.streamController?.signal.aborted)
            throw new Error("Se cerró el flujo SSE.");
        } catch (error) {
          if (!this.streamController?.signal.aborted) {
            this.events?.push(classifyError(error));
            this.events?.end();
          }
        }
      })();
      this.diagnostic({
        type: "startup",
        durationMs: performance.now() - start,
      });
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  protected async checkAuth() {
    await this.connect();
    if (!(await this.listModels()).length)
      throw new ProviderError(
        "auth",
        "OpenCode no tiene modelos gratis de Zen disponibles.",
      );
  }
  async listModels(): Promise<ModelInfo[]> {
    await this.connect();
    const result = await this.api<{ data: ZenModel[] }>("/api/model");
    this.diagnostic({
      type: "catalog",
      models: result.data
        .filter((m) => m.providerID === "opencode")
        .map((m) => ({
          id: m.id,
          cost: m.cost,
          enabled: m.enabled,
          status: m.status,
        })),
    });
    this.models = freeZenModels(result.data);
    return this.models;
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    await this.connect(input.instructions);
    const models = await this.listModels(),
      model = models.find((model) => model.id === input.model);
    if (!model)
      throw new ProviderError(
        "unsupported",
        "J7 solo permite modelos gratis de OpenCode Zen.",
      );
    if (input.effort === "high" && !model.supportsEffort)
      throw new ProviderError(
        "unsupported",
        "Este modelo gratis no permite cambiar el esfuerzo.",
      );
    if (
      input.attachments.some((a) => a.kind === "image") &&
      !model.supportsImages
    )
      throw new ProviderError(
        "unsupported",
        "Este modelo gratis no admite imágenes.",
      );
    const modelRef = {
      providerID: "opencode",
      id: input.model,
      ...(input.effort === "high" ? { variant: "high" } : {}),
    };
    const agent = input.webSearch ? "j7-web" : "j7",
      permissions = openCodePermissions(input.webSearch),
      paths = await privateHome(this.id, this.options);
    let id = input.nativeSessionId;
    if (id) {
      const sessionPath = `/api/session/${encodeURIComponent(id)}`;
      await this.api(sessionPath);
      await this.api(sessionPath, "PATCH", { permissions });
      await this.api(`${sessionPath}/agent`, "POST", { agent });
      await this.api(`${sessionPath}/model`, "POST", { model: modelRef });
    } else {
      id = (
        await this.api<{ data: { id: string } }>("/api/session", "POST", {
          title: "J7 Chat",
          agent,
          model: modelRef,
          location: { directory: paths.workspace },
          permissions,
        })
      ).data.id;
    }
    this.activeSession = id;
    yield { type: "session", nativeSessionId: id };
    const events = new AsyncQueue<ChatEvent>();
    this.events = events;
    const abort = () => {
      void this.api(
        `/api/session/${encodeURIComponent(id!)}/interrupt`,
        "POST",
        {},
      ).catch(() => {});
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      await this.api(`/api/session/${encodeURIComponent(id)}/prompt`, "POST", {
        text: await textWithAttachments(input, false),
        files: input.attachments
          .filter((a) => a.kind === "image")
          .map((a) => ({ uri: pathToFileURL(a.path).href, name: a.name })),
      });
      yield* events;
    } finally {
      input.signal.removeEventListener("abort", abort);
      this.events = undefined;
      this.activeSession = undefined;
    }
  }
  async dispose() {
    const child = this.child;
    this.child = undefined;
    this.streamController?.abort();
    await this.pump;
    if (child) await stopChild(child);
    this.models = undefined;
    this.authorization = "";
  }
}
