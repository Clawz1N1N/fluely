// Secure storage helpers.
//
// Secrets use the OS keychain. Failures propagate to callers;
// secrets are never silently written to plaintext storage.

import { invoke } from '@tauri-apps/api/core';
import { CredentialStore } from './credential-store';

const keychainSet=(key:string,password:string)=>invoke<void>('plugin:keychain|save_item',{key,password});
const keychainGet=async(key:string)=>{
  const result=await invoke<{password:string|null}>('plugin:keychain|get_item',{key});
  return result.password || null;
};
const keychainRemove=(key:string)=>invoke<void>('plugin:keychain|remove_item',{key});

export const credentialStore = new CredentialStore({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}, { save: keychainSet, get: keychainGet });

/** Store a secret in the OS keychain. */
export async function setSecret(
  key: string,
  value: string
): Promise<boolean> {
  await keychainSet(key, value);
  return true;
}

/** Read a secret from the OS keychain. */
export async function getSecret(
  key: string
): Promise<string | null> {
  return keychainGet(key);
}

/** Delete a secret. */
export async function removeSecret(
  key: string
): Promise<void> {
  await keychainRemove(key);
  localStorage.removeItem(`secret:${key}`);
}

/**
 * Migrate an existing plaintext localStorage value
 * into the keychain. Returns true when the value
 * was moved (or was already absent).
 */
export async function migrateToKeychain(
  storageKey: string
): Promise<boolean> {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return true;
  const ok = await setSecret(storageKey, raw);
  if (ok) {
    localStorage.removeItem(storageKey);
  }
  return ok;
}
