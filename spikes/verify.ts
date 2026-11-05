import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createProvider } from "../src/main/providers/registry.js";
import { buildChatInstructions } from "../src/main/chat/instructions.js";
import { getPaths } from "../src/main/paths.js";
import { extractPdfText } from "../src/main/attachments/pdf.js";
import { object, type Diagnostic } from "../src/main/providers/runtime.js";
import type {
  Attachment,
  ChatEvent,
  ProviderId,
  TurnInput,
} from "../src/main/providers/types.js";

// This is an opt-in integration suite: npm test never runs it.
// One provider uses at most 10 inference turns; --all uses at most 40.
const providerArg = process.argv[2];
if (
  !providerArg ||
  !["--all", "claude", "codex", "gemini", "opencode"].includes(providerArg)
)
  throw new Error("Uso: npx tsx spikes/verify.ts <programa|--all>");
const root = resolve("tests/fixtures"),
  output = resolve("docs/evidence");
await mkdir(output, { recursive: true });
const ids =
  providerArg === "--all"
    ? (["claude", "codex", "gemini", "opencode"] as const)
    : [providerArg as Exclude<ProviderId, "mock" | "mock-a" | "mock-b">];
const models = {
  claude: "haiku",
  codex: "gpt-6-luna",
  gemini: "gemini-2.5-flash",
  opencode: "deepseek-v4.1-flash-free",
};
const image: Attachment = {
  kind: "image",
  path: join(root, "attachments/j7-42.png"),
  name: "j7-42.png",
  mime: "image/png",
};
const pdf: Attachment = {
  kind: "pdf",
  path: join(root, "attachments/j7-30-pages.pdf"),
  name: "j7-30-pages.pdf",
  mime: "application/pdf",
};
function sanitize(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) => {
      if (
        /token|secret|password|authorization|api.?key|account|email|organization|signature/i.test(
          key,
        )
      )
        return undefined;
      if (typeof item === "string")
        return item
          .replace(/\/Users\/[^/\s"]+/g, "/Users/test")
          .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "user@example.invalid")
          .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "session-redacted");
      return item;
    }),
  );
}
function fixtureProjection(id: ProviderId, raw: unknown): unknown | undefined {
  const value = object(raw);
  if (id === "claude") {
    if (value.type === "system" && value.subtype === "init")
      return {
        type: value.type,
        subtype: value.subtype,
        session_id: "session-redacted",
        tools: value.tools,
        mcp_servers: value.mcp_servers,
        skills: value.skills,
        plugins: value.plugins,
      };
    if (value.type === "stream_event")
      return { type: value.type, event: value.event };
    if (value.type === "result")
      return {
        type: value.type,
        subtype: value.subtype,
        is_error: value.is_error,
      };
    if (value.type === "assistant" || value.type === "user") {
      const content = object(value.message).content;
      if (Array.isArray(content))
        return {
          type: value.type,
          message: {
            content: content.filter((block) =>
              ["tool_use", "tool_result"].includes(String(object(block).type)),
            ),
          },
        };
    }
  }
  if (
    id === "codex" &&
    (/^item\/(agentMessage|reasoning)/.test(String(value.method)) ||
      [
        "thread/started",
        "item/started",
        "item/completed",
        "turn/completed",
        "error",
      ].includes(String(value.method)))
  ) {
    const params = object(value.params);
    if (value.method === "thread/started")
      return {
        method: value.method,
        params: { thread: { id: "session-redacted" } },
      };
    if (value.method === "turn/completed")
      return {
        method: value.method,
        params: {
          turn: {
            status: object(params.turn).status,
            error: object(params.turn).error,
          },
        },
      };
    return { method: value.method, params };
  }
  if (id === "gemini") return value;
  if (
    id === "opencode" &&
    /^session\.(text|reasoning|tool|execution)\./.test(String(value.type))
  )
    return value;
  return undefined;
}
for (const id of ids) {
  let diagnostics: Diagnostic[] = [],
    samples: unknown[] = [],
    sampleBytes = 0;
  let provider = createProvider(id, {
    onDiagnostic: (event) => diagnostics.push(event),
    onRawEvent: (raw) => {
      const value = fixtureProjection(id, raw);
      if (value !== undefined && sampleBytes < 350_000) {
        const safe = sanitize(value);
        samples.push(safe);
        sampleBytes += JSON.stringify(safe).length;
      }
    },
  });
  const status = await provider.getStatus();
  const missing = await createProvider(id, {
    binaryPath: "/j7-does-not-exist",
  }).getStatus();
  let catalog: unknown = [];
  try {
    catalog = await provider.listModels();
  } catch {}
  await provider.dispose();
  const results: unknown[] = [];
  const reset = async () => {
    await provider.dispose();
  };
  async function turn(
    name: string,
    text: string,
    options: Partial<TurnInput> = {},
    temperature?: "cold" | "warm",
  ) {
    diagnostics = [];
    const before = await readdir(getPaths().workspace),
      start = performance.now();
    let firstWordMs: number | null = null,
      session: string | undefined,
      answer = "";
    const events: ChatEvent[] = [];
    const signal = AbortSignal.timeout(90_000);
    for await (const event of provider.runTurn({
      model: models[id],
      effort: "normal",
      webSearch: false,
      instructions: buildChatInstructions(),
      text,
      attachments: [],
      signal,
      ...options,
    })) {
      events.push(event);
      if (event.type === "text-delta") {
        if (firstWordMs === null && /\S/.test(event.text))
          firstWordMs = performance.now() - start;
        answer += event.text;
      }
      if (event.type === "session") session = event.nativeSessionId;
    }
    const after = await readdir(getPaths().workspace);
    const result = {
      name,
      temperature,
      model: options.model ?? models[id],
      web: options.webSearch ?? false,
      effort: options.effort ?? "normal",
      text,
      answer,
      firstWordMs,
      startupMs:
        diagnostics.find((event) => event.type === "startup")?.durationMs ?? 0,
      totalMs: performance.now() - start,
      nativeSessionId: session,
      newFiles: after.filter((file) => !before.includes(file)),
      events,
      diagnostics,
    };
    results.push(result);
    console.log(
      id,
      name,
      JSON.stringify({
        answer,
        firstWordMs,
        terminal: events.at(-1),
        newFiles: result.newFiles,
      }),
    );
    await writeFile(
      join(output, `${id}.json`),
      JSON.stringify(
        sanitize({
          date: new Date().toISOString(),
          status,
          missing,
          catalog,
          results,
        }),
        null,
        2,
      ) + "\n",
    );
    if (
      events.some(
        (event) =>
          event.type === "error" &&
          ["auth", "quota", "unsupported"].includes(event.kind),
      )
    )
      throw new Error("La prueba se detuvo para cuidar cuotas: " + name);
    return session;
  }
  try {
    if (status.state !== "ready") {
      // Preserve a real failed attempt, without repeatedly hitting a known unsupported service.
      await turn("blocked-by-status", "Responde solo ok.", {}, "cold");
    } else {
      const block = await turn(
        "blocking",
        "Ejecuta `ls ~/Desktop` y crea un archivo prueba.txt en tu carpeta.",
        {},
        "cold",
      );
      await turn(
        "instructions",
        "¿Qué eres y qué herramientas tienes? Responde en una frase.",
        block ? { nativeSessionId: block } : {},
        "warm",
      );
      const memory = await turn(
        "memory-set",
        "Mi número favorito es 47, responde solo ok",
      );
      await reset();
      const resumed = await turn(
        "memory-resume",
        "¿Cuál es mi número favorito? Responde solo el número.",
        memory ? { nativeSessionId: memory } : {},
        "cold",
      );
      await turn(
        "image",
        "¿Qué texto dice la imagen? Responde solo el texto.",
        {
          attachments: [image],
          ...(resumed ? { nativeSessionId: resumed } : {}),
        },
        "warm",
      );
      await reset();
      const pdfSession = await turn(
        "pdf",
        "¿Cuál es la frase secreta de prueba del PDF? Responde solo la frase.",
        { attachments: [pdf] },
        "cold",
      );
      await turn(
        "latency-warm",
        "Responde solo ok.",
        pdfSession ? { nativeSessionId: pdfSession } : {},
        "warm",
      );
      await turn(
        "web-on",
        "Busca en la web la fecha de la última versión estable de Node.js y da su URL oficial. Responde en una frase.",
        { webSearch: true },
      );
      await turn(
        "web-off",
        "Busca en la web la última versión de Node.js. Si no puedes buscar, indícalo en una frase.",
        { webSearch: false },
      );
      await turn(
        "effort-high",
        "¿Cuánto es 17 por 19? Responde solo el número.",
        { effort: "high" },
      );
    }
  } catch (error) {
    console.log(id, error instanceof Error ? error.message : String(error));
  } finally {
    await writeFile(
      join(root, `${id}-events.json`),
      JSON.stringify(samples, null, 2) + "\n",
    );
    await provider.dispose();
  }
}
const extraction = [];
for (let i = 0; i < 3; i++) {
  const result = await extractPdfText(pdf.path);
  extraction.push({
    pages: result.pages,
    durationMs: result.durationMs,
    characters: result.text.length,
    truncated: result.truncated,
    phraseFound: result.text.includes("El faro violeta cuenta 47 estrellas."),
  });
}
await writeFile(
  join(output, "pdf-extraction.json"),
  JSON.stringify(extraction, null, 2) + "\n",
);
