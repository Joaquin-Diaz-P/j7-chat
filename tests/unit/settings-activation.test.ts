import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(async () => ({ ok: true })), activate: vi.fn(async () => true) }));
vi.mock('electron', () => ({ app: { getAppPath: () => '/unused', on: vi.fn() }, ipcMain: { handle: vi.fn() } }));
vi.mock('../../src/main/native/helper.js', () => ({ NativeHelper: vi.fn(class {
  request = mocks.request;
  activatePreviousApp = mocks.activate;
}) }));
import { NativeHelper } from '../../src/main/native/helper.js';
import { setupSettings } from '../../src/main/settings-window.js';

it('shares the existing Settings helper between permissions and previous application activation', async () => {
  const access = setupSettings(
    {} as Parameters<typeof setupSettings>[0],
    {} as Parameters<typeof setupSettings>[1],
    {} as Parameters<typeof setupSettings>[2],
    {} as Parameters<typeof setupSettings>[3],
    vi.fn(),
  );
  await access.permissions();
  expect(await access.activatePreviousApp()).toBe(true);
  expect(NativeHelper).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('permissions');
  expect(mocks.activate).toHaveBeenCalledOnce();
});
