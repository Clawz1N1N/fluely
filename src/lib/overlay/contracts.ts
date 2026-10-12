import type { StructuredAnswer } from './structured';
import type { RequestLimits } from './provider-types';

export type UiMode = 'sidestrips' | 'topbottomstrips' | 'buttons';
export type ShellAction = 'listen' | 'screenshot' | 'continuous' | 'answer' | 'chat'
  | 'tts' | 'mode' | 'settings' | 'ask' | 'snapshot' | 'reset'
  | 'tts_stop' | 'tts_pause' | 'tts_seek_back' | 'tts_seek_forward';
export interface ActionRequest {
  action: ShellAction;
  id: string;
  source: string;
  question?: string;
  clientId?:string;
  images?:string[];
}
export interface ShellSettings {
  ui_mode: UiMode;
  shimmer: boolean;
  shimmer_speed: number;
  answer_opacity: number;
}
export interface SpeechState {
  enabled: boolean;
  speaking: boolean;
  paused: boolean;
  wordStart: number;
  wordEnd: number;
  rate: number;
  voices: Array<{ id: string; name: string; language: string }>;
}
export interface HistoryEntry { role: 'user' | 'assistant'; content: string }
export interface ServiceSnapshot extends StructuredAnswer {
  revision: number;
  ready: boolean;
  listening: boolean;
  continuous: boolean;
  answerVisible: boolean;
  busy: boolean;
  neutral: boolean;
  nextAllowedAt: number | null;
  currentModel: string | null;
  requestCounts: RequestLimits;
  requestLimits: RequestLimits;
  error: string | null;
  requestId: string | null;
  clientIds:string[];
  shell: ShellSettings;
  history: HistoryEntry[];
  tts: SpeechState;
}
export const INITIAL_SERVICE_STATE: ServiceSnapshot = {
  revision: 0, ready: false, listening: false, continuous: false,
  answerVisible: false, busy: false, neutral: false, nextAllowedAt: null,
  currentModel: null, error: null, requestId: null,
  clientIds:[],
  requestCounts: {per_second:0,per_minute:0,per_hour:0,per_day:0},
  requestLimits: {per_second:0,per_minute:0,per_hour:0,per_day:0},
  main: '', side: '', speak: '', history: [],
  shell: { ui_mode: 'sidestrips', shimmer: true, shimmer_speed: 3, answer_opacity: 0.9 },
  tts: { enabled: true, speaking: false, paused: false, wordStart: -1, wordEnd: -1, rate: 1, voices: [] },
};
