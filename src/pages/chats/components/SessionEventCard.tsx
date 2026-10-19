import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {t,useI18n} from '@/lib/i18n';
import {ConversationText} from '@/components/Shell/ChatPanels';
import {eventDisplayText} from '@/components/Shell/chat-presentation';
import type {SessionEvent,SessionMedia} from '@/lib/overlay/session-store';

const labels:Record<SessionEvent['kind'],string>={question:'You',answer:'Fluely',transcript:'Transcript',audio:'Audio recording',screenshot:'Screenshot',vision:'Vision description',summary:'Context summary',file:'File attachment'};
export function SessionEventCard({event,sessionId}:{event:SessionEvent;sessionId:string}){
  const {language}=useI18n();
  const [media,setMedia]=useState<SessionMedia|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mediaRef=event.audio_ref??event.image_ref??event.file_ref;
  const load=async()=>{if(!mediaRef)return;setBusy(true);setError('');try{setMedia(await invoke<SessionMedia>('read_chat_media',{sessionId,mediaRef}));}catch(error){setError(String(error));}finally{setBusy(false);}};
  const source=media?`data:${media.mime};base64,${media.base64}`:undefined;
  return <article className="rounded-lg border p-3" data-event-kind={event.kind}>
    <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-medium">{t(labels[event.kind])}</span><time dateTime={new Date(event.timestamp).toISOString()}>{new Intl.DateTimeFormat(language,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(event.timestamp))}</time>{event.speaker&&<span>{event.speaker}</span>}{event.channel&&<span>{event.channel==='[mic]'?t('Microphone'):event.channel==='[system]'?t('System audio'):event.channel}</span>}</p>
    {event.kind==='answer'?<ConversationText entry={{...event,role:'assistant'}}/>:<p className="whitespace-pre-wrap break-words text-sm">{eventDisplayText(event)}</p>}
    {mediaRef&&!media&&<button type="button" disabled={busy} onClick={()=>void load()} className="mt-2 rounded border px-3 py-1 text-xs disabled:opacity-40">{busy?t('Loading...'):event.file_ref?t('Load attachment'):event.audio_ref?t('Load recording'):t('View screenshot')}</button>}
    {source&&event.file_ref&&<a href={source} download={event.filename??'attachment.bin'} className="mt-2 inline-block rounded border px-3 py-1 text-xs">{event.filename??t('File attachment')}</a>}
    {source&&event.audio_ref&&<audio controls preload="none" src={source} className="mt-2 max-w-full" aria-label={t('Audio recording')}/>}
    {source&&event.image_ref&&<img src={source} alt={event.text||t('Screenshot')} className="mt-2 max-h-96 max-w-full rounded object-contain"/>}
    {error&&<p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </article>;
}
