import type { FastifyInstance } from 'fastify';
import { Email, LoginRequest, SignupRequest, type KdfParams } from '@kept/shared';
import { audit, requireSession, SESSION_COOKIE, SESSION_HOURS } from '../app';
import { fakeSalt, hashAuthKey, newId, newToken, RateLimiter, sha256, verifyAuthKey } from '../security';

const DEFAULT_KDF: KdfParams = { alg: 'argon2id13', opslimit: 3, memlimit: 64 * 1024 * 1024 };

type UserRow = {
  id: string;
  email: string;
  kdf_salt: string;
  kdf_params: string;
  auth_hash: string;
  auth_salt: string;
  wrapped_vault_key: string;
  wrapped_vault_key_nonce: string;
};

export async function authRoutes(app: FastifyInstance) {
  const byEmail = new RateLimiter(10, 15 * 60 * 1000);
  const byIp = new RateLimiter(60, 15 * 60 * 1000);
  const db = app.db;

  const setSession = (reply: import('fastify').FastifyReply, userId: string) => {
    const token = newToken();
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      sha256(token), userId, now.toISOString(), expires.toISOString(),
    );
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/api',
      httpOnly: true,
      sameSite: 'strict',
      secure: !!app.opts.production,
      maxAge: SESSION_HOURS * 3600,
    });
  };

  app.post('/api/auth/signup', async (req, reply) => {
    if (!byIp.take(`signup|${req.ip}`)) return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
    const body = SignupRequest.parse(req.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email);
    if (exists) return reply.code(409).send({ error: 'An account with this email already exists' });
    const { hash, salt } = await hashAuthKey(body.authKey);
    const id = newId();
    db.prepare(
      `INSERT INTO users (id, email, kdf_salt, kdf_params, auth_hash, auth_salt, wrapped_vault_key,
        wrapped_vault_key_nonce, recovery_wrapped_vault_key, recovery_wrapped_vault_key_nonce, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, body.email, body.kdfSalt, JSON.stringify(body.kdfParams), hash, salt, body.wrappedVaultKey,
      body.wrappedVaultKeyNonce, body.recoveryWrappedVaultKey, body.recoveryWrappedVaultKeyNonce, new Date().toISOString(),
    );
    audit(db, id, 'signup', req.ip);
    setSession(reply, id);
    return reply.code(201).send({ email: body.email, wrappedVaultKey: body.wrappedVaultKey, wrappedVaultKeyNonce: body.wrappedVaultKeyNonce });
  });

  app.get('/api/auth/prelogin', async (req, reply) => {
    const email = Email.parse((req.query as { email?: string }).email);
    if (!byIp.take(`prelogin|${req.ip}`)) return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
    const row = db.prepare('SELECT kdf_salt, kdf_params FROM users WHERE email = ?').get(email) as
      | { kdf_salt: string; kdf_params: string }
      | undefined;
    if (!row) return { kdfSalt: fakeSalt(app.opts.secret, email), kdfParams: DEFAULT_KDF };
    return { kdfSalt: row.kdf_salt, kdfParams: JSON.parse(row.kdf_params) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = LoginRequest.parse(req.body);
    if (!byIp.take(`login|${req.ip}`) || !byEmail.take(body.email)) {
      return reply.code(429).send({ error: 'Too many attempts. Wait 15 minutes and try again.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as UserRow | undefined;
    // Always do the expensive hash so timing doesn't reveal whether the account exists.
    const ok = user
      ? await verifyAuthKey(body.authKey, user.auth_hash, user.auth_salt)
      : (await hashAuthKey(body.authKey), false);
    if (!user || !ok) {
      audit(db, user?.id ?? null, 'login_failed', req.ip);
      return reply.code(401).send({ error: 'Email or master password is wrong' });
    }
    byEmail.clear(body.email);
    audit(db, user.id, 'login', req.ip);
    setSession(reply, user.id);
    return { email: user.email, wrappedVaultKey: user.wrapped_vault_key, wrappedVaultKeyNonce: user.wrapped_vault_key_nonce };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    reply.clearCookie(SESSION_COOKIE, { path: '/api' });
    return { ok: true };
  });

  app.get('/api/auth/session', { preHandler: requireSession }, async (req) => {
    const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId!) as { email: string };
    return { email: u.email };
  });
}
