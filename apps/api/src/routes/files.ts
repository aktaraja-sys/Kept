import type { FastifyInstance } from 'fastify';
import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ItemId, MAX_FILE_BYTES, SCOPES } from '@kept/shared';
import { audit, requireSession } from '../app';

const b64 = z.string().min(1).max(4096).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const UploadHeaders = z.object({
  'x-kept-scope': z.enum(SCOPES),
  'x-kept-meta': b64,
  'x-kept-meta-nonce': b64,
  'x-kept-nonce': b64,
});

type Row = { id: string; user_id: string; scope: string; size: number; meta: string; meta_nonce: string; nonce: string; created_at: string };
const out = (r: Row) => ({ id: r.id, scope: r.scope, size: r.size, meta: r.meta, metaNonce: r.meta_nonce, nonce: r.nonce, createdAt: r.created_at });

export async function fileRoutes(app: FastifyInstance) {
  const db = app.db;
  // Encrypted bytes arrive as a raw body. 64 KB headroom covers AEAD overhead.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_FILE_BYTES + 64 * 1024 }, (_req, body, done) =>
    done(null, body),
  );
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/files')) return requireSession.call(app, req, reply);
  });
  const pathFor = (userId: string, id: string) => join(app.opts.filesDir, userId, `${id}.bin`);

  app.get('/api/files', async (req) => {
    const rows = db.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY created_at').all(req.userId!) as Row[];
    return { files: rows.map(out) };
  });

  app.post('/api/files/:id', { bodyLimit: MAX_FILE_BYTES + 64 * 1024 }, async (req, reply) => {
    const id = ItemId.parse((req.params as { id: string }).id);
    const h = UploadHeaders.parse(req.headers);
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.code(400).send({ error: 'Send the encrypted file as application/octet-stream' });
    if (db.prepare('SELECT 1 FROM files WHERE id = ?').get(id)) return reply.code(409).send({ error: 'File already exists' });
    mkdirSync(join(app.opts.filesDir, req.userId!), { recursive: true });
    writeFileSync(pathFor(req.userId!, id), body, { mode: 0o600 });
    db.prepare('INSERT INTO files (id, user_id, scope, size, meta, meta_nonce, nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, req.userId!, h['x-kept-scope'], body.length, h['x-kept-meta'], h['x-kept-meta-nonce'], h['x-kept-nonce'], new Date().toISOString(),
    );
    audit(db, req.userId!, `file_upload:${h['x-kept-scope']}`, req.ip);
    return reply.code(201).send(out(db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Row));
  });

  app.get('/api/files/:id/content', async (req, reply) => {
    const id = ItemId.parse((req.params as { id: string }).id);
    const row = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(id, req.userId!) as Row | undefined;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    audit(db, req.userId!, 'file_download', req.ip);
    reply.header('Content-Type', 'application/octet-stream').header('Cache-Control', 'no-store');
    return reply.send(createReadStream(pathFor(req.userId!, id)));
  });

  app.delete('/api/files/:id', async (req, reply) => {
    const id = ItemId.parse((req.params as { id: string }).id);
    const r = db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(id, req.userId!);
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    rmSync(pathFor(req.userId!, id), { force: true });
    audit(db, req.userId!, 'file_delete', req.ip);
    return { ok: true };
  });
}
