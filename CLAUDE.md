# Notes for working on Kept

Read `docs/SPEC.md` and `docs/SECURITY.md` before changing anything that touches data.

## Non-negotiables

- **Zero knowledge.** Vault contents and files are encrypted in `apps/web/src/crypto/sodium.ts` before
  they reach any backend. Never send plaintext item data, file contents, file names or the master
  password to the API, logs or analytics.
- **Type and scope are bound into the AEAD** (`kept:item:v1|id|type|scope`). If you add a field that
  the server sees in plaintext, add it to the associated data and document it in SECURITY.md.
- **Scope decides future release**: `finance` (property and financial affairs attorneys, executors),
  `health` (health and welfare attorneys only), `general`. Health and finance documents must never be
  merged.
- Keys live in memory only (`vault.tsx`, `keyRef`), are wiped on lock, and the vault auto-locks.
- No real personal data in tests or fixtures. Use obviously fake names.

## Commands

- `npm test`: API tests (`apps/api/test`) and crypto/device tests (`apps/web/test`).
- `npm run test:e2e`: Playwright journey. It asserts that the server data directory contains none of the
  test's secret strings; keep that assertion when adding fields.
  In a sandbox with a preinstalled Chromium, set `PW_CHROMIUM_PATH`.
- `npm run build:android --workspace apps/web`: web build with `VITE_BACKEND=device`, then `cap sync`.

## Backends

`apps/web/src/backend/` has `RemoteBackend` (the API) and `DeviceBackend` (IndexedDB, used by the
Android preview). Both store the same ciphertext format. Keep them behaviourally identical.
