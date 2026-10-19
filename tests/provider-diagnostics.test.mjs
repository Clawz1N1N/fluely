import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderHttpError} from '../src/lib/overlay/network.ts';
import {streamBrain,reportProvider} from '../src/lib/overlay/provider-engine.ts';

test('HTTP diagnostics retain provider cause and retry delay while removing known credentials',async()=>{
  const error=await ProviderHttpError.fromResponseBody(new Response(JSON.stringify({error:{message:'No endpoints for inkling-small. key=private-value sk-or-v1-secretvalue'}}),{status:404,headers:{'retry-after':'10'}}),['private-value']);
  assert.equal(error.status,404);assert.equal(error.retryAfterSecs,10);
  assert.match(error.message,/No endpoints for inkling-small/);
  assert.ok(!error.message.includes('private-value'));assert.ok(!error.message.includes('secretvalue'));
});
test('unstructured and excessive error bodies are not exposed',async()=>{
  for(const body of ['<html>private-value</html>',JSON.stringify({error:{message:'x'.repeat(18000)}})]){
    const error=await ProviderHttpError.fromResponseBody(new Response(body,{status:500}));
    assert.equal(error.responseDiagnostic,undefined);
  }
});
test('router upstream metadata retains the precise structured cause without credentials',async()=>{
  const error=await ProviderHttpError.fromResponseBody(new Response(JSON.stringify({error:{message:'Provider returned error',metadata:{provider_name:'Upstream',raw:JSON.stringify({error:{message:'max_tokens is above the supported limit for private-key-value'}})}}}),{status:400}),['private-key-value']);
  assert.match(error.message,/Upstream: max_tokens is above/);assert.ok(!error.message.includes('private-key-value'));
  assert.equal(ProviderHttpError.fromEvent({error:{message:'Streaming service stopped'}}).status,0);
});
const entry={id:'openrouter-model',kind:'brain',preset:'openrouter',base_url:'https://openrouter.ai/api/v1',model:'thinkingmachines/inkling-small:free',variables:{},secret_keys:[],reasoning_effort:'high',max_output_tokens:4096};
test('OpenRouter uses router reasoning options and reports a streamed error despite HTTP 200',async()=>{
  const original=globalThis.fetch;let sent;
  globalThis.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return new Response('data: {"error":{"code":400,"message":"Provider does not support this request"}}\n\n',{headers:{'content-type':'text/event-stream'}});};
  try{
    await assert.rejects(async()=>{for await(const _chunk of streamBrain(entry,'Answer briefly',[],'Hello',[],new AbortController().signal)){}},error=>error.status===400&&/does not support/.test(error.message));
    assert.deepEqual(sent.reasoning,{effort:'high'});assert.equal(sent.reasoning_effort,undefined);assert.equal(sent.max_tokens,4096);
  }finally{globalThis.fetch=original;}
});
test('compatible JSON response is accepted when a provider returns non-streaming content',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'A valid response'}}],usage:{total_tokens:6}}),{headers:{'content-type':'application/json'}});
  try{const chunks=[];for await(const chunk of streamBrain(entry,'',[],'Hello',[],new AbortController().signal))chunks.push(chunk);assert.deepEqual(chunks,['A valid response']);}
  finally{globalThis.fetch=original;}
});
test('OpenRouter tool invocation receives a truthful result then a text-only continuation',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(_url,init)=>{calls.push({headers:init.headers,body:JSON.parse(init.body)});return new Response(JSON.stringify(calls.length===1?{choices:[{message:{content:null,tool_calls:[{id:'status1',type:'function',function:{name:'get_workspace_status',arguments:'{}'}}]}}]}:{choices:[{message:{content:'Here is the answer.'}}]}),{headers:{'content-type':'application/json'}});};
 try{const chunks=[];for await(const chunk of streamBrain(entry,'',[],'Explain this code',[],new AbortController().signal))chunks.push(chunk);
 assert.equal(chunks.join(''),'Here is the answer.');assert.equal(calls.length,2);
 assert.equal(calls[0].headers['X-OpenRouter-Categories'],'cli-agent');assert.equal(calls[0].body.tools[0].function.name,'get_workspace_status');
 assert.equal(calls[1].body.tool_choice,'none');const result=calls[1].body.messages.at(-1);assert.equal(result.tool_call_id,'status1');assert.equal(JSON.parse(result.content).workspace_connected,false);
 }finally{globalThis.fetch=original;}
});
test('a provider ignoring text-only continuation cannot create an endless tool loop',async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({choices:[{message:{tool_calls:[{id:'a',function:{name:'get_workspace_status',arguments:'{}'}}]}}]}),{headers:{'content-type':'application/json'}});};
 try{await assert.rejects(async()=>{for await(const _ of streamBrain(entry,'',[],'Question',[],new AbortController().signal)){}},/tool call limit/);assert.equal(count,2);}finally{globalThis.fetch=original;}
});
test('tool opt-out also strips legacy cURL template tools and function calls',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:'Text only'}}]}),{headers:{'content-type':'application/json'}});};
 const legacy={...entry,variables:{FLUELY_AGENT_TOOLS:'off'},curl:`curl https://openrouter.ai/api/v1/chat/completions -H 'Content-Type: application/json' -d '${JSON.stringify({model:'model',messages:[{role:'user',content:'{{TEXT}}'}],tools:[{type:'function',function:{name:'custom_tool'}}],tool_choice:'auto',parallel_tool_calls:true,functions:[{name:'old'}],function_call:'auto'})}'`,streaming:true,response_content_path:'choices.0.message.content'};
 try{for await(const _ of streamBrain(legacy,'',[],'Question',[],new AbortController().signal)){};for(const key of ['tools','tool_choice','parallel_tool_calls','functions','function_call'])assert.equal(sent[key],undefined);}finally{globalThis.fetch=original;}
});
test('user cancellation does not place a healthy model into provider cooldown',async()=>{
 const old=globalThis.window;let result;
 globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{assert.equal(command,'report_provider_result');result=args;}}};
 try{await reportProvider({...entry,tokenReservationId:1},new DOMException('Aborted','AbortError'));assert.equal(result.ok,true);assert.equal(result.tokensUsed,null);}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
test('a JSON response arriving after cancellation yields no late text',async()=>{
 const original=globalThis.fetch,abort=new AbortController();let yielded=false;
 globalThis.fetch=async()=>{const response=new Response('{}',{headers:{'content-type':'application/json'}});response.json=async()=>{abort.abort();return {choices:[{message:{content:'Late reply'}}]};};return response;};
 try{await assert.rejects(async()=>{for await(const _ of streamBrain(entry,'',[],'Question',[],abort.signal))yielded=true;},{name:'AbortError'});assert.equal(yielded,false);}finally{globalThis.fetch=original;}
});
