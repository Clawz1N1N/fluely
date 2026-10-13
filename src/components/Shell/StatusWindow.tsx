import {useEffect} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useServiceSnapshot} from '@/hooks/useServiceSnapshot';
import {t,useI18n} from '@/lib/i18n';
import {serviceStatus,requestCounts} from './ShellControls';

export function StatusWindow(){
  useI18n();
  const {snapshot,connectionError}=useServiceSnapshot();
  const visible=Boolean(connectionError||snapshot.error||snapshot.neutral||snapshot.busy||snapshot.listening||snapshot.continuous);
  useEffect(()=>{void invoke('set_status_visibility',{visible}).catch(console.error);},[visible]);
  return <div role="status" className="flex h-full flex-col items-end justify-end p-2 text-right text-xs text-white" style={{textShadow:'0 1px 3px black'}}>
    <div className="max-w-full rounded-md border border-white/25 px-3 py-2" style={{background:'rgba(23,23,23,0.45)'}}>
      <div>{connectionError??serviceStatus(snapshot)}</div>
      {snapshot.busy&&<div>{t('Processing…')}</div>}
      {snapshot.continuous&&<div>{t('Screen vision')}</div>}
      <div className="text-[10px] text-white/75">{requestCounts(snapshot)}</div>
    </div>
  </div>;
}
