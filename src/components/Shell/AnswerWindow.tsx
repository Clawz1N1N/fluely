import {t,useI18n} from '@/lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Pause, Play, Square, X } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { useServiceSnapshot } from '@/hooks/useServiceSnapshot';
import { useShellDrag } from './useShellDrag';
import { requestCounts } from './ShellControls';

/** The answer window is a view of the persistent hidden-main service. */
export const AnswerWindow: React.FC = () => {
  useI18n();
  const { snapshot, act, connectionError } = useServiceSnapshot();
  const [input, setInput] = useState('');
  const [focusError, setFocusError] = useState<string | null>(null);
  const [interactive,setInteractive]=useState(false);
  const [interactionShortcut,setInteractionShortcut]=useState('Shift + \\');
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const editing = useRef(false);
  const focusRevision = useRef(0);
  const policyQueue = useRef<Promise<unknown>>(Promise.resolve());
  const drag = useShellDrag('free');

  // Serialize policy changes so a delayed enable cannot overtake a blur/close.
  const setEditing = useCallback((enabled: boolean) => {
    const next = policyQueue.current.catch(() => {}).then(() => invoke('set_answer_editing', { editing: enabled }));
    policyQueue.current = next;
    return next;
  }, []);
  const endEditing = useCallback(() => {
    focusRevision.current++;
    editing.current = false;
    setInteractive(false);
    void setEditing(false).catch(() => { if (mounted.current) setFocusError('Не вдалося завершити введення.'); });
  }, [setEditing]);
  const beginEditing = useCallback(async () => {
    const revision = ++focusRevision.current;
    try {
      await setEditing(true);
      if (!mounted.current || revision !== focusRevision.current) return;
      editing.current = true;
      setInteractive(true);
      setFocusError(null);
      inputRef.current?.focus();
    } catch { if (mounted.current) setFocusError('Не вдалося активувати поле запиту.'); }
  }, [setEditing]);
  useEffect(() => {
    let disposed=false,off:UnlistenFn|undefined;
    void invoke<Record<string,string>>('get_registered_shortcuts').then(bindings=>{
      if(!disposed&&bindings.answer_interaction)setInteractionShortcut(bindings.answer_interaction);
    }).catch(console.error);
    void listen<boolean>('answer-interaction-changed',event=>{
      if(disposed)return;
      editing.current=event.payload;setInteractive(event.payload);
      if(!event.payload)inputRef.current?.blur();
    }).then(async stop=>{
      if(disposed){stop();return;}off=stop;
      const value=await invoke<boolean>('get_answer_interaction');
      if(!disposed){editing.current=value;setInteractive(value);}
    }).catch(console.error);
    return()=>{disposed=true;off?.();};
  },[]);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let stop: UnlistenFn | undefined;
    void listen('answer-focus-input', () => { if (!disposed) void beginEditing(); }).then(unlisten => {
      if (disposed) unlisten(); else stop = unlisten;
    }).catch(console.error);
    return () => { disposed = true; mounted.current = false; stop?.(); endEditing(); };
  }, [beginEditing, endEditing]);
  useEffect(() => {
    if (!snapshot.answerVisible) { inputRef.current?.blur(); endEditing(); }
  }, [snapshot.answerVisible, endEditing]);
  useEffect(() => {
    if (!snapshot.nextAllowedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.nextAllowedAt]);

  const close = async () => {
    inputRef.current?.blur();
    endEditing();
    try { await policyQueue.current; await invoke('close_answer_window'); }
    catch { setFocusError('Не вдалося закрити вікно.'); }
  };
  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || !snapshot.ready) return;
    if (await act('ask', question)) setInput('');
  };
  const wordStart = Math.max(0, Math.min(snapshot.speak.length, snapshot.tts.wordStart));
  const wordEnd = Math.max(wordStart, Math.min(snapshot.speak.length, snapshot.tts.wordEnd));
  const highlight = snapshot.tts.wordStart >= 0 && wordEnd > wordStart && (snapshot.tts.speaking || snapshot.tts.paused);
  const wait = snapshot.nextAllowedAt ? Math.max(0, Math.ceil((snapshot.nextAllowedAt - now) / 1000)) : 0;
  const status = !snapshot.ready ? t('Підключення…') : snapshot.neutral ? (wait ? t('Wait: {seconds} s',{seconds:wait}) : t('Запити призупинено')) : snapshot.busy ? t('Готуємо відповідь…') : snapshot.currentModel ?? t('Готово');

  return <div
    className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/50 text-white"
    style={{ backgroundColor: `rgba(23,23,23,${interactive?1:snapshot.shell.answer_opacity})`,pointerEvents:interactive?'auto':'none',textShadow:interactive?'none':'0 1px 2px #000' }}
    data-interactive={interactive}
    data-mode={snapshot.shell.ui_mode}
    onKeyDown={event => { if (event.key === 'Escape') { inputRef.current?.blur(); endEditing(); } }}
  >
    <div className="flex cursor-move items-center justify-between border-b border-white/20 px-3 py-2" {...(interactive?drag.handlers:{})}>
      <span className="text-xs font-medium">Fluely {interactive?`· ${t('Interaction · Escape to finish')}`:''}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/60" id="rate-limit-status" aria-live="polite" title={requestCounts(snapshot)}>{status} · {requestCounts(snapshot)}</span>
        <button type="button" className="rounded p-1 hover:bg-neutral-700" onClick={() => void close()} aria-label={t("Закрити відповідь")}><X className="h-4 w-4" /></button>
      </div>
    </div>
    {(connectionError || focusError || snapshot.error) && <p role="alert" className="px-3 py-1 text-xs text-red-300">{connectionError ?? focusError ?? snapshot.error}</p>}
    <div className="flex min-h-0 flex-1 gap-2 p-2">
      <section className="min-w-0 flex-1 overflow-auto rounded border border-white/15 p-2">
        <h2 className="mb-1 text-[10px] uppercase text-white/50">{t("Основне · MAIN")}</h2>
        <Markdown isStreaming={snapshot.busy}>{snapshot.main || '…'}</Markdown>
      </section>
      <section className="min-w-0 flex-1 overflow-auto rounded border border-white/15 p-2">
        <h2 className="mb-1 text-[10px] uppercase text-white/50">{t("Додатково · SIDE")}</h2>
        <Markdown isStreaming={snapshot.busy}>{snapshot.side || '…'}</Markdown>
      </section>
    </div>
    <section className="max-h-28 overflow-auto border-t border-neutral-700 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[10px] uppercase text-white/50">{t("Озвучення · SPEAK")}</h2>
        <div className="flex gap-2">
          <button type="button" title={t("Назад")} aria-label={t("Озвучення назад")} onClick={() => void act('tts_seek_back')}>«</button>
          <button type="button" aria-label={snapshot.tts.paused ? t("Продовжити озвучення") : t("Пауза озвучення")} onClick={() => void act('tts_pause')} disabled={!snapshot.tts.speaking && !snapshot.tts.paused}>{snapshot.tts.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}</button>
          <button type="button" aria-label={t("Зупинити озвучення")} onClick={() => void act('tts_stop')}><Square className="h-3 w-3" /></button>
          <button type="button" title={t("Вперед")} aria-label={t("Озвучення вперед")} onClick={() => void act('tts_seek_forward')}>»</button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm">{highlight ? <>{snapshot.speak.slice(0, wordStart)}<mark className="rounded bg-yellow-300 text-neutral-950">{snapshot.speak.slice(wordStart, wordEnd)}</mark>{snapshot.speak.slice(wordEnd)}</> : snapshot.speak || '…'}</p>
    </section>
    <details className="max-h-36 overflow-auto px-3 text-xs">
      <summary className="cursor-pointer py-1">{t('Chat history ({count})',{count:snapshot.history.length})}</summary>
      {snapshot.history.map((message, index) => <div key={index} className="border-t border-white/10 py-1"><span className="text-white/50">{message.role === 'user' ? t("Ви") : 'Fluely'}: </span><Markdown>{message.content}</Markdown></div>)}
    </details>
    <form className="flex gap-2 border-t border-neutral-700 p-2" onSubmit={event => { event.preventDefault(); void sendQuestion(); }}>
      <button type="button" className="rounded bg-neutral-700 px-2 text-xs" onClick={() => void beginEditing()}>{t("Ввести запит")}</button>
      <input
        ref={inputRef} value={input} tabIndex={-1} onChange={event => setInput(event.target.value)}
        readOnly={!interactive}
        placeholder={interactive?t("Запитайте…"):t('{shortcut} — move and type',{shortcut:interactionShortcut})} aria-label={t("Запит до помічника")}
        className="min-w-0 flex-1 rounded border border-white/20 bg-transparent px-2 py-1 text-sm outline-none"
      />
      <button type="submit" disabled={!input.trim() || !snapshot.ready} className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-40">{t("Надіслати")}</button>
    </form>
  </div>;
};
