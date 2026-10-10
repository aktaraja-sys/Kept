import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ZodError } from 'zod';
import { openDb, type Db } from './db';
import { sha256 } from './security';
import { authRoutes } from './routes/auth';
import { itemRoutes } from './routes/items';
import { fileRoutes } from './routes/files';

export type AppOptions = {
  dataDir: string; // ':memory:' style dirs are not supported; tests use a temp dir
  secret: string;
  production?: boolean;
  webDist?: string;
  logger?: boolean;
};

export const SESSION_COOKIE = 'kept_session';
export const SESSION_HOURS = 12;

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    opts: AppOptions & { filesDir: string };
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 512 * 1024, trustProxy: true });
  const filesDir = join(opts.dataDir, 'files');
  mkdirSync(filesDir, { recursive: true });
  app.decorate('db', openDb(join(opts.dataDir, 'kept.sqlite')));
  app.decorate('opts', { ...opts, filesDir });
  app.addHook('onClose', async () => app.db.close());

  await app.register(cookie);

  // Security headers on every response.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
        "base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (opts.production) reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    return payload;
  });

  // CSRF defence in depth: SameSite=Strict cookies plus a custom header browsers won't send cross-site.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['x-kept'] !== '1') {
      return reply.code(403).send({ error: 'Missing X-Kept header' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: err.issues.map((i) => i.path.join('.') + ': ' + i.message) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const message = err instanceof Error ? err.message : 'Request failed';
    return reply.code(status).send({ error: status >= 500 ? 'Something went wrong' : message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(itemRoutes);
  await app.register(fileRoutes);

  if (opts.webDist && existsSync(opts.webDist)) {
    await app.register(fastifyStatic, { root: resolve(opts.webDist), wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

/** preHandler that requires a valid session and sets req.userId. */
export async function requireSession(this: unknown, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return reply.code(401).send({ error: 'Not signed in' });
  const db = req.server.db;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token)) as
    | { user_id: string; expires_at: string }
    | undefined;
  if (!row || row.expires_at < new Date().toISOString()) {
    return reply.code(401).send({ error: 'Session expired' });
  }
  req.userId = row.user_id;
}

export function audit(db: Db, userId: string | null, event: string, ip?: string) {
  db.prepare('INSERT INTO audit (user_id, at, event, ip) VALUES (?, ?, ?, ?)').run(userId, new Date().toISOString(), event, ip ?? null);
}
