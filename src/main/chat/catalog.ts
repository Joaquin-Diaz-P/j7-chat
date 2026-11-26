import type { CatalogSnapshot } from "../../shared/ipc.js";
import type { ChatProvider, ModelInfo, ProviderId, ProviderStatus } from "../providers/types.js";
import { createProvider, REGISTERED_PROVIDERS } from "../providers/registry.js";
import type { SettingsStore } from "../settings.js";
export const STATUS_TIMEOUT_MS = 10_000;
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Program timeout")), STATUS_TIMEOUT_MS); })]); }
  finally { clearTimeout(timer); }
}
export const MODEL_CACHE_MS = 10 * 60_000;
export const modelKey = (model: Pick<ModelInfo, "provider" | "id">) => `${model.provider}:${model.id}`;
export function chooseInitialModel(models: ModelInfo[], preferred: string | null, favorites: string[] = []): ModelInfo | undefined {
  return models.find(m => modelKey(m) === preferred) ?? models.find(m => favorites.includes(modelKey(m))) ?? models[0];
}
export class ModelCatalog {
  readonly providers: Map<ProviderId, ChatProvider>;
  private models = new Map<ProviderId, ModelInfo[]>();
  private statuses: Partial<Record<ProviderId, ProviderStatus>> = {};
  private expires = new Map<ProviderId, number>();
  private pending = new Map<ProviderId, Promise<void>>();
  private tails = new Map<ProviderId, Promise<unknown>>();
  private disposed = false;
  private idle = new Map<ProviderId, ReturnType<typeof setTimeout>>();
  private selected: ProviderId | undefined;
  private lastUsed = new Map<ProviderId, number>();
  private armIdle(id: ProviderId) {
    clearTimeout(this.idle.get(id));
    if (id === this.selected || this.disposed || this.busy(id)) return;
    const timer = setTimeout(() => {
      this.idle.delete(id);
      if (this.busy(id)) return;
      const provider = this.providers.get(id);
      if (!provider) return;
      // Queue a new turn behind shutdown if it arrives while the process is exiting.
      const release = provider.dispose(); this.tails.set(id, release);
      void release.finally(() => { if (this.tails.get(id) === release) this.tails.delete(id); }).catch(() => {});
    }, Math.max(0, MODEL_CACHE_MS - (this.now() - (this.lastUsed.get(id) ?? this.now()))));
    timer.unref(); this.idle.set(id, timer);
  }
  select(id: ProviderId) {
    const previous = this.selected; this.selected = id;
    clearTimeout(this.idle.get(id)); this.idle.delete(id);
    if (previous && previous !== id) this.armIdle(previous);
  }
  constructor(private settings?: SettingsStore, providers?: ChatProvider[], private changed: () => void = () => {}, private now = Date.now) {
    this.selected = settings?.value.lastModel?.split(":")[0] as ProviderId | undefined;
    this.providers = new Map((providers ?? (process.env.J7_MOCK === "1" ? [createProvider("mock-a"), createProvider("mock-b")] : REGISTERED_PROVIDERS.map(id => createProvider(id)))).map(p => [p.id, p]));
  }
  snapshot(): CatalogSnapshot {
    return structuredClone({ effortByModel: this.settings?.value.effortByModel ?? {}, models: [...this.providers.keys()].filter(id => !this.settings?.value.disabledProviders.includes(id)).flatMap(id => this.models.get(id) ?? []), statuses: this.statuses, favorites: this.settings?.value.favorites ?? [], lastModel: this.settings?.value.lastModel ?? null });
  }
  /** `discovery` tasks (status/catalog/release) do not count as use for the ten-minute idle close. */
  exclusive<T>(id: ProviderId, task: () => Promise<T>, signal?: AbortSignal, discovery = false): Promise<T> {
    let started = false;
    const previous = this.tails.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      if (this.disposed) throw new Error("Catalog disposed");
      signal?.throwIfAborted();
      clearTimeout(this.idle.get(id));
      started = true;
      return task();
    });
    this.tails.set(id, next);
    void next.finally(() => {
      if (!discovery) this.lastUsed.set(id, this.now());
      if (this.tails.get(id) === next) { this.tails.delete(id); this.armIdle(id); }
    }).catch(() => {});
    if (!signal) return next;
    return new Promise<T>((resolve, reject) => {
      const abort = () => { if (!started) reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      void next.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  busy(id: ProviderId) { return this.tails.has(id); }
  refresh(force = false): Promise<void> {
    return Promise.all([...this.providers].map(([id, provider]) => {
      if (this.pending.has(id)) return this.pending.get(id)!;
      if (!force && (this.expires.get(id) ?? 0) > this.now()) return Promise.resolve();
      const task = this.exclusive(id, async () => {
        const before = JSON.stringify([this.statuses[id], this.models.get(id)]);
        try {
          const status = await bounded(provider.getStatus());
          if (this.disposed) return;
          const models = status.state === "ready" ? await bounded(provider.listModels()) : [];
          if (this.disposed) return;
          this.statuses[id] = status;
          this.models.set(id, models);
        } catch {
          this.statuses[id] = { state: "error" };
          this.models.set(id, []);
        } finally {
          this.expires.set(id, this.now() + MODEL_CACHE_MS);
          if (!this.disposed && before !== JSON.stringify([this.statuses[id], this.models.get(id)])) this.changed();
        }
      }, undefined, true);
      this.pending.set(id, task);
      void task.finally(() => this.pending.delete(id)).catch(() => {});
      return task;
    })).then(async () => {
      if (this.disposed) return;
      const chosen = chooseInitialModel(this.snapshot().models, this.settings?.value.lastModel ?? null, this.settings?.value.favorites);
      if (!this.selected || !this.snapshot().models.some(m => m.provider === this.selected)) {
        if (chosen) this.select(chosen.provider);
      }
      // Close what discovery started. A provider with a turn queued or used in the last ten minutes keeps
      // its process; its idle timer closes it later.
      const recent = (id: ProviderId) => this.now() - (this.lastUsed.get(id) ?? -Infinity) < MODEL_CACHE_MS;
      await Promise.all([...this.providers].filter(([id]) => id !== this.selected && !this.busy(id) && !recent(id)).map(async ([id, provider]) => {
        await this.exclusive(id, () => provider.dispose(), undefined, true);
        if (this.selected !== id && !recent(id)) { clearTimeout(this.idle.get(id)); this.idle.delete(id); }
      }));
    });
  }
  favorite(key: string) {
    if (!this.snapshot().models.some(m => modelKey(m) === key)) return;
    const favorites = this.settings?.value.favorites ?? [];
    this.settings?.update({ favorites: favorites.includes(key) ? favorites.filter(k => k !== key) : [...favorites, key] });
    this.changed();
  }
  async prewarm(id = this.selected) {
    if (!id) return;
    this.select(id);
    const provider = this.providers.get(id);
    if (provider) await this.exclusive(id, async () => { await bounded(provider.getStatus()); });
  }
  async dispose() {
    this.disposed = true;
    for (const timer of this.idle.values()) clearTimeout(timer);
    this.idle.clear();
    await Promise.allSettled([...this.providers.values()].map(p => p.shutdown ? p.shutdown() : p.dispose()));
  }
}
