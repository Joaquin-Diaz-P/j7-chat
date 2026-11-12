import { existsSync } from 'node:fs';
import { execFile, type ChildProcess } from 'node:child_process';
export interface HexResult { code: number; text: string }
export interface IndicatorMemory { get(): 'top' | 'bottom' | null; set(position: 'top' | 'bottom' | null): void }
export class Hex {
  constructor(readonly binary = '/Applications/Hex.app/Contents/MacOS/hex', private indicator?: IndicatorMemory) {}
  private children = new Set<ChildProcess>();
  private starts = new Map<ChildProcess, ReturnType<typeof setTimeout> | undefined>();
  private shuttingDown = false;
  /** Leave time for a final stop before the app's three-second shutdown deadline. */
  prepareShutdown() {
    this.shuttingDown = true;
    for (const [child, timer] of this.starts) if (!timer) this.starts.set(child, setTimeout(() => child.kill('SIGKILL'), 1000));
  }
  installed() { return existsSync(this.binary); }
  abort() { for (const timer of this.starts.values()) clearTimeout(timer); for (const child of this.children) child.kill('SIGKILL'); }
  run(args: string[], timeout = 5000): Promise<HexResult> {
    return new Promise(resolve => { const child = execFile(this.binary, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      this.children.delete(child);
      clearTimeout(this.starts.get(child)); this.starts.delete(child);
      resolve({ code: error ? typeof error.code === 'number' ? error.code : -1 : 0, text: stdout.trim() });
    }); this.children.add(child);
      if (args[0] === 'dictation' && args[1] === 'start') {
        this.starts.set(child, undefined);
        if (this.shuttingDown) this.prepareShutdown();
      }
    });
  }
  status() { return this.run(['status','--json']); }
  start() { return this.run(['start']); }
  /** Code 5: Hex was already recording a dictation of its own, which J7 must leave alone. */
  async begin() {
    await this.hideIndicator();
    let result = await this.run(['dictation','start','--json'], this.shuttingDown ? 1000 : 5000);
    try { if (result.code === 0 && (JSON.parse(result.text) as { changed?: boolean }).changed === false) result = { code: 5, text: '' }; } catch { /* Older Hex: plain reply. */ }
    if (result.code !== 0) await this.restoreIndicator();
    return result;
  }
  async stop() {
    try { return await this.run(['dictation','stop','--print'], 120000); }
    finally { await this.restoreIndicator(); }
  }
  // J7's bar shows its own wave while dictating, so Hex's HUD would be a duplicate. The original
  // position is saved before hiding, so a crash mid-dictation is undone at the next launch.
  private async hideIndicator() {
    if (!this.indicator || this.indicator.get()) return;
    const current = await this.run(['settings','get','indicator_position']);
    const position = current.text.trim();
    if (current.code !== 0 || (position !== 'top' && position !== 'bottom')) return;
    this.indicator.set(position);
    if ((await this.run(['settings','set','indicator_position','hidden'])).code !== 0) this.indicator.set(null);
  }
  async restoreIndicator() {
    const position = this.indicator?.get();
    if (!position) return;
    if ((await this.run(['settings','set','indicator_position',position])).code === 0) this.indicator!.set(null);
  }
  async hotkey() { return (await this.run(['settings','get','dictation_hotkey'])).text; }
  async recoverSince(date: Date) {
    const result = await this.run(['history','--since',date.toISOString(),'--oldest-first','--limit','1','--json']);
    if (result.code !== 0) return '';
    try {
      const history = JSON.parse(result.text) as { entries?: { timestamp_ms: number; final_text: string; kind: string }[] };
      return history.entries?.find(e => e.kind === 'dictation' && e.timestamp_ms >= date.getTime() && typeof e.final_text === 'string')?.final_text.trim() ?? '';
    } catch { return ''; }
  }
}
export const modifierCodes: Record<string, number> = { 'left-option':58,'right-option':61,'left-command':55,'right-command':54,'left-shift':56,'right-shift':60,'left-control':59,'right-control':62,fn:63 };
export function hotkeyConflicts(voice: string, hex: string) { return voice === hex.trim(); }
