interface Utterance { text:string;rate:number;onboundary:((event:SpeechSynthesisEvent)=>unknown)|null;onend:((event:SpeechSynthesisEvent)=>unknown)|null;onerror:((event:SpeechSynthesisErrorEvent)=>unknown)|null }
type AudioPort=Pick<HTMLAudioElement,'currentTime'|'duration'|'play'|'pause'|'addEventListener'>;
interface Ports { render(text:string,signal:AbortSignal):Promise<Blob>;audio(url:string):AudioPort;url(blob:Blob):string;revoke(url:string):void;onError?(error:unknown):void }
/** Uses native/cloud audio while keeping the sentence queue's speech contract. */
export class AudioSpeechSynth {
  private generation=0;private abort?:AbortController;private current?:AudioPort;private objectUrl?:string;private paused=false;
  constructor(private ports:Ports){}
  speak(utterance:Utterance):void {
    this.cancel();const generation=this.generation;
    const abort=this.abort=new AbortController();
    void this.ports.render(utterance.text,abort.signal).then(async blob=>{
      if(generation!==this.generation||abort.signal.aborted)return;
      const url=this.objectUrl=this.ports.url(blob);const audio=this.current=this.ports.audio(url);
      const words=[...utterance.text.matchAll(/\S+/gu)];
      audio.addEventListener('timeupdate',()=>{
        if(generation!==this.generation||!Number.isFinite(audio.duration)||audio.duration<=0||!words.length)return;
        const word=words[Math.min(words.length-1,Math.floor(audio.currentTime/audio.duration*words.length))];
        utterance.onboundary?.({charIndex:word.index!,charLength:word[0].length} as SpeechSynthesisEvent);
      });
      audio.addEventListener('ended',()=>{
        if(generation!==this.generation)return;
        this.release();utterance.onend?.({} as SpeechSynthesisEvent);
      });
      audio.addEventListener('error',()=>{if(generation===this.generation){this.release();utterance.onerror?.({} as SpeechSynthesisErrorEvent);}});
      if(!this.paused)await audio.play();
    }).catch(error=>{if(generation===this.generation&&!abort.signal.aborted){this.ports.onError?.(error);this.release();utterance.onerror?.({} as SpeechSynthesisErrorEvent);}});
  }
  private release():void {this.current=undefined;if(this.objectUrl)this.ports.revoke(this.objectUrl);this.objectUrl=undefined;}
  cancel():void {this.generation++;this.abort?.abort();this.current?.pause();this.release();this.paused=false;}
  pause():void {this.paused=true;this.current?.pause();}
  resume():void {this.paused=false;void this.current?.play().catch(()=>{});}
  getVoices():SpeechSynthesisVoice[]{return [];}
}
