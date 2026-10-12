import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from '@/config';
import { DEFAULT_STRUCTURED_PROMPT } from '@/lib/overlay/structured';
import type { ProviderEntry, ProviderKind, ProviderStatus, RequestLimits } from '@/lib/overlay/provider-types';
import { UNLIMITED } from '@/lib/overlay/provider-types';
import { getSecret, setSecret } from '@/lib/storage/secure.storage';
import { PROVIDER_PRESETS, parseProviderVariables, saveProviderConfiguration } from './provider-config';
import type { VisionSettings } from '@/lib/overlay/screen-context';
import { fetchProviderModels } from '@/lib/overlay/provider-engine';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';

interface CaptureSettings {
  mode: 'manual' | 'interval' | 'after_speech'; interval: number; monitor: string;
  max_frames: number; max_long_side: number; jpeg_quality: number; dedup_threshold: number;
  max_wait_secs: number; microphone: boolean; system_audio: boolean;
}
interface TtsSettings { backend: 'system' | 'piper' | 'cloud'; enabled: boolean; voice: string; language: string; rate: number; stream: boolean;piper_executable:string }
interface ShellSettings { ui_mode: 'sidestrips' | 'topbottomstrips' | 'buttons'; shimmer: boolean; shimmer_speed: number; answer_opacity: number }
const kinds: Array<{ id: ProviderKind; label: string }> = [
  { id: 'brain', label: 'Мислення' }, { id: 'stt', label: 'Розпізнавання мовлення' },
  { id: 'tts', label: 'Озвучення' }, { id: 'vision', label: 'Аналіз зображень' },
];
const control = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const button = 'rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary/90`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}
function Limits({ value, onChange }: { value: RequestLimits; onChange(value: RequestLimits): void }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{([
    ['per_second', 'За секунду'], ['per_minute', 'За хвилину'], ['per_hour', 'За годину'], ['per_day', 'За добу'],
  ] as const).map(([key, label]) => <Field key={key} label={label}><input className={control} type="number" min={0} max={4_294_967_295} step={1} required value={value[key]} onChange={event => onChange({ ...value, [key]: Number(event.target.value) })} /></Field>)}</div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
function newProvider(kind: ProviderKind): ProviderEntry {
  const preset = PROVIDER_PRESETS.find(p => p.id === 'openai-compatible')!;
  return {
    id: `${kind}-${crypto.randomUUID()}`, kind, preset: preset.id, base_url: preset.url,
    model: kind === 'stt' ? 'whisper-1' : kind === 'tts' ? 'tts-1' : preset.model,
    rank: 0, enabled: true, supports_images: kind === 'brain' || kind === 'vision',
    limit_per_second: 0, limit_per_minute: 0, limit_per_hour: 0, limit_per_day: 0,
    curl: null, streaming: true, response_content_path: kind === 'stt' ? 'text' : 'choices[0].message.content', variables: {}, secret_keys: [],
  };
}

export function OverlaySettings() {
  const {snapshot}=useServiceSnapshot();
  const [models,setModels]=useState<string[]>([]);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [kind, setKind] = useState<ProviderKind>('brain');
  const [editor, setEditor] = useState<ProviderEntry | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [variables, setVariables] = useState('{}');
  const [globalLimits, setGlobalLimits] = useState<RequestLimits>({ ...UNLIMITED });
  const [manualNeutral, setManualNeutral] = useState(false);
  const [capture, setCapture] = useState<CaptureSettings | null>(null);
  const [tts, setTts] = useState<TtsSettings | null>(null);
  const [shell, setShell] = useState<ShellSettings | null>(null);
  const [vision, setVision] = useState<VisionSettings | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) ?? DEFAULT_SYSTEM_PROMPT);
  const [structuredPrompt, setStructuredPrompt] = useState(() => localStorage.getItem('structured_output_prompt') ?? DEFAULT_STRUCTURED_PROMPT);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([
      invoke<ProviderStatus>('get_providers_status', { kind: 'brain' }),
      invoke<CaptureSettings>('get_capture_settings'), invoke<TtsSettings>('get_tts_settings'), invoke<ShellSettings>('get_shell_settings'),
      invoke<VisionSettings>('get_vision_settings'), invoke<ProviderEntry[]>('list_providers'),
    ]).then(([registry, captureResult, ttsResult, shellResult, visionResult, providerResult]) => {
      if (!mounted) return;
      if (registry.status === 'fulfilled') { setGlobalLimits(registry.value.globalLimits); setManualNeutral(registry.value.manualNeutral); }
      if (providerResult.status === 'fulfilled') setProviders(providerResult.value);
      if (visionResult.status === 'fulfilled') setVision(visionResult.value);
      if (captureResult.status === 'fulfilled') setCapture(captureResult.value);
      if (ttsResult.status === 'fulfilled') setTts(ttsResult.value);
      if (shellResult.status === 'fulfilled') setShell(shellResult.value);
      if ([registry, captureResult, ttsResult, shellResult].some(result => result.status === 'rejected')) setError('Не вдалося завантажити частину налаштувань. Відкрийте цю сторінку повторно.');
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const act = async (action: () => Promise<void>, success: string, failure: string) => {
    setBusy(true); setError(''); setFeedback('');
    try { await action(); setFeedback(success); } catch { setError(failure); }
    finally { setBusy(false); }
  };
  const openEditor = (provider: ProviderEntry) => {
    // Existing credential values are never read into the editor.
    setEditor({ ...provider }); setApiKey(''); setVariables(JSON.stringify(provider.variables, null, 2));
  };
  const closeEditor = () => { setEditor(null); setApiKey(''); setVariables('{}'); };
  const changeKind = (next: ProviderKind) => { setKind(next); closeEditor(); };
  const changePreset = (id: string) => {
    const preset = PROVIDER_PRESETS.find(p => p.id === id);
    if (!editor || !preset) return;
    setEditor({ ...editor, preset: preset.id, base_url: preset.url,
      model: preset.id === 'system-stt' ? 'default' : preset.id === 'google' ? (editor.kind === 'tts' ? 'gemini-2.5-flash-preview-tts' : 'gemini-2.5-flash') : editor.kind === 'stt' ? 'whisper-1' : editor.kind === 'tts' ? 'tts-1' : preset.model,
      curl: preset.id === 'custom' ? editor.curl ?? '' : null });
  };
  const saveProvider = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const metadata = { ...editor, variables: parseProviderVariables(variables) };
      await saveProviderConfiguration(metadata, apiKey, { setSecret, getSecret, upsert: provider => invoke('upsert_provider', { provider }) });
      setApiKey('');
      setProviders(await invoke<ProviderEntry[]>('list_providers'));
      closeEditor(); setFeedback('Провайдера збережено.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не вдалося зберегти провайдера. Перевірте адресу, модель та шаблон cURL; ключі в шаблоні мають бути змінними.');
    } finally { setBusy(false); }
  };
  const removeProvider = (id: string) => void act(async () => {
    await invoke('remove_provider', { id }); setProviders(await invoke<ProviderEntry[]>('list_providers')); if (editor?.id === id) closeEditor();
  }, 'Провайдера видалено.', 'Не вдалося видалити провайдера.');

  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}
    {feedback && <div role="status" className="rounded-md bg-primary/10 p-3 text-sm">{feedback}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Завантаження налаштувань…</p>}
    <fieldset disabled={busy || loading} className="min-w-0 space-y-6">
      <Section title="Провайдери й моделі">
        <p className="text-sm text-muted-foreground">Нижчий пріоритет означає першу спробу. Після помилки або вичерпання ліміту наступна модель підхоплює запит.</p>
        <div className="flex flex-wrap gap-2">{kinds.map(item => <button key={item.id} type="button" aria-pressed={kind === item.id} className={kind === item.id ? primary : button} onClick={() => changeKind(item.id)}>{item.label}</button>)}</div>
        <div className="space-y-2">{providers.filter(p => p.kind === kind).sort((a, b) => a.rank - b.rank).map(provider => <div key={provider.id} className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3">
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{provider.model}</p><p className="break-all text-xs text-muted-foreground">{provider.base_url} · пріоритет {provider.rank} · {provider.enabled ? 'увімкнено' : 'вимкнено'}</p></div>
          <button type="button" className={button} onClick={() => openEditor(provider)}>Змінити</button><button type="button" className={button} onClick={() => removeProvider(provider.id)}>Видалити</button>
        </div>)}{!providers.some(p => p.kind === kind) && <p className="text-sm text-muted-foreground">Провайдерів цього типу ще немає.</p>}</div>
        {!editor && <button type="button" className={primary} onClick={() => openEditor(newProvider(kind))}>Додати провайдера</button>}
        {editor && <form onSubmit={saveProvider} className="space-y-4 rounded-md border p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Шаблон сервісу"><select className={control} value={editor.preset} onChange={event => changePreset(event.target.value)}>{PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}{!PROVIDER_PRESETS.some(p => p.id === editor.preset) && <option value={editor.preset}>{editor.preset}</option>}</select></Field>
            <Field label="Модель"><input className={control} list="provider-model-list" required value={editor.model} onChange={event => setEditor({ ...editor, model: event.target.value })} /><datalist id="provider-model-list">{models.map(model=><option key={model} value={model}/>)}</datalist><button type="button" className={button} onClick={()=>void act(async()=>{setModels(await fetchProviderModels(editor,apiKey||undefined));},'Список моделей завантажено. Виберіть модель у полі вище.','Не вдалося отримати список моделей. Перевірте адресу та ключ.')}>Завантажити моделі</button></Field>
            <Field label="Базова URL-адреса"><input className={control} type="url" required value={editor.base_url} onChange={event => setEditor({ ...editor, base_url: event.target.value })} /></Field>
            <Field label="Пріоритет"><input className={control} type="number" step={1} required value={editor.rank} onChange={event => setEditor({ ...editor, rank: Number(event.target.value) })} /></Field>
          </div>
          <Field label="API-ключ" hint="Ключ зберігається в захищеному сховищі. Порожнє поле залишає наявний ключ."><input className={control} type="password" autoComplete="new-password" value={apiKey} placeholder={editor.secret_keys.includes('API_KEY') ? 'Ключ уже збережено' : 'Введіть ключ, якщо потрібен'} onChange={event => setApiKey(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-4"><Toggle label="Провайдер увімкнений" checked={editor.enabled} onChange={enabled => setEditor({ ...editor, enabled })} /><Toggle label="Підтримує зображення" checked={editor.supports_images} onChange={supports_images => setEditor({ ...editor, supports_images })} /><Toggle label="Потокова відповідь" checked={editor.streaming} onChange={streaming => setEditor({ ...editor, streaming })} /></div>
          <h3 className="text-sm font-medium">Ліміти запитів · 0 — без обмежень</h3>
          <Limits value={{ per_second: editor.limit_per_second, per_minute: editor.limit_per_minute, per_hour: editor.limit_per_hour, per_day: editor.limit_per_day }} onChange={value => setEditor({ ...editor, limit_per_second: value.per_second, limit_per_minute: value.per_minute, limit_per_hour: value.per_hour, limit_per_day: value.per_day })} />
          <details className="space-y-3" open={editor.preset === 'custom'}><summary className="cursor-pointer text-sm font-medium">Власний запит і змінні</summary>
            <Field label="Шаблон cURL" hint="Ключ у заголовку: Authorization: Bearer {{API_KEY}}. Не вставляйте ключ безпосередньо в шаблон."><textarea className={`${control} min-h-28 font-mono`} value={editor.curl ?? ''} onChange={event => setEditor({ ...editor, curl: event.target.value || null })} /></Field>
            <Field label="Шлях до тексту відповіді"><input className={control} value={editor.response_content_path} onChange={event => setEditor({ ...editor, response_content_path: event.target.value })} /></Field>
            <Field label="Несекретні змінні JSON" hint={'Наприклад: {"LANGUAGE":"uk"}. API-ключі й токени сюди не додавайте.'}><textarea className={`${control} min-h-20 font-mono`} value={variables} onChange={event => setVariables(event.target.value)} /></Field>
          </details>
          <div className="flex gap-2"><button className={primary} type="submit">Зберегти провайдера</button><button type="button" className={button} onClick={closeEditor}>Скасувати</button></div>
        </form>}
      </Section>
      <Section title="Спільні ліміти й нейтральний режим">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
          await invoke('set_global_limits', { limits: globalLimits }); await invoke('set_neutral_mode', { enabled: manualNeutral });
        }, 'Спільні ліміти збережено.', 'Не вдалося зберегти спільні ліміти.'); }}>
          <p className="text-sm text-muted-foreground">Спільний бюджет для всіх провайдерів. 0 — без обмежень; використані запити враховуються за останню секунду, хвилину, годину та добу.</p>
          <Limits value={globalLimits} onChange={setGlobalLimits} />
          <Toggle label="Нейтральний режим: призупинити всі запити" checked={manualNeutral} onChange={setManualNeutral} />
          <button type="submit" className={primary}>Зберегти ліміти</button>
        </form>
      </Section>
      {capture && <Section title="Знімки екрана й аудіо"><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('update_capture_settings', { settings: capture }); setCapture(await invoke<CaptureSettings>('get_capture_settings'));
      }, 'Налаштування знімків та аудіо збережено.', 'Не вдалося зберегти налаштування знімків та аудіо.'); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Режим знімків"><select className={control} value={capture.mode} onChange={event => setCapture({ ...capture, mode: event.target.value as CaptureSettings['mode'] })}><option value="manual">Вручну</option><option value="interval">Через інтервал</option><option value="after_speech">Після мовлення</option></select></Field>
          <Field label="Інтервал, секунд"><input className={control} type="number" min={2} max={3600} step={1} required value={capture.interval} onChange={event => setCapture({ ...capture, interval: Number(event.target.value) })} /></Field>
          <Field label="Екран"><select className={control} value={['primary', 'all'].includes(capture.monitor) ? capture.monitor : 'id'} onChange={event => setCapture({ ...capture, monitor: event.target.value === 'id' ? '0' : event.target.value })}><option value="primary">Основний екран</option><option value="all">Усі екрани</option><option value="id">За ідентифікатором</option></select></Field>
          {!['primary', 'all'].includes(capture.monitor) && <Field label="Ідентифікатор екрана"><input className={control} required value={capture.monitor} onChange={event => setCapture({ ...capture, monitor: event.target.value })} /></Field>}
          <Field label="Максимум кадрів у запиті"><input className={control} type="number" min={1} max={10} step={1} required value={capture.max_frames} onChange={event => setCapture({ ...capture, max_frames: Number(event.target.value) })} /></Field>
          <Field label="Довша сторона знімка, пікселів"><input className={control} type="number" min={256} max={4096} step={1} required value={capture.max_long_side} onChange={event => setCapture({ ...capture, max_long_side: Number(event.target.value) })} /></Field>
          <Field label="Якість JPEG, %"><input className={control} type="number" min={1} max={100} step={1} required value={capture.jpeg_quality} onChange={event => setCapture({ ...capture, jpeg_quality: Number(event.target.value) })} /></Field>
          <Field label="Поріг зміни зображення (0–1)"><input className={control} type="number" min={0} max={1} step={0.01} required value={capture.dedup_threshold} onChange={event => setCapture({ ...capture, dedup_threshold: Number(event.target.value) })} /></Field>
          <Field label="Максимальне очікування, секунд"><input className={control} type="number" min={2} max={3600} step={1} required value={capture.max_wait_secs} onChange={event => setCapture({ ...capture, max_wait_secs: Number(event.target.value) })} /></Field>
        </div>
        <div className="flex flex-wrap gap-4"><Toggle label="Мікрофон" checked={capture.microphone} onChange={microphone => setCapture({ ...capture, microphone })} /><Toggle label="Звук системи" checked={capture.system_audio} onChange={system_audio => setCapture({ ...capture, system_audio })} /></div>
        <button className={primary} type="submit">Зберегти знімки й аудіо</button>
      </form></Section>}
      {vision && <Section title="Екран для текстових моделей"><form className="space-y-4" onSubmit={event => {
        event.preventDefault(); void act(async () => { await invoke('update_vision_settings', { settings: vision }); setVision(await invoke<VisionSettings>('get_vision_settings')); }, 'Аналіз екрана збережено.', 'Не вдалося зберегти аналіз екрана.');
      }}>
        <Field label="Як аналізувати екран"><select className={control} value={vision.mode} onChange={event => setVision({ ...vision, mode: event.target.value as VisionSettings['mode'] })}><option value="ocr">Windows OCR</option><option value="ocr+ui">OCR та дерево інтерфейсу</option><option value="vlm">Візуальна модель</option><option value="full">OCR, інтерфейс та візуальна модель</option></select></Field>
        <Field label="Максимум символів контексту"><input className={control} type="number" min={64} max={32000} value={vision.max_chars} onChange={event => setVision({ ...vision, max_chars: Number(event.target.value) })} /></Field>
        <Field label="Глибина дерева інтерфейсу"><input className={control} type="number" min={0} max={16} value={vision.ui_max_depth} onChange={event => setVision({ ...vision, ui_max_depth: Number(event.target.value) })} /></Field>
        <button className={primary} type="submit">Зберегти аналіз екрана</button>
      </form></Section>}
      {tts && <Section title="Озвучення відповіді"><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('update_tts_settings', { settings: tts }); setTts(await invoke<TtsSettings>('get_tts_settings'));
      }, 'Налаштування озвучення збережено.', 'Не вдалося зберегти налаштування озвучення.'); }}>
        <Toggle label="Озвучення увімкнено" checked={tts.enabled} onChange={enabled => setTts({ ...tts, enabled })} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Спосіб озвучення"><select className={control} value={tts.backend} onChange={event => setTts({ ...tts, backend: event.target.value as TtsSettings['backend'] })}><option value="system">Системний голос</option><option value="piper">Piper — локальний голос</option><option value="cloud">Хмарний провайдер TTS</option></select></Field>
          <Field label="Голос" hint="Для системного голосу можна залишити порожнім."><input className={control} list="system-voice-list" value={tts.voice} onChange={event => setTts({ ...tts, voice: event.target.value })} /><datalist id="system-voice-list">{snapshot.tts.voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name} · {voice.language}</option>)}</datalist></Field>
          <Field label="Мова"><input className={control} required value={tts.language} placeholder="uk-UA" onChange={event => setTts({ ...tts, language: event.target.value })} /></Field>
          <Field label="Швидкість"><input className={control} type="number" min={0.5} max={2} step={0.1} required value={tts.rate} onChange={event => setTts({ ...tts, rate: Number(event.target.value) })} /></Field>
        </div>
        <Toggle label="Читати завершені речення під час надходження відповіді" checked={tts.stream} onChange={stream => setTts({ ...tts, stream })} />
        {tts.backend === 'piper' && <Field label="Програма Piper" hint="Встановіть Piper локально. У полі «Голос» укажіть шлях до .onnx моделі."><input className={control} value={tts.piper_executable} onChange={event => setTts({ ...tts, piper_executable: event.target.value })} /></Field>}
        <button className={primary} type="submit">Зберегти озвучення</button>
      </form></Section>}
      {shell && <Section title="Вигляд накладеного інтерфейсу"><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        await invoke('set_ui_mode', { mode: shell.ui_mode }); await invoke('set_shimmer', { enabled: shell.shimmer });
        await invoke('set_shimmer_speed', { speed: shell.shimmer_speed }); await invoke('set_answer_opacity', { opacity: shell.answer_opacity });
        setShell(await invoke<ShellSettings>('get_shell_settings'));
      }, 'Вигляд інтерфейсу збережено.', 'Не вдалося застосувати всі налаштування інтерфейсу.'); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Розташування керування"><select className={control} value={shell.ui_mode} onChange={event => setShell({ ...shell, ui_mode: event.target.value as ShellSettings['ui_mode'] })}><option value="sidestrips">Бічні смуги</option><option value="topbottomstrips">Верхня та нижня смуги</option><option value="buttons">Окремі кнопки</option></select></Field>
          <Field label="Період переливання, секунд"><input className={control} type="number" min={1} max={20} step={1} required value={shell.shimmer_speed} onChange={event => setShell({ ...shell, shimmer_speed: Number(event.target.value) })} /></Field>
          <Field label="Непрозорість фону відповіді (0–1)"><input className={control} type="number" min={0} max={1} step={0.05} required value={shell.answer_opacity} onChange={event => setShell({ ...shell, answer_opacity: Number(event.target.value) })} /></Field>
        </div>
        <Toggle label="Переливання кольорів" checked={shell.shimmer} onChange={shimmer => setShell({ ...shell, shimmer })} />
        <button className={primary} type="submit">Зберегти вигляд</button>
      </form></Section>}
      <Section title="Інструкції для моделі"><form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => {
        localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt); localStorage.setItem('structured_output_prompt', structuredPrompt);
      }, 'Інструкції збережено.', 'Не вдалося зберегти інструкції.'); }}>
        <Field label="Системна інструкція"><textarea className={`${control} min-h-36`} value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} /></Field>
        <Field label="Структура відповіді" hint="Залиште теги <main>, <side> і <speak>, щоб розділити розв’язок, пояснення та озвучення."><textarea className={`${control} min-h-36`} value={structuredPrompt} onChange={event => setStructuredPrompt(event.target.value)} /></Field>
        <button className={primary} type="submit">Зберегти інструкції</button>
      </form></Section>
    </fieldset>
  </div>;
}
