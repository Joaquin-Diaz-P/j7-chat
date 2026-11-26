import type { ChatEnvelope } from '../shared/ipc.js';
/** Coalesce adjacent token deltas; flush before non-token events and authoritative snapshots. */
export class DeltaBatcher {
  private pending: ChatEnvelope[] = [];
  private frame: number | undefined;
  constructor(private emit: (event: ChatEnvelope) => void, private schedule: (callback: FrameRequestCallback) => number = callback => globalThis.requestAnimationFrame(callback), private cancel: (id:number) => void = id => globalThis.cancelAnimationFrame(id)) {}
  flush = () => {
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
    const pending = this.pending; this.pending = [];
    for (const event of pending) this.emit(event);
  };
  push(envelope: ChatEnvelope) {
    const event = envelope.event;
    if (event.type !== 'text-delta' && event.type !== 'thinking-delta') { this.flush(); this.emit(envelope); return; }
    const last = this.pending.at(-1);
    if (last?.chatId === envelope.chatId && last.messageId === envelope.messageId && last.event.type === event.type) last.event.text += event.text;
    else this.pending.push({...envelope, event:{...event}});
    if (this.frame === undefined) this.frame = this.schedule(this.flush);
  }
}
