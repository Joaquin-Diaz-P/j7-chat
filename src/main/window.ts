import { app, BrowserWindow, screen, nativeTheme } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentBounds,
  historyBounds,
  displayPosition,
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
  private ready = false;
  private pendingShow = false;
  constructor(
    private settings: SettingsStore,
    private chat: ChatService,
    now: () => number = Date.now,
  ) {
    this.clock = new VisibilityClock(now);
    this.window = new BrowserWindow({
      width: 680,
      height: 88,
      type: "panel",
      frame: false,
      transparent: true,
      vibrancy: "popover",
      visualEffectState: "active",
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
      const x = bounds.x + (settings.value.historyOpen ? 260 : 0), y = bounds.y;
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
    if (url) void this.window.loadURL(url);
    else
      void this.window.loadFile(
        join(
          fileURLToPath(new URL(".", import.meta.url)),
          "../renderer/index.html",
        ),
      );
  }
  setHistory(open: boolean) {
    if (this.settings.value.historyOpen === open) return;
    const b=this.window.getBounds(), area=screen.getDisplayMatching(b).workArea;
    this.settings.update({historyOpen:open});
    this.place(historyBounds(b,open,area));
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
    this.anchor = displayPosition(display.workArea, this.displayId, this.settings.value.positions);
    this.place(
      contentBounds(
        display.workArea,
        this.anchor,
        resume ? this.window.getBounds().height : 88,
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
    const display = screen.getDisplayMatching(this.window.getBounds());
    this.place(
      contentBounds(display.workArea, this.anchor ?? this.window.getBounds(), this.settings.value.historyOpen ? Math.max(360,height) : height),
    );
  }
  private place(bounds: Area) {
    if(this.settings.value.historyOpen && bounds.width===680) bounds={...bounds,height:Math.max(360,bounds.height),x:Math.max(screen.getDisplayMatching(bounds).workArea.x,bounds.x-260),width:940};
    this.userMoving.programmatic(bounds);
    this.window.setBounds(bounds, false);
  }
  setPinned(pinned: boolean) {
    this.settings.update({ pinned });
    this.notify(true);
  }
}
