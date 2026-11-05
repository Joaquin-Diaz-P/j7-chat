import { app, globalShortcut, type Tray } from "electron";
import { join } from "node:path";
import { ensurePaths, getPaths } from "./paths.js";
import { mkdirSync } from "node:fs";
import { SettingsStore } from "./settings.js";
import { createLogger } from "./logger.js";
import { ModelCatalog } from "./chat/catalog.js";
import { ChatService } from "./chat/service.js";
import { Panel } from "./window.js";
import { registerIpc } from "./ipc.js";
import { registerShortcut } from "./shortcuts.js";
import { createTray } from "./tray.js";
app.setName("J7 Chat");
if (process.env.J7_DATA_DIR) {
  const data = getPaths().data;
  mkdirSync(data, { recursive: true, mode: 0o700 });
  app.setPath("userData", data);
}
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());
let panel: Panel | undefined;
let chat: ChatService | undefined;
let tray: Tray | undefined;
let exiting = false;
let shutdownLog: ReturnType<typeof createLogger> | undefined;
app.on("before-quit", (event) => {
  if (exiting) return;
  event.preventDefault();
  exiting = true;
  globalShortcut.unregisterAll();
  const fallback = setTimeout(() => app.exit(0), 4_000);
  void (chat?.dispose() ?? Promise.resolve()).finally(() => {
    clearTimeout(fallback);
    shutdownLog?.("shutdown");
    tray?.destroy();
    app.exit(0);
  });
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => panel?.show());
  app.on("window-all-closed", () => {});
  app.on("activate", () => panel?.show());
  void app
    .whenReady()
    .then(async () => {
      if (exiting) return;
      app.dock?.hide();
      const paths = await ensurePaths();
      if (exiting) return;
      const log = createLogger(paths.data);
      shutdownLog = log;
      log("startup");
      const settings = new SettingsStore(join(paths.data, "settings.json"));
      const catalog = new ModelCatalog(settings, undefined, () => chat?.notify());
      chat = new ChatService(
        catalog,
        (event) => panel?.window.webContents.send("chat:event", event),
        (snapshot) => panel?.window.webContents.send("chat:snapshot", snapshot),
        undefined, undefined, undefined, undefined, settings,
      );
      panel = new Panel(settings, chat);
      registerIpc(panel, chat);
      tray = createTray(panel, settings);
      registerShortcut(settings.value.shortcut, () => panel?.toggle(), log);
      panel.window.webContents.on("render-process-gone", () =>
        log("renderer-failed"),
      );
      panel.show();
      chat.start();
    })
    .catch(() => {
      console.error("J7 startup failed");
      app.exit(1);
    });
}
