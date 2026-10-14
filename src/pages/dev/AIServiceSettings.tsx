import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {t,useI18n} from '@/lib/i18n';
import type {ProviderEntry} from '@/lib/overlay/provider-types';
import type {VisionSettings} from '@/lib/overlay/screen-context';
import {useServiceSnapshot} from '@/hooks/useServiceSnapshot';
import {VisionMethodSettings} from '@/pages/settings/components/VisionMethodSettings';
import {browserTtsProfileStore,type TtsSettings} from './tts-profiles';
const control='w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const primary='rounded-md border px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="grid gap-1.5 text-sm"><span className="font-medium">{t(label)}</span>{children}{hint&&<span className="text-xs text-muted-foreground">{t(hint)}</span>}</label>;}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange(value:boolean):void}) {return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/>{t(label)}</label>;}
function Section({title,children}:{title:string;children:ReactNode}) {return <section className="space-y-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">{t(title)}</h2>{children}</section>;}
function useSave() {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const act=async(action:()=>Promise<void>,success:string,failure:string)=>{setBusy(true);setError('');setFeedback('');try{await action();setFeedback(success);}catch(e){setError(e instanceof Error?e.message:failure);}finally{setBusy(false);}};
 return {busy,error,setError,feedback,act};
}
function Feedback({error,feedback}:{error:string;feedback:string}) {return <>{error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}{feedback&&<p role="status" className="text-sm">{t(feedback)}</p>}</>;}
export function VisionConfiguration({refreshKey=0}:{refreshKey?:number}) {
 useI18n();const {busy,error,setError,feedback,act}=useSave();
 const [vision,setVision]=useState<VisionSettings|null>(null),[registeredModels,setRegisteredModels]=useState<ProviderEntry[]>([]);
 const refreshRegisteredModels=()=>{void invoke<ProviderEntry[]>('list_providers').then(setRegisteredModels).catch(error=>setError(String(error)));};
 useEffect(()=>{let alive=true;void invoke<VisionSettings>('get_vision_settings').then(value=>{if(alive)setVision(value);}).catch(error=>{if(alive)setError(String(error));});return()=>{alive=false;};},[]);
 useEffect(()=>{let alive=true;void invoke<ProviderEntry[]>('list_providers').then(models=>{if(alive)setRegisteredModels(models);}).catch(error=>{if(alive)setError(String(error));});return()=>{alive=false;};},[refreshKey]);
 return <><Feedback error={error} feedback={feedback}/><fieldset disabled={busy||!vision} className="min-w-0">
      {vision && <Section title={t("Екран для текстових моделей")}><form className="space-y-4" onSubmit={event => {
        event.preventDefault(); void act(async () => { await invoke('update_vision_settings', { settings: vision }); setVision(await invoke<VisionSettings>('get_vision_settings')); }, 'Аналіз екрана збережено.', 'Не вдалося зберегти аналіз екрана.');
      }}>
        <VisionMethodSettings value={vision} onChange={setVision} providers={registeredModels} onRefresh={refreshRegisteredModels}/>
        <button className={primary} type="submit">{t("Зберегти аналіз екрана")}</button>
      </form></Section>}
 </fieldset></>;
}
export function TtsOutputSettings({backend}:{backend:TtsSettings['backend']}) {
 useI18n();const {snapshot}=useServiceSnapshot();const {busy,error,setError,feedback,act}=useSave();
 const profiles=useMemo(browserTtsProfileStore,[]);
 const [tts,setTts]=useState<TtsSettings|null>(null),[nativeSettings,setNativeSettings]=useState<TtsSettings|null>(null);
 useEffect(()=>{let alive=true;void invoke<TtsSettings>('get_tts_settings').then(settings=>{if(alive){setNativeSettings(settings);setTts(profiles.load(settings,backend));}}).catch(error=>{if(alive)setError(String(error));});return()=>{alive=false;};},[backend,profiles]);
 return <><Feedback error={error} feedback={feedback}/><fieldset disabled={busy||!tts} className="min-w-0">
      {tts && <Section title={t("Озвучення відповіді")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        if(!nativeSettings)return;
        const saved=await profiles.save(nativeSettings,tts,async settings=>{await invoke('update_tts_settings',{settings});setNativeSettings(settings);});
        setTts(saved);
      }, 'Налаштування озвучення збережено.', 'Не вдалося зберегти налаштування озвучення.'); }}>
        <p className="text-sm text-muted-foreground">{t('Save to activate this text-to-speech backend.')}</p>
        {backend==='piper'&&<p className="text-sm text-muted-foreground">{t('Local Piper needs an installed executable and an ONNX voice model. Whisper and Nemotron recognize speech; they do not generate voices.')}</p>}
        <Toggle label={t("Озвучення увімкнено")} checked={tts.enabled} onChange={enabled => setTts({ ...tts, enabled })} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={backend==='piper'?t('Piper voice model (.onnx)'):t("Голос")} hint={backend==='system'?t("Для системного голосу можна залишити порожнім."):undefined}><input className={control} list={backend==='system'?'system-voice-list':undefined} value={tts.voice} onChange={event => setTts({ ...tts, voice: event.target.value })} />{backend==='system'&&<datalist id="system-voice-list">{snapshot.tts.voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name} · {voice.language}</option>)}</datalist>}</Field>
          <Field label={t("Мова")}><input className={control} required value={tts.language} placeholder={'uk-UA'} onChange={event => setTts({ ...tts, language: event.target.value })} /></Field>
          <Field label={t("Швидкість")}><input className={control} type="number" min={0.5} max={2} step={0.1} required value={tts.rate} onChange={event => setTts({ ...tts, rate: Number(event.target.value) })} /></Field>
        </div>
        <Toggle label={t("Читати завершені речення під час надходження відповіді")} checked={tts.stream} onChange={stream => setTts({ ...tts, stream })} />
        {tts.backend === 'piper' && <Field label={t("Програма Piper")} hint={t("Встановіть Piper локально. У полі «Голос» укажіть шлях до .onnx моделі.")}><input className={control} value={tts.piper_executable} onChange={event => setTts({ ...tts, piper_executable: event.target.value })} /></Field>}
        <button className={primary} type="submit">{t("Зберегти озвучення")}</button>
      </form></Section>}
 </fieldset></>;
}
