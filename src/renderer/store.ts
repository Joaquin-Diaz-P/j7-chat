import { create } from "zustand";
import type { ChatSnapshot, ChatEnvelope } from "../shared/ipc.js";
import { DeltaBatcher } from "./delta-batcher.js";
let deltas: DeltaBatcher;
interface State extends ChatSnapshot {
  setSnapshot: (snapshot: ChatSnapshot) => void;
  event: (event: ChatEnvelope) => void;
}
export const useChat = create<State>((set) => ({
  chatId: null,
  messages: [],
  active: false,
  setSnapshot: (snapshot) => { deltas.flush(); set(snapshot); },
  event: (event) => deltas.push(event),
}));
deltas = new DeltaBatcher(({ chatId, messageId, event }) =>
    useChat.setState((state) => {
      if (chatId !== state.chatId) return {};
      return {
        messages: state.messages.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                images: event.type === "image-generation" ? [...(message.images ?? []).filter(i => i.id !== event.image.id), event.image] : (message.images ?? []),
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
    }));
