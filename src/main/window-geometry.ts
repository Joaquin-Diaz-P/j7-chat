import type { Area } from './window-state.js';
import type { Position } from './settings.js';
// Anchors store horizontal center and bottom edge, in screen coordinates.
export function defaultAnchor(area: Area): Position {
  return { x: Math.round(area.x + area.width / 2), y: Math.round(area.y + area.height * .72) };
}
// A saved anchor belongs to a display while the card can still be placed there (see cardLayout).
export function validAnchor(area: Area, saved?: Position): Position | undefined {
  return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && saved.x >= area.x - 260 && saved.x <= area.x + area.width + 260 && saved.y >= area.y && saved.y <= area.y + area.height + 106 ? saved : undefined;
}

export const CANVAS_MARGIN = 24;
// Like other macOS windows, the card may leave the screen sideways or downwards, keeping this much
// visible to grab it again, but never slides under the menu bar.
export const VISIBLE_X = 80, VISIBLE_Y = 60;
// Reserve the largest card from the outset, including its CSS shadow. The canvas follows the anchor
// past the screen's edges so the card never shifts inside it.
export function canvasBounds(area: Area, anchor: Position): Area {
  const width = Math.min(828, area.width), height = Math.min(728, area.height);
  return { width, height, x: Math.round(anchor.x + 260 + CANVAS_MARGIN - width), y: Math.round(anchor.y + CANVAS_MARGIN - height) };
}
export function canvasAnchor(bounds: Area): Position {
  return { x: bounds.x + bounds.width - CANVAS_MARGIN - 260, y: bounds.y + bounds.height - CANVAS_MARGIN };
}

// Keep the remembered chat center/bottom, limited to where the card stays reachable on `area`.
export function cardLayout(area: Area, anchor: Position, height: number, history = false) {
  const width = Math.min(history ? 780 : 520, Math.max(1, Math.min(828, area.width) - 2 * CANVAS_MARGIN));
  height = Math.min(Math.max(90, Math.ceil(height)), Math.max(1, Math.min(728, area.height) - 2 * CANVAS_MARGIN));
  let right = Math.round(Math.min(Math.max(anchor.x + 260, area.x + VISIBLE_X), area.x + area.width - VISIBLE_X + width));
  // Growing into the history view never pushes the card further off screen than the compact card already was.
  right = Math.max(right, Math.min(area.x, right - Math.min(width, 520)) + width);
  const bottom = Math.round(Math.min(Math.max(anchor.y, area.y + height), area.y + area.height - VISIBLE_Y + height));
  const canvas = canvasBounds(area, { x: right - 260, y: bottom });
  const card = { width, height, x: right - width, y: bottom - height };
  return { canvas, card, offset: {
    x: card.x + card.width - (canvas.x + canvas.width - CANVAS_MARGIN),
    y: card.y + card.height - (canvas.y + canvas.height - CANVAS_MARGIN),
  } };
}
