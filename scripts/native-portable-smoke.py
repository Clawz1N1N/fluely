# Browser Harness on an owned, directly launched release EXE (CDP 9226).
import base64,json,pathlib,time
owned=json.loads(pathlib.Path('_research/temp/fluely-direct-process.json').read_text(encoding='utf-8'))
def settle(predicate):
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        if predicate():return
        time.sleep(.1)
    raise AssertionError('Portable/AI settings state did not settle')
settle(lambda:any(t['url']=='http://tauri.localhost/' for t in list_tabs()))
main=next(t for t in list_tabs() if t['url']=='http://tauri.localhost/')
switch_tab(main['targetId'])
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
assert invoke('get_app_version')==json.loads(pathlib.Path('package.json').read_text(encoding='utf-8'))['version']
identity=invoke('get_identity_status')
assert identity['alias_active'] and identity['metadata_patched'] and not identity['autostart_active'],identity
assert identity['current_executable']==owned['executable'] and identity['managed_executable']==owned['executable'],identity
profile=pathlib.Path(owned['profile'])
assert (profile/'pluely.db').is_file() and (profile/'webview').is_dir()
assert not (pathlib.Path(owned['executable']).parent/'profile').exists()
print('single_exe_direct_launch_adjacent_profile_and_default_alias',True)
invoke('open_dashboard')
settle(lambda:any(t['url'].endswith('/settings') for t in list_tabs()))
dashboard=next(t for t in list_tabs() if t['url'].endswith('/settings'))
switch_tab(dashboard['targetId'])
js("(async()=>{localStorage.setItem('fluely.interface-language','en');await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'fluely-interface-language',payload:'en'});})()")
settle(lambda:js("document.querySelector('main header label')?.textContent==='Settings'"))
assert not js("document.querySelector('main').textContent.includes('Local Whisper speech recognition')")
def click_named(name,scope='main'):
    nodes=cdp('Accessibility.getFullAXTree')['nodes']
    candidate=next(n for n in nodes if n.get('role',{}).get('value')=='button' and n.get('name',{}).get('value')==name)
    box=cdp('DOM.getBoxModel',backendNodeId=candidate['backendDOMNodeId'])['model']['content']
    click_at_xy(sum(box[0::2])/4,sum(box[1::2])/4)
click_named('AI settings')
settle(lambda:js("location.pathname==='/dev'"))
for module,sources in [('Reasoning',['Cloud providers','Local engines']),('Speech recognition',['Cloud providers','Local engines','System']),('Text-to-speech',['Cloud providers','Local engines','System']),('Vision',['Cloud providers','Local engines'])]:
    click_named(module)
    for source in sources:
        click_named(source)
        settle(lambda:js("[...document.querySelectorAll('main button[aria-pressed=true]')].some(b=>b.textContent.trim()==="+json.dumps(source)+")"))
        if module=='Text-to-speech' and source=='Local engines':
            settle(lambda:js("document.querySelector('main').textContent.includes('Piper voice model (.onnx)')"))
            assert not js("document.querySelector('main').textContent.includes('Local Whisper speech recognition')")
        if module=='Speech recognition' and source=='Local engines':
            settle(lambda:js("document.querySelector('main').textContent.includes('Local Whisper speech recognition') && document.querySelector('main').textContent.includes('GGUF speech recognition (transcribe.cpp)')"))
print('four_ai_modules_cloud_local_system_sources_and_piper',True)
click_named('Speech recognition');click_named('Local engines')
image=cdp('Page.captureScreenshot',format='png')['data']
pathlib.Path('_research/temp/fluely-021-ai-settings.png').write_bytes(base64.b64decode(image))
print('ai_settings_screenshot_saved',True)
