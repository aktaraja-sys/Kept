import { describe, expect, it } from 'vitest';
import {
  createVault, decryptFile, decryptFileMeta, decryptItem, deriveKeys, encryptFile, encryptFileMeta,
  encryptItem, estimateBits, generatePassword, newRecoveryKey, unwrapVaultKey, unwrapWithRecoveryKey,
} from '../src/crypto/sodium';

// Light KDF settings keep the test suite fast; production uses DEFAULT_KDF.
const FAST = { alg: 'argon2id13' as const, opslimit: 2, memlimit: 32 * 1024 * 1024 };

describe('vault keys', () => {
  it('re-derives the same keys from the password and unwraps the vault key', async () => {
    const v = await createVault('correct horse battery staple', FAST);
    const k = await deriveKeys('correct horse battery staple', v.kdfSalt, FAST);
    expect(Buffer.from(k.authKey).toString('base64')).toBe(v.authKey);
    const vk = await unwrapVaultKey(k.encKey, v.wrappedVaultKey, v.wrappedVaultKeyNonce);
    expect(Buffer.from(vk).equals(Buffer.from(v.vaultKey))).toBe(true);
  });

  it('fails with the wrong password', async () => {
    const v = await createVault('right password here', FAST);
    const k = await deriveKeys('wrong password here', v.kdfSalt, FAST);
    await expect(unwrapVaultKey(k.encKey, v.wrappedVaultKey, v.wrappedVaultKeyNonce)).rejects.toThrow(/decrypt/);
  });

  it('unwraps with the recovery key, ignoring case and dashes', async () => {
    const v = await createVault('another long password', FAST);
    const vk = await unwrapWithRecoveryKey(v.recoveryKey.toLowerCase().replace(/-/g, ''), v.recoveryWrappedVaultKey, v.recoveryWrappedVaultKeyNonce);
    expect(Buffer.from(vk).equals(Buffer.from(v.vaultKey))).toBe(true);
  });

  it('keeps the auth key independent of the encryption key', async () => {
    const v = await createVault('independent keys please', FAST);
    const k = await deriveKeys('independent keys please', v.kdfSalt, FAST);
    expect(Buffer.from(k.authKey).equals(Buffer.from(k.encKey))).toBe(false);
  });
});

describe('items', () => {
  it('round-trips and binds type and scope', async () => {
    const v = await createVault('pw for items test', FAST);
    const data = { provider: 'Aviva', reference: 'AB123' };
    const e = await encryptItem(v.vaultKey, 'item_1234567890abcdef', 'pension', 'finance', data);
    expect(e.ciphertext).not.toContain('Aviva');
    expect(await decryptItem(v.vaultKey, 'item_1234567890abcdef', 'pension', 'finance', e.ciphertext, e.nonce)).toEqual(data);
    // A server that relabels the record as health-scoped cannot make it decrypt.
    await expect(decryptItem(v.vaultKey, 'item_1234567890abcdef', 'pension', 'health', e.ciphertext, e.nonce)).rejects.toThrow();
    await expect(decryptItem(v.vaultKey, 'item_other_id_000000', 'pension', 'finance', e.ciphertext, e.nonce)).rejects.toThrow();
  });
});

describe('files', () => {
  it('encrypts bytes with a per-file key carried in encrypted metadata', async () => {
    const v = await createVault('pw for files test', FAST);
    const bytes = new TextEncoder().encode('%PDF-1.7 LPA document');
    const f = await encryptFile('file_1234567890abcdef', bytes);
    expect(Buffer.from(f.ciphertext).includes(Buffer.from('LPA document'))).toBe(false);
    const m = await encryptFileMeta(v.vaultKey, 'file_1234567890abcdef', 'health', { name: 'lpa.pdf', fileKey: f.fileKey });
    const meta = (await decryptFileMeta(v.vaultKey, 'file_1234567890abcdef', 'health', m.meta, m.metaNonce)) as { fileKey: string };
    const back = await decryptFile('file_1234567890abcdef', f.ciphertext, f.nonce, meta.fileKey);
    expect(new TextDecoder().decode(back)).toBe('%PDF-1.7 LPA document');
    await expect(decryptFileMeta(v.vaultKey, 'file_1234567890abcdef', 'finance', m.meta, m.metaNonce)).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('generates strong passwords and recovery keys', async () => {
    const p = await generatePassword(24);
    expect(p).toHaveLength(24);
    expect(estimateBits(p)).toBeGreaterThan(100);
    expect(await newRecoveryKey()).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(estimateBits('password')).toBeLessThan(40);
  });
});
