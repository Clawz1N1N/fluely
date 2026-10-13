import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {nativeMicrophoneWave} from './local-engine-client';
let microphoneLease=Promise.resolve();

/** A native capture lease belongs to this webview; its final segment precedes stopped. */
export async function openMicrophoneSession(onAudio:(audio:Blob)=>Promise<void>,onError:(error:unknown)=>void,deviceId?:string){
  const previous=microphoneLease;
  let releaseLease:()=>void=()=>{};
  const released=new Promise<void>(resolve=>{releaseLease=resolve;});
  microphoneLease=previous.then(()=>released);
  await previous;
  let claimed=false,closed=false;
  let queue=Promise.resolve();
  let stoppedResolve:()=>void=()=>{};
  const stopped=new Promise<void>(resolve=>{stoppedResolve=resolve;});
  const offs:Array<()=>void>=[];
  const dispose=()=>{for(const off of offs.splice(0))off();};
  try{
  offs.push(await listen<string>('microphone-input',event=>{
    if(closed)return;
    queue=queue.then(()=>onAudio(nativeMicrophoneWave(event.payload))).catch(onError);
  }));
  offs.push(await listen('microphone-stopped',()=>stoppedResolve()));
  offs.push(await listen<string>('microphone-error',event=>onError(new Error(event.payload))));
    await invoke('start_microphone',{deviceId:deviceId&&deviceId!=='default'?deviceId:null});
    claimed=true;
  }catch(error){closed=true;dispose();releaseLease();throw error;}
  let closing:Promise<void>|undefined;
  return {
    finish:()=>closing??=(async()=>{
      try{
        if(claimed){
          const state=await invoke<{active:boolean}>('get_microphone_status');
          await invoke('stop_microphone');
          if(state.active)await stopped;
          claimed=false;
        }
        await queue;
      }finally{closed=true;dispose();releaseLease();}
    })(),
  };
}
