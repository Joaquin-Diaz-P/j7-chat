import { strings as s } from "../../renderer/strings.js";
import { join } from "node:path";
import type { ThreadStartParams } from "./generated/codex/v2/ThreadStartParams.js";
import type { ThreadResumeParams } from "./generated/codex/v2/ThreadResumeParams.js";
import type { TurnStartParams } from "./generated/codex/v2/TurnStartParams.js";
import type { ModelListResponse } from "./generated/codex/v2/ModelListResponse.js";
import { textWithAttachments } from "../attachments/content.js";
import {
  AsyncQueue,
  BaseProvider,
  cleanEnvironment,
  JsonRpc,
  linkExisting,
  object,
  privateHome,
  ProviderError,
  urlsIn,
  classifyError,
  resumeError,
} from "./runtime.js";
import type { ChatEvent, ModelInfo, TurnInput } from "./types.js";

export const CODEX_SAFE_CONFIG = {
  "features.shell_tool": false,
  "features.unified_exec": false,
  "features.shell_snapshot": false,
  "features.view_image": false,
  "features.apps": false,
  "features.plugins": false,
  "features.remote_plugin": false,
  "features.hooks": false,
  "features.multi_agent": false,
  "features.multi_agent_v2": false,
  "features.memories": false,
  "features.skill_search": false,
  "features.skill_mcp_dependency_install": false,
  "features.code_mode": false,
  "features.browser_use": false,
  "features.browser_use_external": false,
  "features.computer_use": false,
  "features.in_app_browser": false,
  "features.image_generation": false,
  "features.sleep_tool": false,
  "features.goals": false,
  "features.artifact": false,
  "tools.update_plan.enabled": false,
  "tools.experimental_request_user_input.enabled": false,
  project_doc_max_bytes: 0,
  check_for_update_on_startup: false,
  include_environment_context: false,
  include_apps_instructions: false,
  include_collaboration_mode_instructions: false,
};
export function translateCodexEvent(raw: unknown): ChatEvent[] {
  const message = object(raw),
    params = object(message.params);
  if (message.method === "thread/started") {
    const thread = object(params.thread);
    return typeof thread.id === "string"
      ? [{ type: "session", nativeSessionId: thread.id }]
      : [];
  }
  if (
    message.method === "item/agentMessage/delta" &&
    typeof params.delta === "string"
  )
    return [{ type: "text-delta", text: params.delta }];
  if (
    (message.method === "item/reasoning/summaryTextDelta" ||
      message.method === "item/reasoning/textDelta") &&
    typeof params.delta === "string"
  )
    return [{ type: "thinking-delta", text: params.delta }];
  if (
    message.method === "item/completed" ||
    message.method === "item/started"
  ) {
    const item = object(params.item);
    if (item.type === "webSearch") {
      const query = object(item.action).query;
      return [
        {
          type: "web-search",
          ...(typeof query === "string" ? { query } : {}),
          urls: urlsIn(item.results ?? item.action),
        },
      ];
    }
  }
  if (message.method === "turn/completed") {
    const turn = object(params.turn);
    if (turn.status === "completed") return [{ type: "done" }];
    return [
      classifyError(
        new Error(
          turn.status === "interrupted"
            ? "cancelled"
            : JSON.stringify(turn.error),
        ),
      ),
    ];
  }
  if (message.method === "error" && params.willRetry !== true)
    return [classifyError(new Error(JSON.stringify(params.error)))];
  return [];
}
export class CodexProvider extends BaseProvider {
  readonly id = "codex" as const;
  private rpc: JsonRpc | undefined;
  private events: AsyncQueue<ChatEvent> | undefined;
  private activeThread: string | undefined;
  private activeTurn: string | undefined;
  private async connect() {
    if (this.rpc) return this.rpc;
    const start = performance.now(),
      paths = await privateHome(this.id, this.options);
    await linkExisting(
      join(paths.userHome, ".codex", "auth.json"),
      join(paths.root, "auth.json"),
    );
    const args = ["app-server", "--listen", "stdio://"];
    for (const [key, value] of Object.entries(CODEX_SAFE_CONFIG))
      args.push("-c", `${key}=${JSON.stringify(value)}`);
    const binary = await this.binary();
    this.assertOpen();
    const rpc = new JsonRpc(binary, args, paths.workspace, {
      ...cleanEnvironment(this.options.environment),
      CODEX_HOME: paths.root,
    });
    this.rpc = rpc;
    rpc.onMessage = (message) => {
      this.raw(message);
      if ("id" in message && "method" in message) {
        const method = String(message.method);
        this.diagnostic({ type: "permission-rejected", method });
        if (method.endsWith("requestApproval"))
          rpc.send({ id: message.id, result: { decision: "decline" } });
        else if (method === "item/tool/call")
          rpc.send({
            id: message.id,
            result: {
              success: false,
              contentItems: [
                { type: "inputText", text: "J7 bloqueó esta herramienta." },
              ],
            },
          });
        else
          rpc.send({
            id: message.id,
            error: { code: -32601, message: "J7 no permite esta operación." },
          });
        return;
      }
      const params = object(message.params);
      if (
        typeof params.threadId === "string" &&
        this.activeThread &&
        params.threadId !== this.activeThread
      )
        return;
      for (const event of translateCodexEvent(message)) {
        this.events?.push(event);
        if (event.type === "done" || event.type === "error") this.events?.end();
      }
      if (message.method === "turn/started")
        this.activeTurn = String(object(params.turn).id);
      if (message.method === "item/started") {
        const item = object(params.item);
        this.diagnostic({ type: "tool-or-item", itemType: item.type });
      }
    };
    rpc.onExit = () => {
      if (this.rpc === rpc) this.rpc = undefined;
      this.events?.push({
        type: "error",
        kind: "other",
        message: s.codexExited,
        recovery: "process",
      });
      this.events?.end();
    };
    try {
      await rpc.request("initialize", {
        clientInfo: { name: "j7_chat", title: "J7 Chat", version: "0.0.0" },
        capabilities: { experimentalApi: true },
      });
      rpc.notify("initialized");
      const mcp = await rpc.request<{ data: unknown[] }>(
        "mcpServerStatus/list",
        {},
      );
      if (mcp.data.length)
        throw new ProviderError(
          "unsupported",
          s.codexUnsafeMcp,
        );
      this.diagnostic({
        type: "isolation",
        config: CODEX_SAFE_CONFIG,
        mcpServers: [],
        toolInventory:
          "El protocolo no expone el inventario de herramientas internas.",
      });
      this.diagnostic({
        type: "startup",
        durationMs: performance.now() - start,
      });
      return rpc;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  protected async checkAuth() {
    const result = await (
      await this.connect()
    ).request<{ account: { type: string } | null }>("account/read", {
      refreshToken: false,
    });
    if (!result.account || result.account.type !== "chatgpt")
      throw new ProviderError(
        "auth",
        s.codexLogin,
      );
  }
  async listModels(): Promise<ModelInfo[]> {
    const rpc = await this.connect();
    const models: ModelInfo[] = [];
    let cursor: string | null = null;
    do {
      const page: ModelListResponse = await rpc.request("model/list", {
        cursor,
        limit: 100,
        includeHidden: false,
      });
      models.push(
        ...page.data.map((model) => ({
          id: model.model,
          label: model.displayName,
          provider: this.id,
          supportsImages: model.inputModalities.includes("image"),
          supportsPdf: false,
          reasoningEfforts: model.supportedReasoningEfforts.map(e => e.reasoningEffort),
          defaultReasoningEffort: model.defaultReasoningEffort,
          supportsEffort: model.supportedReasoningEfforts.some(
            (e) => e.reasoningEffort === "high",
          ),
        })),
      );
      cursor = page.nextCursor;
    } while (cursor);
    return models;
  }
  protected async *execute(input: TurnInput): AsyncIterable<ChatEvent> {
    await this.checkAuth();
    const rpc = await this.connect(),
      paths = await privateHome(this.id, this.options);
    const config = {
      ...CODEX_SAFE_CONFIG,
      web_search: input.webSearch ? "live" : "disabled",
    };
    const base = {
      model: input.model,
      cwd: paths.workspace,
      approvalPolicy: "never" as const,
      sandbox: "read-only" as const,
      baseInstructions: input.instructions,
      developerInstructions: "",
      config,
    };
    let thread: string;
    if (input.nativeSessionId) {
      const params: ThreadResumeParams = {
        ...base,
        threadId: input.nativeSessionId,
      };
      try {
      thread = (
        await rpc.request<{ thread: { id: string } }>("thread/resume", params)
      ).thread.id;
      } catch (error) { yield resumeError(error); return; }
    } else {
      const params: ThreadStartParams = {
        ...base,
        dynamicTools: [],
        environments: [],
      };
      thread = (
        await rpc.request<{ thread: { id: string } }>("thread/start", params)
      ).thread.id;
    }
    this.activeThread = thread;
    this.activeTurn = undefined;
    yield { type: "session", nativeSessionId: thread };
    const queue = new AsyncQueue<ChatEvent>();
    this.events = queue;
    const abort = () => {
      if (this.activeTurn)
        void rpc
          .request("turn/interrupt", {
            threadId: thread,
            turnId: this.activeTurn,
          })
          .catch(() => {});
      else void this.dispose();
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      const params: TurnStartParams = {
        threadId: thread,
        model: input.model,
        effort: input.effort as NonNullable<TurnStartParams["effort"]>,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        input: [
          {
            type: "text",
            text: await textWithAttachments(input, false),
            text_elements: [],
          },
          ...input.attachments
            .filter((a) => a.kind === "image")
            .map((a) => ({ type: "localImage" as const, path: a.path })),
        ],
      };
      const response = await rpc.request<{ turn: { id: string } }>(
        "turn/start",
        params,
      );
      this.activeTurn = response.turn.id;
      yield* queue;
    } finally {
      input.signal.removeEventListener("abort", abort);
      this.events = undefined;
      this.activeTurn = undefined;
    }
  }
  async dispose() {
    const rpc = this.rpc;
    this.rpc = undefined;
    await rpc?.dispose();
  }
}
