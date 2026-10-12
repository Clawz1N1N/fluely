import test from 'node:test';
import assert from 'node:assert/strict';
import { readEventStream, ProviderHttpError } from '../src/lib/overlay/network.ts';

test('SSE decoder preserves Unicode over byte boundaries and final event without newline', async () => {
  const bytes=new TextEncoder().encode('data: {"text":"Ї🙂"}\r\n\r\ndata: {"text":"кінець"}');
  const body=new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}});
  const out=[];
  for await(const value of readEventStream(body))out.push(value.text);
  assert.deepEqual(out,['Ї🙂','кінець']);
});
test('multiline SSE data and comments are handled as events',async()=>{
  const text=': heartbeat\ndata: {\ndata: "text":"ok"}\n\ndata: [DONE]\n\n';
  const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(text));c.close();}});
  const out=[];for await(const value of readEventStream(body))out.push(value);
  assert.deepEqual(out,[{text:'ok'}]);
});
test('HTTP errors retain retry interval while discarding sensitive server bodies',()=>{
  const error=ProviderHttpError.fromResponse(new Response('private API key',{status:429,headers:{'retry-after':'12'}}));
  assert.equal(error.status,429);assert.equal(error.retryAfterSecs,12);
  assert.ok(!error.message.includes('private'));
});

test('a stalled response stream times out and cancels its reader',async()=>{
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(async()=>{for await(const event of readEventStream(body,undefined,20))assert.fail(event);},error=>error.name==='TimeoutError');
  assert.equal(cancelled,true);
});
