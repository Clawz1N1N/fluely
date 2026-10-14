import { INITIAL_SERVICE_STATE, type ActionRequest, type ServiceSnapshot, type ShellSettings, type SpeechState, type UiMode } from './contracts';
import { StructuredParser } from './structured';
import type { ProviderStatus } from './provider-types';
import type { SpeechSettings } from './speech-controller';
import { nativeMicrophoneWave } from './local-engine-client';
import { t } from '@/lib/i18n';
import {AlarmCodeDetector,DEFAULT_SLEEP_SETTINGS,sleepPrompt,type SleepSettings} from './sleep';

export interface CaptureBatch {
  request_id: number;
  frames: Array<{monitor:string;jpeg_base64:string;width:number;height:number}>;
  transcript: Array<{channel:string;text:string}>;
  questions: string[];
  question?: string | null;
  client_ids?:string[];
  sleep_prompt?:string;
}
export interface CaptureOptions { system_audio: boolean; microphone: boolean; mode?:string }
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
  snapshot: ServiceSnapshot&{service_id:string} = {...structuredClone(INITIAL_SERVICE_STATE),service_id:crypto.randomUUID()};
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
  private stopping?:Promise<void>;
  private lifecycle=0;
  private booting=false;
  private bootFailed=false;
  private retry?:ReturnType<typeof setTimeout>;
  private systemCapturing = false;
  private microphoneCapturing = false;
  private captureOperations: Promise<void> = Promise.resolve();
  private modeEpoch=0;
  private nativeAudioEpoch='0';
  private resumeState={listening:false,continuous:false};
  private sleepSettings:SleepSettings={...DEFAULT_SLEEP_SETTINGS};
  private sleepHistory:ServiceSnapshot['history']=[];
  private transitioning=false;
  private modeTransition:Promise<void>=Promise.resolve();
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
    this.snapshot.error=error instanceof Error?t(error.message):t('Не вдалося виконати дію. Перевірте налаштування.');
    void this.publish();
  }
  start(): Promise<void> {
    if(this.alive&&this.startup&&(this.booting||!this.bootFailed))return this.startup;
    if(this.retry){clearTimeout(this.retry);this.retry=undefined;}
    if(this.ticker){clearInterval(this.ticker);this.ticker=undefined;}
    for(const off of this.unlisten.splice(0))off();
    const lifecycle=++this.lifecycle;
    this.alive=true;
    this.snapshot.ready=false;this.snapshot.error=null;this.booting=true;this.bootFailed=false;
    this.abort=new AbortController();
    this.startup=(this.stopping??Promise.resolve()).then(async()=>{
      if(this.currentLifecycle(lifecycle))await this.boot(lifecycle);
    }).finally(()=>{if(this.currentLifecycle(lifecycle))this.booting=false;});
    return this.startup;
  }
  private currentLifecycle(lifecycle:number):boolean{return this.alive&&this.lifecycle===lifecycle;}
  private async bind<T>(name:string,callback:(value:T)=>void): Promise<void> {
    const lifecycle=this.lifecycle;
    const off=await this.ports.listen<T>(name,value=>{if(this.currentLifecycle(lifecycle))return callback(value);});
    if(this.currentLifecycle(lifecycle))this.unlisten.push(off);else off();
  }
  private async boot(lifecycle:number): Promise<void> {
    try {
      await Promise.all([
        this.bind<ActionRequest>('shell-action',value=>{void this.action(value);}),
        this.bind<CaptureBatch>('continuous-batch',value=>{void this.batch(value);}),
        this.bind<string>('speech-detected',value=>{
          const data=Uint8Array.from(atob(value),character=>character.charCodeAt(0));
          void this.audio(new Blob([data],{type:'audio/wav'}),'[system]');
        }),
        this.bind<string>('microphone-input', async value=>{
          if(!this.microphoneCapturing)return;
          try { await this.audio(nativeMicrophoneWave(value),'[mic]',true); }
          catch(error) { this.setError(error); }
        }),
        this.bind<string>('microphone-error',value=>this.setError(new Error(t(String(value))))),
        this.bind('toggle-system-audio',()=>{void this.action({action:'listen',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('start-audio-recording',()=>{void this.action({action:'listen',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('trigger-screenshot',()=>{void this.action({action:'screenshot',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind('focus-text-input',()=>{void this.action({action:'chat',id:crypto.randomUUID(),source:'shortcut'});}),
        this.bind<{action:string}>('custom-shortcut-triggered',value=>{
          if(value.action==='find_buttons'){void this.ports.invoke('find_shell_buttons').catch(error=>this.setError(error));return;}
          const map:Record<string,ActionRequest['action']>={tts_toggle:'tts',tts_stop:'tts_stop',tts_pause:'tts_pause',tts_seek_back:'tts_seek_back',tts_seek_forward:'tts_seek_forward',ui_mode:'ui_mode',reset_layout:'reset',continuous:'continuous'};
          const action=map[value.action];if(action)void this.action({action,id:crypto.randomUUID(),source:'shortcut'});
        }),
        this.bind('system-audio-error',value=>this.setError(typeof value==='string'?new Error(value):value)),
        this.bind('continuous-error',value=>this.setError(new Error(String(value)))),
        this.bind('audio-encoding-error',value=>this.setError(new Error(String(value)))),
        this.bind('shell-settings-changed',()=>{void (this.snapshot.ready?this.refreshStatus():this.start()).catch(error=>this.setError(error));}),
        this.bind<SleepSettings>('sleep-settings-changed',settings=>{this.sleepSettings=settings;}),
        this.bind<string>('sleep-alarm-error',error=>this.setError(new Error(error))),
        this.bind<boolean>('answer-visibility-changed',visible=>{this.snapshot.answerVisible=visible;void this.publish();}),
        this.bind<SpeechSettings>('tts-settings-changed',settings=>{
          this.ports.speech.configure?.(settings);
          Object.assign(this.snapshot.tts,{enabled:settings.enabled,rate:settings.rate});void this.publish();
        }),
      ]);
      if(!this.currentLifecycle(lifecycle))return;
      await this.publish(true);
      try{await this.ports.initialize();}catch(error){if(this.currentLifecycle(lifecycle))this.setError(error);}
      if(!this.currentLifecycle(lifecycle))return;
      const [shell,capture,tts]=await Promise.all([
        this.ports.invoke<ShellSettings>('get_shell_settings'),
        this.ports.invoke<CaptureOptions>('get_capture_settings'),
        this.ports.invoke<{enabled:boolean;rate:number}>('get_tts_settings'),
      ]);
      if(!this.currentLifecycle(lifecycle))return;
      this.snapshot.shell=shell;this.capture=capture;
      Object.assign(this.snapshot.tts,{enabled:tts.enabled,rate:tts.rate});
      // A replacement webview inherits the native counter, not the old JS owner.
      this.modeEpoch++;
      this.nativeAudioEpoch=await this.ports.invoke<string>('set_sleep_mode',{sleeping:false})??'0';
      if(!this.currentLifecycle(lifecycle))return;
      this.snapshot.sleeping=false;
      this.snapshot.ready=true;
      await this.refreshStatus();await this.publish(true);
      if(!this.currentLifecycle(lifecycle))return;
      this.ticker=setInterval(()=>{void this.refreshStatus().catch(error=>this.setError(error));},1000);
    } catch(error) {
      if(!this.currentLifecycle(lifecycle))return;
      this.snapshot.ready=false;this.bootFailed=true;this.setError(error);await this.publish(true).catch(()=>{});
      if(this.currentLifecycle(lifecycle))this.retry=setTimeout(()=>{if(this.currentLifecycle(lifecycle))void this.start();},3000);
    }
  }
  async refreshStatus(): Promise<void> {
    const status=await this.ports.status();if(!this.alive)return;
    this.snapshot.neutral=status.neutral;this.snapshot.nextAllowedAt=status.nextAllowedAt;
    this.snapshot.currentModel=status.providers.find(p=>p.id===status.currentProviderId)?.model??null;
    if(status.globalUsed)this.snapshot.requestCounts=status.globalUsed;
    if(status.globalLimits)this.snapshot.requestLimits=status.globalLimits;
    this.snapshot.shell=await this.ports.invoke<ShellSettings>('get_shell_settings');
    this.capture=await this.ports.invoke<CaptureOptions>('get_capture_settings');
    await this.reconcileCapture();
    await this.publish();
  }
  private reconcileCapture(): Promise<void> {
    const operation=async()=>{
      const listening=this.alive&&this.snapshot.listening;
      if(!listening||(!this.snapshot.sleeping&&!this.capture.system_audio)){
        if(this.systemCapturing){await this.ports.invoke('stop_system_audio_capture');this.systemCapturing=false;}
      }else if(!this.systemCapturing){await this.ports.invoke('start_system_audio_capture');this.systemCapturing=true;}
      if(!listening||this.snapshot.sleeping||!this.capture.microphone){
        if(this.microphoneCapturing){await this.ports.invoke('stop_microphone');this.microphoneCapturing=false;}
      }else if(!this.microphoneCapturing){await this.ports.invoke('start_microphone',{deviceId:null});this.microphoneCapturing=true;}
    };
    const next=this.captureOperations.catch(()=>{}).then(operation);this.captureOperations=next;return next;
  }
  private async toggleSleep():Promise<void>{
    let finish!:()=>void;this.modeTransition=new Promise(resolve=>{finish=resolve;});this.transitioning=true;
    try{await this.changeSleep();}finally{this.transitioning=false;finish();}
  }
  private async changeSleep():Promise<void>{
    const sleeping=!this.snapshot.sleeping;
    if(sleeping){
      this.sleepSettings=await this.ports.invoke<SleepSettings>('get_sleep_settings')??{...DEFAULT_SLEEP_SETTINGS};
      this.resumeState={listening:this.snapshot.listening,continuous:this.snapshot.continuous};
    }
    this.modeEpoch++;this.abort.abort();this.abort=new AbortController();this.ports.speech.stop();
    this.snapshot.sleeping=sleeping;this.sleepHistory=[];
    try{this.nativeAudioEpoch=await this.ports.invoke<string>('set_sleep_mode',{sleeping})??String(this.modeEpoch);}
    catch(error){
      this.snapshot.sleeping=!sleeping;this.microphoneCapturing=false;
      if(!this.snapshot.sleeping&&this.snapshot.continuous)await this.ports.invoke('start_continuous').catch(()=>{});
      await this.reconcileCapture().catch(()=>{});throw error;
    }
    if(sleeping){
      this.snapshot.continuous=false;this.snapshot.listening=true;
      await this.reconcileCapture();
      await this.ports.invoke('close_answer_window');this.snapshot.answerVisible=false;
    }else{
      await this.ports.invoke('stop_sleep_alarm');
      Object.assign(this.snapshot,this.resumeState);
      if(this.snapshot.continuous)await this.ports.invoke('start_continuous');
    }
    await this.reconcileCapture();
  }
  action(request: ActionRequest): Promise<void> {
    if(!request||typeof request.id!=='string'||!this.remember(this.seenActions,request.id))return Promise.resolve();
    const operation=async()=>{
      try {
        if(request.action!=='snapshot'&&request.action!=='settings')await this.startup;
        if(!this.alive)return;
        this.snapshot.error=null;
        if(this.snapshot.sleeping&&!['mode','snapshot','settings','tts_stop'].includes(request.action))throw new Error('Ordinary actions are unavailable during Sleep mode.');
        switch(request.action){
          case 'snapshot':break;
          case 'listen': {
            const next=!this.snapshot.listening;
            this.snapshot.listening=next;
            try { await this.reconcileCapture(); }
            catch(error){this.snapshot.listening=!next;await this.reconcileCapture();throw error;}
            break;
          }
          case 'continuous': {
            const next=!this.snapshot.continuous;
            if(next){
              const settings=await this.ports.invoke<CaptureOptions>('get_capture_settings');
              if(settings.mode==='manual')await this.ports.invoke('update_capture_settings',{settings:{...settings,mode:'interval'}});
              this.capture=await this.ports.invoke<CaptureOptions>('get_capture_settings');
              await this.ports.invoke('start_continuous');
              this.snapshot.listening=true;
              try { await this.reconcileCapture(); }
              catch(error){this.snapshot.listening=false;await this.reconcileCapture();await this.ports.invoke('stop_continuous');throw error;}
            }else{await this.ports.invoke('stop_continuous');this.snapshot.listening=false;await this.reconcileCapture();}
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
          case 'mode':await this.toggleSleep();break;
          case 'ui_mode': {
            const next:Record<UiMode,UiMode>={sidestrips:'topbottomstrips',topbottomstrips:'buttons',buttons:'sidestrips',custom:'sidestrips'};
            await this.ports.invoke('set_ui_mode',{mode:next[this.snapshot.shell.ui_mode]});
            this.snapshot.shell=await this.ports.invoke('get_shell_settings');break;
          }
          case 'reset':await this.ports.invoke('reset_shell_layout');break;
          case 'settings':await this.ports.invoke('open_dashboard');break;
          case 'dashboard':await this.ports.invoke('open_dashboard_page');break;
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
    if(request.action==='snapshot'||request.action==='settings')return operation();
    const next=this.actions.catch(()=>{}).then(operation);this.actions=next;return next;
  }
  batch(batch: CaptureBatch): Promise<void> {
    if(!batch||!Number.isSafeInteger(batch.request_id)||!this.remember(this.seenBatches,batch.request_id))return Promise.resolve();
    const epoch=this.modeEpoch;
    const deliveredDuringTransition=this.transitioning||!this.snapshot.ready;
    const next=this.requests.catch(()=>{}).then(async()=>{
      await this.startup;await this.modeTransition;if(!this.alive)return;
      const sleeping=this.snapshot.sleeping;
      const signal=this.abort.signal;
      const settings={...this.sleepSettings};
      const input=sleeping?{...batch,frames:[],transcript:batch.transcript.filter(item=>item.channel==='[system]'),questions:[],question:null,sleep_prompt:sleepPrompt(settings)}:batch;
      this.snapshot.busy=true;this.snapshot.error=null;this.snapshot.requestId=String(batch.request_id);
      this.snapshot.requestError=null;
      this.snapshot.clientIds=batch.client_ids??[];
      Object.assign(this.snapshot,{main:'',side:'',speak:''});
      if(!sleeping&&this.ports.speech.begin)this.ports.speech.begin();else this.ports.speech.stop();
      let parser=new StructuredParser();let raw='';
      const detector=new AlarmCodeDetector(settings.alarm_code);
      let alarmFired=false;
      try {
        if(deliveredDuringTransition||epoch!==this.modeEpoch)throw new Error('Request cancelled by Sleep mode transition.');
        if(sleeping&&!input.transcript.length)throw new Error('Ordinary actions are unavailable during Sleep mode.');
        await this.publish(true);
        for await(const chunk of this.ports.answer(input,structuredClone(sleeping?this.sleepHistory:this.snapshot.history),signal)){
          if(!this.alive||signal.aborted||epoch!==this.modeEpoch)throw new DOMException('Aborted','AbortError');
          if(typeof chunk!=='string'){
            parser=new StructuredParser();raw='';Object.assign(this.snapshot,{main:'',side:'',speak:''});
            detector.reset();if(!sleeping)this.ports.speech.begin?.();await this.publish(true);continue;
          }
          raw+=chunk;Object.assign(this.snapshot,parser.feed(chunk));
          if(sleeping){if(!alarmFired&&detector.feed(chunk)){alarmFired=true;try{await this.ports.invoke('play_sleep_alarm');}catch(error){if(!signal.aborted&&epoch===this.modeEpoch)this.setError(error);}}}
          else this.ports.speech.update(this.snapshot.speak,false);await this.publish();
        }
        if(signal.aborted||epoch!==this.modeEpoch)throw new DOMException('Aborted','AbortError');
        if(this.alive&&!signal.aborted&&epoch===this.modeEpoch){
          Object.assign(this.snapshot,parser.finish());if(!sleeping)this.ports.speech.update(this.snapshot.speak,true);
          const question=[...input.transcript.map(t=>`${t.channel} ${t.text}`),...(input.questions??[input.question??''])].filter(Boolean).join('\n');
          const history=sleeping?this.sleepHistory:this.snapshot.history;
          history.push({role:'user',content:question||'Проаналізуй знімок екрана.'},{role:'assistant',content:raw});
          if(sleeping){this.sleepHistory=history.slice(-20);if(batch.client_ids?.length)this.snapshot.requestError='Ordinary actions are unavailable during Sleep mode.';}
          else{this.snapshot.history=history.slice(-20);this.snapshot.answerVisible=await this.ports.invoke('present_answer_window')!==false;}
        }
      }catch(error){if(this.alive){this.snapshot.requestError=error instanceof Error?error.message:String(error);if(!signal.aborted&&!deliveredDuringTransition&&epoch===this.modeEpoch)this.setError(error);if(!this.snapshot.sleeping&&!deliveredDuringTransition&&epoch===this.modeEpoch)this.snapshot.answerVisible=await this.ports.invoke('present_answer_window')!==false;}}
      finally{
        this.snapshot.busy=false;this.snapshot.requestId=null;
        if(this.alive){try{await this.ports.invoke('continuous_request_done',{requestId:batch.request_id});}catch(error){this.setError(error);}await this.publish(true);}
      }
    });this.requests=next;return next;
  }
  async audio(blob: Blob, channel:'[system]'|'[mic]',ownedFinalSegment=false): Promise<void> {
    if(this.transitioning)return;
    const epoch=this.modeEpoch;const signal=this.abort.signal;
    const nativeEpoch=this.nativeAudioEpoch;
    if(this.snapshot.sleeping&&channel==='[mic]')return;
    const finishingOwnedMicrophone=ownedFinalSegment&&channel==='[mic]'&&this.microphoneCapturing;
    if(!this.alive||(!this.snapshot.listening&&!finishingOwnedMicrophone))return;
    await this.ports.invoke('continuous_set_audio_pending',{pending:true});
    try{
      const text=await this.ports.transcribe(blob,signal);
      if(text.trim()&&this.alive&&!signal.aborted&&epoch===this.modeEpoch)await this.ports.invoke('continuous_add_transcript',{channel,text,expectedEpoch:nativeEpoch});
    }catch(error){if(this.alive&&!signal.aborted)this.setError(error);}
    finally{
      await this.ports.invoke('continuous_set_audio_pending',{pending:false});
      if(this.alive)await this.ports.invoke('flush_continuous');
    }
  }
  stop(): Promise<void> {
    if(!this.alive&&this.stopping)return this.stopping;
    this.alive=false;this.lifecycle++;this.modeEpoch++;this.snapshot.ready=false;this.snapshot.listening=false;this.abort.abort();this.ports.speech.stop();
    const startup=this.startup;this.startup=undefined;this.booting=false;
    if(this.ticker){clearInterval(this.ticker);this.ticker=undefined;}if(this.broadcastTimer){clearTimeout(this.broadcastTimer);this.broadcastTimer=undefined;}
    if(this.retry){clearTimeout(this.retry);this.retry=undefined;}
    for(const off of this.unlisten.splice(0))off();
    this.stopping=(async()=>{
      await startup?.catch(()=>{});
      await this.reconcileCapture().catch(()=>{});
      await Promise.allSettled([this.ports.invoke('stop_continuous'),this.ports.invoke('stop_system_audio_capture'),this.ports.invoke('stop_microphone')]);
      await Promise.allSettled([this.ports.invoke('stop_sleep_alarm'),this.ports.invoke('set_sleep_mode',{sleeping:false})]);
      this.systemCapturing=false;this.microphoneCapturing=false;
      this.snapshot.sleeping=false;this.snapshot.continuous=false;
    })();
    return this.stopping;
  }
}
