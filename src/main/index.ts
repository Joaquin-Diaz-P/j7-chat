import { setupSection } from "./setup.js";
import { openSettings, setupSettings } from "./settings-window.js";
import { strings as s } from "../renderer/strings.js";
import { SqliteChatStore } from "./chat/sqlite-store.js";
import { NativeHelper } from "./native/helper.js";
import { generateTitle } from "./titles.js";
import { setupCapture } from "./capture/setup.js";
import { AttachmentStore } from "./attachments/index.js";
import { registerAttachments, registerAttachmentProtocol } from "./attachments/ipc.js";
import { app, protocol, globalShortcut, type Tray } from "electron";
import { join } from "node:path";
import { resolveBinary, ensurePaths, getPaths } from "./paths.js";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { SettingsStore } from "./settings.js";
import { createLogger } from "./logger.js";
import { ModelCatalog } from "./chat/catalog.js";
import { ChatService } from "./chat/service.js";
import { Panel } from "./window.js";
import { registerIpc } from "./ipc.js";
import { registerShortcut } from "./shortcuts.js";
import { shortcutLabel } from "../shared/shortcut.js";
import { createTray } from "./tray.js";
protocol.registerSchemesAsPrivileged([{ scheme: "j7-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
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
let capture: ReturnType<typeof setupCapture> | undefined;
let exiting = false;
let shutdownLog: ReturnType<typeof createLogger> | undefined;
app.on("before-quit", (event) => {
  if (exiting) return;
  event.preventDefault();
  exiting = true;
  if (app.isReady()) globalShortcut.unregisterAll();
  const fallback = setTimeout(() => app.exit(0), 3500);
  void Promise.all([chat?.dispose(), capture?.dispose()]).finally(() => {
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
      if(process.env.J7_TEST === "1" && app.isPackaged) {
        const binaries = Object.fromEntries(await Promise.all((["claude","codex","opencode"] as const).map(async id=>[id,await resolveBinary(id)])));
        writeFileSync(join(paths.data,"packaged-paths.json"),JSON.stringify({...binaries,hex:existsSync("/Applications/Hex.app/Contents/MacOS/hex"),helper:existsSync(join(process.resourcesPath,"j7-helper")),PATH:process.env.PATH}));
      }
      const settings = new SettingsStore(join(paths.data, "settings.json"));
      const catalog = new ModelCatalog(settings, undefined, () => chat?.notify());
      const store = new SqliteChatStore(join(paths.data,"j7.db"),join(paths.data,"attachments"));
      const titleHelper = new NativeHelper(app.isPackaged ? join(process.resourcesPath,"j7-helper") : join(app.getAppPath(),"build/j7-helper"));
      chat = new ChatService(
        catalog,
        (event) => panel?.window.webContents.send("chat:event", event),
        (snapshot) => panel?.window.webContents.send("chat:snapshot", snapshot),
        undefined, undefined, settings.value.firstRunDone ? undefined : s.firstRun(shortcutLabel(settings.value.shortcut)), store, settings, log,
      );
      chat.titleGenerator = text => generateTitle(text, async text => {
        const reply = await titleHelper.request("generateTitle",{text});
        return reply.ok && typeof reply.title === "string" ? reply.title : "";
      });
      const attachments = new AttachmentStore(join(paths.data, "attachments"),store)
      await attachments.cleanup();
      registerAttachmentProtocol(attachments);
      panel = new Panel(settings, chat);
      if(process.env.J7_TEST === "1") (globalThis as typeof globalThis & {j7Show?:()=>void}).j7Show = ()=>panel?.show();
      registerAttachments(panel, attachments);
      capture = setupCapture(panel, attachments, settings);
      registerIpc(panel, chat, attachments);
      tray = createTray(panel, settings);
      const firstRun = !settings.value.firstRunDone;
      const settingsAccess = setupSettings(settings,panel,chat,capture,()=>{tray?.destroy();tray=createTray(panel!,settings);});
      registerShortcut(settings.value.shortcut, () => panel?.toggle(), log);
      panel.window.webContents.on("render-process-gone", () =>
        log("renderer-failed"),
      );
      if (!settings.value.firstRunDone) {
        if (app.isPackaged) app.setLoginItemSettings({openAtLogin:true}); settings.update({firstRunDone:true,openAtLogin:true});
        panel.show(); setTimeout(()=>chat?.dismissWelcome(),6500);
      }
      chat.start();
      void chat.catalog.refresh().then(async()=>{if(exiting||!chat)return;const section=setupSection({statuses:chat.catalog.snapshot().statuses,permissions:await settingsAccess.permissions(),firstRun});if(section && !exiting)openSettings(section);}).catch(()=>console.error("Setup check failed"));
    })
    .catch(() => {
      console.error("J7 startup failed");
      app.exit(1);
    });
}
