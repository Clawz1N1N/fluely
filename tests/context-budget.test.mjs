import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateContextTokens,contextUsage,compressionPlan,contextHistory,splitContextText} from '../src/lib/overlay/context-budget.ts';

test('token estimate handles multilingual text and identifies its uncertainty',()=>{
  assert(estimateContextTokens('Привіт світе')>0);
  assert(estimateContextTokens('Hello world')<new TextEncoder().encode('Hello world').length);
  assert(estimateContextTokens('Quoted <|endoftext|> token is document data')>0);
  const usage=contextUsage({model:'test',context_window:10000,max_output_tokens:1000},'','',[],[]);
  assert.equal(usage.estimated,true);assert.equal(usage.contextWindow,10000);
});
test('compression starts at ninety percent, preserves recent turns and saved source history',()=>{
  const history=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'Facts '+i+' '+('example '.repeat(400))}));
  const original=structuredClone(history);
  const entry={model:'test',context_window:10000,max_output_tokens:1000};
  const plan=compressionPlan(entry,'','question',history,[]);
  assert(plan);assert(plan.through>0);assert.equal(plan.through%2,0);
  assert(plan.recent.length>=4);assert.deepEqual(history,original);
  const summary={text:'Remember the facts',through:plan.through};
  assert.match(contextHistory(history,summary)[0].content,/Remember the facts/);
  assert.deepEqual(contextHistory(history,summary).slice(1),history.slice(plan.through));
  assert.equal(compressionPlan(entry,'','tiny',[],[]),null);
});
test('measured input usage replaces estimates and unknown model limits stay unknown',()=>{
  const usage=contextUsage({model:'test',context_window:1000,max_output_tokens:100},'','',[],[],{input:500});
  assert.equal(usage.inputTokens,500);assert.equal(usage.percent,60);assert.equal(usage.estimated,false);
  assert.equal(contextUsage({model:'unknown'},'','',[],[]).percent,null);
});
test('chunking keeps Unicode characters and complete source content',()=>{
 const text='🙂 Україна 日本語 '.repeat(300),chunks=splitContextText(text,128);
 assert.equal(chunks.join(''),text);assert(chunks.every(chunk=>!chunk.includes('\ufffd')));
 assert(chunks.every(chunk=>estimateContextTokens(chunk)<=128));
});
