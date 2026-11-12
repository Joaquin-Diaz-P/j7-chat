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
  lastModel: string | null;
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
export interface PanelState { offset?: {x:number;y:number}; historyOpen?: boolean; appeared?: boolean; resume: boolean; pinned: boolean; dark: boolean }
export type SettingsSection = 'programs' | 'permissions';
export type PermissionKind = 'screen' | 'input' | 'microphone' | 'accessibility';
export interface J7Api {
 settingsData(): Promise<SettingsData>;
 saveSettings(value: Partial<import("../main/settings.js").Settings>): Promise<void>;
 settingsModel(key:string,favorite:boolean):Promise<void>;
 settingsRefresh():Promise<void>;
 settingsPermission(kind:PermissionKind):Promise<void>;
 settingsOpenUrl(id:string):Promise<void>;
 connectionsData():Promise<import('./connections.js').Connection[]>;
 connectionsLogin(id:import('./connections.js').ConnectionId):Promise<void>;
 connectionsCancel(id:import('./connections.js').ConnectionId):Promise<void>;
 connectionsCode(id:import('./connections.js').ConnectionId,code:string):Promise<void>;
 connectionsLogout(id:import('./connections.js').ConnectionId):Promise<void>;
 connectionsOpenLoginUrl(id:import('./connections.js').ConnectionId):Promise<void>;
 onConnectionsChanged(callback:()=>void):()=>void;
 settingsStartHex():Promise<void>;
 settingsRelaunch():Promise<void>;
 onSettingsSection(callback:(section:SettingsSection)=>void):()=>void;
  history(query?: string, offset?: number): Promise<import('../main/chat/sqlite-store.js').HistoryChat[]>;
  historyAction(action: 'rename'|'pin'|'delete'|'open', id: string, value?: string|boolean): Promise<void>;
  captureAction(action: 'dictate'|'transcribe'|'cancel'|'finish'|'recover'|'idle'|'queued'|'failed'|'screen'|'input'|'status'): Promise<void>;
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
  retry(): Promise<void>;
  edit(text: string): Promise<void>;
  askOther(model: string, effort?: string): Promise<void>;
  onHiding(callback: () => void): () => void;
  setRegions(regions: import("./hit-test.js").HitRect[]): void;
  beginMoveCard():void;
  /** dx and dy are measured from where the drag began, not from the previous move. */
  moveCard(dx:number,dy:number):void;
  endMoveCard():void;
  layout(height: number, history: boolean): void;
  hide(): void;
  setAttachmentState(present: boolean): void;
  setPinned(pinned: boolean): void;
  ready(): void;
  onChat(callback: (event: ChatEnvelope) => void): () => void;
  onSnapshot(callback: (snapshot: ChatSnapshot) => void): () => void;
  onPanel(callback: (state: PanelState) => void): () => void;
}
declare global { interface Window { j7: J7Api } }

export interface SettingsData { settings: import("../main/settings.js").Settings; catalog: CatalogSnapshot; permissions: {screen?:boolean;input?:boolean}; hex:{installed:boolean;running:boolean;permissions?:{microphone:boolean;accessibility:boolean};status?:{code:number;text:string};conflict:boolean} }
