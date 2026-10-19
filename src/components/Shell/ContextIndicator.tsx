import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {t} from '@/lib/i18n';
import type {ServiceSnapshot} from '@/lib/overlay/contracts';
import type {ProviderEntry} from '@/lib/overlay/provider-types';
import {getChatPreferences} from '@/lib/overlay/chat-preferences';
import {providersForSelection,responseInstructions,type ChatPreferences} from '@/lib/overlay/chat-preferences-core';
import {contextHistory,contextUsage} from '@/lib/overlay/context-budget';

export function ContextIndicator({snapshot}:{snapshot:ServiceSnapshot}){
  const [model,setModel]=useState<ProviderEntry>(),[preferences,setPreferences]=useState<ChatPreferences>();
  useEffect(()=>{
    let disposed=false;const stops:UnlistenFn[]=[];
    const refresh=async()=>{const [providers,prefs]=await Promise.all([invoke<ProviderEntry[]>('list_providers'),getChatPreferences()]);if(!disposed){setPreferences(prefs);setModel(providersForSelection(providers,'brain',prefs.selections.brain).sort((a,b)=>a.rank-b.rank)[0]);}};
    for(const event of ['providers-status','chat-preferences-changed'])void listen(event,()=>void refresh().catch(()=>{})).then(stop=>disposed?stop():stops.push(stop)).catch(()=>{});
    void refresh().catch(()=>{});return()=>{disposed=true;stops.forEach(stop=>stop());};
  },[]);
  const estimate=useMemo(()=>model?contextUsage(model,[preferences?.system_prompt,preferences?.structured_prompt,preferences?responseInstructions(preferences):''].filter(Boolean).join('\n\n'),'',contextHistory(snapshot.history,snapshot.session?.context_summary),[],undefined,!!snapshot.session?.context_summary):null,[model,preferences,snapshot.history.length,snapshot.session?.id,snapshot.session?.events.length]);
  const usage=snapshot.busy&&snapshot.context?.model===model?.model?snapshot.context:estimate;
  return <span aria-label={t('Context usage')} className="min-w-0 text-[10px] text-white/60" title={usage?`${t('Input tokens')}: ${usage.inputTokens} · ${t('Reserved output')}: ${usage.outputReserved} · ${usage.model}`:t('Set the context window in AI settings')}>
    {t('Context')}: {usage?.estimated?'≈ ':''}{(usage?.inputTokens??0).toLocaleString()} / {usage?.contextWindow?.toLocaleString()??'—'} {usage?.percent!==null&&usage?.percent!==undefined?`(${usage.percent}%)`:''} {usage?.compressing?t('Compressing…'):usage?.compressed?t('Compressed'):''}
  </span>;
}
