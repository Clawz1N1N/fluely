import test from 'node:test';
import assert from 'node:assert/strict';
import {streamBrain,reportProvider} from '../src/lib/overlay/provider-engine.ts';

const entry={id:'model',kind:'brain',preset:'openai-compatible',base_url:'https://custom.invalid/v1',model:'test',variables:{},secret_keys:[],max_output_tokens:128,reasoning_effort:'high'};
test('unknown compatible endpoints receive output and reasoning without unsupported usage options',async()=>{
  const original=globalThis.fetch;let body;
  globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');};
  try{for await(const chunk of streamBrain(entry,'',[],'question',[],new AbortController().signal))assert.equal(chunk,'ok');
    assert.equal(body.max_completion_tokens,128);assert.equal(body.reasoning_effort,'high');assert.equal(body.stream_options,undefined);
  }finally{globalThis.fetch=original;}
});
test('completed stream reports its usage against the exact native reservation',async()=>{
  const original=globalThis.fetch,previousWindow=globalThis.window;const attempt={...entry};let report;
  globalThis.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: {"usage":{"prompt_tokens":30,"completion_tokens":7,"total_tokens":37}}\n\n');
  try{for await(const _chunk of streamBrain(attempt,'',[],'Q',[],new AbortController().signal)){}
    attempt.tokenReservationId=42;globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{assert.equal(command,'report_provider_result');report=args;}}};
    await reportProvider(attempt);assert.equal(report.tokensUsed,37);assert.equal(report.tokenReservationId,42);
  }finally{globalThis.fetch=original;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});
test('quota rejection happens before sending and releases only that token reservation',async()=>{
  const previousWindow=globalThis.window,original=globalThis.fetch;let sent=false,report;
  globalThis.fetch=async()=>{sent=true;throw Error('unexpected network request');};
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{if(command==='reserve_provider_tokens')throw 'Token quota cannot fit';if(command==='report_provider_result'){report=args;return; }throw Error(command);}}};
  const attempt={...entry,tokenReservationId:43};
  try{let failure;try{for await(const _chunk of streamBrain(attempt,'',[],'Q',[],new AbortController().signal)){} }catch(error){failure=error;}
    assert.match(String(failure),/Token quota/);assert.equal(sent,false);await reportProvider(attempt,failure);
    assert.equal(report.tokensUsed,0);assert.equal(report.tokenReservationId,43);assert.equal(report.ok,true);
  }finally{globalThis.fetch=original;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});
test('per-model off removes reasoning settings embedded in a cURL template',async()=>{
  const original=globalThis.fetch;let body;
  globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');};
  const attempt={...entry,preset:'groq',reasoning_effort:'off',curl:`curl -X POST 'https://custom.invalid/v1/chat/completions' -d '{"model":"{{MODEL}}","reasoning_effort":"medium","thinking":{"type":"enabled","budget_tokens":1024},"output_config":{"effort":"high","other":true},"generationConfig":{"temperature":0.2,"thinkingConfig":{"thinkingBudget":8192}},"messages":[{"role":"user","content":"{{TEXT}}"}]}'`,streaming:true,response_content_path:'choices[0].message.content'};
  try{for await(const _chunk of streamBrain(attempt,'',[],'Q',[],new AbortController().signal)){}
    assert.equal(body.reasoning_effort,undefined);assert.equal(body.thinking,undefined);assert.equal(body.output_config.effort,undefined);
    assert.equal(body.generationConfig.thinkingConfig,undefined);assert.equal(body.generationConfig.temperature,0.2);assert.equal(body.output_config.other,true);
  }finally{globalThis.fetch=original;}
});

test('a temporary pre-send token shortage waits without sending or permanently rejecting the model',async()=>{
  const previousWindow=globalThis.window,original=globalThis.fetch;let sent=0,attempts=0,released=false;
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{
    assert.equal(command,'reserve_provider_tokens');
    if(args.tokens===0){released=true;return;}
    if(attempts++===0)throw 'Neutral mode: token quota available at 100';
    delete globalThis.window; // The fake native quota transport ends before the browser HTTP fixture.
  }}};
  globalThis.fetch=async()=>{sent++;return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');};
  try{for await(const chunk of streamBrain({...entry,tokenReservationId:44},'',[],'Q',[],new AbortController().signal))assert.equal(chunk,'ok');
    assert.equal(sent,1);assert.equal(attempts,2);assert.equal(released,true);
  }finally{globalThis.fetch=original;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});
