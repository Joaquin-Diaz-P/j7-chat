import { expect, it } from 'vitest';
import { validateSettings } from '../../src/main/settings.js';
import { UserMoveTracker } from '../../src/main/window-state.js';
it('migrates legacy top-left positions once using the old width and fallback height', () => {
 const settings = validateSettings({positions:{'2':{x:115,y:577}}});
 expect(settings.positions['2']).toEqual({x:455,y:665});
 expect(settings.positionsVersion).toBe(2);
 expect(validateSettings(settings).positions).toEqual(settings.positions);
});
it('tracks every moved event until a programmatic move resets the drag', () => {
 const tracker = new UserMoveTracker();
 expect(tracker.isUserMove({x:1,y:2})).toBe(false);
 tracker.willMove();
 expect(tracker.isUserMove({x:3,y:4})).toBe(true);
 expect(tracker.isUserMove({x:5,y:6})).toBe(true);
 expect(tracker.isUserMove({x:384,y:6})).toBe(true);
 tracker.willMove(); tracker.programmatic({x:7,y:8});
 expect(tracker.isUserMove({x:7,y:8})).toBe(false);
 expect(tracker.isUserMove({x:9,y:10})).toBe(false);
});
