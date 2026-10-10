import _sodium from 'libsodium-wrappers-sumo';
import type { KdfParams } from '@kept/shared';

/*
 * All encryption happens here, on the user's device. See docs/SECURITY.md for the design.
 * Nothing in this file talks to the network.
 */

let ready: Promise<typeof _sodium> | null = null;
export function sodium() {
  if (!ready) ready = _sodium.ready.then(() => _sodium);
  return ready;
}

export const DEFAULT_KDF: KdfParams = { alg: 'argon2id13', opslimit: 3, memlimit: 64 * 1024 * 1024 };

export async function toB64(bytes: Uint8Array) {
  const s = await sodium();
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}
export async function fromB64(text: string) {
  const s = await sodium();
  return s.from_base64(text, s.base64_variants.ORIGINAL);
}
export async function randomId(prefix: string) {
  const s = await sodium();
  return `${prefix}_${s.to_base64(s.randombytes_buf(18), s.base64_variants.URLSAFE_NO_PADDING)}`;
}

export type DerivedKeys = { authKey: Uint8Array; encKey: Uint8Array };

/** Stretch the master password with Argon2id, then split it into an auth key and an encryption key. */
export async function deriveKeys(password: string, saltB64: string, params: KdfParams): Promise<DerivedKeys> {
  const s = await sodium();
  const master = s.crypto_pwhash(32, password, await fromB64(saltB64), params.opslimit, params.memlimit, s.crypto_pwhash_ALG_ARGON2ID13);
  const authKey = s.crypto_kdf_derive_from_key(32, 1, 'keptauth', master);
  const encKey = s.crypto_kdf_derive_from_key(32, 2, 'keptencr', master);
  s.memzero(master);
  return { authKey, encKey };
}

export async function seal(key: Uint8Array, plaintext: Uint8Array, aad: string) {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key);
  return { ciphertext: ct, nonce };
}

export async function open(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, aad: string) {
  const s = await sodium();
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key);
  } catch {
    throw new Error('Could not decrypt: wrong key or the data was changed');
  }
}

/** Recovery key: 20 random bytes shown to the user as 8 groups of base32. */
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export async function newRecoveryKey() {
  const s = await sodium();
  const bytes = s.randombytes_buf(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g)!.join('-');
}
async function recoveryWrapKey(recoveryKey: string) {
  const s = await sodium();
  return s.crypto_generichash(32, recoveryKey.replace(/-/g, '').toUpperCase(), 'kept-recovery-v1');
}

export type NewVault = {
  kdfSalt: string;
  authKey: string;
  vaultKey: Uint8Array;
  wrappedVaultKey: string;
  wrappedVaultKeyNonce: string;
  recoveryWrappedVaultKey: string;
  recoveryWrappedVaultKeyNonce: string;
  recoveryKey: string;
};

/** Everything needed to create an account. The vault key and recovery key never leave the device. */
export async function createVault(password: string, params: KdfParams = DEFAULT_KDF): Promise<NewVault> {
  const s = await sodium();
  const kdfSalt = await toB64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
  const { authKey, encKey } = await deriveKeys(password, kdfSalt, params);
  const vaultKey = s.randombytes_buf(32);
  const w = await seal(encKey, vaultKey, 'kept:vaultkey:v1');
  const recoveryKey = await newRecoveryKey();
  const r = await seal(await recoveryWrapKey(recoveryKey), vaultKey, 'kept:vaultkey:recovery:v1');
  s.memzero(encKey);
  return {
    kdfSalt,
    authKey: await toB64(authKey),
    vaultKey,
    wrappedVaultKey: await toB64(w.ciphertext),
    wrappedVaultKeyNonce: await toB64(w.nonce),
    recoveryWrappedVaultKey: await toB64(r.ciphertext),
    recoveryWrappedVaultKeyNonce: await toB64(r.nonce),
    recoveryKey,
  };
}

export async function unwrapVaultKey(encKey: Uint8Array, wrapped: string, nonce: string) {
  return open(encKey, await fromB64(wrapped), await fromB64(nonce), 'kept:vaultkey:v1');
}
export async function unwrapWithRecoveryKey(recoveryKey: string, wrapped: string, nonce: string) {
  return open(await recoveryWrapKey(recoveryKey), await fromB64(wrapped), await fromB64(nonce), 'kept:vaultkey:recovery:v1');
}

const itemAad = (id: string, type: string, scope: string) => `kept:item:v1|${id}|${type}|${scope}`;

export async function encryptItem(vaultKey: Uint8Array, id: string, type: string, scope: string, data: unknown) {
  const s = await sodium();
  const { ciphertext, nonce } = await seal(vaultKey, s.from_string(JSON.stringify(data)), itemAad(id, type, scope));
  return { ciphertext: await toB64(ciphertext), nonce: await toB64(nonce) };
}
export async function decryptItem(vaultKey: Uint8Array, id: string, type: string, scope: string, ciphertext: string, nonce: string) {
  const s = await sodium();
  const pt = await open(vaultKey, await fromB64(ciphertext), await fromB64(nonce), itemAad(id, type, scope));
  return JSON.parse(s.to_string(pt)) as unknown;
}

/** Encrypt a file with its own key; the key travels inside the (vault-key-encrypted) metadata. */
export async function encryptFile(id: string, bytes: Uint8Array) {
  const s = await sodium();
  const fileKey = s.randombytes_buf(32);
  const { ciphertext, nonce } = await seal(fileKey, bytes, `kept:file:v1|${id}`);
  return { ciphertext, nonce: await toB64(nonce), fileKey: await toB64(fileKey) };
}
export async function decryptFile(id: string, ciphertext: Uint8Array, nonceB64: string, fileKeyB64: string) {
  return open(await fromB64(fileKeyB64), ciphertext, await fromB64(nonceB64), `kept:file:v1|${id}`);
}
export async function encryptFileMeta(vaultKey: Uint8Array, id: string, scope: string, meta: unknown) {
  const s = await sodium();
  const { ciphertext, nonce } = await seal(vaultKey, s.from_string(JSON.stringify(meta)), `kept:filemeta:v1|${id}|${scope}`);
  return { meta: await toB64(ciphertext), metaNonce: await toB64(nonce) };
}
export async function decryptFileMeta(vaultKey: Uint8Array, id: string, scope: string, meta: string, metaNonce: string) {
  const s = await sodium();
  const pt = await open(vaultKey, await fromB64(meta), await fromB64(metaNonce), `kept:filemeta:v1|${id}|${scope}`);
  return JSON.parse(s.to_string(pt)) as unknown;
}

/** Password generator: rejection sampling over a readable alphabet. */
export async function generatePassword(length = 20) {
  const s = await sodium();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_';
  let out = '';
  while (out.length < length) {
    const b = s.randombytes_uniform(alphabet.length);
    out += alphabet[b];
  }
  return out;
}

/** Rough strength estimate (bits) for the master password meter. Not a substitute for zxcvbn. */
export function estimateBits(pw: string) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const unique = new Set(pw).size;
  return Math.round(Math.min(pw.length, unique * 1.5) * Math.log2(Math.max(pool, 1)));
}
