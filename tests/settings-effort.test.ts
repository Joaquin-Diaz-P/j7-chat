import {describe,it,expect} from 'vitest';
import {validateEffortUpdates} from '../src/main/settings-effort.js';
import type {ModelInfo} from '../src/main/providers/types.js';
const model:ModelInfo={id:'a',provider:'mock',label:'A',supportsImages:false,supportsPdf:false,supportsEffort:true,reasoningEfforts:['low','high']};
describe('settings effort validation',()=>{
 it('accepts supported levels for known models',()=>expect(validateEffortUpdates({'mock:a':'high'},[model])).toEqual({'mock:a':'high'}));
 it.each([null,[],{'mock:missing':'high'},{'mock:a':'max'},{'mock:a':1},{'mock:a':'HIGH'}])('rejects invalid updates %j',raw=>expect(()=>validateEffortUpdates(raw,[model])).toThrow());
 it('rejects levels for models without reasoning',()=>expect(()=>validateEffortUpdates({'mock:a':'low'},[{...model,reasoningEfforts:[]}])).toThrow());
});
