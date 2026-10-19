import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {t,useI18n} from '@/lib/i18n';
import {Badge,Input,Card,Empty,Button} from '@/components';
import {PageLayout} from '@/layouts';
import {MessageCircleIcon,Search} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {SessionSummary} from '@/lib/overlay/session-store';
import {useServiceSnapshot} from '@/hooks/useServiceSnapshot';

const Chats=()=>{
  const {language}=useI18n(),navigate=useNavigate();
  const {act}=useServiceSnapshot();
  const [query,setQuery]=useState(''),[sessions,setSessions]=useState<SessionSummary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    let disposed=false,off:UnlistenFn|undefined;
    const refresh=()=>invoke<SessionSummary[]>('list_chat_sessions',{query}).then(value=>{if(!disposed){setSessions(value);setError('');}}).catch(error=>{if(!disposed)setError(String(error));}).finally(()=>{if(!disposed)setLoading(false);});
    const timer=setTimeout(()=>void refresh(),150);
    void listen('chat-sessions-changed',()=>void refresh()).then(stop=>{if(disposed)stop();else off=stop;}).catch(()=>{});
    return()=>{disposed=true;clearTimeout(timer);off?.();};
  },[query]);
  const rows=sessions.map(session=>({id:session.id,title:session.title,updated:session.updated_at,count:session.event_count}));
  return <PageLayout title={t('Chats')} description={t('Saved conversations, transcripts, audio, and screen observations')} rightSlot={<Button variant="outline" onClick={()=>void act('session_new').then(ok=>{if(ok)void act('chat');})}>{t('New chat')}</Button>}>
    <div className="relative mb-5 max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label={t('Search sessions')} placeholder={t('Search sessions…')} className="pl-9" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {!rows.length?<Empty isLoading={loading} icon={MessageCircleIcon} title={t('No saved sessions')} description={t('Start a new conversation to get started')}/>:<div className="flex flex-col gap-3 pb-8">{rows.map(row=><Card key={row.id} className="cursor-pointer gap-1 p-4 shadow-none hover:border-primary/50" onClick={()=>navigate(`/chats/view/${row.id}`)}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate text-sm">{row.title}</p><Badge variant="outline">{t('Events: {count}',{count:row.count})}</Badge></div>
      <time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(language,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(row.updated))}</time>
    </Card>)}</div>}
  </PageLayout>;
};
export default Chats;
