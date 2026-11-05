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
export function chooseDefaultModel(models: ModelInfo[], preferred: string | null): ModelInfo | undefined {
  return models.find(m => modelKey(m) === preferred) ?? models[0];
}
export class ModelCatalog {
  readonly providers: Map<ProviderId, ChatProvider>;
  private models = new Map<ProviderId, ModelInfo[]>();
  private statuses: Partial<Record<ProviderId, ProviderStatus>> = {};
  private expires = new Map<ProviderId, number>();
  private pending = new Map<ProviderId, Promise<void>>();
  private tails = new Map<ProviderId, Promise<unknown>>();
  private disposed = false;
  constructor(private settings?: SettingsStore, providers?: ChatProvider[], private changed: () => void = () => {}, private now = Date.now) {
    this.providers = new Map((providers ?? (process.env.J7_MOCK === "1" ? [createProvider("mock-a"), createProvider("mock-b")] : REGISTERED_PROVIDERS.map(id => createProvider(id)))).map(p => [p.id, p]));
  }
  snapshot(): CatalogSnapshot {
    return structuredClone({ models: [...this.providers.keys()].flatMap(id => this.models.get(id) ?? []), statuses: this.statuses, favorites: this.settings?.value.favorites ?? [], defaultModel: this.settings?.value.defaultModel ?? null });
  }
  exclusive<T>(id: ProviderId, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let started = false;
    const previous = this.tails.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      if (this.disposed) throw new Error("Catalog disposed");
      signal?.throwIfAborted();
      started = true;
      return task();
    });
    this.tails.set(id, next);
    void next.finally(() => { if (this.tails.get(id) === next) this.tails.delete(id); }).catch(() => {});
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
          if (!this.disposed) this.changed();
        }
      });
      this.pending.set(id, task);
      void task.finally(() => this.pending.delete(id)).catch(() => {});
      return task;
    })).then(() => {});
  }
  favorite(key: string) {
    if (!this.snapshot().models.some(m => modelKey(m) === key)) return;
    const favorites = this.settings?.value.favorites ?? [];
    this.settings?.update({ favorites: favorites.includes(key) ? favorites.filter(k => k !== key) : [...favorites, key] });
    this.changed();
  }
  setDefault(key: string) {
    if (this.snapshot().models.some(m => modelKey(m) === key)) this.settings?.update({ defaultModel: key });
    this.changed();
  }
  async prewarm() {
    await Promise.allSettled([...this.providers].map(([id, provider]) => this.exclusive(id, async () => {
      try { await bounded(provider.getStatus()); }
      catch { this.statuses[id] = { state: "error" }; this.models.set(id, []); this.changed(); }
    })));
  }
  async dispose() {
    this.disposed = true;
    await Promise.allSettled([...this.providers.values()].map(p => p.shutdown ? p.shutdown() : p.dispose()));
  }
}
