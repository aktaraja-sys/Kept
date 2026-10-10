import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each run gets a fresh data directory so the test can inspect exactly what the server stored.
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'kept-e2e-'));
process.env.E2E_DATA_DIR = dataDir;
const port = 8799;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 412, height: 915 }, // a typical Android phone
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx vite build && cd ../api && PORT=${port} DATA_DIR=${dataDir} WEB_DIST=../web/dist SERVER_SECRET=e2e-only npx tsx src/server.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
