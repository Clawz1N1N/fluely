import {useEffect,useState} from 'react';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';

export function useAudioLevels(){
  const [levels,setLevels]=useState({microphone:0,system:0});
  useEffect(()=>{
    let disposed=false,off:UnlistenFn|undefined;
    const received={microphone:0,system:0};
    void listen<{channel:string;level:number}>('audio-level',event=>{
      const key=event.payload.channel==='[mic]'?'microphone':event.payload.channel==='[system]'?'system':null;
      if(disposed||!key||!Number.isFinite(event.payload.level))return;
      received[key]=Date.now();setLevels(previous=>({...previous,[key]:Math.max(0,Math.min(1,event.payload.level))}));
    }).then(stop=>{if(disposed)stop();else off=stop;}).catch(()=>{});
    const timer=setInterval(()=>setLevels(previous=>{
      const next={microphone:Date.now()-received.microphone>250?previous.microphone*0.6:previous.microphone,system:Date.now()-received.system>250?previous.system*0.6:previous.system};
      if(next.microphone<0.005)next.microphone=0;if(next.system<0.005)next.system=0;
      return next.microphone===previous.microphone&&next.system===previous.system?previous:next;
    }),100);
    return()=>{disposed=true;off?.();clearInterval(timer);};
  },[]);
  return levels;
}
