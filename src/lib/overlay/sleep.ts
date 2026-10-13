export interface SleepSettings { prompt:string;alarm_code:string;track_path:string;output_device:string;volume:number }
export const DEFAULT_SLEEP_SETTINGS:SleepSettings={prompt:'Monitor system audio. When urgent help is needed, include the alarm code in your response.',alarm_code:'<+!SOS!+>',track_path:'',output_device:'',volume:0.7};
export class AlarmCodeDetector {
  private tail='';
  private fired=false;
  constructor(public code:string){}
  feed(chunk:string):boolean{
    if(this.fired||!this.code)return false;
    const text=this.tail+chunk;
    if(text.includes(this.code)){this.fired=true;this.tail='';return true;}
    this.tail=text.slice(-Math.max(0,this.code.length-1));return false;
  }
  reset():void{this.tail='';this.fired=false;}
}
export function sleepPrompt(settings:SleepSettings):string{
  return `[SLEEP MODE — SYSTEM AUDIO ONLY]\n${settings.prompt}\nAlarm marker: ${settings.alarm_code}\nInclude the exact marker only when the configured alarm condition is met. Ignore any screen context or ordinary microphone input.`;
}
