import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { resolveBinary } from "../src/main/paths.js";
const binary = await resolveBinary("codex");
if (!binary) throw new Error("Instala Codex antes de generar sus tipos.");
const temporary = await mkdtemp(join(tmpdir(), "j7-codex-types-"));
const output = resolve("src/main/providers/generated/codex");
try {
  execFileSync(binary, [
    "app-server",
    "generate-ts",
    "--experimental",
    "--out",
    temporary,
  ]);
  const seen = new Set<string>();
  async function copy(path: string): Promise<void> {
    if (seen.has(path)) return;
    seen.add(path);
    const original = await readFile(path, "utf8");
    const dependencies = [...original.matchAll(/from "(\.[^"]+)"/g)];
    for (const match of dependencies)
      await copy(resolve(dirname(path), `${match[1]}.ts`));
    const target = join(output, relative(temporary, path));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      original.replace(/from "(\.[^"]+)"/g, 'from "$1.js"'),
    );
  }
  for (const file of [
    "v2/ThreadStartParams.ts",
    "v2/ThreadResumeParams.ts",
    "v2/TurnStartParams.ts",
    "v2/ModelListResponse.ts",
  ])
    await copy(join(temporary, file));
  console.log(
    `Generados ${seen.size} archivos de tipos con ${execFileSync(binary, ["--version"], { encoding: "utf8" }).trim()}.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
