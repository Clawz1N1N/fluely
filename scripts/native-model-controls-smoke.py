# Owned native Fluely instance on CDP 9225; loopback provider fixture on 18146.
import base64,json,pathlib,time,urllib.request

def settle(predicate,timeout=20):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate():return
  time.sleep(.1)
 raise AssertionError('Native model controls did not settle')
def invoke(command,args=None):return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
def button(name,scope='body'):
 return js("(()=>{const button=[...document.querySelector("+json.dumps(scope)+").querySelectorAll('button')].find(b=>b.textContent.trim().replace(/^✓\\s*/,'').startsWith("+json.dumps(name)+")||b.getAttribute('aria-label')==="+json.dumps(name)+");if(!button)throw Error('Missing button '+"+json.dumps(name)+");button.click();})()")

main=next(t for t in list_tabs() if t['url']=='http://tauri.localhost/');switch_tab(main['targetId']);cdp('Page.setWebLifecycleState',state='active')
invoke('open_dashboard');invoke('show_answer_window')
dashboard=next(t for t in list_tabs() if t['url'].endswith('/settings'))
answer=next(t for t in list_tabs() if t['url'].endswith('/shell/answer'))
switch_tab(dashboard['targetId'])
js("(async()=>{localStorage.setItem('fluely.interface-language','en');await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'fluely-interface-language',payload:'en'});})()")
settle(lambda:js("document.querySelector('main header label')?.textContent==='Settings'"))
monitor=invoke('get_layout_monitors')[0]
invoke('set_shell_opacity',{'label':'strips','opacity':.28})
panels=[{'id':'first','x':monitor['x']+30,'y':monitor['y']+30,'columns':2,'gap':4,'padding':4,'button_size':36,'opacity':.6,'actions':[{'action':a,'enabled':True} for a in ['listen','screenshot','continuous','answer','chat','tts','mode','settings']]}]
invoke('set_custom_layout',{'panels':panels})
settle(lambda:any(t['url'].endswith('/shell/panel/first') for t in list_tabs()))
panel=next(t for t in list_tabs() if t['url'].endswith('/shell/panel/first'))
switch_tab(panel['targetId']);settle(lambda:js("!!document.querySelector('[data-panel-id]')"))
# Freeze the hidden JS service: native appearance events must still update views.
switch_tab(main['targetId']);cdp('Page.setWebLifecycleState',state='frozen')
switch_tab(dashboard['targetId'])
appearance=invoke('get_shell_settings');appearance.update(shimmer=True,shimmer_speed=20,answer_opacity=.2,strip_opacity=.1,button_opacities={'listen':.05,'settings':.8})
invoke('set_shell_appearance',{'settings':appearance})
switch_tab(panel['targetId'])
settle(lambda:js("document.querySelector('[data-panel-id]')&&getComputedStyle(document.querySelector('[data-panel-id]')).backgroundColor")=='rgba(23, 23, 23, 0.1)')
assert js("getComputedStyle(document.querySelector('[data-panel-id] button')).backgroundColor")=='rgba(23, 23, 23, 0.05)'
assert js("getComputedStyle(document.querySelector('.shimmer-ring')).animationDuration")=='20s'
assert js("getComputedStyle(document.querySelector('.shimmer-ring')).opacity")=='0.85'
switch_tab(answer['targetId']);settle(lambda:js("getComputedStyle(document.querySelector('#root > div')).backgroundColor")=='rgba(23, 23, 23, 0.2)')
assert js("!!document.querySelector('.shimmer-ring')")
switch_tab(main['targetId']);cdp('Page.setWebLifecycleState',state='active')
print('native_appearance_custom_groups_buttons_chat_shimmer_independent_of_service',True)

