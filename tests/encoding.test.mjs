import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectEncoding } from '../scripts/check-encoding.mjs';

test('valid Ukrainian UTF-8 and consistent line endings are accepted', () => {
  assert.deepEqual(inspectEncoding(Buffer.from('Українська мова\nНаступний рядок\n')), []);
  assert.deepEqual(inspectEncoding(Buffer.from('first\r\nsecond\r\n')), []);
});
test('BOM, malformed bytes, replacement characters and mixed endings are rejected', () => {
  assert.ok(inspectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 65])).includes('BOM'));
  assert.ok(inspectEncoding(Buffer.from([0xff])).includes('invalid UTF-8'));
  assert.ok(inspectEncoding(Buffer.from('bad\uFFFD')).includes('replacement character U+FFFD'));
  assert.ok(inspectEncoding(Buffer.from('first\r\nsecond\n')).includes('mixed CRLF/LF'));
  assert.ok(inspectEncoding(Buffer.from('\u044f\u2510\u255c')).includes('probable mojibake'));
});
