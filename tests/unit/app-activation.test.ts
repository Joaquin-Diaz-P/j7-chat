import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  panel: { show: vi.fn(), setActivatePreviousApp: vi.fn(), window: { webContents: { on: vi.fn() } } },
  activatePreviousApp: vi.fn(async () => true),
}));
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), {
    setName: vi.fn(), requestSingleInstanceLock: () => true,
    whenReady: async () => {}, dock: { show: vi.fn() },
    getAppPath: () => '/unused',
  }),
  protocol: { registerSchemesAsPrivileged: vi.fn() }, globalShortcut: {},
}));
vi.mock('../../src/main/setup.js', () => ({ setupSection: vi.fn() }));
vi.mock('../../src/main/settings-window.js', () => ({
  openSettings: vi.fn(), setupSettings: () => ({ permissions: async () => ({}), activatePreviousApp: mocks.activatePreviousApp }),
}));
vi.mock('../../src/main/chat/sqlite-store.js', () => ({ SqliteChatStore: class {} }));
vi.mock('../../src/main/native/helper.js', () => ({ NativeHelper: class {} }));
vi.mock('../../src/main/titles.js', () => ({ generateTitle: vi.fn() }));
vi.mock('../../src/main/capture/setup.js', () => ({ setupCapture: () => ({}) }));
vi.mock('../../src/main/attachments/index.js', () => ({ AttachmentStore: class { async cleanup() {} } }));
vi.mock('../../src/main/attachments/ipc.js', () => ({ registerAttachments: vi.fn(), registerAttachmentProtocol: vi.fn() }));
vi.mock('../../src/main/paths.js', () => ({ ensurePaths: async () => ({ data: '/unused' }) }));
vi.mock('../../src/main/settings.js', () => ({ SettingsStore: class { value = { firstRunDone: true, shortcut: 'Alt+Space' }; } }));
vi.mock('../../src/main/logger.js', () => ({ createLogger: () => vi.fn() }));
vi.mock('../../src/main/chat/catalog.js', () => ({ ModelCatalog: class {} }));
vi.mock('../../src/main/chat/service.js', () => ({ ChatService: class {
  catalog = { refresh: async () => {}, snapshot: () => ({ statuses: {} }) };
  start() {}
} }));
vi.mock('../../src/main/window.js', () => ({ Panel: class { constructor() { return mocks.panel; } } }));
vi.mock('../../src/main/ipc.js', () => ({ registerIpc: vi.fn() }));
vi.mock('../../src/main/shortcuts.js', () => ({ registerShortcut: vi.fn() }));
vi.mock('../../src/main/tray.js', () => ({ createTray: vi.fn() }));

it('Dock activation opens the bar only without visible windows, using Settings’ activation callback', async () => {
  vi.stubEnv('J7_DATA_DIR', '');
  vi.stubEnv('J7_TEST', '');
  const termListeners = process.listeners('SIGTERM');
  const intListeners = process.listeners('SIGINT');
  try {
    await import('../../src/main/index.js');
    const { app } = await import('electron');
    await vi.waitFor(() => expect(mocks.panel.setActivatePreviousApp).toHaveBeenCalledWith(mocks.activatePreviousApp));
    app.emit('activate', {}, true);
    expect(mocks.panel.show).not.toHaveBeenCalled();
    app.emit('activate', {}, false);
    expect(mocks.panel.show).toHaveBeenCalledOnce();
  } finally {
    for (const listener of process.listeners('SIGTERM')) if (!termListeners.includes(listener)) process.off('SIGTERM', listener);
    for (const listener of process.listeners('SIGINT')) if (!intListeners.includes(listener)) process.off('SIGINT', listener);
    vi.unstubAllEnvs();
  }
});
