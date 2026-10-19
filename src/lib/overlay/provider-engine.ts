import { invoke } from '@tauri-apps/api/core';
import { getSecret } from '../storage/secure.storage';
import { providerSecretKey } from '../storage/credential-store';
import { fetchAIResponse, buildEnhancedSystemPrompt } from '../functions/ai-response.function';
import { fetchSTT } from '../functions/stt.function';
import { getStreamingContent } from '../functions/common.function';
import { providerFetch, ProviderHttpError, readEventStream } from './network';
import {transcriptionResult,type TranscriptionResult} from './transcription';
import type { ProviderEntry, ProviderKind, ProviderStatus } from './provider-types';
import type { Message } from '@/types';
import {selectRankedProvider,abortableDelay} from './provider-selection';
import curl2Json from '@bany/curl-to-json';
import {deepVariableReplacer,getByPath} from '../functions/common.function';
import {discoverModels,type ModelInfo} from './model-catalog';
import {fitModelHistory,outputParameters,outputTokenCeiling,imageMime,reasoningParameters,tokenUsage,type TokenUsage} from './model-request';
import {agentRequestOptions,ToolCallAccumulator,agentToolReply} from './agent-tools';

const usageByAttempt=new WeakMap<ProviderEntry,TokenUsage>();
const completedToolAttempts=new WeakSet<ProviderEntry>();
export function providerTokenUsage(entry:ProviderEntry):TokenUsage|undefined {return usageByAttempt.get(entry);}
export class ProviderQuotaError extends Error {}
function requestSecrets(entry:ProviderEntry,variables:Record<string,string>):string[]{return Object.entries(variables).filter(([key])=>entry.secret_keys.includes(key)||/key|token|secret|password/i.test(key)).map(([,value])=>value);}
function observeUsage(entry:ProviderEntry,event:unknown):void {
  const next=tokenUsage(event),current=usageByAttempt.get(entry)??{};
  for(const key of ['input','output','total'] as const)if(next[key]!==undefined)current[key]=next[key];
  usageByAttempt.set(entry,current);
}
async function reserveTokens(entry:ProviderEntry,tokens:number,signal?:AbortSignal):Promise<void> {
  if(entry.tokenReservationId===undefined)return;
  const args={providerId:entry.id,tokenReservationId:entry.tokenReservationId};
  while(!signal?.aborted){
    try {await invoke('reserve_provider_tokens',{...args,tokens:Math.ceil(tokens)});return;}
    catch(error){
      if(!String(error).startsWith('Neutral mode'))throw new ProviderQuotaError(String(error));
      // Release the provisional allowance while waiting so two growing
      // concurrent requests cannot hold each other's required token budget.
      await invoke('reserve_provider_tokens',{...args,tokens:0});
    }
    await abortableDelay(1000,signal??new AbortController().signal);
  }
  throw new DOMException('Aborted','AbortError');
}

export async function providerVariables(entry: ProviderEntry): Promise<Record<string, string>> {
  const variables = { ...entry.variables };
  for (const key of entry.secret_keys) {
    const value = await getSecret(providerSecretKey(entry.credential_id||entry.id, key));
    if (value !== null) variables[key] = value;
  }
  return variables;
}
export async function pickProvider(kind: ProviderKind, excludeIds: string[] = [], preferredProviderId?:string,inputTokens?:number,inputTokensByProvider?:Record<string,number>): Promise<ProviderEntry | null> {
  try { return await invoke('pick_provider', { kind, needsImages: kind==='vision', excludeIds,preferredProviderId:preferredProviderId??null,inputTokens:inputTokens??null,inputTokensByProvider:inputTokensByProvider??null }); }
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
  // A tool exchange already reported each physical request independently.
  if(completedToolAttempts.delete(entry)){usageByAttempt.delete(entry);return;}
  const usage=usageByAttempt.get(entry);
  const cancelled=error instanceof Error&&error.name==='AbortError';
  // Missing/partial usage and failed requests retain the conservative reservation.
  const tokensUsed=error instanceof ProviderQuotaError?0:error===undefined?(usage?.total??(usage?.input!==undefined&&usage?.output!==undefined?usage.input+usage.output:undefined)):undefined;
  await invoke('report_provider_result', { providerId: entry.id, ok: error === undefined||error instanceof ProviderQuotaError||cancelled,
    retryAfterSecs: error instanceof ProviderHttpError ? error.retryAfterSecs ?? null : null,
    tokenReservationId:entry.tokenReservationId??null,tokensUsed:tokensUsed??null });
  usageByAttempt.delete(entry);
}

