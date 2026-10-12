import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialStore } from '../src/lib/storage/credential-store.ts';

function fixture(fail = false) {
  const disk = new Map(), vault = new Map();
  const storage = { getItem: k => disk.get(k) ?? null, setItem: (k,v) => disk.set(k,v) };
  const keychain = { save: async (k,v) => { if(fail) throw Error('unavailable'); vault.set(k,v); }, get: async k => vault.get(k) ?? null };
  return { disk, vault, store: new CredentialStore(storage, keychain) };
}
test('migration verifies vault contents before removing plaintext; model metadata survives', async () => {
  const {disk,vault,store} = fixture();
  disk.set('selected', JSON.stringify({provider:'model', variables:{API_KEY:'private',MODEL:'name'}}));
  const loaded = await store.load('selected');
  assert.equal(loaded.variables.API_KEY, 'private');
  assert.equal(vault.size, 1);
  assert.ok(!disk.get('selected').includes('private'));
  assert.equal(JSON.parse(disk.get('selected')).variables.MODEL,'name');
  assert.equal((await store.load('selected')).variables.API_KEY,'private');
});
test('keychain failure rejects migration and preserves old value visibly for retry', async () => {
  const {disk,store} = fixture(true);
  const original=JSON.stringify({provider:'model',variables:{API_KEY:'private'}});
  disk.set('selected', original);
  await assert.rejects(store.load('selected'), /keychain|сховище/i);
  assert.equal(disk.get('selected'), original);
});
test('new save never falls back to plaintext on keychain failure', async () => {
  const {disk,store} = fixture(true);
  await assert.rejects(store.save('selected',{provider:'model',variables:{TOKEN:'private'}}));
  assert.equal(disk.has('selected'),false);
});
test('vault readback mismatch prevents deletion of original credentials', async () => {
  const disk=new Map([['selected',JSON.stringify({provider:'model',variables:{PASSWORD:'private'}})]]);
  const store=new CredentialStore({getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)}, {save:async()=>{},get:async()=>null});
  await assert.rejects(store.load('selected'));
  assert.ok(disk.get('selected').includes('private'));
});
