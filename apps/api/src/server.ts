import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { buildApp } from './app';

const production = process.env.NODE_ENV === 'production';
let secret = process.env.SERVER_SECRET ?? '';
if (!secret) {
  if (production) throw new Error('SERVER_SECRET must be set in production');
  secret = randomBytes(32).toString('base64');
  console.warn('SERVER_SECRET not set; using a random one for this run (development only).');
}

const app = await buildApp({
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  secret,
  production,
  webDist: resolve(process.env.WEB_DIST ?? '../web/dist'),
  logger: true,
});
await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '127.0.0.1' });
