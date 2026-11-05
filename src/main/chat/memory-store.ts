import type { Message } from "../../shared/ipc.js";
import type { ProviderId } from "../providers/types.js";
import type { Chat, ChatStore, ProviderSession } from "./store.js";
export class MemoryChatStore implements ChatStore {
  private chats = new Map<string, Chat>();
  private messages = new Map<string, Message[]>();
  private sessions = new Map<string, ProviderSession>();
  createChat(chat: Chat) {
    if (this.chats.has(chat.id)) throw new Error("Duplicate chat");
    this.chats.set(chat.id, structuredClone(chat));
    this.messages.set(chat.id, []);
  }
  getChat(id: string) { return structuredClone(this.chats.get(id)); }
  updateChat(id: string, changes: Partial<Omit<Chat, "id">>) {
    const chat = this.chats.get(id);
    if (!chat) throw new Error("Unknown chat");
    Object.assign(chat, structuredClone(changes));
  }
  listMessages(chatId: string) { return structuredClone(this.messages.get(chatId) ?? []); }
  appendMessage(chatId: string, message: Message) {
    const messages = this.messages.get(chatId);
    if (!messages) throw new Error("Unknown chat");
    if (messages.some(m => m.id === message.id)) throw new Error("Duplicate message");
    messages.push(structuredClone(message));
  }
  updateMessage(chatId: string, id: string, changes: Partial<Omit<Message, "id">>) {
    const message = this.messages.get(chatId)?.find(m => m.id === id);
    if (!message) throw new Error("Unknown message");
    Object.assign(message, structuredClone(changes));
  }
  deleteMessagesFrom(chatId: string, id: string) {
    const messages = this.messages.get(chatId);
    const index = messages?.findIndex(m => m.id === id) ?? -1;
    if (!messages || index < 0) return;
    messages.splice(index);
    // A discarded response must never survive inside any provider's native history.
    for (const [key, session] of this.sessions) if (session.chatId === chatId) this.sessions.delete(key);
  }
  getProviderSession(chatId: string, provider: ProviderId) { return structuredClone(this.sessions.get(`${chatId}:${provider}`)); }
  upsertProviderSession(session: ProviderSession) {
    if (!this.chats.has(session.chatId)) throw new Error("Unknown chat");
    this.sessions.set(`${session.chatId}:${session.provider}`, structuredClone(session));
  }
}
