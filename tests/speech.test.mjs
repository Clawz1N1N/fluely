import test from 'node:test';import assert from 'node:assert/strict';
import { SpeechController } from '../src/lib/overlay/speech-controller.ts';
function fixture(){const spoken=[],states=[];const synth={speak:u=>spoken.push(u),cancel:()=>{},pause:()=>{},resume:()=>{},getVoices:()=>[]};
 const speech=new SpeechController(synth,text=>({text}),s=>states.push(s));speech.configure({enabled:true,rate:1,language:'uk',voice:'',stream:true});speech.begin();return{speech,spoken,states};}
test('all sentences chain and word boundaries refer to the full SPEAK text',()=>{
 const f=fixture();f.speech.update('Раз. Два. Три.',true);
 assert.equal(f.spoken[0].text,'Раз.');f.spoken[0].onend();assert.equal(f.spoken[1].text,'Два.');
 f.spoken[1].onboundary({charIndex:0,charLength:3});assert.equal(f.states.at(-1).wordStart,5);
 f.spoken[1].onend();assert.equal(f.spoken[2].text,'Три.');f.spoken[2].onend();assert.equal(f.states.at(-1).speaking,false);
});
test('streaming queue appends sentences once and final partial text is spoken',()=>{
 const f=fixture();f.speech.update('Раз. Д',false);f.speech.update('Раз. Два.',false);
 assert.equal(f.spoken.length,1);f.spoken[0].onend();assert.equal(f.spoken[1].text,'Два.');
 f.speech.update('Раз. Два. Кінець',true);f.spoken[1].onend();assert.equal(f.spoken[2].text,'Кінець');
});
test('stop invalidates old callbacks and does not restart when later chunks arrive',()=>{
 const f=fixture();f.speech.update('Раз. Два.',true);const old=f.spoken[0];f.speech.stop();old.onend();f.speech.update('Раз. Два. Три.',true);
 assert.equal(f.spoken.length,1);
});
test('seek replaces old utterance and continues the entire remaining chain',()=>{
 const f=fixture();f.speech.update('Раз. Два. Три.',true);const old=f.spoken[0];f.speech.seek(1);old.onend();assert.equal(f.spoken.length,2);
 assert.equal(f.spoken[1].text,'Два.');f.spoken[1].onend();assert.equal(f.spoken[2].text,'Три.');
});
