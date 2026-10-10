import type { ItemType, KdfParams, PreloginResponse, Scope, SessionResponse, SignupRequest, StoredFile, StoredItem } from '@kept/shared';

/**
 * Where encrypted data lives. Both implementations only ever handle ciphertext.
 * - RemoteBackend: the Kept API (web, and Android once a server is hosted).
 * - DeviceBackend: IndexedDB on this device only (Android preview builds).
 */
export interface Backend {
  readonly kind: 'remote' | 'device';
  prelogin(email: string): Promise<PreloginResponse>;
  signup(req: SignupRequest): Promise<SessionResponse>;
  login(email: string, authKey: string): Promise<SessionResponse>;
  logout(): Promise<void>;
  listItems(): Promise<StoredItem[]>;
  putItem(id: string, item: { type: ItemType; scope: Scope; ciphertext: string; nonce: string; baseVersion: number }): Promise<StoredItem>;
  deleteItem(id: string): Promise<void>;
  listFiles(): Promise<StoredFile[]>;
  uploadFile(id: string, f: { scope: Scope; meta: string; metaNonce: string; nonce: string; bytes: Uint8Array }): Promise<StoredFile>;
  fileContent(id: string): Promise<Uint8Array>;
  deleteFile(id: string): Promise<void>;
}

export class BackendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type { KdfParams };
