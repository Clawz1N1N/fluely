import test from 'node:test';
import assert from 'node:assert/strict';
import {ServiceController} from '../src/lib/overlay/service-controller.ts';
import {INITIAL_SERVICE_STATE} from '../src/lib/overlay/contracts.ts';
import {wavRecordingStart,sessionHistory} from '../src/lib/overlay/session-store.ts';

function fixture(){
  const sessions=new Map();let next=0;const handlers=new Map();
  const store={create:async title=>{const s={id:String(++next),title,created_at:1,updated_at:1,events:[]};sessions.set(s.id,s);return structuredClone(s);},
    get:async id=>structuredClone(sessions.get(id)),append:async(id,event)=>{sessions.get(id).events.push(structuredClone(event));return structuredClone(event);}};
  const ports={sessions:store,listen:async(name,handler)=>{handlers.set(name,handler);return()=>{};},emit:async()=>{},initialize:async()=>{},
    invoke:async name=>name==='get_shell_settings'?INITIAL_SERVICE_STATE.shell:name==='get_capture_settings'?{microphone:false,system_audio:true}:name==='get_tts_settings'?{enabled:false,rate:1}:undefined,
    status:async()=>({providers:[],neutral:false,nextAllowedAt:null}),answer:async function*(){yield '<main>Answer</main><side>Details</side><speak>Answer</speak>';},transcribe:async()=> 'recorded text',
    speech:{update(){},stop(){},pause(){},seek(){},toggle:async()=>{}}};
  return{controller:new ServiceController(ports),sessions,store,handlers};
}
test('starting and opening an empty chat creates no persisted session; first activity creates one',async()=>{
  const f=fixture();await f.controller.start();
  try{assert.equal(f.sessions.size,0);await f.controller.batch({request_id:1,questions:['First question'],transcript:[],frames:[]});
    assert.equal(f.sessions.size,1);assert.match(f.controller.snapshot.session.title,/\d/);assert.deepEqual(f.controller.snapshot.session.events.map(e=>e.kind),['question','answer']);
    assert.equal(f.controller.snapshot.session.events[1].side,'Details');}
  finally{await f.controller.stop();}
});
test('New chat invalidates drafts even when the active session is already empty',async()=>{
  const f=fixture();await f.controller.start();try{
    const revision=f.controller.snapshot.sessionRevision;
    await f.controller.action({id:'empty-new-1',action:'session_new',source:'test'});
    await f.controller.action({id:'empty-new-2',action:'session_new',source:'test'});
    assert.equal(f.controller.snapshot.sessionRevision,revision+2);assert.equal(f.sessions.size,0);
  }finally{await f.controller.stop();}
});
test('selecting an old chat restores all context and a dashboard rename refreshes the live title',async()=>{
  const f=fixture();await f.controller.start();
  try{for(let i=0;i<12;i++)await f.controller.batch({request_id:i+1,questions:[`Q${i}`],transcript:[],frames:[]});
    const id=f.controller.snapshot.session.id;
    await f.controller.action({id:'new',action:'session_new',source:'test'});assert.equal(f.controller.snapshot.session,null);assert.deepEqual(f.controller.snapshot.history,[]);
    await f.controller.action({id:'select',action:'session_select',sessionId:id,source:'test'});
    assert.equal(f.controller.snapshot.history.length,24);assert.equal(f.controller.snapshot.history[0].content,'Q0');
    f.sessions.get(id).title='Renamed';f.handlers.get('chat-sessions-changed')({sessionId:id});await new Promise(r=>setImmediate(r));assert.equal(f.controller.snapshot.session.title,'Renamed');}
  finally{await f.controller.stop();}
});
test('raw audio and labeled transcript survive a transcription failure or a successful batch',async()=>{
  const f=fixture();await f.controller.start();
  try{await f.controller.action({id:'listen',action:'listen',source:'test'});f.controller.ports.transcribe=async()=>{throw new Error('STT failed');};
    await f.controller.audio(new Blob(['RIFF bytes'],{type:'audio/wav'}),'[system]');
    assert.equal(f.controller.snapshot.session.events[0].kind,'audio');assert.equal(f.controller.snapshot.session.events[0].channel,'[system]');
    f.controller.ports.transcribe=async()=>({text:'hello',segments:[{text:'hello',speaker:'Speaker 1',start:0.5,end:1.2}]});
    await f.controller.audio(new Blob(['RIFF bytes'],{type:'audio/wav'}),'[mic]',true);
    const transcript=f.controller.snapshot.session.events.find(e=>e.kind==='transcript');assert.equal(transcript.speaker,'Speaker 1');assert.equal(transcript.text,'hello');assert.ok(transcript.timestamp>0);}
  finally{await f.controller.stop();}
});
test('an old recording finishing encoding after New chat cannot create or contaminate the new chat',async()=>{
  const f=fixture();await f.controller.start();let release;const blob=new Blob(['old audio']);
  blob.arrayBuffer=()=>new Promise(resolve=>{release=resolve;});
  try{await f.controller.action({id:'listen-switch',action:'listen',source:'test'});const audio=f.controller.audio(blob,'[system]');await new Promise(r=>setImmediate(r));
    await f.controller.action({id:'switch-during-encoding',action:'session_new',source:'test'});release(new Uint8Array([1,2]).buffer);await audio;
    assert.equal(f.controller.snapshot.session,null);assert.equal(f.sessions.size,0);}
  finally{release?.(new ArrayBuffer(0));await f.controller.stop();}
});
test('the raw partial brain reply remains archived when a provider fails after streaming',async()=>{
  const f=fixture();f.controller.ports.answer=async function*(){yield '<main>Partial answer';throw new Error('Network interrupted');};await f.controller.start();
  try{await f.controller.batch({request_id:4,questions:['Question'],transcript:[],frames:[]});const answer=f.controller.snapshot.session.events.find(e=>e.kind==='answer');assert.ok(answer);assert.equal(answer.incomplete,true);assert.equal(answer.text,'<main>Partial answer');}
  finally{await f.controller.stop();}
});
test('WAV offsets use recording start time and Sleep logs do not enter ordinary brain context',()=>{
  const data=new Uint8Array(44+16000);const view=new DataView(data.buffer);const put=(at,text)=>data.set(new TextEncoder().encode(text),at);
  put(0,'RIFF');put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint32(28,16000,true);put(36,'data');view.setUint32(40,16000,true);
  assert.equal(wavRecordingStart(data,10000),9000);
  assert.deepEqual(sessionHistory({events:[{kind:'transcript',text:'sleep secrets',mode:'sleep'},{kind:'answer',text:'code',mode:'sleep'},{kind:'question',text:'Normal'},{kind:'answer',text:'Yes'}]}),[{role:'user',content:'Normal'},{role:'assistant',content:'Yes'}]);
});

