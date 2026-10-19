export interface TranscriptSegment {text:string; speaker?:string; start?:number; end?:number; timestamp?:number}
export interface TranscriptionResult {text:string; segments:TranscriptSegment[]}
/** Retain supplied diarization/timing only; do not infer speaker identities. */
export function transcriptionResult(json:unknown):TranscriptionResult {
  const object=json&&typeof json==='object'?json as Record<string,unknown>:{};
  if(typeof object.text!=='string')throw new Error('STT returned a response without a transcript.');
  const segments:Array<TranscriptSegment>=[];
  for(const raw of Array.isArray(object.segments)?object.segments:[]){
    if(!raw||typeof raw!=='object')continue;
    const segment=raw as Record<string,unknown>;if(typeof segment.text!=='string'||!segment.text.trim())continue;
    const timing=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
    const speaker=segment.speaker??segment.speaker_id;
    segments.push({text:segment.text,speaker:typeof speaker==='string'||typeof speaker==='number'?String(speaker):undefined,start:timing(segment.start),end:timing(segment.end)});
  }
  return {text:object.text,segments};
}
