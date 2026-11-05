import type { Position } from "./settings.js";
export interface Area extends Position {
  width: number;
  height: number;
}
// Only will-move identifies a user drag; moved also fires for system changes.
export class UserMoveTracker {
  private moving = false;
  private expected: Position | undefined;
  willMove() { this.moving = true; }
  programmatic(position: Position) { this.moving = false; this.expected = { x: position.x, y: position.y }; }
  isUserMove(position: Position) {
    const userMove = this.moving && (position.x !== this.expected?.x || position.y !== this.expected?.y);
    this.moving = false;
    this.expected = undefined;
    return userMove;
  }
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
