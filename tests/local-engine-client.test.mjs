import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalEngineClient, nativeMicrophoneWave } from '../src/lib/overlay/local-engine-client.ts';
const config={kind:'brain',executable:'C:/Engine/llama-server.exe',model_path:'C:/Models/test.gguf',mmproj_path:'',port:8081,threads:4,context:2048,gpu_layers:0,language:'auto'};
test('starting a local model persists its edited configuration before launching',async()=>{
  const operations=[];
  const client=createLocalEngineClient(async(command,args)=>{operations.push([command,args]);return {state:'running'};});
  const status=await client.start(config);
  assert.equal(status.state,'running');
  assert.deepEqual(operations,[['save_local_engine_config',{config}],['start_local_engine',{kind:'brain'}]]);
});
test('configuration failure prevents launching an old local model',async()=>{
  const operations=[];
  const client=createLocalEngineClient(async(command)=>{operations.push(command);throw new Error('Port already assigned');});
  await assert.rejects(client.start(config),/Port already assigned/);
  assert.deepEqual(operations,['save_local_engine_config']);
});
test('native microphone payload becomes a WAV blob and rejects arbitrary data',async()=>{
  const header=new Uint8Array(44);header.set(new TextEncoder().encode('RIFF'));header.set(new TextEncoder().encode('WAVE'),8);
  const blob=nativeMicrophoneWave(Buffer.from(header).toString('base64'));
  assert.equal(blob.type,'audio/wav');assert.equal(blob.size,44);
  assert.throws(()=>nativeMicrophoneWave(btoa('not a wav')),/Invalid native microphone audio/);
});

test('engine start and stop notify sibling provider lists only after successful native registry changes',async()=>{
  const operations=[],draft={...config,model_path:'C:/Models/unsaved.gguf'};
  const client=createLocalEngineClient(async command=>{operations.push(command);return {state:'running'};});
  await client.start(draft,()=>operations.push('refresh-providers'));
  await client.stop('brain',()=>operations.push('refresh-providers'));
  assert.deepEqual(operations,['save_local_engine_config','start_local_engine','refresh-providers','stop_local_engine','refresh-providers']);
  assert.equal(draft.model_path,'C:/Models/unsaved.gguf');
  let refreshes=0;
  const failed=createLocalEngineClient(async()=>{throw new Error('Native failure');});
  await assert.rejects(failed.start(draft,()=>refreshes++),/Native failure/);
  assert.equal(refreshes,0);
});
