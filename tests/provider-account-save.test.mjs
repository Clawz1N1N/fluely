import test from 'node:test';
import assert from 'node:assert/strict';
import { publishProviderAccount } from '../src/lib/overlay/provider-account-save.ts';
function fixture(initial){let value=initial;const calls=[];return {get value(){return value;},calls,ports:{get:async()=>value,set:async(k,v)=>{calls.push('set');value=v;},remove:async()=>{calls.push('remove');value=null;},publish:async()=>{calls.push('publish');throw Error('metadata failure');}}};}
test('failed model save restores an existing account key',async()=>{const f=fixture('old');await assert.rejects(publishProviderAccount('account','new',f.ports),/metadata failure/);assert.equal(f.value,'old');assert.deepEqual(f.calls,['set','publish','set']);});
test('failed new account save removes its unreferenced key',async()=>{const f=fixture(null);await assert.rejects(publishProviderAccount('account','new',f.ports),/metadata failure/);assert.equal(f.value,null);assert.deepEqual(f.calls,['set','publish','remove']);});
test('empty key preserves existing vault value and publishes metadata directly',async()=>{const f=fixture('old');f.ports.publish=async()=>f.calls.push('publish');await publishProviderAccount('account','',f.ports);assert.equal(f.value,'old');assert.deepEqual(f.calls,['publish']);});
