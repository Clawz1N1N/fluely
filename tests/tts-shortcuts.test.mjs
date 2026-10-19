import test from 'node:test';import assert from 'node:assert/strict';
import {migrateTtsShortcuts} from '../src/lib/overlay/tts-shortcuts.ts';
import {DEFAULT_SHORTCUT_ACTIONS} from '../src/config/shortcuts.ts';
test('new TTS defaults match the requested physical controls',()=>{
 for(const [id,key] of [['tts_stop','ctrl+alt+space'],['tts_seek_back','ctrl+alt+z'],['tts_seek_forward','ctrl+alt+x']])assert.equal(DEFAULT_SHORTCUT_ACTIONS.find(action=>action.id===id).defaultKey.windows,key);
});
test('upgrade changes only old defaults, preserving custom keys and disabled bindings',()=>{
 const old={tts_stop:{action:'tts_stop',key:'ctrl+shift+o',enabled:false},tts_seek_back:{action:'tts_seek_back',key:'ctrl+shift+left',enabled:true},tts_seek_forward:{action:'tts_seek_forward',key:'ctrl+f10',enabled:true}};
 const next=migrateTtsShortcuts(old,'windows');assert.equal(next.tts_stop.key,'ctrl+alt+space');assert.equal(next.tts_stop.enabled,false);assert.equal(next.tts_seek_back.key,'ctrl+alt+z');assert.equal(next.tts_seek_forward.key,'ctrl+f10');assert.equal(old.tts_stop.key,'ctrl+shift+o');
 const occupied=migrateTtsShortcuts({...old,custom:{action:'custom',key:'ctrl+alt+z',enabled:true}},'windows');assert.equal(occupied.tts_seek_back.key,'ctrl+shift+left');
});
