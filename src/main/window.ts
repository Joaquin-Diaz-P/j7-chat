import { defaultAnchor, panelBounds, validAnchor } from "./window-geometry.js";
import { app, BrowserWindow, screen, nativeTheme } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VisibilityClock,
  UserMoveTracker,
  type Area,
} from "./window-state.js";
import type { SettingsStore } from "./settings.js";
import type { ChatService } from "./chat/service.js";
import type { Position } from "./settings.js";
export class Panel {
  readonly window: BrowserWindow;
  suppressHide = false;
  private clock: VisibilityClock;
  private displayId: string | undefined;
  private anchor: Position | undefined;
  private userMoving = new UserMoveTracker();
  private compactHeight = 90;
  private ready = false;
  private pendingShow = false;
  constructor(
    private settings: SettingsStore,
    private chat: ChatService,
    now: () => number = Date.now,
  ) {
    this.clock = new VisibilityClock(now);
    this.window = new BrowserWindow({
      width: 520,
      height: 90,
      type: "panel",
      frame: false,
      transparent: true,
      roundedCorners: true,
      hasShadow: true,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(
          fileURLToPath(new URL(".", import.meta.url)),
          "../preload/index.cjs",
        ),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.window.setAlwaysOnTop(true, "floating");
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.on("blur", () => {
      if (!settings.value.pinned && !this.suppressHide) this.hide();
    });
    this.window.on("will-move", () => { this.userMoving.willMove(); });
    this.window.on("moved", () => {
      const bounds = this.window.getBounds();
      const x = bounds.x + (settings.value.historyOpen ? 260 : 0) + 260, y = bounds.y + bounds.height;
      if (!this.userMoving.isUserMove(bounds) || !this.displayId) return;
      this.anchor = { x, y };
      this.displayId = String(
        screen.getDisplayMatching(this.window.getBounds()).id,
      );
      settings.update({
        positions: { ...settings.value.positions, [this.displayId]: { x, y } },
      });
    });
    nativeTheme.themeSource = settings.value.theme;
    nativeTheme.on("updated", () => this.notify(true));
    this.window.webContents.on("will-navigate", (event) =>
      event.preventDefault(),
    );
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      void this.openExternal(url);
      return { action: "deny" };
    });
    const url = process.env.ELECTRON_RENDERER_URL;
    if (url) void this.window.loadURL(url).catch(() => console.error("Renderer load failed"));
    else
      void this.window.loadFile(
        join(
          fileURLToPath(new URL(".", import.meta.url)),
          "../renderer/index.html",
        ),
      ).catch(() => console.error("Renderer load failed"));
  }
  setHistory(open: boolean) {
    if (this.settings.value.historyOpen === open) return;
    const area = screen.getDisplayMatching(this.window.getBounds()).workArea;
    this.settings.update({ historyOpen: open });
    this.place(panelBounds(area, this.anchor ?? defaultAnchor(area), open || this.chat.snapshot().messages.length ? 680 : this.compactHeight, open));
    this.notify(true);
  }

  get voiceModifier() { return this.settings.value.voiceModifier; }
  private async openExternal(url: string) {
    if (/^https?:\/\//.test(url)) {
      const { shell } = await import("electron");
      await shell.openExternal(url);
    }
  }
  rendererReady() {
    this.ready = true;
    this.notify(true);
    if (this.pendingShow) {
      this.pendingShow = false;
      this.show();
    }
  }
  notify(resume: boolean, appeared = false) {
    if (this.ready)
      this.window.webContents.send("window:state", {
        resume,
        appeared,
        historyOpen: this.settings.value.historyOpen,
        pinned: this.settings.value.pinned,
        dark: nativeTheme.shouldUseDarkColors,
      });
  }
  show() {
    if (!this.ready) {
      this.pendingShow = true;
      return;
    }
    if (this.window.isVisible()) {
      this.window.focus();
      this.notify(true);
      return;
    }
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    this.displayId = String(display.id);
    const resume = this.clock.shouldResume(!!this.chat.snapshot().chatId);
    if (!resume) this.chat.newChat();
    const saved = this.settings.value.positions[this.displayId];
    const area = display.workArea;
    this.anchor = validAnchor(area, saved) ?? defaultAnchor(area);
    if (saved && this.anchor !== saved) {
      const positions = { ...this.settings.value.positions };
      delete positions[this.displayId];
      this.settings.update({ positions });
    }
    this.place(
      panelBounds(
        display.workArea,
        this.anchor,
        this.settings.value.historyOpen || (resume && this.chat.snapshot().messages.length) ? 680 : this.compactHeight,
        this.settings.value.historyOpen,
      ),
    );
    this.window.show();
    this.window.focus();
    this.notify(resume, true);
  }
  toggle() {
    if (this.window.isVisible() && this.window.isFocused()) this.hide();
    else this.show();
  }
  hide() {
    if (!this.window.isVisible()) return;
    this.clock.hide();
    this.window.hide();
    app.hide();
  }
  setHeight(height: number) {
    if (!Number.isFinite(height) || height < 0) return;
    if (height < 680) this.compactHeight = height;
    const display = screen.getDisplayMatching(this.window.getBounds());
    this.place(
      panelBounds(display.workArea, this.anchor ?? defaultAnchor(display.workArea), this.chat.snapshot().messages.length ? 680 : this.settings.value.historyOpen ? 680 : height, this.settings.value.historyOpen),
    );
  }
  private place(bounds: Area) {

    this.userMoving.programmatic(bounds);
    this.window.setBounds(bounds, false);
  }
  setPinned(pinned: boolean) {
    this.settings.update({ pinned });
    this.notify(true);
  }
}
