import { useSyncExternalStore } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import { createLanguageStore, LANGUAGE_STORAGE_KEY, translate, type InterfaceLanguage } from './core';

export type { InterfaceLanguage } from './core';
export { detectLanguage } from './core';
export const LANGUAGE_EVENT = 'fluely-interface-language';

let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch { /* Storage can be unavailable. */ }
const store = createLanguageStore(storage, typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
let languageChosen=false;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_STORAGE_KEY) store.receiveLanguage(event.newValue);
  });
  if ('__TAURI_INTERNALS__' in window) {
    void invoke<string>('get_system_locale').then(locale=>{
      if(!languageChosen&&!storage?.getItem(LANGUAGE_STORAGE_KEY))store.receiveLanguage(locale);
    }).catch(()=>{});
    void listen<InterfaceLanguage>(LANGUAGE_EVENT, event => store.receiveLanguage(event.payload)).catch(() => {});
  }
  store.subscribe(() => { document.documentElement.lang = store.getSnapshot(); });
  document.documentElement.lang = store.getSnapshot();
}

export function setLanguage(language: InterfaceLanguage) {
  languageChosen=true;
  store.setLanguage(language);
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) void emit(LANGUAGE_EVENT, language).catch(() => {});
}

export function t(source: string, values?: Record<string, string | number>): string {
  return translate(source, store.getSnapshot(), values);
}

export function useI18n() {
  const language = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { language, setLanguage, t };
}