export async function transcribeRanked(audio:Blob,signal:AbortSignal=new AbortController().signal):Promise<string> {
  const excluded:string[]=[];let lastError:unknown;
  while(!signal.aborted){
    let entry:ProviderEntry;
    try{entry=await selectRankedProvider('stt',excluded,signal,{pick:pickProvider,status:providerStatus,wait:abortableDelay});}catch(error){if(!signal.aborted&&lastError&&excluded.length)throw lastError;throw error;}
    try{const text=await transcribeWithProvider(entry,audio,signal);await reportProvider(entry);return text;}
    catch(error){if(signal.aborted)throw error;lastError=error;await reportProvider(entry,error);if(error instanceof ProviderQuotaError)throw error;if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(entry.id);}
  }
  throw new DOMException('Aborted','AbortError');
}

export async function* streamBrain(entry: ProviderEntry, prompt: string, history: Message[], text: string, images: string[], signal: AbortSignal): AsyncGenerator<string> {
  const variables = await providerVariables(entry);
  const agent=agentRequestOptions(entry);
  if (entry.curl&&!agent) {
    const selectedVariables = Object.fromEntries(Object.entries(variables).flatMap(([key,value]) => [[key,value],[key.toLowerCase(),value]]));
    yield* fetchAIResponse({ provider: { id: entry.id, curl: entry.curl, streaming: entry.streaming, responseContentPath: entry.response_content_path },
      selectedProvider: {provider:entry.id,variables:{...selectedVariables,MODEL:entry.model,model:entry.model,MAX_TOKENS:String(outputTokenCeiling(entry)),max_tokens:String(outputTokenCeiling(entry)),REASONING_EFFORT:entry.reasoning_effort??'off',reasoning_effort:entry.reasoning_effort??'off'}},systemPrompt:prompt,history:fitModelHistory(entry,buildEnhancedSystemPrompt(prompt),text,history),userMessage:text,imagesBase64:images,signal,registryReserved:true,
      resetReasoning:true,resetAgentTools:entry.variables.FLUELY_AGENT_TOOLS==='off',requestOverrides:entry.preset==='google'?{generationConfig:{...outputParameters(entry),...reasoningParameters(entry)}}:{...outputParameters(entry),...reasoningParameters(entry)},
      beforeSend:async body=>reserveTokens(entry,new TextEncoder().encode(JSON.stringify(body)).length+images.reduce((sum,image)=>sum+Math.max(0,16384-image.length),0)+outputTokenCeiling(entry)+256,signal),
      onUsage:event=>observeUsage(entry,event) });
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
    body = {system_instruction:{parts:[{text:prompt}]},contents:[...history.map(m=>content(m.role,m.content)),{role:'user',parts}],generationConfig:{...outputParameters(entry),...reasoningParameters(entry)}};
  } else if(entry.preset==='anthropic') {
    if(apiKey)headers['x-api-key']=apiKey;
    headers['anthropic-version']='2023-06-01';
    url=`${entry.base_url.replace(/\/$/,'')}/messages`;
    const content=images.length?[...images.map(data=>({type:'image',source:{type:'base64',media_type:imageMime(data),data}})),{type:'text',text}]:text;
    body={model:entry.model,max_tokens:outputTokenCeiling(entry),stream:true,...reasoningParameters(entry),system:prompt,messages:[...history.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)})),{role:'user',content}]};
  } else {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const content = images.length ? [...images.map(data=>({type:'image_url',image_url:{url:`data:${imageMime(data)};base64,${data}`}})),{type:'text',text}] : text;
    url = `${entry.base_url.replace(/\/$/,'')}/chat/completions`;
    const supportsUsage=entry.preset==='openai'||entry.preset==='openrouter'||entry.provider_id?.startsWith('local-')||entry.id.startsWith('fluely-local-')||/^https:\/\/(?:api\.openai\.com|openrouter\.ai)(?:\/|$)/i.test(entry.base_url);
    body = {model:entry.model,stream:true,...(supportsUsage?{stream_options:{include_usage:true}}:{}),...outputParameters(entry),...reasoningParameters(entry),messages:[{role:'system',content:prompt},...history,{role:'user',content}]};
  }
  if(agent){Object.assign(headers,agent.headers);Object.assign(body as object,agent.body);}
  let attempt=entry;
  for(let round=0;round<2;round++){
    let failure:unknown;
    try{
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      // Each tool continuation is a real provider request with its own quota.
      const allowance=new TextEncoder().encode(JSON.stringify(body)).length+images.reduce((sum,image)=>sum+Math.max(0,16384-image.length),0)+outputTokenCeiling(entry)+256;
      if(round&&entry.tokenReservationId!==undefined){
        const next=await selectRankedProvider(entry.kind,[],signal,{pick:(kind,excluded,preferred)=>pickProvider(kind,excluded,preferred,Math.max(0,allowance-outputTokenCeiling(entry))),status:providerStatus,wait:abortableDelay},entry.id);
        if(next.id!==entry.id){await reportProvider(next,new ProviderQuotaError('Unused continuation reservation'));throw new ProviderQuotaError('The selected model is unavailable for the tool continuation. Retry when its budget recovers.');}
        attempt=next;
      }
      await reserveTokens(attempt,allowance,signal);
      const response=await providerFetch(url,{method:'POST',headers,body:JSON.stringify(body),signal});
      if(!response.ok)throw await ProviderHttpError.fromResponseBody(response,requestSecrets(entry,variables));
      if(!response.body)throw new Error('Порожній потік відповіді провайдера.');
      const tools=new ToolCallAccumulator();let content='';
      const consume=(event:unknown)=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');const error=ProviderHttpError.fromEvent(event,requestSecrets(entry,variables));if(error)throw error;observeUsage(attempt,event);tools.add(event);return getStreamingContent(event,'choices[0].message.content');};
      if(response.headers.get('content-type')?.includes('application/json')){
        const delta=consume(await response.json());if(delta){content+=delta;yield delta;}
      }else for await(const event of readEventStream(response.body,signal)){
        const delta=consume(event);if(delta){content+=delta;yield delta;}
      }
      const calls=tools.finish();if(!calls.length)return;
      if(!agent||round)throw new Error('Provider tool call limit reached. Select a model that can return a text answer.');
      if(entry.tokenReservationId!==undefined){
        const usage=usageByAttempt.get(entry);
        await reportProvider(entry);
        completedToolAttempts.add(entry);
        if(usage)usageByAttempt.set(entry,usage);
      }
      const request=body as {messages:unknown[];tool_choice:string};
      const details=tools.reasoningDetails();
      request.messages.push({role:'assistant',content:content||null,tool_calls:calls,...(details.length?{reasoning_details:details}:{})},...calls.map(agentToolReply));
      request.tool_choice='none';
    }catch(error){failure=error;throw error;}
    finally{if(round&&attempt!==entry){
      // Context occupancy belongs to the last request, not the sum of repeated
      // history across tool rounds. Billing is already settled per attempt.
      usageByAttempt.set(entry,{...usageByAttempt.get(attempt)});
      await reportProvider(attempt,signal.aborted?new DOMException('Aborted','AbortError'):failure);
    }}
  }
}

