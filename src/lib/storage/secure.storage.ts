// Secure storage helpers.
//
// API keys and other secrets are stored in the OS
// keychain (tauri-plugin-keychain) instead of
// plaintext localStorage. localStorage is kept
// only as a fallback when the keychain is
// unavailable (e.g. an unsupported platform).

// The tauri-plugin-keychain JS API.
import {
  getItem as keychainGet,
  setItem as keychainSet,
  removeItem as keychainRemove,
} from "tauri-plugin-keychain";

/** Store a secret in the OS keychain. */
export async function setSecret(
  key: string,
  value: string
): Promise<boolean> {
  try {
    await keychainSet({ key, value });
    return true;
  } catch {
    // Keychain unavailable: fall back to localStorage.
    try {
      localStorage.setItem(`secret:${key}`, value);
    } catch {
      return false;
    }
    return false;
  }
}

/** Read a secret from the OS keychain. */
export async function getSecret(
  key: string
): Promise<string | null> {
  try {
    const value = await keychainGet({ key });
    return (value as string) ?? null;
  } catch {
    try {
      return localStorage.getItem(`secret:${key}`);
    } catch {
      return null;
    }
  }
}

/** Delete a secret. */
export async function removeSecret(
  key: string
): Promise<void> {
  try {
    await keychainRemove({ key });
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(`secret:${key}`);
  } catch {
    // ignore
  }
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
