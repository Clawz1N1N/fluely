import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScreenContext, ScreenSceneMemory } from '../src/lib/overlay/screen-context.ts';

test('pixel-text routes real pixel representation directly and never invokes a VLM',async()=>{
  const context=await resolveScreenContext(['frame'],{mode:'pixel-text',max_chars:1000},{
    native:async()=> '[PIXEL LUMINANCE]\n▀▄█\n[COLOR MAP]\nRBG',
    describe:async()=> {throw Error('Pixel method must not request a VLM');},
  });
  assert.match(context,/PIXEL LUMINANCE/);assert.match(context,/▀▄█/);assert.match(context,/RBG/);
});

test('blank pixel output is an explicit extraction failure',async()=>{
  await assert.rejects(resolveScreenContext(['frame'],{mode:'pixel-text',max_chars:100},{
    native:async()=> '',describe:async()=> 'wrong pipeline',
  }),/Pixel representation is empty/);
});

test('full vision starts native and VLM work together and caps Ukrainian context',async()=>{
  const started=[];let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const result=resolveScreenContext(['frame'],{mode:'full',max_chars:30},{
    native:async()=>{started.push('native');await pending;return 'Україна '.repeat(10);},
    describe:async()=>{started.push('vlm');await pending;return 'Опис екрана';},
  });
  await Promise.resolve();assert.deepEqual(started,['native','vlm']);release();
  assert.equal(Array.from(await result).length,30);
});
test('VLM mode only calls the selected visual provider',async()=>{
  const result=await resolveScreenContext(['frame'],{mode:'vlm',max_chars:100},{
    native:async()=>{throw Error('native should not run');},describe:async()=> 'Видимий текст',
  });
  assert.match(result,/Видимий текст/);
});
test('full vision keeps the semantic scene before supplemental OCR when space is limited',async()=>{
  const context=await resolveScreenContext(['frame'],{mode:'full',max_chars:80},{
    native:async()=> 'Repeated OCR '.repeat(100),describe:async()=> 'A red circle above a blue diagram.',
  });
  assert.match(context,/A red circle above a blue diagram/);
  assert.ok(context.indexOf('red circle')<context.indexOf('Repeated OCR')||!context.includes('Repeated OCR'));
});
test('native OCR failure preserves a successful visual scene',async()=>{
  const context=await resolveScreenContext(['frame'],{mode:'full',max_chars:100},{
    native:async()=> {throw Error('OCR unavailable');},describe:async()=> 'A photo and three chart panels.',
  });
  assert.match(context,/photo and three chart panels/);
});
test('missing visual interpretation is an error rather than OCR pretending to be full vision',async()=>{
  await assert.rejects(resolveScreenContext(['frame'],{mode:'full',max_chars:100},{
    native:async()=> 'Visible text only',describe:async()=> '',
  }),/Visual description is empty/);
});
test('scene memory retains unchanged monitors for later questions and expires old observations',()=>{
  const memory=new ScreenSceneMemory();
  memory.remember('left','A red chart',1000);memory.remember('right','A green diagram',1500);
  memory.remember('left','An updated red chart',2000);
  const context=memory.context(1000,3000);
  assert.match(context,/updated red chart/);assert.match(context,/green diagram/);
  assert.doesNotMatch(context,/\nA red chart/);
  assert.equal(memory.context(1000,200000),'');
});
test('scene memory bounds monitors and unicode context, preserving recent observations',()=>{
  const memory=new ScreenSceneMemory();for(let i=0;i<20;i++)memory.remember(String(i),'Україна '.repeat(1000),i);
  const context=memory.context(100,30);
  assert.equal(Array.from(context).length,100);assert.match(context,/Monitor 19/);
});
