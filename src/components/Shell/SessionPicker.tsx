import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {t,useI18n} from '@/lib/i18n';
import type {SessionSummary} from '@/lib/overlay/session-store';
import type {ShellAction} from '@/lib/overlay/contracts';

export function SessionPicker({interactive,sessionId,title,act}:{interactive:boolean;sessionId?:string;title?:string;act:(action:ShellAction,question?:string)=>Promise<unknown>}){
  const {language}=useI18n();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[sessions,setSessions]=useState<SessionSummary[]>([]),[error,setError]=useState(''),[name,setName]=useState(title??'');
  useEffect(()=>{if(!interactive)setOpen(false);},[interactive]);
  useEffect(()=>setName(title??''),[title]);
  useEffect(()=>{
    if(!open)return;let disposed=false,off:UnlistenFn|undefined;
    const refresh=()=>invoke<SessionSummary[]>('list_chat_sessions',{query}).then(value=>{if(!disposed){setSessions(value);setError('');}}).catch(error=>{if(!disposed)setError(String(error));});
    const timer=setTimeout(()=>void refresh(),150);
    void listen('chat-sessions-changed',()=>void refresh()).then(stop=>{if(disposed)stop();else off=stop;}).catch(()=>{});
    return()=>{disposed=true;clearTimeout(timer);off?.();};
  },[open,query]);
  const button='rounded px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40';
  return <div className="relative flex shrink-0 items-center gap-1 border-t border-white/15 px-2 py-1">
    <button type="button" disabled={!interactive} aria-expanded={open} className={button} onClick={()=>setOpen(!open)}>{t('Session history')}{title&&<span className="ml-2 text-white/50">{title}</span>}</button>
    <button type="button" disabled={!interactive} className={button} onClick={()=>{void act('session_new').then(ok=>{if(ok)setOpen(false);});}}>{t('New chat')}</button>
    {open&&<div className="absolute bottom-full left-2 right-2 z-30 mb-1 max-h-64 overflow-auto rounded-lg border border-white/25 bg-neutral-900 p-2 shadow-xl" role="region" aria-label={t('Session history')}>
      <input autoFocus value={query} onChange={event=>setQuery(event.target.value)} aria-label={t('Search sessions')} placeholder={t('Search sessions…')} className="mb-2 w-full rounded border border-white/20 bg-transparent px-2 py-1 text-xs"/>
      {sessionId&&<form className="mb-2 flex gap-1" onSubmit={event=>{event.preventDefault();void invoke('rename_chat_session',{sessionId,title:name.trim()}).catch(error=>setError(String(error)));}}><input value={name} onChange={event=>setName(event.target.value)} aria-label={t('Session title')} className="min-w-0 flex-1 rounded border border-white/20 bg-transparent px-2 text-xs"/><button className={button} disabled={!name.trim()}>{t('Rename')}</button></form>}
      {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
      {!sessions.length&&!error&&<p className="py-2 text-xs text-white/50">{t('No saved sessions')}</p>}
      {sessions.map(session=><button key={session.id} type="button" aria-current={session.id===sessionId?'true':undefined} className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs hover:bg-white/10" onClick={()=>void act('session_select',session.id).then(ok=>{if(ok)setOpen(false);})}><span className="truncate">{session.title}</span><time className="shrink-0 text-white/50">{new Intl.DateTimeFormat(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(session.updated_at))}</time></button>)}
    </div>}
  </div>;
}
