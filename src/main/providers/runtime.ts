import { strings as s } from "../../renderer/strings.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, lstat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { ensurePaths, resolveBinary } from "../paths.js";
import type {
  ChatEvent,
  ChatProvider,
  ModelInfo,
  ProviderId,
  ProviderStatus,
  TurnInput,
} from "./types.js";

export interface Diagnostic {
  type: string;
  [key: string]: unknown;
}
export interface ProviderOptions {
  binaryPath?: string;
  dataDir?: string;
  environment?: NodeJS.ProcessEnv;
  onDiagnostic?: (event: Diagnostic) => void;
  // Raw protocol is delivered only in memory. Consumers must redact before persistence.
  onRawEvent?: (event: unknown) => void;
}
export function cleanEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const allowed = new Set([
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SHELL",
    "TZ",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(([key]) => allowed.has(key)),
    ),
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  };
}
export async function linkExisting(source: string, target: string) {
  try {
    await lstat(target);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await lstat(source);
    await symlink(source, target);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" &&
      (error as NodeJS.ErrnoException).code !== "EEXIST"
    )
      throw error;
  }
}
export async function privateHome(
  provider: ProviderId,
  options: ProviderOptions,
) {
  const paths = await ensurePaths(options.dataDir);
  const root = join(paths.providers, provider);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return { ...paths, root, userHome: options.environment?.HOME ?? homedir() };
}
export class ProviderError extends Error {
  constructor(
    public kind: "auth" | "quota" | "unsupported" | "other",
    message: string,
  ) {
    super(message);
  }
}
export function classifyError(
  error: unknown,
): Extract<ChatEvent, { type: "error" }> {
  if (error instanceof ProviderError)
    return { type: "error", kind: error.kind, message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  if (/session.*(?:not.found|missing|invalid|expired)|thread.*(?:not.found|missing|invalid)|resume.*(?:fail|not|invalid)|no conversation found/i.test(message))
    return { type: "error", kind: "other", message: s.responseFailed, recovery: "session" };
  if (/process.*(?:exit|closed|died)|proceso.*(?:termin|cerr)|ECONNRESET|EPIPE|fetch failed|SSE|Claude Code.*exited/i.test(message))
    return { type: "error", kind: "other", message: s.processFailed, recovery: "process" };
  if (
    /quota|rate.?limit|429|usage.limit|free-limit|capacity|RESOURCE_EXHAUSTED/i.test(
      message,
    )
  )
    return {
      type: "error",
      kind: "quota",
      message:
        s.usageLimit,
    };
  if (
    /auth|unauth|401|login|log.in|credentials|sign.in|oauth|token.expired/i.test(
      message,
    )
  )
    return {
      type: "error",
      kind: "auth",
      message:
        s.sessionRequired,
    };
  if (/no longer supported|Antigravity/i.test(message))
    return {
      type: "error",
      kind: "unsupported",
      message:
        s.geminiUnsupported,
    };
  if (
    /unsupported|not.support|not.available|invalid.model|model.not.found/i.test(
      message,
    )
  )
    return {
      type: "error",
      kind: "unsupported",
      message: `${s.optionUnsupported} ${summarizeProviderError(message)}`,
    };
  if (/abort|cancel/i.test(message))
    return { type: "error", kind: "other", message: s.turnCancelled };
  return {
    type: "error",
    kind: "other",
    message:
      summarizeProviderError(message),
  };
}
export function resumeError(error: unknown): Extract<ChatEvent, { type: "error" }> {
  const event = classifyError(error);
  return event.kind === "other" && event.recovery !== "process" ? { ...event, recovery: "session" } : event;
}
export function summarizeProviderError(message: string): string {
  let detail = message;
  try {
    const value = JSON.parse(message) as unknown;
    const record = object(value);
    const nested = object(record.error);
    detail = typeof record.message === "string" ? record.message : typeof nested.message === "string" ? nested.message : typeof value === "string" ? value : s.programFailed;
  } catch { /* Plain error messages need no JSON decoding. */ }
  if (/secret|token|api[_-]?key|password|authorization/i.test(detail) || !/\s/.test(detail)) return s.programFailed;
  return detail.replace(/(?:Bearer\s+)[^\s"']+|sk[-_][A-Za-z0-9_-]+|(?:token|api[_-]?key|password)\s*[:=]\s*[^\s"']+/gi, s.redacted).split("\n")[0]?.slice(0, 400) || s.programFailed;
}
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private wake: (() => void) | undefined;
  private ended = false;
  push(item: T) {
    if (!this.ended) {
      this.items.push(item);
      this.wake?.();
    }
  }
  end() {
    this.ended = true;
    this.wake?.();
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length) {
        yield this.items.shift()!;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}
export abstract class BaseProvider implements ChatProvider {
  abstract readonly id: ProviderId;
  protected busy = false;
  private closed = false;
  constructor(protected options: ProviderOptions = {}) {}
  protected async binary() {
    const found = await resolveBinary(
      this.id,
      this.options.binaryPath === undefined
        ? {}
        : { override: this.options.binaryPath },
    );
    this.assertOpen();
    if (!found)
      throw new ProviderError(
        "other",
        s.binaryMissing(this.id),
      );
    return found;
  }
  protected assertOpen() { if (this.closed) throw new Error("Provider shut down"); }
  protected diagnostic(event: Diagnostic) {
    this.options.onDiagnostic?.(event);
  }
  protected raw(event: unknown) {
    this.options.onRawEvent?.(event);
  }
  async getStatus(): Promise<ProviderStatus> {
    if (
      !(await resolveBinary(
        this.id,
        this.options.binaryPath === undefined
          ? {}
          : { override: this.options.binaryPath },
      ))
    )
      return { state: "not_installed" };
    try {
      await this.checkAuth();
      return { state: "ready" };
    } catch (error) {
      const event = classifyError(error);
      return {
        state: event.kind === "auth" ? "not_authenticated" : "error",
        detail: event.message,
      };
    }
  }
  async *runTurn(input: TurnInput): AsyncIterable<ChatEvent> {
    if (this.busy) {
      yield {
        type: "error",
        kind: "other",
        message: s.programBusy,
      };
      return;
    }
    this.busy = true;
    let settled = false;
    let cancellationFallback: NodeJS.Timeout | undefined;
    const abort = () => {
      cancellationFallback = setTimeout(() => {
        void this.dispose().catch(() => {});
      }, 2_000);
      cancellationFallback.unref();
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      for await (const event of this.execute(input)) {
        if (event.type === "done" || event.type === "error") settled = true;
        yield event;
      }
      if (!settled && !input.signal.aborted)
        yield { type: "error", kind: "other", message: s.processFailed, recovery: "process" };
    } catch (error) {
      yield classifyError(error);
    } finally {
      input.signal.removeEventListener("abort", abort);
      clearTimeout(cancellationFallback);
      if (!settled) await this.dispose();
      this.busy = false;
    }
  }
  protected abstract checkAuth(): Promise<void>;
  protected abstract execute(input: TurnInput): AsyncIterable<ChatEvent>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract dispose(): Promise<void>;
  async shutdown() {
    this.closed = true;
    await this.dispose();
  }
}
export class JsonRpc {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  readonly child: ChildProcessWithoutNullStreams;
  onMessage: (message: Record<string, unknown>) => void = () => {};
  onExit: () => void = () => {};
  constructor(
    binary: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) {
    this.child = spawn(binary, args, { cwd, env, stdio: "pipe" });
    this.child.stderr.on("data", () => {});
    this.child.stdin.on("error", (error) => this.fail(error));
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line) as Record<string, unknown>;
        if (
          typeof message.id === "number" &&
          this.pending.has(message.id) &&
          !("method" in message)
        ) {
          const request = this.pending.get(message.id)!;
          this.pending.delete(message.id);
          clearTimeout(request.timer);
          if (message.error)
            request.reject(new Error(JSON.stringify(message.error)));
          else request.resolve(message.result);
        } else this.onMessage(message);
      } catch {
        /* Non-JSON startup lines are never forwarded as chat text. */
      }
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", () => {
      this.fail(new Error(s.processExited));
      this.onExit();
    });
  }
  private fail(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  send(message: object) {
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  notify(method: string, params?: unknown) {
    this.send({ method, ...(params === undefined ? {} : { params }) });
  }
  request<T = unknown>(
    method: string,
    params: unknown,
    timeout = 30_000,
  ): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(s.requestTimeout(method)));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.send({ id, method, params });
    });
  }
  async dispose() {
    this.fail(new Error(s.processClosed));
    await stopChild(this.child);
  }
}
export async function stopChild(child: ChildProcessWithoutNullStreams) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function urlsIn(value: unknown): string[] {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return [
    ...new Set(
      (text.match(/https?:\/\/[^\s"<>\\\])}]+/g) ?? []).map((url) =>
        url.replace(/[.,;]+$/, ""),
      ),
    ),
  ];
}
