import type { FastifyInstance } from 'fastify';
import { ItemId, PutItemRequest } from '@kept/shared';
import { audit, requireSession } from '../app';

type Row = {
  id: string; user_id: string; type: string; scope: string; ciphertext: string; nonce: string;
  version: number; created_at: string; updated_at: string;
};
const out = (r: Row) => ({
  id: r.id, type: r.type, scope: r.scope, ciphertext: r.ciphertext, nonce: r.nonce,
  version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function itemRoutes(app: FastifyInstance) {
  const db = app.db;
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/items')) return requireSession.call(app, req, reply);
  });

  app.get('/api/items', async (req) => {
    const rows = db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at').all(req.userId!) as Row[];
    return { items: rows.map(out) };
  });

  app.put('/api/items/:id', async (req, reply) => {
    const id = ItemId.parse((req.params as { id: string }).id);
    const body = PutItemRequest.parse(req.body);
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Row | undefined;
    const now = new Date().toISOString();
    if (existing && existing.user_id !== req.userId) return reply.code(404).send({ error: 'Not found' });
    if ((existing?.version ?? 0) !== body.baseVersion) {
      return reply.code(409).send({ error: 'This record changed on another device. Reload and try again.' });
    }
    if (existing) {
      db.prepare('UPDATE items SET type = ?, scope = ?, ciphertext = ?, nonce = ?, version = version + 1, updated_at = ? WHERE id = ?')
        .run(body.type, body.scope, body.ciphertext, body.nonce, now, id);
    } else {
      db.prepare('INSERT INTO items (id, user_id, type, scope, ciphertext, nonce, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .run(id, req.userId!, body.type, body.scope, body.ciphertext, body.nonce, now, now);
    }
    audit(db, req.userId!, existing ? `item_update:${body.type}` : `item_create:${body.type}`, req.ip);
    return out(db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Row);
  });

  app.delete('/api/items/:id', async (req, reply) => {
    const id = ItemId.parse((req.params as { id: string }).id);
    const r = db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(id, req.userId!);
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    audit(db, req.userId!, 'item_delete', req.ip);
    return { ok: true };
  });
}
