# Actual managed GGUF ASR in the packaged application's worker; public JFK fixture.
import base64,json,pathlib,time
switch_tab(next(tab for tab in list_tabs() if tab['url']=='http://tauri.localhost/')['targetId'])
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
root=pathlib.Path.cwd()
engine=root/'_research/temp/transcribe-asr/transcribe-native-windows-x86_64-cpu-vulkan/transcribe.dll'
model=root/'_research/temp/transcribe-asr/nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf'
config=next(c for c in invoke('get_local_engine_configs') if c['kind']=='gguf-asr')
config.update({'executable':str(engine),'model_path':str(model),'threads':4,'gpu_layers':0,'language':'auto'})
try:
    invoke('save_local_engine_config',{'config':config})
    started=time.monotonic();status=invoke('start_local_engine',{'kind':'gguf-asr'})
    assert status['state']=='running' and status['pid'],status
    print('managed_gguf_asr_loaded',round(time.monotonic()-started,3))
    provider=next(p for p in invoke('list_providers') if p['id']=='fluely-local-gguf-asr')
    assert provider['kind']=='stt' and provider['preset']=='local-gguf-asr' and provider['enabled']
    wav=base64.b64encode((root/'_research/temp/official-engine-smoke/models/jfk.wav').read_bytes()).decode()
    js("window.__asrFixture='';true")
    for offset in range(0,len(wav),16000):js('window.__asrFixture+='+json.dumps(wav[offset:offset+16000])+';true')
    started=time.monotonic();text=js("window.__TAURI_INTERNALS__.invoke('transcribe_gguf_asr_audio',{audioBase64:window.__asrFixture,providerId:'fluely-local-gguf-asr'})")
    assert 'country' in text.lower() and 'ask' in text.lower(),text
    print('managed_gguf_asr_auto_transcript',text)
    print('managed_gguf_asr_seconds',round(time.monotonic()-started,3))
    invalid=js("window.__TAURI_INTERNALS__.invoke('transcribe_gguf_asr_audio',{audioBase64:'YmFk',providerId:'fluely-local-gguf-asr'}).then(()=>false,()=>true)")
    assert invalid and next(s for s in invoke('get_local_engine_status') if s['kind']=='gguf-asr')['state']=='running'
    print('malformed_wav_rejected_without_worker_crash',True)
finally:
    js('delete window.__asrFixture;true')
    invoke('stop_local_engine',{'kind':'gguf-asr'})
    assert not next(p for p in invoke('list_providers') if p['id']=='fluely-local-gguf-asr')['enabled']
    assert next(s for s in invoke('get_local_engine_status') if s['kind']=='gguf-asr')['state']=='stopped'
    print('managed_gguf_asr_owned_cleanup',True)
