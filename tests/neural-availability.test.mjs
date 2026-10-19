import test from 'node:test';
import assert from 'node:assert/strict';
import {neuralAvailability,providerConfigurationKey} from '../src/lib/overlay/neural-availability.ts';
import {actionIsDisabled} from '../src/components/Shell/ShellControls.tsx';
import {INITIAL_SERVICE_STATE} from '../src/lib/overlay/contracts.ts';

const provider=(kind,id=kind)=>({id,kind,preset:'custom',base_url:'https://example.com',model:'model',enabled:true,supports_images:kind==='vision'});
test('availability obeys selected source and selected provider instead of any configured model',()=>{
  const available=neuralAvailability({providers:[provider('brain'),provider('stt')],preferences:{selections:{brain:{source:'local',provider_id:null},stt:{source:'cloud',provider_id:'removed'}}}});
  assert.equal(available.brain,false);assert.equal(available.stt,false);
});
test('quota status updates do not trigger configuration refreshes in every button window',()=>{
  const original=provider('brain');
  assert.equal(providerConfigurationKey([original]),providerConfigurationKey([{...original,used:{per_minute:12},tokenUsed:{per_minute:200},inCooldown:true,nextAllowedAt:1000}]));
  assert.notEqual(providerConfigurationKey([original]),providerConfigurationKey([{...original,enabled:false}]));
});
test('configured local engines and native speech/screen sources are available',()=>{
  const available=neuralAvailability({providers:[{...provider('brain','fluely-local-brain'),enabled:false,base_url:'http://localhost'}],localConfigs:[{kind:'brain',executable:'llama.exe',model_path:'brain.gguf'}],systemVoices:2,preferences:{selections:{brain:{source:'local',provider_id:'fluely-local-brain'},tts:{source:'system',provider_id:null},vision:{source:'system',provider_id:null}}}});
  assert.deepEqual(available,{brain:true,stt:false,tts:true,vision:true});
});
test('shell gates neural actions while retaining settings access and stopping active capture',()=>{
  const state={...INITIAL_SERVICE_STATE,ready:true,availability:{brain:false,stt:false,tts:false,vision:false}};
  for(const action of ['listen','screenshot','continuous','answer','chat','tts'])assert.equal(actionIsDisabled(action,state),true,action);
  assert.equal(actionIsDisabled('settings',state),false);
  assert.equal(actionIsDisabled('listen',{...state,listening:true}),false);
  assert.equal(actionIsDisabled('continuous',{...state,continuous:true}),false);
  assert.equal(actionIsDisabled('settings',{...state,ready:false,sleeping:true}),false);
});
