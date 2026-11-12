import { useEffect, useRef } from "react";

// A port of Hex's "Dot scope" HUD (github.com/anomalyco/hex, MIT: src/rune_hud/dot_scope/scope.rs
// and rune_hud.wgsl), recording stage only. Two braided traces follow a voice level, travel out
// from the centre and leave a phosphor trail on a dot grid. Hex records and transcribes; J7 only
// measures the microphone's loudness while it dictates, and falls back to Hex's synthetic voice
// (`demo_level`) when the microphone is unavailable or not allowed.
const TAU = Math.PI * 2, STEP = 1 / 240, HISTORY = 512, SUB = 3;
const SPEEDS = [0.8, 1.25, 1.85, 2.6], BASE = [0.55, 0.42, 0.3, 0.2], SPATIAL = [1.4, 2.4, 3.8, 5.6];
const PITCH = 3.6, ROWS = 7, SCALE = PITCH / 2.6; // Hex measures in points at a 2.6 pt pitch.
const RESPONSE = 6.5, RELEASE = 0.15, HISTORY_SPEED = 150 * SCALE, PHOSPHOR = 0.6, PHOSPHOR_HEAD = 0.15;
const ENTER = 0.42, BREATH_PERIOD = 5.5, CARRIER_REST = 0.14;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bump = (d: number, w: number) => Math.exp(-((d / w) ** 2));

/** Hex's HUD Lab voice: phrases of syllables at about 4.5 a second with breaths between, 0–1. */
function demoLevel(time: number) {
  const phrase = Math.floor(time / 2.4), t = time - phrase * 2.4;
  if (t > 1.7) return 0.04;
  const shape = Math.sin(Math.PI * t / 1.7) ** 0.4;
  const syllable = 0.5 + 0.5 * Math.sin(TAU * (4.3 + 0.6 * Math.sin(phrase * 1.7)) * t + phrase);
  const stress = 0.75 + 0.25 * Math.sin(TAU * 1.1 * t + 2 * phrase);
  return clamp(0.08 + 0.82 * shape * syllable ** 1.6 * stress);
}

/** Hex's slow auto level: the speaker's recent peak reads as full and the room as silent. */
class AutoLevel {
  peak = -30; room = -55;
  step(loudness: number, h: number) {
    const db = Math.max(loudness, -120);
    const follow = (value: number, target: number, time: number) => value + (target - value) * (1 - Math.exp(-h / Math.max(time, 1e-3)));
    this.room = follow(this.room, db, db < this.room ? 0.3 : 6);
    const lowest = Math.max(this.room, -60) + 16;
    this.peak = Math.max(db > this.peak ? follow(this.peak, db, 0.04) : follow(this.peak, lowest, 3), lowest);
    const low = Math.max(Math.max(this.room, -60) + 5, this.peak - 24);
    return clamp((db - low) / Math.max(this.peak - low, 1));
  }
}

class Voice {
  level = 0; reservoir = 0; energy = 0; kick = 0; kickVelocity = 0; band = 0;
  step(raw: number, h: number) {
    const previous = this.level;
    this.level += (raw - this.level) * (1 - Math.exp(-h / (raw > this.level ? 0.035 : 0.095)));
    const rise = Math.max(0, (this.level - previous) / h);
    this.reservoir += (1.75 * this.level * this.level - this.reservoir / 1.8) * h;
    this.energy = 1 - Math.exp(-this.reservoir * 1.45);
    const w = TAU * 1.3, z = 0.22;
    this.kickVelocity += (-w * w * this.kick - 2 * z * w * this.kickVelocity + 15 * rise + 2.2 * this.level) * h;
    this.kick += this.kickVelocity * h;
    this.band += (raw - this.band) * (1 - Math.exp(-h / (raw > this.band ? 0.025 : 0.14)));
  }
}

