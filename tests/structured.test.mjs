import test from 'node:test';
import assert from 'node:assert/strict';
import { StructuredParser, parseStructured } from '../src/lib/overlay/structured.ts';

test('Unicode and repeated sections retain their order and contents', () => {
  assert.deepEqual(parseStructured('Вступ <main>Розв’язок 🧠</main><side>Порада</side><main> Далі</main><speak>Пояснення простими словами.</speak>'), {
    main: 'Вступ Розв’язок 🧠 Далі', side: 'Порада', speak: 'Пояснення простими словами.',
  });
});
test('every possible chunk boundary gives the same final output', () => {
  const text = '<main>Українська: ї є ґ 🙂 $x^2$</main><side>Додатково</side><speak>Раз. Два. Три.</speak>';
  const expected = parseStructured(text);
  for (let boundary = 0; boundary <= text.length; boundary++) {
    const parser = new StructuredParser();
    parser.feed(text.slice(0, boundary));
    parser.feed(text.slice(boundary));
    assert.deepEqual(parser.finish(), expected, `boundary=${boundary}`);
  }
});
test('partial reserved tags never flash in streamed panels', () => {
  const parser = new StructuredParser();
  assert.equal(parser.feed('<ma').main, '');
  assert.equal(parser.feed('in>Готова').main, 'Готова');
  assert.equal(parser.feed(' відповідь</ma').main, 'Готова відповідь');
  assert.equal(parser.feed('in><si').side, '');
  assert.equal(parser.feed('de>Підказка').side, 'Підказка');
  assert.deepEqual(parser.finish(), { main: 'Готова відповідь', side: 'Підказка', speak: '' });
});
test('plain text, unknown HTML, missing closers and incomplete tags are preserved', () => {
  assert.equal(parseStructured('Звичайна відповідь <b>текст</b> $a<b$').main, 'Звичайна відповідь <b>текст</b> $a<b$');
  assert.deepEqual(parseStructured('<main>Основне<side>Додаток<speak>Пояснення'), { main: 'Основне', side: 'Додаток', speak: 'Пояснення' });
  assert.equal(parseStructured('Не завершено <mai').main, 'Не завершено <mai');
});
test('only exact lowercase protocol tags are special and unmatched closers remain literal', () => {
  assert.deepEqual(parseStructured('<SIDE>literal</SIDE>'), { main: '<SIDE>literal</SIDE>', side: '', speak: '' });
  assert.equal(parseStructured('hello </side> tail').main, 'hello </side> tail');
  assert.equal(parseStructured('<main>A</side>B</main>').main, 'A</side>B');
});
