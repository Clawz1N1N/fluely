import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedSessionEvents} from '../src/lib/overlay/session-presentation.ts';
test('interleaved recordings and same-monitor images keep their own transcripts/descriptions underneath',()=>{
  const events=[{id:'a',kind:'audio',audio_ref:'a.wav'},{id:'b',kind:'audio',audio_ref:'b.wav'},
    {id:'i0',kind:'screenshot',request_id:1,frame_index:0,text:'attachment'},{id:'i1',kind:'screenshot',request_id:1,frame_index:1,text:'attachment'},
    {id:'tb',kind:'transcript',audio_ref:'b.wav'},{id:'ta',kind:'transcript',audio_ref:'a.wav'},
    {id:'v1',kind:'vision',request_id:1,frame_index:1,channel:'attachment'},{id:'v0',kind:'vision',request_id:1,frame_index:0,channel:'attachment'},
    {id:'standalone',kind:'transcript',text:'Imported text'}];
  const grouped=groupedSessionEvents(events);
  assert.deepEqual(grouped.map(group=>[group.event.id,group.related.map(event=>event.id)]),[['a',['ta']],['b',['tb']],['i0',['v0']],['i1',['v1']],['standalone',[]]]);
});
