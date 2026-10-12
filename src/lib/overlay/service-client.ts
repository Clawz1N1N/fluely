import { emitTo,listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { executeAction } from './action-client';
import type { ServiceSnapshot,ActionRequest } from './contracts';
/** Compatibility views submit to the same queue; they never own an AI request. */
export async function requestServiceAnswer(question:string,images:string[]=[],signal?:AbortSignal):Promise<string> {
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const id=crypto.randomUUID();
  let resolve!:(text:string)=>void,reject!:(error:Error)=>void;
  const response=new Promise<string>((done,fail)=>{resolve=done;reject=fail;});void response.catch(()=>{});
  const stop=()=>reject(new DOMException('Aborted','AbortError'));
  const off=await listen<ServiceSnapshot>('service-state',event=>{
    const state=event.payload;
    if(!state.clientIds.includes(id)||state.busy)return;
    if(state.error)reject(new Error(state.error));
    else resolve([state.main,state.side,state.speak].filter(Boolean).join('\n\n'));
  });
  signal?.addEventListener('abort',stop,{once:true});
  try {
    const request:ActionRequest={id,clientId:id,action:'ask',question,images,source:getCurrentWindow().label};
    await executeAction(request,{
      listen:receive=>listen('shell-action-result',event=>receive(event.payload as {id:string;ok:boolean;error?:string})),
      send:request=>emitTo('main','shell-action',request),
    });
    return await response;
  }finally{off();signal?.removeEventListener('abort',stop);}
}
