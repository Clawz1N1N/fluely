import test from 'node:test';
import assert from 'node:assert/strict';
import {createTtsProfileStore,TTS_PROFILES_KEY} from '../src/pages/dev/tts-profiles.ts';
const legacy={backend:'piper',enabled:true,voice:'C:/Voices/uk.onnx',language:'uk-UA',rate:1,stream:true,piper_executable:'C:/Piper/piper.exe'};
function fixture(raw){const values=new Map(raw?[[TTS_PROFILES_KEY,raw]]:[]),writes=[];return{values,writes,store:createTtsProfileStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(value);values.set(key,value);}})};}
test('legacy native Piper voice migrates without appearing as a System voice or activating a backend during navigation',()=>{
  const {store,writes}=fixture();
  assert.equal(store.load(legacy,'piper').voice,legacy.voice);
  assert.equal(store.load(legacy,'system').voice,'');
  assert.equal(store.load(legacy,'system').language,'uk-UA');
  assert.deepEqual(writes,[]);
  assert.equal(legacy.backend,'piper');
});
test('successful System save preserves migrated Piper profile and later saves never overwrite the other backend',async()=>{
  const {store,values}=fixture();let active=legacy;
  const system={...store.load(active,'system'),voice:'Microsoft Ukrainian'};
  await store.save(active,system,async settings=>{active=settings;});
  const reloaded=createTtsProfileStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
  assert.equal(reloaded.load(active,'piper').voice,legacy.voice);
  assert.equal(reloaded.load(active,'piper').piper_executable,legacy.piper_executable);
  const piper={...reloaded.load(active,'piper'),rate:1.2};
  await reloaded.save(active,piper,async settings=>{active=settings;});
  assert.equal(reloaded.load(active,'system').voice,'Microsoft Ukrainian');
  assert.equal(reloaded.load(active,'piper').rate,1.2);
});
test('native failure never publishes profiles and corrupted or missing legacy language uses valid defaults',async()=>{
  const {store,writes}=fixture('{broken json');
  const draft=store.load({...legacy,language:'',rate:NaN},'system');
  assert.equal(draft.language,'uk');assert.equal(draft.rate,1);
  await assert.rejects(store.save(legacy,draft,async()=>{throw new Error('Native disk failure');}),/Native disk failure/);
  assert.deepEqual(writes,[]);
});
test('stored profiles whitelist voice configuration and never retain credential-like fields',async()=>{
  const {store,values}=fixture(JSON.stringify({version:1,profiles:{system:{voice:'A',language:'en-US',rate:1,stream:true,piper_executable:'piper',API_KEY:'must-not-persist',authorization:'must-not-persist'}}}));
  await store.save(legacy,{...store.load(legacy,'system'),voice:'B'},async()=>{});
  const saved=values.get(TTS_PROFILES_KEY);
  assert.ok(!saved.includes('API_KEY'));assert.ok(!saved.includes('authorization'));assert.ok(!saved.includes('must-not-persist'));
});
test('blocked profile storage reports native settings already committed instead of claiming a complete save',async()=>{
  let updated=false;
  const store=createTtsProfileStore({getItem(){return null;},setItem(){throw new Error('Storage denied');}});
  await assert.rejects(store.save(legacy,legacy,async()=>{updated=true;}),/TTS settings were saved, but backend profiles/);
  assert.equal(updated,true);
});
