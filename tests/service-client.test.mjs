import test from 'node:test';
import assert from 'node:assert/strict';
import { requestServiceAnswer } from '../src/lib/overlay/service-client.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';

test('successful correlated AI result survives unrelated speech errors',async()=>{
  let receive,ack,disposed=0;
  const result=await requestServiceAnswer('Q',[],undefined,{
    source:()=> 'test',listen:async callback=>{receive=callback;return()=>disposed++;},
    action:{listen:async callback=>{ack=callback;return()=>disposed++;},send:async request=>{
      ack({id:request.id,ok:true});
      receive({...INITIAL_SERVICE_STATE,clientIds:[request.id],main:'Answer',error:'Piper unavailable'});
    }},
  });
  assert.equal(result,'Answer');assert.equal(disposed,2);
});

for(const phase of ['snapshot','ack'])test(`abort during ${phase} listener installation prevents sending`,async()=>{
  const controller=new AbortController();let sends=0,disposed=0;
  const install=async target=>{if(target===phase)controller.abort();return()=>disposed++;};
  await assert.rejects(requestServiceAnswer('Q',[],controller.signal,{
    source:()=> 'test',listen:()=>install('snapshot'),
    action:{listen:()=>install('ack'),send:async()=>{sends++;}},
  }),{name:'AbortError'});
  assert.equal(sends,0);assert.equal(disposed,phase==='snapshot'?1:2);
});
test('Sleep discards a pending legacy question with a correlated cancellation and releases all listeners',async()=>{
  let ack,cancelled,disposed=0;
  await assert.rejects(requestServiceAnswer('old question',[],undefined,{
    source:()=> 'test',listen:async()=>()=>disposed++,cancelled:async receive=>{cancelled=receive;return()=>disposed++;},
    action:{listen:async receive=>{ack=receive;return()=>disposed++;},send:async request=>{ack({id:request.id,ok:true});cancelled([request.clientId]);}},
  }),/cancelled by Sleep/);assert.equal(disposed,3);
});
