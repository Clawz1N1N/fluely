import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from '@/config';
import { DEFAULT_STRUCTURED_PROMPT } from './structured';
import { MODE_PROMPTS, migrateModePrompts, type ChatPreferences } from './chat-preferences-core';

let preferences:ChatPreferences|undefined;
let starting:Promise<ChatPreferences>|undefined;
const LEGACY_STRUCTURED_PROMPT="Відповідай українською. Розділи відповідь на <main>основний розв'язок</main>, <side>додаткові пояснення та зауваження</side> і <speak>дуже докладне пояснення простими словами, придатне для озвучення</speak>. Формули використовуй у main або side. У speak пояснюй символи словами. Не повторюй однакові частини.";
const receive=(value:ChatPreferences)=>{if(!preferences||value.revision>=preferences.revision)preferences=value;return preferences;};
export function cachedChatPreferences(){return preferences;}
export async function getChatPreferences():Promise<ChatPreferences>{
  const value=await invoke<ChatPreferences>('get_chat_preferences');
  if(value.initialized)return receive(value);
  if(!starting)starting=(async()=>{
    let mode_prompts=MODE_PROMPTS,response:{language?:string;responseLength?:string}={};
    try{const saved=JSON.parse(localStorage.getItem('local_default_presets')??'null');if(Array.isArray(saved)&&saved.every(p=>typeof p.title==='string'&&typeof p.prompt==='string'&&typeof p.modelId==='string'))mode_prompts=migrateModePrompts(saved);}catch{}
    try{response=JSON.parse(localStorage.getItem(STORAGE_KEYS.RESPONSE_SETTINGS)??'{}');}catch{}
    const selected=localStorage.getItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
    let prompt_id=selected?`user:${selected}`:null;
    if(!prompt_id)try{const preset=JSON.parse(localStorage.getItem('selected_pluely_prompt')??'null');if(preset?.modelId)prompt_id=`mode:${preset.modelId}`;}catch{}
    return receive(await invoke<ChatPreferences>('migrate_chat_preferences',{patch:{
      system_prompt:localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT)??DEFAULT_SYSTEM_PROMPT,
      structured_prompt:localStorage.getItem('structured_output_prompt')===LEGACY_STRUCTURED_PROMPT?DEFAULT_STRUCTURED_PROMPT:localStorage.getItem('structured_output_prompt')??DEFAULT_STRUCTURED_PROMPT,
      response_language:response.language??'auto',response_length:response.responseLength??'auto',mode_prompts,prompt_id,
    }}));
  })().finally(()=>{starting=undefined;});
  return starting;
}
export async function updateChatPreferences(patch:Partial<Omit<ChatPreferences,'revision'|'initialized'>>):Promise<ChatPreferences>{
  await getChatPreferences();
  const value=receive(await invoke<ChatPreferences>('update_chat_preferences',{patch}));
  // Keep compatibility views and user-created templates connected to the service.
  localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT,value.system_prompt);
  localStorage.setItem('structured_output_prompt',value.structured_prompt);
  localStorage.setItem('local_default_presets',JSON.stringify(value.mode_prompts));
  let previous={};try{previous=JSON.parse(localStorage.getItem(STORAGE_KEYS.RESPONSE_SETTINGS)??'{}');}catch{}
  localStorage.setItem(STORAGE_KEYS.RESPONSE_SETTINGS,JSON.stringify({...previous,language:value.response_language,responseLength:value.response_length}));
  return value;
}
export async function listenChatPreferences(callback:(value:ChatPreferences)=>void):Promise<()=>void>{
  const off=await listen<ChatPreferences>('chat-preferences-changed',event=>{const value=receive(event.payload);callback(value);});
  try{callback(await getChatPreferences());}catch(error){off();throw error;}
  return off;
}
