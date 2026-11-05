import { create } from "zustand";
import type { ChatSnapshot, ChatEnvelope } from "../shared/ipc.js";
interface State extends ChatSnapshot {
  setSnapshot: (snapshot: ChatSnapshot) => void;
  event: (event: ChatEnvelope) => void;
}
export const useChat = create<State>((set) => ({
  chatId: null,
  messages: [],
  active: false,
  setSnapshot: (snapshot) => set(snapshot),
  event: ({ chatId, messageId, event }) =>
    set((state) => {
      if (chatId !== state.chatId) return {};
      return {
        messages: state.messages.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                thinking: event.type === "thinking-delta" ? (message.thinking ?? "") + event.text : (message.thinking ?? ""),
                text:
                  event.type === "text-delta"
                    ? message.text + event.text
                    : event.type === "error"
                      ? event.message
                      : message.text,
              },
        ),
      };
    }),
}));
