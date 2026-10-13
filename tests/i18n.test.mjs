import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, createLanguageStore, translate } from '../src/lib/i18n/core.ts';
import { catalog } from '../src/lib/i18n/catalog.ts';
import { setLanguage } from '../src/lib/i18n/index.ts';
import { InterfaceLanguage } from '../src/pages/settings/components/InterfaceLanguage.tsx';
import { ResponseLength } from '../src/pages/responses/components/ResponseLength.tsx';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

test('interface language detects Ukrainian and Russian OS locales with English fallback', () => {
  assert.equal(detectLanguage(['uk-UA']), 'uk');
  assert.equal(detectLanguage(['ru-RU']), 'ru');
  assert.equal(detectLanguage(['en-US']), 'en');
  assert.equal(detectLanguage(['de-DE', 'ru-RU']), 'ru');
  assert.equal(detectLanguage(['de-DE']), 'en');
});

test('persisted selection overrides OS detection and notifies every subscriber', () => {
  const saved = new Map([['fluely.interface-language', 'ru']]);
  const storage = {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value)};
  const store = createLanguageStore(storage, ['uk-UA']);
  assert.equal(store.getSnapshot(), 'ru');
  let calls = 0;
  const stop = store.subscribe(() => calls++);
  store.setLanguage('en');
  assert.equal(store.getSnapshot(), 'en');
  assert.equal(saved.get('fluely.interface-language'), 'en');
  assert.equal(calls, 1);
  store.receiveLanguage('uk');
  assert.equal(calls, 2);
  stop();
  store.setLanguage('ru');
  assert.equal(calls, 2);
});

test('invalid and inaccessible preferences recover to detected language', () => {
  assert.equal(createLanguageStore({getItem: () => 'fr', setItem() {}}, ['uk-UA']).getSnapshot(), 'uk');
  const store = createLanguageStore({getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}, ['ru-RU']);
  store.setLanguage('en');
  assert.equal(store.getSnapshot(), 'en');
});

test('catalog translates both existing source languages, preserves arbitrary content, and interpolates values', () => {
  assert.equal(translate('Settings', 'uk'), 'Налаштування');
  assert.equal(translate('Settings', 'ru'), 'Настройки');
  assert.equal(translate('Скасувати', 'en'), 'Cancel');
  assert.equal(translate('Скасувати', 'ru'), 'Отмена');
  assert.equal(translate('History ({count})', 'uk', {count: 4}), 'Історія (4)');
  assert.equal(translate('user-written text {{API_KEY}}', 'ru'), 'user-written text {{API_KEY}}');
});

test('stored dynamic status and error text updates when language changes', () => {
  assert.equal(translate('Failed to start recording: busy', 'ru'), 'Не удалось начать запись: busy');
  assert.equal(translate('Не удалось начать запись: busy', 'en'), 'Failed to start recording: busy');
});

test('settings controls and options render in every selected interface language', () => {
  for (const [language, heading, length] of [['uk', 'Мова інтерфейсу', 'Коротка'], ['ru', 'Язык интерфейса', 'Короткий'], ['en', 'Interface Language', 'Short']]) {
    setLanguage(language);
    assert.match(renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(InterfaceLanguage))), new RegExp(heading));
    assert.match(renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ResponseLength))), new RegExp(length));
  }
});

test('catalog contains complete translations with the same interpolation tokens', () => {
  const placeholders = value => [...value.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map(match => match[1]).sort();
  for (const [source, translations] of Object.entries(catalog)) {
    for (const language of ['en', 'uk', 'ru']) {
      assert.equal(typeof translations[language], 'string', `${source}: ${language}`);
      assert.ok(translations[language].length > 0, `${source}: ${language}`);
      assert.deepEqual(placeholders(translations[language]), placeholders(translations.en), source);
    }
  }
});

test('every explicit UI translation source has all three catalog entries', () => {
  function scan(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { scan(filename); continue; }
      if (!/\.tsx?$/.test(filename)) continue;
      const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't') {
          const value = node.arguments[0];
          if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) assert.ok(catalog[value.text], `${filename}: ${value.text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(path.resolve(import.meta.dirname, '../src'));
});
