import type {ShortcutBinding} from '@/types';
/** One-time upgrade of shipped defaults. Custom/disabled choices remain owned by the user. */
export function migrateTtsShortcuts(bindings:Record<string,ShortcutBinding>,platform:string):Record<string,ShortcutBinding>{
  const next={...bindings};const modifier=platform==='macos'?'cmd':'ctrl';
  for(const [id,oldKey,newKey] of [['tts_stop',`${modifier}+shift+o`,'ctrl+alt+space'],['tts_seek_back',`${modifier}+shift+left`,'ctrl+alt+z'],['tts_seek_forward',`${modifier}+shift+right`,'ctrl+alt+x']]){
    const current=next[id];
    if(current?.key.toLowerCase()===oldKey&&!Object.entries(next).some(([other,value])=>other!==id&&value.enabled&&value.key.toLowerCase()===newKey))next[id]={...current,key:newKey};
  }
  return next;
}
