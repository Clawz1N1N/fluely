import type {SessionEvent} from './session-store';
export function groupedSessionEvents(events:SessionEvent[]):Array<{event:SessionEvent;related:SessionEvent[]}>{
  const consumed=new Set<string>();
  const result=events.filter(event=>event.kind==='audio'||event.kind==='screenshot').map(event=>{
    const related=events.filter(child=>event.kind==='audio'?child.kind==='transcript'&&!!event.audio_ref&&child.audio_ref===event.audio_ref:
      child.kind==='vision'&&event.request_id!==undefined&&child.request_id===event.request_id&&(event.frame_index!==undefined?child.frame_index===event.frame_index:child.channel===event.text));
    related.forEach(child=>consumed.add(child.id));return{event,related};
  });
  const grouped=new Map(result.map(group=>[group.event.id,group]));
  return events.filter(event=>!consumed.has(event.id)).map(event=>grouped.get(event.id)??{event,related:[]});
}
