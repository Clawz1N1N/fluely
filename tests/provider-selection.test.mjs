import test from 'node:test';import assert from 'node:assert/strict';
import {selectRankedProvider} from '../src/lib/overlay/provider-selection.ts';
test('failed provider traversal terminates after every configured candidate failed',async()=>{
  const signal=new AbortController().signal;
  await assert.rejects(selectRankedProvider('brain',['p'],signal,{
    pick:async()=>null,status:async()=>({providers:[{id:'p',kind:'brain',enabled:true}]}),wait:async()=>assert.fail('must not retry forever'),
  }),/Усі провайдери/);
});
test('quota neutral waits without losing exclusions and resumes after the gate opens',async()=>{
  let tries=0,waited=false;const entry={id:'p',kind:'brain',enabled:true};
  const result=await selectRankedProvider('brain',[],new AbortController().signal,{
    pick:async()=>++tries===1?null:entry,status:async()=>({providers:[entry],nextAllowedAt:Date.now()+1000}),wait:async()=>{waited=true;},
  });assert.equal(result,entry);assert.equal(waited,true);
});
