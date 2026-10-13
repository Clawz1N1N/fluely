import { useEffect,useState,type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';

interface IdentityConfig { executable_alias:string;startup_name:string;autostart:boolean }
interface IdentityStatus { config:IdentityConfig;current_executable:string;managed_executable:string;alias_active:boolean;restart_required:boolean;autostart_active:boolean;metadata_patched:boolean;automatic_alias_enabled:boolean;warning:string|null }
const field='w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const button='rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';

/** The interface remains Fluely; only its own process/startup alias is configurable. */
export function IdentitySettings(){
  const {t}=useI18n();
  const [status,setStatus]=useState<IdentityStatus|null>(null);
  const [config,setConfig]=useState<IdentityConfig>({executable_alias:'my program.exe',startup_name:'my program.exe',autostart:false});
  const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [feedback,setFeedback]=useState('');
  useEffect(()=>{
    let disposed=false;
    void invoke<IdentityStatus>('get_identity_status').then(value=>{if(!disposed){setStatus(value);setConfig(value.config);}})
      .catch(failure=>{if(!disposed)setError(String(failure));}).finally(()=>{if(!disposed)setBusy(false);});
    return()=>{disposed=true;};
  },[]);
  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');setFeedback('');
    try{const value=await invoke<IdentityStatus>('save_identity_config',{config});setStatus(value);setConfig(value.config);setFeedback('Saved. Restart to apply the process name.');}
    catch(failure){setError(failure instanceof Error?failure.message:String(failure));}finally{setBusy(false);}
  };
  const restart=async()=>{
    setBusy(true);setError('');
    try{await invoke('restart_identity');}catch(failure){setError(failure instanceof Error?failure.message:String(failure));setBusy(false);}
  };
  const dirty=!!status&&(config.executable_alias!==status.config.executable_alias||config.startup_name!==status.config.startup_name||config.autostart!==status.config.autostart);
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">{t('Process and startup name')}</h2>
    <p className="text-sm text-muted-foreground">{t('Fluely keeps its own interface name. These names apply only to its own executable and startup entry.')}</p>
    {error&&<div role="alert" className="rounded bg-destructive/15 p-3 text-sm text-destructive">{t(error)}</div>}
    {feedback&&<p role="status" className="text-sm">{t(feedback)}</p>}
    {status?.warning&&<p className="text-sm text-muted-foreground">{t(status.warning)}</p>}
    <form onSubmit={event=>void save(event)} className="space-y-4">
      <fieldset disabled={busy||!status} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm"><span>{t('Executable filename')}</span><input className={field} value={config.executable_alias} maxLength={128} required autoComplete="off" onChange={event=>setConfig({...config,executable_alias:event.target.value})}/></label>
          <label className="grid gap-1.5 text-sm"><span>{t('Startup display name')}</span><input className={field} value={config.startup_name} maxLength={128} required autoComplete="off" onChange={event=>setConfig({...config,startup_name:event.target.value})}/></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.autostart} onChange={event=>setConfig({...config,autostart:event.target.checked})}/>{t('Start at Windows sign-in')}</label>
        <div className="flex flex-wrap gap-2"><button type="submit" className={button}>{t(busy?'Saving…':'Save names')}</button><button type="button" className={button} disabled={dirty||!status?.restart_required} onClick={()=>void restart()}>{t('Restart with saved name')}</button></div>
      </fieldset>
    </form>
    {status&&<div className="space-y-1 text-xs text-muted-foreground">
      <p role="status">{t(status.alias_active?'Alias active':'Restart required')}</p>
      <p className="break-all">{t('Current executable')}: {status.current_executable}</p>
      {status.managed_executable&&<p className="break-all">{t('Managed executable')}: {status.managed_executable}</p>}
    </div>}
  </section>;
}