export async function transcribeWithProvider(entry: ProviderEntry, audio: Blob, signal?: AbortSignal,onMetadata?:(result:TranscriptionResult)=>void): Promise<string> {
  // Audio APIs rarely return token usage; retain a conservative byte reservation.
  await reserveTokens(entry,audio.size+(entry.max_output_tokens??16384),signal);
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
      body:JSON.stringify({contents:[{parts:[{text:'Transcribe the audio accurately. Return only the transcript, without commentary.'},{inline_data:{mime_type:audio.type||'audio/wav',data:btoa(binary)}}]}],generationConfig:outputParameters(entry)}),signal,
    });
    if(!response.ok)throw await ProviderHttpError.fromResponseBody(response,requestSecrets(entry,variables));
    const json=await response.json();observeUsage(entry,json);const text=json.candidates?.[0]?.content?.parts?.map((part:{text?:string})=>part.text??'').join('');
    if(typeof text!=='string')throw new Error('Google STT не повернув транскрипт.');return text;
  }
  const headers: Record<string,string>={};
  const key=variables.API_KEY??variables.api_key;if(key)headers.Authorization=`Bearer ${key}`;
  const body=new FormData();body.append('file',audio,'audio.wav');body.append('model',entry.model);
  if(entry.preset==='openai-compatible'&&/transcribe-diarize/i.test(entry.model)){
    body.append('response_format','diarized_json');body.append('chunking_strategy','auto');
  }else if(['openai-compatible','groq','local-whisper'].includes(entry.preset)&&/whisper/i.test(entry.model))body.append('response_format','verbose_json');
  const response=await providerFetch(`${entry.base_url.replace(/\/$/,'')}/audio/transcriptions`,{method:'POST',headers,body,signal});
  if(!response.ok)throw await ProviderHttpError.fromResponseBody(response,requestSecrets(entry,variables));
  const json=await response.json();observeUsage(entry,json);const result=transcriptionResult(json);onMetadata?.(result);
  return result.text;
}

