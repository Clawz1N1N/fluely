import { catalog } from './catalog';

export type InterfaceLanguage = 'uk' | 'ru' | 'en';
export const LANGUAGE_STORAGE_KEY = 'fluely.interface-language';
export const isInterfaceLanguage = (value: unknown): value is InterfaceLanguage => value === 'uk' || value === 'ru' || value === 'en';

export function detectLanguage(locales: readonly string[] = []): InterfaceLanguage {
  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    if (isInterfaceLanguage(language)) return language;
  }
  return 'en';
}

export function translate(source: string, language: InterfaceLanguage, values?: Record<string, string | number>): string {
  let translated = catalog[source]?.[language];
  if (translated === undefined && !values) {
    for (const template of templates) {
      const match = template.pattern.exec(source);
      if (!match) continue;
      const captured = Object.fromEntries(template.keys.map((key, index) => [key, match[index + 1]]));
      return translate(template.source, language, captured);
    }
  }
  translated ??= source;
  return values ? translated.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (match, key: string) => values[key] === undefined ? match : String(values[key])) : translated;
}

const templates = Object.keys(catalog).flatMap(source => {
  const keys: string[] = [];
  let offset = 0;
  let pattern = '^';
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of source.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)) {
    pattern += escape(source.slice(offset, match.index)) + '([\\s\\S]*?)';
    keys.push(match[1]);
    offset = match.index! + match[0].length;
  }
  if (!keys.length) return [];
  return [{ source, keys, pattern: new RegExp(pattern + escape(source.slice(offset)) + '$') }];
});

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function createLanguageStore(storage?: PreferenceStorage, locales: readonly string[] = []) {
  let language = detectLanguage(locales);
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isInterfaceLanguage(saved)) language = saved;
  } catch { /* Restricted storage must not prevent using the interface. */ }
  const listeners = new Set<() => void>();
  const update = (next: InterfaceLanguage) => {
    if (next === language) return;
    language = next;
    try { storage?.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Keep session preference. */ }
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => language,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setLanguage: update,
    receiveLanguage(value: unknown) { if (isInterfaceLanguage(value)) update(value); },
  };
}
