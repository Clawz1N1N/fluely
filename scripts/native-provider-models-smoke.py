# UI + native persistence checks on the owned isolated test profile; no real keys.
import json,time,uuid
main=next(tab for tab in list_tabs() if tab['url']=='http://tauri.localhost/')
switch_tab(main['targetId'])
def invoke(command,args=None):
    return js('window.__TAURI_INTERNALS__.invoke('+json.dumps(command)+((','+json.dumps(args)) if args is not None else '')+')')
def settle(predicate):
    until=time.monotonic()+15
    while time.monotonic()<until:
        if predicate():return
        time.sleep(.1)
    raise AssertionError('Provider UI did not settle')
invoke('open_dashboard')
dashboard=next(tab for tab in list_tabs() if tab['url'].endswith('/settings'))
switch_tab(dashboard['targetId'])
js("(async()=>{localStorage.setItem('fluely.interface-language','en');await window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'fluely-interface-language',payload:'en'});})()")
settle(lambda:js("document.querySelector('#provider-models h2')?.textContent")=='Providers and models')
assert not js("document.querySelector('#provider-models').textContent.includes('cURL')")
def button(text,scope='#provider-models'):
    return js("(()=>{const parent=document.querySelector("+json.dumps(scope)+");const b=[...parent.querySelectorAll('button')].find(b=>b.textContent.trim()==="+json.dumps(text)+");if(!b)throw Error('Missing button '+"+json.dumps(text)+");b.click();return true;})()")
def edit(label,value,scope='#provider-models'):
    return js("(()=>{const p=document.querySelector("+json.dumps(scope)+");const l=[...p.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==="+json.dumps(label)+");const input=l?.querySelector('input');if(!input)throw Error('Missing field '+"+json.dumps(label)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+json.dumps(value)+");input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
def dialog():return js("!!document.querySelector('[role=dialog]')")
owned_accounts=[]
try:
    button('Add provider or API key')
    assert not js("[...document.querySelectorAll('#provider-models label')].some(l=>l.querySelector('span')?.textContent==='Base URL')")
    button('Cancel')
    for index in range(2):
        button('Other')
        edit('Provider name','Owned fixture')
        edit('Provider ID','owned-provider')
        edit('Display name','Owned key '+str(index+1))
        edit('Base URL','http://127.0.0.1:18146/v1')
        edit('API key','owned-fixture-key-'+str(index+1))
        before=invoke('list_providers')
        button('Fetch models');settle(dialog)
        settle(lambda:js("document.querySelector('[role=dialog]').textContent.includes('Fixture vision')"))
        button('Select all','[role=dialog]')
        assert js("document.querySelectorAll('[role=dialog] .max-h-64 input:checked').length")==3
        button('Deselect all','[role=dialog]')
        assert js("document.querySelectorAll('[role=dialog] .max-h-64 input:checked').length")==0
        js("document.querySelector('[role=dialog] button[aria-label=\"Previous selection\"]').click()")
        assert js("document.querySelectorAll('[role=dialog] .max-h-64 input:checked').length")==3
        js("document.querySelector('[role=dialog] button[aria-label=\"Next selection\"]').click()")
        assert js("document.querySelectorAll('[role=dialog] .max-h-64 input:checked').length")==0
        # Cancel must not create metadata or write the entered key.
        button('Cancel','[role=dialog]');settle(lambda:not dialog())
        assert invoke('list_providers')==before
        button('Fetch models');settle(dialog)
        button('Select all','[role=dialog]')
        button('Save selected models','[role=dialog]');settle(lambda:not dialog())
        saved=[p for p in invoke('list_providers') if p.get('display_name')=='Owned key '+str(index+1)]
        assert len(saved)==3,saved
        credential=saved[0]['credential_id'];owned_accounts.append(credential)
        assert all(p['credential_id']==credential and p['provider_id']=='owned-provider' for p in saved)
        assert next(p for p in saved if p['model']=='fixture-vision')['supports_images']
        assert not next(p for p in saved if p['model']=='fixture-text')['supports_images']
        assert next(p for p in saved if p['model']=='fixture-audio')['supports_audio']
        assert all(p['context_window'] and p['max_output_tokens'] for p in saved)
        secret=invoke('plugin:keychain|get_item',{'key':'pluely.provider.'+credential+'.API_KEY'})
        assert secret['password']=='owned-fixture-key-'+str(index+1)
    assert owned_accounts[0]!=owned_accounts[1]
    print('native_provider_models_modal_cancel_history_capabilities_two_keys',True)
    # Vision picker must list only image-capable models, even if registered as brain.
    js("[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='pixel-text')).value='semantic'")
    selector=js("(()=>{const label=[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Vision model');const s=label.querySelector('select');s.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));return true;})()")
    settle(lambda:js("(()=>{const label=[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Vision model');return [...label.querySelector('select').options].filter(o=>o.value).length;})()")>=2)
    options=js("(()=>{const label=[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Vision model');return [...label.querySelector('select').options].filter(o=>o.value).map(o=>o.textContent);})()")
    assert all('Fixture text' not in name and 'Fixture audio' not in name for name in options),options
    print('native_vision_picker_only_image_capable_models',True)
finally:
    switch_tab(main['targetId'])
    for credential in owned_accounts:
        invoke('save_provider_models',{'credentialId':credential,'kind':'brain','providers':[]})
        invoke('plugin:keychain|remove_item',{'key':'pluely.provider.'+credential+'.API_KEY'})
    print('owned_provider_fixture_cleanup',True)
