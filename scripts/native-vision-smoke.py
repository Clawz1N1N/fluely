import base64,json,pathlib
main=next(t for t in list_tabs() if t['url']=='http://tauri.localhost/')
switch_tab(main['targetId'])
frame=base64.b64encode(pathlib.Path('_research/temp/ocr-fixture.jpg').read_bytes()).decode('ascii')
expression="(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const original=await invoke('get_vision_settings');try{await invoke('update_vision_settings',{settings:{...original,mode:'ocr'}});const text=await invoke('build_screen_context',{frameBase64:FRAME});if(!text.includes('HELLO')||!text.includes('123'))throw Error('OCR fixture mismatch');await invoke('update_vision_settings',{settings:{...original,mode:'ocr+ui'}});const context=await invoke('build_screen_context',{frameBase64:FRAME});return {ocr:true,ui:context.includes('[UI TREE]'),bounded:context.length<=original.max_chars};}finally{await invoke('update_vision_settings',{settings:original});}})()"
result=js(expression.replace('FRAME',json.dumps(frame)))
assert result['ocr'] and result['bounded'],result
print('vision_fixture',result)
