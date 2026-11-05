import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contentBounds,
  displayPosition,
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
  webSearch: false,
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
    expect(tracker.isUserMove({ x: 5, y: 9 })).toBe(true);
    tracker.programmatic({ x: 5, y: 20 });
    expect(tracker.isUserMove({ x: 5, y: 20 })).toBe(false);
  });
  it("returns to the anchor after shrinking near the bottom", () => {
    const anchor = { x: 200, y: 900 };
    expect(contentBounds(area, anchor, 700).y).toBe(340);
    expect(contentBounds(area, anchor, 88).y).toBe(900);
  });
  it("keeps width and top, caps at 70%, moves up only as necessary", () => {
    expect(contentBounds(area, { x: 200, y: 100 }, 10)).toEqual({
      x: 200,
      y: 100,
      width: 680,
      height: 88,
    });
    expect(contentBounds(area, { x: 200, y: 100 }, 900)).toEqual({
      x: 200,
      y: 100,
      width: 680,
      height: 700,
    });
    expect(contentBounds(area, { x: 2000, y: 990 }, 900)).toEqual({
      x: 860,
      y: 340,
      width: 680,
      height: 700,
    });
  });
  it("remembers individual displays and defaults when disconnected", () => {
    const saved = { "1": { x: 300, y: 400 }, "2": { x: 1500, y: 60 } };
    expect(displayPosition(area, "1", saved)).toEqual(saved["1"]);
    expect(displayPosition(area, "2", saved)).toEqual(saved["2"]);
    expect(displayPosition(area, "3", saved)).toEqual({ x: 480, y: 240 });
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
      shortcut: "Alt+J",
      pinned: false,
      theme: "system",
      positions: {},
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
        shortcut: "Command+Shift+K",
        pinned: true,
        theme: "dark",
        positions: { a: { x: 2, y: 3 } },
      }),
    ).toEqual({
      shortcut: "Command+Shift+K",
      pinned: true,
      theme: "dark",
      positions: { a: { x: 2, y: 3 } },
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
          expect(events[0]).toMatchObject({
            type: "error",
            kind: command.slice(5),
          });
        else {
          expect(events.at(-1)?.type).toBe("done");
          if (command === "/think")
            expect(events[0]?.type).toBe("thinking-delta");
          if (command === "/web") expect(events[0]?.type).toBe("web-search");
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
      service.send("again");
      await vi.runAllTimersAsync();
      expect(service.snapshot().active).toBe(false);
      expect(service.snapshot().messages).toHaveLength(4);
      service.newChat();
      expect(service.snapshot()).toEqual({
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
