import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachmentSelection,canAcceptAttachmentDrop} from '../src/components/Shell/attachment-intake.ts';

test('picker and drop selection reject too many files before reading',()=>{
  assert.throws(()=>validateAttachmentSelection([{name:'a.txt',size:1}],Array.from({length:8},()=>({bytes:1}))),/8 files/);
  assert.doesNotThrow(()=>validateAttachmentSelection([{name:'a.txt',size:1}],Array.from({length:7},()=>({bytes:1}))));
});
test('selection checks supported extensions, each file size and aggregate size',()=>{
  assert.throws(()=>validateAttachmentSelection([{name:'program.exe',size:1}],[]),/format/i);
  assert.throws(()=>validateAttachmentSelection([{name:'large.txt',size:16*1024*1024+1}],[]),/16 MB/);
  assert.throws(()=>validateAttachmentSelection([{name:'next.pdf',size:1}],[{bytes:32*1024*1024}]),/32 MB/);
  assert.doesNotThrow(()=>validateAttachmentSelection([{name:'Дані.DOCX',size:16*1024*1024}],[{bytes:16*1024*1024}]));
});
test('drop gating reads the whole chat interaction state and rejects busy or disabled drops',()=>{
  assert.equal(canAcceptAttachmentDrop('true',false),true);
  assert.equal(canAcceptAttachmentDrop('false',false),false);
  assert.equal(canAcceptAttachmentDrop(undefined,false),false);
  assert.equal(canAcceptAttachmentDrop('true',true),false);
});
