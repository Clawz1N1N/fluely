# Real managed CPU inference; all inputs are public/synthetic test fixtures.
import base64,json,pathlib,urllib.request
main=next(tab for tab in list_tabs() if tab['url']=='http://tauri.localhost/')
switch_tab(main['targetId'])
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
root=pathlib.Path('_research/temp/official-engine-smoke').resolve()
models=root/'models'
configs=invoke('get_local_engine_configs')
started=[]
def chat(port,kind,content):
    body=json.dumps({'model':'fluely-local-'+kind,'messages':[{'role':'user','content':content}],'max_tokens':20,'temperature':0,'stream':False}).encode()
    request=urllib.request.Request('http://127.0.0.1:'+str(port)+'/v1/chat/completions',body,{'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(request,timeout=60))['choices'][0]['message']['content']
try:
    for index,kind in enumerate(['brain','vision','stt']):
        config=next(config for config in configs if config['kind']==kind)
        config.update({'executable':str(root/('whisper/Release/whisper-server.exe' if kind=='stt' else 'llama/llama-server.exe')),
            'model_path':str(models/('ggml-tiny.bin' if kind=='stt' else 'SmolVLM-256M-Instruct-Q8_0.gguf')),
            'mmproj_path':str(models/'mmproj-SmolVLM-256M-Instruct-Q8_0.gguf') if kind=='vision' else '',
            'port':19390+index,'threads':4,'context':2048,'gpu_layers':0,'language':'auto'})
        invoke('save_local_engine_config',{'config':config})
        status=invoke('start_local_engine',{'kind':kind});started.append(kind)
        assert status['state']=='running' and status['pid'],status
        assert 'healthy' in invoke('test_local_engine',{'kind':kind})
        if kind=='brain':
            text=chat(config['port'],kind,'Say hello in one word.');assert text.strip(),text;print('managed_brain_text',text)
        elif kind=='vision':
            image=base64.b64encode((models/'red-circle.png').read_bytes()).decode()
            text=chat(config['port'],kind,[{'type':'image_url','image_url':{'url':'data:image/png;base64,'+image}},{'type':'text','text':'What color is the circle? Answer using one word.'}])
            assert 'red' in text.lower(),text;print('managed_semantic_image',text)
        else:
            boundary='FluelyOwnedFixture'
            audio=(models/'jfk.wav').read_bytes()
            body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="jfk.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()+audio+f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n--{boundary}--\r\n'.encode())
            request=urllib.request.Request('http://127.0.0.1:'+str(config['port'])+'/inference',body,{'Content-Type':'multipart/form-data; boundary='+boundary})
            text=json.load(urllib.request.urlopen(request,timeout=60))['text'];assert 'country' in text.lower(),text;print('managed_whisper_transcription',text.strip())
        provider=next(provider for provider in invoke('list_providers') if provider['kind']==kind and provider['model']=='fluely-local-'+kind)
        assert provider['enabled'] and provider['base_url'].startswith('http://127.0.0.1:'),provider
    print('independent_local_provider_registration',True)
finally:
    for kind in started:invoke('stop_local_engine',{'kind':kind})
    assert all(status['state']=='stopped' for status in invoke('get_local_engine_status'))
    print('managed_server_cleanup',True)
