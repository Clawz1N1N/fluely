# Only an owned upgraded profile and loopback fixtures; never a user profile/key.
import base64, json, pathlib, time, urllib.request, struct

def settle(predicate, timeout=25):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate(): return
  time.sleep(.15)
 raise AssertionError('Session acceptance did not settle')
def invoke(command,args=None):
 return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
def button(name):
 return js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith("+json.dumps(name)+"));if(!b)throw Error('Missing button');b.click();})()")

main=next(tab for tab in list_tabs() if tab['url']=='http://tauri.localhost/')
switch_tab(main['targetId']);invoke('open_dashboard');invoke('show_answer_window')
settle(lambda:any(tab['url'].endswith('/shell/answer') for tab in list_tabs()))
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith('/settings'))
answer=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/answer'))
switch_tab(dashboard['targetId'])
js("(async()=>{localStorage.setItem('fluely.interface-language','en');await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'fluely-interface-language',payload:'en'});})()")
old=invoke('list_chat_sessions',{'query':None})
assert any(session['title']=='Preserved legacy conversation' for session in old),old
assert invoke('plugin:sql|select',{'db':'sqlite:pluely.db','query':'SELECT value FROM preserved_migration_3','values':[]})[0]['value']=='preserve-upgrade-fixture'
ledger=invoke('plugin:sql|select',{'db':'sqlite:pluely.db','query':'SELECT version FROM _sqlx_migrations ORDER BY version','values':[]})
assert [row['version'] for row in ledger]==[1,2,3],ledger
print('native_upgrade_startup_preserves_migration_3_and_imports_legacy_chat',True)

base={'base_url':'http://127.0.0.1:18146/v1','rank':0,'enabled':True,'limit_per_second':0,'limit_per_minute':0,'limit_per_hour':0,'limit_per_day':0,'curl':None,'streaming':True,'response_content_path':'choices.0.message.content','variables':{},'secret_keys':[],'max_output_tokens':512,'reasoning_effort':'high'}
for id,kind,model,images in [('owned-session-brain','brain','thinkingmachines/inkling-small:free',False),('owned-session-stt','stt','whisper-1',False),('owned-session-vision','vision','fixture-vision',True)]:
 invoke('upsert_provider',{'provider':dict(base,id=id,kind=kind,model=model,preset='openrouter' if kind!='stt' else 'openai-compatible',supports_images=images)})
invoke('update_chat_preferences',{'patch':{'selections':{kind:{'source':'local','provider_id':'owned-session-'+kind} for kind in ['brain','stt','vision']},'response_language':'english'}})
switch_tab(answer['targetId']);invoke('set_answer_editing',{'editing':True})
settle(lambda:js("document.querySelector('[data-chat-panels]')?.children.length===2"))
assert not js("document.body.textContent.includes('MAIN')||document.body.textContent.includes('SIDE')||document.body.textContent.includes('SPEAK')")
settle(lambda:js("!!document.querySelector('[aria-label=\"Selected models\"]')"))
assert js("document.querySelector('[aria-label=\"Selected models\"]').textContent.includes('inkling-small:free')")
assert js("document.querySelectorAll('[role=meter]').length===2")
switch_tab(dashboard['targetId'])
invoke('continuous_add_question',{'question':'Owned session question'})
switch_tab(answer['targetId']);settle(lambda:js("document.body.textContent.includes('Fixture answer.')"))
assert js("document.body.textContent.includes('Owned session question')")
assert js("document.querySelector('[aria-label=Conversation] .font-semibold')?.textContent.includes('Fixture answer.')")
payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read())
assert payload['reasoning']=={'effort':'high'},payload
switch_tab(dashboard['targetId']);new=next(s for s in invoke('list_chat_sessions',{'query':None}) if s['title']!='Preserved legacy conversation')
invoke('rename_chat_session',{'sessionId':new['id'],'title':'Owned renamed session'})
switch_tab(answer['targetId']);settle(lambda:js("document.body.textContent.includes('Owned renamed session')"))
button('Session history');settle(lambda:js("!!document.querySelector('[aria-label=\"Search sessions\"]')"))
button('New chat');settle(lambda:not js("document.body.textContent.includes('Owned session question')"))
print('native_two_panels_selected_models_router_reasoning_rename_and_new_session',True)

# Feed a synthetic 16kHz WAV through the real STT HTTP/archive flow, no microphone.
switch_tab(dashboard['targetId']);capture=invoke('get_capture_settings');capture.update(system_audio=False,microphone=False)
invoke('update_capture_settings',{'settings':capture})
invoke('plugin:event|emit',{'event':'shell-action','payload':{'action':'listen','id':'owned-listen','source':'fixture'}})
samples=b'\0\0'*4000
wav=b'RIFF'+struct.pack('<I',36+len(samples))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,1,16000,32000,2,16)+b'data'+struct.pack('<I',len(samples))+samples
invoke('plugin:event|emit',{'event':'speech-detected','payload':base64.b64encode(wav).decode()})
switch_tab(answer['targetId']);settle(lambda:js("document.querySelector('[aria-label=Transcript]')?.textContent.includes('Fixture speaker heard clearly.')"))
assert js("document.querySelector('[aria-label=Transcript]').textContent.includes('Speaker 1')")
assert js("!!document.querySelector('[aria-label=Transcript] time')")
switch_tab(dashboard['targetId']);sessions=invoke('list_chat_sessions',{'query':None});latest=sessions[0]
detail=invoke('get_chat_session',{'sessionId':latest['id']});audio=next(e for e in detail['events'] if e['kind']=='audio')
transcript=next(e for e in detail['events'] if e['kind']=='transcript')
assert transcript['audio_ref']==audio['audio_ref'] and transcript['speaker']=='Speaker 1'
assert invoke('read_chat_media',{'sessionId':latest['id'],'mediaRef':audio['audio_ref']})['mime']=='audio/wav'
print('native_recorded_audio_transcript_time_and_speaker_archive',True)

# Preserve the actual provider failure in the answer instead of a generic error.
error_provider=dict(base,id='owned-session-error',kind='brain',preset='openrouter',model='fixture-error',supports_images=False)
invoke('upsert_provider',{'provider':error_provider});invoke('update_chat_preferences',{'patch':{'selections':{'brain':{'source':'local','provider_id':'owned-session-error'}}}})
invoke('continuous_add_question',{'question':'Owned rejected request'})
switch_tab(answer['targetId']);settle(lambda:js("document.querySelector('[role=alert]')?.textContent.includes('Fixture model parameter rejected')"))
pathlib.Path('_research/temp/fluely-023-chat.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',format='png')['data']))
print('native_provider_failure_keeps_sanitized_diagnostic',True)
