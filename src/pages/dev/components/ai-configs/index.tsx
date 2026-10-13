import { ProviderModels } from '@/pages/settings/components/ProviderModels';
import type { UseSettingsReturn } from '@/types';

export const AIProviders = (_settings: UseSettingsReturn) => <ProviderModels initialKind="brain" />;
