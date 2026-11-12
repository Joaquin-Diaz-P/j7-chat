import type { Message } from "../../shared/ipc.js";
import type { ProviderId } from "../providers/types.js";
export interface Chat {
  id: string;
  model: string;
  provider: ProviderId;
  webSearch: boolean;
  effort: string;
  compareModels?: string[];
}
export interface ProviderSession {
  chatId: string;
  provider: ProviderId;
  nativeSessionId: string;
  lastMessageId: string;
  instructionsHash: string;
}
export interface ChatStore {
  createChat(chat: Chat): void;
  getChat(id: string): Chat | undefined;
  updateChat(id: string, changes: Partial<Omit<Chat, "id">>): void;
  listMessages(chatId: string): Message[];
  appendMessage(chatId: string, message: Message): void;
  updateMessage(chatId: string, messageId: string, changes: Partial<Omit<Message, "id">>): void;
  deleteMessagesFrom(chatId: string, messageId: string): void;
  getProviderSession(chatId: string, provider: ProviderId): ProviderSession | undefined;
  upsertProviderSession(session: ProviderSession): void;
}
