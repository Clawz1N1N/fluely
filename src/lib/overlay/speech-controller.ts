import type { SpeechState } from './contracts';
export interface SpeechSettings { enabled:boolean;rate:number;language:string;voice:string;stream:boolean;backend?:string }
type Utterance = Pick<SpeechSynthesisUtterance,'text'|'lang'|'rate'|'voice'|'onend'|'onerror'|'onboundary'>;
interface Synth { speak(utterance:never):void;cancel():void;pause():void;resume():void;getVoices():SpeechSynthesisVoice[] }
export class SpeechController {
  private settings:SpeechSettings={enabled:true,rate:1,language:'uk',voice:'',stream:true};
  private sentences:Array<{text:string;start:number}>=[];
  private text='';private consumed=0;private index=0;private generation=0;
  private active=false;private paused=false;private halted=true;
  constructor(private synth:Synth,private create:(text:string)=>Utterance,private notify:(state:Partial<SpeechState>)=>void){}
  configure(settings:SpeechSettings):void {this.settings=settings;this.notify({enabled:settings.enabled,rate:settings.rate});if(!settings.enabled)this.stop();}
  begin():void {this.stop();this.halted=false;this.text='';this.consumed=0;this.sentences=[];this.index=0;}
  update(text:string,final:boolean):void {
    if(this.halted||!this.settings.enabled)return;
    this.text=text;if(!final&&!this.settings.stream)return;
    const rest=text.slice(this.consumed);
    const pattern=/\S[\s\S]*?[.!?](?=\s|$)|\S[\s\S]*?\n/g;
    let match:RegExpExecArray|null,last=0;
    while((match=pattern.exec(rest))){this.sentences.push({text:match[0].trim(),start:this.consumed+match.index});last=match.index+match[0].length;}
    if(final&&rest.slice(last).trim()){
      const remaining=rest.slice(last),offset=remaining.search(/\S/);
      this.sentences.push({text:remaining.trim(),start:this.consumed+last+offset});last=rest.length;
    }
    this.consumed+=last;
    if(!this.active&&!this.paused)this.play();
  }
  private play():void {
    const sentence=this.sentences[this.index];
    if(!sentence||this.halted||!this.settings.enabled){this.active=false;this.notify({speaking:false,wordStart:-1,wordEnd:-1});return;}
    const generation=this.generation;
    const utterance=this.create(sentence.text);utterance.lang=this.settings.language;utterance.rate=this.settings.rate;
    utterance.voice=this.synth.getVoices().find(v=>v.voiceURI===this.settings.voice||v.name===this.settings.voice)
      ??this.synth.getVoices().find(v=>v.lang.toLowerCase().startsWith(this.settings.language.toLowerCase()))??null;
    utterance.onboundary=event=>{
      if(generation!==this.generation)return;
      const start=sentence.start+event.charIndex;
      const length=event.charLength||this.text.slice(start).match(/^\S+/)?.[0].length||1;
      this.notify({wordStart:start,wordEnd:Math.min(this.text.length,start+length)});
    };
    utterance.onend=()=>{if(generation!==this.generation)return;this.active=false;this.index++;if(!this.paused)this.play();};
    utterance.onerror=()=>{if(generation!==this.generation)return;this.stop();};
    this.active=true;this.notify({speaking:true,paused:false});this.synth.speak(utterance as never);
  }
  stop():void {this.generation++;this.halted=true;this.active=false;this.paused=false;this.synth.cancel();this.notify({speaking:false,paused:false,wordStart:-1,wordEnd:-1});}
  pause():void {if(this.halted)return;this.paused=!this.paused;if(this.paused)this.synth.pause();else{this.synth.resume();if(!this.active)this.play();}this.notify({paused:this.paused});}
  seek(delta:number):void {
    if(!this.sentences.length||this.halted)return;
    this.generation++;this.synth.cancel();this.active=false;this.paused=false;
    this.index=Math.max(0,Math.min(this.sentences.length-1,this.index+delta));this.play();
  }
  setEnabled(enabled:boolean):void {this.settings.enabled=enabled;if(!enabled)this.stop();this.notify({enabled});}
  get enabled():boolean{return this.settings.enabled;}
}
