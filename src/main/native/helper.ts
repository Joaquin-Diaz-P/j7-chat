import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import type { HelperReply } from '../../shared/capture.js';
export class NativeHelper extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<number, { resolve: (reply: HelperReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private closed = false;
  private restart: ReturnType<typeof setTimeout> | undefined;
  private keyCode = 61;
  constructor(private binary: string) { super(); }
  start() {
    if (this.closed || this.child) return;
    const child = spawn(this.binary, [], { stdio: 'pipe' }); this.child = child;
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const value = JSON.parse(line);
        if (['holdStart','holdEnd','holdCancel','tap','doubleTap','shortcutReleased','pointerDown','spaceChanged'].includes(value.event)) this.emit(value.event, value);
        const pending = this.pending.get(value.id);
        if (pending) { clearTimeout(pending.timer); this.pending.delete(value.id); pending.resolve(value); }
      } catch { /* Ignore malformed protocol lines. */ }
    });
    let ended = false;
    const failed = () => {
      if (ended) return; ended = true; this.child = undefined;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Helper disconnected')); }
      this.pending.clear(); this.emit('disconnect');
      if (!this.closed) this.restart = setTimeout(() => { this.start(); void this.watch(this.keyCode).catch(() => {}); }, 1000);
    };
    child.on('error', failed); child.on('exit', failed);
  }
  request(command: string, args: Record<string, unknown> = {}): Promise<HelperReply> {
    this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Helper timeout')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin.write(JSON.stringify({ id, command, ...args }) + '\n', error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    });
  }
  watch(keyCode: number) { this.keyCode = keyCode; return this.request('watchModifier', { keyCode }); }
  async activatePreviousApp(): Promise<boolean> {
    const reply = await this.request('activatePreviousApp');
    return reply.ok && 'activated' in reply && reply.activated === true;
  }
  dispose() { this.closed = true; clearTimeout(this.restart); this.child?.kill(); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Helper closed')); } this.pending.clear(); }
}
