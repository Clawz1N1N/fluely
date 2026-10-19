import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
interface IconStatus { custom:boolean; preview_data_url:string; restart_required:boolean; note:string }
export function AppIconSettings(){
  const {t}=useI18n();const [status,setStatus]=useState<IconStatus|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{let active=true;void invoke<IconStatus>('get_app_icon_status').then(value=>{if(active)setStatus(value);}).catch(failure=>{if(active)setError(String(failure));});return()=>{active=false;};},[]);
  const choose=async(file:File|undefined)=>{
    if(!file)return;setBusy(true);setError('');
    try{if(file.size>4*1024*1024)throw new Error('Choose a PNG or ICO smaller than 4 MiB');
      const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      setStatus(await invoke<IconStatus>('save_app_icon',{imageBase64:btoa(binary)}));
    }catch(failure){setError(String(failure));}finally{setBusy(false);}
  };
  const restore=async()=>{setBusy(true);setError('');try{setStatus(await invoke<IconStatus>('restore_default_app_icon'));}catch(failure){setError(String(failure));}finally{setBusy(false);}};
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">{t('Application icon')}</h2>
    {status&&<div className="flex items-center gap-3"><img src={status.preview_data_url} alt={t('Application icon preview')} className="h-12 w-12 rounded"/><p className="text-sm text-muted-foreground">{t(status.note)}</p></div>}
    <p className="text-sm text-muted-foreground">{t('Choose a square PNG or ICO, 16–1024 pixels, up to 4 MiB. The image is saved in your Fluely profile.')}</p>
    {error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">{t('Choose icon')}<input type="file" accept="image/png,image/x-icon,.ico" disabled={busy} className="ml-2 max-w-full" onChange={event=>{void choose(event.target.files?.[0]);event.target.value='';}}/></label>
    <button type="button" disabled={busy||!status?.custom} onClick={()=>void restore()} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{t('Restore default icon')}</button></div>
    {status?.restart_required&&<p className="text-sm">{t('Restart with the saved process name in the settings below to apply the executable icon.')}</p>}
  </section>;
}
