import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceController } from '../src/lib/overlay/service-controller.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';
import { t } from '../src/lib/i18n/index.ts';

function fixture() {
  const handlers=new Map(),calls=[],events=[];
  const ports={listen:async(name,callback)=>{handlers.set(name,callback);return()=>handlers.delete(name);},
    emit:async(name,payload)=>events.push({name,payload}),invoke:async(name,args)=>{calls.push({name,args});if(name==='get_shell_settings')return INITIAL_SERVICE_STATE.shell;if(name==='get_capture_settings')return{system_audio:true,microphone:false};if(name==='get_tts_settings')return{enabled:false,rate:1};},
    status:async()=>({neutral:false,nextAllowedAt:null,currentProviderId:null,providers:[{id:'brain',model:'test'}]}),
    answer:async function*(batch){calls.push({name:'answer',args:batch});yield '<main>Відповідь</main><side>Додатково</side><speak>Пояснення.</speak>';},
    transcribe:async()=> 'Почуте', initialize:async()=>{}, speech:{update:()=>{},stop:()=>{},pause:()=>{},seek:()=>{},toggle:async()=>{}}};
  return{controller:new ServiceController(ports),handlers,calls,events};
}
test('native model changes refresh per-model quota status without waiting for hidden polling timers',async()=>{
  const f=fixture();let status={neutral:true,nextAllowedAt:null,currentProviderId:null,providers:[]};
  f.controller.ports.status=async()=>status;
  await f.controller.start();
  try{
    status={neutral:false,nextAllowedAt:null,currentProviderId:'model',providers:[{id:'model',model:'Chosen model',used:{per_second:1,per_minute:2,per_hour:3,per_day:4},limit_per_minute:10}]};
    f.handlers.get('providers-status')({});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.controller.snapshot.neutral,false);assert.equal(f.controller.snapshot.currentModel,'Chosen model');
    assert.equal(f.controller.snapshot.requestCounts.per_minute,2);assert.equal(f.controller.snapshot.requestLimits.per_minute,10);
    assert.ok(f.events.some(event=>event.name==='service-state'&&event.payload.currentModel==='Chosen model'));
  }finally{await f.controller.stop();}
});
test('controller restarts after effect cleanup with live listeners and a fresh request signal',async()=>{
  const f=fixture();let signal;
  f.controller.ports.answer=async function*(_batch,_history,value){signal=value;yield '<main>Restarted</main>';};
  await f.controller.start();await f.controller.stop();await f.controller.start();
  try{
    assert.ok(f.handlers.has('shell-action'));
    await f.controller.action({id:'restarted-gear',action:'settings',source:'test'});
    assert.equal(f.calls.filter(c=>c.name==='open_dashboard').length,1);
    await f.controller.batch({request_id:444,frames:[],transcript:[],questions:['Q']});
    assert.equal(signal?.aborted,false);assert.equal(f.controller.snapshot.main,'Restarted');
  }finally{await f.controller.stop();}
});
test('a failed settings initialization can be retried after the settings are repaired',async()=>{
  const f=fixture();const invoke=f.controller.ports.invoke;let fail=true;
  f.controller.ports.invoke=async(name,args)=>{if(name==='get_capture_settings'&&fail)throw Error('Temporary settings failure');return invoke(name,args);};
  await f.controller.start();assert.equal(f.controller.snapshot.ready,false);fail=false;
  await f.controller.start();
  try{assert.equal(f.controller.snapshot.ready,true);await f.controller.action({id:'repaired-listen',action:'listen',source:'test'});assert.equal(f.controller.snapshot.listening,true);}
  finally{await f.controller.stop();}
});
test('a replacement service adopts the native audio epoch before accepting transcripts',async()=>{
  const f=fixture();const invoke=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>name==='set_sleep_mode'?'native-replacement-epoch':invoke(name,args);
  await f.controller.start();
  try{
    await f.controller.action({id:'new-listen',action:'listen',source:'test'});
    await f.controller.audio(new Blob(['wav']),'[system]');
    assert.equal(f.calls.find(c=>c.name==='continuous_add_transcript').args.expectedEpoch,'native-replacement-epoch');
  }finally{await f.controller.stop();}
});
test('failed initialization recovers automatically after settings become available',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const f=fixture();const invoke=f.controller.ports.invoke;let fail=true;
  f.controller.ports.invoke=async(name,args)=>{if(name==='get_capture_settings'&&fail)throw Error('Settings temporarily unavailable');return invoke(name,args);};
  try{
    await f.controller.start();assert.equal(f.controller.snapshot.ready,false);fail=false;
    context.mock.timers.tick(3000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.controller.snapshot.ready,true);assert.equal(f.controller.snapshot.error,null);
  }finally{await f.controller.stop();context.mock.timers.reset();}
});
test('effect cleanup during listener registration cannot stop the replacement lifecycle',async()=>{
  const f=fixture();const listen=f.controller.ports.listen;let release,first=true,initialized=0;
  f.controller.ports.initialize=async()=>{initialized++;};
  f.controller.ports.listen=async(name,handler)=>{
    if(name==='shell-action'&&first){first=false;await new Promise(resolve=>release=resolve);}
    return listen(name,handler);
  };
  const starting=f.controller.start();await new Promise(resolve=>setImmediate(resolve));
  const stopping=f.controller.stop();const replacement=f.controller.start();release();
  await Promise.all([starting,stopping,replacement]);
  try{
    assert.equal(initialized,1);assert.ok(f.handlers.has('shell-action'));assert.equal(f.controller.snapshot.ready,true);
    await f.controller.action({id:'after-registration-race',action:'settings',source:'test'});
    assert.equal(f.calls.filter(c=>c.name==='open_dashboard').length,1);
  }finally{await f.controller.stop();}
});
test('Settings bypasses an unfinished capture action so the user can recover',async()=>{
  const f=fixture();const invoke=f.controller.ports.invoke;let release,startCapture;
  const started=new Promise(resolve=>startCapture=resolve);
  f.controller.ports.invoke=async(name,args)=>{if(name==='start_system_audio_capture'){startCapture();await new Promise(resolve=>release=resolve);}return invoke(name,args);};
  await f.controller.start();const listening=f.controller.action({id:'slow-listen',action:'listen',source:'test'});await started;
  try{
    const gear=f.controller.action({id:'recovery-gear',action:'settings',source:'test'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.filter(c=>c.name==='open_dashboard').length,1);
    release();await Promise.all([listening,gear]);
  }finally{release?.();await listening;await f.controller.stop();}
});
test('sole executor deduplicates action and batch IDs and parses panels without chunk IPC',async()=>{
  const f=fixture();await f.controller.start();
  const action={id:'same',action:'ask',source:'answer',question:'Питання'};
  await f.controller.action(action);await f.controller.action(action);
  assert.equal(f.calls.filter(c=>c.name==='continuous_add_question').length,1);
  const batch={request_id:1,frames:[],transcript:[],questions:['Питання']};
  await f.controller.batch(batch);await f.controller.batch(batch);
  assert.equal(f.calls.filter(c=>c.name==='answer').length,1);
  assert.equal(f.controller.snapshot.main,'Відповідь');assert.equal(f.controller.snapshot.side,'Додатково');
  assert.equal(f.calls.filter(c=>c.name==='continuous_request_done').length,1);
  assert.ok(!f.calls.some(c=>c.name==='parse_structured'));
  await f.controller.stop();assert.equal(f.handlers.size,0);
});
test('system transcript uses counted STT barrier before flushing one combined batch',async()=>{
  const f=fixture();await f.controller.start();await f.controller.action({id:'listen',action:'listen',source:'strip'});
  await f.controller.audio(new Blob(['wav']),'[system]');
  const relevant=f.calls.filter(c=>['continuous_set_audio_pending','continuous_add_transcript','flush_continuous'].includes(c.name));
  assert.deepEqual(relevant.map(c=>[c.name,c.args]),[
    ['continuous_set_audio_pending',{pending:true}],['continuous_add_transcript',{channel:'[system]',text:'Почуте',expectedEpoch:'0'}],
    ['continuous_set_audio_pending',{pending:false}],['flush_continuous',undefined],
  ]);
  await f.controller.stop();
});
test('failed batch still acknowledges its exact ID and exposes a visible error',async()=>{
  const f=fixture();f.controller.ports.answer=async function*(){throw Error('Помилка');};
  await f.controller.start();await f.controller.batch({request_id:7,frames:[],transcript:[],questions:['Q']});
  assert.equal(f.controller.snapshot.error,t('Помилка'));
  assert.deepEqual(f.calls.find(c=>c.name==='continuous_request_done').args,{requestId:7});
  await f.controller.stop();
});

test('native answer visibility is authoritative and opening chat never toggles it closed',async()=>{
  const f=fixture();await f.controller.start();
  try {
    assert.ok(f.handlers.has('answer-visibility-changed'));
    f.handlers.get('answer-visibility-changed')(true);
    assert.equal(f.controller.snapshot.answerVisible,true);
    f.handlers.get('answer-visibility-changed')(false);
    assert.equal(f.controller.snapshot.answerVisible,false);
    await f.controller.action({id:'chat',action:'chat',source:'shortcut'});
    assert.equal(f.calls.filter(c=>c.name==='show_answer_window').length,1);
    assert.equal(f.calls.filter(c=>c.name==='toggle_answer_window').length,0);
  } finally { await f.controller.stop(); }
});

test('changing TTS settings applies the complete live configuration',async()=>{
  const f=fixture();const configured=[];
  f.controller.ports.speech.configure=settings=>configured.push(settings);
  await f.controller.start();
  try {
    assert.ok(f.handlers.has('tts-settings-changed'));
    const settings={enabled:true,rate:1.5,voice:'ukrainian',language:'uk-UA',backend:'system',stream:false};
    f.handlers.get('tts-settings-changed')(settings);
    assert.deepEqual(configured,[settings]);
    assert.equal(f.controller.snapshot.tts.rate,1.5);
  } finally { await f.controller.stop(); }
});

test('answer toggle never reverses an authoritative native visibility event',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>{
    if(name==='toggle_answer_window'){f.handlers.get('answer-visibility-changed')(true);return true;}
    return original(name,args);
  };
  await f.controller.start();try{
    await f.controller.action({id:'answer',action:'answer',source:'button'});
    assert.equal(f.controller.snapshot.answerVisible,true);
  }finally{await f.controller.stop();}
});
test('disabling system capture live stops the actual active stream',async()=>{
  const f=fixture();await f.controller.start();
  try {
    await f.controller.action({id:'listen-on',action:'listen',source:'button'});
    const original=f.controller.ports.invoke;
    f.controller.ports.invoke=async(name,args)=>name==='get_capture_settings'?{system_audio:false,microphone:true}:original(name,args);
    await f.controller.refreshStatus();
    assert.ok(f.calls.some(call=>call.name==='stop_system_audio_capture'));
  }finally{await f.controller.stop();}
});

