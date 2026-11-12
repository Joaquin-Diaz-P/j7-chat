import { useEffect, useRef } from "react";

const GAP = 6, ROWS = 5, DOT = 1.3;
// Dot-matrix wave in the style of Hex's recording pill. It is purely visual: Hex records and
// transcribes, and J7 never opens the microphone, so the motion is a generated wave, not a meter.
export function VoiceWave({ label }: { label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext("2d");
    if (!element || !context) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = (time: number) => {
      const ratio = devicePixelRatio, width = element.clientWidth, height = element.clientHeight;
      if (element.width !== Math.round(width * ratio)) { element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(element).color;
      const columns = Math.floor(width / GAP), left = (width - (columns - 1) * GAP) / 2, top = (height - (ROWS - 1) * GAP) / 2;
      const t = still ? 0 : time / 1000;
      for (let column = 0; column < columns; column++) {
        const x = column / Math.max(1, columns - 1);
        // Louder towards the middle, like speech centred in Hex's pill.
        const envelope = Math.sin(Math.PI * x) ** 1.5;
        const wave = (Math.sin(x * 19 - t * 5.1) + Math.sin(x * 7.3 + t * 3.7) * 0.6 + Math.sin(x * 41 - t * 8.3) * 0.3) / 1.9;
        const amplitude = envelope * (0.35 + 0.65 * Math.abs(wave));
        for (let row = 0; row < ROWS; row++) {
          const distance = Math.abs(row - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
          context.globalAlpha = distance === 0 ? 0.35 + 0.65 * amplitude : amplitude > distance * 0.9 ? 0.25 + 0.6 * amplitude : 0.1;
          context.beginPath();
          context.arc(left + column * GAP, top + row * GAP, DOT, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} className="voice-wave" role="img" aria-label={label}/>;
}
