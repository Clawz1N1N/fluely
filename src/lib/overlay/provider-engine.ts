import { invoke } from '@tauri-apps/api/core';
import { getSecret } from '../storage/secure.storage';
import { providerSecretKey } from '../storage/credential-store';
import { fetchAIResponse, buildEnhancedSystemPrompt } from '../functions/ai-response.function';
import { fetchSTT } from '../functions/stt.function';
import { getStreamingContent } from '../functions/common.function';
import { providerFetch, ProviderHttpError, readEventStream } from './network';
import type { ProviderEntry, ProviderKind, ProviderStatus } from './provider-types';
import type { Message } from '@/types';
import {selectRankedProvider,abortableDelay} from './provider-selection';
import curl2Json from '@bany/curl-to-json';
import {deepVariableReplacer,getByPath} from '../functions/common.function';
import {discoverModels,type ModelInfo} from './model-catalog';
import {fitModelHistory,outputParameters,imageMime} from './model-request';

export async function providerVariables(entry: ProviderEntry): Promise<Record<string, string>> {
  const variables = { ...entry.variables };
  for (const key of entry.secret_keys) {
    const value = await getSecret(providerSecretKey(entry.credential_id||entry.id, key));
    if (value !== null) variables[key] = value;
  }
  return variables;
}
export async function pickProvider(kind: ProviderKind, excludeIds: string[] = [], preferredProviderId?:string): Promise<ProviderEntry | null> {
  try { return await invoke('pick_provider', { kind, needsImages: kind==='vision', excludeIds,preferredProviderId:preferredProviderId??null }); }
  catch(error) { if(String(error).startsWith('Neutral mode'))return null;throw error; }
}
export async function providerStatus(kind: ProviderKind = 'brain'): Promise<ProviderStatus> {
  return invoke('get_providers_status', { kind });
}
export async function fetchProviderModels(entry:ProviderEntry,enteredKey?:string,signal?:AbortSignal):Promise<ModelInfo[]> {
  const variables=enteredKey===undefined?await providerVariables(entry):{};
  const key=enteredKey??variables.API_KEY??variables.api_key;
  return discoverModels(entry,key,providerFetch,signal);
}
export async function reportProvider(entry: ProviderEntry, error?: unknown): Promise<void> {
  await invoke('report_provider_result', { providerId: entry.id, ok: error === undefined,
    retryAfterSecs: error instanceof ProviderHttpError ? error.retryAfterSecs ?? null : null });
}

export async function transcribeRanked(audio:Blob,signal:AbortSignal=new AbortController().signal):Promise<string> {
  const excluded:string[]=[];
  while(!signal.aborted){
    const entry=await selectRankedProvider('stt',excluded,signal,{pick:pickProvider,status:providerStatus,wait:abortableDelay});
    try{const text=await transcribeWithProvider(entry,audio,signal);await reportProvider(entry);return text;}
    catch(error){if(signal.aborted)throw error;await reportProvider(entry,error);if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(entry.id);}
  }
  throw new DOMException('Aborted','AbortError');
}

