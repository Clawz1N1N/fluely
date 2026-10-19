import base64,json,pathlib,time,urllib.request
def settle(predicate,timeout=30):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate():return
  time.sleep(.15)
 raise AssertionError('Document/context acceptance did not settle')
def invoke(command,args=None):return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
def upload(paths):
 document=cdp('DOM.getDocument')['root']['nodeId']
 node=cdp('DOM.querySelector',nodeId=document,selector='input[type=file][aria-label="Attach files"]')['nodeId']
 cdp('DOM.setFileInputFiles',nodeId=node,files=[str(pathlib.Path(path).resolve()) for path in paths])
def button(name):return js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()=== "+json.dumps(name)+");if(!b)throw Error('Missing button');b.click();})()")
def new_chat():
 before=js("document.querySelector('[data-session-revision]')?.dataset.sessionRevision")
 button('New chat')
 settle(lambda:js("document.querySelector('[data-session-revision]')?.dataset.sessionRevision")!=before)
 settle(lambda:js("document.querySelectorAll('.fluely-attachment').length===0"))
def input_question(text):
 js("(()=>{const input=document.querySelector('form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+json.dumps(text)+");input.dispatchEvent(new Event('input',{bubbles:true}));})()")
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith('/settings'));answer=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/answer'))
switch_tab(dashboard['targetId'])
provider=next(item for item in invoke('list_providers') if item['id']=='owned-session-brain')
provider.update(model='owned-document-brain',max_output_tokens=256,context_window=65536,supports_images=True)
invoke('upsert_provider',{'provider':provider})
invoke('update_chat_preferences',{'patch':{'selections':{'brain':{'source':'local','provider_id':provider['id']}},'system_prompt':'Answer the user accurately.','structured_prompt':'Use <main>, <side> and <speak> sections.'}})
switch_tab(answer['targetId']);invoke('set_answer_editing',{'editing':True});new_chat()
settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Your questions and answers will appear here.')"))
upload(['_research/temp/document-acceptance/owned-document.docx'])
settle(lambda:js("[...document.querySelectorAll('.fluely-attachment button')].some(button=>button.textContent==='owned-document.docx')"))
js("[...document.querySelectorAll('.fluely-attachment button')].find(button=>button.textContent==='owned-document.docx').click()")
settle(lambda:js("document.querySelector('.fluely-attachment-preview')?.textContent.includes('verified original bytes')"))
input_question('Explain the owned document');settle(lambda:not js("[...document.querySelectorAll('button')].find(button=>button.textContent==='Send')?.disabled"));button('Send')
settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Fixture answer.')"))
payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read());assert 'verified original bytes' in payload['messages'][-1]['content']
switch_tab(dashboard['targetId']);summary=invoke('list_chat_sessions',{'query':'owned-document.docx'})[0];saved=invoke('get_chat_session',{'sessionId':summary['id']});file=next(event for event in saved['events'] if event['kind']=='file')
assert base64.b64decode(invoke('read_chat_media',{'sessionId':summary['id'],'mediaRef':file['file_ref']})['base64'])==pathlib.Path('_research/temp/document-acceptance/owned-document.docx').read_bytes()
print('native_docx_worker_preview_request_and_original_file_archive',True)

switch_tab(answer['targetId']);new_chat();settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Your questions and answers will appear here.')"));upload(['_research/temp/document-acceptance/owned-document.pdf'])
settle(lambda:js("[...document.querySelectorAll('.fluely-attachment button')].some(button=>button.textContent==='owned-document.pdf')"))
js("[...document.querySelectorAll('.fluely-attachment button')].find(button=>button.textContent==='owned-document.pdf').click()")
settle(lambda:js("document.querySelector('.fluely-attachment-preview')?.textContent.includes('Owned native PDF worker verified')"))
print('native_pdf_worker_and_local_font_assets',True)

switch_tab(answer['targetId']);new_chat();settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Your questions and answers will appear here.')"));upload([f'_research/temp/document-acceptance/owned-image-{index}.png' for index in range(8)])
settle(lambda:js("document.querySelectorAll('.fluely-attachment').length===8"));input_question('Describe the eight owned icons');settle(lambda:not js("[...document.querySelectorAll('button')].find(button=>button.textContent==='Send')?.disabled"));button('Send')
settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Fixture answer.')"))
payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read());assert len([part for part in payload['messages'][-1]['content'] if part.get('type')=='image_url'])==8
print('native_all_eight_images_survive_the_three_screen_frame_limit',True)

switch_tab(dashboard['targetId']);provider.update(context_window=4096,supports_images=False,max_output_tokens=256);invoke('upsert_provider',{'provider':provider})
session=invoke('create_chat_session',{'id':'owned-context-'+str(time.time_ns()),'title':'Owned compression test'})
for index in range(10):
 for role,text in [('question',('Stable owned fact '+str(index)+' about verified document. ')*50),('answer','Acknowledged owned fact '+str(index))]:
  invoke('append_chat_session_event',{'sessionId':session['id'],'event':{'id':f'context-{role}-{index}','kind':role,'timestamp':index+1,'text':text}})
invoke('plugin:event|emit',{'event':'shell-action','payload':{'action':'session_select','id':'owned-context-select','source':'acceptance','sessionId':session['id']}})
time.sleep(.5);invoke('continuous_add_question',{'question':'Summarize the owned facts now'})
settle(lambda:any(event['kind']=='summary' for event in invoke('get_chat_session',{'sessionId':session['id']})['events']),45)
saved=invoke('get_chat_session',{'sessionId':session['id']});assert len([event for event in saved['events'] if event['id'].startswith('context-')])==20
settle(lambda:'Earlier conversation summary' in str(json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read())['messages']))
switch_tab(answer['targetId']);settle(lambda:js("document.querySelector('[aria-label=\"Context usage\"]')?.textContent.includes('Compressed')"))
pathlib.Path('_research/temp/fluely-023-context.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',format='png')['data']))
print('native_context_90_percent_compression_preserves_archive_and_shows_counter',True)
