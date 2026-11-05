import type { Attachment, ChatEvent, ModelInfo, ProviderId, ProviderStatus } from "../main/providers/types.js";
export interface Message {
  id: string;
  role: "user" | "assistant" | "notice";
  text: string;
  thinking?: string;
  effort?: string;
  status: "interrupted" | "queued" | "streaming" | "complete" | "stopped" | "error";
  model?: string;
  modelLabel?: string;
  provider?: ProviderId;
  attachments?: Attachment[];
  sources?: string[];
  errorKind?: "auth" | "quota" | "unsupported" | "other";
}
export interface CatalogSnapshot {
  models: ModelInfo[];
  statuses: Partial<Record<ProviderId, ProviderStatus>>;
  favorites: string[];
  defaultModel: string | null;
  effortByModel?: Record<string,string>;
}
export interface ChatSnapshot {
  chatId: string | null;
  messages: Message[];
  active: boolean;
  queued?: boolean;
  model?: string;
  webSearch?: boolean;
  effort?: string;
  providerLabel?: string;
  warning?: string;
  catalog?: CatalogSnapshot;
}
export interface ChatEnvelope { chatId: string; messageId: string; event: ChatEvent }
export interface PanelState { historyOpen?: boolean; appeared?: boolean; resume: boolean; pinned: boolean; dark: boolean }
export interface J7Api {
 settingsData(): Promise<SettingsData>;
 saveSettings(value: Partial<import("../main/settings.js").Settings>): Promise<void>;
 settingsModel(key:string,favorite:boolean):Promise<void>;
 settingsRefresh():Promise<void>;
 settingsPermission(kind:string):Promise<void>;
  history(query?: string, offset?: number): Promise<import('../main/chat/sqlite-store.js').HistoryChat[]>;
  historyAction(action: 'rename'|'pin'|'delete'|'open', id: string, value?: string|boolean): Promise<void>;
  captureAction(action: 'cancel'|'recover'|'idle'|'queued'|'failed'|'screen'|'input'|'status'): Promise<void>;
  onCapture(callback: (event: import('./capture.js').CaptureEvent) => void): () => void;
  snapshot(): Promise<ChatSnapshot>;
  attachments(action: "files" | "data" | "paste" | "dialog" | "capture" | "preview", value?: unknown, count?: number): Promise<Attachment[]>;
  filePath(file: File): string;
  send(text: string, ids?: string[]): Promise<void>;
  stop(): Promise<void>;
  newChat(): Promise<void>;
  selectChat(id: string): Promise<void>;
  updateChat(options: { model?: string; webSearch?: boolean; effort?: string }): Promise<void>;
  refreshModels(): Promise<void>;
  openSettings(): Promise<void>;
  favorite(model: string): Promise<void>;
  setDefaultModel(model: string): Promise<void>;
  retry(): Promise<void>;
  edit(text: string): Promise<void>;
  askOther(model: string, effort?: string): Promise<void>;
  hide(): void;
  setContentHeight(height: number): void;
  setPinned(pinned: boolean): void;
  ready(): void;
  onChat(callback: (event: ChatEnvelope) => void): () => void;
  onSnapshot(callback: (snapshot: ChatSnapshot) => void): () => void;
  onPanel(callback: (state: PanelState) => void): () => void;
}
declare global { interface Window { j7: J7Api } }

export interface SettingsData { settings: import("../main/settings.js").Settings; catalog: CatalogSnapshot; permissions: {screen?:boolean;input?:boolean}; hex:{installed:boolean;status?:{code:number;text:string};conflict:boolean} }
