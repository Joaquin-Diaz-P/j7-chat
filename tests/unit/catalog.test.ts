import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelCatalog, chooseInitialModel, MODEL_CACHE_MS } from "../../src/main/chat/catalog.js";
import { SettingsStore } from "../../src/main/settings.js";
import { REGISTERED_PROVIDERS } from "../../src/main/providers/registry.js";
import type { ChatProvider, ModelInfo, ProviderId } from "../../src/main/providers/types.js";
const model = (provider: ProviderId): ModelInfo => ({ id: provider, label: provider, provider, supportsImages: false, supportsPdf: false, supportsEffort: true });
const provider = (id: ProviderId): ChatProvider => ({ id, getStatus: vi.fn(async () => ({ state: "ready" as const })), listModels: vi.fn(async () => [model(id)]), async *runTurn() {}, dispose: vi.fn(async () => {}) });
afterEach(() => vi.useRealTimers());
describe("D1–D5 model catalog", () => {
  it("registers exactly Claude, GPT and Zen in production", () => { expect(REGISTERED_PROVIDERS).toEqual(["claude", "codex", "opencode"]); });
  it("publishes fast programs while a slow one is still connecting", async () => {
    let release!: () => void;
    const slow = provider("claude"), fast = provider("codex");
    slow.getStatus = () => new Promise(resolve => { release = () => resolve({ state: "ready" }); });
    const catalog = new ModelCatalog(undefined, [slow, fast]);
    const pending = catalog.refresh();
    await vi.waitFor(() => expect(catalog.snapshot().models.map(m => m.id)).toEqual(["codex"]));
    release(); await pending;
    expect(catalog.snapshot().models.map(m => m.id)).toEqual(["claude", "codex"]);
    await catalog.dispose();
  });
  it("deduplicates background requests and expires the cache after ten minutes", async () => {
    let time = 0;
    const p = provider("claude");
    const catalog = new ModelCatalog(undefined, [p], () => {}, () => time);
    await Promise.all([catalog.refresh(), catalog.refresh()]);
    await catalog.refresh();
    expect(p.listModels).toHaveBeenCalledTimes(1);
    time = MODEL_CACHE_MS;
    await catalog.refresh();
    expect(p.listModels).toHaveBeenCalledTimes(2);
    const copy = catalog.snapshot(); copy.models[0]!.label = "bad";
    expect(catalog.snapshot().models[0]?.label).toBe("claude");
    await catalog.dispose();
  });
  it("hides unavailable models and falls back from an unavailable last model without changing settings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "j7-catalog-"));
    const settings = new SettingsStore(join(dir, "settings.json"));
    settings.update({ lastModel: "claude:claude" });
    const claude = provider("claude"), codex = provider("codex");
    claude.getStatus = async () => ({ state: "not_installed" });
    const catalog = new ModelCatalog(settings, [claude, codex]);
    try {
      await catalog.refresh();
      const snapshot = catalog.snapshot();
      expect(snapshot.statuses.claude?.state).toBe("not_installed");
      expect(claude.listModels).not.toHaveBeenCalled();
      expect(chooseInitialModel(snapshot.models, snapshot.lastModel)?.provider).toBe("codex");
      catalog.favorite("codex:codex"); settings.update({lastModel:"codex:codex"});
      expect(new SettingsStore(join(dir, "settings.json")).value).toMatchObject({ favorites: ["codex:codex"], lastModel: "codex:codex" });
      catalog.favorite("codex:codex"); expect(catalog.snapshot().favorites).toEqual([]);
      expect(chooseInitialModel([], null)).toBeUndefined();
    } finally { await catalog.dispose(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("shuts down a program even while startup is pending", async () => {
    let release!: () => void;
    const p = provider("claude");
    p.getStatus = () => new Promise(resolve => { release = () => resolve({ state: "ready" }); });
    p.shutdown = vi.fn(async () => {});
    const catalog = new ModelCatalog(undefined, [p]);
    const refresh = catalog.refresh();
    await vi.waitFor(() => expect(release).toBeTypeOf("function")); await catalog.dispose();
    expect(p.shutdown).toHaveBeenCalledOnce();
    release(); await refresh;
    expect(p.listModels).not.toHaveBeenCalled();
    expect(catalog.snapshot().models).toEqual([]);
  });
  it("supports the two independent offline mock programs", async () => {
    vi.stubEnv("J7_MOCK", "1");
    try {
      const catalog = new ModelCatalog(); await catalog.refresh();
      expect(catalog.snapshot().models.map(m => [m.id, m.provider, m.supportsEffort])).toEqual([["mock-a", "mock-a", true], ["mock-b", "mock-b", false]]);
      await catalog.dispose();
    } finally { vi.unstubAllEnvs(); }
  });
});
it("revalidates on explicit selector refresh while keeping cached models immediately available", async () => {
  const p = provider("claude"); const catalog = new ModelCatalog(undefined, [p]);
  await catalog.refresh();
  const pending = catalog.refresh(true);
  expect(catalog.snapshot().models).toHaveLength(1);
  await pending; expect(p.listModels).toHaveBeenCalledTimes(2);
  await catalog.dispose();
});
it('times out a hung status, publishes error and releases its queue', async () => {
  vi.useFakeTimers();
  const p = provider('claude');
  p.getStatus = () => new Promise(() => {});
  const catalog = new ModelCatalog(undefined, [p]);
  const refresh = catalog.refresh();
  await vi.advanceTimersByTimeAsync(10_001);
  await refresh;
  expect(catalog.snapshot().statuses.claude?.state).toBe('error');
  expect(catalog.snapshot().models).toEqual([]);
  expect(catalog.busy('claude')).toBe(false);
  expect(await catalog.exclusive('claude', async () => 42)).toBe(42);
  await catalog.dispose();
});
it("prefers the last model, then the first available favorite, then the catalog", () => {
 const models = [model("claude"), model("codex")];
 expect(chooseInitialModel(models,"claude:claude",["codex:codex"])).toBe(models[0]);
 expect(chooseInitialModel(models,"missing",["missing","codex:codex"])).toBe(models[1]);
 expect(chooseInitialModel(models,null,["missing"])).toBe(models[0]);
});
