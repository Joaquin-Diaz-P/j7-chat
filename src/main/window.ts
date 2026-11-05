import { capturesScreenPoint, type HitRect } from "../shared/hit-test.js";
import { defaultAnchor, canvasAnchor, validAnchor, cardLayout } from "./window-geometry.js";
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
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private regions: HitRect[] = [];
  private offset = { x: 0, y: 0 };
  private cardHeight = 106;
  private compactHeight = 106;
  private captureTimer: ReturnType<typeof setInterval> | undefined;
  private captured: boolean | undefined;
  private bounds: Area = { x: 0, y: 0, width: 828, height: 728 };
  private ready = false;
  private pendingShow = false;
  constructor(
    private settings: SettingsStore,
    private chat: ChatService,
    now: () => number = Date.now,
  ) {
    this.clock = new VisibilityClock(now);
    this.window = new BrowserWindow({
      width: 828,
      height: 728,
      type: "panel",
      frame: false,
      transparent: true,
      roundedCorners: true,
      hasShadow: false,
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
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.setAlwaysOnTop(true, "floating");
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.on("blur", () => {
      if (!settings.value.pinned && !this.suppressHide) this.hide();
    });
    this.window.on("will-move", () => { this.userMoving.willMove(); });
    this.window.on("moved", () => {
      const bounds = this.window.getBounds();
      this.bounds = bounds;
      const base = canvasAnchor(bounds);
      const x = base.x + this.offset.x, y = base.y + this.offset.y;
      if (!this.userMoving.isUserMove(bounds) || !this.displayId) return;
      this.anchor = { x, y };
      this.displayId = String(
        screen.getDisplayMatching(this.window.getBounds()).id,
      );
      settings.update({
        positions: { ...settings.value.positions, [this.displayId]: { x, y } },
      });
    });
    this.window.on("closed", () => clearInterval(this.captureTimer));
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
    this.settings.update({ historyOpen: open });
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
        offset: this.offset,
        resume,
        appeared,
        historyOpen: this.settings.value.historyOpen,
        pinned: this.settings.value.pinned,
        dark: nativeTheme.shouldUseDarkColors,
      });
  }
  show() {
    const interruptedHide = !!this.hideTimer;
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (!this.ready) {
      this.pendingShow = true;
      return;
    }
    if (this.window.isVisible()) {
      this.updateCapture();
      this.window.focus();
      this.notify(true, interruptedHide);
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
    this.layout(this.settings.value.historyOpen || this.chat.snapshot().messages.length ? 680 : (resume ? this.compactHeight : 106), this.settings.value.historyOpen);
    this.updateCapture();
    this.window.show();
    this.updateCapture();
    clearInterval(this.captureTimer);
    this.captureTimer = setInterval(() => this.updateCapture(), 50);
    this.window.focus();
    this.notify(resume, true);
  }
  toggle() {
    if (this.hideTimer) { this.show(); return; }
    if (this.window.isVisible() && this.window.isFocused()) this.hide();
    else this.show();
  }
  hide() {
    if (!this.window.isVisible()) return;
    if (this.hideTimer) return;
    this.window.webContents.send("window:hiding");
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.clock.hide();
      clearInterval(this.captureTimer);
      this.window.hide();
      app.hide();
    }, 150);
  }
  moveCard(dx: number, dy: number) {
    const bounds = this.window.getBounds();
    const base = canvasAnchor(bounds);
    this.anchor = {x:base.x+this.offset.x+dx,y:base.y+this.offset.y+dy};
    const area = screen.getDisplayMatching(bounds).workArea;
    const {card} = cardLayout(area, this.anchor, this.cardHeight, this.settings.value.historyOpen);
    this.anchor = {x:card.x+card.width-260,y:card.y+card.height};
    this.layout(this.cardHeight, this.settings.value.historyOpen);
  }
  endMoveCard() {
    if(this.displayId && this.anchor) this.settings.update({positions:{...this.settings.value.positions,[this.displayId]:this.anchor}});
  }
  layout(height: number, history: boolean) {
    this.cardHeight = height;
    if (height < 680 && !history) this.compactHeight = height;
    if (!this.anchor) return;
    const area = screen.getDisplayMatching(this.window.getBounds()).workArea;
    const layout = cardLayout(area, this.anchor, height, history);
    this.offset = layout.offset;
    this.place(layout.canvas);
    const {card, canvas} = layout;
    this.regions = [{left:card.x-canvas.x, top:card.y-canvas.y, right:card.x-canvas.x+card.width, bottom:card.y-canvas.y+card.height}];
    this.updateCapture();
    this.notify(true);
  }
  setRegions(regions: HitRect[]) { this.regions = regions; this.updateCapture(); }
  private updateCapture() {
    const capture = capturesScreenPoint(screen.getCursorScreenPoint(), this.bounds, this.regions);
    if (capture !== this.captured) {
      this.captured = capture;
      this.window.setIgnoreMouseEvents(!capture, { forward: true });
    }
  }
  private place(bounds: Area) {

    this.bounds = bounds;
    this.userMoving.programmatic(bounds);
    this.window.setBounds(bounds, false);
  }
  setPinned(pinned: boolean) {
    this.settings.update({ pinned });
    this.notify(true);
  }
}
