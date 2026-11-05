import { parseArgs } from "node:util";
import { basename, extname, resolve } from "node:path";
import { buildChatInstructions } from "../src/main/chat/instructions.js";
import { createProvider } from "../src/main/providers/registry.js";
import { classifyError } from "../src/main/providers/runtime.js";
import type { Attachment, ProviderId } from "../src/main/providers/types.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    web: { type: "boolean" },
    "no-web": { type: "boolean" },
    image: { type: "string", multiple: true },
    pdf: { type: "string", multiple: true },
    resume: { type: "string" },
    "list-models": { type: "boolean" },
    status: { type: "boolean" },
    binary: { type: "string" },
    timeout: { type: "string", default: "120000" },
  },
});
const id = positionals.shift();
if (!id || !["claude", "codex", "gemini", "opencode"].includes(id))
  throw new Error(
    'Uso: npm run spike -- <claude|codex|gemini|opencode> [opciones] "pregunta"',
  );
if (values.effort && !["normal", "high"].includes(values.effort))
  throw new Error("--effort admite normal o high.");
if (values.web && values["no-web"]) throw new Error("Elige --web o --no-web.");
const gray = (value: unknown) =>
  console.error(
    `\x1b[90m${typeof value === "string" ? value : JSON.stringify(value)}\x1b[0m`,
  );
let startupMs: number | null = null;
const start = performance.now();
let firstWordMs: number | null = null,
  nativeSessionId: string | null = null;
const provider = createProvider(id as Exclude<ProviderId, "mock" | "mock-a" | "mock-b">, {
  ...(values.binary ? { binaryPath: values.binary } : {}),
  onDiagnostic: (event) => {
    if (event.type === "startup") startupMs = Number(event.durationMs);
    gray(event);
  },
});
const controller = new AbortController(),
  timeout = Number(values.timeout);
if (!Number.isFinite(timeout) || timeout <= 0)
  throw new Error("--timeout debe ser un número positivo de milisegundos.");
const timer = setTimeout(() => controller.abort(), timeout);
process.once("SIGINT", () => controller.abort());
try {
  if (values.status) {
    const status = await provider.getStatus();
    gray(status);
    if (status.state !== "ready") process.exitCode = 1;
  } else if (values["list-models"])
    console.log(JSON.stringify(await provider.listModels(), null, 2));
  else {
    if (!positionals.length) throw new Error("Falta la pregunta.");
    const attachments: Attachment[] = [
      ...(values.image ?? []).map((path) => ({
        kind: "image" as const,
        path: resolve(path),
        name: basename(path),
        mime:
          (
            {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".webp": "image/webp",
              ".gif": "image/gif",
            } as Record<string, string>
          )[extname(path).toLowerCase()] ?? "image/png",
      })),
      ...(values.pdf ?? []).map((path) => ({
        kind: "pdf" as const,
        path: resolve(path),
        name: basename(path),
        mime: "application/pdf",
      })),
    ];
    const defaults = {
      claude: "haiku",
      codex: "gpt-6-luna",
      gemini: "gemini-2.5-flash",
      opencode: "big-pickle",
    };
    for await (const event of provider.runTurn({
      model: values.model ?? defaults[id as Exclude<ProviderId, "mock" | "mock-a" | "mock-b">],
      effort: values.effort === "high" ? "high" : "normal",
      webSearch: !values["no-web"],
      instructions: buildChatInstructions(),
      ...(values.resume ? { nativeSessionId: values.resume } : {}),
      text: positionals.join(" "),
      attachments,
      signal: controller.signal,
    })) {
      if (event.type === "text-delta") {
        if (firstWordMs === null && /\S/.test(event.text))
          firstWordMs = performance.now() - start;
        process.stdout.write(event.text);
      } else {
        if (event.type === "session") nativeSessionId = event.nativeSessionId;
        if (event.type === "error") process.exitCode = 1;
        gray(event);
      }
    }
    console.log();
    gray({
      nativeSessionId,
      startupMs,
      firstWordMs,
      totalMs: performance.now() - start,
    });
  }
} catch (error) {
  gray(classifyError(error));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await provider.dispose();
}
