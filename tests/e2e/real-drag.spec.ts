import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// Drives the real macOS pointer, so it only runs when asked: J7_REAL_INPUT=1 npx playwright test real-drag.
// The terminal running it needs Accessibility permission to post mouse events.
test.skip(process.env.J7_REAL_INPUT !== '1', 'moves the real pointer');

test('a real drag past the screen edges ends on release, reaches the top and never leaves the card following the pointer', async () => {
  const data = await mkdtemp(join(tmpdir(), 'j7-real-drag-'));
  const drag = join(data, 'drag');
  execFileSync('swiftc', ['-O', resolve('scripts/verify/drag.swift'), '-o', drag]);
  await writeFile(join(data, 'settings.json'), JSON.stringify({firstRunDone:true, positionsVersion:2}));
  const env: Record<string,string> = {...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string')), J7_MOCK:'1', J7_TEST:'1', J7_DATA_DIR:data};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args:['.'], env});
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await app.evaluate(() => (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
    const card = async () => {
      const bounds = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.getBounds());
      const box = (await page.locator('.card-surface').boundingBox())!;
      return {x:bounds.x+box.x, y:bounds.y+box.y, width:box.width};
    };
    const start = await card();
    // The composer's padding is draggable; pull far past the bottom edge.
    const x = start.x + start.width - 60, y = start.y + 13;
    const area = await app.evaluate(({screen}, point) => screen.getDisplayNearestPoint(point).workArea, {x, y});
    execFileSync(drag, [String(x), String(y), String(x), String(area.y + area.height + 400), '40']);
    await page.waitForTimeout(300);
    const released = await card();
    expect(released.y).toBeGreaterThan(start.y);
    expect(area.y + area.height - released.y).toBeGreaterThanOrEqual(40);
    // Moving without the button pressed must not move the card.
    execFileSync(drag, [String(x), String(area.y + area.height - 20), String(x - 300), String(area.y + 200), '0']);
    await page.waitForTimeout(300);
    expect(await card()).toEqual(released);
    // Upwards the card follows the pointer to the top of the screen; it used to hit an invisible
    // wall where macOS stopped its transparent window at the menu bar.
    const grab = {x: released.x + released.width - 60, y: released.y + 13};
    execFileSync(drag, [String(grab.x), String(grab.y), String(grab.x), String(area.y + 5), '40']);
    await page.waitForTimeout(300);
    expect((await card()).y).toBe(area.y);
  } finally {
    await app.close();
    await rm(data, {recursive:true, force:true});
  }
});
