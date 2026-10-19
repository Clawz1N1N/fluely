import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {useNavigate,useParams} from 'react-router-dom';
import {Button,Input} from '@/components';
import {PageLayout} from '@/layouts';
import {t,useI18n} from '@/lib/i18n';
import type {Session} from '@/lib/overlay/session-store';
import {useServiceSnapshot} from '@/hooks/useServiceSnapshot';
import {SessionEventCard} from './SessionEventCard';
import {groupedSessionEvents} from '@/lib/overlay/session-presentation';

export function SessionView(){
  useI18n();const {conversationId}=useParams(),navigate=useNavigate(),{act}=useServiceSnapshot();
  const [session,setSession]=useState<Session|null>(null),[title,setTitle]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[deleting,setDeleting]=useState(false);
  useEffect(()=>{
    let disposed=false,off:UnlistenFn|undefined;
    const refresh=()=>invoke<Session>('get_chat_session',{sessionId:conversationId}).then(value=>{if(!disposed){setSession(value);setTitle(value.title);setError('');}}).catch(error=>{if(!disposed)setError(String(error));}).finally(()=>{if(!disposed)setLoading(false);});
    void refresh();void listen<{sessionId:string}>('chat-sessions-changed',event=>{if(event.payload.sessionId===conversationId)void refresh();}).then(stop=>{if(disposed)stop();else off=stop;}).catch(()=>{});
    return()=>{disposed=true;off?.();};
  },[conversationId]);
  const events=session?.events.filter(event=>[event.text,event.speaker,event.channel,event.kind].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))??[];
  return <PageLayout title={session?.title??t('Chats')} description={t('Saved conversations, transcripts, audio, and screen observations')} rightSlot={<div className="flex gap-2"><Button variant="outline" disabled={!session} onClick={()=>void act('session_select',conversationId).then(ok=>{if(ok)void act('chat');})}>{t('Open in Overlay')}</Button><Button variant="destructive" disabled={!session} onClick={()=>setDeleting(true)}>{t('Delete')}</Button></div>}>
    {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {loading&&<p className="text-sm text-muted-foreground">{t('Loading...')}</p>}
    {session&&<><form className="mb-3 flex max-w-xl gap-2" onSubmit={event=>{event.preventDefault();void invoke('rename_chat_session',{sessionId:session.id,title:title.trim()}).catch(error=>setError(String(error)));}}><Input aria-label={t('Session title')} value={title} onChange={event=>setTitle(event.target.value)}/><Button variant="outline" disabled={!title.trim()}>{t('Rename')}</Button></form><Input className="mb-4 max-w-xl" value={search} onChange={event=>setSearch(event.target.value)} aria-label={t('Search events')} placeholder={t('Search events…')}/><div className="flex flex-col gap-3 pb-8">{groupedSessionEvents(events).map(group=><div key={group.event.id}><SessionEventCard sessionId={session.id} event={group.event}/>{group.related.map(event=><div key={event.id} className="ml-4 mt-2"><SessionEventCard sessionId={session.id} event={event}/></div>)}</div>)}{!events.length&&<p className="text-sm text-muted-foreground">{t('No matching events')}</p>}</div></>}
    {deleting&&session&&<div role="dialog" aria-modal="true" aria-label={t('Delete session')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"><div className="rounded-lg border bg-background p-5"><p className="mb-4">{t('Delete this session and its saved media?')}</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setDeleting(false)}>{t('Cancel')}</Button><Button variant="destructive" onClick={()=>void invoke('delete_chat_session',{sessionId:session.id}).then(()=>navigate('/chats')).catch(error=>{setError(String(error));setDeleting(false);})}>{t('Delete')}</Button></div></div></div>}
  </PageLayout>;
}
