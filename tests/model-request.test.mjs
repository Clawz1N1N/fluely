import test from 'node:test';
import assert from 'node:assert/strict';
import { fitModelHistory,outputParameters,imageMime,reasoningParameters,estimateBrainTokens,readTokenUsage } from '../src/lib/overlay/model-request.ts';
test('image protocol labels match actual JPEG and PNG attachments',()=>{assert.equal(imageMime('iVBORw0KGgo'),'image/png');assert.equal(imageMime('/9j/4AAQ'),'image/jpeg');});
test('token output uses native provider parameter names',()=>{
  assert.deepEqual(outputParameters({preset:'google',max_output_tokens:123}),{maxOutputTokens:123});
  assert.deepEqual(outputParameters({preset:'openai-compatible',max_output_tokens:123}),{max_completion_tokens:123});
  assert.deepEqual(outputParameters({preset:'other',max_output_tokens:123}),{max_tokens:123});
});
test('requests always bound output so native quota reservations have a finite ceiling',()=>{
  assert.deepEqual(outputParameters({preset:'google'}),{maxOutputTokens:4096});
  assert.deepEqual(outputParameters({preset:'openai-compatible'}),{max_completion_tokens:4096});
  assert.deepEqual(outputParameters({preset:'openai-compatible',context_window:1000}),{max_completion_tokens:250});
});
test('finite context drops oldest history and never begins with an orphan assistant answer',()=>{
  const history=[{role:'user',content:'x'.repeat(10000)},{role:'assistant',content:'old'},{role:'user',content:'recent'},{role:'assistant',content:'reply'}];
  assert.deepEqual(fitModelHistory({context_window:3000,max_output_tokens:500},'prompt','question',history),history.slice(2));
  assert.equal(fitModelHistory({},'','',history),history);
});
test('reasoning settings use provider-specific protocols and preserve custom English efforts',()=>{
  assert.deepEqual(reasoningParameters({preset:'openai-compatible',reasoning_effort:'high'}),{reasoning_effort:'high'});
  assert.deepEqual(reasoningParameters({preset:'openai-compatible',reasoning_effort:'custom-level'}),{reasoning_effort:'custom-level'});
  assert.deepEqual(reasoningParameters({preset:'google',model:'gemini-2.5-flash',reasoning_effort:'off'}),{thinkingConfig:{thinkingBudget:0}});
  assert.deepEqual(reasoningParameters({preset:'google',model:'gemini-3-pro',reasoning_effort:'xhigh'}),{thinkingConfig:{thinkingLevel:'high'}});
  assert.deepEqual(reasoningParameters({preset:'anthropic',model:'claude-opus-4-6',reasoning_effort:'high'}),{thinking:{type:'adaptive'},output_config:{effort:'high'}});
  assert.deepEqual(reasoningParameters({preset:'anthropic',reasoning_effort:'off'}),{thinking:{type:'disabled'}});
});
test('token reservations count UTF8 text, attachments and provider input/output usage',()=>{
  assert(estimateBrainTokens('',[''], 'Привіт',[])>='Привіт'.length*2);
  assert(estimateBrainTokens('',[], '',['small-image'])>=16384);
  assert.equal(readTokenUsage({usage:{prompt_tokens:40,completion_tokens:10}}),50);
  assert.equal(readTokenUsage({usageMetadata:{totalTokenCount:123}}),123);
  assert.equal(readTokenUsage({message:{usage:{input_tokens:10,cache_read_input_tokens:5,output_tokens:2}}}),17);
});
test('off uses the minimum supported thinking setting on models with mandatory reasoning',()=>{
  assert.deepEqual(reasoningParameters({preset:'google',model:'gemini-3-pro',reasoning_effort:'off'}),{thinkingConfig:{thinkingLevel:'low'}});
  assert.deepEqual(reasoningParameters({preset:'google',model:'gemini-2.5-pro',reasoning_effort:'off'}),{thinkingConfig:{thinkingBudget:128}});
  assert.deepEqual(reasoningParameters({preset:'openai-compatible',model:'gpt-5',reasoning_effort:'off'}),{reasoning_effort:'minimal'});
  assert.deepEqual(reasoningParameters({preset:'openai-compatible',model:'gpt-5.2',reasoning_effort:'off'}),{reasoning_effort:'none'});
  assert.deepEqual(reasoningParameters({preset:'openai-compatible',model:'gpt-5-pro',reasoning_effort:'off'}),{});
});
