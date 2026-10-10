import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: Buffer, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/** Server-side hardening of the client's auth key (already Argon2id-stretched on the device). */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashAuthKey(authKeyB64: string, saltB64?: string) {
  const salt = saltB64 ? Buffer.from(saltB64, 'base64') : randomBytes(16);
  const hash = await scrypt(Buffer.from(authKeyB64, 'base64'), salt, 32, SCRYPT);
  return { hash: hash.toString('base64'), salt: salt.toString('base64') };
}

export async function verifyAuthKey(authKeyB64: string, hashB64: string, saltB64: string) {
  const { hash } = await hashAuthKey(authKeyB64, saltB64);
  const a = Buffer.from(hash, 'base64');
  const b = Buffer.from(hashB64, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newId = () => randomBytes(18).toString('base64url');
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64');

/** Deterministic fake salt so unknown emails look the same as real ones at pre-login. */
export function fakeSalt(secret: string, email: string) {
  return createHmac('sha256', secret).update(`prelogin|${email}`).digest().subarray(0, 16).toString('base64');
}

/** Small fixed-window rate limiter. Good enough for one instance; use Redis when scaled out. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs: number) {}
  /** Returns true if the action is allowed. */
  take(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.reset <= now) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    h.n += 1;
    return h.n <= this.limit;
  }
  clear(key: string) {
    this.hits.delete(key);
  }
}
