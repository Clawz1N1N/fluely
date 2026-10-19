import type {ProviderEntry} from './provider-types';
import type {ChatPreferences} from './chat-preferences-core';
import type {LocalEngineConfig} from './local-engine-client';
import {providersForSelection} from './chat-preferences-core';
export interface NeuralAvailability {brain:boolean;stt:boolean;tts:boolean;vision:boolean}
export interface AvailabilitySources {providers:ProviderEntry[];preferences?:Pick<ChatPreferences,'selections'>;localConfigs?:LocalEngineConfig[];systemVoices?:number;tts?:{backend:string;voice:string;piper_executable?:string};vision?:{method:string;mode:string;vision_provider_id?:string|null}}
export function providerConfigurationKey(providers:ProviderEntry[]):string{
  const transient=new Set(['used','tokenUsed','nextAllowedAt','inCooldown','tokenReservationId']);
  return JSON.stringify([...providers].sort((a,b)=>a.id.localeCompare(b.id)).map(provider=>Object.entries(provider).filter(([key])=>!transient.has(key)).sort(([a],[b])=>a.localeCompare(b))));
}
export function neuralAvailability(sources:AvailabilitySources):NeuralAvailability{
  const providers=sources.providers.map(provider=>({...provider,enabled:provider.enabled||provider.id.startsWith('fluely-local-')&&(sources.localConfigs??[]).some(config=>provider.id===`fluely-local-${config.kind}`&&!!config.executable&&!!config.model_path&&(config.kind!=='vision'||!!config.mmproj_path))}));
  const selected=sources.preferences?.selections??{};
  const has=(kind:'brain'|'stt'|'tts'|'vision')=>providersForSelection(providers,kind,selected[kind]).some(provider=>!!provider.model.trim()&&!!provider.base_url.trim());
  const ttsSource=selected.tts?.source;
  const backend=ttsSource==='local'?(selected.tts?.provider_id?'cloud':'piper'):ttsSource==='cloud'?'cloud':ttsSource==='system'?'system':sources.tts?.backend??'system';
  const visionSource=selected.vision?.source;
  const nativeVision=visionSource==='system'||(!visionSource&&sources.vision?.method==='pixel-text');
  const visionSelection=selected.vision??(sources.vision?.vision_provider_id?{source:'auto' as const,provider_id:sources.vision.vision_provider_id}:undefined);
  return {brain:has('brain'),stt:has('stt'),tts:backend==='system'?(sources.systemVoices??0)>0:backend==='piper'?!!sources.tts?.piper_executable&&!!sources.tts?.voice.toLowerCase().endsWith('.onnx'):has('tts'),vision:nativeVision||providersForSelection(providers,'vision',visionSelection).length>0};
}
