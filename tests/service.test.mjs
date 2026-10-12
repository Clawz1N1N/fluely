import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceController } from '../src/lib/overlay/service-controller.ts';
import { INITIAL_SERVICE_STATE } from '../src/lib/overlay/contracts.ts';

function fixture() {
  const handlers=new Map(),calls=[],events=[];
  const ports={listen:async(name,callback)=>{handlers.set(name,callback);return()=>handlers.delete(name);},
    emit:async(name,payload)=>events.push({name,payload}),invoke:async(name,args)=>{calls.push({name,args});if(name==='get_shell_settings')return INITIAL_SERVICE_STATE.shell;if(name==='get_capture_settings')return{system_audio:true,microphone:false};if(name==='get_tts_settings')return{enabled:false,rate:1};},
    status:async()=>({neutral:false,nextAllowedAt:null,currentProviderId:null,providers:[{id:'brain',model:'test'}]}),
    answer:async function*(batch){calls.push({name:'answer',args:batch});yield '<main>Відповідь</main><side>Додатково</side><speak>Пояснення.</speak>';},
    transcribe:async()=> 'Почуте', initialize:async()=>{}, speech:{update:()=>{},stop:()=>{},pause:()=>{},seek:()=>{},toggle:async()=>{}}};
  return{controller:new ServiceController(ports),handlers,calls,events};
}
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
    ['continuous_set_audio_pending',{pending:true}],['continuous_add_transcript',{channel:'[system]',text:'Почуте'}],
    ['continuous_set_audio_pending',{pending:false}],['flush_continuous',undefined],
  ]);
  await f.controller.stop();
});
test('failed batch still acknowledges its exact ID and exposes a visible error',async()=>{
  const f=fixture();f.controller.ports.answer=async function*(){throw Error('Помилка');};
  await f.controller.start();await f.controller.batch({request_id:7,frames:[],transcript:[],questions:['Q']});
  assert.equal(f.controller.snapshot.error,'Помилка');
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
