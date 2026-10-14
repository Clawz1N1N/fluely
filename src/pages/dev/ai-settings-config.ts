import type { ProviderEntry, ProviderKind } from '@/lib/overlay/provider-types';
import { BUILTIN_PROVIDERS } from '@/lib/overlay/model-catalog';
export type ProviderSource = 'all' | 'cloud' | 'local' | 'system';
export function canManageProviderAccount(provider:Pick<ProviderEntry,'id'>):boolean { return !provider.id.startsWith('fluely-local-'); }
export function providerSource(provider: Pick<ProviderEntry, 'preset' | 'base_url' | 'id'>): ProviderSource {
  if (provider.preset === 'system-stt') return 'system';
  if (provider.id.startsWith('fluely-local-') || ['ollama','lm-studio','local-whisper','local-gguf-asr'].includes(provider.preset)) return 'local';
  try {
    const host = new URL(provider.base_url).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host)) return 'local';
  } catch { /* Invalid endpoints remain visible in the cloud editor for correction. */ }
  return 'cloud';
}
export function providerOptions(kind: ProviderKind, source: ProviderSource) {
  return BUILTIN_PROVIDERS.filter(provider => {
    if (kind !== 'stt' && ['system-stt','local-whisper'].includes(provider.id)) return false;
    return source === 'all' || providerSource({id:provider.id,preset:provider.id,base_url:provider.url}) === source;
  });
}