test('speech errors do not turn a successful AI batch into a failed chat result',async()=>{
  const f=fixture();f.controller.ports.speech.update=()=>f.controller.setError(new Error('TTS unavailable'));
  await f.controller.start();try {
    await f.controller.batch({request_id:11,frames:[],transcript:[],questions:['Q'],client_ids:['client']});
    assert.equal(f.controller.snapshot.main,'Відповідь');
    assert.equal(f.controller.snapshot.requestError,null);
    assert.equal(f.controller.snapshot.error,'TTS unavailable');
  }finally{await f.controller.stop();}
});

test('native microphone opens only after Listen and delivers WAV through the mic channel',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>name==='get_capture_settings'?{system_audio:false,microphone:true}:original(name,args);
  await f.controller.start();
  try{
    assert.equal(f.calls.filter(c=>c.name==='start_microphone').length,0);
    await f.controller.action({id:'mic-on',action:'listen',source:'button'});
    assert.equal(f.calls.filter(c=>c.name==='start_microphone').length,1);
    assert.ok(f.handlers.has('microphone-input'));
    const header=new Uint8Array(44);header.set(new TextEncoder().encode('RIFF'));header.set(new TextEncoder().encode('WAVE'),8);
    await f.handlers.get('microphone-input')(Buffer.from(header).toString('base64'));
    assert.ok(f.calls.some(c=>c.name==='continuous_add_transcript'&&c.args.channel==='[mic]'));
    await f.controller.action({id:'mic-off',action:'listen',source:'button'});
    assert.equal(f.calls.filter(c=>c.name==='stop_microphone').length,1);
  }finally{await f.controller.stop();}
});
test('disabling microphone capture live closes native input and shutdown never reopens it',async()=>{
  const f=fixture();let enabled=true;const original=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>name==='get_capture_settings'?{system_audio:false,microphone:enabled}:original(name,args);
  await f.controller.start();
  try{
    await f.controller.action({id:'mic-on',action:'listen',source:'button'});enabled=false;
    await f.controller.refreshStatus();
    assert.equal(f.calls.filter(c=>c.name==='stop_microphone').length,1);
    await f.controller.stop();enabled=true;await f.controller.refreshStatus();
    assert.equal(f.calls.filter(c=>c.name==='start_microphone').length,1);
  }finally{await f.controller.stop();}
});
test('native microphone failure rolls back Listen and closes an already started system capture',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;
  f.controller.ports.invoke=async(name,args)=>{
    if(name==='get_capture_settings')return{system_audio:true,microphone:true};
    if(name==='start_microphone')throw new Error('Native microphone unavailable');
    return original(name,args);
  };
  await f.controller.start();try{
    await f.controller.action({id:'bad-mic',action:'listen',source:'button'});
    assert.equal(f.controller.snapshot.listening,false);
    assert.match(f.controller.snapshot.error,/Native microphone unavailable/);
    assert.ok(f.calls.some(c=>c.name==='stop_system_audio_capture'));
  }finally{await f.controller.stop();}
});
test('Screen vision upgrades an older manual profile to interval capture before starting',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;
  const capture={mode:'manual',interval:5,monitor:'primary',microphone:false,system_audio:false};
  f.controller.ports.invoke=async(name,args)=>{
    if(name==='get_capture_settings')return{...capture};
    if(name==='update_capture_settings')Object.assign(capture,args.settings);
    return original(name,args);
  };
  await f.controller.start();try{
    await f.controller.action({id:'vision-on',action:'continuous',source:'button'});
    const settings=f.calls.findIndex(c=>c.name==='update_capture_settings');
    const start=f.calls.findIndex(c=>c.name==='start_continuous');
    assert.ok(settings>=0&&settings<start);assert.equal(capture.mode,'interval');
  }finally{await f.controller.stop();}
});
test('stopping Listen transcribes the final owned native speech segment exactly once',async()=>{
  const f=fixture();const original=f.controller.ports.invoke;
  const header=new Uint8Array(44);header.set(new TextEncoder().encode('RIFF'));header.set(new TextEncoder().encode('WAVE'),8);
  const finalAudio=Buffer.from(header).toString('base64');
  f.controller.ports.invoke=async(name,args)=>{
    if(name==='get_capture_settings')return{system_audio:false,microphone:true};
    if(name==='stop_microphone'){
      assert.equal(f.controller.snapshot.listening,false);
      await f.handlers.get('microphone-input')?.(finalAudio);
    }
    return original(name,args);
  };
  await f.controller.start();try{
    await f.controller.action({id:'final-on',action:'listen',source:'button'});
    await f.controller.action({id:'final-off',action:'listen',source:'button'});
    assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript'&&c.args.channel==='[mic]').length,1);
    await f.handlers.get('microphone-input')(finalAudio);
    assert.equal(f.calls.filter(c=>c.name==='continuous_add_transcript'&&c.args.channel==='[mic]').length,1);
  }finally{await f.controller.stop();}
});
