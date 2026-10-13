import {useEffect,useState} from 'react';
import {LoaderCircleIcon,MicOffIcon} from 'lucide-react';
import {Button} from '@/components';
import {fetchSTT} from '@/lib';
import {useApp} from '@/contexts';
import type {UseCompletionReturn} from '@/types';
import {t,useI18n} from '@/lib/i18n';
import {openMicrophoneSession} from '@/lib/overlay/microphone-session';
interface Props{submit:UseCompletionReturn['submit'];setState:UseCompletionReturn['setState'];setEnableVAD:UseCompletionReturn['setEnableVAD'];microphoneDeviceId?:string}
export function AutoSpeechVAD({submit,setState,setEnableVAD,microphoneDeviceId}:Props){
  useI18n();
  const {selectedSttProvider,allSttProviders}=useApp();
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let disposed=false,session:Awaited<ReturnType<typeof openMicrophoneSession>>|undefined;
    const abort=new AbortController();
    const fail=(failure:unknown)=>{if(!disposed)setState((previous:Record<string,unknown>)=>({...previous,error:t(String(failure))}));};
    void openMicrophoneSession(async audio=>{
      if(abort.signal.aborted)return;setBusy(true);
      try{const text=await fetchSTT({audio,provider:allSttProviders.find(p=>p.id===selectedSttProvider.provider),selectedProvider:selectedSttProvider,signal:abort.signal});if(!disposed&&text.trim())submit(text);}
      finally{if(!disposed)setBusy(false);}
    },fail,microphoneDeviceId).then(value=>{session=value;if(disposed)void value.finish().catch(console.error);}).catch(fail);
    return()=>{disposed=true;abort.abort();void session?.finish().catch(console.error);};
  },[microphoneDeviceId]);
  return <Button size="icon" title={t('Stop recording')} onClick={()=>setEnableVAD(false)}>{busy?<LoaderCircleIcon className="h-4 w-4 animate-spin"/>:<MicOffIcon className="h-4 w-4 animate-pulse"/>}</Button>;
}
