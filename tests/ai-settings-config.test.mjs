import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSource,providerOptions,canManageProviderAccount} from '../src/pages/dev/ai-settings-config.ts';

test('provider groups distinguish local endpoints, managed engines and OS recognition from cloud accounts',()=>{
  const source=(preset,base_url,id='account')=>providerSource({preset,base_url,id});
  assert.equal(source('other','https://api.example.org/v1'),'cloud');
  assert.equal(source('other','http://127.0.0.1:8080/v1'),'local');
  assert.equal(source('other','http://[::1]:8080/v1'),'local');
  assert.equal(source('openai-compatible','http://localhost:8080/v1'),'local');
  assert.equal(source('local-gguf-asr','http://127.0.0.1','fluely-local-gguf-asr'),'local');
  assert.equal(source('system-stt','http://localhost'),'system');
});
test('managed engine models use file selection while ordinary local HTTP and cloud accounts retain discovery',()=>{
  for(const kind of ['brain','stt','gguf-asr','vision'])assert.equal(canManageProviderAccount({id:`fluely-local-${kind}`}),false);
  for(const id of ['cloud-account','local-whisper-account','ollama-account','system-recognizer'])assert.equal(canManageProviderAccount({id}),true);
});

test('speech recognition presets never appear as text-to-speech options and cloud editors exclude installed local engines',()=>{
  for(const kind of ['tts','brain','vision']){
    const options=providerOptions(kind,'all');
    assert.ok(!options.some(p=>['system-stt','local-whisper'].includes(p.id)));
  }
  assert.deepEqual(providerOptions('stt','system').map(p=>p.id),['system-stt']);
  assert.ok(providerOptions('stt','local').some(p=>p.id==='local-whisper'));
  assert.ok(!providerOptions('brain','cloud').some(p=>['ollama','lm-studio','system-stt','local-whisper'].includes(p.id)));
  assert.ok(providerOptions('brain','cloud').some(p=>p.id==='openai-compatible'));
});