export async function* streamBrain(entry: ProviderEntry, prompt: string, history: Message[], text: string, images: string[], signal: AbortSignal): AsyncGenerator<string> {
  const variables = await providerVariables(entry);
  if (entry.curl) {
    const selectedVariables = Object.fromEntries(Object.entries(variables).flatMap(([key,value]) => [[key,value],[key.toLowerCase(),value]]));
    yield* fetchAIResponse({ provider: { id: entry.id, curl: entry.curl, streaming: entry.streaming, responseContentPath: entry.response_content_path },
      selectedProvider: {provider:entry.id,variables:selectedVariables},systemPrompt:prompt,history,userMessage:text,imagesBase64:images,signal,registryReserved:true });
    return;
  }
  prompt=buildEnhancedSystemPrompt(prompt);
  history=fitModelHistory(entry,prompt,text,history);
  const headers: Record<string,string> = { 'Content-Type':'application/json' };
  const apiKey = variables.API_KEY ?? variables.api_key;
  let url: string, body: unknown;
  if (entry.preset === 'google') {
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    const content = (role: string, value: Message['content']) => ({role: role === 'assistant' ? 'model':'user', parts: [{text:typeof value === 'string' ? value : JSON.stringify(value)}]});
    const parts: unknown[] = [{text}];
    for (const data of images) parts.push({inline_data:{mime_type:imageMime(data),data}});
    url = `${entry.base_url.replace(/\/$/,'')}/models/${encodeURIComponent(entry.model)}:streamGenerateContent?alt=sse`;
    body = {system_instruction:{parts:[{text:prompt}]},contents:[...history.map(m=>content(m.role,m.content)),{role:'user',parts}],generationConfig:outputParameters(entry)};
  } else if(entry.preset==='anthropic') {
    if(apiKey)headers['x-api-key']=apiKey;
    headers['anthropic-version']='2023-06-01';
    url=`${entry.base_url.replace(/\/$/,'')}/messages`;
    const content=images.length?[...images.map(data=>({type:'image',source:{type:'base64',media_type:imageMime(data),data}})),{type:'text',text}]:text;
    body={model:entry.model,max_tokens:entry.max_output_tokens??4096,stream:true,system:prompt,messages:[...history.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)})),{role:'user',content}]};
  } else {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const content = images.length ? [...images.map(data=>({type:'image_url',image_url:{url:`data:${imageMime(data)};base64,${data}`}})),{type:'text',text}] : text;
    url = `${entry.base_url.replace(/\/$/,'')}/chat/completions`;
    body = {model:entry.model,stream:true,...outputParameters(entry),messages:[{role:'system',content:prompt},...history,{role:'user',content}]};
  }
  const response = await providerFetch(url,{method:'POST',headers,body:JSON.stringify(body),signal});
  if (!response.ok) throw ProviderHttpError.fromResponse(response);
  if (!response.body) throw new Error('Порожній потік відповіді провайдера.');
  for await (const event of readEventStream(response.body,signal)) {
    const delta=getStreamingContent(event,'choices[0].message.content');
    if(delta)yield delta;
  }
}

