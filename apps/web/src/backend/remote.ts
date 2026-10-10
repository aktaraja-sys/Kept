import type { PreloginResponse, SessionResponse, StoredFile, StoredItem } from '@kept/shared';
import { BackendError, type Backend } from './types';

export class RemoteBackend implements Backend {
  readonly kind = 'remote' as const;
  constructor(private base = '') {}

  private async req<T>(method: string, path: string, body?: unknown, raw?: { bytes: Uint8Array; headers: Record<string, string> }): Promise<T> {
    const headers: Record<string, string> = { 'X-Kept': '1' };
    let payload: BodyInit | undefined;
    if (raw) {
      Object.assign(headers, raw.headers, { 'Content-Type': 'application/octet-stream' });
      payload = new Blob([raw.bytes as BlobPart]);
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers, body: payload, credentials: 'include' });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {}
      throw new BackendError(msg, res.status);
    }
    return (await res.json()) as T;
  }

  prelogin(email: string) {
    return this.req<PreloginResponse>('GET', `/api/auth/prelogin?email=${encodeURIComponent(email)}`);
  }
  signup(r: Parameters<Backend['signup']>[0]) {
    return this.req<SessionResponse>('POST', '/api/auth/signup', r);
  }
  login(email: string, authKey: string) {
    return this.req<SessionResponse>('POST', '/api/auth/login', { email, authKey });
  }
  async logout() {
    await this.req('POST', '/api/auth/logout').catch(() => undefined);
  }
  async listItems() {
    return (await this.req<{ items: StoredItem[] }>('GET', '/api/items')).items;
  }
  putItem(id: string, item: Parameters<Backend['putItem']>[1]) {
    return this.req<StoredItem>('PUT', `/api/items/${encodeURIComponent(id)}`, item);
  }
  async deleteItem(id: string) {
    await this.req('DELETE', `/api/items/${encodeURIComponent(id)}`);
  }
  async listFiles() {
    return (await this.req<{ files: StoredFile[] }>('GET', '/api/files')).files;
  }
  uploadFile(id: string, f: Parameters<Backend['uploadFile']>[1]) {
    return this.req<StoredFile>('POST', `/api/files/${encodeURIComponent(id)}`, undefined, {
      bytes: f.bytes,
      headers: { 'X-Kept-Scope': f.scope, 'X-Kept-Meta': f.meta, 'X-Kept-Meta-Nonce': f.metaNonce, 'X-Kept-Nonce': f.nonce },
    });
  }
  async fileContent(id: string) {
    const res = await fetch(`${this.base}/api/files/${encodeURIComponent(id)}/content`, { credentials: 'include' });
    if (!res.ok) throw new BackendError('Could not download the file', res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
  async deleteFile(id: string) {
    await this.req('DELETE', `/api/files/${encodeURIComponent(id)}`);
  }
}
