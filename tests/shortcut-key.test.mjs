import assert from 'node:assert/strict';
import test from 'node:test';
import {shortcutMainKey} from '../src/lib/overlay/shortcut-key.ts';
test('shortcut recording stays physical across Cyrillic layouts and shifted punctuation',()=>{
  for(const key of ['h','H','р','Р'])assert.equal(shortcutMainKey({key,code:'KeyH'}),'h');
  for(const key of ['\\','|','/'])assert.equal(shortcutMainKey({key,code:'Backslash'}),'backslash');
  assert.equal(shortcutMainKey({key:'!',code:'Digit1'}),'1');
  assert.equal(shortcutMainKey({key:'Shift',code:'ShiftRight'}),'shift');
  assert.equal(shortcutMainKey({key:'Escape',code:'Escape'}),'escape');
});
