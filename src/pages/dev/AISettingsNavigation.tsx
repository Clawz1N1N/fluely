import {useI18n} from '@/lib/i18n';
import type {ProviderKind} from '@/lib/overlay/provider-types';
import type {ProviderSource} from './ai-settings-config';
const modules=[['brain','Reasoning'],['stt','Speech recognition'],['tts','Text-to-speech'],['vision','Vision']] as const;
const sources=[['cloud','Cloud providers'],['local','Local engines'],['system','System']] as const;
const button='rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50';
export function AISettingsNavigation({kind,source,onKind,onSource,onRefresh,busy=false}:{kind:ProviderKind;source:ProviderSource;onKind(value:ProviderKind):void;onSource(value:ProviderSource):void;onRefresh():void;busy?:boolean}) {
  const {t}=useI18n();
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('AI modules')}>
      {modules.map(([id,label])=><button key={id} type="button" aria-pressed={kind===id} className={`${button} ${kind===id?'bg-primary text-primary-foreground hover:bg-primary/90':''}`} onClick={()=>onKind(id)}>{t(label)}</button>)}
      <button type="button" className={`${button} ml-auto`} disabled={busy} onClick={onRefresh}>{t('Refresh providers')}</button>
    </div>
    <div className="flex flex-wrap gap-2 rounded-lg bg-muted/40 p-2" role="group" aria-label={t('Provider source')}>
      {sources.filter(([id])=>id!=='system'||kind==='stt'||kind==='tts').map(([id,label])=><button key={id} type="button" aria-pressed={source===id} className={`${button} ${source===id?'bg-white text-zinc-950 shadow-sm hover:bg-white':'border-transparent'}`} onClick={()=>onSource(id)}>{t(label)}</button>)}
    </div>
  </div>;
}

