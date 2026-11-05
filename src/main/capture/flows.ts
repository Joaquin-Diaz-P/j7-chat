import type { CaptureEvent, CapturePhase, CaptureState } from '../../shared/capture.js';
import type { Attachment } from '../providers/types.js';
import type { Hex } from '../voice/hex.js';
export interface FlowPorts {
  capture(): Promise<Attachment>; show(): void; hide(): void; visible(): boolean;
  emit(event: CaptureEvent): void; protect(value: boolean): void;
}
export class CaptureFlows {
  state: CaptureState = { phase:'idle', seconds:0 };
  private generation = 0;
  private recording = false;
  private stopping: ReturnType<Hex["stop"]> | undefined;
  private stop() { return this.stopping ??= this.hex.stop().finally(() => { this.stopping = undefined; }); }
  private started = new Date();
  private timer: ReturnType<typeof setInterval> | undefined;
  private attachment: Attachment | undefined;
  private wasVisible = false;
  private released = false;
  constructor(private ports: FlowPorts, private hex: Pick<Hex,'begin'|'start'|'stop'|'recoverSince'>, private now = Date.now) {}
  private phase(phase: CapturePhase) { this.state = { phase, seconds:0 }; this.ports.emit({state:this.state}); }
  async question() {
    if (['capturing','opening','listening','transcribing','recovering','queued'].includes(this.state.phase)) return;
    this.phase('capturing');
    try { const attachment = await this.ports.capture(); this.ports.show(); this.phase('idle'); this.ports.emit({state:this.state,attachment}); }
    catch { this.ports.show(); this.phase('failed'); }
  }
  async begin() {
    if (this.stopping || ['capturing','opening','listening','transcribing','recovering','queued','sending'].includes(this.state.phase)) { this.ports.emit({state:{...this.state,busy:true}}); return; }
    this.attachment = undefined;
    const token = ++this.generation; this.released = false; this.wasVisible = this.ports.visible();
    this.phase('capturing'); this.ports.protect(true);
    try {
      const attachment = await this.ports.capture();
      if (token !== this.generation) return;
      this.attachment = attachment; this.ports.show(); this.ports.emit({state:this.state,attachment});
      this.started = new Date(this.now());
      // Mark before awaiting: cancellation must stop even an in-flight start.
      this.recording = true;
      let result = await this.hex.begin();
      if (result.code === 3 && token === this.generation) { this.phase('opening'); await this.hex.start(); if (token === this.generation) result = await this.hex.begin(); }
      if (token !== this.generation) { await this.hex.stop(); this.recording = false; return; }
      if (result.code !== 0) throw new Error('Hex start');
      this.phase('listening');
      if (this.released) await this.end();
    } catch {
      if (this.recording) { await this.stop(); this.recording = false; }
      if (token === this.generation) { this.phase('failed'); this.ports.protect(false); }
    }
  }
  async end() {
    if (this.state.phase === 'capturing' || this.state.phase === 'opening') { this.released = true; return; }
    if (this.state.phase !== 'listening') return;
    const token = this.generation; this.phase('transcribing');
    const start = this.now();
    this.timer = setInterval(() => { this.state = {...this.state,seconds:Math.floor((this.now()-start)/1000)}; this.ports.emit({state:this.state}); }, 1000);
    const result = await this.stop(); this.recording = false; clearInterval(this.timer);
    if (token !== this.generation) return;
    if (result.code === 4) { this.phase('empty'); this.ports.protect(false); setTimeout(() => { if (this.state.phase === 'empty') this.phase('idle'); },2000); return; }
    if (result.code !== 0 || !result.text) { await this.recover(); return; }
    this.deliver(result.text);
  }
  private deliver(text: string) { this.phase('sending'); this.ports.emit({state:this.state,text,autoSend:true}); }
  async recover() {
    const token = this.generation; this.phase('recovering');
    const text = await this.hex.recoverSince(this.started);
    if (token !== this.generation) return;
    if (text) this.deliver(text); else { this.phase('failed'); this.state = {...this.state,recoverable:true}; this.ports.emit({state:this.state}); this.ports.protect(false); }
  }
  acknowledge(phase: 'idle'|'queued'|'failed') { this.phase(phase); this.ports.protect(phase === 'queued'); }
  async cancel(chord = false) {
    ++this.generation; clearInterval(this.timer); this.phase('cancelled'); this.ports.protect(false);
    if (chord && this.attachment) { this.ports.emit({state:this.state,removeId:this.attachment.id!}); if (!this.wasVisible) this.ports.hide(); }
    if (this.recording) { await this.stop(); this.recording = false; }
  }
  async dispose() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.cancel(), new Promise<void>(resolve => { timer = setTimeout(resolve, 3000); })]);
    clearTimeout(timer);
    (this.hex as { abort?: () => void }).abort?.();
  }
}
