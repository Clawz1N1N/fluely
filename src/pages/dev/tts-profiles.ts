export interface TtsSettings {backend:'system'|'piper'|'cloud';enabled:boolean;voice:string;language:string;rate:number;stream:boolean;piper_executable:string}
export const TTS_PROFILES_KEY='fluely.tts.backend-profiles.v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
type Profile=Omit<TtsSettings,'backend'|'enabled'>;
const backends=['system','piper','cloud'] as const;
const defaults:Profile={voice:'',language:'uk',rate:1,stream:true,piper_executable:'piper'};
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function normalize(value:unknown,fallback:Profile=defaults):Profile {
  const data=record(value);
  const string=(field:'voice'|'language'|'piper_executable')=>typeof data[field]==='string'&&(data[field] as string).length<32768&&!(data[field] as string).includes('\0')?data[field] as string:fallback[field];
  return {voice:string('voice'),language:string('language').trim()||fallback.language,
    rate:typeof data.rate==='number'&&Number.isFinite(data.rate)?Math.max(0.5,Math.min(2,data.rate)):fallback.rate,
    stream:typeof data.stream==='boolean'?data.stream:fallback.stream,piper_executable:string('piper_executable')};
}
export function createTtsProfileStore(storage?:StoragePort) {
  const read=():Partial<Record<TtsSettings['backend'],Profile>>=>{
    try {
      const raw=storage?.getItem(TTS_PROFILES_KEY);
      if(!raw||raw.length>128*1024)return {};
      const data=record(JSON.parse(raw));if(data.version!==1)return {};
      const profiles=record(data.profiles),result:Partial<Record<TtsSettings['backend'],Profile>>={};
      for(const backend of backends)if(profiles[backend]&&typeof profiles[backend]==='object')result[backend]=normalize(profiles[backend]);
      return result;
    }catch{return {};}
  };
  return {
    load:(native:TtsSettings,backend:TtsSettings['backend']):TtsSettings=>{
      const active=normalize(native),fallback={...active,voice:''};
      const profile=backend===native.backend?active:normalize(read()[backend],fallback);
      return {backend,enabled:native.enabled,...profile};
    },
    save:async(native:TtsSettings,edited:TtsSettings,update:(settings:TtsSettings)=>Promise<void>):Promise<TtsSettings>=>{
      const next={...edited,...normalize(edited)};
      // Native persistence is the commit point; a failed update never publishes a profile.
      await update(next);
      const profiles=read();
      profiles[native.backend]=normalize(native);
      profiles[next.backend]=normalize(next);
      try {
        if(!storage)throw new Error('storage unavailable');
        storage.setItem(TTS_PROFILES_KEY,JSON.stringify({version:1,profiles}));
      }catch{throw new Error('TTS settings were saved, but backend profiles could not be saved locally.');}
      return next;
    },
  };
}
export function browserTtsProfileStore() {
  try{return createTtsProfileStore(localStorage);}catch{return createTtsProfileStore();}
}
