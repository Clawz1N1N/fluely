import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModels, discoverModels, SelectionHistory, modelEntries } from '../src/lib/overlay/model-catalog.ts';

test('discovery imports declared input capabilities and token limits without guessing names',()=>{
  const result=normalizeModels({data:[{id:'a',context_length:8192,top_provider:{max_completion_tokens:1024},architecture:{input_modalities:['text','image','audio']}},{id:'vision-name-only'}]},'openrouter');
  assert.deepEqual(result[0],{id:'a',name:'a',context_window:8192,max_output_tokens:1024,supports_images:true,supports_audio:true});
  assert.equal(result[1].supports_images,false);assert.equal(result[1].context_window,null);
});
test('Gemini paginates and keeps native token metadata',async()=>{
  const requests=[];
  const models=await discoverModels({preset:'google',base_url:'https://example.invalid/v1beta'},'private-key',async(url,init)=>{
    requests.push({url,init});return {ok:true,json:async()=>requests.length===1?{models:[{name:'models/a',inputTokenLimit:10,outputTokenLimit:5}],nextPageToken:'next token'}:{models:[{name:'models/b'}]}};
  });
  assert.deepEqual(models.map(m=>m.id),['a','b']);assert.match(requests[1].url,/pageToken=next\+token/);
  assert.equal(requests[0].init.headers['x-goog-api-key'],'private-key');assert.ok(!requests[0].url.includes('private-key'));
});
test('selection history restores previous complete sets and clears redo on new edits',()=>{
  const h=new SelectionHistory(['old']);h.set(['a','b']);h.set([]);assert.deepEqual(h.back(),['a','b']);assert.deepEqual(h.back(),['old']);assert.deepEqual(h.forward(),['a','b']);h.set(['c']);assert.equal(h.canForward,false);
});
test('Claude official image_input capability is imported',()=>{
 const [model]=normalizeModels({data:[{id:'claude',max_input_tokens:200000,max_tokens:64000,capabilities:{image_input:{supported:true}}}]},'anthropic');
 assert.equal(model.supports_images,true);assert.equal(model.context_window,200000);
});
test('Mistral native max_context_length is imported',()=>{const [m]=normalizeModels({data:[{id:'mistral',max_context_length:32768,capabilities:{vision:true}}]},'mistral');assert.equal(m.context_window,32768);assert.equal(m.supports_images,true);});
test('Claude pagination uses cursor and native auth without exposing keys',async()=>{
 const calls=[];const list=await discoverModels({preset:'anthropic',base_url:'https://example.invalid/v1'},'fixture',async(url,init)=>{calls.push({url,init});return{ok:true,json:async()=>calls.length===1?{data:[{id:'a'}],has_more:true,last_id:'a'}:{data:[{id:'b'}],has_more:false}};});
 assert.equal(list.length,2);assert.match(calls[1].url,/after_id=a/);assert.equal(calls[0].init.headers['x-api-key'],'fixture');assert.equal(calls[0].init.headers['anthropic-version'],'2023-06-01');
});
test('Cohere uses native discovery pagination with the compatibility chat adapter',async()=>{
 const calls=[];const list=await discoverModels({preset:'cohere',base_url:'https://api.cohere.ai/compatibility/v1'},'fixture',async(url)=>{calls.push(url);return{ok:true,json:async()=>calls.length===1?{models:[{name:'command',context_length:16000}],next_page_token:'page two'}:{models:[{name:'command2'}]}};});
 assert.equal(list[0].context_window,16000);assert.match(calls[0],/^https:\/\/api.cohere.ai\/v1\/models\?/);assert.match(calls[1],/page_token=page\+two/);assert.equal(list.length,2);
});
test('discovery cancellation and repeated cursor cannot loop indefinitely',async()=>{
 const abort=new AbortController();abort.abort();let calls=0;
 await assert.rejects(discoverModels({preset:'google',base_url:'https://example.invalid'},'',async()=>{calls++;},abort.signal),{name:'AbortError'});assert.equal(calls,0);
 await assert.rejects(discoverModels({preset:'google',base_url:'https://example.invalid'},'',async()=>({ok:true,json:async()=>({models:[],nextPageToken:'same'})})),/pagination repeated/);
});
test('several models share their account key and distinct accounts never collide',()=>{
  const account={provider_id:'p',credential_id:'account-one',display_name:'Work',preset:'openrouter',base_url:'https://openrouter.ai/api/v1',kind:'brain'};
  const selected=[{id:'a',name:'A',context_window:4000,max_output_tokens:1000,supports_images:false,supports_audio:true},{id:'b',name:'B',context_window:null,max_output_tokens:null,supports_images:true,supports_audio:false}];
  const one=modelEntries(account,selected,[]),two=modelEntries({...account,credential_id:'account-two'},selected,[]);
  assert.equal(one[0].credential_id,one[1].credential_id);assert.notEqual(one[0].id,two[0].id);assert.equal(one[0].max_output_tokens,1000);assert.equal(one[1].supports_images,true);
});
