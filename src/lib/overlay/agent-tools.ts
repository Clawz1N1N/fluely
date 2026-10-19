import type {ProviderEntry} from './provider-types';
export interface AgentToolCall {id:string;type:'function';function:{name:string;arguments:string}}
/** This client exposes its real workspace state; it does not claim shell/file access. */
export function agentRequestOptions(entry:Pick<ProviderEntry,'preset'|'kind'>&Partial<ProviderEntry>){
  if(entry.kind!=='brain'||entry.variables?.FLUELY_AGENT_TOOLS==='off'||!(entry.preset==='openrouter'||/^https:\/\/openrouter\.ai(?:\/|$)/i.test(entry.base_url??'')))return null;
  return {headers:{'X-OpenRouter-Categories':'cli-agent'},body:{tools:[{type:'function',function:{name:'get_workspace_status',description:'Report whether a project filesystem is connected to Fluely. No shell execution or project file editing is available. User attachments are reference context, not a connected workspace.',parameters:{type:'object',properties:{},additionalProperties:false}}}],tool_choice:'auto'}};
}
export class ToolCallAccumulator {
  private calls=new Map<number,AgentToolCall>();
  private details=new Map<number,Record<string,unknown>>();
  private detailBytes=0;
  add(event:any):void {
    const choice=event?.choices?.[0],message=choice?.message??choice?.delta;
    // Preserve provider reasoning/signature records across a tool round; some
    // thinking models require these opaque records on the assistant message.
    if(Array.isArray(message?.reasoning_details))for(const [position,part] of message.reasoning_details.entries()){
      if(!part||typeof part!=='object')continue;
      const index=part.index??position;
      if(!Number.isInteger(index)||index<0||index>=64)throw new Error('Provider reasoning detail limit exceeded.');
      this.detailBytes+=JSON.stringify(part).length;
      if(this.detailBytes>65536)throw new Error('Provider reasoning detail limit exceeded.');
      const previous=this.details.get(index)??{},current={...previous,...part};
      for(const key of ['text','data','signature','summary'])if(typeof part[key]==='string')current[key]=String(previous[key]??'')+part[key];
      this.details.set(index,current);
    }
    if(!Array.isArray(message?.tool_calls))return;
    for(const [position,part] of message.tool_calls.entries()){
      const index=part.index??position;
      if(!Number.isInteger(index)||index<0||index>=8)throw new Error('Provider tool call limit exceeded.');
      const call=this.calls.get(index)??{id:'',type:'function' as const,function:{name:'',arguments:''}};
      if(typeof part.id==='string')call.id+=part.id;
      if(typeof part.function?.name==='string')call.function.name+=part.function.name;
      if(typeof part.function?.arguments==='string')call.function.arguments+=part.function.arguments;
      if(call.id.length>256||call.function.name.length>256||call.function.arguments.length>32768)throw new Error('Provider tool call limit exceeded.');
      this.calls.set(index,call);
    }
  }
  finish():AgentToolCall[]{
    const calls=[...this.calls.entries()].sort(([a],[b])=>a-b).map(([,value])=>value);
    if(calls.some(call=>!call.id||!call.function.name)||new Set(calls.map(call=>call.id)).size!==calls.length)throw new Error('Provider returned an invalid tool call.');
    return calls;
  }
  reasoningDetails(){return [...this.details.entries()].sort(([a],[b])=>a-b).map(([,value])=>value);}
}
export function agentToolReply(call:AgentToolCall){
  let content:Record<string,unknown>;
  try{
    const args=JSON.parse(call.function.arguments||'{}');
    if(call.function.name!=='get_workspace_status')content={error:'unsupported_tool',message:'This tool is unavailable. Answer the user’s text request using supplied context.'};
    else if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)content={error:'invalid_arguments',message:'get_workspace_status accepts an empty object.'};
    else content={workspace_connected:false,files:[],status:'awaiting_text_request',message:'No project filesystem is connected. Do not wait for tools or files. Answer the current user text request using the supplied conversation and attachment reference data; if no question is pending, await the next text request.'};
  }catch{content={error:'invalid_arguments',message:'Tool arguments must be a valid JSON object.'};}
  return {role:'tool' as const,tool_call_id:call.id,content:JSON.stringify(content)};
}
