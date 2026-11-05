import { strings as s } from "../../renderer/strings.js";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { ensurePaths } from "../paths.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { textWithAttachments } from "../attachments/content.js";
import { buildChatInstructions } from "../chat/instructions.js";
import {
  AsyncQueue,
  BaseProvider,
  cleanEnvironment,
  object,
  ProviderError,
  urlsIn,
  classifyError,
  resumeError,
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
  defaultVariant?: string;
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
      reasoningEfforts: model.variants.map(v => v.id),
      supportsEffort: model.variants.some((variant) => variant.id === "high"),
      free: true,
    }));
}
// Session rules override agent tool permissions, including skill/MCP tools.
// Service plugins remain loaded: their hooks and injected context are not
// isolated by session permissions, and J7 must never mutate shared config.
// Zen only grants free models when OpenCode's tools are offered, so they are set to "ask"
// and every permission request is rejected: tools are visible to the model but never run.
export const openCodePermissions = (web: boolean) => [
  { action: "*", resource: "*", effect: "ask" },
  ...(web
    ? [
        { action: "websearch", resource: "*", effect: "allow" },
        { action: "webfetch", resource: "*", effect: "allow" },
      ]
    : []),
];
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
    this.instructions = instructions;
    if (this.url) return;
    const start = performance.now();
    try {
      const paths = await ensurePaths(this.options.dataDir);
      await reapOpenCode(join(paths.providers, "opencode.pid"));
      const binary = await this.binary();
      const env = cleanEnvironment(this.options.environment);
      const run = async (args: string[]) => (await promisify(execFile)(binary, args, {
        env, timeout: 20_000, maxBuffer: 64 * 1024,
      })).stdout;
      let status = await run(["service", "status"]).catch(() => "");
      if (!serviceUrl(status)) {
        await run(["service", "start"]);
        status = await run(["service", "status"]);
      }
      const url = serviceUrl(status);
      if (!url) throw new Error("service unavailable");
      const home = this.options.environment?.HOME ?? homedir();
      const config = object(JSON.parse(await readFile(join(
        this.options.environment?.XDG_CONFIG_HOME ?? join(home, ".config"),
        "opencode", "service.json",
      ), "utf8")));
      if (typeof config.password !== "string" || !config.password) throw new Error("missing service authentication");
      this.url = url;
      this.authorization = `Basic ${Buffer.from(`opencode:${config.password}`).toString("base64")}`;
      this.assertOpen();
      await this.api("/api/info");
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
            throw new Error(s.streamClosed);
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
      throw new ProviderError("unsupported", s.openCodeServiceUnavailable);
    }
  }
  protected async checkAuth() {
    await this.connect();
    if (!(await this.listModels()).length)
      throw new ProviderError(
        "unsupported",
        s.zenNoModels,
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
        s.zenOnlyFree,
      );
    if (
      input.attachments.some((a) => a.kind === "image") &&
      !model.supportsImages
    )
      throw new ProviderError(
        "unsupported",
        s.imageUnsupported,
      );
    const modelRef = {
      providerID: "opencode",
      id: input.model,
      ...(model.reasoningEfforts?.length ? { variant: input.effort } : {}),
    };
    const permissions = openCodePermissions(input.webSearch);
    let id = input.nativeSessionId;
    if (id) {
      const sessionPath = `/api/session/${encodeURIComponent(id)}`;
      try {
      await this.api(sessionPath);
      await this.api(`${sessionPath}/model`, "POST", { model: modelRef });
      } catch (error) { yield resumeError(error); return; }
    } else {
      id = (
        await this.api<{ data: { id: string } }>("/api/session", "POST", {
          title: "J7 Chat",
          model: modelRef,
          permissions,
        })
      ).data.id;
    }
    await this.api(`/api/session/${encodeURIComponent(id)}`, "PATCH", { permissions });
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
        // OpenCode 2.2.x PromptInput has no system field.
        text: `${this.instructions}\n\n${await textWithAttachments(input, false)}`,
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
    this.streamController?.abort();
    await this.pump;
    this.streamController = undefined;
    this.pump = undefined;
    this.url = "";
    this.models = undefined;
    this.authorization = "";
  }
}

export async function reapOpenCode(pidFile: string, inspect = processCommand, kill = (pid: number) => process.kill(pid, "SIGTERM")) {
  let text: string;
  try { text = await readFile(pidFile, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const pid = Number(text.trim());
  if (Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid) {
    const command = await inspect(pid);
    if (command && /^(?:\S*\/)?opencode serve --hostname 127\.0\.0\.1 --port \d+$/.test(command.trim())) {
      try { kill(pid); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
  }
  await rm(pidFile, { force: true });
}
async function processCommand(pid: number): Promise<string | undefined> {
  const { execFile } = await import("node:child_process");
  return new Promise(resolve => execFile("/bin/ps", ["-p", String(pid), "-o", "command="], (error, stdout) => resolve(error ? undefined : stdout.trim())));
}

// Accept only the local managed service, never a URL embedded in an error message.
export function serviceUrl(status: string): string | undefined {
  const value = status.trim();
  return /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value) ? value.replace(/\/$/, "") : undefined;
}
