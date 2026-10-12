import json,pathlib,time,subprocess,base64
main=next(t for t in list_tabs() if t['url']=='http://tauri.localhost/')
switch_tab(main['targetId'])
print('registered_interaction',js("window.__TAURI_INTERNALS__.invoke('get_registered_shortcuts').then(bindings=>bindings.answer_interaction)"))
print('show',js("window.__TAURI_INTERNALS__.invoke('show_answer_window')"))
answer=next(t for t in list_tabs() if t['url'].endswith('/shell/answer'))
switch_tab(answer['targetId'])
def settled(value):
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        if js("document.querySelector('[data-interactive]')?.dataset.interactive")==value:return
        time.sleep(.1)
    raise AssertionError('Interaction state did not settle')
def policy(interactive):
    owned=json.loads(pathlib.Path('_research/temp/native-process.json').read_text())
    report=json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/inspect-windows.ps1','-ProcessId',str(owned['pid']),'-Json'],encoding='utf-8'))
    window=next(w for w in report['Windows'] if w['Title']=='answer')
    styles=window['DecodedStyles']
    assert 'TOPMOST' in styles and 'TOOLWINDOW' in styles and window['DisplayAffinity']==17,window
    assert ('NOACTIVATE' in styles)==(not interactive),styles
    assert ('TRANSPARENT' in styles)==(not interactive),styles
    print('native_policy',{'interactive':interactive,'styles':styles,'affinity':window['DisplayAffinityHex']})
settled('false');policy(False)
visual=js("({body:getComputedStyle(document.body).backgroundColor,root:getComputedStyle(document.getElementById('root')).backgroundColor,background:getComputedStyle(document.querySelector('[data-interactive]')).backgroundColor,height:document.querySelector('[data-interactive]').getBoundingClientRect().height,viewport:innerHeight})")
assert visual['body']=='rgba(0, 0, 0, 0)' and visual['root']=='rgba(0, 0, 0, 0)',visual
assert abs(visual['height']-visual['viewport'])<1 and '0.32' in visual['background'],visual
print('transparent_canvas',visual)
js("window.__TAURI_INTERNALS__.invoke('toggle_answer_interaction_window')")
settled('true');policy(True)
assert js("getComputedStyle(document.querySelector('[data-interactive]')).backgroundColor")=='rgb(23, 23, 23)'
areas=json.loads(pathlib.Path('_research/temp/work-areas.json').read_text());area=areas[0]
original=js("window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position',{label:'answer'})")
size=js("window.__TAURI_INTERNALS__.invoke('plugin:window|outer_size',{label:'answer'})")
for x,y in [(area['X'],area['Y']),(area['X']+area['Width']-size['width'],area['Y']+area['Height']-size['height'])]:
    js("window.__TAURI_INTERNALS__.invoke('move_shell_window',"+json.dumps({'label':'answer','axis':'free','x':x,'y':y})+")")
    position=js("window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position',{label:'answer'})")
    assert position=={'x':x,'y':y},position
    print('work_area_corner',position)
js("window.__TAURI_INTERNALS__.invoke('move_shell_window',"+json.dumps({'label':'answer','axis':'free',**original})+")")
js("window.__TAURI_INTERNALS__.invoke('toggle_answer_interaction_window')")
settled('false');policy(False)
switch_tab(main['targetId'])
print('local_wasm',js("(async()=>{const module=await import('/vad/ort-wasm-simd-threaded.mjs');const response=await fetch('/vad/ort-wasm-simd-threaded.wasm');if(!response.ok)throw Error('WASM asset missing');await WebAssembly.compile(await response.arrayBuffer());return typeof module.default==='function';})()"))
