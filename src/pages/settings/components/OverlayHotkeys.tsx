import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from '@/lib/i18n';
import {getShortcutsConfig,setShortcutsConfig,checkShortcutConflicts,formatShortcutKeyForDisplay} from '@/lib/storage/shortcuts.storage';
import {ShortcutRecorder} from '@/pages/shortcuts/components/shortcuts/ShortcutRecorder';
const actions=['hide_all','answer_interaction'] as const;
const names={hide_all:'Hide all windows',answer_interaction:'Chat movement and interaction'};
export function OverlayHotkeys(){
  const {t}=useI18n();
  const [config,setConfig]=useState(getShortcutsConfig),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const save=async(action:string,key:string,enabled:boolean)=>{
    const conflict=enabled?checkShortcutConflicts(key,action):null;
    if(conflict){setError(t('Shortcut "{key}" is already used by: {actions}',{key,actions:conflict.actions.join(', ')}));return;}
    const next={...config,bindings:{...config.bindings,[action]:{action,key,enabled}}};
    setBusy(true);setError('');
    try{await invoke('update_shortcuts',{config:next});setShortcutsConfig(next);setConfig(next);setEditing(null);}
    catch(failure){setError(String(failure));}finally{setBusy(false);}
  };
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">{t('Overlay shortcuts')}</h2>
    {error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {actions.map(action=><div className="space-y-2" key={action}>
      <div className="flex flex-wrap items-center gap-3"><label className="flex flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={config.bindings[action].enabled} disabled={busy} onChange={event=>void save(action,config.bindings[action].key,event.target.checked)}/>{t(names[action])}</label><button type="button" className="rounded-md border px-3 py-1 text-sm" disabled={busy} onClick={()=>setEditing(action)}>{formatShortcutKeyForDisplay(config.bindings[action].key)}</button></div>
      {editing===action&&<ShortcutRecorder actionId={action} disabled={busy} onCancel={()=>setEditing(null)} onSave={key=>void save(action,key,true)}/>}
    </div>)}
    <p className="text-xs text-muted-foreground">{t('Hide all windows also hides settings and status. Press the shortcut again to restore the windows that were visible.')}</p>
  </section>;
}
