import { access, mkdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderId } from "./providers/types.js";

const exec = promisify(execFile);
export function getPaths(dataDir = process.env.J7_DATA_DIR, home = homedir()) {
  const data = resolve(
    dataDir || join(home, "Library", "Application Support", "J7 Chat"),
  );
  return {
    data,
    workspace: join(data, "workspace"),
    providers: join(data, "providers"),
  };
}
export async function ensurePaths(dataDir?: string) {
  const paths = getPaths(dataDir);
  await Promise.all(
    Object.values(paths).map((path) =>
      mkdir(path, { recursive: true, mode: 0o700 }),
    ),
  );
  return paths;
}
export interface BinaryResolverOptions {
  home?: string;
  directories?: string[];
  loginShell?: (binary: string) => Promise<string>;
  override?: string;
}
async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
export async function resolveBinary(
  binary: ProviderId,
  options: BinaryResolverOptions = {},
): Promise<string | undefined> {
  if (!["claude", "codex", "gemini", "opencode"].includes(binary))
    throw new Error("Programa desconocido");
  if (options.override !== undefined)
    return isAbsolute(options.override) && (await executable(options.override))
      ? options.override
      : undefined;
  const command = binary === "gemini" ? "agy" : binary;
  const home = options.home ?? homedir();
  for (const directory of options.directories ?? [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".local/bin"),
    join(home, ".opencode/bin"),
  ]) {
    const path = join(directory, command);
    if (await executable(path)) return path;
  }
  try {
    const found = (
      await (
        options.loginShell ??
        (async (name) =>
          (
            await exec("/bin/zsh", ["-lc", `command -v ${name}`], {
              timeout: 5_000,
              maxBuffer: 4096,
              env: { HOME: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
            })
          ).stdout)
      )(command)
    ).trim();
    if (isAbsolute(found) && !found.includes("\n") && (await executable(found)))
      return found;
  } catch {
    /* A missing login-shell command is the normal not-installed case. */
  }
  return undefined;
}
