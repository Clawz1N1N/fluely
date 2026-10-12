import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export function providerFetch(input: string, init: RequestInit & {timeoutMs?:number}): Promise<Response> {
  const {timeoutMs=120000,...options}=init;
  const deadline=AbortSignal.timeout(timeoutMs);
  const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  // Native transport avoids WebView CORS for the user's arbitrary provider URLs.
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? tauriFetch(input, {...options,signal,connectTimeout:10000}) : fetch(input, {...options,signal});
}
export class ProviderHttpError extends Error {
  constructor(public status: number, public retryAfterSecs?: number) { super(`Помилка провайдера: HTTP ${status}`); }
  static fromResponse(response: Response): ProviderHttpError {
    const raw = response.headers.get('retry-after');
    const seconds = raw === null ? undefined : /^\d+$/.test(raw.trim())
      ? Number(raw) : Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000));
    return new ProviderHttpError(response.status, seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined);
  }
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
