export interface SelectedCredentials {
  provider: string;
  variables: Record<string, string>;
  secretKeys?: string[];
}
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface VaultPort { save(key: string, value: string): Promise<unknown>; get(key: string): Promise<string | null> }
export const isSecretVariable = (key: string) => /KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION|CREDENTIAL/i.test(key);
export const providerSecretKey = (id: string, key: string) => `pluely.provider.${encodeURIComponent(id)}.${encodeURIComponent(key)}`;

/** Metadata is published only after every secret has been saved and verified. */
export class CredentialStore {
  private writes = new Map<string, Promise<unknown>>();
  constructor(private storage: StoragePort, private vault: VaultPort) {}
  private async persist(key: string, selected: SelectedCredentials): Promise<void> {
    const variables: Record<string, string> = {};
    const secretKeys = new Set(selected.secretKeys ?? []);
    try {
      for (const [name, value] of Object.entries(selected.variables)) {
        if (isSecretVariable(name) || secretKeys.has(name)) {
          secretKeys.add(name);
          if (value) {
            const vaultKey = providerSecretKey(selected.provider, name);
            await this.vault.save(vaultKey, value);
            if (await this.vault.get(vaultKey) !== value) throw new Error('verification failed');
          }
        } else variables[name] = value;
      }
      this.storage.setItem(key, JSON.stringify({ provider: selected.provider, variables, secretKeys: [...secretKeys] }));
    } catch {
      throw new Error('Захищене сховище keychain недоступне. Ключі не збережено у відкритому вигляді. Старі дані залишено для повторної міграції.');
    }
  }
  save(key: string, selected: SelectedCredentials): Promise<void> {
    const prior = this.writes.get(key) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(() => this.persist(key, selected));
    this.writes.set(key, next);
    void next.finally(() => { if (this.writes.get(key) === next) this.writes.delete(key); }).catch(() => {});
    return next;
  }
  async load(key: string): Promise<SelectedCredentials | null> {
    await this.writes.get(key);
    const raw = this.storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectedCredentials;
    if (!parsed || typeof parsed.provider !== 'string' || !parsed.variables || typeof parsed.variables !== 'object') throw new Error('Некоректні налаштування провайдера');
    if (Object.keys(parsed.variables).some(isSecretVariable)) await this.save(key, parsed);
    const clean = JSON.parse(this.storage.getItem(key)!) as SelectedCredentials;
    const variables = { ...clean.variables };
    try {
      for (const name of clean.secretKeys ?? []) {
        const secret = await this.vault.get(providerSecretKey(clean.provider, name));
        if (secret !== null) variables[name] = secret;
      }
    } catch {
      throw new Error('Не вдалося прочитати ключ із захищеного сховища keychain.');
    }
    return { ...clean, variables };
  }
}
