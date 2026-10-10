import { DeviceBackend } from './device';
import { RemoteBackend } from './remote';
import type { Backend } from './types';

/**
 * VITE_BACKEND=device stores the encrypted vault on this device only (Android preview).
 * Otherwise the app talks to the Kept API at VITE_API_URL (same origin by default).
 */
export function createBackend(): Backend {
  if (import.meta.env.VITE_BACKEND === 'device') return new DeviceBackend();
  return new RemoteBackend(import.meta.env.VITE_API_URL ?? '');
}

export * from './types';
