import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VisionMethodSettings} from '../src/pages/settings/components/VisionMethodSettings.tsx';

const value={method:'semantic',mode:'full',max_chars:8000,ui_max_depth:8,ui_max_chars:4000};
const providers=[
  {id:'reasoning-with-images',model:'Image reasoning',kind:'brain',supports_images:true,enabled:true},
  {id:'visual',model:'Dedicated visual',kind:'vision',supports_images:true,enabled:true},
  {id:'text-only',model:'Text only',kind:'brain',supports_images:false,enabled:true},
  {id:'disabled-visual',model:'Disabled visual',kind:'vision',supports_images:true,enabled:false},
  {id:'audio',model:'Audio',kind:'stt',supports_images:true,enabled:true},
];
test('screen vision offers image-capable registered reasoning and visual models only',()=>{
  const html=renderToStaticMarkup(React.createElement(VisionMethodSettings,{value,providers,onChange(){}}));
  assert.match(html,/value="reasoning-with-images"/);assert.match(html,/value="visual"/);
  assert.doesNotMatch(html,/value="text-only"/);assert.doesNotMatch(html,/value="disabled-visual"/);assert.doesNotMatch(html,/value="audio"/);
});
test('pixel method exposes local representation controls without a VLM selector',()=>{
  const html=renderToStaticMarkup(React.createElement(VisionMethodSettings,{value:{...value,method:'pixel-text'},providers,onChange(){}}));
  assert.match(html,/value="pixel-text"/);assert.match(html,/min="24"/);assert.match(html,/max="96"/);
  assert.doesNotMatch(html,/value="reasoning-with-images"/);
});
