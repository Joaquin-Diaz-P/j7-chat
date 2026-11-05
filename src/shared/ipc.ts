import type { ChatEvent } from "../main/providers/types.js";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  status: "streaming" | "complete" | "stopped" | "error";
}
export interface ChatSnapshot {
  chatId: string | null;
  messages: Message[];
  active: boolean;
  providerLabel?: string;
  warning?: string;
}
export interface ChatEnvelope {
  chatId: string;
  messageId: string;
  event: ChatEvent;
}
export interface PanelState {
  resume: boolean;
  pinned: boolean;
  dark: boolean;
}
export interface J7Api {
  snapshot(): Promise<ChatSnapshot>;
  send(text: string): Promise<void>;
  stop(): Promise<void>;
  newChat(): Promise<void>;
  hide(): void;
  setContentHeight(height: number): void;
  setPinned(pinned: boolean): void;
  ready(): void;
  onChat(callback: (event: ChatEnvelope) => void): () => void;
  onSnapshot(callback: (snapshot: ChatSnapshot) => void): () => void;
  onPanel(callback: (state: PanelState) => void): () => void;
}
declare global {
  interface Window {
    j7: J7Api;
  }
}
