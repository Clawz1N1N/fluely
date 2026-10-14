import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { t, useI18n } from '@/lib/i18n';
import type { ProviderEntry, ProviderKind } from '@/lib/overlay/provider-types';
import { BUILTIN_PROVIDERS, SelectionHistory, modelEntries, type ModelInfo, type ProviderAccount } from '@/lib/overlay/model-catalog';
import { fetchProviderModels } from '@/lib/overlay/provider-engine';
import { getSecret, setSecret,removeSecret } from '@/lib/storage/secure.storage';
import { providerSecretKey } from '@/lib/storage/credential-store';
import {validateProviderConfiguration} from './provider-config';
import {publishProviderAccount} from '@/lib/overlay/provider-account-save';
import {providerSource,providerOptions,canManageProviderAccount,type ProviderSource} from '@/pages/dev/ai-settings-config';
import {addReasoningEffort,availableReasoningEfforts,changeReasoningAvailability,LIMIT_PERIODS,modelSettingsError,prepareModelSettingsSave,STANDARD_REASONING_EFFORTS} from './provider-model-settings';

const input='w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const button='rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primary=button+' bg-primary text-primary-foreground hover:bg-primary/90';
function Field({label,children}:{label:string;children:ReactNode}){return <label className="grid gap-1.5 text-sm"><span>{t(label)}</span>{children}</label>;}
const kinds=[['brain','Reasoning models'],['stt','Speech recognition'],['tts','Text to speech'],['vision','Vision models']] as const;
const accountId=(p:ProviderEntry)=>p.credential_id||p.id;
const info=(p:ProviderEntry):ModelInfo=>({id:p.model,name:p.model_display_name||p.model,context_window:p.context_window??null,max_output_tokens:p.max_output_tokens??null,supports_images:p.supports_images,supports_audio:p.supports_audio??false});
function accountFor(p:ProviderEntry):ProviderAccount{return {provider_id:p.provider_id||p.preset,provider_name:p.provider_name||p.preset,credential_id:accountId(p),display_name:p.display_name||p.provider_id||p.preset,preset:p.preset,base_url:p.base_url,kind:p.kind};}

