import type { ProviderEntry } from '@/lib/overlay/provider-types';
import { providerSecretKey } from '@/lib/storage/credential-store';

export interface ProviderSavePorts {
  setSecret(key: string, value: string): Promise<unknown>;
  getSecret(key: string): Promise<string | null>;
  upsert(provider: ProviderEntry): Promise<unknown>;
}

export async function saveProviderConfiguration(provider: ProviderEntry, apiKey: string, ports: ProviderSavePorts): Promise<ProviderEntry> {
  validateProviderConfiguration(provider);
  const metadata: ProviderEntry = { ...provider, variables: { ...provider.variables }, secret_keys: [...provider.secret_keys] };
  if (apiKey) {
    const key = providerSecretKey(provider.id, 'API_KEY');
    try {
      await ports.setSecret(key, apiKey);
      if (await ports.getSecret(key) !== apiKey) throw new Error('verification');
    } catch {
      throw new Error('Не вдалося зберегти й перевірити ключ у захищеному сховищі. Налаштування провайдера не змінено.');
    }
    metadata.secret_keys = [...new Set([...metadata.secret_keys, 'API_KEY'])];
  }
  await ports.upsert(metadata);
  return metadata;
}

export const PROVIDER_PRESETS = [
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
  { id: 'google', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { id: 'openai-compatible', label: 'OpenAI / сумісний API', url: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  { id: 'lm-studio', label: 'LM Studio', url: 'http://localhost:1234/v1', model: 'local-model' },
  { id: 'local-whisper', label: 'Локальний Whisper (сумісний сервер)', url: 'http://localhost:8080/v1', model: 'whisper-1' },
  { id: 'system-stt', label: 'Windows: офлайн-розпізнавання', url: 'http://localhost', model: 'default' },
  { id: 'custom', label: 'Власний запит cURL', url: 'https://api.openai.com/v1', model: 'custom-model' },
] as const;

export function parseProviderVariables(source: string): Record<string, string> {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('Змінні мають бути коректним JSON-об’єктом.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(value => typeof value !== 'string')) {
    throw new Error('Змінні мають бути JSON-об’єктом із текстовими значеннями.');
  }
  return parsed as Record<string, string>;
}

function secretVariable(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.endsWith('token') || /apikey|password|secret|authorization|credential|privatekey/.test(normalized);
}

export function validateProviderConfiguration(provider: ProviderEntry): void {
  if (!provider.id.trim() || !provider.model.trim()) throw new Error('Укажіть ідентифікатор і модель провайдера.');
  let url: URL;
  try { url = new URL(provider.base_url); } catch { throw new Error('Укажіть коректну базову URL-адресу.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Базова адреса має бути HTTP(S) без вбудованих ключів.');
  if (!Number.isInteger(provider.rank)) throw new Error('Пріоритет має бути цілим числом.');
  for (const value of [provider.limit_per_second, provider.limit_per_minute, provider.limit_per_hour, provider.limit_per_day]) {
    if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) throw new Error('Ліміти мають бути невід’ємними цілими числами; 0 означає без обмежень.');
  }
  for (const key of Object.keys(provider.variables)) {
    if (secretVariable(key) || provider.secret_keys.some(secret => secret.toLowerCase() === key.toLowerCase())) throw new Error('Ключі й токени вводьте в захищене поле API-ключа, а не в змінні.');
  }
}
