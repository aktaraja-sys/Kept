import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileMeta, ITEM_SCHEMAS, scopeFor, type DocCategory, type ItemData, type ItemType, type Scope, type StoredFile } from '@kept/shared';
import { createBackend, type Backend } from './backend';
import {
  createVault, decryptFile, decryptFileMeta, decryptItem, deriveKeys, encryptFile, encryptFileMeta,
  encryptItem, randomId, unwrapVaultKey,
} from './crypto/sodium';

export type VaultItem<T extends ItemType = ItemType> = {
  id: string;
  type: T;
  scope: Scope;
  version: number;
  updatedAt: string;
  data: ItemData[T];
};
export type VaultFile = { id: string; scope: Scope; createdAt: string; nonce: string; meta: FileMeta };

type State =
  | { status: 'locked' }
  | { status: 'unlocked'; email: string; items: VaultItem[]; files: VaultFile[] };

type VaultApi = {
  state: State;
  backendKind: Backend['kind'];
  signup(email: string, password: string): Promise<{ recoveryKey: string }>;
  login(email: string, password: string): Promise<void>;
  lock(): Promise<void>;
  saveItem<T extends ItemType>(type: T, data: ItemData[T], existing?: VaultItem<T>): Promise<VaultItem<T>>;
  deleteItem(id: string): Promise<void>;
  uploadFile(file: File, opts: { scope: Scope; category: DocCategory; linkedItemId?: string }): Promise<VaultFile>;
  openFile(f: VaultFile): Promise<Blob>;
  deleteFile(id: string): Promise<void>;
};

const Ctx = createContext<VaultApi | null>(null);
export const IDLE_LOCK_MS = 10 * 60 * 1000;