/** Quotas and effort choices become editable after a model has been added. */
export function ModelSettingsControls({provider:p,onChange,disabled=false}:{provider:ProviderEntry;onChange(provider:ProviderEntry):void;disabled?:boolean}){
  const {language}=useI18n();
  const tr=(en:string,uk:string,ru:string)=>language==='uk'?uk:language==='ru'?ru:en;
  const [custom,setCustom]=useState(''),[customError,setCustomError]=useState('');
  const efforts=availableReasoningEfforts(p);
  const periodLabels={second:tr('Per second','За секунду','За секунду'),minute:tr('Per minute','За хвилину','За минуту'),hour:tr('Per hour','За годину','За час'),day:tr('Per day','За добу','За сутки')};
  const effortLabel=(effort:string)=>({off:tr('Off','Вимкнено','Выключено'),low:tr('Low','Низький','Низкий'),medium:tr('Medium','Середній','Средний'),high:tr('High','Високий','Высокий'),xhigh:tr('Extra high','Дуже високий','Очень высокий'),max:tr('Maximum','Максимальний','Максимальный')}[effort]??effort);
  const customHint=tr('Use English letters only for custom reasoning levels.','Для власного рівня використовуйте лише англійські літери.','Для своего уровня используйте только английские буквы.');
  return <fieldset disabled={disabled} className="space-y-4 min-w-0">
    <details><summary className="cursor-pointer text-sm font-medium">{tr('Model limits and neutral mode','Ліміти моделі й нейтральний режим','Лимиты модели и нейтральный режим')}</summary>
      <div className="space-y-3 mt-3">
        <p className="text-xs text-muted-foreground">{tr('Limits apply only to this model. 0 means unlimited. Requests and tokens are counted over the last second, minute, hour and day. When any limit is reached, neutral mode pauses this model. No requests are sent to this model until its budget recovers.','Ліміти діють лише для цієї моделі. 0 означає без обмежень. Запити й токени враховуються за останню секунду, хвилину, годину та добу. Коли досягнуто будь-який ліміт, нейтральний режим призупиняє цю модель. Запити до неї не надсилаються, доки бюджет не відновиться.','Лимиты действуют только для этой модели. 0 означает без ограничений. Запросы и токены учитываются за последнюю секунду, минуту, час и сутки. При достижении любого лимита нейтральный режим приостанавливает эту модель. Запросы к ней не отправляются, пока бюджет не восстановится.')}</p>
        {(['request','token'] as const).map(budget=><fieldset key={budget} className="space-y-2"><legend className="text-sm font-medium">{budget==='request'?tr('Request limits','Ліміти запитів','Лимиты запросов'):tr('Token limits','Ліміти токенів','Лимиты токенов')}</legend><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{LIMIT_PERIODS.map(period=>{
          const key=budget==='request'?`limit_per_${period}` as const:`token_limit_per_${period}` as const;
          return <Field key={period} label={periodLabels[period]}><input className={input} type="number" min={0} max={4_294_967_295} step={1} value={p[key]??0} onChange={e=>onChange({...p,[key]:Number(e.target.value)})}/></Field>;
        })}</div></fieldset>)}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.manual_neutral??false} onChange={e=>onChange({...p,manual_neutral:e.target.checked})}/>{tr('Pause this model (manual neutral mode)','Призупинити цю модель (ручний нейтральний режим)','Приостановить эту модель (ручной нейтральный режим)')}</label>
        <p className="text-xs text-muted-foreground">{tr('Manual neutral mode pauses only this model until you turn it off and save. Other models remain available.','Ручний нейтральний режим призупиняє лише цю модель, доки ви не вимкнете його та не збережете. Інші моделі залишаються доступними.','Ручной нейтральный режим приостанавливает только эту модель, пока вы не выключите его и не сохраните. Другие модели остаются доступными.')}</p>
      </div>
    </details>
    {(p.kind==='brain'||p.kind==='vision')&&<details><summary className="cursor-pointer text-sm font-medium">{tr('Reasoning settings','Налаштування міркування','Настройки рассуждения')}</summary><div className="space-y-3 mt-3">
      <Field label={tr('Reasoning effort','Рівень міркування','Уровень рассуждения')}><select className={input} value={p.reasoning_effort??'off'} onChange={e=>onChange({...p,reasoning_effort:e.target.value})}>{efforts.map(effort=><option key={effort} value={effort}>{effortLabel(effort)}</option>)}</select></Field>
      <p className="text-xs text-muted-foreground">{tr('Off is the default. Enable only the levels supported by this model, then choose its effort. Off sends no reasoning-effort option to the provider.','За замовчуванням вимкнено. Позначте лише рівні, які підтримує ця модель, і виберіть рівень міркування. Вимкнення не надсилає провайдеру параметр рівня міркування.','По умолчанию выключено. Отметьте только уровни, которые поддерживает эта модель, и выберите уровень рассуждения. При выключении параметр уровня рассуждения провайдеру не отправляется.')}</p>
      <fieldset className="space-y-2"><legend className="text-sm">{tr('Available reasoning levels','Доступні рівні міркування','Доступные уровни рассуждения')}</legend><div className="flex flex-wrap gap-4">{[...new Set([...STANDARD_REASONING_EFFORTS,...efforts])].map(effort=><label key={effort} className="flex gap-2 text-sm"><input type="checkbox" checked={efforts.includes(effort)} disabled={effort==='off'} onChange={e=>onChange(changeReasoningAvailability(p,effort,e.target.checked))}/>{effortLabel(effort)}</label>)}</div></fieldset>
      <Field label={tr('Custom reasoning level','Власний рівень міркування','Свой уровень рассуждения')}><input className={input} value={custom} maxLength={64} pattern="[A-Za-z]+" onChange={e=>{setCustom(e.target.value);setCustomError('');}} placeholder="custom" aria-invalid={Boolean(customError)}/></Field>
      <p className="text-xs text-muted-foreground">{customHint}</p>{customError&&<p role="alert" className="text-xs text-destructive">{customError}</p>}
      <button type="button" className={button} disabled={!custom.trim()} onClick={()=>{try{onChange(addReasoningEffort(p,custom));setCustom('');setCustomError('');}catch{setCustomError(customHint);}}}>{tr('Add reasoning level','Додати рівень міркування','Добавить уровень рассуждения')}</button>
    </div></details>}
  </fieldset>;
}

