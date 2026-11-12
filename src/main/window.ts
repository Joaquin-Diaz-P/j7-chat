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
  /** Where the card was when the current drag began; set only while dragging. */
  private dragStart: Position | undefined;
  private bounds: Area = { x: 0, y: 0, width: 828, height: 728 };
  private ready = false;
  private pendingShow = false;
  private shortcutDownAt: number | undefined;
  private shortcutShouldToggle = false;
  private hasAttachments = false;
  private outsideInteraction = false;
  private spaceFocusTimer: ReturnType<typeof setTimeout> | undefined;
  private previousWindow: BrowserWindow | undefined;
  private activatePreviousApp: (() => Promise<boolean>) | undefined;
  constructor(
    readonly settings: SettingsStore,
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
    // A Space transition also blurs panels. Only an actual outside click dismisses
    // this window; the native helper observes clicks even when another app is active.
    this.window.on("focus", () => { this.outsideInteraction = false; });
    this.window.on("will-move", () => { this.userMoving.willMove(); });
    this.window.on("moved", () => {
      const bounds = this.window.getBounds();
      this.bounds = bounds;
      const base = canvasAnchor(bounds);
      const x = base.x + this.offset.x, y = base.y + this.offset.y;
      if (!this.userMoving.isUserMove(bounds) || !this.displayId) return;
      this.anchor = { x, y };
      this.displayId = String(this.displayFor({ x, y }).id);
      settings.update({
        positions: { ...settings.value.positions, [this.displayId]: { x, y } },
      });
    });
    this.window.on("closed", () => {
      clearInterval(this.captureTimer);
      clearTimeout(this.spaceFocusTimer);
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
    this.settings.update({ historyOpen: open });
    this.notify(true);
  }

  get voiceModifier() { return this.settings.value.voiceModifier; }
  setActivatePreviousApp(activate: () => Promise<boolean>) {
    this.activatePreviousApp = activate;
  }
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
    this.outsideInteraction = false;
    const interruptedHide = !!this.hideTimer;
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (!this.ready) {
      this.pendingShow = true;
      return;
    }
    const focused = BrowserWindow.getFocusedWindow();
    this.previousWindow = focused && focused !== this.window ? focused : undefined;
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
  beginShortcut() {
    // macOS repeats global shortcut callbacks while the key remains down.
    if (this.shortcutDownAt !== undefined) return false;
    this.shortcutDownAt = Date.now();
    this.shortcutShouldToggle = !this.hideTimer && this.window.isVisible() && this.window.isFocused();
    if (!this.shortcutShouldToggle) this.show();
    return true;
  }
  endShortcut(cancelled = false) {
    if (this.shortcutDownAt === undefined) return;
    const tapped = Date.now() - this.shortcutDownAt < 200;
    this.shortcutDownAt = undefined;
    if (!this.window.isDestroyed() && !this.suppressHide &&
        ((!cancelled && tapped && this.shortcutShouldToggle) ||
         (!this.settings.value.pinned && !this.hasAttachments && this.outsideInteraction))) this.hide();
    this.shortcutShouldToggle = false;
  }
  pointerDown(point: Position) {
    if (this.window.isDestroyed() || !this.window.isVisible()) return;
    this.outsideInteraction = !capturesScreenPoint(point, this.bounds, this.regions);
    if (this.outsideInteraction) {
      clearTimeout(this.spaceFocusTimer);
      if (!this.settings.value.pinned && this.shortcutDownAt === undefined && !this.suppressHide) this.hide();
    }
  }
  spaceChanged() {
    clearTimeout(this.spaceFocusTimer);
    if (this.window.isDestroyed() || !this.window.isVisible() || this.hideTimer || this.outsideInteraction || this.suppressHide) return;
    // Let macOS finish activating the destination Space before making the panel key.
    this.spaceFocusTimer = setTimeout(() => {
      this.spaceFocusTimer = undefined;
      if (this.window.isDestroyed() || !this.window.isVisible() || this.hideTimer || this.outsideInteraction || this.suppressHide) return;
      this.window.focus();
      this.window.webContents.focus();
    }, 100);
  }
  toggle() {
    if (this.hideTimer) { this.show(); return; }
    if (this.window.isVisible() && this.window.isFocused()) this.hide();
    else this.show();
  }
  hide() {
    clearTimeout(this.spaceFocusTimer);
    if (!this.window.isVisible()) return;
    if (this.hideTimer) return;
    this.window.webContents.send("window:hiding");
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.clock.hide();
      clearInterval(this.captureTimer);
      // Read focus before hiding: once the bar hides, macOS may hand focus to Settings on its own.
      // Settings opened from the bar already took focus; handing it back to the previous app would cover it.
      const focused = BrowserWindow.getFocusedWindow();
      const focusMovedToJ7 = !!focused && focused !== this.window && !focused.isDestroyed();
      this.window.hide();
      if (focusMovedToJ7) return;
      const otherVisibleWindow = BrowserWindow.getAllWindows().some(
        window => window !== this.window && !window.isDestroyed() && window.isVisible(),
      );
      if (!otherVisibleWindow) app.hide();
      else if (this.previousWindow && !this.previousWindow.isDestroyed() && this.previousWindow.isVisible()) {
        this.previousWindow.focus();
      } else {
        void this.activatePreviousApp?.().catch(() => {});
      }
    }, 150);
  }
  beginMoveCard() {
    const base = canvasAnchor(this.window.getBounds());
    this.dragStart = {x:base.x+this.offset.x,y:base.y+this.offset.y};
    this.updateCapture();
  }
  moveCard(dx: number, dy: number) {
    // Measured from the drag's start, so after the card stops at an edge it is back under the
    // pointer as soon as the pointer returns, instead of drifting away from it.
    if (!this.dragStart) return;
    const target = {x:this.dragStart.x+dx,y:this.dragStart.y+dy};
    const display = this.displayFor(target);
    const {card, canvas, offset} = cardLayout(display.workArea, target, this.cardHeight, this.settings.value.historyOpen);
    this.anchor = {x:card.x+card.width-260,y:card.y+card.height};
    this.displayId = String(display.id);
    // While the card keeps its place in the canvas only the window moves; the renderer needs no update.
    if (offset.x !== this.offset.x || offset.y !== this.offset.y) { this.layout(this.cardHeight, this.settings.value.historyOpen); return; }
    this.place(canvas);
    this.updateCapture();
  }
  /** The display under the card's middle owns it, so dragging across monitors hands the card over. */
  private displayFor(anchor: Position) {
    const width = this.settings.value.historyOpen ? 780 : 520;
    return screen.getDisplayNearestPoint({x:Math.round(anchor.x+260-width/2),y:Math.round(anchor.y-this.cardHeight/2)});
  }
  endMoveCard() {
    this.dragStart = undefined;
    this.updateCapture();
    if(this.displayId && this.anchor) this.settings.update({positions:{...this.settings.value.positions,[this.displayId]:this.anchor}});
  }
  layout(height: number, history: boolean) {
    this.cardHeight = height;
    if (height < 680 && !history) {
      this.compactHeight = height;
      // Manual pinning belongs to the expanded view, where its button is visible.
      if (this.settings.value.pinned) this.settings.update({ pinned: false });
    }
    if (!this.anchor) return;
    const layout = cardLayout(this.displayFor(this.anchor).workArea, this.anchor, height, history);
    this.offset = layout.offset;
    this.place(layout.canvas);
    const {card, canvas} = layout;
    this.regions = [{left:card.x-canvas.x, top:card.y-canvas.y, right:card.x-canvas.x+card.width, bottom:card.y-canvas.y+card.height}];
    this.updateCapture();
    this.notify(true);
  }
  setRegions(regions: HitRect[]) { this.regions = regions; this.updateCapture(); }
  private updateCapture() {
    // While dragging, the window keeps every mouse event: the pointer can outrun a card stopped at an
    // edge, and a release passed through to the app behind would leave the drag stuck.
    const capture = !!this.dragStart || capturesScreenPoint(screen.getCursorScreenPoint(), this.bounds, this.regions);
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
  setAttachmentState(present: boolean) {
    const added = present && !this.hasAttachments;
    this.hasAttachments = present;
    // Only a new drop can cancel dismissal; later import updates cannot undo an outside click.
    if (added && this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
      this.notify(true, true);
    }
  }
  setPinned(pinned: boolean) {
    this.settings.update({ pinned });
    this.notify(true);
  }
}
