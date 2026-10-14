import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from '@/lib/i18n';
import {PageLayout} from '@/layouts';
import {ProviderModels} from '@/pages/settings/components/ProviderModels';
import {LocalEngineSettings} from '@/pages/settings/components/LocalEngineSettings';
import type {ProviderKind} from '@/lib/overlay/provider-types';
import type {ProviderSource} from './ai-settings-config';
import {TtsOutputSettings,VisionConfiguration} from './AIServiceSettings';

import {AISettingsNavigation} from './AISettingsNavigation';

export default function AISettings() {
  const {t}=useI18n();
  const [kind,setKind]=useState<ProviderKind>('brain'),[source,setSource]=useState<ProviderSource>('cloud');
  const [refreshKey,setRefreshKey]=useState(0),[providerRevision,setProviderRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=async()=>{setBusy(true);setError('');try{await invoke('list_providers');setRefreshKey(key=>key+1);}catch(error){setError(String(error));}finally{setBusy(false);}};
  const chooseKind=(next:ProviderKind)=>{setKind(next);if(source==='system'&&next!=='stt'&&next!=='tts')setSource('cloud');};
  return <PageLayout title={t('AI settings')} description="">
    <AISettingsNavigation kind={kind} source={source} onKind={chooseKind} onSource={setSource} onRefresh={()=>void refresh()} busy={busy}/>
    {error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div key={`${kind}-${source}`} className="space-y-5">
      {source==='local'&&kind!=='tts'&&<LocalEngineSettings kinds={kind==='brain'?['brain']:kind==='stt'?['stt','gguf-asr']:['vision']} hideHeader refreshKey={refreshKey} onProviderChanged={()=>setProviderRevision(value=>value+1)}/>}
      {source==='system'&&kind==='stt'&&<p className="text-sm text-muted-foreground">{t('Fetch models to list the Windows speech recognizers installed on this PC. Install a speech language pack if no recognizers are available.')}</p>}
      {(source!=='system'||kind==='stt')&&<ProviderModels kind={kind} source={source} hideHeader hideToolbar refreshKey={refreshKey+providerRevision}/>}
      {kind==='vision'&&<VisionConfiguration refreshKey={refreshKey+providerRevision}/>}
      {kind==='tts'&&<TtsOutputSettings backend={source==='local'?'piper':source==='system'?'system':'cloud'}/>}
    </div>
  </PageLayout>;
}
