import test from 'node:test';import assert from 'node:assert/strict';
import { boundedChatQuestion } from '../src/lib/overlay/chat-context.ts';
test('long Cyrillic history fits native bytes and preserves current instructions/question',()=>{
  const history=Array.from({length:20},(_,i)=>({role:'user',content:`${i}:`+'ї'.repeat(1000)}));
  const question=boundedChatQuestion('Current instructions\n',history,'Наступне питання');
  assert.ok(new TextEncoder().encode(question).length<=32768);
  assert.ok(question.startsWith('Current instructions\n'));
  assert.ok(question.endsWith('Запит:\nНаступне питання'));
  assert.ok(question.includes('"content":"19:'));assert.ok(!question.includes('"content":"0:'));
});
test('oversized single history message is omitted without discarding current question',()=>{
  assert.equal(boundedChatQuestion('',[{content:'x'.repeat(50000)}],'Q'),'Запит:\nQ');
});
