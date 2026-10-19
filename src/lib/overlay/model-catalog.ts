import type { ProviderEntry, ProviderKind } from './provider-types';
import { providerErrorMessage } from './network';

export interface ModelInfo {
  id:string; name:string; context_window:number|null; max_output_tokens:number|null;
  supports_images:boolean; supports_audio:boolean;
  reasoning_efforts?:string[];reasoning_mandatory?:boolean;
  /** Editor provenance keeps registry identity and budgets stable when a model is renamed. */
  provider_entry_id?:string;
}
export interface ProviderAccount {
  provider_id:string; credential_id:string; display_name:string; preset:string; base_url:string; kind:ProviderKind;
  provider_name?:string;
}
export const BUILTIN_PROVIDERS = [
  {id:'openai-compatible',name:'OpenAI',url:'https://api.openai.com/v1'},
  {id:'anthropic',name:'Anthropic Claude',url:'https://api.anthropic.com/v1'},
  {id:'google',name:'Google Gemini',url:'https://generativelanguage.googleapis.com/v1beta'},
  {id:'openrouter',name:'OpenRouter',url:'https://openrouter.ai/api/v1'},
  {id:'groq',name:'Groq',url:'https://api.groq.com/openai/v1'},
  {id:'mistral',name:'Mistral',url:'https://api.mistral.ai/v1'},
  {id:'cohere',name:'Cohere',url:'https://api.cohere.ai/compatibility/v1'},
  {id:'deepseek',name:'DeepSeek',url:'https://api.deepseek.com/v1'},
  {id:'xai',name:'xAI Grok',url:'https://api.x.ai/v1'},
  {id:'perplexity',name:'Perplexity',url:'https://api.perplexity.ai'},
  {id:'cerebras',name:'Cerebras',url:'https://api.cerebras.ai/v1'},
  {id:'ollama',name:'Ollama',url:'http://localhost:11434/v1'},
  {id:'lm-studio',name:'LM Studio',url:'http://localhost:1234/v1'},
  {id:'local-whisper',name:'Whisper server',url:'http://localhost:8080/v1'},
  {id:'system-stt',name:'Windows STT',url:'http://localhost'},
] as const;
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const positive=(...values:unknown[]):number|null=>{
  for(const value of values)if(typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=4_294_967_295)return value;
  return null;
};
function capability(value:unknown):boolean { return value===true || record(value).supported===true; }

