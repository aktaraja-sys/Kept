import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DeviceBackend } from '../src/backend/device';
import { createVault, deriveKeys, encryptItem, unwrapVaultKey } from '../src/crypto/sodium';

const FAST = { alg: 'argon2id13' as const, opslimit: 2, memlimit: 32 * 1024 * 1024 };

async function setup(name: string) {
  const b = new DeviceBackend(name);
  const v = await createVault('device backend password', FAST);
  await b.signup({
    email: 'Alan@Example.com', kdfSalt: v.kdfSalt, kdfParams: FAST, authKey: v.authKey,
    wrappedVaultKey: v.wrappedVaultKey, wrappedVaultKeyNonce: v.wrappedVaultKeyNonce,
    recoveryWrappedVaultKey: v.recoveryWrappedVaultKey, recoveryWrappedVaultKeyNonce: v.recoveryWrappedVaultKeyNonce,
  });
  return { b, v };
}

describe('DeviceBackend (Android preview storage)', () => {
  it('signs in with the right key only and returns a working wrapped vault key', async () => {
    const { b, v } = await setup('t1');
    await b.logout();
    const pre = await b.prelogin('alan@example.com');
    const k = await deriveKeys('device backend password', pre.kdfSalt, pre.kdfParams);
    const res = await b.login('alan@example.com', Buffer.from(k.authKey).toString('base64'));
    const vk = await unwrapVaultKey(k.encKey, res.wrappedVaultKey, res.wrappedVaultKeyNonce);
    expect(Buffer.from(vk).equals(Buffer.from(v.vaultKey))).toBe(true);
    const bad = await deriveKeys('wrong password entirely', pre.kdfSalt, pre.kdfParams);
    await expect(b.login('alan@example.com', Buffer.from(bad.authKey).toString('base64'))).rejects.toThrow(/wrong/);
  });

  it('stores items with version checks and keeps them per account', async () => {
    const { b, v } = await setup('t2');
    const e = await encryptItem(v.vaultKey, 'item_aaaaaaaaaaaaaaaa', 'login', 'general', { title: 'Gmail' });
    const s1 = await b.putItem('item_aaaaaaaaaaaaaaaa', { type: 'login', scope: 'general', ...e, baseVersion: 0 });
    expect(s1.version).toBe(1);
    await expect(b.putItem('item_aaaaaaaaaaaaaaaa', { type: 'login', scope: 'general', ...e, baseVersion: 0 })).rejects.toThrow();
    expect(await b.listItems()).toHaveLength(1);
    await b.deleteItem('item_aaaaaaaaaaaaaaaa');
    expect(await b.listItems()).toHaveLength(0);
  });

  it('stores and deletes encrypted files', async () => {
    const { b } = await setup('t3');
    await b.uploadFile('file_aaaaaaaaaaaaaaaa', { scope: 'health', meta: 'bWV0YQ==', metaNonce: 'bm9uY2U=', nonce: 'bm9uY2U=', bytes: new Uint8Array([1, 2, 3]) });
    expect((await b.listFiles())[0]?.scope).toBe('health');
    expect(Array.from(await b.fileContent('file_aaaaaaaaaaaaaaaa'))).toEqual([1, 2, 3]);
    await b.deleteFile('file_aaaaaaaaaaaaaaaa');
    expect(await b.listFiles()).toHaveLength(0);
  });

  it('refuses access when signed out', async () => {
    const { b } = await setup('t4');
    await b.logout();
    await expect(b.listItems()).rejects.toThrow(/Not signed in/);
  });
});
