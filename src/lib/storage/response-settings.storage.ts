import { STORAGE_KEYS } from "@/config";
import { cachedChatPreferences, updateChatPreferences } from '../overlay/chat-preferences';
import {
  DEFAULT_RESPONSE_LENGTH,
  DEFAULT_LANGUAGE,
  DEFAULT_AUTO_SCROLL,
} from "../response-settings.constants";

export interface ResponseSettings {
  responseLength: string;
  language: string;
  autoScroll: boolean;
}

export const DEFAULT_RESPONSE_SETTINGS: ResponseSettings = {
  responseLength: DEFAULT_RESPONSE_LENGTH,
  language: DEFAULT_LANGUAGE,
  autoScroll: DEFAULT_AUTO_SCROLL,
};

/**
 * Get response settings from localStorage
 */
export const getResponseSettings = (): ResponseSettings => {
  const shared=cachedChatPreferences();
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RESPONSE_SETTINGS);
    if (!stored) {
      return {...DEFAULT_RESPONSE_SETTINGS,responseLength:shared?.response_length??DEFAULT_RESPONSE_SETTINGS.responseLength,language:shared?.response_language??DEFAULT_RESPONSE_SETTINGS.language};
    }

    const parsedSettings = JSON.parse(stored);

    return {
      responseLength:
        shared?.response_length || parsedSettings.responseLength ||
        DEFAULT_RESPONSE_SETTINGS.responseLength,
      language: shared?.response_language || parsedSettings.language || DEFAULT_RESPONSE_SETTINGS.language,
      autoScroll:
        parsedSettings.autoScroll !== undefined
          ? parsedSettings.autoScroll
          : DEFAULT_RESPONSE_SETTINGS.autoScroll,
    };
  } catch (error) {
    console.error("Failed to get response settings:", error);
    return DEFAULT_RESPONSE_SETTINGS;
  }
};

/**
 * Save response settings to localStorage
 */
export const setResponseSettings = (settings: ResponseSettings): void => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.RESPONSE_SETTINGS,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Failed to save response settings:", error);
  }
};

/**
 * Update response length
 */
export const updateResponseLength = (
  responseLength: string
): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, responseLength };
  setResponseSettings(newSettings);
  if(typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window)void updateChatPreferences({response_length:responseLength}).catch(console.error);
  return newSettings;
};

/**
 * Update language
 */
export const updateLanguage = (language: string): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, language };
  setResponseSettings(newSettings);
  if(typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window)void updateChatPreferences({response_language:language}).catch(console.error);
  return newSettings;
};

/**
 * Update auto-scroll
 */
export const updateAutoScroll = (autoScroll: boolean): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, autoScroll };
  setResponseSettings(newSettings);
  return newSettings;
};
