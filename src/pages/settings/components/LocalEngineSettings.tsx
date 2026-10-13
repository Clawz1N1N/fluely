import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@/lib/i18n';
import { localEngineClient, type LocalEngineConfig, type LocalEngineField, type LocalEngineKind, type LocalEngineStatus } from '@/lib/overlay/local-engine-client';

const input = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const button = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const kinds: LocalEngineKind[] = ['brain', 'stt', 'gguf-asr', 'vision'];
const titles = { brain: 'Local brain', stt: 'Local Whisper speech recognition', vision: 'Local visual understanding', 'gguf-asr':'GGUF speech recognition (transcribe.cpp)' };
const hints = {
  brain: 'Choose a small instruct GGUF model. For an 8 GB PC, start with 0.5–1.5B parameters, 4 threads and 2048 context tokens.',
  stt: 'Whisper uses whisper.cpp GGML .bin models, not arbitrary GGUF files. The multilingual tiny model supports Ukrainian, Russian and English; larger models improve accuracy.',
  vision: 'Choose a vision GGUF model and its matching mmproj projector. SmolVLM2 500M is a lightweight starting point; larger models can understand more detail.',
  'gguf-asr':'ASR GGUF models require a compatible speech engine. transcribe.cpp v0.4.0 supports Nemotron 3.5 ASR and other explicitly supported ASR families; a brain GGUF is incompatible. Fluely transcribes completed speech segments in an isolated CPU worker.',
};
const sources = {
  brain: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/main',
  stt: 'https://huggingface.co/ggerganov/whisper.cpp/tree/main',
  vision: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/tree/main',
  'gguf-asr':'https://github.com/handy-computer/transcribe.cpp/blob/v0.4.0/README.md#supported-models',
};
const recommendations = {
  brain: 'Recommended: Qwen2.5 0.5B Instruct Q4 (491 MB, Apache 2.0).',
  stt: 'Recommended: multilingual Whisper tiny (78 MB, MIT).',
  vision: 'Recommended: SmolVLM 256M Q8 plus matching projector (279 MB total, Apache 2.0). A small model can miss fine details.',
  'gguf-asr':'Recommended: Nemotron 3.5 ASR Streaming 0.6B Q4_K_M (496 MB, OpenMDW 1.1). Supports Ukrainian, Russian, English and other listed languages. The official native CPU engine download is about 18 MB.',
};

