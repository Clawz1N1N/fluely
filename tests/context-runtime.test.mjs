import test from 'node:test';
import assert from 'node:assert/strict';
import {answer} from '../src/components/ServiceRuntime.tsx';
import {ScreenSceneMemory} from '../src/lib/overlay/screen-context.ts';
globalThis.localStorage={getItem:()=>null};
test('runtime frees the provisional main quota, summarizes at 90%, emits archive metadata, then uses summary plus recent turns',async()=>{
 const history=Array.from({length:12},(_,index)=>({role:index%2?'assistant':'user',content:`Fact ${index}: `+'remember '.repeat(500)}));
 const original=structuredClone(history),calls=[],released=[],reported=[],events=[];let reservation=0;
 const entry={id:'brain',kind:'brain',model:'test',context_window:5000,max_output_tokens:500,supports_images:false};
 const ports={choose:async()=>({...entry,tokenReservationId:++reservation}),
  stream:async function*(provider,prompt,history,text){calls.push({provider,prompt,history,text});yield prompt.startsWith('Summarize')?'Earlier facts preserved':'<main>Answer</main>';},
  report:async provider=>reported.push(provider.tokenReservationId),releaseReservation:async provider=>released.push(provider.tokenReservationId),
  systemPrompt:()=> 'Answer accurately',memory:new ScreenSceneMemory(),visionSettings:async()=>({}),nativeContext:async()=>'',
 };
 for await(const event of answer({request_id:1,frames:[],transcript:[],questions:['Continue']},history,new AbortController().signal,ports))events.push(event);
 assert.deepEqual(released,[1]);assert.equal(events.find(event=>event.compression)?.compression.through,8);
 assert.match(calls.at(-1).history[0].content,/Earlier facts preserved/);assert.deepEqual(calls.at(-1).history.slice(1),history.slice(8));
 assert.deepEqual(history,original);assert.equal(reported.length,calls.length);assert(events.some(event=>event.context?.compressing));
});
