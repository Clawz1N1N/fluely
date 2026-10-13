import type { ProviderEntry } from './provider-types';
import type { Message } from '@/types';
export function imageMime(data:string):string {
  if(data.startsWith('iVBOR'))return 'image/png';
  if(data.startsWith('UklGR'))return 'image/webp';
  if(data.startsWith('R0lG'))return 'image/gif';
  return 'image/jpeg';
}

/** Conservative character budget for history only. Providers enforce exact token counts. */
export function fitModelHistory(entry:ProviderEntry,prompt:string,text:string,history:Message[]):Message[] {
  if(!entry.context_window)return history;
  // Keep room for output, image embeddings and tokenizer differences.
  let remaining=Math.max(0,Math.floor((entry.context_window-(entry.max_output_tokens??Math.min(4096,entry.context_window/4)))*2)-prompt.length-text.length-2048);
  const kept:Message[]=[];
  for(let i=history.length-1;i>=0;i--){const cost=JSON.stringify(history[i]).length;if(cost>remaining)break;kept.unshift(history[i]);remaining-=cost;}
  while(kept[0]?.role==='assistant')kept.shift();
  return kept;
}
export function outputParameters(entry:ProviderEntry):Record<string,number> {
  if(!entry.max_output_tokens)return {};
  return {[entry.preset==='google'?'maxOutputTokens':entry.preset==='openai-compatible'?'max_completion_tokens':'max_tokens']:entry.max_output_tokens};
}
