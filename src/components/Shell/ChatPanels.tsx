import type {ServiceSnapshot} from '@/lib/overlay/contracts';
import {useEffect,useRef} from 'react';
import {Markdown} from '@/components/Markdown';
import {t,useI18n} from '@/lib/i18n';
import {conversationEntries,transcriptEntries,type ConversationEntry} from './chat-presentation';

export function ConversationText({entry,isStreaming=false}:{entry:ConversationEntry;isStreaming?:boolean}){
  if(!entry.main&&!entry.side&&!entry.speak)return <Markdown isStreaming={isStreaming}>{entry.text}</Markdown>;
  const blocks=[{text:entry.main,bold:true},{text:entry.side,bold:false},{text:entry.speak,bold:true}].filter((block,index,array)=>block.text&&!array.slice(0,index).some(previous=>previous.text===block.text));
  return <div className="space-y-2">{blocks.map((block,index)=><div key={index} className={block.bold?'font-semibold':''}><Markdown isStreaming={isStreaming}>{block.text!}</Markdown></div>)}</div>;
}
export function ChatPanels({snapshot}:{snapshot:ServiceSnapshot}){
  const {language}=useI18n();
  const transcript=transcriptEntries(snapshot.session??null),conversation=conversationEntries(snapshot);
  const transcriptRef=useRef<HTMLElement>(null),conversationRef=useRef<HTMLElement>(null);
  const followingTranscript=useRef(true),followingConversation=useRef(true);
  useEffect(()=>{if(followingTranscript.current&&transcriptRef.current)transcriptRef.current.scrollTop=transcriptRef.current.scrollHeight;},[transcript.length]);
  useEffect(()=>{if(followingConversation.current&&conversationRef.current)conversationRef.current.scrollTop=conversationRef.current.scrollHeight;},[conversation.length,snapshot.main,snapshot.side,snapshot.speak]);
  const time=(timestamp?:number)=>timestamp&&Number.isFinite(timestamp)?new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(timestamp)):null;
  return <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-2" data-chat-panels>
    <section ref={transcriptRef} onScroll={event=>{const node=event.currentTarget;followingTranscript.current=node.scrollHeight-node.scrollTop-node.clientHeight<40;}} aria-label={t('Transcript')} className="min-w-0 overflow-auto rounded border border-white/15 p-2">
      <h2 className="sticky top-0 mb-2 text-[10px] uppercase text-white/60">{t('Transcript')}</h2>
      {!transcript.length&&<p className="text-xs text-white/40">{t('Recognized speech will appear here.')}</p>}
      {transcript.map(event=><div key={event.id} className="mb-3 text-sm">
        <p className="mb-0.5 flex flex-wrap gap-2 text-[10px] text-white/50">{time(event.timestamp)&&<time dateTime={new Date(event.timestamp).toISOString()}>{time(event.timestamp)}</time>}{event.speaker&&<span>{event.speaker}</span>}{event.channel&&<span>{event.channel==='[mic]'?t('Microphone'):event.channel==='[system]'?t('System audio'):event.channel}</span>}</p>
        <p className="whitespace-pre-wrap break-words">{event.text}</p>
      </div>)}
    </section>
    <section ref={conversationRef} onScroll={event=>{const node=event.currentTarget;followingConversation.current=node.scrollHeight-node.scrollTop-node.clientHeight<40;}} aria-label={t('Conversation')} className="min-w-0 overflow-auto rounded border border-white/15 p-2">
      <h2 className="sticky top-0 mb-2 text-[10px] uppercase text-white/60">{t('Conversation')}</h2>
      {!conversation.length&&<p className="text-xs text-white/40">{t('Your questions and answers will appear here.')}</p>}
      {conversation.map(entry=><article key={entry.id} className="mb-3 break-words border-b border-white/10 pb-2 text-sm"><p className="mb-1 text-[10px] text-white/50">{entry.role==='user'?t('You'):'Fluely'}{time(entry.timestamp)&&` · ${time(entry.timestamp)}`}</p><ConversationText entry={entry} isStreaming={snapshot.busy&&entry.id==='live-answer'}/></article>)}
    </section>
  </div>;
}
export function AudioMeters({microphone,system}:{microphone:number;system:number}){
  const clamp=(level:number)=>Number.isFinite(level)?Math.max(0,Math.min(1,level)):0;
  return <div className="flex shrink-0 items-center justify-center gap-5 px-3 pb-1" aria-label={t('Live input volume')}>
    {[[t('Microphone'),microphone],[t('System audio'),system]].map(([label,level])=><div key={String(label)} className="flex items-center gap-1.5 text-[10px] text-white/60"><div role="meter" aria-label={String(label)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp(Number(level))*100)} className="relative h-7 w-2 overflow-hidden rounded bg-white/15"><div className="absolute bottom-0 w-full bg-emerald-400 transition-[height] duration-100" style={{height:`${clamp(Number(level))*100}%`}}/></div><span>{label}</span></div>)}
  </div>;
}