export async function transcribeWithProvider(entry: ProviderEntry, audio: Blob, signal?: AbortSignal): Promise<string> {
  if(entry.preset==='local-gguf-asr'){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const bytes=new Uint8Array(await audio.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    const text=await invoke<string>('transcribe_gguf_asr_audio',{audioBase64:btoa(binary),providerId:entry.id});
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');return text;
  }
  if(entry.preset==='system-stt'){
    const bytes=new Uint8Array(await audio.arrayBuffer());
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return invoke('transcribe_system_audio',{audioBase64:btoa(binary),language:entry.model});
  }
  const variables=await providerVariables(entry);
  if(entry.curl)return fetchSTT({provider:{id:entry.id,curl:entry.curl,responseContentPath:entry.response_content_path},selectedProvider:{provider:entry.id,variables},audio,signal,registryReserved:true});
  if(entry.preset==='google'){
    const key=variables.API_KEY??variables.api_key;
    const bytes=new Uint8Array(await audio.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    const response=await providerFetch(`${entry.base_url.replace(/\/$/,'')}/models/${encodeURIComponent(entry.model)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-goog-api-key':key}:{})},
      body:JSON.stringify({contents:[{parts:[{text:'Transcribe the audio accurately. Return only the transcript, without commentary.'},{inline_data:{mime_type:audio.type||'audio/wav',data:btoa(binary)}}]}]}),signal,
    });
    if(!response.ok)throw ProviderHttpError.fromResponse(response);
    const json=await response.json();const text=json.candidates?.[0]?.content?.parts?.map((part:{text?:string})=>part.text??'').join('');
    if(typeof text!=='string')throw new Error('Google STT не повернув транскрипт.');return text;
  }
  const headers: Record<string,string>={};
  const key=variables.API_KEY??variables.api_key;if(key)headers.Authorization=`Bearer ${key}`;
  const body=new FormData();body.append('file',audio,'audio.wav');body.append('model',entry.model);
  const response=await providerFetch(`${entry.base_url.replace(/\/$/,'')}/audio/transcriptions`,{method:'POST',headers,body,signal});
  if(!response.ok)throw ProviderHttpError.fromResponse(response);
  const json=await response.json();if(typeof json.text!=='string')throw new Error('STT повернув відповідь без транскрипту.');
  return json.text;
}

/** Independent TTS providers share ranking and quotas, but return binary audio. */
export async function synthesizeWithProvider(entry:ProviderEntry,text:string,settings:{voice:string;rate:number;language:string},signal:AbortSignal):Promise<Blob> {
  const variables=await providerVariables(entry);
  if(entry.curl){
    const values={...Object.fromEntries(Object.entries(variables).map(([key,value])=>[key.toUpperCase(),value])),
      MODEL:entry.model,TEXT:text,VOICE:settings.voice||'alloy',SPEED:String(settings.rate),LANGUAGE:settings.language};
    const request=curl2Json(entry.curl) as {url:string;header?:Record<string,string>;data?:unknown;method?:string};
    const response=await providerFetch(deepVariableReplacer(request.url,values),{method:request.method||'POST',
      headers:deepVariableReplacer(request.header??{'Content-Type':'application/json'},values),body:JSON.stringify(deepVariableReplacer(request.data??{},values)),signal});
    if(!response.ok)throw ProviderHttpError.fromResponse(response);
    if(!response.headers.get('content-type')?.includes('json'))return response.blob();
    const data=getByPath(await response.json(),entry.response_content_path);
    if(typeof data!=='string')throw new Error('TTS не повернув аудіо за вказаним шляхом відповіді.');
    return new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:variables.AUDIO_MIME||'audio/wav'});
  }
  const headers:Record<string,string>={'Content-Type':'application/json'};
  const key=variables.API_KEY??variables.api_key;
  let url=`${entry.base_url.replace(/\/$/,'')}/audio/speech`;
  let body:unknown={model:entry.model,input:text,voice:settings.voice||variables.VOICE||'alloy',speed:settings.rate,response_format:'mp3'};
  if(entry.preset==='google'){
    if(key)headers['x-goog-api-key']=key;
    url=`${entry.base_url.replace(/\/$/,'')}/models/${encodeURIComponent(entry.model)}:generateContent`;
    body={contents:[{parts:[{text:`Speak in ${settings.language}: ${text}`}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:settings.voice||'Kore'}}}}};
  }else if(key)headers.Authorization=`Bearer ${key}`;
  const response=await providerFetch(url,{method:'POST',headers,body:JSON.stringify(body),signal});
  if(!response.ok)throw ProviderHttpError.fromResponse(response);
  if(entry.preset!=='google')return response.blob();
  const json=await response.json();const audio=json.candidates?.[0]?.content?.parts?.find((part:{inlineData?:unknown})=>part.inlineData)?.inlineData;
  if(!audio?.data)throw new Error('Google TTS не повернув аудіо.');
  const bytes=Uint8Array.from(atob(audio.data),char=>char.charCodeAt(0));
  if(!/pcm|L16/i.test(audio.mimeType??''))return new Blob([bytes],{type:audio.mimeType??'audio/wav'});
  const sampleRate=Number(/rate=(\d+)/.exec(audio.mimeType)?.[1]??24000);
  const header=new ArrayBuffer(44),view=new DataView(header);
  const label=(offset:number,value:string)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
  label(0,'RIFF');view.setUint32(4,36+bytes.length,true);label(8,'WAVE');label(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,bytes.length,true);
  return new Blob([header,bytes],{type:'audio/wav'});
}
