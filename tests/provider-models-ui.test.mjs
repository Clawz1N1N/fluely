import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProviderModels} from '../src/pages/settings/components/ProviderModels.tsx';
import {setLanguage} from '../src/lib/i18n/index.ts';

test('module provider editor retains adding accounts while hiding the legacy heading, intro and duplicate module toolbar',()=>{
  setLanguage('en');
  const html=renderToStaticMarkup(React.createElement(ProviderModels,{kind:'stt',source:'cloud',hideHeader:true,hideToolbar:true}));
  assert.match(html,/Add provider or API key/);
  assert.doesNotMatch(html,/<button[^>]*>Other<\/button>/);
  for(const old of ['Providers and models','Add an API key, fetch models','Reasoning models','Refresh providers'])assert.ok(!html.includes(old),old);
});
