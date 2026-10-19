import json,pathlib,time
expected=json.loads(pathlib.Path('_research/temp/icon-restart-expected.json').read_text(encoding='utf-8'))
deadline=time.monotonic()+15
while time.monotonic()<deadline:
    tabs=list_tabs()
    if any(t['url']=='http://tauri.localhost/' for t in tabs):break
    time.sleep(.1)
switch_tab(next(t for t in tabs if t['url']=='http://tauri.localhost/')['targetId'])
identity=js("window.__TAURI_INTERNALS__.invoke('get_identity_status')")
assert identity['current_executable']==expected['executable'],identity
assert identity['alias_active'] and identity['metadata_patched'],identity
assert js("window.__TAURI_INTERNALS__.invoke('get_app_icon_status')")['custom']
print('native_custom_icon_persists_after_actual_alias_restart',True)
