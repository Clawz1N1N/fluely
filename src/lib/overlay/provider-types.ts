export type ProviderKind = 'brain' | 'stt' | 'tts' | 'vision';
export interface RequestLimits {
  per_second: number; per_minute: number; per_hour: number; per_day: number;
}
/** Persisted metadata; credentials are stored separately in the OS keychain. */
export interface ProviderEntry {
  id: string; kind: ProviderKind; preset: string; base_url: string; model: string;
  supports_images: boolean; rank: number; enabled: boolean;
  provider_id?: string; credential_id?: string; display_name?: string; model_display_name?: string; provider_name?:string;
  supports_audio?: boolean; context_window?: number | null; max_output_tokens?: number | null;
  limit_per_second: number; limit_per_minute: number; limit_per_hour: number; limit_per_day: number;
  token_limit_per_second?: number; token_limit_per_minute?: number; token_limit_per_hour?: number; token_limit_per_day?: number;
  manual_neutral?: boolean; reasoning_effort?: string; reasoning_efforts?: string[];
  /** Transient native reservation, never persisted as provider metadata. */
  tokenReservationId?: number;
  curl: string | null; streaming: boolean; response_content_path: string;
  variables: Record<string, string>; secret_keys: string[];
}
export interface ProviderStatus {
  neutral: boolean; manualNeutral: boolean; nextAllowedAt: number | null;
  currentProviderId: string | null;
  globalLimits: RequestLimits; globalUsed: RequestLimits;
  providers: Array<ProviderEntry & { used: RequestLimits; tokenUsed?: RequestLimits; nextAllowedAt: number | null; inCooldown: boolean }>;
}
export const UNLIMITED: RequestLimits = { per_second: 0, per_minute: 0, per_hour: 0, per_day: 0 };
