import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { useMicVAD, utils } from '@ricky0123/vad-react';
import { ServiceController, type CaptureBatch, type AnswerChunk } from '@/lib/overlay/service-controller';
import { SpeechController, type SpeechSettings } from '@/lib/overlay/speech-controller';
import { INITIAL_SERVICE_STATE, type ServiceSnapshot } from '@/lib/overlay/contracts';
import { DEFAULT_STRUCTURED_PROMPT } from '@/lib/overlay/structured';
import { pickProvider, providerStatus, reportProvider, streamBrain, transcribeWithProvider, synthesizeWithProvider } from '@/lib/overlay/provider-engine';
import { credentialStore } from '@/lib/storage/secure.storage';
import { isSecretVariable,providerSecretKey } from '@/lib/storage/credential-store';
import {setSecret,getSecret} from '@/lib/storage/secure.storage';
import type { ProviderEntry, ProviderKind } from '@/lib/overlay/provider-types';
import { AI_PROVIDERS, SPEECH_TO_TEXT_PROVIDERS, STORAGE_KEYS, DEFAULT_SYSTEM_PROMPT } from '@/config';
import type { TYPE_PROVIDER } from '@/types';
import { getShortcutsConfig } from '@/lib/storage/shortcuts.storage';
import { resolveScreenContext, type VisionSettings } from '@/lib/overlay/screen-context';
import { AudioSpeechSynth } from '@/lib/overlay/audio-speech';
import {selectRankedProvider,abortableDelay} from '@/lib/overlay/provider-selection';
import {ProviderHttpError} from '@/lib/overlay/network';

async function migrateSelectedProviders(force=false): Promise<void> {
  const existing=await invoke<ProviderEntry[]>('list_providers');
  const migrate=async(kind:'brain'|'stt',key:string,templates:TYPE_PROVIDER[],customKey:string)=>{
    const selected=await credentialStore.load(key);if(!selected?.provider)return;
    if(!force&&existing.some(p=>p.kind===kind))return;
    const custom=JSON.parse(localStorage.getItem(customKey)??'[]') as TYPE_PROVIDER[];
    const template=[...templates,...custom].find(p=>p.id===selected.provider);if(!template)return;
    const variables=Object.fromEntries(Object.entries(selected.variables).filter(([name])=>!isSecretVariable(name)));
    const secrets=Object.keys(selected.variables).filter(isSecretVariable);
    const id=`${kind}:${selected.provider}`;
    for(const name of secrets){const value=selected.variables[name];if(value){await setSecret(providerSecretKey(id,name),value);if(await getSecret(providerSecretKey(id,name))!==value)throw new Error('Не вдалося перевірити міграцію ключа.');}}
    const previous=existing.find(p=>p.id===id);
    const rank=force?Math.min(0,...existing.filter(p=>p.kind===kind).map(p=>p.rank))-1:previous?.rank??0;
    const provider:ProviderEntry={id,kind,preset:'custom',base_url:'http://localhost',model:variables.model??variables.MODEL??selected.provider,
      supports_images:kind==='brain'&&(template.supportsImages??template.curl.includes('{{IMAGE}}')),rank,enabled:true,
      limit_per_second:0,limit_per_minute:0,limit_per_hour:0,limit_per_day:0,curl:template.curl,
      streaming:template.streaming??true,response_content_path:template.responseContentPath??'text',variables,secret_keys:secrets};
    await invoke('upsert_provider',{provider});
  };
  await migrate('brain',STORAGE_KEYS.SELECTED_AI_PROVIDER,AI_PROVIDERS,STORAGE_KEYS.CUSTOM_AI_PROVIDERS);
  await migrate('stt',STORAGE_KEYS.SELECTED_STT_PROVIDER,SPEECH_TO_TEXT_PROVIDERS,STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS);
}
async function choose(kind:ProviderKind,excluded:string[],signal:AbortSignal):Promise<ProviderEntry>{
  return selectRankedProvider(kind,excluded,signal,{pick:pickProvider,status:providerStatus,wait:abortableDelay});
}
async function* answer(batch:CaptureBatch,history:ServiceSnapshot['history'],signal:AbortSignal):AsyncGenerator<AnswerChunk>{
  const excluded:string[]=[];
  while(!signal.aborted){
    const entry=await choose('brain',excluded,signal);
    try{
      const parts=[...batch.transcript.map(t=>`${t.channel} ${t.text}`),...(batch.questions??[batch.question??''])].filter(Boolean);
      let images=batch.frames.map(frame=>frame.jpeg_base64);
      if(!entry.supports_images&&images.length){
        const settings=await invoke<VisionSettings>('get_vision_settings');
        parts.push(await resolveScreenContext(images,settings,{
          native:frameBase64=>invoke<string>('build_screen_context',{frameBase64}),
          describe:async frame=>{
            const excluded:string[]=[];
            while(!signal.aborted){
              const provider=await choose('vision',excluded,signal);
              try{
                if(!provider.supports_images)throw new Error('Візуальний провайдер має підтримувати зображення.');
                let text='';for await(const chunk of streamBrain(provider,'Опиши видимий текст, задачу та елементи екрана стисло українською.',[], 'Опиши цей екран.',[frame],signal))text+=chunk;
                await reportProvider(provider);return text;
              }catch(error){if(signal.aborted)throw error;await reportProvider(provider,error);if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(provider.id);}
            }
            throw new DOMException('Aborted','AbortError');
          },
        }));images=[];
      }
      const systemPrompt=[localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT)??DEFAULT_SYSTEM_PROMPT,
        localStorage.getItem('structured_output_prompt')??DEFAULT_STRUCTURED_PROMPT].join('\n\n');
      let received=false;
      for await(const chunk of streamBrain(entry,systemPrompt,history,parts.join('\n\n')||'Проаналізуй знімок екрана.',images,signal)){received=true;yield chunk;}
      if(!received)throw new Error('Провайдер повернув порожню відповідь.');
    }catch(error){
      if(signal.aborted)throw error;
      await reportProvider(entry,error);if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(entry.id);
      yield {reset:true};continue;
    }
    await reportProvider(entry);return;
  }
}
async function transcribe(audio:Blob,signal:AbortSignal):Promise<string>{
  const excluded:string[]=[];
  while(!signal.aborted){
    const entry=await choose('stt',excluded,signal);
    try{const text=await transcribeWithProvider(entry,audio,signal);await reportProvider(entry);return text;}
    catch(error){if(signal.aborted)throw error;await reportProvider(entry,error);if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(entry.id);}
  }
  throw new DOMException('Aborted','AbortError');
}

