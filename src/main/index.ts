import { app, globalShortcut, type Tray } from "electron";
import { join } from "node:path";
import { ensurePaths } from "./paths.js";
import { SettingsStore } from "./settings.js";
import { createLogger } from "./logger.js";
import { selectChatProvider } from "./chat/provider.js";
import { ChatService } from "./chat/service.js";
import { Panel } from "./window.js";
import { registerIpc } from "./ipc.js";
import { registerShortcut } from "./shortcuts.js";
import { createTray } from "./tray.js";
app.setName("J7 Chat");
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());
let panel: Panel | undefined;
let chat: ChatService | undefined;
let tray: Tray | undefined;
let exiting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => panel?.show());
  app.on("window-all-closed", () => {});
  app.on("activate", () => panel?.show());
  void app
    .whenReady()
    .then(async () => {
      app.dock?.hide();
      const paths = await ensurePaths();
      const log = createLogger(paths.data);
      log("startup");
      const settings = new SettingsStore(join(paths.data, "settings.json"));
      const selected = await selectChatProvider();
      chat = new ChatService(
        selected.provider,
        (event) => panel?.window.webContents.send("chat:event", event),
        (snapshot) => panel?.window.webContents.send("chat:snapshot", snapshot),
        selected.model, selected.label, selected.warning,
      );
      panel = new Panel(settings, chat);
      registerIpc(panel, chat);
      tray = createTray(panel, settings);
      registerShortcut(settings.value.shortcut, () => panel?.toggle(), log);
      panel.window.webContents.on("render-process-gone", () =>
        log("renderer-failed"),
      );
      app.on("before-quit", (event) => {
        if (exiting) return;
        event.preventDefault();
        exiting = true;
        globalShortcut.unregisterAll();
        void chat?.dispose().finally(() => {
          log("shutdown");
          tray?.destroy();
          app.exit(0);
        });
      });
      panel.show();
    })
    .catch(() => {
      console.error("J7 startup failed");
      app.exit(1);
    });
}