class Trace {
  envelope = 0; amplitude = 0; velocity = 0; head = 0;
  history = new Float32Array(HISTORY * 5);
  constructor(private phases: number[]) {}
  phase(c: number) { return this.phases[c]!; }
  tick(voice: Voice, live: number, speed: number, h: number) {
    this.envelope += (voice.level - this.envelope) * (1 - Math.exp(-h / (voice.level > this.envelope ? 0.022 : RELEASE)));
    const w = TAU * RESPONSE, z = 0.52;
    this.velocity += (-w * w * (this.amplitude - this.envelope) - 2 * z * w * this.velocity) * h;
    this.amplitude += this.velocity * h;
    const go = 0.6 + 1.1 * Math.min(this.envelope * 1.6, 1);
    for (let c = 0; c < 4; c++) this.phases[c] = (this.phases[c]! + h * TAU * SPEEDS[c]! * go * speed) % TAU;
    const emphasis = 0.35 + 0.65 * Math.min(voice.band / (voice.band + 0.06), 2);
    const offset = this.head * 5, amplitude = Math.max(this.amplitude, 0) * live;
    this.history[offset] = amplitude;
    for (let c = 0; c < 4; c++) this.history[offset + 1 + c] = amplitude * BASE[c]! * emphasis;
    this.head = (this.head + 1) % HISTORY;
  }
  past(delay: number, channel: number) {
    const d = Math.min(delay / STEP, HISTORY - 2), i = Math.floor(d), k = d - i;
    const a = (this.head + 2 * HISTORY - 1 - i) % HISTORY, b = (a + HISTORY - 1) % HISTORY;
    return this.history[a * 5 + channel]! * (1 - k) + this.history[b * 5 + channel]! * k;
  }
}

