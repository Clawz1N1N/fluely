import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AISettingsNavigation} from '../src/pages/dev/AISettingsNavigation.tsx';
import {setLanguage} from '../src/lib/i18n/index.ts';

const render=(kind,source)=>renderToStaticMarkup(React.createElement(AISettingsNavigation,{kind,source,onKind(){},onSource(){},onRefresh(){}}));
test('AI module navigation exposes refresh and gives the selected submodule a white background with dark text',()=>{
  setLanguage('en');
  const html=render('stt','local');
  for(const label of ['Reasoning','Speech recognition','Text-to-speech','Vision','Refresh providers','Cloud providers','Local engines','System'])assert.ok(html.includes(label),label);
  assert.match(html,/<button[^>]+aria-pressed="true"[^>]+class="[^"]*bg-white[^"]*text-zinc-950[^"]*"[^>]*>Local engines<\/button>/);
});
test('System submodule is offered only for implemented speech recognition and text-to-speech backends',()=>{
  setLanguage('en');
  for(const kind of ['brain','vision'])assert.doesNotMatch(render(kind,'cloud'),/>System<\/button>/);
  for(const kind of ['stt','tts'])assert.match(render(kind,'system'),/>System<\/button>/);
});
