import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { PreloginResponse, SessionResponse, SignupRequest, StoredFile, StoredItem } from '@kept/shared';
import { MAX_FILE_BYTES } from '@kept/shared';
import { sodium, toB64, fromB64 } from '../crypto/sodium';
import { BackendError, type Backend } from './types';

type DeviceUser = SignupRequest & { authCheck: string };

/**
 * Keeps the encrypted vault in this device's IndexedDB. Used by Android preview builds until a
 * Kept server is hosted. Same ciphertext format as the server, so data can be synced up later.
 * Uninstalling the app or clearing its storage deletes the vault.
 */
export class DeviceBackend implements Backend {
  readonly kind = 'device' as const;
  private store: UseStore;
  private email: string | null = null;

  constructor(dbName = 'kept-device') {
    this.store = createStore(dbName, 'vault');
  }

  private async check(authKey: string) {
    const s = await sodium();
    return toB64(s.crypto_generichash(32, await fromB64(authKey), s.from_string('kept-device-auth-v1')));
  }
  private need() {
    if (!this.email) throw new BackendError('Not signed in', 401);
    return this.email;
  }
  private itemsKey = () => `items:${this.need()}`;
  private filesKey = () => `files:${this.need()}`;

  async prelogin(email: string): Promise<PreloginResponse> {
    const u = await get<DeviceUser>(`user:${email.toLowerCase()}`, this.store);
    if (!u) throw new BackendError('No vault on this device for that email', 404);
    return { kdfSalt: u.kdfSalt, kdfParams: u.kdfParams };
  }

  async signup(req: SignupRequest): Promise<SessionResponse> {
    const email = req.email.toLowerCase();
    if (await get(`user:${email}`, this.store)) throw new BackendError('A vault with this email already exists on this device', 409);
    await set(`user:${email}`, { ...req, email, authKey: '', authCheck: await this.check(req.authKey) }, this.store);
    this.email = email;
    return { email, wrappedVaultKey: req.wrappedVaultKey, wrappedVaultKeyNonce: req.wrappedVaultKeyNonce };
  }

  async login(emailIn: string, authKey: string): Promise<SessionResponse> {
    const email = emailIn.toLowerCase();
    const u = await get<DeviceUser>(`user:${email}`, this.store);
    const s = await sodium();
    if (!u || !s.memcmp(await fromB64(u.authCheck), await fromB64(await this.check(authKey)))) {
      throw new BackendError('Email or master password is wrong', 401);
    }
    this.email = email;
    return { email, wrappedVaultKey: u.wrappedVaultKey, wrappedVaultKeyNonce: u.wrappedVaultKeyNonce };
  }

  async logout() {
    this.email = null;
  }

  async listItems() {
    return (await get<StoredItem[]>(this.itemsKey(), this.store)) ?? [];
  }

  async putItem(id: string, item: Parameters<Backend['putItem']>[1]) {
    const items = await this.listItems();
    const i = items.findIndex((x) => x.id === id);
    const existing = i >= 0 ? items[i] : undefined;
    if ((existing?.version ?? 0) !== item.baseVersion) throw new BackendError('This record changed. Reload and try again.', 409);
    const now = new Date().toISOString();
    const next: StoredItem = {
      id, type: item.type, scope: item.scope, ciphertext: item.ciphertext, nonce: item.nonce,
      version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    if (existing) items[i] = next;
    else items.push(next);
    await set(this.itemsKey(), items, this.store);
    return next;
  }

  async deleteItem(id: string) {
    const items = await this.listItems();
    await set(this.itemsKey(), items.filter((x) => x.id !== id), this.store);
  }

  async listFiles() {
    return (await get<StoredFile[]>(this.filesKey(), this.store)) ?? [];
  }

  async uploadFile(id: string, f: Parameters<Backend['uploadFile']>[1]) {
    if (f.bytes.length > MAX_FILE_BYTES + 64 * 1024) throw new BackendError('File is too large', 413);
    const files = await this.listFiles();
    const rec: StoredFile = { id, scope: f.scope, size: f.bytes.length, meta: f.meta, metaNonce: f.metaNonce, nonce: f.nonce, createdAt: new Date().toISOString() };
    await set(`blob:${id}`, f.bytes, this.store);
    await set(this.filesKey(), [...files, rec], this.store);
    return rec;
  }

  async fileContent(id: string) {
    this.need();
    const b = await get<Uint8Array>(`blob:${id}`, this.store);
    if (!b) throw new BackendError('File not found', 404);
    return b;
  }

  async deleteFile(id: string) {
    const files = await this.listFiles();
    await del(`blob:${id}`, this.store);
    await set(this.filesKey(), files.filter((x) => x.id !== id), this.store);
  }
}