/** One account owns one vault key; the registry owns independently configurable models. */
export function ProviderModels({initialKind='brain',kind:fixedKind,source='all',hideHeader=false,hideToolbar=false,refreshKey=0}:{initialKind?:ProviderKind;kind?:ProviderKind;source?:ProviderSource;hideHeader?:boolean;hideToolbar?:boolean;refreshKey?:number}){
  const {language}=useI18n();
  const [providers,setProviders]=useState<ProviderEntry[]>([]),[selectedKind,setKind]=useState(initialKind);
  const kind=fixedKind??selectedKind;
  const options=providerOptions(kind,source);
  const [account,setAccount]=useState<ProviderAccount|null>(null),[key,setKey]=useState('');
  const [models,setModels]=useState<ModelInfo[]>([]),[selected,setSelected]=useState<string[]>([]);
  const [dialog,setDialog]=useState(false),[search,setSearch]=useState(''),[manual,setManual]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const history=useRef(new SelectionHistory()),pending=useRef<AbortController|null>(null);
  const reload=async()=>setProviders(await invoke<ProviderEntry[]>('list_providers'));
  useEffect(()=>{let alive=true;void invoke<ProviderEntry[]>('list_providers').then(p=>{if(alive)setProviders(p);}).catch(()=>{if(alive)setError(t('Could not load providers'));});return()=>{alive=false;pending.current?.abort();};},[refreshKey]);
  const perform=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setFeedback('');try{await action();}catch(e){setError(e instanceof Error?modelSettingsError(t(e.message),language):t('Could not save provider models'));}finally{setBusy(false);}};
  const chooseAccount=(next:ProviderAccount)=>{pending.current?.abort();setAccount({...next});setKey('');setModels(providers.filter(p=>p.kind===next.kind&&accountId(p)===next.credential_id).map(info));setSearch('');setError('');};
  const create=()=>{const preset=options[0];chooseAccount({provider_id:preset?.id??'',credential_id:crypto.randomUUID(),display_name:'',preset:preset?.id??'other',base_url:preset?.url??'',kind});};
  const close=()=>{pending.current?.abort();setAccount(null);setKey('');setDialog(false);};
  const openSelection=(next:ModelInfo[])=>{setModels(next);const current=providers.filter(p=>p.kind===kind&&accountId(p)===account?.credential_id).map(p=>p.model).filter(id=>next.some(m=>m.id===id));history.current=new SelectionHistory(current);setSelected(current);setDialog(true);setSearch('');};
  const fetchModels=()=>void perform(async()=>{
    if(!account)return;
    if(account.preset==='system-stt'){const languages=await invoke<Array<{id:string;name:string}>>('list_system_stt_languages');openSelection(languages.map(({id,name})=>({id,name,context_window:null,max_output_tokens:null,supports_images:false,supports_audio:true})));return;}
    pending.current?.abort();const abort=new AbortController();pending.current=abort;
    const entry=modelEntries(account,[{id:'discovery',name:'discovery',context_window:null,max_output_tokens:null,supports_images:false,supports_audio:false}],[])[0];
    validateProviderConfiguration(entry);
    entry.secret_keys=providers.find(p=>accountId(p)===account.credential_id)?.secret_keys??[];
    const fetched=await fetchProviderModels(entry,key||undefined,abort.signal);
    if(abort.signal.aborted)return;
    const existing=providers.filter(p=>p.kind===kind&&accountId(p)===account.credential_id);
    // A fetch never erases user-specified capabilities and limits for saved models.
    const merged=fetched.map(m=>existing.find(p=>p.model===m.id)?info(existing.find(p=>p.model===m.id)!):m);
    for(const p of existing)if(!merged.some(m=>m.id===p.model))merged.push(info(p));
    openSelection(merged);
  });
  const select=(next:string[])=>setSelected(history.current.set(next));
  const saveSelection=()=>void perform(async()=>{
    if(!account)return;
    const picked=models.filter(m=>selected.includes(m.id));
    if(picked.some(m=>m.context_window!==null&&m.max_output_tokens!==null&&m.max_output_tokens>m.context_window))throw new Error('Output tokens cannot exceed context window');
    const entries=modelEntries({...account,display_name:account.display_name.trim()||BUILTIN_PROVIDERS.find(p=>p.id===account.preset)?.name||account.provider_id},picked,providers);
    entries.forEach(validateProviderConfiguration);
    const hasKey=Boolean(key)||providers.some(p=>accountId(p)===account.credential_id&&p.secret_keys.includes('API_KEY'));
    for(const entry of entries)if(hasKey)entry.secret_keys=[...new Set([...entry.secret_keys,'API_KEY'])];
    await publishProviderAccount(providerSecretKey(account.credential_id,'API_KEY'),key,{get:getSecret,set:setSecret,remove:removeSecret,publish:()=>invoke('save_provider_models',{credentialId:account.credential_id,kind,providers:entries})});
    await reload();close();setFeedback(t('Selected models saved'));
  });
  const groups=new Map<string,ProviderEntry[]>();for(const p of providers.filter(p=>p.kind===kind&&(source==='all'||providerSource(p)===source))){const id=accountId(p);groups.set(id,[...(groups.get(id)??[]),p]);}
  const selectedModels=models.filter(m=>selected.includes(m.id));
  const setModel=(id:string,patch:Partial<ModelInfo>)=>setModels(current=>current.map(m=>m.id===id?{...m,...patch}:m));
  const modelRow=(p:ProviderEntry)=><div key={p.id} className="space-y-3 rounded-md border p-3">
    <div className="flex flex-wrap gap-3 items-center"><strong className="break-all text-sm flex-1">{p.model_display_name||p.model}</strong><label className="text-sm flex gap-2"><input type="checkbox" checked={p.enabled} disabled={busy} onChange={e=>void perform(async()=>{await invoke('upsert_provider',{provider:{...p,enabled:e.target.checked}});await reload();})}/>{t('Enabled')}</label><button className={button} disabled={busy} onClick={()=>void perform(async()=>{await invoke('remove_provider',{id:p.id});await reload();})}>{t('Remove')}</button></div>
    <div className="grid gap-3 md:grid-cols-3"><Field label="Context window"><input className={input} type="number" min={1} max={4_294_967_295} value={p.context_window??''} placeholder={t('Not provided by API')} onChange={e=>setProviders(list=>list.map(m=>m.id===p.id?{...m,context_window:e.target.value?Number(e.target.value):null}:m))}/></Field><Field label="Max output tokens"><input className={input} type="number" min={1} max={p.context_window||4_294_967_295} value={p.max_output_tokens??''} placeholder={t('Not provided by API')} onChange={e=>setProviders(list=>list.map(m=>m.id===p.id?{...m,max_output_tokens:e.target.value?Number(e.target.value):null}:m))}/></Field><Field label="Priority"><input className={input} type="number" value={p.rank} onChange={e=>setProviders(list=>list.map(m=>m.id===p.id?{...m,rank:Number(e.target.value)}:m))}/></Field></div>
    <div className="flex gap-5 text-sm"><label className="flex gap-2"><input type="checkbox" checked={p.supports_images} onChange={e=>setProviders(list=>list.map(m=>m.id===p.id?{...m,supports_images:e.target.checked}:m))}/>{t('Image input')}</label><label className="flex gap-2"><input type="checkbox" checked={p.supports_audio??false} onChange={e=>setProviders(list=>list.map(m=>m.id===p.id?{...m,supports_audio:e.target.checked}:m))}/>{t('Audio input')}</label></div>
    <ModelSettingsControls provider={p} disabled={busy} onChange={next=>setProviders(list=>list.map(m=>m.id===p.id?next:m))}/>
    <button className={button} disabled={busy} onClick={()=>void perform(async()=>{const saved=prepareModelSettingsSave(p);validateProviderConfiguration(saved);await invoke('upsert_provider',{provider:saved});await reload();setFeedback(t('Model settings saved'));})}>{t('Save model settings')}</button>
  </div>;
  return <section className="space-y-4 rounded-lg border p-4" id="provider-models">
    {!hideHeader&&<><h2 className="text-lg font-semibold">{t('Providers and models')}</h2>
    <p className="text-sm text-muted-foreground">{t('Add an API key, fetch models, and save your selection. Each key has its own model list.')}</p></>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{feedback&&<p role="status" className="text-sm">{feedback}</p>}
    {!hideToolbar&&<><div className="flex flex-wrap gap-2">{kinds.map(([id,label])=><button key={id} className={kind===id?primary:button} aria-pressed={kind===id} onClick={()=>{setKind(id);close();}}>{t(label)}</button>)}</div>
    <button className={button} disabled={busy} onClick={()=>void perform(reload)}>{t('Refresh providers')}</button></>}
    {[...groups].map(([id,list])=><div key={id} className="space-y-3 rounded-lg bg-muted/30 p-3"><div className="flex items-center gap-3"><h3 className="font-medium flex-1">{list[0].display_name||BUILTIN_PROVIDERS.find(p=>p.id===list[0].preset)?.name||list[0].preset}</h3>{canManageProviderAccount(list[0])&&<button className={button} disabled={busy} onClick={()=>chooseAccount(accountFor(list[0]))}>{t('Manage models and API key')}</button>}</div>{list.sort((a,b)=>a.rank-b.rank).map(modelRow)}</div>)}
    {!account&&<div className="flex gap-2"><button className={primary} disabled={busy} onClick={create}>{t('Add provider or API key')}</button></div>}
    {account&&<div className="space-y-4 rounded-md border p-4">
      <Field label="Provider"><select className={input} value={options.some(p=>p.id===account.preset)?account.preset:'other'} disabled={busy} onChange={e=>{const p=options.find(p=>p.id===e.target.value);setAccount({...account,preset:p?.id??'other',provider_id:p?.id??'',base_url:p?.url??'',display_name:p?.name??''});setModels([]);}}>{options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}{source!=='system'&&<option value="other">{t('Other')}</option>}</select></Field>
      {!BUILTIN_PROVIDERS.some(p=>p.id===account.preset)&&<div className="grid gap-3 md:grid-cols-2"><Field label="Provider name"><input className={input} value={account.provider_name??''} onChange={e=>setAccount({...account,provider_name:e.target.value})}/></Field><Field label="Provider ID"><input className={input} value={account.provider_id} maxLength={128} onChange={e=>setAccount({...account,provider_id:e.target.value})}/></Field><Field label="Base URL"><input className={input} type="url" value={account.base_url} onChange={e=>setAccount({...account,base_url:e.target.value})}/></Field><p className="text-xs text-muted-foreground self-end">{t('Other providers use the OpenAI-compatible API.')}</p></div>}
      <Field label="Display name"><input className={input} value={account.display_name} placeholder={t('Name this API key or account')} onChange={e=>setAccount({...account,display_name:e.target.value})}/></Field>
      {account.preset!=='system-stt'&&<Field label="API key"><input className={input} type="password" autoComplete="new-password" value={key} placeholder={providers.some(p=>accountId(p)===account.credential_id&&p.secret_keys.length)?t('Leave blank to keep the saved key'):t('Enter API key')} onChange={e=>setKey(e.target.value)}/></Field>}
      <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy||!account.base_url||!account.credential_id} onClick={fetchModels}>{t('Fetch models')}</button><button className={button} disabled={busy} onClick={()=>openSelection(models)}>{t('Select models manually')}</button><button className={button} onClick={close}>{t('Cancel')}</button></div>
    </div>}
    <Dialog open={dialog} onOpenChange={open=>{if(!busy)setDialog(open);}}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{t('Select models')}</DialogTitle><DialogDescription>{t('Check model capabilities and token limits. Missing values can be entered manually.')}</DialogDescription></DialogHeader>
      <input className={input} aria-label={t('Search models')} placeholder={t('Search models')} value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>select(selected.length===models.length?[]:models.map(m=>m.id))}>{selected.length===models.length&&models.length?t('Deselect all'):t('Select all')}</button><button className={button} aria-label={t('Previous selection')} disabled={!history.current.canBack} onClick={()=>setSelected(history.current.back())}>←</button><button className={button} aria-label={t('Next selection')} disabled={!history.current.canForward} onClick={()=>setSelected(history.current.forward())}>→</button><span className="text-sm self-center">{t('{count} models selected',{count:selected.length})}</span></div>
      <div className="max-h-64 overflow-auto rounded-md border p-2 space-y-1">{models.filter(m=>(m.name+' '+m.id).toLowerCase().includes(search.toLowerCase())).map(m=><label key={m.id} className="flex items-start gap-2 p-2 text-sm cursor-pointer"><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>select(e.target.checked?[...selected,m.id]:selected.filter(id=>id!==m.id))}/><span className="break-all">{m.name}{m.name!==m.id&&<span className="block text-xs text-muted-foreground">{m.id}</span>}</span></label>)}</div>
      <div className="flex gap-2"><input className={input} value={manual} placeholder={t('Model ID')} onChange={e=>setManual(e.target.value)}/><button className={button} disabled={!manual.trim()} onClick={()=>{const id=manual.trim();if(!models.some(m=>m.id===id))setModels([...models,{id,name:id,context_window:null,max_output_tokens:null,supports_images:false,supports_audio:false}]);select([...selected,id]);setManual('');}}>{t('Add')}</button></div>
      {selectedModels.map(m=><fieldset key={m.id} className="rounded-md border p-3 space-y-2"><legend className="px-1 text-sm break-all">{m.name}</legend><div className="grid gap-3 sm:grid-cols-2"><Field label="Context window"><input className={input} type="number" min={1} max={4_294_967_295} value={m.context_window??''} placeholder={t('Not provided by API')} onChange={e=>setModel(m.id,{context_window:e.target.value?Number(e.target.value):null})}/></Field><Field label="Max output tokens"><input className={input} type="number" min={1} max={m.context_window||4_294_967_295} value={m.max_output_tokens??''} placeholder={t('Not provided by API')} onChange={e=>setModel(m.id,{max_output_tokens:e.target.value?Number(e.target.value):null})}/></Field></div><div className="flex gap-5 text-sm"><label className="flex gap-2"><input type="checkbox" checked={m.supports_images} onChange={e=>setModel(m.id,{supports_images:e.target.checked})}/>{t('Image input')}</label><label className="flex gap-2"><input type="checkbox" checked={m.supports_audio} onChange={e=>setModel(m.id,{supports_audio:e.target.checked})}/>{t('Audio input')}</label></div></fieldset>)}
      <div className="flex gap-2 justify-end"><button className={button} disabled={busy} onClick={()=>setDialog(false)}>{t('Cancel')}</button><button className={primary} disabled={busy||(!selected.length&&!providers.some(p=>accountId(p)===account?.credential_id&&p.kind===kind))} onClick={saveSelection}>{t('Save selected models')}</button></div>
    </DialogContent></Dialog>
  </section>;
}
