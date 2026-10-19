import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {t} from '@/lib/i18n';

export function providerFetch(input: string, init: RequestInit & {timeoutMs?:number}): Promise<Response> {
  const {timeoutMs=120000,...options}=init;
  const deadline=AbortSignal.timeout(timeoutMs);
  const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  // Native transport avoids WebView CORS for the user's arbitrary provider URLs.
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? tauriFetch(input, {...options,signal,connectTimeout:10000}) : fetch(input, {...options,signal});
}
export class ProviderHttpError extends Error {
  constructor(public status: number, public retryAfterSecs?: number, public responseDiagnostic?:string) { super(`${status?t('Provider error: HTTP {status}',{status}):t('Provider stream error')}${responseDiagnostic?` · ${responseDiagnostic}`:''}`); }
  static fromResponse(response: Response): ProviderHttpError {
    const raw = response.headers.get('retry-after');
    const seconds = raw === null ? undefined : /^\d+$/.test(raw.trim())
      ? Number(raw) : Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000));
    return new ProviderHttpError(response.status, seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined);
  }
  /** Only structured error messages are exposed, never arbitrary HTML/request bodies. */
  static async fromResponseBody(response:Response,secrets:string[]=[]):Promise<ProviderHttpError> {
    const error=this.fromResponse(response);
    if(response.body){
      const reader=response.body.getReader();const decoder=new TextDecoder();let text='',bytes=0;
      try {
        while(bytes<=16384){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>16384)break;text+=decoder.decode(part.value,{stream:true});}
        if(bytes<=16384){text+=decoder.decode();const diagnostic=providerErrorMessage(JSON.parse(text),secrets);if(diagnostic)return new ProviderHttpError(error.status,error.retryAfterSecs,diagnostic);}
      }catch{/* Malformed or large server bodies remain an HTTP status only. */}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    return error;
  }
  static fromEvent(event:unknown,secrets:string[]=[]):ProviderHttpError|null {
    if(!event||typeof event!=='object'||!('error' in event))return null;
    const object=event as {error?:{code?:unknown};code?:unknown};
    const status=Number(object.error?.code??object.code);
    return new ProviderHttpError(Number.isInteger(status)&&status>=400&&status<=599?status:0,undefined,providerErrorMessage(event,secrets)||'Provider returned a streaming error');
  }
}

export function providerErrorMessage(value:unknown,secrets:string[]=[]):string {
  if(!value||typeof value!=='object')return '';
  const object=value as {error?:unknown;message?:unknown};
  const error=object.error;
  const raw=typeof error==='string'?error:error&&typeof error==='object'?(error as {message?:unknown}).message:object.message;
  if(typeof raw!=='string')return '';
  let message=raw;
  const metadata=error&&typeof error==='object'?(error as {metadata?:unknown}).metadata:undefined;
  if(metadata&&typeof metadata==='object'){
    const detail=metadata as {raw?:unknown;provider_name?:unknown};
    if(typeof detail.raw==='string'&&detail.raw.length<=16384){
      try{const cause=JSON.parse(detail.raw);const nested=cause?.error?.message??cause?.message;if(typeof nested==='string'&&nested!==raw)message+=` · ${typeof detail.provider_name==='string'?detail.provider_name+': ':''}${nested}`;}catch{/* Do not expose arbitrary upstream server bodies. */}
    }
  }
  for(const secret of secrets.filter(secret=>secret.length>0).sort((a,b)=>b.length-a.length))message=message.split(secret).join('[redacted]');
  return message.replace(/\bBearer\s+\S+/gi,'Bearer [redacted]').replace(/\b(?:sk-|sk_or_|sk-or-|AIza)[A-Za-z0-9_-]{8,}/g,'[redacted]').replace(/([?&](?:api_key|key|token)=)[^\s&]+/gi,'$1[redacted]').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,600);
}

/** Decode SSE events rather than network chunks; EOF may terminate the last event. */
export async function* readEventStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal,timeoutMs=120000): AsyncGenerator<unknown> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let pending = '', data: string[] = [];
  const abort = () => { void reader.cancel().catch(() => {}); };
  const decodeEvent = (): unknown | undefined => {
    const value = data.join('\n'); data = [];
    if (!value || value === '[DONE]') return undefined;
    return JSON.parse(value);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (!signal?.aborted) {
      let timer:ReturnType<typeof setTimeout>|undefined;
      let result:ReadableStreamReadResult<Uint8Array>;
      try {
        result=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{
          timer=setTimeout(()=>{reject(new DOMException('Потік провайдера не відповідає.','TimeoutError'));void reader.cancel().catch(()=>{});},timeoutMs);
        })]);
      }finally{clearTimeout(timer);}
      pending += result.done ? decoder.decode() : decoder.decode(result.value, { stream: true });
      const lines = pending.split('\n'); pending = lines.pop() ?? '';
      if (result.done && pending) { lines.push(pending); pending = ''; }
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (!line) { const event = decodeEvent(); if (event !== undefined) yield event; }
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (result.done) {
        const event = decodeEvent(); if (event !== undefined) yield event;
        break;
      }
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
