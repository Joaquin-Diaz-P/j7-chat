import { describe, expect, it } from "vitest";
import { CODEX_SAFE_CONFIG } from "../src/main/providers/codex.js";
import { geminiSettings } from "../src/main/providers/gemini.js";
import {
  freeZenModels,
  openCodeConfig,
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
  it("Gemini uses an empty or web-only core allowlist", () => {
    expect(
      geminiSettings(false, "gemini-2.5-flash", "normal").tools.core,
    ).toEqual([]);
    expect(geminiSettings(true, "gemini-2.5-flash", "high").tools.core).toEqual(
      ["google_web_search", "web_fetch"],
    );
  });
  it("sets and resets Gemini thinking independently from web", () => {
    expect(
      geminiSettings(false, "gemini-2.5-flash", "normal").modelConfigs
        .customOverrides[0]?.modelConfig.generateContentConfig.thinkingConfig,
    ).toEqual({ thinkingBudget: 0 });
    expect(
      geminiSettings(false, "gemini-3-flash-preview", "high").modelConfigs
        .customOverrides[0]?.modelConfig.generateContentConfig.thinkingConfig,
    ).toEqual({ thinkingLevel: "HIGH" });
  });
  it("OpenCode defaults to deny and only grants web actions", () => {
    expect(openCodePermissions(false)).toEqual([
      { action: "*", resource: "*", effect: "deny" },
    ]);
    expect(
      openCodePermissions(true)
        .filter((rule) => rule.effect === "allow")
        .map((rule) => rule.action),
    ).toEqual(["websearch", "webfetch"]);
    expect(openCodeConfig("chat").agents.j7.system).toBe("chat");
    expect(openCodeConfig("chat").plugins).toEqual([]);
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