/** Independent TTS providers share ranking and quotas, but return binary audio. */
export async function synthesizeWithProvider(entry:ProviderEntry,text:string,settings:{voice:string;rate:number;language:string},signal:AbortSignal):Promise<Blob> {
  await reserveTokens(entry,new TextEncoder().encode(text).length+256+(entry.preset==='google'?outputTokenCeiling(entry):0),signal);
  const variables=await providerVariables(entry);
  if(entry.curl){
    const values={...Object.fromEntries(Object.entries(variables).map(([key,value])=>[key.toUpperCase(),value])),
      MODEL:entry.model,TEXT:text,VOICE:settings.voice||'alloy',SPEED:String(settings.rate),LANGUAGE:settings.language};
    const request=curl2Json(entry.curl) as {url:string;header?:Record<string,string>;data?:unknown;method?:string};
    const response=await providerFetch(deepVariableReplacer(request.url,values),{method:request.method||'POST',
      headers:deepVariableReplacer(request.header??{'Content-Type':'application/json'},values),body:JSON.stringify(deepVariableReplacer(request.data??{},values)),signal});
    if(!response.ok)throw await ProviderHttpError.fromResponseBody(response,requestSecrets(entry,variables));
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
    body={contents:[{parts:[{text:`Speak in ${settings.language}: ${text}`}]}],generationConfig:{...outputParameters(entry),responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:settings.voice||'Kore'}}}}};
  }else if(key)headers.Authorization=`Bearer ${key}`;
  const response=await providerFetch(url,{method:'POST',headers,body:JSON.stringify(body),signal});
  if(!response.ok)throw await ProviderHttpError.fromResponseBody(response,requestSecrets(entry,variables));
  if(entry.preset!=='google')return response.blob();
  const json=await response.json();observeUsage(entry,json);const audio=json.candidates?.[0]?.content?.parts?.find((part:{inlineData?:unknown})=>part.inlineData)?.inlineData;
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
