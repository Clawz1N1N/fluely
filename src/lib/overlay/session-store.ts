import type {HistoryEntry} from './contracts';

export interface SessionEvent {
  id:string;kind:'question'|'answer'|'transcript'|'audio'|'screenshot'|'vision'|'summary'|'file';timestamp:number;text:string;
  channel?:string;speaker?:string;audio_ref?:string;image_ref?:string;request_id?:number;
  main?:string;side?:string;speak?:string;start?:number;end?:number;
  mode?:'sleep'|'awake';incomplete?:boolean;
  through?:number;file_ref?:string;filename?:string;mime?:string;
  frame_index?:number;
}
export interface SessionSummary {id:string;title:string;created_at:number;updated_at:number;event_count:number}
export interface Session {id:string;title:string;created_at:number;updated_at:number;events:SessionEvent[];context_summary?:{text:string;through:number}}
export interface SessionMedia {base64:string;mime:string}
export interface SessionPorts {
  create(title:string):Promise<Session>;
  get(id:string):Promise<Session>;
  append(id:string,event:SessionEvent,media?:SessionMedia):Promise<SessionEvent>;
}
export function nativeSessionStore(invoke:<T=unknown>(command:string,args?:Record<string,unknown>)=>Promise<T>):SessionPorts {
  return {create:title=>invoke('create_chat_session',{id:crypto.randomUUID(),title}),
    get:sessionId=>invoke('get_chat_session',{sessionId}),
    append:(sessionId,event,media)=>invoke('append_chat_session_event',{sessionId,event,...(media?{media}:{})})};
}
export function sessionHistory(session:Session):HistoryEntry[]{
  const history:HistoryEntry[]=[];let pending:string[]=[];
  for(const event of session.events){
    if(event.mode==='sleep'||event.incomplete)continue;
    if(event.kind==='question')pending.push(event.text);
    else if(event.kind==='transcript')pending.push(`${event.channel??''}${event.speaker?' '+event.speaker:''} ${event.text}`.trim());
    else if(event.kind==='vision')pending.push(`[Visual scene] ${event.text}`);
    else if(event.kind==='answer'){
      history.push({role:'user',content:pending.join('\n')||'Проаналізуй знімок екрана.'},{role:'assistant',content:event.text});pending=[];
    }
  }
  // Preserve recorded unanswered context when returning to a session.
  if(pending.length)history.push({role:'user',content:pending.join('\n')});
  return history;
}
export function localSessionTitle(timestamp=Date.now()):string{return new Date(timestamp).toLocaleString();}
function restoreSummary(session:Session):Session {
  const summary=[...session.events].reverse().find(event=>event.kind==='summary'&&event.mode!=='sleep'&&Number.isInteger(event.through)&&event.through!>=0);
  if(summary)session.context_summary={text:summary.text,through:summary.through!};return session;
}
export function wavRecordingStart(bytes:Uint8Array,receivedAt:number):number{
  if(bytes.length<12)return receivedAt;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const name=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  if(name(0)!=='RIFF'||name(8)!=='WAVE')return receivedAt;
  let byteRate=0,dataLength=0;
  for(let offset=12;offset+8<=bytes.length;){
    const size=view.getUint32(offset+4,true);if(size>bytes.length-offset-8)break;
    if(name(offset)==='fmt '&&size>=16)byteRate=view.getUint32(offset+16,true);
    if(name(offset)==='data')dataLength+=size;
    offset+=8+size+(size%2);
  }
  return byteRate>0?Math.max(0,receivedAt-dataLength/byteRate*1000):receivedAt;
}
export async function recordingMedia(blob:Blob,receivedAt=Date.now()):Promise<{media:SessionMedia;timestamp:number}>{
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return {media:{mime:'audio/wav',base64:btoa(binary)},timestamp:wavRecordingStart(bytes,receivedAt)};
}
/** A serialized owner prevents simultaneous audio and capture events creating two chats. */
export class SessionCoordinator {
  current:Session|null=null;
  private pending:Promise<unknown>=Promise.resolve();
  constructor(private ports:SessionPorts,private changed:(session:Session|null)=>void){}
  private queue<T>(operation:()=>Promise<T>):Promise<T>{const next=this.pending.catch(()=>{}).then(operation);this.pending=next;return next;}
  append(event:Omit<SessionEvent,'id'>,media?:SessionMedia):Promise<SessionEvent>{return this.appendOwned(event,media).then(result=>result.event);}
  appendOwned(event:Omit<SessionEvent,'id'>,media?:SessionMedia):Promise<{event:SessionEvent;sessionId:string}>{return this.queue(async()=>{
    if(!this.current)this.current=await this.ports.create(localSessionTitle(event.timestamp));
    const sessionId=this.current.id;
    const saved=await this.ports.append(this.current.id,{id:crypto.randomUUID(),...event},media);
    this.current.events.push(saved);restoreSummary(this.current);this.current.updated_at=Math.max(this.current.updated_at,event.timestamp);this.changed(this.current);return {event:saved,sessionId};
  });}
  appendTo(sessionId:string,event:Omit<SessionEvent,'id'>):Promise<SessionEvent>{return this.queue(async()=>{
    const saved=await this.ports.append(sessionId,{id:crypto.randomUUID(),...event});
    if(this.current?.id===sessionId){this.current.events.push(saved);restoreSummary(this.current);this.changed(this.current);}return saved;
  });}
  select(id:string|null):Promise<Session|null>{return this.queue(async()=>{this.current=id?restoreSummary(await this.ports.get(id)):null;this.changed(this.current);return this.current;});}
  refresh(id:string):Promise<void>{return this.queue(async()=>{if(this.current?.id===id){this.current=restoreSummary(await this.ports.get(id));this.changed(this.current);}});}
}
