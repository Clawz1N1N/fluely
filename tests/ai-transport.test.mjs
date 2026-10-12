import test from 'node:test';import assert from 'node:assert/strict';
import { fetchAIResponse } from '../src/lib/functions/ai-response.function.ts';
import { ProviderHttpError } from '../src/lib/overlay/network.ts';
const provider={id:'custom',streaming:true,responseContentPath:'choices[0].message.content',
 curl:`curl -X POST 'http://localhost:1234/v1/chat/completions' -H 'Content-Type: application/json' -d '{"model":"{{MODEL}}","messages":[{"role":"system","content":"{{SYSTEM_PROMPT}}"},{"role":"user","content":"{{TEXT}}"}]}'`};
test('custom provider template resolves reserved variables, history and SSE final event',async()=>{
 const original=globalThis.fetch;let request;
 globalThis.fetch=async(url,init)=>{request={url,body:JSON.parse(init.body)};return new Response('data: {"choices":[{"delta":{"content":"Українська 🙂"}}]}',{status:200});};
 try{const chunks=[];for await(const c of fetchAIResponse({provider,selectedProvider:{provider:'custom',variables:{model:'local'}},systemPrompt:'system',history:[{role:'user',content:'past'}],userMessage:'question'}))chunks.push(c);
 assert.deepEqual(chunks,['Українська 🙂']);assert.equal(request.body.model,'local');assert.equal(request.body.messages[1].content,'past');assert.equal(request.body.messages[2].content,'question');assert.match(request.body.messages[0].content,/system/);
 }finally{globalThis.fetch=original;}
});
test('actual AI request throws typed 429 instead of returning an error as model text',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('sensitive details',{status:429,headers:{'retry-after':'3'}});
 try{await assert.rejects(async()=>{for await(const c of fetchAIResponse({provider,selectedProvider:{provider:'custom',variables:{model:'local'}},userMessage:'Q'}))assert.fail(c);},e=>e instanceof ProviderHttpError&&e.status===429&&e.retryAfterSecs===3);
 }finally{globalThis.fetch=original;}
});
test('template replacement preserves literal dollar replacements in questions and variables',async()=>{
 const original=globalThis.fetch;let body;
 globalThis.fetch=async(url,init)=>{body=JSON.parse(init.body);return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}');};
 try{for await(const chunk of fetchAIResponse({provider,selectedProvider:{provider:'custom',variables:{model:'local$&'}},userMessage:'Keep $& and $` literally'}))assert.equal(chunk,'ok');
 assert.equal(body.model,'local$&');assert.equal(body.messages.at(-1).content,'Keep $& and $` literally');
 }finally{globalThis.fetch=original;}
});
