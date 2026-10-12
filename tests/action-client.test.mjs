import test from 'node:test';import assert from 'node:assert/strict';
import { executeAction } from '../src/lib/overlay/action-client.ts';
test('question ingestion failure is returned before the caller clears its input',async()=>{
  let listener,disposed=0;
  await assert.rejects(executeAction({id:'q',action:'ask',source:'test',question:'Зберегти'}, {
    listen:async fn=>{listener=fn;return()=>disposed++;},
    send:async()=>listener({id:'q',ok:false,error:'Черга заповнена'}),
  }),/Черга заповнена/);
  assert.equal(disposed,1);
});
test('an acknowledgement received during send is not lost',async()=>{
  let listener;
  await executeAction({id:'q',action:'ask',source:'test',question:'Q'}, {
    listen:async fn=>{listener=fn;return()=>{};},send:async()=>listener({id:'q',ok:true}),
  });
});
