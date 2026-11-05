import type { Area } from './window-state.js';
import type { Position } from './settings.js';
// Anchors store horizontal center and bottom edge, in screen coordinates.
export function defaultAnchor(area: Area): Position {
  return { x: Math.round(area.x + area.width / 2), y: Math.round(area.y + area.height * .72) };
}
export function panelBounds(area: Area, anchor: Position, height: number, history = false): Area {
  const width = Math.min(history ? 780 : 520, area.width);
  height = Math.min(Math.max(124, Math.ceil(height)), area.height);
  return { width, height, x: Math.round(Math.max(area.x, Math.min(anchor.x - 260 - (history ? 260 : 0), area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(anchor.y - height, area.y + area.height - height))) };
}
