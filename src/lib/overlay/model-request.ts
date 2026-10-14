import type { ProviderEntry } from './provider-types';
import type { Message } from '@/types';
export function imageMime(data:string):string {
  if(data.startsWith('iVBOR'))return 'image/png';
  if(data.startsWith('UklGR'))return 'image/webp';
  if(data.startsWith('R0lG'))return 'image/gif';
  return 'image/jpeg';
}
export function outputTokenCeiling(entry:ProviderEntry):number {
  return entry.max_output_tokens??Math.max(1,Math.min(4096,Math.floor((entry.context_window??16384)/4)));
}

/** Conservative character budget for history only. Providers enforce exact token counts. */
export function fitModelHistory(entry:ProviderEntry,prompt:string,text:string,history:Message[]):Message[] {
  if(!entry.context_window)return history;
  // Keep room for output, image embeddings and tokenizer differences.
  let remaining=Math.max(0,Math.floor((entry.context_window-outputTokenCeiling(entry))*2)-prompt.length-text.length-2048);
  const kept:Message[]=[];
  for(let i=history.length-1;i>=0;i--){const cost=JSON.stringify(history[i]).length;if(cost>remaining)break;kept.unshift(history[i]);remaining-=cost;}
  while(kept[0]?.role==='assistant')kept.shift();
  return kept;
}
export function outputParameters(entry:ProviderEntry):Record<string,number> {
  return {[entry.preset==='google'?'maxOutputTokens':entry.preset==='openai-compatible'?'max_completion_tokens':'max_tokens']:outputTokenCeiling(entry)};
}

/** UTF8 bytes bound text tokenization conservatively; images retain a generous floor.
 * Provider usage replaces the estimate when the completed response supplies it. */
export function estimateBrainTokens(prompt:string,history:Message[],text:string,images:string[]):number {
  const bytes=new TextEncoder().encode(JSON.stringify({prompt,history,text})).length;
  return bytes+256+images.reduce((sum,data)=>sum+Math.max(16384,data.length),0);
}

export function reasoningParameters(entry:ProviderEntry):Record<string,unknown> {
  const effort=entry.reasoning_effort??'off';
  if(entry.preset==='google') {
    if(/^gemini-3/i.test(entry.model??'')) {
      const pro=/pro/i.test(entry.model??'');
      const level=({off:pro?'low':'minimal',medium:pro?'high':'medium',xhigh:'high',max:'high'} as Record<string,string>)[effort]??effort;
      return {thinkingConfig:{thinkingLevel:level}};
    }
    // Non-thinking Gemini versions do not accept thinking configuration.
    if(effort==='off'&&!/gemini-(?:2\.5|.*thinking)/i.test(entry.model??''))return {};
    const budgets:Record<string,number>={off:/pro/i.test(entry.model??'')?128:0,low:1024,medium:4096,high:8192,xhigh:16384,max:/flash/i.test(entry.model??'')?24576:32768};
    return {thinkingConfig:effort in budgets?{thinkingBudget:budgets[effort]}:{thinkingLevel:effort}};
  }
  if(entry.preset==='anthropic') {
    if(effort==='off')return {thinking:{type:'disabled'}};
    if(/claude-(?:opus|sonnet)-4[-.]6/i.test(entry.model??''))return {thinking:{type:'adaptive'},output_config:{effort:['xhigh','max'].includes(effort)?(/sonnet/i.test(entry.model)?'high':'max'):effort}};
    const ceiling=outputTokenCeiling(entry);
    if(ceiling<=1024)throw new Error('Anthropic reasoning requires max output tokens above 1024.');
    const budgets:Record<string,number>={low:1024,medium:4096,high:8192,xhigh:16384,max:32768};
    return {thinking:{type:'enabled',budget_tokens:Math.min(budgets[effort]??1024,ceiling-1)},...(!(effort in budgets)?{output_config:{effort}}:{})};
  }
  if(effort==='off') {
    // Local llama.cpp exposes an explicit switch; cloud defaults vary by model.
    if(entry.provider_id?.startsWith('local-')||entry.id?.startsWith('fluely-local-'))return {chat_template_kwargs:{enable_thinking:false}};
    if(/^gpt-5(?:[-.]|$)/i.test(entry.model??'')&&!/pro/i.test(entry.model))return {reasoning_effort:/^gpt-5\.[12]/i.test(entry.model)?'none':'minimal'};
    return {};
  }
  return {reasoning_effort:effort};
}

export interface TokenUsage { input?:number; output?:number; total?:number }
export function tokenUsage(event:unknown):TokenUsage {
  if(!event||typeof event!=='object')return {};
  const object=event as Record<string,any>;
  const usage=object.usageMetadata??object.usage??object.message?.usage;
  if(!usage||typeof usage!=='object')return {};
  const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;
  const input=count(usage.prompt_tokens??usage.promptTokenCount??usage.input_tokens);
  const output=count(usage.completion_tokens??usage.candidatesTokenCount??usage.output_tokens);
  const cache=(count(usage.cache_read_input_tokens)??0)+(count(usage.cache_creation_input_tokens)??0);
  const thoughts=count(usage.thoughtsTokenCount)??0;
  return {input:input===undefined?undefined:input+cache,output:output===undefined?undefined:output+thoughts,total:count(usage.total_tokens??usage.totalTokenCount)};
}
export function readTokenUsage(event:unknown):number|undefined {
  const {input,output,total}=tokenUsage(event);
  return total??(input!==undefined&&output!==undefined?input+output:undefined);
}
