import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {getChatPreferences} from '@/lib/overlay/chat-preferences';
import {neuralAvailability,providerConfigurationKey,type AvailabilitySources,type NeuralAvailability} from '@/lib/overlay/neural-availability';
import type {ProviderEntry} from '@/lib/overlay/provider-types';
import type {LocalEngineConfig} from '@/lib/overlay/local-engine-client';

const unavailable:NeuralAvailability={brain:false,stt:false,tts:false,vision:false};
/** One subscription per visible view; changes coalesce without background polling. */
export function useNeuralAvailability(){
  const [availability,setAvailability]=useState(unavailable);
  useEffect(()=>{
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,running=false,again=false;
    const stops:UnlistenFn[]=[];
    let providerKey='';
    const refresh=async()=>{
      if(running){again=true;return;}running=true;
      const results=await Promise.allSettled([invoke<ProviderEntry[]>('list_providers'),getChatPreferences(),invoke<LocalEngineConfig[]>('get_local_engine_configs'),invoke<AvailabilitySources['tts']>('get_tts_settings'),invoke<AvailabilitySources['vision']>('get_vision_settings')]);
      if(!disposed){
        const value=<T,>(index:number,fallback:T):T=>results[index].status==='fulfilled'?(results[index] as PromiseFulfilledResult<T>).value:fallback;
        const providers=value<ProviderEntry[]>(0,[]);providerKey=providerConfigurationKey(providers);
        setAvailability(neuralAvailability({providers,preferences:value(1,undefined),localConfigs:value(2,[]),tts:value(3,undefined),vision:value(4,undefined),systemVoices:window.speechSynthesis?.getVoices().length??0}));
      }
      running=false;if(again&&!disposed){again=false;schedule();}
    };
    const schedule=()=>{if(!disposed&&!timer)timer=setTimeout(()=>{timer=undefined;void refresh();},200);};
    void listen<{providers:ProviderEntry[]}>('providers-status',event=>{const next=providerConfigurationKey(event.payload.providers);if(next!==providerKey){providerKey=next;schedule();}}).then(stop=>{if(disposed)stop();else stops.push(stop);}).catch(()=>{});
    for(const name of ['local-engine-status','chat-preferences-changed','tts-settings-changed','vision-settings-changed','neural-settings-changed'])void listen(name,schedule).then(stop=>{if(disposed)stop();else stops.push(stop);}).catch(()=>{});
    window.speechSynthesis?.addEventListener('voiceschanged',schedule);
    window.addEventListener('focus',schedule);
    void refresh();
    return()=>{disposed=true;if(timer)clearTimeout(timer);stops.forEach(stop=>stop());window.speechSynthesis?.removeEventListener('voiceschanged',schedule);window.removeEventListener('focus',schedule);};
  },[]);
  return availability;
}
