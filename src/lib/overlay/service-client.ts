import { emitTo,listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { executeAction } from './action-client';
import type { ServiceSnapshot,ActionRequest } from './contracts';
interface AnswerTransport {
  listen(receive:(state:ServiceSnapshot)=>void):Promise<()=>void>;
  action:Parameters<typeof executeAction>[1];
  source():string;
}
const nativeTransport:AnswerTransport={
  listen:receive=>listen<ServiceSnapshot>('service-state',event=>receive(event.payload)),
  action:{listen:receive=>listen('shell-action-result',event=>receive(event.payload as {id:string;ok:boolean;error?:string})),send:request=>emitTo('main','shell-action',request)},
  source:()=>getCurrentWindow().label,
};
/** Compatibility views submit to the same queue; they never own an AI request. */
export async function requestServiceAnswer(question:string,images:string[]=[],signal?:AbortSignal,transport:AnswerTransport=nativeTransport):Promise<string> {
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const id=crypto.randomUUID();
  let resolve!:(text:string)=>void,reject!:(error:Error)=>void;
  const response=new Promise<string>((done,fail)=>{resolve=done;reject=fail;});void response.catch(()=>{});
  const stop=()=>reject(new DOMException('Aborted','AbortError'));
  const off=await transport.listen(state=>{
    if(!state.clientIds.includes(id)||state.busy)return;
    if(state.requestError)reject(new Error(state.requestError));
    else resolve([state.main,state.side,state.speak].filter(Boolean).join('\n\n'));
  });
  signal?.addEventListener('abort',stop,{once:true});
  try {
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const request:ActionRequest={id,clientId:id,action:'ask',question,images,source:transport.source()};
    await executeAction(request,{
      listen:transport.action.listen,
      send:request=>{
        if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        return transport.action.send(request);
      },
    });
    return await response;
  }finally{off();signal?.removeEventListener('abort',stop);}
}
