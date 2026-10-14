import { invoke } from '@tauri-apps/api/core';
export type LocalEngineKind = 'brain' | 'stt' | 'vision' | 'gguf-asr';
export interface LocalEngineConfig {
  kind: LocalEngineKind; executable: string; model_path: string; mmproj_path: string;
  port: number; threads: number; context: number; gpu_layers: number; language: string;
}
export interface LocalEngineStatus {
  kind: LocalEngineKind; state: 'stopped' | 'starting' | 'running' | 'error';
  pid: number | null; url: string | null; error: string | null; logs: string[];
}
export type LocalEngineField = 'executable' | 'model_path' | 'mmproj_path';
export interface InstalledLocalModel { model_path: string; mmproj_path: string; name: string }
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export function createLocalEngineClient(call: Invoke = invoke) {
  return {
    configs: () => call<LocalEngineConfig[]>('get_local_engine_configs'),
    status: () => call<LocalEngineStatus[]>('get_local_engine_status'),
    save: (config: LocalEngineConfig) => call<void>('save_local_engine_config', { config }),
    start: async (config: LocalEngineConfig,onProviderChanged?:()=>void) => {
      await call<void>('save_local_engine_config', { config });
      const status=await call<LocalEngineStatus>('start_local_engine', { kind: config.kind });
      onProviderChanged?.();
      return status;
    },
    stop: async (kind: LocalEngineKind,onProviderChanged?:()=>void) => {await call<void>('stop_local_engine', { kind });onProviderChanged?.();},
    test: (kind: LocalEngineKind) => call<string>('test_local_engine', { kind }),
    install: (kind: LocalEngineKind) => call<string>('install_local_engine', { kind }),
    installModel: (kind: LocalEngineKind) => call<InstalledLocalModel>('install_recommended_local_model', { kind }),
    browse: (kind: LocalEngineKind, field: LocalEngineField) => call<string | null>('pick_local_engine_file', { kind, field }),
  };
}
export function nativeMicrophoneWave(payload: string): Blob {
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0)); }
  catch { throw new Error('Invalid native microphone audio'); }
  const signature = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  if (bytes.length < 44 || bytes.length > 1_000_000 || signature(0) !== 'RIFF' || signature(8) !== 'WAVE') {
    throw new Error('Invalid native microphone audio');
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
export const localEngineClient = createLocalEngineClient();