test('switching during a multi-speaker transcript preserves all segments in the recording owner',async()=>{
  const f=fixture();let release,entered;const deferred=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  const append=f.store.append;f.store.append=async(id,event)=>{if(event.kind==='transcript'&&event.text==='First segment'){entered();await deferred;}return append(id,event);};
  f.controller.ports.transcribe=async()=>({text:'First segment Second segment',segments:[{text:'First segment',speaker:'A'},{text:'Second segment',speaker:'B'}]});
  const added=[];const native=f.controller.ports.invoke;f.controller.ports.invoke=async(name,args)=>{if(name==='continuous_add_transcript')added.push(args);return native(name,args);};
  await f.controller.start();
  try{
    await f.controller.action({id:'listen-race',action:'listen',source:'test'});
    const audio=f.controller.audio(new Blob(['fixture audio'],{type:'audio/wav'}),'[system]');await started;
    const change=f.controller.action({id:'new-race',action:'session_new',source:'test'});await new Promise(resolve=>setImmediate(resolve));release();
    await Promise.all([audio,change]);
    assert.equal(f.sessions.size,1);assert.equal(f.controller.snapshot.session,null);
    assert.deepEqual([...f.sessions.values()][0].events.filter(event=>event.kind==='transcript').map(event=>event.text),['First segment','Second segment']);
    assert.deepEqual(added,[],'old transcript must not enter the new live inference queue');
  }finally{release();await f.controller.stop();}
});
