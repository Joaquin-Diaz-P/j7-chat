import { canonicalModelKey } from "../../shared/model-key.js";
import { initialEffort, resolveEffort } from "../../shared/effort.js";
import { prepareAttachments } from "../attachments/policy.js";
import type { Attachment } from "../providers/types.js";
import { createHash, randomUUID } from "node:crypto";
import { strings as s } from "../../renderer/strings.js";
import { buildChatInstructions } from "./instructions.js";
import { buildRecap } from "./recap.js";
import { MemoryChatStore } from "./memory-store.js";
import { ModelCatalog, chooseInitialModel, modelKey } from "./catalog.js";
import { classifyError } from "../providers/runtime.js";
import type { ChatProvider, ChatEvent, ModelInfo, ProviderId } from "../providers/types.js";
import type { SettingsStore } from "../settings.js";
import type { ChatStore, Chat } from "./store.js";
import type { ChatEnvelope, ChatSnapshot, Message } from "../../shared/ipc.js";
interface ActiveTurn { controller: AbortController; message: Message; queued: boolean }
export class ChatService {
  titleGenerator?: (text:string)=>Promise<string>;
  readonly catalog: ModelCatalog;
  readonly store: ChatStore;
  private draftChat: Chat | undefined;
  private chatId: string | null = null;
  private active = new Map<string, ActiveTurn>();
  private running = new Set<Promise<void>>();
  private warmup: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private legacyModel: ModelInfo | undefined;
  private welcome: string | undefined;
  constructor(
    source: ModelCatalog | ChatProvider,
    private emit: (event: ChatEnvelope) => void,
    private changed: (snapshot: ChatSnapshot) => void = () => {},
    model = "mock-a", label?: string, private warning?: string,
    store: ChatStore = new MemoryChatStore(), private settings?: SettingsStore, private log: (event: "effort-adjusted") => void = () => {},
  ) {
    this.welcome = warning;
    this.store = store;
    if (source instanceof ModelCatalog) this.catalog = source;
    else {
      this.catalog = new ModelCatalog(settings, [source]);
      this.legacyModel = { id: model, label: label ?? s.mock, provider: source.id, supportsImages: false, supportsPdf: false, supportsEffort: true };
    }
  }
  dismissWelcome() { if(this.warning && this.warning===this.welcome) {this.warning=undefined;this.notify();} }
  start() {
    const history = this.store as ChatStore & {list?: (query:string, offset:number)=>{id:string;titleSource:string;title:string}[];rename?: (id:string,title:string,manual:boolean)=>void};
    if(this.titleGenerator && history.list) for(let offset=0;;offset+=200) {
      const rows=history.list("",offset); if(!rows.length)break;
      for(const row of rows) if(!row.title.trim() && row.titleSource!=="manual") { const question=this.store.listMessages(row.id).find(m=>m.role==="user"); if(question)void this.titleGenerator(question.text).then(title=>history.rename?.(row.id,title,false)).catch(()=>{}); }
    }
    void this.catalog.refresh().catch(() => {}).finally(() => this.notify());
    this.warmup = setTimeout(() => { void this.catalog.prewarm().catch(() => {}).finally(() => this.prewarm()); }, 5_000);
    this.warmup.unref();
  }
  private models() { const models = this.catalog.snapshot().models; return models.length ? models : this.legacyModel ? [this.legacyModel] : []; }
  private selectedModel(chat = this.currentChat()) {
    return chat ? this.models().find(m => modelKey(m) === canonicalModelKey(chat.model)) : chooseInitialModel(this.models(), this.catalog.snapshot().lastModel, this.catalog.snapshot().favorites);
  }
  private currentChat() { return this.chatId ? this.store.getChat(this.chatId) : this.draftChat; }
  private ensureChat(): Chat | undefined {
    const existing = this.currentChat();
    if (existing) return existing;
    const model = this.selectedModel();
    if (!model) return;
    const chat: Chat = { id: randomUUID(), model: modelKey(model), provider: model.provider, webSearch: true, effort: initialEffort(model, this.settings?.value.effortByModel) };
    this.draftChat = chat;
    return chat;
  }
  snapshot(): ChatSnapshot {
    const chat = this.currentChat();
    const turn = chat ? this.active.get(chat.id) : undefined;
    const model = this.selectedModel(chat);
    const messages = chat ? this.store.listMessages(chat.id).map(m => m.id === turn?.message.id ? structuredClone(turn.message) : m) : [];
    return { chatId: this.chatId, messages, active: !!turn, queued: turn?.queued ?? false,
      ...(model ? { model: modelKey(model), providerLabel: model.label } : {}),
      webSearch: true, effort: chat?.effort ?? (model ? initialEffort(model, this.settings?.value.effortByModel) : "low"), catalog: this.catalog.snapshot(),
      ...(this.warning ? { warning: this.warning } : {}) };
  }
  notify() { if (!this.disposed) this.changed(this.snapshot()); }
  /** Gets the program ready for the empty chat on screen, so its first answer doesn't wait for the program to start. */
  prewarm() {
    const empty = () => { const chat = this.currentChat(); return !chat || !this.store.listMessages(chat.id).length; };
    if (this.disposed || !empty()) return;
    const chat = this.currentChat(), model = this.selectedModel(chat);
    const provider = model && this.catalog.providers.get(model.provider);
    if (!model || !provider?.prepare || this.catalog.snapshot().statuses[model.provider]?.state !== "ready") return;
    const hint = { model: model.id, effort: resolveEffort(model, chat?.effort ?? initialEffort(model, this.settings?.value.effortByModel)), webSearch: true, instructions: buildChatInstructions(this.settings?.value.personalInstructions) };
    // Runs in the provider's queue; a turn sent meanwhile goes first and the chat is no longer empty.
    void this.catalog.exclusive(model.provider, async () => { if (!this.disposed && empty()) await provider.prepare!(hint); }).catch(() => {});
  }
  newChat() { this.draftChat=undefined; this.chatId = null; this.warning = undefined; this.notify(); this.prewarm(); }
  selectChat(id: string) { if (this.store.getChat(id)) { this.chatId = id; this.notify(); } }
  updateChat(options: { model?: string; webSearch?: boolean; effort?: string }) {
    if (!this.currentChat()) {
      const model=this.selectedModel(); if(!model)return;
      this.draftChat={id:randomUUID(),model:modelKey(model),provider:model.provider,webSearch:true,effort:initialEffort(model, this.settings?.value.effortByModel)};
    }
    const chat = this.currentChat()!;
    const update = (changes: Partial<Omit<Chat,"id">>) => { if(this.chatId)this.store.updateChat(chat.id,changes); else Object.assign(chat,changes); };
    if (options.model) {
      const model = this.models().find(m => modelKey(m) === options.model);
      if (model) this.settings?.update({ lastModel: modelKey(model) });
      if (model && chat.model !== options.model) {
        update({ model: modelKey(model), provider: model.provider, effort: initialEffort(model, this.settings?.value.effortByModel) });
        if (this.store.listMessages(chat.id).length) this.store.appendMessage(chat.id, { id: randomUUID(), role: "notice", text: s.switched(model.label), status: "complete" });
      }
    }
    if (options.effort) {
      const model = this.selectedModel(chat);
      if (model) {
        const effort = resolveEffort(model, options.effort);
        update({ effort });
        this.settings?.update({ effortByModel: { ...this.settings.value.effortByModel, [chat.model]: effort } });
      }
    }
    update({ webSearch: true });
    this.notify();
    this.prewarm();
  }
  send(text: string, attachments: Attachment[] = []) {
    if (this.disposed || !text.trim() && !attachments.length) return;
    if (!this.ensureChat()) { this.warning = s.noAvailableModels; this.notify(); return; }
    const chat = this.ensureChat();
    if (!chat || this.active.has(chat.id)) return;
    const model = this.selectedModel(chat);
    if (!model) { this.warning = s.noAvailableModels; this.notify(); return; }
    prepareAttachments(attachments, model);
    if (!this.chatId) { this.store.createChat(chat); this.chatId=chat.id; this.draftChat=undefined; }
    this.warning = undefined;
    const question: Message = { id: randomUUID(), role: "user", text, attachments, status: "complete" };
    this.store.appendMessage(chat.id, question);
    this.launch(chat, model, question);
  }
  private launch(chat: Chat, model: ModelInfo, question: Message) {
    this.settings?.update({ lastModel: modelKey(model) });
    const message: Message = { id: randomUUID(), role: "assistant", text: "", status: "queued", model: modelKey(model), modelLabel: model.label, provider: model.provider, effort: resolveEffort(model, chat.effort) };
    this.store.appendMessage(chat.id, message);
    const turn: ActiveTurn = { controller: new AbortController(), message, queued: true };
    this.active.set(chat.id, turn);
    this.notify();
    const task = this.catalog.exclusive(model.provider, async () => {
      if (turn.controller.signal.aborted) return;
      if (message.effort !== (chat.effort === "normal" ? "low" : chat.effort)) this.log("effort-adjusted");
      turn.queued = false;
      message.status = "streaming";
      this.store.updateMessage(chat.id,message.id,message);
      this.notify();
      await this.run(chat, model, question, turn);
    }, turn.controller.signal).catch(error => {
      if (!turn.controller.signal.aborted) this.fail(message, model.provider, classifyError(error));
    }).finally(() => {
      if (message.status === "queued" || message.status === "streaming") message.status = turn.controller.signal.aborted ? "stopped" : "complete";
      this.store.updateMessage(chat.id, message.id, message);
      this.active.delete(chat.id);
      if (this.store.listMessages(chat.id).filter(m=>m.role==="user").length===1 && this.titleGenerator) {
        void this.titleGenerator(question.text).then(title=>{
          const store=this.store as ChatStore & {rename?: (id:string,title:string,manual:boolean)=>void};
          store.rename?.(chat.id,title,false); this.notify();
        });
      }
      this.notify();
    });
    this.running.add(task);
    void task.finally(() => this.running.delete(task));
  }
  private fail(message: Message, provider: ProviderId, error: Extract<ChatEvent, { type: "error" }>) {
    const name = s.programLabels[provider];
    const command = provider === "claude" ? s.loginCommands.claude : provider === "codex" ? s.loginCommands.codex : provider === "gemini" ? "`gemini`" : provider === "opencode" ? "" : s.loginCommands.mock;
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
        if (process.env.J7_DEBUG === "1") console.debug("j7:turn", { provider: model.provider, model: model.id, effort: message.effort!, webSearch: true });
        try {
          for await (const event of provider.runTurn({ model: model.id, ...(session ? { nativeSessionId: session } : {}), effort: message.effort!, webSearch: true, instructions, attachments: [...recap.attachments, ...prepareAttachments(question.attachments ?? [], model)], text: recap.text + question.text, signal: controller.signal })) {
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
    const model = this.models().find(m => modelKey(m) === (answer?.model && canonicalModelKey(answer.model)));
    if (!answer || !question || !model) return;
    this.store.deleteMessagesFrom(chat.id, answer.id);
    this.launch(chat, model, question);
  }
  edit(text: string) {
    const chat = this.currentChat(), question = this.lastQuestion();
    if (!chat || !question || this.active.has(chat.id) || !text.trim()) return;
    this.store.deleteMessagesFrom(chat.id, question.id);
    this.send(text, question.attachments ?? []);
  }
  askOther(key: string, requestedEffort?: string) {
    const chat = this.currentChat(), question = this.lastQuestion();
    const model = this.models().find(m => modelKey(m) === key);
    if (!chat || !question || !model || this.active.has(chat.id)) return;
    try { prepareAttachments(question.attachments ?? [], model); }
    catch (error) { this.warning = error instanceof Error ? error.message : s.responseFailed; this.notify(); return; }
    const effort = resolveEffort(model, requestedEffort ?? initialEffort(model, this.settings?.value.effortByModel));
    this.settings?.update({effortByModel: {...this.settings.value.effortByModel, [key]: effort}});
    this.store.updateChat(chat.id, { model: key, provider: model.provider, effort });
    this.store.appendMessage(chat.id, { id: randomUUID(), role: "notice", text: s.sameQuestion(model.label), status: "complete" });
    this.launch({ ...chat, model: key, provider: model.provider, effort }, model, question);
  }
  async removeChat(id: string, remove: () => void) {
    const turn=this.active.get(id); turn?.controller.abort();
    if(turn)await this.waitForIdle();
    remove();
    if(this.chatId===id)this.newChat(); else this.notify();
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
