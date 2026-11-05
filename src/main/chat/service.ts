import { strings } from "../../renderer/strings.js";
import { buildChatInstructions } from "./instructions.js";
import { randomUUID } from "node:crypto";
import type { ChatProvider } from "../providers/types.js";
import type { ChatEnvelope, ChatSnapshot, Message } from "../../shared/ipc.js";
export class ChatService {
  private nativeSessionId: string | undefined;
  private chatId: string | null = null;
  private messages: Message[] = [];
  private controller: AbortController | undefined;
  private running = new Set<Promise<void>>();
  constructor(
    private provider: ChatProvider,
    private emit: (event: ChatEnvelope) => void,
    private changed: (snapshot: ChatSnapshot) => void = () => {},
    private model = "mock",
    private providerLabel?: string,
    private warning?: string,
  ) {}
  snapshot(): ChatSnapshot {
    return structuredClone({
      chatId: this.chatId,
      messages: this.messages,
      active: !!this.controller,
      ...(this.providerLabel ? { providerLabel: this.providerLabel } : {}),
      ...(this.warning ? { warning: this.warning } : {}),
    });
  }
  newChat() {
    this.stop();
    this.chatId = null;
    this.nativeSessionId = undefined;
    this.messages = [];
    this.changed(this.snapshot());
  }
  send(text: string) {
    if (this.controller || !text.trim()) return;
    this.chatId ??= randomUUID();
    const chatId = this.chatId;
    this.messages.push({
      id: randomUUID(),
      role: "user",
      text,
      status: "complete",
    });
    const message: Message = {
      id: randomUUID(),
      role: "assistant",
      text: "",
      status: "streaming",
    };
    this.messages.push(message);
    const controller = new AbortController();
    this.controller = controller;
    this.changed(this.snapshot());
    const task = this.run(text, chatId, message, controller);
    this.running.add(task);
    void task.finally(() => this.running.delete(task));
  }
  private async run(
    text: string,
    chatId: string,
    message: Message,
    controller: AbortController,
  ) {
    try {
      for await (const event of this.provider.runTurn({
        model: this.model,
        ...(this.nativeSessionId ? { nativeSessionId: this.nativeSessionId } : {}),
        effort: "normal",
        webSearch: false,
        instructions: buildChatInstructions(),
        attachments: [],
        text,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        if (event.type === "text-delta") message.text += event.text;
        if (event.type === "thinking-delta") message.thinking = (message.thinking ?? "") + event.text;
        if (event.type === "session") this.nativeSessionId = event.nativeSessionId;
        if (event.type === "error") {
          message.text = event.message;
          message.status = "error";
        }
        this.emit({ chatId, messageId: message.id, event });
      }
    } catch {
      message.status = "error";
      message.text = strings.responseFailed;
      this.emit({
        chatId,
        messageId: message.id,
        event: {
          type: "error",
          kind: "other",
          message: strings.responseFailed,
        },
      });
    } finally {
      if (message.status === "streaming")
        message.status = controller.signal.aborted ? "stopped" : "complete";
      if (this.controller === controller) {
        this.controller = undefined;
        this.changed(this.snapshot());
      }
    }
  }
  stop() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = undefined;
    const last = this.messages.at(-1);
    if (last?.status === "streaming") last.status = "stopped";
    this.changed(this.snapshot());
  }
  async dispose() {
    this.stop();
    await Promise.allSettled(this.running);
    await this.provider.dispose();
  }
}
