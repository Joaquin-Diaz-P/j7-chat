import type { ProviderId } from '../main/providers/types.js';

export const connectionIds = ['claude', 'codex', 'gemini', 'opencode'] as const;
export type ConnectionId = typeof connectionIds[number];
export interface Connection {
  id: ConnectionId;
  installed: boolean;
  version?: string;
  state: 'ready' | 'not_installed' | 'not_authenticated' | 'signing_in' | 'error';
  account?: { email?: string; plan?: string };
  detail?: string;
  login?: { url?: string; needsCode?: boolean; terminal?: boolean };
  modelCount: number;
  enabled: boolean;
}
export function isConnectionId(value: unknown): value is ConnectionId {
  return typeof value === 'string' && connectionIds.includes(value as ConnectionId);
}
export function validConnectionCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\r\n\u2028\u2029\0]/.test(value);
}
export function validateDisabledProviders(value: unknown): ProviderId[] {
  const ids: ProviderId[] = [...connectionIds, 'mock', 'mock-a', 'mock-b'];
  return Array.isArray(value) ? [...new Set(value.filter((id): id is ProviderId => ids.includes(id)))] : [];
}
export function canDisableConnection(connection: Pick<Connection, 'id' | 'enabled' | 'state'>, connections: Pick<Connection, 'id' | 'enabled' | 'state'>[]): boolean {
  return !(connection.enabled && connection.state === 'ready') || connections.some(other => other.id !== connection.id && other.enabled && other.state === 'ready');
}
export function leavesReadyProvider(statuses: Partial<Record<ProviderId, { state: string }>>, previous: ProviderId[], next: ProviderId[]): boolean {
  const ready = (Object.keys(statuses) as ProviderId[]).filter(id => statuses[id]?.state === 'ready');
  return !ready.some(id => !previous.includes(id)) || ready.some(id => !next.includes(id));
}
