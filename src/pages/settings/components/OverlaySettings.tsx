import {t,useI18n} from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from '@/config';
import { DEFAULT_STRUCTURED_PROMPT } from '@/lib/overlay/structured';
import type { ProviderStatus, RequestLimits } from '@/lib/overlay/provider-types';
import { UNLIMITED } from '@/lib/overlay/provider-types';
import { ProviderModels } from './ProviderModels';
import {VisionMethodSettings} from './VisionMethodSettings';
import type {ProviderEntry} from '@/lib/overlay/provider-types';
import type { VisionSettings } from '@/lib/overlay/screen-context';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import type { ShellSettings } from '@/lib/overlay/contracts';
import { ACTION_LABELS,SHELL_ACTIONS } from '@/components/Shell/ShellControls';

interface CaptureSettings {
  mode: 'manual' | 'interval' | 'after_speech'; interval: number; monitor: string;
  max_frames: number; max_long_side: number; jpeg_quality: number; dedup_threshold: number;
  max_wait_secs: number; microphone: boolean; system_audio: boolean;
}
interface TtsSettings { backend: 'system' | 'piper' | 'cloud'; enabled: boolean; voice: string; language: string; rate: number; stream: boolean;piper_executable:string }
const control = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const button = 'rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary/90`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{t(label)}</span>{children}{hint && <span className="text-xs text-muted-foreground">{t(hint)}</span>}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{t(label)}</label>;
}
function Limits({ value, onChange }: { value: RequestLimits; onChange(value: RequestLimits): void }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{([
    ['per_second', t("За секунду")], ['per_minute', t("За хвилину")], ['per_hour', t("За годину")], ['per_day', t("За добу")],
  ] as const).map(([key, label]) => <Field key={key} label={label}><input className={control} type="number" min={0} max={4_294_967_295} step={1} required value={value[key]} onChange={event => onChange({ ...value, [key]: Number(event.target.value) })} /></Field>)}</div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">{t(title)}</h2>{children}</section>;
}
export function OverlaySettings() {
  useI18n();
  const {snapshot}=useServiceSnapshot();
  const [globalLimits, setGlobalLimits] = useState<RequestLimits>({ ...UNLIMITED });
  const [manualNeutral, setManualNeutral] = useState(false);
  const [capture, setCapture] = useState<CaptureSettings | null>(null);
  const [tts, setTts] = useState<TtsSettings | null>(null);
  const [shell, setShell] = useState<ShellSettings | null>(null);
  const [vision, setVision] = useState<VisionSettings | null>(null);
  const [registeredModels,setRegisteredModels]=useState<ProviderEntry[]>([]);
  const refreshRegisteredModels=()=>{void invoke<ProviderEntry[]>('list_providers').then(setRegisteredModels).catch(()=>{});};
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) ?? DEFAULT_SYSTEM_PROMPT);
  const [structuredPrompt, setStructuredPrompt] = useState(() => localStorage.getItem('structured_output_prompt') ?? DEFAULT_STRUCTURED_PROMPT);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    refreshRegisteredModels();
    let mounted = true;
    void Promise.allSettled([
      invoke<ProviderStatus>('get_providers_status', { kind: 'brain' }),
      invoke<CaptureSettings>('get_capture_settings'), invoke<TtsSettings>('get_tts_settings'), invoke<ShellSettings>('get_shell_settings'),
      invoke<VisionSettings>('get_vision_settings'),
    ]).then(([registry, captureResult, ttsResult, shellResult, visionResult]) => {
      if (!mounted) return;
      if (registry.status === 'fulfilled') { setGlobalLimits(registry.value.globalLimits); setManualNeutral(registry.value.manualNeutral); }
      if (visionResult.status === 'fulfilled') setVision(visionResult.value);
      if (captureResult.status === 'fulfilled') setCapture(captureResult.value);
      if (ttsResult.status === 'fulfilled') setTts(ttsResult.value);
      if (shellResult.status === 'fulfilled') setShell(shellResult.value);
      if ([registry, captureResult, ttsResult, shellResult].some(result => result.status === 'rejected')) setError(t("Не вдалося завантажити частину налаштувань. Відкрийте цю сторінку повторно."));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const act = async (action: () => Promise<void>, success: string, failure: string) => {
    setBusy(true); setError(''); setFeedback('');
    try { await action(); setFeedback(success); } catch { setError(failure); }
    finally { setBusy(false); }
  };
  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{t(error)}</div>}
    {feedback && <div role="status" className="rounded-md bg-primary/10 p-3 text-sm">{t(feedback)}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("Завантаження налаштувань…")}</p>}
    <fieldset disabled={busy || loading} className="min-w-0 space-y-6">
      <ProviderModels />
      <Section title={t("Спільні ліміти й нейтральний режим")}>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
          await invoke('set_global_limits', { limits: globalLimits }); await invoke('set_neutral_mode', { enabled: manualNeutral });
        }, 'Спільні ліміти збережено.', 'Не вдалося зберегти спільні ліміти.'); }}>
          <p className="text-sm text-muted-foreground">{t("Спільний бюджет для всіх провайдерів. 0 — без обмежень; використані запити враховуються за останню секунду, хвилину, годину та добу.")}</p>
          <Limits value={globalLimits} onChange={setGlobalLimits} />
          <Toggle label={t("Нейтральний режим: призупинити всі запити")} checked={manualNeutral} onChange={setManualNeutral} />
          <button type="submit" className={primary}>{t("Зберегти ліміти")}</button>
        </form>
      </Section>
      {capture && <Section title={t("Знімки екрана й аудіо")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('update_capture_settings', { settings: capture }); setCapture(await invoke<CaptureSettings>('get_capture_settings'));
      }, 'Налаштування знімків та аудіо збережено.', 'Не вдалося зберегти налаштування знімків та аудіо.'); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("Режим знімків")}><select className={control} value={capture.mode} onChange={event => setCapture({ ...capture, mode: event.target.value as CaptureSettings['mode'] })}><option value="manual">{t("Вручну")}</option><option value="interval">{t("Через інтервал")}</option><option value="after_speech">{t("Після мовлення")}</option></select></Field>
          <Field label={t("Інтервал, секунд")}><input className={control} type="number" min={2} max={3600} step={1} required value={capture.interval} onChange={event => setCapture({ ...capture, interval: Number(event.target.value) })} /></Field>
          <Field label={t("Екран")}><select className={control} value={['primary', 'all'].includes(capture.monitor) ? capture.monitor : 'id'} onChange={event => setCapture({ ...capture, monitor: event.target.value === 'id' ? '0' : event.target.value })}><option value="primary">{t("Основний екран")}</option><option value="all">{t("Усі екрани")}</option><option value="id">{t("За ідентифікатором")}</option></select></Field>
          {!['primary', 'all'].includes(capture.monitor) && <Field label={t("Ідентифікатор екрана")}><input className={control} required value={capture.monitor} onChange={event => setCapture({ ...capture, monitor: event.target.value })} /></Field>}
          <Field label={t("Максимум кадрів у запиті")}><input className={control} type="number" min={1} max={10} step={1} required value={capture.max_frames} onChange={event => setCapture({ ...capture, max_frames: Number(event.target.value) })} /></Field>
          <Field label={t("Довша сторона знімка, пікселів")}><input className={control} type="number" min={256} max={4096} step={1} required value={capture.max_long_side} onChange={event => setCapture({ ...capture, max_long_side: Number(event.target.value) })} /></Field>
          <Field label={t("Якість JPEG, %")}><input className={control} type="number" min={1} max={100} step={1} required value={capture.jpeg_quality} onChange={event => setCapture({ ...capture, jpeg_quality: Number(event.target.value) })} /></Field>
          <Field label={t("Поріг зміни зображення (0–1)")}><input className={control} type="number" min={0} max={1} step={0.01} required value={capture.dedup_threshold} onChange={event => setCapture({ ...capture, dedup_threshold: Number(event.target.value) })} /></Field>
          <Field label={t("Максимальне очікування, секунд")}><input className={control} type="number" min={2} max={3600} step={1} required value={capture.max_wait_secs} onChange={event => setCapture({ ...capture, max_wait_secs: Number(event.target.value) })} /></Field>
        </div>
        <div className="flex flex-wrap gap-4"><Toggle label={t("Мікрофон")} checked={capture.microphone} onChange={microphone => setCapture({ ...capture, microphone })} /><Toggle label={t("Звук системи")} checked={capture.system_audio} onChange={system_audio => setCapture({ ...capture, system_audio })} /></div>
        <button className={primary} type="submit">{t("Зберегти знімки й аудіо")}</button>
      </form></Section>}
      {vision && <Section title={t("Екран для текстових моделей")}><form className="space-y-4" onSubmit={event => {
        event.preventDefault(); void act(async () => { await invoke('update_vision_settings', { settings: vision }); setVision(await invoke<VisionSettings>('get_vision_settings')); }, 'Аналіз екрана збережено.', 'Не вдалося зберегти аналіз екрана.');
      }}>
        <VisionMethodSettings value={vision} onChange={setVision} providers={registeredModels} onRefresh={refreshRegisteredModels}/>
        <button className={primary} type="submit">{t("Зберегти аналіз екрана")}</button>
      </form></Section>}
      {tts && <Section title={t("Озвучення відповіді")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('update_tts_settings', { settings: tts }); setTts(await invoke<TtsSettings>('get_tts_settings'));
      }, 'Налаштування озвучення збережено.', 'Не вдалося зберегти налаштування озвучення.'); }}>
        <Toggle label={t("Озвучення увімкнено")} checked={tts.enabled} onChange={enabled => setTts({ ...tts, enabled })} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("Спосіб озвучення")}><select className={control} value={tts.backend} onChange={event => setTts({ ...tts, backend: event.target.value as TtsSettings['backend'] })}><option value="system">{t("Системний голос")}</option><option value="piper">{t("Piper — локальний голос")}</option><option value="cloud">{t("Хмарний провайдер TTS")}</option></select></Field>
          <Field label={t("Голос")} hint={t("Для системного голосу можна залишити порожнім.")}><input className={control} list="system-voice-list" value={tts.voice} onChange={event => setTts({ ...tts, voice: event.target.value })} /><datalist id="system-voice-list">{snapshot.tts.voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name} · {voice.language}</option>)}</datalist></Field>
          <Field label={t("Мова")}><input className={control} required value={tts.language} placeholder={'uk-UA'} onChange={event => setTts({ ...tts, language: event.target.value })} /></Field>
          <Field label={t("Швидкість")}><input className={control} type="number" min={0.5} max={2} step={0.1} required value={tts.rate} onChange={event => setTts({ ...tts, rate: Number(event.target.value) })} /></Field>
        </div>
        <Toggle label={t("Читати завершені речення під час надходження відповіді")} checked={tts.stream} onChange={stream => setTts({ ...tts, stream })} />
        {tts.backend === 'piper' && <Field label={t("Програма Piper")} hint={t("Встановіть Piper локально. У полі «Голос» укажіть шлях до .onnx моделі.")}><input className={control} value={tts.piper_executable} onChange={event => setTts({ ...tts, piper_executable: event.target.value })} /></Field>}
        <button className={primary} type="submit">{t("Зберегти озвучення")}</button>
      </form></Section>}
      {shell && <Section title={t("Вигляд накладеного інтерфейсу")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('set_ui_mode', { mode: shell.ui_mode }); await invoke('set_shimmer', { enabled: shell.shimmer });
        await invoke('set_shimmer_speed', { speed: shell.shimmer_speed }); await invoke('set_answer_opacity', { opacity: shell.answer_opacity });
        await invoke('set_shell_opacity',{label:'strips',opacity:shell.strip_opacity});
        for(const action of SHELL_ACTIONS)await invoke('set_shell_opacity',{label:action,opacity:shell.button_opacities[action]??0.28});
        setShell(await invoke<ShellSettings>('get_shell_settings'));
      }, 'Вигляд інтерфейсу збережено.', 'Не вдалося застосувати всі налаштування інтерфейсу.'); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("Розташування керування")}><select className={control} value={shell.ui_mode} onChange={event => setShell({ ...shell, ui_mode: event.target.value as ShellSettings['ui_mode'] })}><option value="sidestrips">{t("Бічні смуги")}</option><option value="topbottomstrips">{t("Верхня та нижня смуги")}</option><option value="buttons">{t("Окремі кнопки")}</option><option value="custom">{t("Custom layout")}</option></select></Field>
          <Field label={t("Період переливання, секунд")}><input className={control} type="number" min={1} max={20} step={1} required value={shell.shimmer_speed} onChange={event => setShell({ ...shell, shimmer_speed: Number(event.target.value) })} /></Field>
          <Field label={`Прозорість чату: ${Math.round((1-shell.answer_opacity)*100)}%`} hint={t("У режимі переміщення чат стає непрозорим.")}><input type="range" min={0} max={85} step={1} value={Math.round((1-shell.answer_opacity)*100)} onChange={event => setShell({ ...shell, answer_opacity: 1-Number(event.target.value)/100 })} /></Field>
          <Field label={`Прозорість смуг: ${Math.round((1-shell.strip_opacity)*100)}%`}><input type="range" min={0} max={95} step={1} value={Math.round((1-shell.strip_opacity)*100)} onChange={event=>setShell({...shell,strip_opacity:1-Number(event.target.value)/100})}/></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{SHELL_ACTIONS.map(action=><Field key={action} label={t('Button "{action}" transparency: {percent}%',{action:t(ACTION_LABELS[action]),percent:Math.round((1-(shell.button_opacities[action]??0.28))*100)})}><input type="range" min={0} max={95} step={1} value={Math.round((1-(shell.button_opacities[action]??0.28))*100)} onChange={event=>setShell({...shell,button_opacities:{...shell.button_opacities,[action]:1-Number(event.target.value)/100}})}/></Field>)}</div>
        <p className="text-sm text-muted-foreground">{t("Чат пропускає кліки. Натисніть Shift + \\ для переміщення, зміни розміру й введення. Повторне натискання або Escape повертає прозорий режим. Окрему комбінацію «Переміщення та взаємодія з чатом» можна змінити на сторінці гарячих клавіш.")}</p>
        <Toggle label={t("Переливання кольорів")} checked={shell.shimmer} onChange={shimmer => setShell({ ...shell, shimmer })} />
        <button className={primary} type="submit">{t("Зберегти вигляд")}</button>
      </form></Section>}
      <Section title={t("Інструкції для моделі")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt); localStorage.setItem('structured_output_prompt', structuredPrompt);
      }, 'Інструкції збережено.', 'Не вдалося зберегти інструкції.'); }}>
        <Field label={t("Системна інструкція")}><textarea className={`${control} min-h-36`} value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} /></Field>
        <Field label={t("Структура відповіді")} hint={t("Залиште теги <main>, <side> і <speak>, щоб розділити розв’язок, пояснення та озвучення.")}><textarea className={`${control} min-h-36`} value={structuredPrompt} onChange={event => setStructuredPrompt(event.target.value)} /></Field>
        <button className={primary} type="submit">{t("Зберегти інструкції")}</button>
      </form></Section>
    </fieldset>
  </div>;
}
