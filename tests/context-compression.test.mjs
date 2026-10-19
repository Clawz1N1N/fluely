import test from 'node:test';
import assert from 'node:assert/strict';
import {compressConversation} from '../src/lib/overlay/context-compression.ts';
const entry={id:'brain',model:'test',context_window:4000,max_output_tokens:500};
test('summary requests use independent quota reservations, preserve source chunks and report each request',async()=>{
 const calls=[],reports=[];let reservation=0;
 const history=Array.from({length:10},(_,i)=>({role:i%2?'assistant':'user',content:`Fact-${i} `+'remember '.repeat(500)}));
 const summary=await compressConversation(entry,history,{through:6,source:history.slice(0,6),recent:history.slice(6)},new AbortController().signal,{
  choose:async()=>({...entry,tokenReservationId:++reservation}),
  stream:async function*(provider,prompt,history,text){calls.push({provider,prompt,text});yield 'Preserved facts';},report:async provider=>reports.push(provider.tokenReservationId),
 });
 assert.equal(summary.through,6);assert.equal(summary.text,'Preserved facts');assert(calls.length>1);
 assert.match(calls.map(call=>call.text).join(''),/Fact-5/);assert.deepEqual(reports,calls.map(call=>call.provider.tokenReservationId));
});
test('abort never returns a partial summary and reports a failed reservation',async()=>{
 const abort=new AbortController();let reported=false;
 await assert.rejects(compressConversation(entry,[],{through:2,source:[{role:'user',content:'facts'}],recent:[]},abort.signal,{
 choose:async()=>entry,stream:async function*(){yield 'partial';abort.abort();},report:async(_,error)=>{reported=!!error;},
 }),/Abort/);assert(reported);
});
