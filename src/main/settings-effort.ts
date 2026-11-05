import type {ModelInfo} from './providers/types.js';
import {levels} from '../shared/effort.js';
import {strings} from '../renderer/strings.js';
export function validateEffortUpdates(raw: unknown, models: ModelInfo[]): Record<string,string> {
 if(!raw || typeof raw!=='object' || Array.isArray(raw))throw Error(strings.optionUnsupported);
 const result: Record<string,string>={};
 for(const [key,value] of Object.entries(raw)) {
  const model=models.find(m=>`${m.provider}:${m.id}`===key);
  if(!model || typeof value!=='string' || !levels(model).includes(value))throw Error(strings.optionUnsupported);
  result[key]=value;
 }
 return result;
}
