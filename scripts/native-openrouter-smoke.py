# Optional configured free-model check. Key stays inside Fluely's normal vault flow.
import json,pathlib,time,urllib.request,os
model='thinkingmachines/inkling-small:free'
catalog=json.loads(urllib.request.urlopen('https://openrouter.ai/api/v1/models',timeout=20).read())['data']
public=next(item for item in catalog if item['id']==model)
assert float(public['pricing']['prompt'])==0 and float(public['pricing']['completion'])==0
candidates=[pathlib.Path(os.environ['APPDATA'])/'com.clawz1n1n.fluely/providers.json',pathlib.Path(os.environ['APPDATA'])/'com.srikanthnani.pluely/providers.json',pathlib.Path.home()/'Downloads/profile/providers.json',pathlib.Path('..')/'RELEASE/profile/providers.json']
source=None
for path in candidates:
 if path.is_file():
  source=next((item for item in json.loads(path.read_text(encoding='utf-8'))['providers'] if item.get('model')==model and item.get('kind')=='brain'),None)
  if source:break
assert source and source.get('secret_keys'),'Configured free model not found'
assert source['base_url'].rstrip('/')=='https://openrouter.ai/api/v1'
def invoke(command,args=None):return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith(('/settings','/dev')));switch_tab(dashboard['targetId'])
budget=source['max_output_tokens'] if os.environ.get('FLUELY_ACCEPTANCE_ORIGINAL_OUTPUT')=='1' else 64
entry=dict(source,id='owned-live-openrouter',credential_id=source.get('credential_id') or source['id'],variables={},curl=None,max_output_tokens=budget,reasoning_effort='off',enabled=True,manual_neutral=False)
for field in ['limit_per_second','limit_per_minute','limit_per_hour','limit_per_day','token_limit_per_second','token_limit_per_minute','token_limit_per_hour','token_limit_per_day']:entry[field]=0
invoke('upsert_provider',{'provider':entry})
invoke('update_chat_preferences',{'patch':{'system_prompt':'Reply exactly OK. This is a functional connection test.','structured_prompt':'','response_language':'english','selections':{'brain':{'source':'cloud','provider_id':entry['id']}}}})
invoke('plugin:event|emit',{'event':'shell-action','payload':{'action':'session_new','id':'owned-live-new-'+str(time.time_ns()),'source':'acceptance'}})
time.sleep(.5)
invoke('continuous_add_question',{'question':'Reply exactly OK.'})
answer=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/answer'));switch_tab(answer['targetId'])
deadline=time.monotonic()+65
while time.monotonic()<deadline:
 error=js("document.querySelector('[role=alert]')?.textContent||''")
 if error:raise AssertionError(error)
 if js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('OK')"):
  print('configured_free_openrouter_native_request_and_vault_auth',True);break
 time.sleep(.25)
else:raise AssertionError('Free-model reply timed out')
