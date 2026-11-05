import { expect, it } from "vitest";
import { selectorModels } from "../../src/renderer/components/ModelSelector.js";
import type { CatalogSnapshot } from "../../src/shared/ipc.js";
const models = ["claude", "codex"].map(provider=>({provider, id:provider, label:`Model ${provider}`, supportsImages:false, supportsPdf:false, supportsEffort:false})) as CatalogSnapshot["models"];
const catalog: CatalogSnapshot = {models, favorites:["gemini:missing"], statuses:{}, lastModel:null};
it("falls back to all models when favorites are unavailable",()=>{
 expect(selectorModels(catalog,"favorites","")).toEqual(models);
 expect(selectorModels({...catalog,favorites:["codex:codex"]},"favorites","")).toEqual([models[1]]);
});
it("searches all available programs despite the active group or favorites",()=>{
 expect(selectorModels(catalog,"claude","codex")).toEqual([models[1]]);
 expect(selectorModels(catalog,"favorites","Model")).toEqual(models);
 expect(selectorModels(catalog,"claude","missing")).toEqual([]);
});
