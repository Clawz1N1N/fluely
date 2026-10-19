"""Own portable profile only; exercise icon upload through the actual settings UI."""
import base64,json,pathlib,time
owned=json.loads(pathlib.Path('_research/temp/fluely-direct-process.json').read_text(encoding='utf-8'))
def settle(predicate):
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        if predicate():return
        time.sleep(.1)
    raise AssertionError('Icon settings did not settle')
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
main=next(t for t in list_tabs() if t['url']=='http://tauri.localhost/')
switch_tab(main['targetId']);invoke('open_dashboard')
settle(lambda:any(t['url'].endswith('/settings') for t in list_tabs()))
switch_tab(next(t for t in list_tabs() if t['url'].endswith('/settings'))['targetId'])
settle(lambda:js("!!document.querySelector('input[accept*=ico]')"))
before=invoke('get_identity_status')['managed_executable']
node=cdp('DOM.getDocument')['root']['nodeId']
file_node=cdp('DOM.querySelector',nodeId=node,selector='input[accept*=ico]')['nodeId']
cdp('DOM.setFileInputFiles',nodeId=file_node,files=[str(pathlib.Path('src-tauri/icons/32x32.png').resolve())])
settle(lambda:invoke('get_app_icon_status')['custom'])
after=invoke('get_identity_status')['managed_executable']
assert before!=after,(before,after)
profile=pathlib.Path(owned['profile']);ico=(profile/'app-icon.ico').read_bytes()
size=int.from_bytes(ico[14:18],'little');offset=int.from_bytes(ico[18:22],'little')
assert ico[offset:offset+size] in pathlib.Path(after).read_bytes(),'Saved icon absent from alias PE resources'
assert not (pathlib.Path(after).parent/'profile').exists()
pathlib.Path('_research/temp/icon-restart-expected.json').write_text(json.dumps({'executable':after,'profile':owned['profile']}),encoding='utf-8')
print('native_icon_settings_upload_and_alias_PE_resources',True)
js("setTimeout(()=>window.__TAURI_INTERNALS__.invoke('restart_identity'),500);true")
