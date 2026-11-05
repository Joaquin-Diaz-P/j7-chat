import type { Area } from './window-state.js';
import type { Position } from './settings.js';
// Anchors store horizontal center and bottom edge, in screen coordinates.
export function defaultAnchor(area: Area): Position {
  return { x: Math.round(area.x + area.width / 2), y: Math.round(area.y + area.height * .72) };
}
export function panelBounds(area: Area, anchor: Position, height: number, history = false): Area {
  const width = Math.min(history ? 780 : 520, area.width);
  height = Math.min(Math.max(90, Math.ceil(height)), area.height);
  return { width, height, x: Math.round(Math.max(area.x, Math.min(anchor.x - 260 - (history ? 260 : 0), area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(anchor.y - height, area.y + area.height - height))) };
}

export function validAnchor(area: Area, saved?: Position): Position | undefined {
  return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && saved.x >= area.x && saved.x <= area.x + area.width && saved.y >= area.y && saved.y <= area.y + area.height ? saved : undefined;
}

export const CANVAS_MARGIN = 24;
// Reserve the largest card from the outset, including its CSS shadow.
export function canvasBounds(area: Area, anchor: Position): Area {
  const width = Math.min(828, area.width), height = Math.min(728, area.height);
  return { width, height,
    x: Math.round(Math.max(area.x, Math.min(anchor.x + 260 + CANVAS_MARGIN - width, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(anchor.y + CANVAS_MARGIN - height, area.y + area.height - height))) };
}
export function canvasAnchor(bounds: Area): Position {
  return { x: bounds.x + bounds.width - CANVAS_MARGIN - 260, y: bounds.y + bounds.height - CANVAS_MARGIN };
}

// Keep the remembered chat center/bottom; clamp the card independently of its canvas.
export function cardLayout(area: Area, anchor: Position, height: number, history = false) {
  const canvas = canvasBounds(area, anchor);
  const width = Math.min(history ? 780 : 520, Math.max(1, canvas.width - 2 * CANVAS_MARGIN));
  height = Math.min(Math.max(90, Math.ceil(height)), Math.max(1, canvas.height - 2 * CANVAS_MARGIN));
  const card = {width, height,
    x: Math.round(Math.max(area.x, Math.min(anchor.x + 260 - width, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(anchor.y - height, area.y + area.height - height))),
  };
  return { canvas, card, offset: {
    x: card.x + card.width - (canvas.x + canvas.width - CANVAS_MARGIN),
    y: card.y + card.height - (canvas.y + canvas.height - CANVAS_MARGIN),
  } };
}
