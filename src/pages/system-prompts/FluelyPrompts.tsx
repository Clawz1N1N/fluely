import { t, useI18n } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useApp } from '@/contexts';
import { STORAGE_KEYS } from '@/config';
import { listenChatPreferences, updateChatPreferences } from '@/lib/overlay/chat-preferences';
import { MODE_PROMPTS, type ChatPreferences, type ModePrompt } from '@/lib/overlay/chat-preferences-core';

export const FluelyPrompts=()=>{
  useI18n();
  const {setSystemPrompt}=useApp();
  const [preferences,setPreferences]=useState<ChatPreferences>();
  const [editing,setEditing]=useState<ModePrompt>();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let disposed=false,off:(()=>void)|undefined;
    void listenChatPreferences(value=>{if(!disposed)setPreferences(value);}).then(stop=>{if(disposed)stop();else off=stop;}).catch(error=>setError(String(error)));
    return()=>{disposed=true;off?.();};},[]);
  const select=async(prompt:ModePrompt)=>{
    await updateChatPreferences({system_prompt:prompt.prompt,prompt_id:`mode:${prompt.modelId}`});
    setSystemPrompt(prompt.prompt);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
    localStorage.setItem('selected_pluely_prompt',JSON.stringify(prompt));
  };
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();}catch(error){setError(String(error));}finally{setBusy(false);}};
  const prompts=preferences?.mode_prompts??MODE_PROMPTS;
  return <section className="mt-6 space-y-4 border-t border-input/50 pt-6">
    <div><h2 className="text-xl font-semibold">{t('Default Prompts')}</h2><p className="text-sm text-muted-foreground">{t('Choose a mode, then edit its English instructions to suit your workflow. Your saved templates stay available.')}</p></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{prompts.map(prompt=><article key={prompt.modelId} className={`relative rounded-lg border p-4 ${preferences?.prompt_id===`mode:${prompt.modelId}`?'border-primary bg-primary/5':''}`}>
      <button type="button" disabled={busy} className="w-full text-left" onClick={()=>void run(()=>select(prompt))}>
        <h3 className="pr-6 font-medium">{MODE_PROMPTS.some(p=>p.modelId===prompt.modelId&&p.title===prompt.title)?t(prompt.title):prompt.title}</h3>
        <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">{prompt.prompt}</p>
      </button>
      {preferences?.prompt_id===`mode:${prompt.modelId}`&&<CheckCircle2 className="absolute right-3 top-3 size-4 text-primary"/>}
      <button type="button" disabled={busy} className="mt-3 text-xs text-primary" onClick={()=>setEditing({...prompt})}>{t('Edit')}</button>
    </article>)}</div>
    {editing&&<form className="space-y-2 rounded border p-3" onSubmit={event=>{event.preventDefault();void run(async()=>{
      const mode_prompts=prompts.map(prompt=>prompt.modelId===editing.modelId?editing:prompt);
      const selected=preferences?.prompt_id===`mode:${editing.modelId}`;
      await updateChatPreferences({mode_prompts,...(selected?{system_prompt:editing.prompt}:{})});
      if(selected){setSystemPrompt(editing.prompt);localStorage.setItem('selected_pluely_prompt',JSON.stringify(editing));}
      setEditing(undefined);
    });}}>
      <input aria-label={t('Назва шаблону')} className="w-full rounded border bg-background p-2" required value={editing.title} onChange={event=>setEditing({...editing,title:event.target.value})}/>
      <textarea aria-label={t('Інструкція шаблону')} className="min-h-48 w-full rounded border bg-background p-2" required value={editing.prompt} onChange={event=>setEditing({...editing,prompt:event.target.value})}/>
      <button type="submit" disabled={busy} className="rounded bg-primary px-3 py-1 text-primary-foreground">{t('Save')}</button>
      <button type="button" className="ml-2" onClick={()=>setEditing(undefined)}>{t('Cancel')}</button>
    </form>}
  </section>;
};
