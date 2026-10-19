import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptionResult} from '../src/lib/overlay/transcription.ts';
test('provider diarization and time offsets are preserved without inferred speakers',()=>{
  const result=transcriptionResult({text:'Hello there',segments:[{text:'Hello',speaker:'speaker_1',start:0,end:0.8},{text:'there',start:1,end:1.5}]});
  assert.equal(result.segments[0].speaker,'speaker_1');assert.equal(result.segments[1].speaker,undefined);assert.equal(result.segments[1].start,1);
});
test('invalid segments never produce invented transcript or non-finite timing',()=>{
  const result=transcriptionResult({text:'Hi',segments:[null,{text:5},{text:'Hi',start:-1,end:Infinity,speaker:{}}]});
  assert.equal(result.segments.length,1);assert.equal(result.segments[0].start,undefined);assert.equal(result.segments[0].end,undefined);assert.equal(result.segments[0].speaker,undefined);
  assert.throws(()=>transcriptionResult({segments:[]}),/without a transcript/);
});
