import test from 'node:test';import assert from 'node:assert/strict';
import { AudioSpeechSynth } from '../src/lib/overlay/audio-speech.ts';
test('remote speech reports word offsets from playback and cancels pending work',async()=>{
  const listeners={},boundaries=[];let revoked=false,abortSignal;
  const audio={currentTime:0,duration:6,play:async()=>{},pause:()=>{},addEventListener:(name,fn)=>listeners[name]=fn};
  const synth=new AudioSpeechSynth({render:async(text,signal)=>{abortSignal=signal;return new Blob(['audio']);},
    audio:()=>audio,url:()=> 'blob:test',revoke:()=>{revoked=true;}});
  synth.speak({text:'Раз два три',rate:1,onboundary:e=>boundaries.push(e),onend:()=>{},onerror:()=>{}});
  await new Promise(resolve=>setImmediate(resolve));audio.currentTime=3;listeners.timeupdate();
  assert.equal(boundaries.at(-1).charIndex,4);assert.equal(boundaries.at(-1).charLength,3);
  synth.cancel();assert.equal(abortSignal.aborted,true);assert.equal(revoked,true);
});
test('late audio after stop never begins playback',async()=>{
  let release,played=0;const pending=new Promise(resolve=>{release=resolve;});
  const synth=new AudioSpeechSynth({render:()=>pending,audio:()=>({play:async()=>{played++;},pause:()=>{},addEventListener:()=>{}}),url:()=> 'blob:test',revoke:()=>{}});
  synth.speak({text:'Пояснення.',rate:1,onend:()=>{},onerror:()=>{}});synth.cancel();release(new Blob(['audio']));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(played,0);
});