class Scope {
  voices = [new Voice(), new Voice()];
  traces = [new Trace([0.1, 1.7, 3.3, 4.6]), new Trace([2.4, 0.6, 5.1, 1.9])];
  live = 0; carrier = 0; time = 0; pending = 0; columns = 0;
  /** The microphone's loudness in dBFS, or undefined to follow the synthetic voice. */
  loudness: number | undefined;
  auto = new AutoLevel();
  head: Float32Array[] = []; tail: Float32Array[] = []; ys: Float32Array[] = []; bright: Float32Array[] = [];
  power = new Float32Array(0); fresh = new Float32Array(0);
  resize(columns: number) {
    if (columns === this.columns) return;
    this.columns = columns;
    const dots = columns * ROWS, samples = (columns - 1) * SUB + 1;
    this.head = [new Float32Array(dots), new Float32Array(dots)]; this.tail = [new Float32Array(dots), new Float32Array(dots)];
    this.ys = [new Float32Array(samples), new Float32Array(samples)]; this.bright = [new Float32Array(samples), new Float32Array(samples)];
    this.power = new Float32Array(dots); this.fresh = new Float32Array(dots);
  }
  advance(dt: number, still: boolean) {
    this.pending += Math.min(dt, 0.25);
    while (this.pending >= STEP) {
      this.pending -= STEP;
      const h = STEP, level = this.loudness === undefined ? demoLevel(this.time) : this.auto.step(this.loudness, h);
      this.voices[0]!.step(level, h); this.voices[1]!.step(level * 0.85, h);
      this.live += (1 - this.live) * (1 - Math.exp(-h / 0.55));
      const speed = still ? 0 : 1;
      this.traces.forEach((trace, k) => trace.tick(this.voices[k]!, this.live, speed, h));
      const energy = Math.max(this.voices[0]!.energy, this.voices[1]!.energy);
      this.carrier = (this.carrier + h * TAU * (CARRIER_REST + 0.22 * energy) * speed) % TAU;
      this.time += h;
    }
    this.beam(Math.min(dt, 0.25), still);
  }
  /** Draws both traces into the dot field and decays the phosphor (Hex's `beam`). */
  private beam(hb: number, still: boolean) {
    const columns = this.columns, samples = (columns - 1) * SUB + 1, width = columns * PITCH, halfWidth = width / 2;
    const e = this.time, mid = (ROWS - 1) / 2, half = mid - 0.55;
    // The scanner unfolds the trace from the middle as recording starts.
    const reach = still ? 1e4 : (halfWidth + 12 * SCALE) * (0.5 - 0.5 * Math.cos(Math.PI * clamp(e / ENTER)));
    const scanHead = still ? 0 : 2.8 * (1 - smoothstep(0.08, ENTER, e)), unfold = still ? 1 : smoothstep(0, 0.1, e);
    const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(e * TAU / BREATH_PERIOD);
    const rest = (0.55 + 0.35 * breath) * (0.4 + 0.6 * this.live);
    const cycles = 1.6 * columns / 43 * 0.6;
    for (let k = 0; k < 2; k++) {
      const trace = this.traces[k]!, sign = k === 0 ? 1 : -1, ys = this.ys[k]!, bright = this.bright[k]!;
      for (let s = 0; s < samples; s++) {
        const x = (s / SUB - (columns - 1) / 2) * PITCH, own = Math.abs(x);
        const drawn = unfold * (1 - smoothstep(Math.max(reach - 14 * SCALE, 0), Math.max(reach, 0.001), own));
        const amplitude = drawn * (1 - smoothstep(Math.max(reach - 22 * SCALE, 0), Math.max(reach - 3 * SCALE, 0.001), own));
        const beam = scanHead * bump(own - reach, 6 * SCALE);
        const swell = 1.8 * unfold * (scanHead / 2.8) * bump(own - Math.max(reach - 14 * SCALE, 0), 14 * SCALE);
        const xn = (x + halfWidth) / width;
        const ends = Math.min(smoothstep(-halfWidth + 3 * SCALE, -halfWidth + 17 * SCALE, x), smoothstep(-halfWidth + 3 * SCALE, -halfWidth + 17 * SCALE, -x));
        const reachFalloff = 1 - 0.8 * smoothstep(14 * SCALE, halfWidth, own);
        const delay = own / HISTORY_SPEED, a = trace.past(delay, 0);
        let spread = 0;
        for (let c = 0; c < 4; c++) spread += trace.past(delay, 1 + c) * Math.sin(TAU * SPATIAL[c]! * xn - trace.phase(c));
        const helix = (rest + swell + half * 0.55 * a * reachFalloff) * Math.sin(TAU * cycles * xn - this.carrier);
        const y = half * Math.tanh((helix + half * 0.7 * spread * reachFalloff) / half) * ends * amplitude;
        ys[s] = mid - sign * y;
        const spatial = (0.3 + 0.7 * Math.min(a * 1.8, 1)) * (0.45 + 0.55 * ends);
        bright[s] = spatial * amplitude + 0.36 * beam;
      }
      for (let s = 0; s < samples; s++) {
        const slope = (ys[Math.min(s + 1, samples - 1)]! - ys[Math.max(s - 1, 0)]!) * SUB / 2;
        bright[s]! *= 0.45 + 0.55 / Math.sqrt(1 + 0.22 * slope * slope);
      }
    }
    const headKeep = Math.exp(-hb / PHOSPHOR_HEAD), tailKeep = Math.exp(-hb / PHOSPHOR), dx = 1 / SUB;
    for (let i = 0; i < columns; i++) {
      const s0 = Math.max(i - 3, 0) * SUB, s1 = Math.min((i + 3) * SUB, samples - 1);
      for (let j = 0; j < ROWS; j++) {
        const n = j * columns + i;
        let now = 0, total = 0, lit0 = 0, lit1 = 0;
        for (let k = 0; k < 2; k++) {
          const ys = this.ys[k]!;
          let best = Infinity, nearest = i * SUB;
          for (let s = s0; s < s1; s++) {
            const ay = ys[s]!, dy = ys[s + 1]! - ay, px = i - s * dx, py = j - ay;
            const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
            const ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
            if (d2 < best) { best = d2; nearest = s; }
          }
          const brightness = this.bright[k]![nearest]!, onBeam = Math.exp(-best / 0.25);
          const instant = Math.min(onBeam + 0.5 * Math.exp(-Math.sqrt(best) / 0.8), 1.2) * brightness;
          const core = onBeam * brightness;
          const head = this.head[k]!, tail = this.tail[k]!;
          head[n] = Math.max(head[n]! * headKeep, core);
          tail[n] = Math.max(tail[n]! * tailKeep, core);
          const light = Math.max(instant, head[n]!, 0.55 * tail[n]!);
          if (k === 0) lit0 = light; else lit1 = light;
          now += instant; total += light;
        }
        this.power[n] = clamp(1 - (1 - Math.min(lit0, 1)) * (1 - Math.min(lit1, 1)));
        this.fresh[n] = Math.min(now / Math.max(total, 1e-4), 1);
      }
    }
  }
}

