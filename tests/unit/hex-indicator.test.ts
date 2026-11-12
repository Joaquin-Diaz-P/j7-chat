import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hex, type IndicatorMemory } from '../../src/main/voice/hex.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
// A fake `hex` that keeps indicator_position in a file and logs every call.
async function fakeHex(start = '{"changed":true}') {
  const root = await mkdtemp(join(tmpdir(), 'j7-hex-indicator-')); roots.push(root);
  const binary = join(root, 'hex');
  await writeFile(join(root, 'position'), 'bottom');
  await writeFile(binary, `#!/bin/sh
echo "$*" >> "${root}/calls"
case "$1 $2" in
  "settings get") cat "${root}/position";;
  "settings set") printf %s "$4" > "${root}/position";;
  "dictation start") echo '${start}';;
  "dictation stop") echo 'Hola';;
esac
`, { mode: 0o700 });
  let saved: 'top' | 'bottom' | null = null;
  const memory: IndicatorMemory = { get: () => saved, set: value => { saved = value; } };
  return { hex: new Hex(binary, memory), position: () => readFile(join(root, 'position'), 'utf8'), memory, root };
}

it('hides the HUD while J7 dictates and restores the user position afterwards', async () => {
  const f = await fakeHex();
  expect((await f.hex.begin()).code).toBe(0);
  expect(await f.position()).toBe('hidden');
  expect(f.memory.get()).toBe('bottom');
  expect((await f.hex.stop()).text).toBe('Hola');
  expect(await f.position()).toBe('bottom');
  expect(f.memory.get()).toBeNull();
});

it('leaves the HUD as it was when Hex was already dictating on its own', async () => {
  const f = await fakeHex('{"changed":false}');
  expect((await f.hex.begin()).code).toBe(5);
  expect(await f.position()).toBe('bottom');
  expect(f.memory.get()).toBeNull();
});

it('restores a position left hidden by an interrupted J7 session', async () => {
  const f = await fakeHex();
  await writeFile(join(f.root, 'position'), 'hidden');
  f.memory.set('top');
  await f.hex.restoreIndicator();
  expect(await f.position()).toBe('top');
  expect(f.memory.get()).toBeNull();
});

it('never touches the HUD without somewhere to remember it', async () => {
  const f = await fakeHex();
  await new Hex(join(f.root, 'hex')).begin();
  expect(await f.position()).toBe('bottom');
});
