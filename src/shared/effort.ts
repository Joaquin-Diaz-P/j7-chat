import type { ModelInfo } from "../main/providers/types.js";
const order = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode"];
export function levels(model: ModelInfo): string[] { return model.reasoningEfforts ?? (model.supportsEffort ? ["low", "high"] : []); }
export function resolveEffort(model: ModelInfo, requested: string): string {
  const supported = levels(model);
  if (!supported.length) return "low";
  requested = requested === "normal" ? "low" : requested;
  if (supported.includes(requested)) return requested;
  const rank = order.indexOf(requested);
  const nearest = [...supported].sort((a,b) => Math.abs(order.indexOf(a) - rank) - Math.abs(order.indexOf(b) - rank))[0]!;
  return nearest;
}
export function initialEffort(model: ModelInfo, saved: Record<string,string> = {}): string {
  return resolveEffort(model, saved[`${model.provider}:${model.id}`] ?? (levels(model).includes("low") ? "low" : levels(model)[0] ?? "low"));
}
