import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app';

const b64 = (n: number) => randomBytes(n).toString('base64');
const H = { 'x-kept': '1' };

function signupBody(email = 'alan@example.com', authKey = b64(32)) {
  return {
    email,
    kdfSalt: b64(16),
    kdfParams: { alg: 'argon2id13', opslimit: 3, memlimit: 64 * 1024 * 1024 },
    authKey,
    wrappedVaultKey: b64(48),
    wrappedVaultKeyNonce: b64(24),
    recoveryWrappedVaultKey: b64(48),
    recoveryWrappedVaultKeyNonce: b64(24),
  };
}

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kept-api-'));
  app = await buildApp({ dataDir: dir, secret: 'test-secret' });
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function signedIn(email = 'alan@example.com') {
  const authKey = b64(32);
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: H, payload: signupBody(email, authKey) });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === 'kept_session')!;
  return { cookie: `kept_session=${cookie.value}`, authKey };
}

describe('auth', () => {
  it('signs up, signs in and returns the wrapped vault key', async () => {
    const body = signupBody();
    const s = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: H, payload: body });
    expect(s.statusCode).toBe(201);
    const c = s.cookies.find((x) => x.name === 'kept_session')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');

    const pre = await app.inject({ method: 'GET', url: '/api/auth/prelogin?email=Alan@Example.com' });
    expect(pre.json().kdfSalt).toBe(body.kdfSalt);

    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: body.email, authKey: body.authKey } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().wrappedVaultKey).toBe(body.wrappedVaultKey);

    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: body.email, authKey: b64(32) } });
    expect(bad.statusCode).toBe(401);
  });

  it('rejects a duplicate email', async () => {
    await signedIn();
    const again = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: H, payload: signupBody() });
    expect(again.statusCode).toBe(409);
  });

  it('returns a stable fake salt for unknown emails', async () => {
    const a = await app.inject({ method: 'GET', url: '/api/auth/prelogin?email=nobody@example.com' });
    const b = await app.inject({ method: 'GET', url: '/api/auth/prelogin?email=nobody@example.com' });
    expect(a.statusCode).toBe(200);
    expect(a.json().kdfSalt).toBe(b.json().kdfSalt);
  });

  it('rate limits repeated failed logins', async () => {
    await signedIn();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: 'alan@example.com', authKey: b64(32) } })).statusCode;
    }
    expect(last).toBe(429);
  });

  it('requires the X-Kept header on writes', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: signupBody() });
    expect(r.statusCode).toBe(403);
  });

  it('logs out and invalidates the session', async () => {
    const { cookie } = await signedIn();
    expect((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...H, cookie } });
    expect((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('items', () => {
  const item = (baseVersion = 0) => ({ type: 'pension', scope: 'finance', ciphertext: b64(80), nonce: b64(24), baseVersion });

  it('creates, updates with versioning, lists and deletes', async () => {
    const { cookie } = await signedIn();
    const id = 'item_' + randomBytes(12).toString('hex');
    const c = await app.inject({ method: 'PUT', url: `/api/items/${id}`, headers: { ...H, cookie }, payload: item(0) });
    expect(c.statusCode).toBe(200);
    expect(c.json().version).toBe(1);
    const stale = await app.inject({ method: 'PUT', url: `/api/items/${id}`, headers: { ...H, cookie }, payload: item(0) });
    expect(stale.statusCode).toBe(409);
    const u = await app.inject({ method: 'PUT', url: `/api/items/${id}`, headers: { ...H, cookie }, payload: item(1) });
    expect(u.json().version).toBe(2);
    const list = await app.inject({ method: 'GET', url: '/api/items', headers: { cookie } });
    expect(list.json().items).toHaveLength(1);
    const d = await app.inject({ method: 'DELETE', url: `/api/items/${id}`, headers: { ...H, cookie } });
    expect(d.statusCode).toBe(200);
  });

  it("keeps one user's items away from another", async () => {
    const a = await signedIn('a@example.com');
    const b = await signedIn('b@example.com');
    const id = 'item_' + randomBytes(12).toString('hex');
    await app.inject({ method: 'PUT', url: `/api/items/${id}`, headers: { ...H, cookie: a.cookie }, payload: item(0) });
    const steal = await app.inject({ method: 'PUT', url: `/api/items/${id}`, headers: { ...H, cookie: b.cookie }, payload: item(1) });
    expect(steal.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/items', headers: { cookie: b.cookie } })).json().items).toHaveLength(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/items/${id}`, headers: { ...H, cookie: b.cookie } })).statusCode).toBe(404);
  });

  it('rejects requests without a session and invalid bodies', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/items' })).statusCode).toBe(401);
    const { cookie } = await signedIn();
    const bad = await app.inject({ method: 'PUT', url: '/api/items/short', headers: { ...H, cookie }, payload: item(0) });
    expect(bad.statusCode).toBe(400);
    const badType = await app.inject({ method: 'PUT', url: `/api/items/${'x'.repeat(20)}`, headers: { ...H, cookie }, payload: { ...item(0), type: 'nope' } });
    expect(badType.statusCode).toBe(400);
  });
});

describe('files', () => {
  it('uploads, lists, downloads and deletes encrypted bytes', async () => {
    const { cookie } = await signedIn();
    const id = 'file_' + randomBytes(12).toString('hex');
    const bytes = randomBytes(2048);
    const up = await app.inject({
      method: 'POST', url: `/api/files/${id}`, payload: bytes,
      headers: { ...H, cookie, 'content-type': 'application/octet-stream', 'x-kept-scope': 'health', 'x-kept-meta': b64(100), 'x-kept-meta-nonce': b64(24), 'x-kept-nonce': b64(24) },
    });
    expect(up.statusCode).toBe(201);
    expect(up.json().scope).toBe('health');
    const list = await app.inject({ method: 'GET', url: '/api/files', headers: { cookie } });
    expect(list.json().files[0].size).toBe(2048);
    const dl = await app.inject({ method: 'GET', url: `/api/files/${id}/content`, headers: { cookie } });
    expect(Buffer.compare(dl.rawPayload, bytes)).toBe(0);
    const other = await signedIn('eve@example.com');
    expect((await app.inject({ method: 'GET', url: `/api/files/${id}/content`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${id}`, headers: { ...H, cookie } })).statusCode).toBe(200);
  });

  it('rejects an unknown scope', async () => {
    const { cookie } = await signedIn();
    const r = await app.inject({
      method: 'POST', url: `/api/files/${'f'.repeat(20)}`, payload: randomBytes(10),
      headers: { ...H, cookie, 'content-type': 'application/octet-stream', 'x-kept-scope': 'secret', 'x-kept-meta': b64(10), 'x-kept-meta-nonce': b64(24), 'x-kept-nonce': b64(24) },
    });
    expect(r.statusCode).toBe(400);
  });
});
