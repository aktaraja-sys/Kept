import { z } from 'zod';

/** Base64 (standard alphabet) string with a sensible upper bound. */
const b64 = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');

export const ITEM_TYPES = ['login', 'pension', 'life_insurance', 'lpa'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Scope decides who a record can later be released to. See docs/SECURITY.md. */
export const SCOPES = ['general', 'finance', 'health'] as const;
export type Scope = (typeof SCOPES)[number];

export const KdfParams = z.object({
  alg: z.literal('argon2id13'),
  opslimit: z.number().int().min(2).max(10),
  memlimit: z.number().int().min(32 * 1024 * 1024).max(1024 * 1024 * 1024),
});
export type KdfParams = z.infer<typeof KdfParams>;

export const Email = z.string().trim().toLowerCase().email().max(254);

export const SignupRequest = z.object({
  email: Email,
  kdfSalt: b64(64),
  kdfParams: KdfParams,
  authKey: b64(64),
  wrappedVaultKey: b64(256),
  wrappedVaultKeyNonce: b64(64),
  recoveryWrappedVaultKey: b64(256),
  recoveryWrappedVaultKeyNonce: b64(64),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const PreloginResponse = z.object({ kdfSalt: z.string(), kdfParams: KdfParams });
export type PreloginResponse = z.infer<typeof PreloginResponse>;

export const LoginRequest = z.object({ email: Email, authKey: b64(64) });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const SessionResponse = z.object({
  email: z.string(),
  wrappedVaultKey: z.string(),
  wrappedVaultKeyNonce: z.string(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const ItemId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const PutItemRequest = z.object({
  type: z.enum(ITEM_TYPES),
  scope: z.enum(SCOPES),
  ciphertext: b64(256 * 1024),
  nonce: b64(64),
  /** Optimistic concurrency: the version the client last saw (0 for a new item). */
  baseVersion: z.number().int().min(0),
});
export type PutItemRequest = z.infer<typeof PutItemRequest>;

export const StoredItem = z.object({
  id: z.string(),
  type: z.enum(ITEM_TYPES),
  scope: z.enum(SCOPES),
  ciphertext: z.string(),
  nonce: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoredItem = z.infer<typeof StoredItem>;

export const StoredFile = z.object({
  id: z.string(),
  scope: z.enum(SCOPES),
  size: z.number(),
  meta: z.string(),
  metaNonce: z.string(),
  nonce: z.string(),
  createdAt: z.string(),
});
export type StoredFile = z.infer<typeof StoredFile>;

/** Largest file a user may upload, before encryption overhead. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
