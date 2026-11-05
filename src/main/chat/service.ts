import { createHash, randomUUID } from "node:crypto";
import { strings as s } from "../../renderer/strings.js";
import { buildChatInstructions } from "./instructions.js";
import { buildRecap } from "./recap.js";
import { MemoryChatStore } from "./memory-store.js";
import { ModelCatalog, chooseDefaultModel, modelKey } from "./catalog.js";
import { classifyError } from "../providers/runtime.js";
import type { ChatProvider, ChatEvent, ModelInfo, ProviderId } from "../providers/types.js";
import type { SettingsStore } from "../settings.js";
import type { ChatStore, Chat } from "./store.js";
import type { ChatEnvelope, ChatSnapshot, Message } from "../../shared/ipc.js";
interface ActiveTurn { controller: AbortController; message: Message; queued: boolean }
export class ChatService {
  readonly catalog: ModelCatalog;
  readonly store: ChatStore;
  private chatId: string | null = null;
  private active = new Map<string, ActiveTurn>();
  private running = new Set<Promise<void>>();
  private warmup: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private legacyModel: ModelInfo | undefined;
  constructor(
    source: ModelCatalog | ChatProvider,
    private emit: (event: ChatEnvelope) => void,
    private changed: (snapshot: ChatSnapshot) => void = () => {},
    model = "mock-a", label?: string, private warning?: string,
    store: ChatStore = new MemoryChatStore(), private settings?: SettingsStore,
  ) {
    this.store = store;
    if (source instanceof ModelCatalog) this.catalog = source;
    else {
      this.catalog = new ModelCatalog(settings, [source]);
      this.legacyModel = { id: model, label: label ?? s.mock, provider: source.id, supportsImages: false, supportsPdf: false, supportsEffort: true };
    }
  }
  start() {
    void this.catalog.refresh().catch(() => {}).finally(() => this.notify());
    this.warmup = setTimeout(() => { void this.catalog.prewarm().catch(() => {}); }, 5_000);
    this.warmup.unref();
  }
  private models() { const models = this.catalog.snapshot().models; return models.length ? models : this.legacyModel ? [this.legacyModel] : []; }
  private selectedModel(chat = this.currentChat()) {
    return chat ? this.models().find(m => modelKey(m) === chat.model) : chooseDefaultModel(this.models(), this.catalog.snapshot().defaultModel);
  }
  private currentChat() { return this.chatId ? this.store.getChat(this.chatId) : undefined; }
  private ensureChat(): Chat | undefined {
    const existing = this.currentChat();
    if (existing) return existing;
    const model = this.selectedModel();
    if (!model) return;
    const chat: Chat = { id: randomUUID(), model: modelKey(model), provider: model.provider, webSearch: true, effort: "normal" };
    this.store.createChat(chat);
    this.chatId = chat.id;
    return chat;
  }
  snapshot(): ChatSnapshot {
    const chat = this.currentChat();
    const turn = chat ? this.active.get(chat.id) : undefined;
    const model = this.selectedModel(chat);
    const messages = chat ? this.store.listMessages(chat.id).map(m => m.id === turn?.message.id ? structuredClone(turn.message) : m) : [];
    return { chatId: this.chatId, messages, active: !!turn, queued: turn?.queued ?? false,
      ...(model ? { model: modelKey(model), providerLabel: model.label } : {}),
      webSearch: chat?.webSearch ?? true, effort: chat?.effort ?? "normal", catalog: this.catalog.snapshot(),
      ...(this.warning ? { warning: this.warning } : {}) };
  }
  notify() { if (!this.disposed) this.changed(this.snapshot()); }
  newChat() { this.chatId = null; this.warning = undefined; this.notify(); }
  selectChat(id: string) { if (this.store.getChat(id)) { this.chatId = id; this.notify(); } }
  updateChat(options: { model?: string; webSearch?: boolean; effort?: "normal" | "high" }) {
    const chat = this.ensureChat();
    if (!chat) return;
    if (options.model) {
      const model = this.models().find(m => modelKey(m) === options.model);
      if (model && chat.model !== options.model) {
        this.store.updateChat(chat.id, { model: modelKey(model), provider: model.provider });
        if (this.store.listMessages(chat.id).length) this.store.appendMessage(chat.id, { id: randomUUID(), role: "notice", text: s.switched(model.label), status: "complete" });
      }
    }
    this.store.updateChat(chat.id, { ...(options.webSearch !== undefined ? { webSearch: options.webSearch } : {}), ...(options.effort ? { effort: options.effort } : {}) });
    this.notify();
  }
  send(text: string) {
    if (this.disposed || !text.trim()) return;
    if (!this.ensureChat()) { this.warning = s.noAvailableModels; this.notify(); return; }
    const chat = this.ensureChat();
    if (!chat || this.active.has(chat.id)) return;
    const model = this.selectedModel(chat);
    if (!model) { this.warning = s.noAvailableModels; this.notify(); return; }
    this.warning = undefined;
    const question: Message = { id: randomUUID(), role: "user", text, status: "complete" };
    this.store.appendMessage(chat.id, question);
    this.launch(chat, model, question);
  }
  private launch(chat: Chat, model: ModelInfo, question: Message) {
    const message: Message = { id: randomUUID(), role: "assistant", text: "", status: "queued", model: modelKey(model), modelLabel: model.label, provider: model.provider };
    this.store.appendMessage(chat.id, message);
    const turn: ActiveTurn = { controller: new AbortController(), message, queued: true };
    this.active.set(chat.id, turn);
    this.notify();
    const task = this.catalog.exclusive(model.provider, async () => {
      if (turn.controller.signal.aborted) return;
      turn.queued = false;
      message.status = "streaming";
      this.notify();
      await this.run(chat, model, question, turn);
    }, turn.controller.signal).catch(error => {
      if (!turn.controller.signal.aborted) this.fail(message, model.provider, classifyError(error));
    }).finally(() => {
      if (message.status === "queued" || message.status === "streaming") message.status = turn.controller.signal.aborted ? "stopped" : "complete";
      this.store.updateMessage(chat.id, message.id, message);
      this.active.delete(chat.id);
      this.notify();
    });
    this.running.add(task);
    void task.finally(() => this.running.delete(task));
  }
  private fail(message: Message, provider: ProviderId, error: Extract<ChatEvent, { type: "error" }>) {
    const name = s.programLabels[provider];
    const command = provider === "claude" ? s.loginCommands.claude : provider === "codex" ? s.loginCommands.codex : s.loginCommands.mock;
    message.errorKind = error.kind;
    message.status = "error";
    message.text = error.kind === "auth" ? s.authError(name, command) : error.kind === "quota" ? s.quotaError(name) : error.message.slice(0, 600);
  }
  private async run(chat: Chat, model: ModelInfo, question: Message, turn: ActiveTurn) {
    const { message, controller } = turn;
    const provider = this.catalog.providers.get(model.provider)!;
    const instructions = buildChatInstructions(this.settings?.value.personalInstructions);
    const hash = createHash("sha256").update(instructions).digest("hex");
    const saved = this.store.getProviderSession(chat.id, model.provider);
    let session = saved?.instructionsHash === hash && saved.nativeSessionId ? saved.nativeSessionId : undefined;
    let lastSeen = session ? saved?.lastMessageId : undefined;
    let processRestarted = false;
    let sessionRetried = false;
    const history = this.store.listMessages(chat.id);
    const beforeQuestion = history.slice(0, history.findIndex(m => m.id === question.id));
    const persist = () => this.store.updateMessage(chat.id, message.id, message);
    const timer = setInterval(persist, 400);
    try {
      while (!controller.signal.aborted) {
        const recap = buildRecap(beforeQuestion, lastSeen, model.supportsImages);
        let nativeId: string | undefined = session;
        let failure: Extract<ChatEvent, { type: "error" }> | undefined;
        let completed = false;
        if (process.env.J7_DEBUG === "1") console.debug("j7:turn", { provider: model.provider, model: model.id, effort: model.supportsEffort ? chat.effort : "normal", webSearch: chat.webSearch });
        try {
          for await (const event of provider.runTurn({ model: model.id, ...(session ? { nativeSessionId: session } : {}), effort: model.supportsEffort ? chat.effort : "normal", webSearch: chat.webSearch, instructions, attachments: [...recap.attachments, ...(question.attachments ?? [])], text: recap.text + question.text, signal: controller.signal })) {
            if (controller.signal.aborted) break;
            if (event.type === "session") nativeId = event.nativeSessionId;
            if (event.type === "error") { failure = event; break; }
            if (event.type === "done") completed = true;
            if (event.type === "text-delta") message.text += event.text;
            if (event.type === "thinking-delta") message.thinking = (message.thinking ?? "") + event.text;
            if (event.type === "web-search") message.sources = [...new Set([...(message.sources ?? []), ...event.urls.filter(url => { try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; } })])];
            this.emit({ chatId: chat.id, messageId: message.id, event });
          }
        } catch (error) { failure = classifyError(error); }
        if (controller.signal.aborted) break;
        if (!failure && !completed && !message.text && !message.thinking) failure = { type: "error", kind: "other", message: s.processFailed, recovery: "process" };
        const recoverSession = failure?.recovery === "session" && !!session && !sessionRetried;
        const recoverProcess = failure?.recovery === "process" && !processRestarted;
        if (recoverSession || recoverProcess) {
          if (recoverSession) { sessionRetried = true; session = undefined; lastSeen = undefined; }
          if (recoverProcess) processRestarted = true;
          await provider.dispose();
          message.text = ""; delete message.thinking; delete message.sources;
          persist(); this.notify();
          continue;
        }
        if (failure) {
          this.fail(message, model.provider, failure.recovery === "process" ? { ...failure, message: s.processFailed } : failure);
          this.emit({ chatId: chat.id, messageId: message.id, event: { ...failure, message: message.text } });
        } else {
          message.status = "complete";
          if (nativeId) this.store.upsertProviderSession({ chatId: chat.id, provider: model.provider, nativeSessionId: nativeId, lastMessageId: message.id, instructionsHash: hash });
        }
        break;
      }
    } finally {
      clearInterval(timer);
      if (controller.signal.aborted || message.status === "error") {
        this.store.upsertProviderSession({ chatId: chat.id, provider: model.provider, nativeSessionId: "", lastMessageId: "", instructionsHash: hash });
      }
      if (controller.signal.aborted) message.status = "stopped";
      persist();
    }
  }
  private lastQuestion() { return this.chatId ? this.store.listMessages(this.chatId).findLast(m => m.role === "user") : undefined; }
  retry() {
    const chat = this.currentChat();
    if (!chat || this.active.has(chat.id)) return;
    const messages = this.store.listMessages(chat.id);
    const answer = messages.findLast(m => m.role === "assistant");
    const question = this.lastQuestion();
    const model = this.models().find(m => modelKey(m) === answer?.model);
    if (!answer || !question || !model) return;
    this.store.deleteMessagesFrom(chat.id, answer.id);
    this.launch(chat, model, question);
  }
  edit(text: string) {
    const chat = this.currentChat(), question = this.lastQuestion();
    if (!chat || !question || this.active.has(chat.id) || !text.trim()) return;
    this.store.deleteMessagesFrom(chat.id, question.id);
    this.send(text);
  }
  askOther(key: string) {
    const chat = this.currentChat(), question = this.lastQuestion();
    const model = this.models().find(m => modelKey(m) === key);
    if (!chat || !question || !model || this.active.has(chat.id)) return;
    this.store.updateChat(chat.id, { model: key, provider: model.provider });
    this.store.appendMessage(chat.id, { id: randomUUID(), role: "notice", text: s.sameQuestion(model.label), status: "complete" });
    this.send(question.text);
  }
  stop() {
    const turn = this.chatId ? this.active.get(this.chatId) : undefined;
    if (!turn) return;
    turn.controller.abort();
    turn.message.status = "stopped";
    this.notify();
  }
  async waitForIdle() { await Promise.allSettled(this.running); }
  async dispose() {
    this.disposed = true;
    clearTimeout(this.warmup);
    for (const turn of this.active.values()) turn.controller.abort();
    await this.catalog.dispose();
    await this.waitForIdle();
  }
}
