import { expect, it, vi } from 'vitest';
import { DeltaBatcher } from '../../src/renderer/delta-batcher.js';
import type { ChatEnvelope } from '../../src/shared/ipc.js';
it('coalesces tokens in one frame, preserves reasoning order and flushes before terminal events', () => {
 const emit=vi.fn(), schedule=vi.fn(()=>1), cancel=vi.fn();
 const batch=new DeltaBatcher(emit,schedule,cancel);
 const token=(type:'text-delta'|'thinking-delta',text:string):ChatEnvelope=>({chatId:'a',messageId:'b',event:{type,text}});
 batch.push(token('text-delta','á'));batch.push(token('text-delta','b'));
 batch.push(token('thinking-delta','reason'));
 expect(emit).not.toHaveBeenCalled();expect(schedule).toHaveBeenCalledOnce();
 batch.push({chatId:'a',messageId:'b',event:{type:'done'}});
 expect(emit.mock.calls.map(([e])=>e.event)).toEqual([{type:'text-delta',text:'áb'},{type:'thinking-delta',text:'reason'},{type:'done'}]);
 batch.flush();expect(emit).toHaveBeenCalledTimes(3);
});
