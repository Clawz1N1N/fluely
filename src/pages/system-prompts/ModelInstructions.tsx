import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { t, useI18n } from '@/lib/i18n';
import { useApp } from '@/contexts';
import { listenChatPreferences, updateChatPreferences } from '@/lib/overlay/chat-preferences';
import type { SleepSettings } from '@/lib/overlay/sleep';

/** Mode instructions live with templates; alarm routing remains in Sleep settings. */
export function ModelInstructions(){
  useI18n();
  const {setSystemPrompt}=useApp();
  const [system,setSystem]=useState(''),[structured,setStructured]=useState('');
  const [sleep,setSleep]=useState<SleepSettings>();
  const dirty=useRef(false);
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{let disposed=false,off:(()=>void)|undefined;
    void listenChatPreferences(chat=>{if(disposed)return;if(!dirty.current){setSystem(chat.system_prompt);setStructured(chat.structured_prompt);}setReady(true);}).then(stop=>{if(disposed)stop();else off=stop;}).catch(error=>setError(String(error)));
    void invoke<SleepSettings>('get_sleep_settings').then(value=>{if(!disposed)setSleep(value);}).catch(error=>setError(String(error)));
    return()=>{disposed=true;off?.();};},[]);
  const control='min-h-36 w-full rounded-md border border-input bg-background p-3 text-sm';
  return <section className="mt-6 space-y-4 border-t pt-6">
    <h2 className="text-xl font-semibold">{t('Model instructions')}</h2>
    <p className="text-sm text-muted-foreground">{t('Normal mode uses the selected template and response structure. Sleep mode listens only to system audio and uses its separate alarm instructions.')}</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved&&<p role="status" className="text-sm text-primary">{t('Instructions saved.')}</p>}
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();setBusy(true);setError('');setSaved(false);void(async()=>{
      await updateChatPreferences({system_prompt:system,structured_prompt:structured,prompt_id:null});setSystemPrompt(system);
      if(sleep){const latest=await invoke<SleepSettings>('get_sleep_settings');await invoke('save_sleep_settings',{settings:{...latest,prompt:sleep.prompt}});}
      dirty.current=false;setSaved(true);
    })().catch(error=>setError(String(error))).finally(()=>setBusy(false));}}>
      <fieldset disabled={busy||!ready} className="space-y-4">
        <label className="grid gap-1 text-sm"><span>{t('Normal mode · system instruction')}</span><textarea className={control} value={system} onChange={event=>{dirty.current=true;setSaved(false);setSystem(event.target.value);}}/></label>
        <label className="grid gap-1 text-sm"><span>{t('Response structure')}</span><textarea className={control} value={structured} onChange={event=>{dirty.current=true;setSaved(false);setStructured(event.target.value);}}/><span className="text-xs text-muted-foreground">{t('Keep <main>, <side>, and <speak> tags for the answer panels and speech.')}</span></label>
        {sleep&&<label className="grid gap-1 text-sm"><span>{t('Sleep mode · alarm instruction')}</span><textarea className={control} value={sleep.prompt} onChange={event=>setSleep({...sleep,prompt:event.target.value})}/><span className="text-xs text-muted-foreground">{t('The alarm marker, track, volume, and output device are configured in Sleep settings.')}</span></label>}
        <button type="submit" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">{t('Save instructions')}</button>
      </fieldset>
    </form>
  </section>;
}
