import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelSettingsControls} from '../src/pages/settings/components/ProviderModels.tsx';
import {addReasoningEffort, changeReasoningAvailability, prepareModelSettingsSave} from '../src/pages/settings/components/provider-model-settings.ts';
import {setLanguage} from '../src/lib/i18n/index.ts';

const model={id:'key:brain:model',kind:'brain',preset:'openai-compatible',base_url:'https://api.openai.com/v1',model:'model',credential_id:'key',supports_images:true,supports_audio:true,enabled:true,rank:0,limit_per_second:0,limit_per_minute:0,limit_per_hour:0,limit_per_day:0,curl:null,streaming:true,response_content_path:'choices.0.message.content',variables:{},secret_keys:['API_KEY']};
test('a saved model exposes all eight independent budgets and defaults reasoning to off',()=>{
  setLanguage('en');
  const html=renderToStaticMarkup(React.createElement(ModelSettingsControls,{provider:model,onChange:()=>{}}));
  assert.equal((html.match(/type="number"/g)||[]).length,8);
  assert.match(html,/Token limits/);
  assert.match(html,/<option value="off" selected="">Off<\/option>/);
  assert.match(html,/Pause this model/);
  assert.match(html,/No requests are sent to this model until its budget recovers/);
});
test('quota validation rejects fractions, negatives and overflow in every budget while retaining zero unlimited',()=>{
  for(const prefix of ['limit_per_','token_limit_per_'])for(const period of ['second','minute','hour','day']){
    const key=prefix+period;
    for(const invalid of [-1,1.5,NaN,4294967296])assert.throws(()=>prepareModelSettingsSave({...model,[key]:invalid}),/Limits/);
  }
  const saved=prepareModelSettingsSave({...model,token_limit_per_day:4294967295});
  assert.equal(saved.token_limit_per_day,4294967295);
  assert.equal(saved.token_limit_per_minute,0);
  assert.equal(saved.reasoning_effort,'off');
  assert.equal(saved.manual_neutral,false);
  assert.equal(saved.credential_id,'key');
  assert.deepEqual(saved.secret_keys,['API_KEY']);
  assert.equal(saved.supports_audio,true);
});
test('removing a selected reasoning effort returns only that model to off',()=>{
  const changed=changeReasoningAvailability({...model,reasoning_effort:'high',reasoning_efforts:['off','high','max']},'high',false);
  assert.equal(changed.reasoning_effort,'off');
  assert.deepEqual(changed.reasoning_efforts,['off','max']);
  assert.equal(changed.credential_id,'key');
});
test('custom efforts accept English letters and reject punctuation or non-English letters',()=>{
  assert.ok(addReasoningEffort(model,' custom ').reasoning_efforts.includes('custom'));
  for(const invalid of ['', 'extra-high','low2','високий'])assert.throws(()=>addReasoningEffort(model,invalid),/English letters/);
  assert.throws(()=>prepareModelSettingsSave({...model,reasoning_effort:'high',reasoning_efforts:['off','low']}),/available/);
});
test('model edits reject output beyond context and retain provider capabilities',()=>{
  assert.throws(()=>prepareModelSettingsSave({...model,context_window:100,max_output_tokens:101}),/context window/);
  assert.equal(prepareModelSettingsSave({...model,context_window:100,max_output_tokens:100}).supports_images,true);
});
test('model quota and reasoning controls are localized in Ukrainian and Russian',()=>{
  for(const [language,quota,reasoning] of [['uk','Ліміти токенів','Рівень міркування'],['ru','Лимиты токенов','Уровень рассуждения']]){
    setLanguage(language);
    const html=renderToStaticMarkup(React.createElement(ModelSettingsControls,{provider:model,onChange:()=>{}}));
    assert.ok(html.includes(quota));assert.ok(html.includes(reasoning));
  }
  setLanguage('en');
});

test('OpenRouter brain models expose a per-model tool opt-out while other providers do not',()=>{
 setLanguage('en');
 for(const [provider,checked] of [[{...model,preset:'openrouter'},true],[{...model,preset:'openrouter',variables:{FLUELY_AGENT_TOOLS:'off'}},false]]){
  const html=renderToStaticMarkup(React.createElement(ModelSettingsControls,{provider,onChange:()=>{}}));
  assert.match(html,/Agent tools/);assert.match(html,checked?/aria-label="Agent tools"[^>]*checked=""/:/aria-label="Agent tools"(?![^>]*checked)/);
 }
 const html=renderToStaticMarkup(React.createElement(ModelSettingsControls,{provider:model,onChange:()=>{}}));
 assert.doesNotMatch(html,/Agent tools/);
});
