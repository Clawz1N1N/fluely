import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components';
import {StopCircle,Send} from 'lucide-react';
import {fetchSTT} from '@/lib';
import {useApp} from '@/contexts';
import {t,useI18n} from '@/lib/i18n';
import {openMicrophoneSession} from '@/lib/overlay/microphone-session';

interface AudioRecorderProps{onTranscriptionComplete:(text:string)=>void;onCancel:()=>void}
export function AudioRecorder({onTranscriptionComplete,onCancel}:AudioRecorderProps){
  useI18n();
  const {selectedSttProvider,allSttProviders,selectedAudioDevices}=useApp();
  const [duration,setDuration]=useState(0),[sending,setSending]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
  const transcript=useRef<string[]>([]),abort=useRef(new AbortController()),session=useRef<Awaited<ReturnType<typeof openMicrophoneSession>>|undefined>(undefined);
  const sendingRef=useRef(false);
  useEffect(()=>{
    let disposed=false;
    abort.current=new AbortController();
    const controller=abort.current;
    const start=Date.now();
    const timer=setInterval(()=>setDuration(Date.now()-start),250);
    void openMicrophoneSession(async audio=>{
      if(controller.signal.aborted)return;
      const text=await fetchSTT({audio,provider:allSttProviders.find(p=>p.id===selectedSttProvider.provider),selectedProvider:selectedSttProvider,signal:controller.signal});
      if(!controller.signal.aborted&&text.trim())transcript.current.push(text.trim());
    },failure=>{if(!disposed)setError(String(failure));},selectedAudioDevices.input.id==='default'?undefined:selectedAudioDevices.input.name).then(value=>{
      if(disposed)void value.finish().catch(console.error);else {session.current=value;setReady(true);}
    }).catch(failure=>{if(!disposed)setError(String(failure));});
    const limit=setTimeout(()=>{void send();},180_000);
    return()=>{disposed=true;clearInterval(timer);clearTimeout(limit);controller.abort();void session.current?.finish().catch(console.error);};
  },[]);
  const send=async()=>{
    if(sendingRef.current||!session.current)return;
    sendingRef.current=true;setSending(true);
    try{await session.current.finish();const text=transcript.current.join(' ');if(text)onTranscriptionComplete(text);else onCancel();}
    catch(failure){setError(String(failure));setSending(false);sendingRef.current=false;}
  };
  return <div className="rounded-lg border p-3">
    <div role="status" className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"/>{t('Recording...')} {Math.floor(duration/60000)}:{String(Math.floor(duration/1000)%60).padStart(2,'0')} / 3:00</div>
    {error&&<p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div className="mt-2 flex gap-2"><Button size="icon" variant="outline" title={t('Stop recording')} onClick={onCancel}><StopCircle className="h-4 w-4"/></Button><Button size="icon" title={t('Send to AI')} disabled={sending||!ready} onClick={()=>void send()}><Send className="h-4 w-4"/></Button></div>
  </div>;
}
