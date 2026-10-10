import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Development database: Node's built-in SQLite. Production should move to Postgres with
 * encryption at rest (see docs/ROADMAP.md). Everything sensitive arriving here is already
 * ciphertext; this layer never sees plaintext vault contents.
 */
export type Db = DatabaseSync;

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     kdf_salt TEXT NOT NULL,
     kdf_params TEXT NOT NULL,
     auth_hash TEXT NOT NULL,
     auth_salt TEXT NOT NULL,
     wrapped_vault_key TEXT NOT NULL,
     wrapped_vault_key_nonce TEXT NOT NULL,
     recovery_wrapped_vault_key TEXT NOT NULL,
     recovery_wrapped_vault_key_nonce TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`,
  `CREATE TABLE items (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     scope TEXT NOT NULL,
     ciphertext TEXT NOT NULL,
     nonce TEXT NOT NULL,
     version INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX items_user ON items(user_id)`,
  `CREATE TABLE files (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     scope TEXT NOT NULL,
     size INTEGER NOT NULL,
     meta TEXT NOT NULL,
     meta_nonce TEXT NOT NULL,
     nonce TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX files_user ON files(user_id)`,
  `CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT,
     at TEXT NOT NULL,
     event TEXT NOT NULL,
     ip TEXT
   )`,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = db.prepare('SELECT v FROM schema_version').get() as { v: number } | undefined;
  let v = row?.v ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  for (; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]!);
    db.prepare('UPDATE schema_version SET v = ?').run(v + 1);
  }
  return db;
}
