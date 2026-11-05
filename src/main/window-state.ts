import type { Position } from "./settings.js";
export interface Area extends Position {
  width: number;
  height: number;
}
export function contentBounds(
  area: Area,
  position: Position,
  contentHeight: number,
): Area {
  const width = 680;
  const height = Math.min(
    Math.max(88, Math.ceil(contentHeight)),
    Math.floor(area.height * 0.7),
  );
  return {
    width,
    height,
    x: Math.round(
      Math.max(area.x, Math.min(position.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(position.y, area.y + area.height - height)),
    ),
  };
}
export function displayPosition(
  area: Area,
  id: string,
  positions: Record<string, Position>,
): Position {
  return (
    positions[id] ?? {
      x: Math.round(area.x + (area.width - 680) / 2),
      y: Math.round(area.y + area.height * 0.2),
    }
  );
}
export class VisibilityClock {
  private hiddenAt: number | undefined;
  constructor(private now: () => number = Date.now) {}
  hide() {
    this.hiddenAt = this.now();
  }
  shouldResume(hasChat: boolean) {
    return (
      hasChat &&
      this.hiddenAt !== undefined &&
      this.now() - this.hiddenAt < 300_000
    );
  }
}
