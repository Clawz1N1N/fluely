# End-to-end Sleep code parsing/alarm route + native pixel maps, owned test profile.
import base64,json,pathlib,time,uuid,wave
switch_tab(next(tab for tab in list_tabs() if tab['url']=='http://tauri.localhost/')['targetId'])
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
def settle(predicate):
    end=time.monotonic()+15
    while time.monotonic()<end:
        if predicate():return
        time.sleep(.1)
    raise AssertionError('Sleep pipeline did not settle')
def action(name):
    invoke('plugin:event|emit',{'event':'shell-action','payload':{'id':uuid.uuid4().hex,'action':name,'source':'owned-native-smoke'}})
root=pathlib.Path.cwd();track=root/'_research/temp/sleep-silent-fixture.wav'
with wave.open(str(track),'wb') as audio:
    audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(48000);audio.writeframes(b'\0\0'*14400)
original_sleep=invoke('get_sleep_settings');original_vision=invoke('get_vision_settings')
id='owned-sleep-'+uuid.uuid4().hex
provider={'id':id,'kind':'brain','preset':'other','base_url':'http://127.0.0.1:18146/v1','model':'fixture-text','supports_images':False,'enabled':True,'rank':-999,'curl':None,'variables':{},'secret_keys':[]}
js("(async()=>{window.__sleepSnapshot=null;const handler=window.__TAURI_INTERNALS__.transformCallback(event=>window.__sleepSnapshot=event.payload);window.__sleepListener=await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'service-state',target:{kind:'Any'},handler});return true;})()")
try:
    invoke('upsert_provider',{'provider':provider})
    outputs=invoke('list_alarm_outputs');assert outputs
    output=next((d for d in outputs if d['is_default']),outputs[0])
    config={**original_sleep,'prompt':'For the owned synthetic alert test, include the exact alarm marker.','track_path':str(track),'output_device':output['id'],'volume':0.0}
    invoke('save_sleep_settings',{'settings':config})
    first_alarm=invoke('test_sleep_alarm');assert first_alarm['device_name']==output['name']
    invoke('stop_sleep_alarm',{'playbackId':first_alarm['playback_id']})
    action('snapshot');settle(lambda:js('!!window.__sleepSnapshot?.ready'))
    before=js('window.__sleepSnapshot')
    action('mode');settle(lambda:js('window.__sleepSnapshot?.sleeping===true'))
    assert invoke('get_capture_status') is True
    assert not invoke('get_microphone_status')['active']
    assert js("window.__TAURI_INTERNALS__.invoke('start_microphone',{deviceId:null}).then(()=>false,error=>String(error).includes('Sleep'))")
    assert js("window.__TAURI_INTERNALS__.invoke('start_screen_capture').then(()=>false,error=>String(error).includes('Sleep'))")
    assert js("window.__TAURI_INTERNALS__.invoke('toggle_answer_interaction_window').then(()=>false,error=>String(error).includes('Sleep'))")
    invoke('continuous_add_transcript',{'channel':'[system]','text':'Owned synthetic urgent alert'});invoke('flush_continuous')
    settle(lambda:js("window.__sleepSnapshot?.main?.includes('<+!SOS!+>')&&window.__sleepSnapshot?.busy===false"))
    receipt=invoke('test_sleep_alarm');assert receipt['device_name']==output['name'],receipt
    assert int(receipt['playback_id'])==int(first_alarm['playback_id'])+2,(first_alarm,receipt)
    assert not invoke('plugin:window|is_visible',{'label':'answer'})
    print('sleep_system_only_fragmented_code_native_alarm_route',receipt['device_name'])
    action('mode');settle(lambda:js('window.__sleepSnapshot?.sleeping===false') and js('window.__sleepSnapshot.listening')==before['listening'] and js('window.__sleepSnapshot.continuous')==before['continuous'])
    print('sleep_wake_restores_capture_flags',True)
    settings={**original_vision,'method':'pixel-text','pixel_width':64,'pixel_colors':True,'max_chars':4096}
    invoke('update_vision_settings',{'settings':settings})
    image=base64.b64encode((root/'_research/temp/official-engine-smoke/models/red-circle.png').read_bytes()).decode()
    text=invoke('build_screen_context',{'frameBase64':image})
    assert 'PIXEL' in text.upper() and ('\u2580' in text or '\u2584' in text or '\u2588' in text),text[:300]
    assert len(text)<=4096
    print('native_pixel_to_text_complete_maps',len(text))
finally:
    if js('window.__sleepSnapshot?.sleeping===true'):
        action('mode');settle(lambda:js('window.__sleepSnapshot?.sleeping===false'))
    invoke('stop_sleep_alarm')
    invoke('save_sleep_settings',{'settings':original_sleep});invoke('update_vision_settings',{'settings':original_vision})
    invoke('remove_provider',{'id':id})
    js("window.__TAURI_INTERNALS__.invoke('plugin:event|unlisten',{event:'service-state',eventId:window.__sleepListener})")
    js('delete window.__sleepListener;delete window.__sleepSnapshot;true')
    print('sleep_vision_fixture_cleanup',True)