switch_tab(dashboard['targetId'])
button('AI settings','aside')
settle(lambda:js("location.pathname==='/dev' && !!document.querySelector('#provider-models')"))
assert not js("[...document.querySelectorAll('#provider-models > div button')].some(b=>b.textContent.trim()==='Other')")
base={'kind':'brain','preset':'openai-compatible','supports_images':False,'supports_audio':False,'rank':0,'enabled':True,'limit_per_second':0,'limit_per_minute':0,'limit_per_hour':0,'limit_per_day':0,'curl':None,'streaming':True,'response_content_path':'choices.0.message.content','variables':{},'secret_keys':[],'max_output_tokens':512,'reasoning_effort':'high','reasoning_efforts':['off','low','medium','high','xhigh','max']}
ids=['owned-controls-cloud','owned-controls-image','owned-controls-local']
try:
 for id,url,images in [(ids[0],'https://example.invalid/v1',False),(ids[1],'https://example.invalid/v1',True),(ids[2],'http://127.0.0.1:18146/v1',False)]:
  invoke('upsert_provider',{'provider':dict(base,id=id,model=id,model_display_name=id,base_url=url,supports_images=images)})
 prefs=invoke('get_chat_preferences')
 invoke('update_chat_preferences',{'patch':{'response_language':'english','response_length':'short','selections':{'brain':{'source':'local','provider_id':ids[2]}}}})
 # Independent request/token quotas and pause do not alter the other model.
 paused=dict(base,id=ids[0],model=ids[0],base_url='https://example.invalid/v1',manual_neutral=True,token_limit_per_minute=1000)
 invoke('upsert_provider',{'provider':paused})
 assert next(p for p in invoke('list_providers') if p['id']==ids[0])['manual_neutral']
 assert not next(p for p in invoke('list_providers') if p['id']==ids[2])['manual_neutral']
 try:invoke('pick_provider',{'kind':'brain','needsImages':False,'preferredProviderId':ids[0],'excludeIds':[]});raise AssertionError('Paused model picked')
 except RuntimeError as error:assert 'Neutral mode' in str(error),str(error)
 switch_tab(answer['targetId']);invoke('set_answer_editing',{'editing':True})
 settle(lambda:js("document.querySelector('[data-interactive=true]')!==null"))
 assert js("!!document.querySelector('[aria-label=\"Chat interaction shortcut\"]')")
 button('Reasoning')
 settle(lambda:js("document.body.textContent.includes('Cloud')"))
 button('Cloud');settle(lambda:js("document.body.textContent.includes('owned-controls-cloud')"))
 button(ids[0]);settle(lambda:invoke('get_chat_preferences')['selections']['brain']['provider_id']==ids[0])
 assert js("document.body.textContent.includes('Reasoning effort')")
 button('low');settle(lambda:next(p for p in invoke('list_providers') if p['id']==ids[0])['reasoning_effort']=='low')
 button('Vision');button('Cloud')
 settle(lambda:js("document.body.textContent.includes('owned-controls-image')"))
 assert not js("document.body.textContent.includes('owned-controls-cloud')")
 js("document.querySelector('[aria-label=\"Chat settings\"] button').click()");settle(lambda:js("document.body.textContent.includes('Coding')"))
 assert not js("document.querySelector('[role=alert]')?.textContent?.includes('sql')")
 button('Coding');settle(lambda:invoke('get_chat_preferences')['prompt_id']=='mode:coding')
 invoke('update_chat_preferences',{'patch':{'selections':{'brain':{'source':'local','provider_id':ids[2]}}}})
 # Send a real queued question and inspect the request received by the fixture.
 js("(()=>{const input=document.querySelector('form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Owned controls smoke question');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()")
 button('Send')
 settle(lambda:js("document.body.textContent.includes('Fixture answer.')"),40)
 payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read())
 assert payload['model']==ids[2] and payload['reasoning_effort']=='high',payload
 assert 'software engineering assistant' in payload['messages'][0]['content']
 assert 'English' in payload['messages'][0]['content']
 settle(lambda:next(p for p in invoke('get_providers_status',{'kind':'brain'})['providers'] if p['id']==ids[2])['tokenUsed']['per_minute']==20)
 status=invoke('get_providers_status',{'kind':'brain'})
 assert next(p for p in status['providers'] if p['id']==ids[2])['tokenUsed']['per_minute']==20,status
 print('native_chat_template_model_source_reasoning_real_request_and_actual_token_usage',True)
 pathlib.Path('_research/temp/fluely-022-chat.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',format='png')['data']))
finally:
 switch_tab(dashboard['targetId'])
 for id in ids:invoke('remove_provider',{'id':id})
 invoke('update_chat_preferences',{'patch':{'selections':{kind:{'source':'auto','provider_id':None} for kind in ['brain','stt','tts','vision']},'response_language':'auto','response_length':'auto'}})
