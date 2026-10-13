import test from 'node:test';
import assert from 'node:assert/strict';
import { fitModelHistory,outputParameters,imageMime } from '../src/lib/overlay/model-request.ts';
test('image protocol labels match actual JPEG and PNG attachments',()=>{assert.equal(imageMime('iVBORw0KGgo'),'image/png');assert.equal(imageMime('/9j/4AAQ'),'image/jpeg');});
test('token output uses native provider parameter names',()=>{
  assert.deepEqual(outputParameters({preset:'google',max_output_tokens:123}),{maxOutputTokens:123});
  assert.deepEqual(outputParameters({preset:'openai-compatible',max_output_tokens:123}),{max_completion_tokens:123});
  assert.deepEqual(outputParameters({preset:'other',max_output_tokens:123}),{max_tokens:123});
});
test('finite context drops oldest history and never begins with an orphan assistant answer',()=>{
  const history=[{role:'user',content:'x'.repeat(10000)},{role:'assistant',content:'old'},{role:'user',content:'recent'},{role:'assistant',content:'reply'}];
  assert.deepEqual(fitModelHistory({context_window:3000,max_output_tokens:500},'prompt','question',history),history.slice(2));
  assert.equal(fitModelHistory({},'','',history),history);
});
