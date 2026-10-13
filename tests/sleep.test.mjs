import test from 'node:test';
import assert from 'node:assert/strict';
import { AlarmCodeDetector } from '../src/lib/overlay/sleep.ts';
import { ServiceController } from '../src/lib/overlay/service-controller.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {ShellControls} from '../src/components/Shell/ShellControls.tsx';

test('alarm code matches every fragmented boundary once, rejects partial and resets failed-provider output',()=>{
  for(let split=0;split<=10;split++){
    const detector=new AlarmCodeDetector('<+!SOS!+>');
    const first=detector.feed('normal '+ '<+!SOS!+>'.slice(0,split));
    const second=detector.feed('<+!SOS!+>'.slice(split)+' more <+!SOS!+>');
    assert.equal(Number(first)+Number(second),1);
    assert.equal(detector.feed('<+!SOS!+>'),false);
  }
  const detector=new AlarmCodeDetector('<+!SOS!+>');
  assert.equal(detector.feed('<+!SO'),false);detector.reset();
  assert.equal(detector.feed('S!+>'),false);
});
function fixture(){
  const calls=[],handlers=new Map();
  const capture={system_audio:false,microphone:true,mode:'interval'};
  const ports={listen:async(name,handler)=>{handlers.set(name,handler);return()=>handlers.delete(name);},emit:async()=>{},initialize:async()=>{},
    invoke:async(name,args)=>{calls.push({name,args});if(name==='get_shell_settings')return INITIAL_SERVICE_STATE.shell;if(name==='get_capture_settings')return capture;if(name==='get_tts_settings')return{enabled:true,rate:1};if(name==='get_sleep_settings')return{prompt:'Watch for danger',alarm_code:'<+!SOS!+>',track_path:'tone.wav',output_device:'speaker',volume:0.5};},
    status:async()=>({providers:[],neutral:false,nextAllowedAt:null}),
    answer:async function*(batch,history,signal){calls.push({name:'answer',args:{batch,history,signal}});yield '<main><+!SO';yield 'S!+></main>';},
    transcribe:async()=> 'heard',speech:{update:()=>calls.push({name:'speech'}),stop:()=>{},pause:()=>{},seek:()=>{},toggle:async()=>{}}};
  return{controller:new ServiceController(ports),calls,handlers};
}
test('Sleep forces system only, stops vision/microphone, blocks ordinary actions and restores prior flags',async()=>{
  const f=fixture();await f.controller.start();
  try{
    await f.controller.action({id:'listen',action:'listen',source:'test'});
    await f.controller.action({id:'vision',action:'continuous',source:'test'});
    await f.controller.action({id:'sleep',action:'mode',source:'test'});
    assert.equal(f.controller.snapshot.sleeping,true);assert.equal(f.controller.snapshot.continuous,false);
    assert.ok(f.calls.some(c=>c.name==='stop_microphone'));assert.ok(f.calls.some(c=>c.name==='set_sleep_mode'&&c.args.sleeping));
    assert.ok(f.calls.some(c=>c.name==='start_system_audio_capture'));
    await f.controller.action({id:'photo',action:'screenshot',source:'test'});
    assert.equal(f.calls.filter(c=>c.name==='capture_now').length,0);
    const before=f.calls.filter(c=>c.name==='continuous_add_transcript').length;
    await f.controller.audio(new Blob(['wav']),'[mic]',true);
    assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript').length,before);
    await f.controller.audio(new Blob(['wav']),'[system]');
    assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript').length,before+1);
    await f.controller.action({id:'wake',action:'mode',source:'test'});
    assert.equal(f.controller.snapshot.sleeping,false);assert.equal(f.controller.snapshot.continuous,true);assert.equal(f.controller.snapshot.listening,true);
  }finally{await f.controller.stop();}
});
test('Sleep batches exclude screen/mic/questions/history, alarm once, suppress TTS and answer auto-present',async()=>{
  const f=fixture();await f.controller.start();
  try{
    f.controller.snapshot.history=[{role:'user',content:'private screen'}];
    await f.controller.action({id:'sleep',action:'mode',source:'test'});
    await f.controller.batch({request_id:17,frames:[{jpeg_base64:'image'}],transcript:[{channel:'[mic]',text:'mic'},{channel:'[system]',text:'system'}],questions:['Q']});
    const {batch,history}=f.calls.find(c=>c.name==='answer').args;
    assert.deepEqual(batch.frames,[]);assert.deepEqual(batch.questions,[]);assert.deepEqual(batch.transcript,[{channel:'[system]',text:'system'}]);
    assert.match(batch.sleep_prompt,/Watch for danger/);assert.deepEqual(history,[]);
    assert.equal(f.calls.filter(c=>c.name==='play_sleep_alarm').length,1);
    assert.equal(f.calls.filter(c=>c.name==='speech').length,0);assert.equal(f.calls.filter(c=>c.name==='present_answer_window').length,0);
  }finally{await f.controller.stop();}
});
test('Sleep transition aborts an in-flight ordinary answer and late microphone STT without publishing them',async()=>{
  const f=fixture();let releaseAnswer,releaseStt;let answerStarted,sttStarted;
  const answerReady=new Promise(resolve=>answerStarted=resolve);const sttReady=new Promise(resolve=>sttStarted=resolve);
  f.controller.ports.answer=async function*(_batch,_history,signal){answerStarted(signal);await new Promise(resolve=>releaseAnswer=resolve);yield '<main>old screen</main>';};
  f.controller.ports.transcribe=async()=>{sttStarted();await new Promise(resolve=>releaseStt=resolve);return 'old mic';};
  await f.controller.start();
  try{
    await f.controller.action({id:'listen',action:'listen',source:'test'});
    const audio=f.controller.audio(new Blob(['wav']),'[mic]');await sttReady;
    const request=f.controller.batch({request_id:18,frames:[],transcript:[],questions:['old Q'],client_ids:['old-client']});
    const signal=await answerReady;
    await f.controller.action({id:'sleep',action:'mode',source:'test'});assert.equal(signal.aborted,true);
    releaseAnswer();releaseStt();await Promise.all([audio,request]);
    assert.notEqual(f.controller.snapshot.main,'old screen');assert.ok(f.controller.snapshot.requestError);
    assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript'&&c.args.text==='old mic').length,0);
    assert.equal(f.calls.filter(c=>c.name==='continuous_set_audio_pending').length,2);
    assert.equal(f.calls.filter(c=>c.name==='continuous_request_done').length,1);
    assert.equal(f.calls.filter(c=>c.name==='present_answer_window').length,0);
  }finally{releaseAnswer?.();releaseStt?.();await f.controller.stop();}
});
test('provider reset cannot duplicate an alarm already triggered in the same request',async()=>{
  const f=fixture();f.controller.ports.answer=async function*(){yield '<+!SOS!+>';yield{reset:true};yield '<+!SOS!+>';};
  await f.controller.start();try{await f.controller.action({id:'sleep',action:'mode',source:'test'});await f.controller.batch({request_id:19,frames:[],questions:[],transcript:[{channel:'[system]',text:'help'}]});assert.equal(f.calls.filter(c=>c.name==='play_sleep_alarm').length,1);}finally{await f.controller.stop();}
});
test('Sleep rejects and acknowledges stale batches delivered while its native boundary is pending',async()=>{
  const f=fixture();let started,release;const ready=new Promise(resolve=>started=resolve);const original=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>{if(name==='set_sleep_mode'&&args.sleeping){started();await new Promise(resolve=>release=resolve);return '42';}return original(name,args);};
  await f.controller.start();try{
    const transition=f.controller.action({id:'sleep',action:'mode',source:'test'});await ready;
    await f.controller.audio(new Blob(['wav']),'[system]');assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript').length,0);
    const batch=f.controller.batch({request_id:20,frames:[],questions:[],transcript:[{channel:'[system]',text:'old audio before Sleep'}]});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.filter(c=>c.name==='answer').length,0);
    release();await Promise.all([transition,batch]);assert.equal(f.calls.filter(c=>c.name==='answer').length,0);
    assert.equal(f.calls.filter(c=>c.name==='play_sleep_alarm').length,0);
    assert.deepEqual(f.calls.find(c=>c.name==='continuous_request_done').args,{requestId:20});
    assert.equal(f.controller.snapshot.requestError,'Request cancelled by Sleep mode transition.');
    await f.controller.audio(new Blob(['wav']),'[system]');assert.equal(f.calls.find(c=>c.name==='continuous_add_transcript').args.expectedEpoch,'42');
  }finally{release?.();await f.controller.stop();}
});
test('failed native Sleep transition restores awake microphone/listening and does not leave Sleep controls active',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;f.controller.ports.invoke=async(name,args)=>{if(name==='set_sleep_mode'&&args.sleeping)throw Error('Native transition failed');return original(name,args);};
  await f.controller.start();try{await f.controller.action({id:'listen',action:'listen',source:'test'});await f.controller.action({id:'sleep',action:'mode',source:'test'});assert.equal(f.controller.snapshot.sleeping,false);assert.equal(f.controller.snapshot.listening,true);assert.equal(f.controller.snapshot.error,'Native transition failed');assert.equal(f.calls.filter(c=>c.name==='start_microphone').length,2);}finally{await f.controller.stop();}
});
test('Sleep shell keeps crescent and settings available while ordinary controls are disabled',()=>{
 const markup=renderToStaticMarkup(React.createElement(ShellControls,{snapshot:{...INITIAL_SERVICE_STATE,ready:true,sleeping:true},act:async()=>{}}));
 assert.equal((markup.match(/<button\b/g)||[]).length,8);
 assert.equal((markup.match(/disabled=""/g)||[]).length,6);
 assert.match(markup,/aria-pressed="true"[^>]*>[\s\S]*?lucide-moon/);
 assert.match(markup,/lucide-settings/);
});
test('an aborted generator ending without another chunk still rejects its client instead of resolving an empty answer',async()=>{
  const f=fixture();let started;const ready=new Promise(resolve=>started=resolve);
  f.controller.ports.answer=async function*(_batch,_history,signal){started();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));};
  await f.controller.start();try{const pending=f.controller.batch({request_id:21,frames:[],transcript:[],questions:['Q'],client_ids:['old-client']});await ready;await f.controller.action({id:'sleep',action:'mode',source:'test'});await pending;assert.equal(f.controller.snapshot.clientIds[0],'old-client');assert.equal(f.controller.snapshot.requestError,'Aborted');assert.equal(f.calls.filter(c=>c.name==='present_answer_window').length,0);}finally{await f.controller.stop();}
});
