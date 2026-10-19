import test from 'node:test';
import assert from 'node:assert/strict';
import {MODE_PROMPTS,migrateModePrompts,providersForSelection,responseInstructions,modelDisplayName} from '../src/lib/overlay/chat-preferences-core.ts';
import {DEFAULT_STRUCTURED_PROMPT} from '../src/lib/overlay/structured.ts';
import {answer} from '../src/components/ServiceRuntime.tsx';
import {ScreenSceneMemory} from '../src/lib/overlay/screen-context.ts';
import {readFileSync} from 'node:fs';
import {estimateBrainTokens,fitModelHistory} from '../src/lib/overlay/model-request.ts';
import {buildEnhancedSystemPrompt} from '../src/lib/functions/ai-response.function.ts';

const model=(id,kind='brain',extra={})=>({id,kind,model:id,enabled:true,base_url:'https://cloud.example/v1',supports_images:false,...extra});
const providers=[model('cloud'),model('local','brain',{base_url:'http://127.0.0.1:8080/v1'}),model('images','brain',{supports_images:true}),model('disabled','vision',{enabled:false,supports_images:true}),model('fluely-local-vision','vision',{supports_images:true}),model('system','stt',{preset:'system-stt',base_url:'http://localhost'}),model('whisper','stt',{base_url:'http://localhost:8081'})];
test('saved models with blank or missing display names still show their model ID',()=>{
  for(const label of [undefined,'','   '])assert.equal(modelDisplayName(model('model-id','brain',{model_display_name:label})),'model-id');
  assert.equal(modelDisplayName(model('model-id','brain',{model_display_name:' Friendly name '})),'Friendly name');
});
test('source selections restrict actual eligible models and image-only vision',()=>{
  assert.deepEqual(providersForSelection(providers,'brain',{source:'cloud',provider_id:null}).map(p=>p.id),['cloud','images']);
  assert.deepEqual(providersForSelection(providers,'brain',{source:'local',provider_id:null}).map(p=>p.id),['local']);
  assert.deepEqual(providersForSelection(providers,'vision',{source:'cloud',provider_id:null}).map(p=>p.id),['images']);
  assert.deepEqual(providersForSelection(providers,'brain',{source:'cloud',provider_id:'local'}),[]);
  assert.deepEqual(providersForSelection(providers,'stt',{source:'system',provider_id:null}).map(p=>p.id),['system']);
  assert.deepEqual(providersForSelection(providers,'stt',{source:'local',provider_id:null}).map(p=>p.id),['whisper']);
});
test('mode migration preserves user edits and titles while adding missing modes',()=>{
  const edited={title:'My coding',modelId:'coding',modelName:'Default',prompt:'My carefully edited instruction'};
  const oldGeneral={title:'General',modelId:'general',modelName:'Default',prompt:'You are a helpful AI assistant. Be concise, accurate, and friendly in your responses.'};
  const migrated=migrateModePrompts([edited,oldGeneral]);
  assert.deepEqual(migrated.find(p=>p.modelId==='coding'),edited);
  assert.equal(migrated.find(p=>p.modelId==='general').prompt,MODE_PROMPTS.find(p=>p.modelId==='general').prompt);
  assert.equal(new Set(migrated.map(p=>p.modelId)).size,5);
});
test('service answer sends selected mode, response language and length to the model',async()=>{
  const preferences={response_language:'russian',response_length:'short'};
  const systemPrompt=[MODE_PROMPTS.find(p=>p.modelId==='coding').prompt,DEFAULT_STRUCTURED_PROMPT,responseInstructions(preferences)].join('\n\n');
  let sent;
  const chunks=[];
  for await(const chunk of answer({request_id:1,frames:[],transcript:[],questions:['Explain the code']},[],new AbortController().signal,{
    choose:async()=>model('cloud'),systemPrompt:()=>systemPrompt,memory:new ScreenSceneMemory(),report:async()=>{},
    nativeContext:async()=>'',visionSettings:async()=>({mode:'full',max_chars:100}),
    stream:async function*(_entry,prompt){sent=prompt;yield '<main>Ответ</main>';},
  }))chunks.push(chunk);
  assert.match(sent,/software engineering assistant/);assert.match(sent,/Respond in Russian/);assert.match(sent,/2-4 sentences maximum/);
  assert.doesNotMatch(DEFAULT_STRUCTURED_PROMPT,/Відповідай українською/);assert.deepEqual(chunks.filter(chunk=>typeof chunk==='string'),['<main>Ответ</main>']);
  const usage=chunks.find(chunk=>chunk.context)?.context;assert.equal(usage.model,'cloud');assert.equal(usage.estimated,true);assert.equal(usage.contextWindow,null);assert(usage.inputTokens>0);
});
test('answer window receives read-only SQL permissions for saved user templates',()=>{
  const capability=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/answer-prompts.json',import.meta.url),'utf8'));
  assert.deepEqual(capability.windows,['answer']);assert.ok(capability.permissions.includes('sql:allow-select'));assert.ok(capability.permissions.includes('sql:allow-load'));assert.ok(!capability.permissions.includes('sql:allow-execute'));
});

test('reasoning quota preflight uses fitted candidate history and excludes monitor JPEGs',async()=>{
  const candidate=model('blind','brain',{context_window:8192,max_output_tokens:128});
  const history=[{role:'user',content:'old'.repeat(20000)},{role:'assistant',content:'old answer'},{role:'user',content:'recent question'},{role:'assistant',content:'recent answer'},{role:'user',content:'latest question'},{role:'assistant',content:'latest answer'}];let estimates;
  for await(const _ of answer({request_id:2,frames:[{monitor:'display',jpeg_base64:'A'.repeat(100000),width:200,height:200}],transcript:[],questions:['Question']},history,new AbortController().signal,{
    candidateProviders:async()=>[candidate],choose:async(_kind,_excluded,_signal,_preferred,input)=>{if(typeof input==='object')estimates=input;return candidate;},
    systemPrompt:()=>'',memory:new ScreenSceneMemory(),report:async()=>{},nativeContext:async()=>'Small screen description',
    visionSettings:async()=>({mode:'ocr',max_chars:100}),stream:async function*(){yield '<main>Answer</main>';},
  })){}
  const prompt=buildEnhancedSystemPrompt('');
  assert.equal(estimates.blind,estimateBrainTokens(prompt,fitModelHistory(candidate,prompt,'Question',history),'Question',[]));
  assert.ok(estimates.blind<10000);
});