export function VoiceWave({ label, hint }: { label: string; hint: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext("2d");
    if (!element || !context) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scope = new Scope();
    let frame = 0, last = performance.now(), stopped = false;
    // Loudness only: the samples stay in this analyser and are never stored or sent anywhere.
    let stream: MediaStream | undefined, audio: AudioContext | undefined, analyser: AnalyserNode | undefined, samples: Float32Array<ArrayBuffer> | undefined;
    void navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(granted => {
      if (stopped) { granted.getTracks().forEach(track => track.stop()); return; }
      stream = granted; audio = new AudioContext();
      analyser = audio.createAnalyser(); analyser.fftSize = 1024;
      audio.createMediaStreamSource(granted).connect(analyser);
      samples = new Float32Array(analyser.fftSize);
    }).catch(() => {});
    const draw = (now: number) => {
      const ratio = devicePixelRatio, width = element.clientWidth, height = element.clientHeight;
      if (element.width !== Math.round(width * ratio)) { element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); }
      const columns = Math.max(8, Math.floor(width / PITCH));
      scope.resize(columns);
      if (analyser && samples) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        scope.loudness = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-6);
      }
      scope.advance((now - last) / 1000, still);
      last = now;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const style = getComputedStyle(element);
      context.fillStyle = style.color;
      const dark = style.colorScheme.includes("dark") || matchMedia("(prefers-color-scheme: dark)").matches;
      const unlit = dark ? 0.07 : 0.085, full = dark ? 0.96 : 1, curve = dark ? 0.9 : 0.75;
      const left = (width - (columns - 1) * PITCH) / 2, top = (height - (ROWS - 1) * PITCH) / 2, mid = (ROWS - 1) / 2;
      const presence = 0.5 + 0.5 * scope.live, grid = Math.min(scope.time / 0.3, 1);
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < columns; i++) {
        const n = j * columns + i, power = Math.max(scope.power[n]!, 1e-5), fresh = scope.fresh[n]!;
        const floor = unlit * (1 - 0.7 * smoothstep(0.35, 0.95, Math.abs(j - mid) / mid)) * presence * grid;
        const alpha = floor + (full - floor) * power ** (curve * (1.4 + (1 - 1.4) * fresh));
        const radius = (0.25 + 0.17 * power ** 0.6) * (1 + (0.82 + 0.18 * fresh - 1) * smoothstep(0.03, 0.2, power)) * PITCH;
        const x = left + i * PITCH, y = top + j * PITCH;
        if (power > 0.05) {
          context.globalAlpha = 0.132 * power * power;
          context.beginPath(); context.arc(x, y, radius * 2, 0, TAU); context.fill();
        }
        context.globalAlpha = alpha;
        context.beginPath(); context.arc(x, y, radius, 0, TAU); context.fill();
      }
      if (!still || scope.time < 0.5) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      // Releasing the tracks turns macOS's microphone indicator off as soon as dictation ends.
      stream?.getTracks().forEach(track => track.stop());
      void audio?.close().catch(() => {});
    };
  }, []);
  return <canvas ref={canvas} className="voice-wave" role="img" aria-label={label} title={hint}/>;
}
