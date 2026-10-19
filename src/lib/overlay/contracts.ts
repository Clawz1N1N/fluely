import type { StructuredAnswer } from './structured';
import type { RequestLimits } from './provider-types';
import type {CustomPanel} from './layout';
import type {Session} from './session-store';
import type {ContextUsage} from './context-budget';

export type UiMode = 'sidestrips' | 'topbottomstrips' | 'buttons' | 'custom';
export type ShellAction = 'listen' | 'screenshot' | 'continuous' | 'answer' | 'chat'
  | 'tts' | 'mode' | 'ui_mode' | 'dashboard' | 'settings' | 'ask' | 'snapshot' | 'reset'
  | 'tts_stop' | 'tts_pause' | 'tts_seek_back' | 'tts_seek_forward' | 'session_new' | 'session_select';
export interface ActionRequest {
  action: ShellAction;
  id: string;
  source: string;
  question?: string;
  clientId?:string;
  images?:string[];
  sessionId?:string;
  files?:Array<{name:string;mime:string;base64:string;text?:string}>;
}
export interface ShellSettings {
  ui_mode: UiMode;
  shimmer: boolean;
  shimmer_speed: number;
  answer_opacity: number;
  strip_opacity:number;
  button_opacities:Record<string,number>;
  custom_panels:CustomPanel[];
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
  sleeping:boolean;
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
  requestError:string|null;
  clientIds:string[];
  shell: ShellSettings;
  history: HistoryEntry[];
  session:Session|null;
  sessionRevision:number;
  context:ContextUsage|null;
  tts: SpeechState;
}
export const INITIAL_SERVICE_STATE: ServiceSnapshot = {
  revision: 0, ready: false, listening: false, sleeping:false, continuous: false,
  answerVisible: false, busy: false, neutral: false, nextAllowedAt: null,
  currentModel: null, error: null, requestId: null,
  requestError:null,
  clientIds:[],
  requestCounts: {per_second:0,per_minute:0,per_hour:0,per_day:0},
  requestLimits: {per_second:0,per_minute:0,per_hour:0,per_day:0},
  main: '', side: '', speak: '', history: [], session:null,sessionRevision:0,context:null,
  shell: { ui_mode: 'sidestrips', shimmer: false, shimmer_speed: 3, answer_opacity: 0.32,strip_opacity:0.28,button_opacities:{},custom_panels:[] },
  tts: { enabled: true, speaking: false, paused: false, wordStart: -1, wordEnd: -1, rate: 1, voices: [] },
};
