import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VisibilityClock,
  UserMoveTracker,
} from "../src/main/window-state.js";
import { SettingsStore, validateSettings } from "../src/main/settings.js";
import { MockProvider } from "../src/main/providers/mock.js";
import { ChatService } from "../src/main/chat/service.js";
import type { ChatEvent, TurnInput } from "../src/main/providers/types.js";
const input = (
  text: string,
  signal = new AbortController().signal,
): TurnInput => ({
  model: "mock",
  effort: "normal",
  webSearch: true,
  instructions: "",
  text,
  attachments: [],
  signal,
});
const area = { x: 100, y: 40, width: 1440, height: 1000 };
describe("panel geometry and clock", () => {
  it("keeps every move of a drag and ignores programmatic moves", () => {
    const tracker = new UserMoveTracker();
    expect(tracker.isUserMove({ x: 1, y: 1 })).toBe(false);
    tracker.willMove();
    expect(tracker.isUserMove({ x: 1, y: 1 })).toBe(true);
    expect(tracker.isUserMove({ x: 5, y: 9 })).toBe(false);
    tracker.programmatic({ x: 5, y: 20 });
    expect(tracker.isUserMove({ x: 5, y: 20 })).toBe(false);
  });
  it("resumes at 4:59 and resets at 5:00 or later", () => {
    let time = 0;
    const clock = new VisibilityClock(() => time);
    expect(clock.shouldResume(true)).toBe(false);
    clock.hide();
    time = 299000;
    expect(clock.shouldResume(true)).toBe(true);
    expect(clock.shouldResume(false)).toBe(false);
    time = 300000;
    expect(clock.shouldResume(true)).toBe(false);
    time = 301000;
    expect(clock.shouldResume(true)).toBe(false);
  });
});
describe("settings", () => {
  it("validates each field independently", () => {
    expect(validateSettings(null)).toEqual({
      firstRunDone: false,
      openAtLogin: true,
      historyOpen: false,
      shortcut: "Alt+J",
      captureShortcut: "Alt+Shift+J",
      voiceModifier: "right-option",
      pinned: false,
      theme: "system",
      positionsVersion: 2,
      positions: {},
      favorites: [],
      defaultModel: null,
      personalInstructions: "",
    });
    expect(
      validateSettings({
        shortcut: "bad",
        pinned: "yes",
        theme: "wrong",
        positions: { a: { x: NaN, y: 3 } },
      }),
    ).toEqual(validateSettings({}));
    expect(
      validateSettings({
        firstRunDone: false,
      openAtLogin: true,
      historyOpen: false,
      shortcut: "Command+Shift+K",
        pinned: true,
        theme: "dark",
        positions: { a: { x: 2, y: 3 } },
      }),
    ).toEqual({
      firstRunDone: false,
      openAtLogin: true,
      historyOpen: false,
      shortcut: "Command+Shift+K",
      captureShortcut: "Alt+Shift+J",
      voiceModifier: "right-option",
      pinned: true,
      theme: "dark",
      positionsVersion: 2,
      positions: { a: { x: 342, y: 91 } },
      favorites: [],
      defaultModel: null,
      personalInstructions: "",
    });
  });
  it("creates missing settings, survives corruption and persists updates", () => {
    const dir = mkdtempSync(join(tmpdir(), "j7-settings-"));
    try {
      const file = join(dir, "settings.json");
      const store = new SettingsStore(file);
      store.update({ pinned: true });
      expect(new SettingsStore(file).value.pinned).toBe(true);
      writeFileSync(file, "{broken");
      expect(new SettingsStore(file).value.pinned).toBe(false);
      expect(JSON.parse(readFileSync(file, "utf8")).shortcut).toBe("Alt+J");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
describe("mock and chat", () => {
  it("streams every M5 command and cancels slow turns", async () => {
    vi.useFakeTimers();
    try {
      const mock = new MockProvider();
      for (const command of [
        "/md",
        "/think",
        "/web",
        "/slow",
        "/err auth",
        "/err quota",
        "/err unsupported",
        "/err other",
      ]) {
        const events: ChatEvent[] = [];
        const task = (async () => {
          for await (const event of mock.runTurn(input(command)))
            events.push(event);
        })();
        await vi.runAllTimersAsync();
        await task;
        if (command.startsWith("/err"))
          expect(events.find(e => e.type === "error")).toMatchObject({
            type: "error",
            kind: command.slice(5),
          });
        else {
          expect(events.at(-1)?.type).toBe("done");
          if (command === "/think")
            expect(events.some(e => e.type === "thinking-delta")).toBe(true);
          if (command === "/web") expect(events.some(e => e.type === "web-search")).toBe(true);
          if (command === "/md")
            expect(
              events
                .filter((e) => e.type === "text-delta")
                .map((e) => e.text)
                .join(""),
            ).toContain("$$E=mc^2$$");
        }
      }
      const controller = new AbortController();
      const iterator = mock
        .runTurn(input("/slow", controller.signal))
        [Symbol.asyncIterator]();
      expect((await iterator.next()).value?.type).toBe("session");
      const first = iterator.next();
      await vi.advanceTimersByTimeAsync(140);
      expect((await first).done).toBe(false);
      controller.abort();
      expect((await iterator.next()).done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("receives live text, blocks overlapping sends, retains partial text on stop, sends again and clears empty chats", async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      const service = new ChatService(new MockProvider(), (event) =>
        events.push(event),
      );
      expect(service.snapshot().chatId).toBeNull();
      service.send("/slow");
      service.send("ignored");
      expect(service.snapshot().messages).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(280);
      expect(events.length).toBeGreaterThan(0);
      expect(service.snapshot().messages[1]?.text.length).toBeGreaterThan(0);
      service.stop();
      expect(service.snapshot().messages[1]?.status).toBe("stopped");
      await service.waitForIdle();
      service.send("again");
      await vi.runAllTimersAsync();
      expect(service.snapshot().active).toBe(false);
      expect(service.snapshot().messages).toHaveLength(4);
      service.newChat();
      expect(service.snapshot()).toMatchObject({
        chatId: null,
        messages: [],
        active: false,
      });
      await service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("logger", () => {
  it("rotates at 5 MB and writes only fixed event names", async () => {
    const { createLogger } = await import("../src/main/logger.js");
    const directory = mkdtempSync(join(tmpdir(), "j7-log-"));
    try {
      const log = createLogger(directory);
      const path = join(directory, "logs/main.log");
      writeFileSync(path, Buffer.alloc(5 * 1024 * 1024, 32));
      log("startup");
      expect(readFileSync(path + ".1").length).toBe(5 * 1024 * 1024);
      expect(readFileSync(path, "utf8")).toMatch(/^\S+ startup\n$/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
