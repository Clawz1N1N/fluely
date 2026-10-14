import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Brain, Languages, ScanEye, Volume2, Mic, BookOpen, AlignLeft } from 'lucide-react';
import { t, useI18n } from '@/lib/i18n';
import { getAllSystemPrompts } from '@/lib/database';
import { LANGUAGES } from '@/lib/response-settings.constants';
import { listenChatPreferences, updateChatPreferences } from '@/lib/overlay/chat-preferences';
import { isLocalProvider, providersForSelection, modelDisplayName, type ChatPreferences, type ModelSource } from '@/lib/overlay/chat-preferences-core';
import type { ProviderEntry, ProviderKind } from '@/lib/overlay/provider-types';
import type { SystemPrompt } from '@/types';
import type { LocalEngineConfig } from '@/lib/overlay/local-engine-client';

const sourceLabels:Record<ModelSource,[string,string,string]>={auto:['Auto','Авто','Авто'],cloud:['Cloud','Хмара','Облако'],local:['Local','Локально','Локально'],system:['System','Система','Система']};
const kindLabels:Record<ProviderKind,[string,string,string]>={brain:['Reasoning','Міркування','Рассуждение'],stt:['STT','STT','STT'],tts:['TTS','TTS','TTS'],vision:['Vision','Зір','Зрение']};
const button='flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-40';
const choice='w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10';
type Panel='prompt'|'language'|'length'|ProviderKind|null;
export function ChatQuickControls({interactive}:{interactive:boolean}){
  const {language}=useI18n();
  const tr=(value:[string,string,string])=>value[language==='uk'?1:language==='ru'?2:0];
  const [preferences,setPreferences]=useState<ChatPreferences>();
  const [providers,setProviders]=useState<ProviderEntry[]>([]);
  const [localConfigs,setLocalConfigs]=useState<LocalEngineConfig[]>([]);
  const [piperAvailable,setPiperAvailable]=useState(false);
  const [prompts,setPrompts]=useState<SystemPrompt[]>([]);
  const [panel,setPanel]=useState<Panel>(null);
  const [source,setSource]=useState<ModelSource>('cloud');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [customEffort,setCustomEffort]=useState('');
  const refresh=async()=>{const results=await Promise.allSettled([invoke<ProviderEntry[]>('list_providers'),invoke<LocalEngineConfig[]>('get_local_engine_configs'),invoke<{voice:string;backend:string}>('get_tts_settings')]);
    if(results[0].status==='fulfilled')setProviders(results[0].value);else throw results[0].reason;
    if(results[1].status==='fulfilled')setLocalConfigs(results[1].value);
    if(results[2].status==='fulfilled')setPiperAvailable(results[2].value.voice.toLowerCase().endsWith('.onnx'));
  };
  const candidates=(kind:ProviderKind,next:ModelSource)=>providersForSelection(providers.map(p=>({...p,enabled:p.enabled||p.id.startsWith('fluely-local-')&&localConfigs.some(c=>p.id===`fluely-local-${c.kind}`&&!!c.model_path&&!!c.executable)})),kind,{source:next,provider_id:null});
  useEffect(()=>{let disposed=false,off:(()=>void)|undefined;
    void listenChatPreferences(value=>{if(!disposed)setPreferences(value);}).then(stop=>{if(disposed)stop();else off=stop;}).catch(error=>setError(String(error)));
    return()=>{disposed=true;off?.();};},[]);
  useEffect(()=>{if(!interactive)setPanel(null);},[interactive]);
  const run=async(operation:()=>Promise<unknown>,close=true)=>{setBusy(true);setError('');try{await operation();if(close)setPanel(null);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
  const patch=async(value:Parameters<typeof updateChatPreferences>[0])=>setPreferences(await updateChatPreferences(value));
  const open=(next:Panel)=>{setPanel(panel===next?null:next);setSearch('');setCustomEffort('');setError('');
    if(next==='prompt')void getAllSystemPrompts().then(setPrompts).catch(error=>setError(String(error)));
    if(next&&['brain','stt','tts','vision'].includes(next)){const kind=next as ProviderKind;setSource(preferences?.selections[kind]?.source??'cloud');void refresh().catch(error=>setError(String(error)));}
  };
  const selectModel=async(kind:ProviderKind,source:ModelSource,provider_id:string|null)=>{
    if(source==='local'&&provider_id?.startsWith('fluely-local-')&&!providers.find(p=>p.id===provider_id)?.enabled)await invoke('start_local_engine',{kind:provider_id.slice('fluely-local-'.length)});
    if(kind==='stt'&&source==='system'&&!provider_id){
      const installed=await invoke<Array<{id:string;name:string}>>('list_system_stt_languages');
      if(!installed.length)throw new Error(tr(['No offline Windows speech language is installed.','Не встановлено жодної мови офлайн-розпізнавання Windows.','Не установлен ни один язык офлайн-распознавания Windows.']));
      const locale=await invoke<string>('get_system_locale');const selected=installed.find(p=>p.id.toLowerCase()===locale.toLowerCase())??installed.find(p=>p.id.toLowerCase().startsWith(locale.split(/[-_]/)[0].toLowerCase()))??installed[0];
      provider_id=`system-stt:${selected.id}`;
      await invoke('upsert_provider',{provider:{id:provider_id,kind:'stt',preset:'system-stt',base_url:'http://localhost',model:selected.id,model_display_name:selected.name,provider_name:'Windows STT',supports_images:false,rank:0,enabled:true,limit_per_second:0,limit_per_minute:0,limit_per_hour:0,limit_per_day:0,curl:null,streaming:false,response_content_path:'text',variables:{},secret_keys:[]}});
    }
    if(kind==='vision'){
      const settings=await invoke<Record<string,unknown>>('get_vision_settings');
      await invoke('update_vision_settings',{settings:{...settings,vision_provider_id:provider_id,method:'semantic',mode:source==='system'?'ocr+ui':'full'}});
    }
    await patch({selections:{[kind]:{source,provider_id}}});
    // Keep the reasoning panel open to offer the selected model's effort controls.
    await refresh();
  };
  const sourceChoice=(kind:ProviderKind,next:ModelSource)=>{
    const models=candidates(kind,next);
    if((next==='system'&&(kind!=='stt'||models.length<=1))||next==='auto'||(next==='local'&&models.length+(kind==='tts'&&piperAvailable?1:0)<=1)){setSource(next);void run(()=>selectModel(kind,next,models.length===1?models[0].id:null),kind!=='brain');}
    else{setSource(next);setSearch('');}
  };
  const currentBrain=providers.find(p=>p.id===preferences?.selections.brain?.provider_id);
  const efforts=currentBrain?.reasoning_efforts?.length?currentBrain.reasoning_efforts:['off','low','medium','high','xhigh','max'];
  const saveEffort=(effort:string)=>{if(!currentBrain)return;void run(async()=>{
    await invoke('upsert_provider',{provider:{...currentBrain,reasoning_effort:effort,reasoning_efforts:[...new Set([...efforts,effort])]}});await refresh();
  },false);};
  const promptLabel=preferences?.prompt_id?.startsWith('mode:')?preferences.mode_prompts.find(p=>`mode:${p.modelId}`===preferences.prompt_id)?.title:undefined;
  const kinds=[['brain',Brain],['stt',Mic],['tts',Volume2],['vision',ScanEye]] as const;
  return <div className="relative border-t border-white/15 px-2 py-1.5" aria-label={tr(['Chat settings','Налаштування чату','Настройки чата'])}>
    <div className="flex flex-wrap gap-1">
      <button disabled={!interactive||busy||!preferences} type="button" className={button} aria-expanded={panel==='prompt'} onClick={()=>open('prompt')}><BookOpen size={12}/>{promptLabel?t(promptLabel):tr(['Prompt','Шаблон','Шаблон'])}</button>
      <button disabled={!interactive||busy||!preferences} type="button" className={button} aria-expanded={panel==='language'} onClick={()=>open('language')}><Languages size={12}/>{tr(['Language','Мова','Язык'])}</button>
      <button disabled={!interactive||busy||!preferences} type="button" className={button} aria-expanded={panel==='length'} onClick={()=>open('length')}><AlignLeft size={12}/>{tr(['Length','Довжина','Длина'])}</button>
      {kinds.map(([kind,Icon])=><button key={kind} disabled={!interactive||busy||!preferences} type="button" className={button} aria-expanded={panel===kind} onClick={()=>open(kind)} title={providers.find(p=>p.id===preferences?.selections[kind]?.provider_id)?.model}><Icon size={12}/>{tr(kindLabels[kind])} · {tr(sourceLabels[preferences?.selections[kind]?.source??'auto'])}</button>)}
    </div>
    {interactive&&panel&&preferences&&<div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-72 overflow-auto rounded-lg border border-white/25 bg-neutral-900 p-2 shadow-xl" role="region">
      <div className="mb-1 flex items-center justify-between text-xs font-medium"><span>{panel==='prompt'?tr(['Prompt template','Шаблон інструкції','Шаблон инструкции']):panel==='language'?tr(['Response language','Мова відповіді','Язык ответа']):panel==='length'?tr(['Response length','Довжина відповіді','Длина ответа']):tr(kindLabels[panel])}</span><button type="button" className={button} onClick={()=>setPanel(null)} aria-label={t('Close')}>×</button></div>
      {error&&<p role="alert" className="py-1 text-xs text-red-300">{error}</p>}
      {panel==='prompt'&&<>
        <button type="button" className={choice} onClick={()=>setPanel(null)}>{tr(['Keep current instructions','Залишити поточну інструкцію','Оставить текущую инструкцию'])}</button>
        {preferences.mode_prompts.map(prompt=><button key={prompt.modelId} disabled={busy} type="button" className={choice} onClick={()=>void run(()=>patch({prompt_id:`mode:${prompt.modelId}`,system_prompt:prompt.prompt}))}>{preferences.prompt_id===`mode:${prompt.modelId}`?'✓ ':''}{t(prompt.title)}</button>)}
        {prompts.map(prompt=><button key={prompt.id} disabled={busy} type="button" className={choice} onClick={()=>void run(()=>patch({prompt_id:`user:${prompt.id}`,system_prompt:prompt.prompt}))}>{preferences.prompt_id===`user:${prompt.id}`?'✓ ':''}{prompt.name}</button>)}
      </>}
      {panel==='language'&&<><button type="button" className={choice} onClick={()=>void run(()=>patch({response_language:'auto'}))}>{preferences.response_language==='auto'?'✓ ':''}{tr(['Auto — question language','Авто — мова запитання','Авто — язык вопроса'])}</button>{LANGUAGES.map(option=><button key={option.id} type="button" className={choice} onClick={()=>void run(()=>patch({response_language:option.id}))}>{preferences.response_language===option.id?'✓ ':''}{option.flag} {t(option.name)}</button>)}</>}
      {panel==='length'&&([['auto',['Auto','Авто','Авто']],['short',['Short','Коротко','Кратко']],['medium',['Balanced','Збалансовано','Сбалансированно']],['detailed',['Detailed','Докладно','Подробно']]] as const).map(([value,label])=><button key={value} type="button" className={choice} onClick={()=>void run(()=>patch({response_length:value}))}>{preferences.response_length===value?'✓ ':''}{tr([...label])}</button>)}
      {['brain','stt','tts','vision'].includes(panel)&&<>
        <div className="mb-2 flex gap-1">{(['auto','cloud',...(panel!=='tts'||piperAvailable||candidates('tts','local').length?['local']:[]),...(panel==='stt'||panel==='tts'||panel==='vision'?['system']:[])] as ModelSource[]).map(value=><button key={value} type="button" disabled={busy} className={`${button} ${source===value?'bg-white/15':''}`} onClick={()=>sourceChoice(panel as ProviderKind,value)}>{tr(sourceLabels[value])}{panel==='vision'&&value==='system'?' · OCR/UI':''}</button>)}</div>
        {(source==='cloud'||source==='local'||source==='system'&&panel==='stt')&&<><input className="mb-1 w-full rounded border border-white/20 bg-neutral-800 px-2 py-1 text-xs" placeholder={tr(['Search saved models…','Пошук збережених моделей…','Поиск сохранённых моделей…'])} aria-label={tr(['Search saved models','Пошук збережених моделей','Поиск сохранённых моделей'])} value={search} onChange={event=>setSearch(event.target.value)}/>
          {panel==='tts'&&source==='local'&&piperAvailable&&<button type="button" disabled={busy} className={choice} onClick={()=>void run(()=>selectModel('tts','local',null))}>Piper · {tr(['Configured voice','Налаштований голос','Настроенный голос'])}</button>}
          {candidates(panel as ProviderKind,source).filter(p=>[p.model,p.model_display_name,p.provider_name,p.display_name].join(' ').toLowerCase().includes(search.toLowerCase())).map(provider=><button key={provider.id} disabled={busy} type="button" className={choice} onClick={()=>void run(()=>selectModel(panel as ProviderKind,provider.preset==='system-stt'?'system':isLocalProvider(provider)?'local':'cloud',provider.id),panel!=='brain')}>{preferences.selections[panel as ProviderKind]?.provider_id===provider.id?'✓ ':''}{modelDisplayName(provider)}<span className="ml-2 text-white/45">{provider.provider_name||provider.display_name||provider.preset}</span></button>)}
          {!candidates(panel as ProviderKind,source).length&&<p className="py-2 text-xs text-white/60">{tr(['No saved models available. Configure this source in Settings.','Немає доступних моделей. Налаштуйте джерело в Налаштуваннях.','Нет доступных моделей. Настройте источник в Настройках.'])}</p>}
        </>}
        {panel==='brain'&&currentBrain&&<div className="mt-2 border-t border-white/20 pt-2"><p className="mb-1 text-xs">{tr(['Reasoning effort','Рівень міркування','Уровень рассуждения'])} · {modelDisplayName(currentBrain)}</p><div className="flex flex-wrap gap-1">{efforts.map(effort=><button key={effort} type="button" className={`${button} ${(currentBrain.reasoning_effort??'off')===effort?'bg-blue-600':''}`} disabled={busy} onClick={()=>saveEffort(effort)}>{effort}</button>)}</div><form className="mt-1 flex gap-1" onSubmit={event=>{event.preventDefault();if(/^[A-Za-z]+$/.test(customEffort))saveEffort(customEffort);}}><input className="min-w-0 flex-1 rounded border border-white/20 bg-neutral-800 px-2 py-1 text-xs" aria-label={tr(['Custom effort (English letters)','Власний рівень (англійські літери)','Свой уровень (английские буквы)'])} placeholder={tr(['Custom effort (English letters)','Власний рівень (англійські літери)','Свой уровень (английские буквы)'])} pattern="[A-Za-z]+" value={customEffort} onChange={event=>setCustomEffort(event.target.value)}/><button className={button} disabled={busy||!/^[A-Za-z]+$/.test(customEffort)}>{t('Save')}</button></form></div>}
      </>}
    </div>}
    {error&&!panel&&<p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
