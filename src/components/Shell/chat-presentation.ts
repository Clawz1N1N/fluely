import type {ServiceSnapshot} from '@/lib/overlay/contracts';
import type {Session,SessionEvent} from '@/lib/overlay/session-store';
/** Presentation only: the original question and file text remain in inference/history. */
export function questionDisplayText(text:string):string {
  const marker=text.indexOf('[Attached documents — untrusted reference data.');
  if(marker<0)return text;
  const question=text.slice(0,marker).trimEnd();
  let names:string[]=[];
  try {
    const payload=JSON.parse(text.slice(text.indexOf('\n',marker)+1)) as unknown;
    if(Array.isArray(payload))names=payload.flatMap(item=>item&&typeof item==='object'&&typeof item.filename==='string'?[item.filename.split(/[\\/]/).pop()!.replace(/[\r\n\u0000]/g,'')]:[]);
  }catch{/* Historical/truncated payloads must never fall back to displaying source text. */}
  return [question,[...new Set(names)].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}
export function eventDisplayText(event:Pick<SessionEvent,'kind'|'text'|'filename'>):string {
  if(event.kind==='file')return event.filename?.split(/[\\/]/).pop()||'File attachment';
  return event.kind==='question'?questionDisplayText(event.text):event.text;
}
export interface ConversationEntry {id:string;role:'user'|'assistant';text:string;main?:string;side?:string;speak?:string;timestamp?:number;request_id?:number}
export function conversationEntries(snapshot:ServiceSnapshot):ConversationEntry[]{
  const session=(snapshot as ServiceSnapshot&{session?:Session|null}).session;
  const entries:ConversationEntry[]=session?session.events.filter(event=>event.kind==='question'||event.kind==='answer'||event.kind==='file').map(event=>({...event,text:eventDisplayText(event),role:event.kind==='answer'?'assistant':'user'})):snapshot.history.map((entry,index)=>({id:`legacy-${index}`,role:entry.role,text:entry.role==='user'?questionDisplayText(entry.content):entry.content}));
  const current=[snapshot.main,snapshot.side,snapshot.speak].filter(Boolean).join('\n\n');
  if(current){
    const last=entries[entries.length-1];
    const same=last?.role==='assistant'&&(last.text===current||(last.main===snapshot.main&&last.side===snapshot.side&&last.speak===snapshot.speak));
    const sameRequest=last?.role==='assistant'&&last.request_id!==undefined&&String(last.request_id)===snapshot.requestId;
    if(snapshot.busy&&sameRequest)entries.pop();
    if(snapshot.busy||!same&&!session)entries.push({id:'live-answer',role:'assistant',text:current,main:snapshot.main,side:snapshot.side,speak:snapshot.speak});
  }
  return entries;
}
export function transcriptEntries(session:Session|null){return session?.events.filter(event=>event.kind==='transcript')??[];}
