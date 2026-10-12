import type { ActionRequest } from './contracts';
interface Result {id:string;ok:boolean;error?:string}
interface Ports {listen(receive:(result:Result)=>void):Promise<()=>void>;send(request:ActionRequest):Promise<unknown>}
export async function executeAction(request:ActionRequest,ports:Ports):Promise<void> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const result=new Promise<void>((done,fail)=>{resolve=done;reject=fail;});
  // Install before send; in-process tests and fast native IPC can reply immediately.
  const off=await ports.listen(value=>{
    if(value.id!==request.id)return;
    if(value.ok)resolve();else reject(new Error(value.error||'Не вдалося виконати дію.'));
  });
  // Attach a rejection handler before awaiting send to avoid an early rejection race.
  const completion=result.catch(error=>{throw error;});void completion.catch(()=>{});
  try {
    timer=setTimeout(()=>reject(new Error('Служба не підтвердила дію за 30 секунд.')),30000);
    await ports.send(request);await completion;
  }finally{clearTimeout(timer);off();}
}
