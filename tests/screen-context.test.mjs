import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScreenContext } from '../src/lib/overlay/screen-context.ts';

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
