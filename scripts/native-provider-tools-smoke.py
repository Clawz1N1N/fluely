"""Owned loopback account/profile only. No real API keys or user files."""
import json,time,urllib.request
def settle(predicate,timeout=25):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate():return
  time.sleep(.15)
 raise AssertionError('Provider/tools acceptance did not settle')
def invoke(command,args=None):return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
def click(name,scope='document'):
 return js("(()=>{const root="+scope+";const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()==="+json.dumps(name)+");if(!b)throw Error('Missing button '+"+json.dumps(name)+");b.click();})()")
def field(label,value):
 return js("(()=>{const root=document.querySelector('[role=dialog]');const label=[...root.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==="+json.dumps(label)+");const input=label?.querySelector('input');if(!input)throw Error('Missing field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+json.dumps(value)+");input.dispatchEvent(new Event('input',{bubbles:true}));})()")
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith('/settings'));answer=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/answer'))
switch_tab(dashboard['targetId'])
vault='pluely.provider.owned-modal-key.API_KEY'
invoke('plugin:keychain|save_item',{'key':vault,'password':'valid-fixture-key'})
try:
 base=next(item for item in invoke('list_providers') if item['id']=='owned-session-brain')
 entry=dict(base,id='owned-modal-model',credential_id='owned-modal-key',provider_id='owned-modal',provider_name='Owned fixture',display_name='Owned modal account',preset='other',model='fixture-text',model_display_name='Original fixture name',secret_keys=['API_KEY'],context_window=8192,max_output_tokens=512,limit_per_day=123)
 invoke('upsert_provider',{'provider':entry})
 click('AI settings');settle(lambda:js("location.pathname==='/dev'"));click('Local engines')
 settle(lambda:js("[...document.querySelectorAll('h3')].some(h=>h.textContent==='Owned modal account')"))
 js("[...document.querySelectorAll('h3')].find(h=>h.textContent==='Owned modal account').parentElement.querySelector('button').click()")
 settle(lambda:js("!!document.querySelector('[role=dialog]')"))
 assert js("document.querySelector('[role=dialog]').textContent.includes('A key is saved securely')")
 assert js("document.querySelector('[role=dialog] input[type=password]').value==='' ")
 field('Model ID','fixture-renamed');field('Model display name','Renamed readable model')
 # Add another model to the same account through the real manual-add control.
 js("(()=>{const i=document.querySelector('[aria-label=\"New model ID\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'fixture-extra');i.dispatchEvent(new Event('input',{bubbles:true}));})()")
 click('Add',"document.querySelector('[role=dialog]')");click('Save selected models',"document.querySelector('[role=dialog]')")
 settle(lambda:not js("!!document.querySelector('[role=dialog]')"))
 models=[p for p in invoke('list_providers') if p.get('credential_id')=='owned-modal-key']
 renamed=next(p for p in models if p['model']=='fixture-renamed')
 assert len(models)==2 and renamed['id']=='owned-modal-model' and renamed['limit_per_day']==123 and renamed['model_display_name']=='Renamed readable model'
 assert invoke('plugin:keychain|get_item',{'key':vault})['password']=='valid-fixture-key'
 print('native_account_modal_rename_add_same_key_and_settings_preserved',True)
 js("[...document.querySelectorAll('h3')].find(h=>h.textContent==='Owned modal account').parentElement.querySelector('button').click()")
 field('API key','invalid-fixture-key');click('Fetch models',"document.querySelector('[role=dialog]')")
 settle(lambda:js("document.querySelector('[role=dialog] [role=alert]')?.textContent.includes('401')"))
 error=js("document.querySelector('[role=dialog] [role=alert]').textContent")
 assert 'Fixture API key is invalid' in error and 'invalid-fixture-key' not in error
 click('Cancel',"document.querySelector('[role=dialog]')")
 assert invoke('plugin:keychain|get_item',{'key':vault})['password']=='valid-fixture-key'
 print('native_invalid_key_discovery_alert_does_not_replace_saved_key',True)
 # A genuine native drop grant is mandatory; IPC cannot supply an arbitrary path.
 switch_tab(answer['targetId']);invoke('set_answer_editing',{'editing':True})
 assert js("window.__TAURI_INTERNALS__.invoke('read_dropped_documents',{dropId:'forged'}).then(()=>false,()=>true)")
 js("(()=>{const data=new DataTransfer();data.items.add(new File(['Owned drop reference text'],'owned-drop.txt',{type:'text/plain'}));document.querySelector('[data-interactive]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()")
 settle(lambda:js("document.querySelector('.fluely-attachment')?.textContent.includes('owned-drop.txt')"))
 print('native_webview_DOM_drop_intake_and_forged_grant_rejection',True)
 invoke('set_answer_editing',{'editing':False})
 before=js("document.querySelectorAll('.fluely-attachment').length")
 js("(()=>{const data=new DataTransfer();data.items.add(new File(['Ignored'],'passive-drop.txt'));document.querySelector('[data-interactive]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()")
 assert js("document.querySelectorAll('.fluely-attachment').length")==before
 print('native_passive_chat_ignores_drop',True)
 # Force a streamed tool call, with enough quota for actual usage + continuation,
 # rather than two unsettled full output reservations.
 switch_tab(dashboard['targetId'])
 tool=dict(base,id='owned-agent-brain',credential_id='owned-agent-no-key',preset='openrouter',model='fixture-agent',variables={},secret_keys=[],max_output_tokens=256,context_window=16384,token_limit_per_minute=3500)
 invoke('upsert_provider',{'provider':tool})
 invoke('update_chat_preferences',{'patch':{'system_prompt':'You assist with software development.','structured_prompt':'Use <main>, <side> and <speak>.','selections':{'brain':{'source':'local','provider_id':tool['id']}}}})
 invoke('plugin:event|emit',{'event':'shell-action','payload':{'action':'session_new','id':'owned-tools-new-'+str(time.time_ns()),'source':'acceptance'}})
 time.sleep(.3);invoke('continuous_add_question',{'question':'Explain a Python function using the available workspace status tool.'})
 switch_tab(answer['targetId']);settle(lambda:js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Fixture answer.')"))
 payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read())
 assert payload['tool_choice']=='none' and payload['messages'][-1]['role']=='tool' and json.loads(payload['messages'][-1]['content'])['workspace_connected'] is False
 status=invoke('get_providers_status',{'kind':'brain'});used=next(p for p in status['providers'] if p['id']==tool['id'])
 assert used['used']['per_day']==2 and used['tokenUsed']['per_day']==28,used
 bindings=invoke('get_registered_shortcuts')
 assert bindings['tts_stop'].lower()=='ctrl+alt+space' and bindings['tts_seek_back'].lower()=='ctrl+alt+z' and bindings['tts_seek_forward'].lower()=='ctrl+alt+x',bindings
 print('native_agent_tool_continuation_two_requests_exact_usage_and_TTS_bindings',True)
finally:
 switch_tab(dashboard['targetId']);invoke('plugin:keychain|remove_item',{'key':vault})
