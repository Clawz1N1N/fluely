import type {ProviderEntry,ProviderKind,ProviderStatus} from './provider-types';
interface Ports {pick(kind:ProviderKind,excluded:string[]):Promise<ProviderEntry|null>;status(kind:ProviderKind):Promise<ProviderStatus>;wait(milliseconds:number,signal:AbortSignal):Promise<void>}
/** Quota/429 neutral waits persist; terminal failures are attempted once per request. */
export async function selectRankedProvider(kind:ProviderKind,excluded:string[],signal:AbortSignal,ports:Ports):Promise<ProviderEntry> {
  while(!signal.aborted){
    const entry=await ports.pick(kind,excluded);if(entry)return entry;
    const status=await ports.status(kind);
    const enabled=status.providers.filter(provider=>provider.enabled&&provider.kind===kind);
    if(!enabled.length)throw new Error(`Налаштуйте провайдер ${kind} у налаштуваннях.`);
    if(enabled.every(provider=>excluded.includes(provider.id)))throw new Error(`Усі провайдери ${kind} відхилили запит. Перевірте ключі, моделі та адреси.`);
    await ports.wait(Math.min(1000,Math.max(100,(status.nextAllowedAt??Date.now()+1000)-Date.now())),signal);
  }
  throw new DOMException('Aborted','AbortError');
}
export function abortableDelay(milliseconds:number,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const stop=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},milliseconds);
    signal.addEventListener('abort',stop,{once:true});
  });
}
