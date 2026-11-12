import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('compact drops fit the card, manual pin ends on collapse, and Dock stays visible', async () => {
  const data = await mkdtemp(join(tmpdir(), 'j7-window-controls-'));
  await writeFile(join(data, 'settings.json'), JSON.stringify({firstRunDone:true,pinned:true,positionsVersion:2}));
  const env: Record<string,string> = {...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string')),J7_MOCK:'1',J7_TEST:'1',J7_DATA_DIR:data};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args:['.'],env});
  try {
    await app.evaluate(() => (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
    const page = await app.firstWindow();
    await expect(page.locator('.shell')).toHaveClass(/compact/);
    const pinned = async () => JSON.parse(await readFile(join(data,'settings.json'),'utf8')).pinned;
    await expect.poll(pinned).toBe(false);
    await expect.poll(() => app.evaluate(({app}) => app.dock?.isVisible())).toBe(true);

    const input = page.locator('.composer textarea');
    const position = async () => {
      const bounds = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.getBounds());
      const card = await page.locator('.card-surface').boundingBox();
      return {x:bounds.x+card!.x,y:bounds.y+card!.y};
    };
    await expect.poll(() => page.locator('.shell').evaluate(el => el.getAnimations({subtree:true}).filter(a => a.playState === 'running').length)).toBe(0);
    const before = await position();
    await input.click();
    await expect(input).toBeFocused();
    expect(await position()).toEqual(before);
    const field = await input.boundingBox();
    await page.mouse.move(field!.x+30,field!.y+12);
    await page.mouse.down();
    await page.mouse.move(field!.x-10,field!.y-18);
    await page.mouse.up();
    await expect.poll(position).toEqual({x:before.x-40,y:before.y-30});
    await expect(input).toBeFocused();
    await input.type('Texto de prueba');
    await expect(input).toHaveValue('Texto de prueba');
    const moved = await position();
    const filled = await input.boundingBox();
    await page.mouse.move(filled!.x+2,filled!.y+12);
    await page.mouse.down();
    await page.mouse.move(filled!.x+40,filled!.y+12,{steps:5});
    await page.mouse.up();
    expect(await position()).toEqual(moved);
    await input.fill('');

    await page.dispatchEvent('.panel','dragover');
    const card = await page.locator('.card-surface').boundingBox();
    const overlay = await page.locator('.drop-overlay').boundingBox();
    expect(card).not.toBeNull(); expect(overlay).not.toBeNull();
    expect(overlay!.y).toBeCloseTo(card!.y+3,0);
    expect(overlay!.height).toBeCloseTo(card!.height-6,0);
    expect(overlay!.x).toBeCloseTo(card!.x+3,0);
    await page.screenshot({path:'test-results/compact-drop.png'});
    await page.dispatchEvent('.panel','dragleave');

    await page.locator('textarea').first().press('Meta+b');
    await expect(page.locator('.shell')).toHaveClass(/expanded/);
    await page.getByRole('button',{name:'Mantener visible',exact:true}).click();
    await expect.poll(pinned).toBe(true);
    await page.locator('textarea').first().press('Meta+b');
    await expect(page.locator('.shell')).toHaveClass(/compact/);
    await expect.poll(pinned).toBe(false);
  } finally {
    await app.close();
    await rm(data,{recursive:true,force:true});
  }
});

test('the card can be dragged past the screen edges but stays reachable and below the menu bar', async () => {
  const data = await mkdtemp(join(tmpdir(), 'j7-window-edges-'));
  await writeFile(join(data, 'settings.json'), JSON.stringify({firstRunDone:true,positionsVersion:2}));
  const env: Record<string,string> = {...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === 'string')),J7_MOCK:'1',J7_TEST:'1',J7_DATA_DIR:data};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args:['.'],env});
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await app.evaluate(() => (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show?.());
    // macOS only constrains visible windows, so the edges must be checked on a shown bar.
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
    const card = async () => {
      const bounds = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.getBounds());
      const box = await page.locator('.card-surface').boundingBox();
      return {left:bounds.x+box!.x,top:bounds.y+box!.y,right:bounds.x+box!.x+box!.width,bottom:bounds.y+box!.y+box!.height};
    };
    // Let the bar settle: until the renderer reports its measured height the card is laid out a few points taller.
    await expect.poll(() => page.locator('.shell').evaluate(el => el.getAnimations({subtree:true}).filter(a => a.playState === 'running').length)).toBe(0);
    await page.waitForTimeout(300);
    // The display under the card's middle owns it, so measure against wherever the card ends up.
    const area = async () => { const c = await card(); return app.evaluate(({screen}, point) => screen.getDisplayNearestPoint(point).workArea, {x:Math.round((c.left+c.right)/2), y:Math.round((c.top+c.bottom)/2)}); };
    const drag = async (dx: number, dy: number) => { await page.evaluate(([x, y]) => { window.j7.beginMoveCard(); window.j7.moveCard(x!, y!); window.j7.endMoveCard(); }, [dx, dy]); await page.waitForTimeout(150); };
    await drag(-4000, 0);
    await expect.poll(async () => (await card()).right - (await area()).x).toBe(80);
    await drag(0, 4000);
    // A strip stays visible to grab again (the compact card's drawn height varies by a few points).
    await expect.poll(async () => { const a = await area(); return a.y + a.height - (await card()).top; }).toBeGreaterThanOrEqual(40);
    await drag(0, -8000);
    await expect.poll(async () => (await card()).top - (await area()).y).toBe(0);
    // With a second monitor, dragging the card's middle onto it hands the card over.
    const displays = await app.evaluate(({screen}) => screen.getAllDisplays().map(d => d.workArea));
    if (displays.length > 1) {
      const start = await area();
      const target = displays.find(d => d.x !== start.x || d.y !== start.y)!;
      const c = await card();
      await drag(Math.round(target.x + target.width / 2 - (c.left + c.right) / 2), Math.round(target.y + target.height / 2 - (c.top + c.bottom) / 2));
      await expect.poll(async () => { const a = await area(); return [a.x, a.y]; }).toEqual([target.x, target.y]);
      await expect.poll(async () => { const now = await card(); return now.left >= target.x && now.right <= target.x + target.width; }).toBe(true);
    }
  } finally {
    await app.close();
    await rm(data, {recursive:true, force:true});
  }
});