export function VaultProvider({ children, backend: injected }: { children: ReactNode; backend?: Backend }) {
  const backend = useMemo(() => injected ?? createBackend(), [injected]);
  const [state, setState] = useState<State>({ status: 'locked' });
  // The vault key lives only in memory, outside React state, and is wiped on lock.
  const keyRef = useRef<Uint8Array | null>(null);

  const loadAll = useCallback(async (email: string) => {
    const key = keyRef.current!;
    const [rawItems, rawFiles] = await Promise.all([backend.listItems(), backend.listFiles()]);
    const items: VaultItem[] = [];
    for (const r of rawItems) {
      const data = await decryptItem(key, r.id, r.type, r.scope, r.ciphertext, r.nonce);
      items.push({ id: r.id, type: r.type, scope: r.scope, version: r.version, updatedAt: r.updatedAt, data: ITEM_SCHEMAS[r.type].parse(data) as never });
    }
    const files: VaultFile[] = [];
    for (const f of rawFiles as StoredFile[]) {
      const meta = FileMeta.parse(await decryptFileMeta(key, f.id, f.scope, f.meta, f.metaNonce));
      files.push({ id: f.id, scope: f.scope, createdAt: f.createdAt, nonce: f.nonce, meta });
    }
    setState({ status: 'unlocked', email, items, files });
  }, [backend]);

  const signup = useCallback(async (email: string, password: string) => {
    const v = await createVault(password);
    const res = await backend.signup({
      email,
      kdfSalt: v.kdfSalt,
      kdfParams: { alg: 'argon2id13', opslimit: 3, memlimit: 64 * 1024 * 1024 },
      authKey: v.authKey,
      wrappedVaultKey: v.wrappedVaultKey,
      wrappedVaultKeyNonce: v.wrappedVaultKeyNonce,
      recoveryWrappedVaultKey: v.recoveryWrappedVaultKey,
      recoveryWrappedVaultKeyNonce: v.recoveryWrappedVaultKeyNonce,
    });
    keyRef.current = v.vaultKey;
    await loadAll(res.email);
    return { recoveryKey: v.recoveryKey };
  }, [backend, loadAll]);

  const login = useCallback(async (email: string, password: string) => {
    const pre = await backend.prelogin(email.trim().toLowerCase());
    const { authKey, encKey } = await deriveKeys(password, pre.kdfSalt, pre.kdfParams);
    const authB64 = btoa(String.fromCharCode(...authKey));
    const res = await backend.login(email.trim().toLowerCase(), authB64);
    keyRef.current = await unwrapVaultKey(encKey, res.wrappedVaultKey, res.wrappedVaultKeyNonce);
    encKey.fill(0);
    await loadAll(res.email);
  }, [backend, loadAll]);

  const lock = useCallback(async () => {
    keyRef.current?.fill(0);
    keyRef.current = null;
    setState({ status: 'locked' });
    await backend.logout();
  }, [backend]);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (state.status !== 'unlocked') return;
    let t = setTimeout(lock, IDLE_LOCK_MS);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(lock, IDLE_LOCK_MS);
    };
    const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [state.status, lock]);

  const need = () => {
    if (!keyRef.current || state.status !== 'unlocked') throw new Error('Vault is locked');
    return keyRef.current;
  };

  const saveItem = useCallback(async <T extends ItemType>(type: T, raw: ItemData[T], existing?: VaultItem<T>) => {
    const key = need();
    const data = ITEM_SCHEMAS[type].parse(raw) as ItemData[T];
    const id = existing?.id ?? (await randomId('item'));
    const scope = scopeFor(type, data);
    const enc = await encryptItem(key, id, type, scope, data);
    const stored = await backend.putItem(id, { type, scope, ...enc, baseVersion: existing?.version ?? 0 });
    const item: VaultItem<T> = { id, type, scope, version: stored.version, updatedAt: stored.updatedAt, data };
    setState((s) => (s.status !== 'unlocked' ? s : { ...s, items: [...s.items.filter((x) => x.id !== id), item as VaultItem] }));
    return item;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, state.status]);

  const deleteItem = useCallback(async (id: string) => {
    need();
    await backend.deleteItem(id);
    setState((s) => (s.status !== 'unlocked' ? s : { ...s, items: s.items.filter((x) => x.id !== id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, state.status]);

  const uploadFile = useCallback(async (file: File, opts: { scope: Scope; category: DocCategory; linkedItemId?: string }) => {
    const key = need();
    const id = await randomId('file');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const enc = await encryptFile(id, bytes);
    const meta: FileMeta = { name: file.name, mime: file.type || 'application/octet-stream', size: bytes.length, category: opts.category, linkedItemId: opts.linkedItemId, fileKey: enc.fileKey };
    const m = await encryptFileMeta(key, id, opts.scope, meta);
    const stored = await backend.uploadFile(id, { scope: opts.scope, meta: m.meta, metaNonce: m.metaNonce, nonce: enc.nonce, bytes: enc.ciphertext });
    bytes.fill(0);
    const vf: VaultFile = { id, scope: opts.scope, createdAt: stored.createdAt, nonce: enc.nonce, meta };
    setState((s) => (s.status !== 'unlocked' ? s : { ...s, files: [...s.files, vf] }));
    return vf;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, state.status]);

  const openFile = useCallback(async (f: VaultFile) => {
    need();
    const ct = await backend.fileContent(f.id);
    const pt = await decryptFile(f.id, ct, f.nonce, f.meta.fileKey);
    return new Blob([pt as BlobPart], { type: f.meta.mime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, state.status]);

  const deleteFile = useCallback(async (id: string) => {
    need();
    await backend.deleteFile(id);
    setState((s) => (s.status !== 'unlocked' ? s : { ...s, files: s.files.filter((x) => x.id !== id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, state.status]);

  const api: VaultApi = { state, backendKind: backend.kind, signup, login, lock, saveItem, deleteItem, uploadFile, openFile, deleteFile };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useVault() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault outside VaultProvider');
  return v;
}

export function useUnlocked() {
  const v = useVault();
  if (v.state.status !== 'unlocked') throw new Error('Vault is locked');
  return { ...v, state: v.state };
}