export function LocalEngineSettings() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<LocalEngineConfig[]>([]);
  const [statuses, setStatuses] = useState<LocalEngineStatus[]>([]);
  const [busy, setBusy] = useState<LocalEngineKind | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [progress, setProgress] = useState<{ kind: LocalEngineKind; name: string; received: number; total: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([localEngineClient.configs(), localEngineClient.status()]).then(([configs, statuses]) => {
      if (alive) { setConfigs(configs); setStatuses(statuses); }
    }).catch(error => { if (alive) setError(String(error)); });
    const interval = setInterval(() => { void localEngineClient.status().then(status => { if (alive) setStatuses(status); }).catch(() => {}); }, 2000);
    const subscription = listen<{ kind: LocalEngineKind; name: string; received: number; total: number }>('local-model-download', event => { if (alive) setProgress(event.payload); });
    void subscription.catch(() => {});
    return () => { alive = false; clearInterval(interval); void subscription.then(off => off()).catch(() => {}); };
  }, []);
  const change = (kind: LocalEngineKind, patch: Partial<LocalEngineConfig>) => {
    setConfigs(current => current.map(config => config.kind === kind ? { ...config, ...patch } : config));
  };
  const action = async (kind: LocalEngineKind, task: () => Promise<unknown>, success: string) => {
    setBusy(kind); setError(''); setFeedback(''); setProgress(null);
    try { await task(); setStatuses(await localEngineClient.status()); setFeedback(success); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  const browse = (config: LocalEngineConfig, field: LocalEngineField) => action(config.kind, async () => {
    const path = await localEngineClient.browse(config.kind, field);
    if (path) change(config.kind, { [field]: path });
  }, '');
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">{t('Local engines')}</h2>
    <p className="text-sm text-muted-foreground">{t('Run independent brain, speech and vision models on this PC. Servers listen only on 127.0.0.1. Start each engine explicitly; nothing records or loads automatically.')}</p>
    <p className="text-sm text-muted-foreground">{t('The CPU engine downloader installs verified official llama.cpp (about 20 MB), whisper.cpp (about 9 MB) or transcribe.cpp (about 18 MB) releases. GGUF ASR runs in an isolated native worker. Model downloads are separate; check their size and license first.')}</p>
    <p className="text-sm text-muted-foreground">{t('For simple offline speech without a downloaded model, add a Windows system speech provider in Speech recognition settings. Only installed Windows recognizers are available.')}</p>
    {error && <p role="alert" className="break-words text-sm text-destructive">{t(error)}</p>}
    {feedback && <p role="status" className="text-sm">{t(feedback)}</p>}
    {configs.length === 0 && !error && <p className="text-sm">{t('Loading local engine settings…')}</p>}
    {kinds.map(kind => {
      const config = configs.find(config => config.kind === kind); if (!config) return null;
      const status = statuses.find(status => status.kind === kind);
      const running = status?.state === 'running'; const starting = status?.state === 'starting';
      const disabled = busy !== null || starting;
      const pathField = (field: LocalEngineField, label: string, placeholder: string) => <label className="block space-y-1 text-sm">
        <span>{t(label)}</span>
        <div className="flex gap-2"><input className={input} disabled={disabled || running} value={config[field]} placeholder={placeholder} onChange={event => change(kind, { [field]: event.target.value })} /><button className={button} disabled={disabled || running} onClick={() => void browse(config, field)}>{t('Browse')}</button></div>
      </label>;
      return <article key={kind} className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{t(titles[kind])}</h3><span className="text-sm">{t(status?.state === 'running' ? 'Running' : status?.state === 'starting' ? 'Starting' : status?.state === 'error' ? 'Error' : 'Stopped')}</span></div>
        <p className="text-sm text-muted-foreground">{t(hints[kind])}</p>
        <p className="text-sm text-muted-foreground">{t(recommendations[kind])}</p>
        {pathField('executable', kind==='gguf-asr'?'ASR native library':'Engine executable', kind==='gguf-asr'?'transcribe.dll':kind === 'stt' ? 'whisper-server.exe' : 'llama-server.exe')}
        {pathField('model_path', 'Model file', kind === 'stt' ? 'ggml-base.bin' : 'model.gguf')}
        {kind === 'vision' && pathField('mmproj_path', 'Matching visual projector', 'mmproj.gguf')}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([['port', 'Port', 1024, 65535], ['threads', 'CPU threads', 1, 128], ['context', 'Context tokens', 512, 131072], ['gpu_layers', 'GPU layers (0 = CPU)', 0, 1000]] as const).filter(([field]) => kind==='gguf-asr'?field==='threads':kind !== 'stt' || field !== 'context').map(([field, label, min, max]) => <label key={field} className="space-y-1 text-sm"><span>{t(label)}</span><input className={input} disabled={disabled || running} type="number" min={min} max={max} value={config[field]} onChange={event => change(kind, { [field]: Number(event.target.value) })} /></label>)}
        </div>
        {(kind === 'stt'||kind==='gguf-asr') && <label className="block space-y-1 text-sm"><span>{t('Speech language')}</span><select className={input} disabled={disabled || running} value={config.language} onChange={event => change(kind, { language: event.target.value })}><option value="auto">{t('Automatic language detection')}</option><option value="uk">{t('Ukrainian')}</option><option value="ru">{t('Russian')}</option><option value="en">{t('English')}</option></select></label>}
        <p className="text-xs text-muted-foreground">{t('GPU acceleration needs a compatible engine build. The bundled CPU download works with GPU layers set to 0.')}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={disabled || running} onClick={() => void action(kind, () => localEngineClient.save(config), 'Local engine settings saved')}>{t('Save')}</button>
          <button className={button} disabled={disabled || running} onClick={() => void action(kind, () => localEngineClient.start(config), 'Local engine is ready and registered as a provider')}>{t('Start')}</button>
          <button className={button} disabled={!running && !starting} onClick={() => void action(kind, () => localEngineClient.stop(kind), 'Local engine stopped')}>{t('Stop')}</button>
          <button className={button} disabled={disabled || !running} onClick={() => void action(kind, () => localEngineClient.test(kind), 'Local server is healthy and its model is loaded')}>{t('Test')}</button>
          <button className={button} disabled={disabled || running} onClick={() => void action(kind, async () => {
            const executable = await localEngineClient.install(kind); const updated = { ...config, executable };
            await localEngineClient.save(updated); change(kind, { executable });
          }, 'Official CPU engine installed. Select a model file before starting.')}>{t('Download CPU engine')}</button>
          <button className={button} disabled={disabled || running} onClick={() => void action(kind, async () => {
            const executable = config.executable || await localEngineClient.install(kind);
            const model = await localEngineClient.installModel(kind);
            const updated = { ...config, executable, model_path: model.model_path, mmproj_path: model.mmproj_path, gpu_layers: 0 };
            await localEngineClient.save(updated); change(kind, updated);
          }, 'Recommended model downloaded and selected. Press Start to load it.')}>{t('Download recommended model')}</button>
          <button className={button} disabled={disabled} onClick={() => void action(kind, () => openUrl(sources[kind]), '')}>{t('Find compatible models')}</button>
        </div>
        {starting && <p role="status" className="text-sm">{t('Loading the model. A large model can take up to two minutes.')}</p>}
        {busy === kind && progress?.kind === kind && <div role="status" className="space-y-1 text-sm"><p>{t('Downloading model')} {Math.round(progress.received / progress.total * 100)}% — {progress.name}</p><progress className="w-full" value={progress.received} max={progress.total} /></div>}
        {status?.error && <p role="alert" className="break-words text-sm text-destructive">{t(status.error)}</p>}
        {!!status?.logs.length && <details><summary className="cursor-pointer text-sm">{t('Engine log')}</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{status.logs.join('\n')}</pre></details>}
      </article>;
    })}
  </section>;
}
