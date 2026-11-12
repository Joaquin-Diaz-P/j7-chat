import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ipcMain:{handle:vi.fn(),on:vi.fn()}}));
vi.mock("../../src/main/tray.js", () => ({showSettingsNotice:vi.fn()}));
import { registerIpc } from "../../src/main/ipc.js";
import { showSettingsNotice } from "../../src/main/tray.js";
import type { Panel } from "../../src/main/window.js";
import type { ChatService } from "../../src/main/chat/service.js";
import type { AttachmentStore } from "../../src/main/attachments/index.js";

describe("settings keyboard fallback", () => {
  it("opens settings before DOM handling for the physical comma key, ignoring modified combinations and key-up", () => {
    const webContents = new EventEmitter(), panel = {window:{webContents}} as unknown as Panel;
    registerIpc(panel, {} as ChatService, {} as AttachmentStore);
    const preventDefault=vi.fn();
    const input={type:"keyDown",meta:true,control:false,alt:false,shift:false,code:"Comma",key:"unidentified"};
    webContents.emit("before-input-event",{preventDefault},input);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(showSettingsNotice).toHaveBeenCalledWith(panel);
    for (const change of [{type:"keyUp"},{control:true},{alt:true},{shift:true},{meta:false},{code:"KeyA",key:"a"}]) webContents.emit("before-input-event",{preventDefault},{...input,...change});
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
