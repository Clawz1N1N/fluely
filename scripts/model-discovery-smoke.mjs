import assert from 'node:assert/strict';
import {discoverModels} from '../src/lib/overlay/model-catalog.ts';
const models=await discoverModels({preset:'openrouter',base_url:'https://openrouter.ai/api/v1'},undefined,(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)}));
assert.ok(models.length>10);
assert.ok(models.some(m=>m.supports_images&&m.context_window));
assert.ok(models.some(m=>m.supports_audio));
console.log(JSON.stringify({source:'OpenRouter official public API',models:models.length,imageCapable:models.filter(m=>m.supports_images).length,audioCapable:models.filter(m=>m.supports_audio).length,contextMetadata:models.filter(m=>m.context_window).length,outputMetadata:models.filter(m=>m.max_output_tokens).length}));
