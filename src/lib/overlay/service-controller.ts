import { INITIAL_SERVICE_STATE, type ActionRequest, type ServiceSnapshot, type ShellSettings, type SpeechState } from './contracts';
import { StructuredParser } from './structured';
import type { ProviderStatus } from './provider-types';
import type { SpeechSettings } from './speech-controller';

export interface CaptureBatch {
  request_id: number;
  frames: Array<{monitor:string;jpeg_base64:string;width:number;height:number}>;
  transcript: Array<{channel:string;text:string}>;
  questions: string[];
  question?: string | null;
  client_ids?:string[];
}
export interface CaptureOptions { system_audio: boolean; microphone: boolean }
export type AnswerChunk = string | { reset: true };
export interface ServicePorts {
  listen<T>(name: string, handler: (payload: T) => void): Promise<() => void>;
  emit(name: string, payload: unknown): Promise<unknown>;
  invoke<T = unknown>(name: string, args?: Record<string,unknown>): Promise<T>;
  initialize(): Promise<void>;
  status(): Promise<ProviderStatus>;
  answer(batch: CaptureBatch, history: ServiceSnapshot['history'], signal: AbortSignal): AsyncIterable<AnswerChunk>;
  transcribe(audio: Blob, signal: AbortSignal): Promise<string>;
  speech: { configure?(settings:SpeechSettings):void; begin?():void; update(text: string, final: boolean): void; stop(): void; pause(): void; seek(delta:number): void; toggle(): Promise<void> };
}
export class ServiceController {
  snapshot: ServiceSnapshot = structuredClone(INITIAL_SERVICE_STATE);
  capture: CaptureOptions = {system_audio:true,microphone:true};
  private alive = false;
  private unlisten: Array<() => void> = [];
  private seenActions = new Set<string>();
  private seenBatches = new Set<number>();
  private actions: Promise<unknown> = Promise.resolve();
  private requests: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  private ticker?: ReturnType<typeof setInterval>;
  private broadcastTimer?: ReturnType<typeof setTimeout>;
  private startup?: Promise<void>;
  private systemCapturing = false;
  constructor(public ports: ServicePorts) {}
  private remember<T>(set: Set<T>, value: T): boolean {
    if(set.has(value))return false;set.add(value);
    if(set.size>1000)set.delete(set.values().next().value!);
    return true;
  }
  async publish(immediate = false): Promise<void> {
    if(!this.alive)return;
    if(!immediate) {
      if(!this.broadcastTimer)this.broadcastTimer=setTimeout(()=>{this.broadcastTimer=undefined;void this.publish(true).catch(()=>{});},50);
      return;
    }
    if(this.broadcastTimer){clearTimeout(this.broadcastTimer);this.broadcastTimer=undefined;}
    this.snapshot.revision++;
    await this.ports.emit('service-state', structuredClone(this.snapshot));
  }
  setSpeech(value: Partial<SpeechState>): void { Object.assign(this.snapshot.tts,value);void this.publish(); }
  setError(error: unknown): void {
    this.snapshot.error=error instanceof Error?error.message:'Не вдалося виконати дію. Перевірте налаштування.';
    void this.publish();
  }
  start(): Promise<void> {
    if(this.startup)return this.startup;
    this.alive=true;
    this.startup=this.boot();return this.startup;
  }
  private async bind<T>(name:string,callback:(value:T)=>void): Promise<void> {
    const off=await this.ports.listen(name,callback);
    if(this.alive)this.unlisten.push(off);else off();
  }
  private async boot(): Promise<void> {
    try {
      await Promise.all([
        this.bind<ActionRequest>('shell-action',value=>{void this.action(value);}),
        this.bind<CaptureBatch>('continuous-batch',value=>{void this.batch(value);}),
        this.bind<string>('speech-detected',value=>{
          const data=Uint8Array.from(atob(value),character=>character.charCodeAt(0));
          void this.audio(new Blob([data],{type:'audio/wav'}),'[system]');
        }),
        this.bind('toggle-system-audio',()=>{void this.action({action:'listen',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('start-audio-recording',()=>{void this.action({action:'listen',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('trigger-screenshot',()=>{void this.action({action:'screenshot',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('focus-text-input',()=>{void this.action({action:'chat',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind<{action:string}>('custom-shortcut-triggered',value=>{
          if(value.action==='find_buttons'){void this.ports.invoke('find_shell_buttons').catch(error=>this.setError(error));return;}
          const map:Record<string,ActionRequest['action']>={tts_toggle:'tts',tts_stop:'tts_stop',tts_pause:'tts_pause',tts_seek_back:'tts_seek_back',tts_seek_forward:'tts_seek_forward',ui_mode:'mode',reset_layout:'reset',continuous:'continuous'};
          const action=map[value.action];if(action)void this.action({action,id:crypto.randomUUID(),source:'shortcut'});
        }),
        this.bind('system-audio-error',value=>this.setError(typeof value==='string'?new Error(value):value)),
        this.bind('continuous-error',value=>this.setError(new Error(String(value)))),
        this.bind('audio-encoding-error',value=>this.setError(new Error(String(value)))),
        this.bind('shell-settings-changed',()=>{void this.refreshStatus().catch(error=>this.setError(error));}),
        this.bind<boolean>('answer-visibility-changed',visible=>{this.snapshot.answerVisible=visible;void this.publish();}),
        this.bind<SpeechSettings>('tts-settings-changed',settings=>{
          this.ports.speech.configure?.(settings);
          Object.assign(this.snapshot.tts,{enabled:settings.enabled,rate:settings.rate});void this.publish();
        }),
      ]);
      if(!this.alive)return;
      try{await this.ports.initialize();}catch(error){this.setError(error);}
      const [shell,capture,tts]=await Promise.all([
        this.ports.invoke<ShellSettings>('get_shell_settings'),
        this.ports.invoke<CaptureOptions>('get_capture_settings'),
        this.ports.invoke<{enabled:boolean;rate:number}>('get_tts_settings'),
      ]);
      if(!this.alive)return;
      this.snapshot.shell=shell;this.capture=capture;
      Object.assign(this.snapshot.tts,{enabled:tts.enabled,rate:tts.rate});
      this.snapshot.ready=true;
      await this.refreshStatus();await this.publish(true);
      this.ticker=setInterval(()=>{void this.refreshStatus().catch(error=>this.setError(error));},1000);
    } catch(error) {this.setError(error);await this.publish(true);}
  }
  async refreshStatus(): Promise<void> {
    const status=await this.ports.status();if(!this.alive)return;
    this.snapshot.neutral=status.neutral;this.snapshot.nextAllowedAt=status.nextAllowedAt;
    this.snapshot.currentModel=status.providers.find(p=>p.id===status.currentProviderId)?.model??null;
    if(status.globalUsed)this.snapshot.requestCounts=status.globalUsed;
    if(status.globalLimits)this.snapshot.requestLimits=status.globalLimits;
    this.snapshot.shell=await this.ports.invoke<ShellSettings>('get_shell_settings');
    this.capture=await this.ports.invoke<CaptureOptions>('get_capture_settings');
    if(this.snapshot.listening&&this.capture.system_audio&&!this.systemCapturing){await this.ports.invoke('start_system_audio_capture');this.systemCapturing=true;}
    if(this.systemCapturing&&(!this.snapshot.listening||!this.capture.system_audio)){await this.ports.invoke('stop_system_audio_capture');this.systemCapturing=false;}
    await this.publish();
  }
  action(request: ActionRequest): Promise<void> {
    if(!request||typeof request.id!=='string'||!this.remember(this.seenActions,request.id))return Promise.resolve();
    const operation=async()=>{
      try {
        if(request.action!=='snapshot')await this.startup;
        if(!this.alive)return;
        this.snapshot.error=null;
        switch(request.action){
          case 'snapshot':break;
          case 'listen': {
            const next=!this.snapshot.listening;
            if(next&&this.capture.system_audio&&!this.systemCapturing){await this.ports.invoke('start_system_audio_capture');this.systemCapturing=true;}
            if(!next&&this.systemCapturing){await this.ports.invoke('stop_system_audio_capture');this.systemCapturing=false;}
            this.snapshot.listening=next;break;
          }
          case 'continuous': {
            const next=!this.snapshot.continuous;
            if(next){
              await this.ports.invoke('start_continuous');
              try{if(this.capture.system_audio&&!this.systemCapturing){await this.ports.invoke('start_system_audio_capture');this.systemCapturing=true;}}
              catch(error){await this.ports.invoke('stop_continuous');throw error;}
              this.snapshot.listening=true;
            }else{await this.ports.invoke('stop_continuous');await this.ports.invoke('stop_system_audio_capture');this.systemCapturing=false;this.snapshot.listening=false;}
            this.snapshot.continuous=next;break;
          }
          case 'screenshot':await this.ports.invoke('capture_now');break;
          case 'ask': {
            const question=request.question?.trim();if(!question)throw new Error('Введіть запитання.');
            await this.ports.invoke('continuous_add_question',{question,...(request.clientId?{clientId:request.clientId}:{}),...(request.images?{images:request.images}:{})});break;
          }
          case 'answer':await this.ports.invoke('toggle_answer_window');break;
          case 'chat':
            await this.ports.invoke('show_answer_window');
            this.snapshot.answerVisible=true;await this.ports.emit('answer-focus-input',{});break;
          case 'mode': {
            const modes=['sidestrips','topbottomstrips','buttons'] as const;
            await this.ports.invoke('set_ui_mode',{mode:modes[(modes.indexOf(this.snapshot.shell.ui_mode)+1)%3]});
            this.snapshot.shell=await this.ports.invoke('get_shell_settings');break;
          }
          case 'reset':await this.ports.invoke('reset_shell_layout');break;
          case 'settings':await this.ports.invoke('open_dashboard');break;
          case 'tts':await this.ports.speech.toggle();break;
          case 'tts_stop':this.ports.speech.stop();break;
          case 'tts_pause':this.ports.speech.pause();break;
          case 'tts_seek_back':this.ports.speech.seek(-1);break;
          case 'tts_seek_forward':this.ports.speech.seek(1);break;
          default:throw new Error('Невідома дія оболонки.');
        }
        await this.publish(true);await this.ports.emit('shell-action-result',{id:request.id,ok:true});
      }catch(error){this.setError(error);await this.publish(true);await this.ports.emit('shell-action-result',{id:request.id,ok:false,error:this.snapshot.error});}
    };
    // Snapshot handshake must not wait behind a pending recording action.
    if(request.action==='snapshot')return operation();
    const next=this.actions.catch(()=>{}).then(operation);this.actions=next;return next;
  }
  batch(batch: CaptureBatch): Promise<void> {
    if(!batch||!Number.isSafeInteger(batch.request_id)||!this.remember(this.seenBatches,batch.request_id))return Promise.resolve();
    const next=this.requests.catch(()=>{}).then(async()=>{
      await this.startup;if(!this.alive)return;
      this.snapshot.busy=true;this.snapshot.error=null;this.snapshot.requestId=String(batch.request_id);
      this.snapshot.clientIds=batch.client_ids??[];
      Object.assign(this.snapshot,{main:'',side:'',speak:''});
      if(this.ports.speech.begin)this.ports.speech.begin();else this.ports.speech.stop();
      let parser=new StructuredParser();let raw='';
      try {
        await this.publish(true);
        for await(const chunk of this.ports.answer(batch,this.snapshot.history,this.abort.signal)){
          if(!this.alive)break;
          if(typeof chunk!=='string'){
            parser=new StructuredParser();raw='';Object.assign(this.snapshot,{main:'',side:'',speak:''});
            this.ports.speech.begin?.();await this.publish(true);continue;
          }
          raw+=chunk;Object.assign(this.snapshot,parser.feed(chunk));
          this.ports.speech.update(this.snapshot.speak,false);await this.publish();
        }
        if(this.alive){
          Object.assign(this.snapshot,parser.finish());this.ports.speech.update(this.snapshot.speak,true);
          const question=[...batch.transcript.map(t=>`${t.channel} ${t.text}`),...(batch.questions??[batch.question??''])].filter(Boolean).join('\n');
          this.snapshot.history.push({role:'user',content:question||'Проаналізуй знімок екрана.'},{role:'assistant',content:raw});
          this.snapshot.history=this.snapshot.history.slice(-20);
          this.snapshot.answerVisible=await this.ports.invoke('present_answer_window')!==false;
        }
      }catch(error){if(this.alive){this.setError(error);this.snapshot.answerVisible=await this.ports.invoke('present_answer_window')!==false;}}
      finally{
        this.snapshot.busy=false;this.snapshot.requestId=null;
        if(this.alive){try{await this.ports.invoke('continuous_request_done',{requestId:batch.request_id});}catch(error){this.setError(error);}await this.publish(true);}
      }
    });this.requests=next;return next;
  }
  async audio(blob: Blob, channel:'[system]'|'[mic]'): Promise<void> {
    if(!this.alive||!this.snapshot.listening)return;
    await this.ports.invoke('continuous_set_audio_pending',{pending:true});
    try{
      const text=await this.ports.transcribe(blob,this.abort.signal);
      if(text.trim()&&this.alive)await this.ports.invoke('continuous_add_transcript',{channel,text});
    }catch(error){if(this.alive)this.setError(error);}
    finally{
      await this.ports.invoke('continuous_set_audio_pending',{pending:false});
      if(this.alive)await this.ports.invoke('flush_continuous');
    }
  }
  async stop(): Promise<void> {
    this.alive=false;this.abort.abort();this.ports.speech.stop();
    if(this.ticker)clearInterval(this.ticker);if(this.broadcastTimer)clearTimeout(this.broadcastTimer);
    for(const off of this.unlisten.splice(0))off();
    await Promise.allSettled([this.ports.invoke('stop_continuous'),this.ports.invoke('stop_system_audio_capture')]);
  }
}
