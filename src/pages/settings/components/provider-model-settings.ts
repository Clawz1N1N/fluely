import type {ProviderEntry} from '@/lib/overlay/provider-types';
import type {InterfaceLanguage} from '@/lib/i18n';

export const STANDARD_REASONING_EFFORTS=['off','low','medium','high','xhigh','max'] as const;
export const LIMIT_PERIODS=['second','minute','hour','day'] as const;
export function availableReasoningEfforts(provider:ProviderEntry):string[]{
  return [...new Set(['off',...(provider.reasoning_efforts??STANDARD_REASONING_EFFORTS)])];
}
export function changeReasoningAvailability(provider:ProviderEntry,effort:string,enabled:boolean):ProviderEntry{
  const current=availableReasoningEfforts(provider);
  const reasoning_efforts=enabled?[...new Set([...current,effort])]:current.filter(value=>value==='off'||value!==effort);
  return {...provider,reasoning_efforts,reasoning_effort:reasoning_efforts.includes(provider.reasoning_effort??'off')?provider.reasoning_effort??'off':'off'};
}
export function addReasoningEffort(provider:ProviderEntry,value:string):ProviderEntry{
  const effort=value.trim();
  if(!/^[A-Za-z]{1,64}$/.test(effort))throw new Error('Use English letters only for custom reasoning levels.');
  return changeReasoningAvailability(provider,effort,true);
}
/** Validate a single model while preserving its account, credentials and capabilities. */
export function prepareModelSettingsSave(provider:ProviderEntry):ProviderEntry{
  const saved={...provider,manual_neutral:provider.manual_neutral??false,reasoning_effort:provider.reasoning_effort??'off',reasoning_efforts:availableReasoningEfforts(provider)};
  for(const period of LIMIT_PERIODS){
    const request=provider[`limit_per_${period}`];
    const tokens=provider[`token_limit_per_${period}`]??0;
    for(const value of [request,tokens])if(!Number.isInteger(value)||value<0||value>4_294_967_295)throw new Error('Limits must be whole numbers from 0 to 4294967295.');
    saved[`token_limit_per_${period}`]=tokens;
  }
  if(!saved.reasoning_efforts.every(value=>/^[A-Za-z]{1,64}$/.test(value))||!saved.reasoning_efforts.includes(saved.reasoning_effort))throw new Error('Choose an available reasoning level.');
  for(const value of [saved.context_window,saved.max_output_tokens])if(value!=null&&(!Number.isInteger(value)||value<=0||value>4_294_967_295))throw new Error('Token capacity must be a positive whole number.');
  if(saved.context_window!=null&&saved.max_output_tokens!=null&&saved.max_output_tokens>saved.context_window)throw new Error('Output tokens cannot exceed context window');
  return saved;
}
export function modelSettingsError(message:string,language:InterfaceLanguage):string{
  const messages:Record<string,{uk:string;ru:string}>={
    'Limits must be whole numbers from 0 to 4294967295.':{uk:'Ліміти мають бути цілими числами від 0 до 4294967295.',ru:'Лимиты должны быть целыми числами от 0 до 4294967295.'},
    'Choose an available reasoning level.':{uk:'Виберіть доступний рівень міркування.',ru:'Выберите доступный уровень рассуждения.'},
    'Token capacity must be a positive whole number.':{uk:'Місткість токенів має бути додатним цілим числом.',ru:'Ёмкость токенов должна быть положительным целым числом.'},
    'Output tokens cannot exceed context window':{uk:'Кількість вихідних токенів не може перевищувати вікно контексту.',ru:'Количество выходных токенов не может превышать окно контекста.'},
  };
  return language==='en'?message:messages[message]?.[language]??message;
}