function Microphone({service}:{service:ServiceController}){
  const vad=useMicVAD({model:'v5',startOnLoad:true,baseAssetPath:'/vad/',onnxWASMBasePath:'/vad/',
    ortConfig:ort=>{ort.env.wasm.numThreads=1;},
    onSpeechEnd:audio=>{void service.audio(new Blob([utils.encodeWAV(audio)],{type:'audio/wav'}),'[mic]').catch(error=>service.setError(error));},
  });
  useEffect(()=>{if(vad.errored)service.setError(new Error(`Мікрофон: ${vad.errored}`));},[vad.errored,service]);
  return null;
}

/** The hidden main webview is the sole owner of audio, requests, history and speech. */
export default function ServiceRuntime(){
  const [state,setState]=useState<ServiceSnapshot>(INITIAL_SERVICE_STATE);
  const [service]=useState(()=>{
    let controller:ServiceController;
    let speechSettings:SpeechSettings={enabled:true,rate:1,voice:'',language:'uk',stream:true,backend:'system'};
    const remote=new AudioSpeechSynth({
      render:async(text,signal)=>{
        if(speechSettings.backend==='piper'){
          const data=await invoke<string>('synthesize_piper',{text});
          return new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:'audio/wav'});
        }
        const excluded:string[]=[];
        while(!signal.aborted){
          const entry=await choose('tts',excluded,signal);
          try{const audio=await synthesizeWithProvider(entry,text,speechSettings,signal);await reportProvider(entry);return audio;}
          catch(error){if(signal.aborted)throw error;await reportProvider(entry,error);if(!(error instanceof ProviderHttpError&&error.status===429))excluded.push(entry.id);}
        }
        throw new DOMException('Aborted','AbortError');
      },audio:url=>new Audio(url),url:blob=>URL.createObjectURL(blob),revoke:url=>URL.revokeObjectURL(url),onError:error=>controller?.setError(error),
    });
    const synth={speak:(utterance:never)=>{if(speechSettings.backend==='system')window.speechSynthesis.speak(utterance);else remote.speak(utterance);},
      cancel:()=>{window.speechSynthesis.cancel();remote.cancel();},pause:()=>{window.speechSynthesis.pause();remote.pause();},
      resume:()=>{window.speechSynthesis.resume();remote.resume();},getVoices:()=>window.speechSynthesis.getVoices()};
    const speech=new SpeechController(synth,text=>new SpeechSynthesisUtterance(text),value=>controller?.setSpeech(value));
    const configure=(settings:SpeechSettings)=>{speech.stop();speechSettings=settings;speech.configure(settings);};
    controller=new ServiceController({
      invoke,listen:async(name,handler)=>listen(name,event=>handler(event.payload as never)),
      emit:async(name,payload)=>{if(name==='service-state')setState(payload as ServiceSnapshot);return emit(name,payload);},
      initialize:async()=>{
        await invoke('update_shortcuts',{config:getShortcutsConfig()});
        await migrateSelectedProviders();configure(await invoke<SpeechSettings>('get_tts_settings'));
      },
      status:()=>providerStatus(),answer,transcribe,
      speech:{configure,begin:()=>speech.begin(),update:(text,final)=>speech.update(text,final),stop:()=>speech.stop(),pause:()=>speech.pause(),seek:delta=>speech.seek(delta),
        toggle:async()=>{const enabled=!speech.enabled;await invoke('set_tts_enabled',{enabled});speech.setEnabled(enabled);}},
    });return controller;
  });
  useEffect(()=>{
    void service.start();
    const voices=()=>service.setSpeech({voices:window.speechSynthesis?.getVoices().map(v=>({id:v.voiceURI,name:v.name,language:v.lang}))??[]});
    window.speechSynthesis?.addEventListener('voiceschanged',voices);voices();
    const selection=(event:StorageEvent)=>{if([STORAGE_KEYS.SELECTED_AI_PROVIDER,STORAGE_KEYS.SELECTED_STT_PROVIDER].includes(event.key as never))void migrateSelectedProviders(true).catch(error=>service.setError(error));};
    window.addEventListener('storage',selection);
    return()=>{window.removeEventListener('storage',selection);window.speechSynthesis?.removeEventListener('voiceschanged',voices);void service.stop();};
  },[service]);
  return state.ready&&state.listening&&service.capture.microphone?<Microphone service={service}/>:null;
}