/** Unknown modalities stay unchecked. A model name is never evidence of support. */
export function normalizeModels(body:unknown,preset:string):ModelInfo[] {
  const json=record(body),raw=json.data??json.models;
  if(!Array.isArray(raw))throw new Error('Model list response is invalid');
  const result=new Map<string,ModelInfo>();
  for(const value of raw){
    const m=record(value),id=typeof m.id==='string'?m.id:typeof m.name==='string'?m.name.replace(/^models\//,''):'';
    if(!id)continue;
    const arch=record(m.architecture),cap=record(m.capabilities),top=record(m.top_provider);
    const reasoning=record(m.reasoning);
    const knownEfforts=Array.isArray(reasoning.supported_efforts)?reasoning.supported_efforts.filter((value):value is string=>typeof value==='string'&&/^[a-z][a-z_-]*$/.test(value)).map(value=>value==='none'?'off':value).filter(value=>reasoning.mandatory!==true||value!=='off'):undefined;
    const modalities=Array.isArray(arch.input_modalities)?arch.input_modalities:Array.isArray(m.input_modalities)?m.input_modalities:[];
    result.set(id,{id,...(knownEfforts?.length?{reasoning_efforts:knownEfforts,reasoning_mandatory:reasoning.mandatory===true}:{}),name:typeof m.display_name==='string'?m.display_name:typeof m.displayName==='string'?m.displayName:typeof m.name==='string'&&preset!=='google'?m.name:id,
      context_window:positive(m.context_length,m.max_context_length,m.max_input_tokens,m.inputTokenLimit,m.context_window),
      max_output_tokens:positive(top.max_completion_tokens,m.max_tokens,m.outputTokenLimit,m.max_output_tokens),
      supports_images:modalities.includes('image')||capability(cap.image_input)||capability(cap.vision)||capability(cap.image)||m.supports_images===true,
      supports_audio:modalities.includes('audio')||capability(cap.audio_input)||capability(cap.audio)||m.supports_audio===true});
  }
  return [...result.values()];
}
export interface DiscoveryResponse {ok:boolean;status?:number;json():Promise<unknown>}
export type DiscoveryFetch=(url:string,init:{headers:Record<string,string>;signal?:AbortSignal})=>Promise<DiscoveryResponse>;
async function discoveryRequest(url:URL,label:string,headers:Record<string,string>,key:string|undefined,fetcher:DiscoveryFetch,signal?:AbortSignal):Promise<DiscoveryResponse> {
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    let response:DiscoveryResponse;
    try{response=await fetcher(url.href,{headers,signal});}
    catch(error){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      throw new Error(providerErrorMessage({message:error instanceof Error?error.message:typeof error==='string'?error:'Model discovery connection failed'},key?[key]:[])||'Model discovery connection failed');
    }
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(!response.ok){
      let detail='';try{detail=providerErrorMessage(await response.json(),key?[key]:[]);}catch{/* Status is sufficient for malformed error bodies. */}
      throw new Error(`${label} (${response.status??'HTTP'})${detail?` · ${detail}`:''}`);
    }
    return response;
}
/** Authenticate public-catalogue providers before discovery or replacing a saved key. */
export async function validateDiscoveryCredential(account:Pick<ProviderAccount,'preset'|'base_url'>,key:string|undefined,fetcher:DiscoveryFetch,signal?:AbortSignal):Promise<void> {
  if(account.preset!=='openrouter')return;
  if(!key?.trim())throw new Error('Enter an API key before fetching models');
  // /key authenticates without generating tokens or consuming credits.
  await discoveryRequest(new URL(account.base_url.replace(/\/$/,'')+'/key'),'API key validation failed',{Authorization:`Bearer ${key}`},key,fetcher,signal);
}
/** Fetch every page; keys remain headers and never appear in URLs or errors. */
export async function discoverModels(account:Pick<ProviderAccount,'preset'|'base_url'>,key:string|undefined,fetcher:DiscoveryFetch,signal?:AbortSignal):Promise<ModelInfo[]> {
  const root=new URL(account.preset==='cohere'?'https://api.cohere.ai/v1/models':account.base_url.replace(/\/$/,'')+'/models');
  const headers:Record<string,string>={};
  if(account.preset==='anthropic'){headers['anthropic-version']='2023-06-01';if(key)headers['x-api-key']=key;root.searchParams.set('limit','1000');}
  else if(account.preset==='google'){if(key)headers['x-goog-api-key']=key;root.searchParams.set('pageSize','1000');}
  else if(key)headers.Authorization=`Bearer ${key}`;
  await validateDiscoveryCredential(account,key,fetcher,signal);
  if(account.preset==='cohere'){root.searchParams.set('endpoint','chat');root.searchParams.set('page_size','1000');}
  const all=new Map<string,ModelInfo>(),seen=new Set<string>();let url=root;
  for(let page=0;page<100;page++){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(seen.has(url.href))throw new Error('Model list pagination repeated');seen.add(url.href);
    const response=await discoveryRequest(url,'Model list request failed',headers,key,fetcher,signal);
    let body:unknown;
    try{body=await response.json();}catch{throw new Error('Model list response is invalid');}
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const json=record(body);for(const model of normalizeModels(json,account.preset))all.set(model.id,model);
    if(account.preset==='google'&&typeof json.nextPageToken==='string'&&json.nextPageToken){url=new URL(root);url.searchParams.set('pageToken',json.nextPageToken);}
    else if(account.preset==='cohere'&&typeof json.next_page_token==='string'&&json.next_page_token){url=new URL(root);url.searchParams.set('page_token',json.next_page_token);}
    else if(json.has_more===true&&typeof json.last_id==='string'&&json.last_id){url=new URL(root);url.searchParams.set('after_id',json.last_id);}
    else if(typeof json.next==='string'&&json.next){const next=new URL(json.next,url);if(next.origin!==root.origin)throw new Error('Model list pagination changed host');url=next;}
    else return [...all.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  throw new Error('Model list pagination exceeded 100 pages');
}

export class SelectionHistory {
  private states:string[][];private index=0;
  constructor(initial:string[]=[]){this.states=[[...new Set(initial)]];}
  get current(){return [...this.states[this.index]];}
  get canBack(){return this.index>0;}get canForward(){return this.index<this.states.length-1;}
  set(next:string[]){const unique=[...new Set(next)];if(JSON.stringify([...unique].sort())===JSON.stringify([...this.current].sort()))return this.current;
    this.states=this.states.slice(0,this.index+1);this.states.push(unique);this.index++;return this.current;}
  back(){if(this.canBack)this.index--;return this.current;}forward(){if(this.canForward)this.index++;return this.current;}
}
export function modelEntries(account:ProviderAccount,models:ModelInfo[],existing:ProviderEntry[]):ProviderEntry[] {
  const identities=new Set<string>();
  return models.map((model,index)=>{
    model={...model,id:model.id.trim(),name:model.name.trim()};
    if(!model.id||!model.name)throw new Error('Model ID and display name are required');
    if(identities.has(model.id))throw new Error('Model IDs must be unique within an account');
    identities.add(model.id);
    for(const value of [model.context_window,model.max_output_tokens])if(value!=null&&(!Number.isInteger(value)||value<=0||value>4_294_967_295))throw new Error('Token capacity must be a positive whole number.');
    if(model.context_window!=null&&model.max_output_tokens!=null&&model.max_output_tokens>model.context_window)throw new Error('Output tokens cannot exceed context window');
    const prior=existing.find(p=>(p.credential_id||p.id)===account.credential_id&&p.kind===account.kind&&(model.provider_entry_id?p.id===model.provider_entry_id:p.model===model.id));
    const efforts=model.reasoning_efforts?[...(prior?.reasoning_efforts??model.reasoning_efforts)].filter(value=>!model.reasoning_mandatory||value!=='off'):undefined;
    const effort=efforts?(prior?.reasoning_effort&&efforts.includes(prior.reasoning_effort)?prior.reasoning_effort:efforts.includes('off')?'off':model.reasoning_efforts![model.reasoning_efforts!.length-1]):undefined;
    return {...prior,id:prior?.id??`${account.credential_id}:${account.kind}:${encodeURIComponent(model.id)}`,
      ...(efforts&&effort?{reasoning_efforts:[...new Set([...efforts,effort])],reasoning_effort:effort}:{}),
      ...account,model:model.id,model_display_name:model.name,supports_images:model.supports_images,supports_audio:model.supports_audio,
      context_window:model.context_window,max_output_tokens:model.max_output_tokens,
      rank:prior?.rank??index,enabled:prior?.enabled??true,
      limit_per_second:prior?.limit_per_second??0,limit_per_minute:prior?.limit_per_minute??0,limit_per_hour:prior?.limit_per_hour??0,limit_per_day:prior?.limit_per_day??0,
      curl:prior?.preset===account.preset&&prior.base_url===account.base_url?prior.curl:null,streaming:prior?.streaming??true,response_content_path:prior?.response_content_path??(account.kind==='stt'?'text':'choices.0.message.content'),variables:prior?.variables??{},secret_keys:prior?.secret_keys??[]};
  });
}
