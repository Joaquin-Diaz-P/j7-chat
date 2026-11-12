import { describe, expect, it } from "vitest";
import { CODEX_SAFE_CONFIG } from "../src/main/providers/codex.js";
import { geminiSettings, geminiAgent } from "../src/main/providers/gemini.js";
import {
  freeZenModels,
  openCodePermissions,
  type ZenModel,
} from "../src/main/providers/opencode.js";
import {
  cleanEnvironment,
  classifyError,
  ProviderError,
} from "../src/main/providers/runtime.js";
import { createProvider } from "../src/main/providers/registry.js";
const model: ZenModel = {
  id: "free",
  name: "Free",
  providerID: "opencode",
  type: "chat",
  capabilities: { input: ["text", "image"] },
  variants: [{ id: "high" }],
  cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }],
};
describe("only free Zen models", () => {
  it("accepts zero cost tiers and maps capabilities", () =>
    expect(freeZenModels([model])).toEqual([
      {
        id: "free",
        label: "Free",
        provider: "opencode",
        free: true,
        supportsImages: true,
        supportsPdf: false,
        supportsEffort: true,
        reasoningEfforts: ["high"],
      },
    ]));
  it.each([
    { ...model, providerID: "openai" },
    { ...model, type: "image" },
    { ...model, cost: [{ input: 0, output: 0 }] },
    { ...model, cost: [{ input: 0, output: 1 }] },
    { ...model, cost: [{ input: 0, output: 0, cache: { read: 1 } }] },
    { ...model, cost: [] },
    { ...model, cost: undefined },
    { ...model, enabled: false },
    { ...model, status: "deprecated" },
    {
      ...model,
      cost: [
        { input: 0, output: 0 },
        { input: 0.01, output: 0 },
      ],
    },
  ])("rejects paid, unpriced, unavailable or external models", (candidate) =>
    expect(freeZenModels([candidate as ZenModel])).toEqual([]),
  );
});
describe("isolation policies", () => {
  it("drops all provider credentials, startup injection and inherited configuration", () => {
    const env = cleanEnvironment({
      HOME: "/home/test",
      ANTHROPIC_API_KEY: "sentinel",
      OPENAI_API_KEY: "sentinel",
      GEMINI_API_KEY: "sentinel",
      GOOGLE_API_KEY: "sentinel",
      AWS_SECRET_ACCESS_KEY: "sentinel",
      OPENROUTER_API_KEY: "sentinel",
      CLAUDE_CODE_OAUTH_TOKEN: "sentinel",
      NODE_OPTIONS: "--import=evil",
      CODEX_HOME: "/evil",
      OPENCODE_CONFIG_CONTENT: "evil",
      PATH: "/evil",
    });
    expect(Object.values(env)).not.toContain("sentinel");
    expect(env).not.toHaveProperty("NODE_OPTIONS");
    expect(env.PATH).not.toContain("evil");
    expect(env.HOME).toBe("/home/test");
  });
  it("disables Codex execution, connectors, hooks and user documents", () => {
    for (const key of [
      "features.shell_tool",
      "features.unified_exec",
      "features.view_image",
      "features.apps",
      "features.plugins",
      "features.hooks",
      "features.multi_agent",
    ])
      expect(CODEX_SAFE_CONFIG[key as keyof typeof CODEX_SAFE_CONFIG]).toBe(
        false,
      );
    expect(CODEX_SAFE_CONFIG.project_doc_max_bytes).toBe(0);
  });
  it("Antigravity exposes only chat or web tools and denies local execution", () => {
    expect(geminiAgent("instructions", false)).toContain("tools: []");
    expect(geminiAgent("instructions", true)).toContain('tools: ["search_web","read_url_content"]');
    expect(geminiAgent("instructions", true)).toContain("subagent: false");
    expect(geminiSettings(false).permissions.deny).toEqual([
      "command(*)", "read_file(*)", "write_file(*)", "execute_url(*)", "mcp(*)", "read_url(*)",
    ]);
    expect(geminiSettings(true).permissions.deny).not.toContain("read_url(*)");
    expect(geminiSettings(true)).toMatchObject({ toolPermission: "strict", useG1Credits: false, disableSlashCommands: true });
  });
  it("OpenCode asks for every action and only grants web actions", () => {
    expect(openCodePermissions(false)).toEqual([
      { action: "*", resource: "*", effect: "ask" },
    ]);
    expect(
      openCodePermissions(true)
        .filter((rule) => rule.effect === "allow")
        .map((rule) => rule.action),
    ).toEqual(["websearch", "webfetch"]);
  });
  it.each(["claude", "codex", "gemini", "opencode"] as const)(
    "reports missing %s without starting a process",
    async (id) => {
      const provider = createProvider(id, { binaryPath: "/j7-missing" });
      expect(await provider.getStatus()).toEqual({ state: "not_installed" });
      await provider.dispose();
    },
  );
});
describe("Spanish errors", () => {
  it.each([
    ["HTTP 401", "auth"],
    ["HTTP 429", "quota"],
    ["provider.free-limit 429", "quota"],
    ["unsupported model", "unsupported"],
    [
      "This client is no longer supported; migrate to Antigravity",
      "unsupported",
    ],
    ["cancelled", "other"],
  ])("classifies %s", (message, kind) =>
    expect(classifyError(new Error(message)).kind).toBe(kind),
  );
  it("keeps explicit safe errors and hides raw secrets", () => {
    expect(
      classifyError(new ProviderError("unsupported", "Opción no disponible."))
        .message,
    ).toBe("Opción no disponible.");
    expect(
      classifyError(new Error("private-token-value")).message,
    ).not.toContain("private-token-value");
  });
});
it("marks opaque resume failures for full-context fallback without retrying auth/quota", async () => {
  const { resumeError } = await import("../src/main/providers/runtime.js");
  expect(resumeError(new Error("RPC -32603"))).toMatchObject({ kind: "other", recovery: "session" });
  expect(resumeError(new Error("process exited"))).toMatchObject({ kind: "other", recovery: "process" });
  expect(resumeError(new Error("401 unauthorized"))).not.toHaveProperty("recovery");
  expect(resumeError(new Error("429 quota"))).not.toHaveProperty("recovery");
});
