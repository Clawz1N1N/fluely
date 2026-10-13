import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from '@/lib/i18n';
import {DEFAULT_SLEEP_SETTINGS,type SleepSettings as Config} from '@/lib/overlay/sleep';
interface Output{id:string;name:string;is_default:boolean}
interface Receipt{device_name:string;playback_id:string}
const control='w-full rounded-md border border-input bg-background p-2 text-sm';
const button='rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-40';
export function SleepSettings(){
  const {t}=useI18n();const[config,setConfig]=useState<Config>({...DEFAULT_SLEEP_SETTINGS});const[outputs,setOutputs]=useState<Output[]>([]);
  const[busy,setBusy]=useState(true);const[loaded,setLoaded]=useState(false);const[error,setError]=useState('');const[feedback,setFeedback]=useState('');
  const alive=useRef(false);const lease=useRef<string|undefined>(undefined);const revision=useRef(0);
  const load=async()=>{const ticket=++revision.current;setBusy(true);setError('');try{const[settings,devices]=await Promise.all([invoke<Config>('get_sleep_settings'),invoke<Output[]>('list_alarm_outputs')]);if(alive.current&&ticket===revision.current){setConfig(settings);setOutputs(devices);setLoaded(true);}}catch(e){if(alive.current&&ticket===revision.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current&&ticket===revision.current)setBusy(false);}};
  useEffect(()=>{alive.current=true;revision.current++;void load();return()=>{alive.current=false;revision.current++;if(lease.current)void invoke('stop_sleep_alarm',{playbackId:lease.current}).catch(()=>{});};},[]);
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setFeedback('');try{await task();}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}};
  const save=async()=>{await invoke('save_sleep_settings',{settings:config});if(alive.current)setFeedback(t('Sleep settings saved'));};
  const test=async()=>{await save();const result=await invoke<Receipt>('test_sleep_alarm');if(!alive.current){await invoke('stop_sleep_alarm',{playbackId:result.playback_id});return;}lease.current=result.playback_id;setFeedback(t('Alarm playing through {device}',{device:result.device_name}));};
  const change=(value:Partial<Config>)=>{setConfig(current=>({...current,...value}));setFeedback('');};
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="font-medium">{t('Sleep mode')}</h2>
    <p className="text-sm text-muted-foreground">{t('The crescent button stops screen capture, microphone and ordinary actions. System audio continues through STT and AI. An exact alarm code in the AI response plays your track on the selected output.')}</p>
    {error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}{feedback&&<p role="status" className="text-sm">{feedback}</p>}
    {!loaded?<button type="button" className={button} disabled={busy} onClick={()=>void load()}>{t('Retry')}</button>:<fieldset disabled={busy} className="space-y-3">
      <label className="grid gap-1 text-sm">{t('Sleep prompt')}<textarea className={control} rows={4} value={config.prompt} onChange={e=>change({prompt:e.target.value})}/></label>
      <label className="grid gap-1 text-sm">{t('Alarm code')}<input className={control} value={config.alarm_code} onChange={e=>change({alarm_code:e.target.value})}/></label>
      <label className="grid gap-1 text-sm">{t('Alarm track')}<input className={control} value={config.track_path} placeholder={t('Choose a WAV, MP3, OGG or FLAC track')} onChange={e=>change({track_path:e.target.value})}/></label>
      <button type="button" className={button} onClick={()=>void run(async()=>{const path=await invoke<string|null>('pick_sleep_track');if(path&&alive.current)change({track_path:path});})}>{t('Choose track')}</button>
      <label className="grid gap-1 text-sm">{t('Alarm output device')}<select className={control} value={config.output_device} onChange={e=>change({output_device:e.target.value})}><option value="">{t('System default output')}</option>{outputs.map(output=><option key={output.id} value={output.id}>{output.name}</option>)}{config.output_device&&!outputs.some(output=>output.id===config.output_device)&&<option value={config.output_device}>{t('Selected output is unavailable')}</option>}</select></label>
      <p className="text-xs text-muted-foreground">{t('An unavailable selected output raises an error instead of playing through a different device.')}</p>
      <label className="grid gap-1 text-sm">{t('Alarm volume')} · {Math.round(config.volume*100)}%<input type="range" min="0" max="1" step="0.01" value={config.volume} onChange={e=>change({volume:Number(e.target.value)})}/></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>void run(save)}>{t('Save')}</button><button type="button" className={button} disabled={!config.track_path} onClick={()=>void run(test)}>{t('Test alarm')}</button><button type="button" className={button} onClick={()=>void run(async()=>{await invoke('stop_sleep_alarm');lease.current=undefined;setFeedback(t('Alarm stopped'));})}>{t('Stop alarm')}</button><button type="button" className={button} onClick={()=>void run(async()=>{const devices=await invoke<Output[]>('list_alarm_outputs');if(alive.current)setOutputs(devices);})}>{t('Refresh outputs')}</button></div>
    </fieldset>}
  </section>;
}
