import { MockProvider } from "./mock.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { GeminiProvider } from "./gemini.js";
import { OpenCodeProvider } from "./opencode.js";
import type { ProviderOptions } from "./runtime.js";
import type { ChatProvider, ProviderId } from "./types.js";

export function createProvider(
  id: ProviderId,
  options: ProviderOptions = {},
): ChatProvider {
  switch (id) {
    case "mock": return new MockProvider();
    case "claude":
      return new ClaudeProvider(options);
    case "codex":
      return new CodexProvider(options);
    case "gemini":
      return new GeminiProvider(options);
    case "opencode":
      return new OpenCodeProvider(options);
  }
}
// Gemini stays out of v1: Google rejects Gemini CLI for individual accounts.
export const REGISTERED_PROVIDERS = ["claude", "codex", "opencode"] as const;

export function createRegistry(options: ProviderOptions = {}) {
  const providers = new Map<ProviderId, ChatProvider>(
    REGISTERED_PROVIDERS.map((id) => [
      id,
      createProvider(id, options),
    ]),
  );
  return {
    providers,
    async statuses() {
      return Object.fromEntries(
        await Promise.all(
          [...providers].map(async ([id, provider]) => [
            id,
            await provider.getStatus(),
          ]),
        ),
      );
    },
    async models() {
      return (
        await Promise.all(
          [...providers.values()].map(async (provider) =>
            (await provider.getStatus()).state === "ready"
              ? provider.listModels()
              : [],
          ),
        )
      ).flat();
    },
    async dispose() {
      await Promise.all(
        [...providers.values()].map((provider) => provider.dispose()),
      );
    },
  };
}
