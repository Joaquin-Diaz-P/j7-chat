import type { Attachment } from '../main/providers/types.js';
export type CapturePhase = 'idle' | 'capturing' | 'opening' | 'listening' | 'transcribing' | 'recovering' | 'queued' | 'sending' | 'cancelled' | 'empty' | 'failed';
export interface CaptureState { phase: CapturePhase; seconds: number; permission?: 'screen' | 'input' | null; conflict?: boolean; missingHex?: boolean; recoverable?: boolean; busy?: boolean }
export interface CaptureEvent { state: CaptureState; attachment?: Attachment; removeId?: string; text?: string; autoSend?: boolean }
export interface HelperReply {
  title?: string; ok: boolean; path?: string; displayId?: number; screen?: boolean; input?: boolean; error?: string }
export type HoldEvent = 'holdStart' | 'holdEnd' | 'holdCancel';
