# Execute using browser-harness stdin; it provides list_tabs/switch_tab/js.
import json, time, urllib.request
main = next(t for t in list_tabs() if t['url'] == 'http://tauri.localhost/')
switch_tab(main['targetId'])
print('keychain', js("(async()=>{const key='codex-smoke-'+crypto.randomUUID();const password='synthetic-value';try{await window.__TAURI_INTERNALS__.invoke('plugin:keychain|save_item',{key,password});const read=await window.__TAURI_INTERNALS__.invoke('plugin:keychain|get_item',{key});if(read.password!==password)throw Error('Credential mismatch');return true;}finally{await window.__TAURI_INTERNALS__.invoke('plugin:keychain|remove_item',{key});}})()"))
print('listener', js("(async()=>{const core=window.__TAURI_INTERNALS__;window.__smokeEventId=await core.invoke('plugin:event|listen',{event:'service-state',target:{kind:'Any'},handler:core.transformCallback(event=>{window.__smokeState=event.payload;})});return true;})()"))
print('configure', js("(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const tts=await invoke('get_tts_settings');await invoke('update_tts_settings',{settings:{...tts,enabled:false}});await invoke('set_global_limits',{limits:{per_second:0,per_minute:0,per_hour:0,per_day:0}});for(const [id,model,rank] of [['smoke-primary','smoke-fail',0],['smoke-fallback','smoke-ok',1]])await invoke('upsert_provider',{provider:{id,kind:'brain',preset:'openai-compatible',base_url:'http://127.0.0.1:18086/v1',model,rank,enabled:true,supports_images:true}});await invoke('continuous_set_audio_pending',{pending:true});await invoke('continuous_add_transcript',{channel:'[system]',text:'system fixture'});await invoke('continuous_add_transcript',{channel:'[mic]',text:'mic fixture'});await invoke('continuous_add_question',{question:'SMOKE-Q1',clientId:'smoke-q1'});await invoke('continuous_add_question',{question:'SMOKE-Q2',clientId:'smoke-q2'});await invoke('continuous_set_audio_pending',{pending:false});await invoke('flush_continuous');return true;})()"))
deadline=time.monotonic()+25
while time.monotonic()<deadline:
    state=js("window.__smokeState ? {busy:window.__smokeState.busy,main:window.__smokeState.main,side:window.__smokeState.side,speak:window.__smokeState.speak,error:window.__smokeState.error,clientIds:window.__smokeState.clientIds} : null")
    if state and not state['busy'] and 'smoke-q1' in state.get('clientIds',[]):
        assert state['main']=='Перевірено $x^2$.',state
        assert state['side']=='Додатково.' and state['speak']=='Просте пояснення.',state
        assert state['error'] is None,state
        print('combined_panels',True)
        break
    time.sleep(.25)
else: raise AssertionError('Combined request did not complete')
stats=json.load(urllib.request.urlopen('http://127.0.0.1:18086/stats'))
assert stats['requests']==['smoke-fail','smoke-ok'],stats
assert len(stats['summaries'])==1 and all(stats['summaries'][0][key] for key in ['mic','system','q1','q2']),stats
print('one_batch_and_fallback',stats)
print('modes',js("(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;for(const mode of ['buttons','topbottomstrips','sidestrips']){await invoke('set_ui_mode',{mode});if((await invoke('get_shell_settings')).ui_mode!==mode)throw Error('Mode mismatch');}await invoke('close_answer_window');await invoke('show_answer_window');await invoke('show_answer_window');return true;})()"))
print('voices',js("speechSynthesis.getVoices().map(voice=>({name:voice.name,language:voice.lang}))"))
print('cleanup',js("(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;await invoke('remove_provider',{id:'smoke-primary'});await invoke('remove_provider',{id:'smoke-fallback'});await invoke('plugin:event|unlisten',{event:'service-state',eventId:window.__smokeEventId});return true;})()"))
