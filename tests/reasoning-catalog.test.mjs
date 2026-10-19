import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels,modelEntries} from '../src/lib/overlay/model-catalog.ts';
const account={credential_id:'account',provider_id:'openrouter',display_name:'Account',preset:'openrouter',base_url:'https://openrouter.ai/api/v1',kind:'brain'};
test('fetched reasoning capabilities populate per-model effort choices rather than invented gateway values',()=>{
  const models=normalizeModels({data:[{id:'thinkingmachines/inkling-small:free',reasoning:{mandatory:false,supported_efforts:['max','high','medium','low','minimal','none']}}]},'openrouter');
  const entry=modelEntries(account,models,[])[0];assert.equal(entry.reasoning_effort,'off');assert.ok(entry.reasoning_efforts.includes('max'));assert.ok(!entry.reasoning_efforts.includes('xhigh'));
});
test('mandatory reasoning defaults to the lowest supported effort and existing custom settings survive refresh',()=>{
  const models=normalizeModels({data:[{id:'mandatory',reasoning:{mandatory:true,supported_efforts:['high','low','none']}}]},'openrouter');
  const entry=modelEntries(account,models,[])[0];assert.equal(entry.reasoning_effort,'low');assert.ok(!entry.reasoning_efforts.includes('off'));
  const configured={...entry,reasoning_efforts:['low','custom'],reasoning_effort:'custom'};
  assert.equal(modelEntries(account,models,[configured])[0].reasoning_effort,'custom');
});
