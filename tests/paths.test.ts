import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaths, resolveBinary } from "../src/main/paths.js";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "j7-paths-"));
  temporary.push(home);
  return home;
}
async function binary(path: string, mode = 0o755) {
  await writeFile(path, "#!/bin/sh\nexit 0\n");
  await chmod(path, mode);
  return path;
}
describe("paths and executable resolution", () => {
  it("uses Application Support and accepts an override", () => {
    expect(getPaths(undefined, "/Users/test").data).toBe(
      "/Users/test/Library/Application Support/J7 Chat",
    );
    expect(getPaths("/tmp/j7").workspace).toBe("/tmp/j7/workspace");
  });
  it("searches explicit directories without relying on PATH", async () => {
    const home = await setup(),
      first = join(home, "first"),
      second = join(home, "second");
    await mkdir(first);
    await mkdir(second);
    await binary(join(first, "codex"), 0o644);
    const path = await binary(join(second, "codex"));
    const fallback = vi.fn();
    expect(
      await resolveBinary("codex", {
        directories: [first, second],
        loginShell: fallback,
      }),
    ).toBe(path);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("falls back to the login shell and checks its result", async () => {
    const path = await binary(join(await setup(), "gemini"));
    expect(
      await resolveBinary("gemini", {
        directories: [],
        loginShell: async () => path + "\n",
      }),
    ).toBe(path);
    expect(
      await resolveBinary("gemini", {
        directories: [],
        loginShell: async () => "alias gemini=evil",
      }),
    ).toBeUndefined();
  });
  it("does not silently fall back when an explicit path is missing", async () => {
    const loginShell = vi.fn();
    expect(
      await resolveBinary("claude", { override: "/j7-missing", loginShell }),
    ).toBeUndefined();
    expect(loginShell).not.toHaveBeenCalled();
  });
  it("returns missing on shell errors and rejects untrusted names", async () => {
    expect(
      await resolveBinary("opencode", {
        directories: [],
        loginShell: async () => {
          throw new Error("missing");
        },
      }),
    ).toBeUndefined();
    await expect(
      resolveBinary("codex; echo unsafe" as "codex"),
    ).rejects.toThrow("desconocido");
  });
});
