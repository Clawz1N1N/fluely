"""Final-candidate native cancellation: own profile and delayed loopback model."""
import json,time,urllib.request
def settle(predicate,timeout=20):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate():return
  time.sleep(.1)
 raise AssertionError('Cancellation acceptance did not settle')
def invoke(command,args=None):return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+(','+json.dumps(args) if args is not None else '')+')')
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith(('/settings','/dev')));answer=next(tab for tab in list_tabs() if tab['url'].endswith('/shell/answer'))
switch_tab(dashboard['targetId'])
base=next(p for p in invoke('list_providers') if p['id']=='owned-session-brain')
entry=dict(base,id='owned-abort-agent',credential_id='owned-abort-no-key',preset='openrouter',model='fixture-agent-delay',max_output_tokens=256,context_window=16384,variables={},secret_keys=[])
invoke('upsert_provider',{'provider':entry})
invoke('update_chat_preferences',{'patch':{'selections':{'brain':{'source':'local','provider_id':entry['id']}}}})
def new_chat():invoke('plugin:event|emit',{'event':'shell-action','payload':{'action':'session_new','id':'cancel-session-'+str(time.time_ns()),'source':'acceptance'}})
new_chat();time.sleep(.3);invoke('continuous_add_question',{'question':'Use workspace status, then explain this coding request.'})
def second_request():
 payload=json.loads(urllib.request.urlopen('http://127.0.0.1:18146/last-request').read())
 return payload.get('model')=='fixture-agent-delay' and payload.get('tool_choice')=='none'
settle(second_request)
switch_tab(answer['targetId']);before=js("document.querySelector('[data-session-revision]').dataset.sessionRevision")
new_chat();settle(lambda:js("document.querySelector('[data-session-revision]').dataset.sessionRevision")!=before)
# Let the delayed server finish too; late data must not enter the new session.
time.sleep(2.2)
assert not js("document.querySelector('[aria-label=Conversation]')?.textContent.includes('Late fixture reply')")
provider=next(p for p in invoke('get_providers_status',{'kind':'brain'})['providers'] if p['id']==entry['id'])
assert provider['used']['per_day']==2 and not provider['inCooldown'],provider
print('native_cancelled_tool_continuation_keeps_model_healthy_and_new_chat_empty',True)
