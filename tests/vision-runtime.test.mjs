import test from 'node:test';import assert from 'node:assert/strict';
import { streamBrain } from '../src/lib/overlay/provider-engine.ts';
import { answer } from '../src/components/ServiceRuntime.tsx';
import { ScreenSceneMemory } from '../src/lib/overlay/screen-context.ts';
import { t } from '../src/lib/i18n/index.ts';
const provider={id:'fluely-local-vision',kind:'vision',preset:'openai-compatible',base_url:'http://127.0.0.1:8083/v1',model:'fluely-local-vision',supports_images:true,variables:{},secret_keys:[],curl:null};
test('multimodal requests place the image before the task for local vision models',async()=>{
  const original=globalThis.fetch;let request;
  globalThis.fetch=async(_url,init)=>{request=JSON.parse(init.body);return new Response('data: {"choices":[{"delta":{"content":"red circle"}}]}\n\n');};
  try{for await(const _chunk of streamBrain(provider,'Observe the image',[],'What is in the image?',['image-data'],new AbortController().signal)){}
    const content=request.messages.at(-1).content;assert.equal(content[0].type,'image_url');assert.equal(content.at(-1).type,'text');
  }finally{globalThis.fetch=original;}
});
function fixture(){
  const requests=[],reports=[];const brain={...provider,id:'brain',kind:'brain',supports_images:false};
  const ports={
    choose:async(kind,excluded)=>{if(excluded.length)throw Error('No available provider');return kind==='vision'?provider:brain;},
    stream:async function*(entry,prompt,history,text,images){requests.push({entry,prompt,history,text,images});yield entry.kind==='vision'?'A blue line chart rises beside a photo of a red car.':'<main>The chart rises.</main>';},
    report:async(entry,error)=>reports.push({entry,error}),visionSettings:async()=>({mode:'full',max_chars:8000}),
    nativeContext:async()=>{throw Error('OCR unavailable');},systemPrompt:()=> 'Answer accurately',memory:new ScreenSceneMemory(),
  };
  return{ports,requests,reports};
}
test('pixel-text method feeds spatial pixels to a blind brain without selecting a vision model',async()=>{
  const f=fixture();
  f.ports.visionSettings=async()=>({method:'pixel-text',mode:'full',max_chars:8000});
  f.ports.nativeContext=async()=> '[PIXEL LUMINANCE]\n▀▄█\n[COLOR MAP]\nRBG';
  const choose=f.ports.choose;
  f.ports.choose=async(kind,...args)=>{if(kind==='vision')throw Error('Must not load a VLM');return choose(kind,...args);};
  for await(const _chunk of answer({request_id:6,frames:[{monitor:'left',jpeg_base64:'image',width:100,height:100}],transcript:[],questions:['Where is red?']},[],new AbortController().signal,f.ports)){}
  const request=f.requests.at(-1);assert.match(request.text,/▀▄█/);assert.match(request.text,/RBG/);assert.deepEqual(request.images,[]);
  assert.equal(f.requests.filter(request=>request.entry.kind==='vision').length,0);
});
test('screen method still applies to image-capable reasoning while attachments stay direct',async()=>{
  const f=fixture();
  f.ports.visionSettings=async()=>({method:'pixel-text',mode:'full',max_chars:8000});
  f.ports.nativeContext=async frame=>`[PIXEL LUMINANCE]\n${frame} ▀▄█`;
  f.ports.choose=async kind=>{assert.equal(kind,'brain');return {...provider,id:'brain',kind:'brain',supports_images:true};};
  for await(const _chunk of answer({request_id:7,frames:[{monitor:'left',jpeg_base64:'screen',width:100,height:100},{monitor:'attachment',jpeg_base64:'attached',width:100,height:100}],transcript:[],questions:['Compare these']},[],new AbortController().signal,f.ports)){}
  const request=f.requests.at(-1);assert.match(request.text,/screen ▀▄█/);assert.deepEqual(request.images,['attached']);
});
test('semantic method forwards the explicitly selected registered vision model',async()=>{
  const f=fixture();const choose=f.ports.choose;let requested;
  f.ports.visionSettings=async()=>({method:'semantic',vision_provider_id:'registered-brain-image-model',mode:'full',max_chars:8000});
  f.ports.choose=async(kind,excluded,signal,preferred)=>{if(kind==='vision')requested=preferred;return choose(kind,excluded,signal);};
  for await(const _chunk of answer({request_id:8,frames:[{monitor:'left',jpeg_base64:'screen',width:100,height:100}],transcript:[],questions:['Describe']},[],new AbortController().signal,f.ports)){}
  assert.equal(requested,'registered-brain-image-model');assert.deepEqual(f.requests.at(-1).images,[]);
});
test('fallback from an image-capable brain interprets attachments for the blind replacement without repeating screens',async()=>{
  const f=fixture();const seen=[];const stream=f.ports.stream;
  f.ports.visionSettings=async()=>({method:'pixel-text',mode:'full',max_chars:8000});
  f.ports.nativeContext=async image=>{seen.push(image);return `[PIXEL LUMINANCE]\n${image} ▀▄█`;};
  f.ports.choose=async(kind,excluded)=>{assert.equal(kind,'brain');return {...provider,id:excluded.length?'blind':'image-brain',kind:'brain',supports_images:!excluded.length};};
  f.ports.stream=async function*(entry,...args){if(entry.id==='image-brain')throw Error('Image reasoning unavailable');yield*stream(entry,...args);};
  for await(const _chunk of answer({request_id:9,frames:[{monitor:'left',jpeg_base64:'screen',width:100,height:100},{monitor:'attachment',jpeg_base64:'attached',width:100,height:100}],transcript:[],questions:['Compare these']},[],new AbortController().signal,f.ports)){}
  assert.deepEqual(seen,['screen','attached']);assert.match(f.requests.at(-1).text,/attached ▀▄█/);assert.deepEqual(f.requests.at(-1).images,[]);
});
test('a blind brain receives semantic image understanding and later questions retain the unchanged scene',async()=>{
  const f=fixture();const signal=new AbortController().signal;
  const frame={monitor:'left',jpeg_base64:'image',width:100,height:100};
  for await(const _chunk of answer({request_id:1,frames:[frame],transcript:[],questions:['What is shown?']},[],signal,f.ports)){}
  const first=f.requests.find(request=>request.entry.kind==='brain');
  assert.match(first.text,/blue line chart rises/);assert.match(first.text,/red car/);assert.deepEqual(first.images,[]);
  for await(const _chunk of answer({request_id:2,frames:[],transcript:[],questions:['What is beside the chart?']},[],signal,f.ports)){}
  const last=f.requests.at(-1);assert.match(last.text,/red car/);
  assert.equal(f.requests.filter(request=>request.entry.kind==='vision').length,1);
  assert.equal(f.reports.filter(report=>report.error).length,0);
});
test('missing vision is shown explicitly and never blamed on the blind brain provider',async()=>{
  const f=fixture();f.ports.choose=async kind=>{if(kind==='vision')throw Error('No visual provider');return{...provider,id:'brain',kind:'brain',supports_images:false};};
  await assert.rejects(async()=>{for await(const _chunk of answer({request_id:3,frames:[{monitor:'1',jpeg_base64:'image',width:10,height:10}],transcript:[],questions:['What is here?']},[],new AbortController().signal,f.ports)){}},error=>error.message===t('Visual understanding requires an image-capable vision provider. Start local vision with a model and matching projector, or configure a cloud vision provider in Settings.'));
  assert.equal(f.reports.filter(report=>report.entry.kind==='brain'&&report.error).length,0);
  assert.equal(f.requests.length,0);
});
test('brain fallback reuses the prepared visual description instead of paying for the image twice',async()=>{
  const f=fixture();const originalStream=f.ports.stream;
  f.ports.choose=async(kind,excluded)=>kind==='vision'?provider:{...provider,id:excluded.length?'brain-second':'brain-first',kind:'brain',supports_images:false};
  f.ports.stream=async function*(entry,...args){
    if(entry.id==='brain-first')throw Error('Brain model unavailable');
    yield* originalStream(entry,...args);
  };
  for await(const _chunk of answer({request_id:4,frames:[{monitor:'attachment',jpeg_base64:'image',width:10,height:10}],transcript:[],questions:['Describe it']},[],new AbortController().signal,f.ports)){}
  assert.equal(f.requests.filter(request=>request.entry.kind==='vision').length,1);
  assert.match(f.requests.find(request=>request.entry.id==='brain-second').text,/red car/);
});
