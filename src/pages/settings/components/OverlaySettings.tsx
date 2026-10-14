import {t,useI18n} from '@/lib/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ShellSettings } from '@/lib/overlay/contracts';
import { ACTION_LABELS,SHELL_ACTIONS } from '@/components/Shell/ShellControls';

interface CaptureSettings {
  mode: 'manual' | 'interval' | 'after_speech'; interval: number; monitor: string;
  max_frames: number; max_long_side: number; jpeg_quality: number; dedup_threshold: number;
  max_wait_secs: number; microphone: boolean; system_audio: boolean;
}
const control = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const button = 'rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary/90`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{t(label)}</span>{children}{hint && <span className="text-xs text-muted-foreground">{t(hint)}</span>}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{t(label)}</label>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">{t(title)}</h2>{children}</section>;
}
export function OverlaySettings({section='general'}:{section?:'general'|'reasoning'}={}) {
  const {language}=useI18n();
  const tr=(en:string,uk:string,ru:string)=>language==='uk'?uk:language==='ru'?ru:en;
  const [capture, setCapture] = useState<CaptureSettings | null>(null);
  const [shell, setShell] = useState<ShellSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const appearanceTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const appearanceQueue=useRef<Promise<unknown>>(Promise.resolve());
  const applyAppearance=(settings:ShellSettings)=>{
    const next=appearanceQueue.current.catch(()=>{}).then(()=>invoke('set_shell_appearance',{settings}));
    appearanceQueue.current=next;
    return next;
  };
  const previewAppearance=(settings:ShellSettings)=>{
    setShell(settings);clearTimeout(appearanceTimer.current);
    appearanceTimer.current=setTimeout(()=>{
      void applyAppearance(settings).then(()=>setError('')).catch(()=>setError(t('Не вдалося застосувати всі налаштування інтерфейсу.')));
    },180);
  };
  useEffect(()=>()=>clearTimeout(appearanceTimer.current),[]);

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([
      invoke<CaptureSettings>('get_capture_settings'), invoke<ShellSettings>('get_shell_settings'),
    ]).then(([captureResult, shellResult]) => {
      if (!mounted) return;
      if (captureResult.status === 'fulfilled') setCapture(captureResult.value);
      if (shellResult.status === 'fulfilled') setShell(shellResult.value);
      if ([captureResult, shellResult].some(result => result.status === 'rejected')) setError(t("Не вдалося завантажити частину налаштувань. Відкрийте цю сторінку повторно."));
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
      {section==='general'&&capture && <Section title={t("Знімки екрана й аудіо")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
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
      {section==='general'&&shell && <Section title={t("Вигляд накладеного інтерфейсу")}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        clearTimeout(appearanceTimer.current);
        await applyAppearance(shell);
        setShell(await invoke<ShellSettings>('get_shell_settings'));
      }, 'Вигляд інтерфейсу збережено.', 'Не вдалося застосувати всі налаштування інтерфейсу.'); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("Розташування керування")}><select className={control} value={shell.ui_mode} onChange={event => previewAppearance({ ...shell, ui_mode: event.target.value as ShellSettings['ui_mode'] })}><option value="sidestrips">{t("Бічні смуги")}</option><option value="topbottomstrips">{t("Верхня та нижня смуги")}</option><option value="buttons">{t("Окремі кнопки")}</option><option value="custom">{t("Custom layout")}</option></select></Field>
          <Field label={t("Період переливання, секунд")}><input className={control} type="number" min={1} max={20} step={1} required value={shell.shimmer_speed} onChange={event => previewAppearance({ ...shell, shimmer_speed: Number(event.target.value) })} /></Field>
          <Field label={tr('Chat transparency','Прозорість чату','Прозрачность чата')+`: ${Math.round((1-shell.answer_opacity)*100)}%`} hint={t("У режимі переміщення чат стає непрозорим.")}><input type="range" min={0} max={85} step={1} value={Math.round((1-shell.answer_opacity)*100)} onChange={event => previewAppearance({ ...shell, answer_opacity: 1-Number(event.target.value)/100 })} /></Field>
          <Field label={tr('Strip and group transparency','Прозорість смуг і груп','Прозрачность полос и групп')+`: ${Math.round((1-shell.strip_opacity)*100)}%`}><input type="range" min={0} max={95} step={1} value={Math.round((1-shell.strip_opacity)*100)} onChange={event=>previewAppearance({...shell,strip_opacity:1-Number(event.target.value)/100})}/></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{SHELL_ACTIONS.map(action=><Field key={action} label={t('Button "{action}" transparency: {percent}%',{action:t(ACTION_LABELS[action]),percent:Math.round((1-(shell.button_opacities[action]??0.28))*100)})}><input type="range" min={0} max={95} step={1} value={Math.round((1-(shell.button_opacities[action]??0.28))*100)} onChange={event=>previewAppearance({...shell,button_opacities:{...shell.button_opacities,[action]:1-Number(event.target.value)/100}})}/></Field>)}</div>
        <p className="text-sm text-muted-foreground">{t("Чат пропускає кліки. Натисніть Shift + \\ для переміщення, зміни розміру й введення. Повторне натискання або Escape повертає прозорий режим. Окрему комбінацію «Переміщення та взаємодія з чатом» можна змінити на сторінці гарячих клавіш.")}</p>
        <p className="text-xs text-muted-foreground">{tr('Changes apply immediately. Group transparency updates all custom groups; adjust individual groups in the layout editor.','Зміни застосовуються одразу. Прозорість груп оновлює всі власні групи; кожну окремо можна налаштувати в редакторі макету.','Изменения применяются сразу. Прозрачность групп обновляет все свои группы; каждую отдельно можно настроить в редакторе макета.')}</p>
        <Toggle label={t("Переливання кольорів")} checked={shell.shimmer} onChange={shimmer => previewAppearance({ ...shell, shimmer })} />
        <button className={primary} type="submit">{t("Зберегти вигляд")}</button>
      </form></Section>}
    </fieldset>
  </div>;
}
