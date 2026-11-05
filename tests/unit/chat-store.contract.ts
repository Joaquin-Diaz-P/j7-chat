import { beforeEach, describe, expect, it } from "vitest";
import type { ChatStore } from "../../src/main/chat/store.js";
export function chatStoreContract(name: string, factory: () => ChatStore | Promise<ChatStore>) {
  describe(`${name}: ChatStore contract`, () => {
    let store: ChatStore;
    beforeEach(async () => { store = await factory(); store.createChat({ id: "a", model: "claude:haiku", provider: "claude", effort: "normal", webSearch: true }); });
    it("creates and updates independent chats without exposing mutable values", () => {
      store.createChat({ id: "b", model: "codex:luna", provider: "codex", effort: "high", webSearch: false });
      store.updateChat("a", { model: "codex:luna", provider: "codex", webSearch: false, effort: "high" });
      expect(store.getChat("a")).toMatchObject({ model: "codex:luna", effort: "high", webSearch: false });
      const copy = store.getChat("a")!; copy.model = "mutated";
      expect(store.getChat("a")?.model).toBe("codex:luna");
      expect(store.getChat("b")?.effort).toBe("high");
      expect(store.getChat("missing")).toBeUndefined();
      expect(() => store.createChat(copy)).toThrow();
    });
    it("appends ordered messages and updates content, status and metadata", () => {
      const message = { id: "u", role: "user" as const, text: "hi", status: "complete" as const, attachments: [] };
      store.appendMessage("a", message); message.text = "mutated";
      store.appendMessage("a", { id: "r", role: "assistant", text: "", status: "streaming" });
      store.updateMessage("a", "r", { text: "answer", thinking: "reason", status: "complete", model: "claude:haiku", sources: ["https://example.com"] });
      const messages = store.listMessages("a");
      expect(messages.map(m => m.id)).toEqual(["u", "r"]);
      expect(messages[0]?.text).toBe("hi");
      expect(messages[1]).toMatchObject({ text: "answer", thinking: "reason", sources: ["https://example.com"] });
      messages[1]!.sources!.push("https://mutated.test");
      expect(store.listMessages("a")[1]?.sources).toHaveLength(1);
      expect(() => store.appendMessage("a", messages[0]!)).toThrow();
      expect(() => store.updateMessage("a", "missing", { text: "bad" })).toThrow();
    });
    it("stores a native session and watermark independently per chat and provider", () => {
      store.createChat({ id: "b", model: "claude:haiku", provider: "claude", effort: "normal", webSearch: true });
      const session = { chatId: "a", provider: "claude" as const, nativeSessionId: "native", lastMessageId: "r", instructionsHash: "hash" };
      store.upsertProviderSession(session);
      store.upsertProviderSession({ ...session, provider: "codex", nativeSessionId: "gpt" });
      store.upsertProviderSession({ ...session, chatId: "b", nativeSessionId: "b-native" });
      const copy = store.getProviderSession("a", "claude")!; copy.nativeSessionId = "bad";
      expect(store.getProviderSession("a", "claude")?.nativeSessionId).toBe("native");
      expect(store.getProviderSession("a", "codex")?.nativeSessionId).toBe("gpt");
      expect(store.getProviderSession("b", "claude")?.nativeSessionId).toBe("b-native");
      store.upsertProviderSession({ ...session, lastMessageId: "r2" });
      expect(store.getProviderSession("a", "claude")?.lastMessageId).toBe("r2");
    });
    it("deletes from the indicated message inclusively and invalidates native histories", () => {
      for (const id of ["u", "r", "u2", "r2"]) store.appendMessage("a", { id, role: "user", text: id, status: "complete" });
      store.upsertProviderSession({ chatId: "a", provider: "claude", nativeSessionId: "native", lastMessageId: "r2", instructionsHash: "hash" });
      store.deleteMessagesFrom("a", "u2");
      expect(store.listMessages("a").map(m => m.id)).toEqual(["u", "r"]);
      expect(store.getProviderSession("a", "claude")).toBeUndefined();
      store.deleteMessagesFrom("a", "unknown");
      expect(store.listMessages("a")).toHaveLength(2);
    });
  });
}
