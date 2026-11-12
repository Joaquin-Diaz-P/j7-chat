import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({
  app: { hide: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn() },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  }, nativeTheme: {},
}));
vi.mock('../../src/main/settings-window.js', () => ({ openSettings: vi.fn() }));
import { app, BrowserWindow } from 'electron';
import { Panel } from '../../src/main/window.js';
import { showSettingsNotice } from '../../src/main/tray.js';
import { openSettings } from '../../src/main/settings-window.js';

function windowFixture(visible = true, destroyed = false) {
  return {
    isVisible: vi.fn(() => visible), isDestroyed: vi.fn(() => destroyed),
    focus: vi.fn(), hide: vi.fn(() => { visible = false; }),
    show: vi.fn(() => { visible = true; }),
    webContents: { send: vi.fn() },
  };
}
function fixture() {
  // Keep the real show/hide methods without creating a native Electron window.
  const panel = Object.create(Panel.prototype);
  panel.window = windowFixture();
  panel.settings = { value: { pinned: false } };
  panel.clock = { hide: vi.fn() };
  panel.ready = true;
  panel.updateCapture = vi.fn();
  panel.notify = vi.fn();
  const activate = vi.fn(async () => true);
  panel.setActivatePreviousApp(activate);
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window]);
  return { panel, activate };
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('panel focus on dismissal', () => {
  it('hides the app only after the bar animation when no other J7 window is visible', () => {
    const { panel, activate } = fixture();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      panel.window, windowFixture(false), windowFixture(true, true),
    ] as unknown as BrowserWindow[]);
    panel.hide();
    expect(app.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(panel.window.hide).toHaveBeenCalledOnce();
    expect(app.hide).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
  });

  it('remembers and focuses the visible J7 window that preceded the panel', () => {
    const { panel, activate } = fixture();
    const settings = windowFixture();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(settings as unknown as BrowserWindow);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window, settings]);
    panel.show();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(panel.window);
    panel.hide();
    vi.advanceTimersByTime(150);
    expect(settings.focus).toHaveBeenCalledOnce();
    expect(app.hide).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('remembers Settings before showing a hidden bar can change the focused window', () => {
    const { panel } = fixture();
    const settings = windowFixture();
    panel.window.hide();
    panel.window.show.mockImplementation(() => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(panel.window);
    });
    panel.clock.shouldResume = () => true;
    panel.chat = { snapshot: () => ({ chatId: 'existing', messages: [] }) };
    panel.settings.value.positions = {};
    panel.layout = vi.fn();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(settings as unknown as BrowserWindow);
    panel.show();
    expect(panel.previousWindow).toBe(settings);
    expect(panel.window.focus).toHaveBeenCalledOnce();
  });

  it.each([null, 'panel'])('clears the previous J7 window when focus is %s', focused => {
    const { panel, activate } = fixture();
    const settings = windowFixture();
    panel.previousWindow = settings;
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused ? panel.window : null);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window, settings]);
    panel.show();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(panel.window);
    panel.hide();
    vi.advanceTimersByTime(150);
    expect(settings.focus).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
    expect(app.hide).not.toHaveBeenCalled();
  });

  it.each(['hidden', 'destroyed'])('activates the previous app if the prior J7 window is %s', state => {
    const { panel, activate } = fixture();
    const previous = windowFixture(state !== 'hidden', state === 'destroyed');
    panel.previousWindow = previous;
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window, previous, windowFixture()] as unknown as BrowserWindow[]);
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(panel.window);
    panel.hide();
    vi.advanceTimersByTime(150);
    expect(previous.focus).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
    expect(app.hide).not.toHaveBeenCalled();
  });

  it.each(['false', 'reject', 'missing'])('never hides visible Settings when activation is %s', async result => {
    const { panel, activate } = fixture();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window, windowFixture()]);
    if (result === 'missing') panel.activatePreviousApp = undefined;
    else if (result === 'reject') activate.mockRejectedValueOnce(new Error('Helper disconnected'));
    else activate.mockResolvedValueOnce(false);
    panel.hide();
    await vi.advanceTimersByTimeAsync(150);
    expect(app.hide).not.toHaveBeenCalled();
  });
});

describe('opening Settings', () => {
  it.each([false, true])('opens Settings first and dismisses the visible bar only when unpinned (pinned=%s)', pinned => {
    const { panel } = fixture();
    panel.settings.value.pinned = pinned;
    panel.hide = vi.fn(() => expect(openSettings).toHaveBeenCalledOnce());
    showSettingsNotice(panel);
    expect(openSettings).toHaveBeenCalledOnce();
    expect(panel.hide).toHaveBeenCalledTimes(pinned ? 0 : 1);
  });

  it('does not dismiss an already hidden bar', () => {
    const { panel } = fixture();
    panel.window.hide();
    panel.hide = vi.fn();
    showSettingsNotice(panel);
    expect(openSettings).toHaveBeenCalledOnce();
    expect(panel.hide).not.toHaveBeenCalled();
  });

  it('leaves Settings in front when it took focus from the bar', () => {
    const { panel, activate } = fixture();
    const settings = windowFixture();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([panel.window, settings]);
    panel.show();
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(settings as unknown as BrowserWindow);
    panel.hide();
    vi.advanceTimersByTime(150);
    expect(panel.window.hide).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    expect(app.hide).not.toHaveBeenCalled();
  });
});
