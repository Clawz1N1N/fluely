import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProviderConfiguration } from '../src/pages/settings/components/provider-config.ts';
import { providerSecretKey } from '../src/lib/storage/credential-store.ts';

const provider = () => ({ id:'brain-test',kind:'brain',preset:'openai-compatible',base_url:'https://example.invalid/v1',model:'test',enabled:true,supports_images:true,rank:0,
  limit_per_second:0,limit_per_minute:0,limit_per_hour:0,limit_per_day:0,curl:null,streaming:true,response_content_path:'choices[0].message.content',variables:{LANGUAGE:'uk'},secret_keys:[] });

test('keychain write and readback finish before provider metadata is published', async () => {
  const order=[];let metadata;
  await saveProviderConfiguration(provider(),'private-value',{
    setSecret:async(key,value)=>{order.push('save');assert.equal(key,providerSecretKey('brain-test','API_KEY'));assert.equal(value,'private-value');},
    getSecret:async()=>{order.push('verify');return 'private-value';},
    upsert:async(value)=>{order.push('publish');metadata=value;},
  });
  assert.deepEqual(order,['save','verify','publish']);
  assert.deepEqual(metadata.secret_keys,['API_KEY']);
  assert.equal(JSON.stringify(metadata).includes('private-value'),false);
  assert.deepEqual(metadata.variables,{LANGUAGE:'uk'});
});

test('readback failure blocks publishing and never puts a key in metadata',async()=>{
  let published=false;
  await assert.rejects(saveProviderConfiguration(provider(),'private-value',{
    setSecret:async()=>{},getSecret:async()=>null,upsert:async()=>{published=true;},
  }));
  assert.equal(published,false);
});

test('blank API key preserves an existing key without reading it into the form',async()=>{
  const input={...provider(),secret_keys:['API_KEY']};let published;
  await saveProviderConfiguration(input,'',{
    setSecret:async()=>assert.fail('existing key must survive'),getSecret:async()=>assert.fail('existing key must stay outside form'),
    upsert:async(value)=>{published=value;},
  });
  assert.deepEqual(published.secret_keys,['API_KEY']);
});

test('secret-shaped metadata is rejected before writing the vault or provider',async()=>{
  const input={...provider(),variables:{API_KEY:'private-value'}};
  await assert.rejects(saveProviderConfiguration(input,'',{
    setSecret:async()=>assert.fail(),getSecret:async()=>assert.fail(),upsert:async()=>assert.fail(),
  }));
});
