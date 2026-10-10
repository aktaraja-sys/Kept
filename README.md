# Kept

Everything your family will need, in one secure place. Opened only when it's needed, and wired into
probate.

This repository holds the Kept app: a web app and an Android app built from the same code, plus the
API. Release 1 covers the vault itself:

- **Passwords and logins**, with what should happen to each account after you die
- **Pensions**, flagging any without a beneficiary nomination
- **Life insurance**, flagging policies not written in trust
- **Lasting Powers of Attorney**, kept as two separate records: property and financial affairs, and
  health and welfare, each with its own documents
- **Documents**, encrypted on the device and filed as Finance, Health or Other

Everything is encrypted on the user's device before it is saved. The server only ever stores
ciphertext. See [docs/SECURITY.md](docs/SECURITY.md).

> **Status: early development. Do not store real personal data yet.** MFA, account recovery,
> trusted-person access and an independent security test are still to come
> ([docs/ROADMAP.md](docs/ROADMAP.md)).

## Install the Android app on your phone

Every push to `main` builds an Android app file (APK).

1. On your phone, open https://github.com/aktaraja-sys/Kept/releases/download/android-preview/kept-preview.apk (or the **Releases** section of this repository, **Kept Android preview**).
2. Open the downloaded `kept-preview.apk`. Android will ask you to allow installing apps from your
   browser; allow it for this install only.

In this preview the encrypted vault is stored **on the phone only**. Uninstalling the app deletes it.
Syncing with the Kept server will be switched on once the server is hosted.

## Run it on a computer

Requires Node.js 22.5 or later.

```bash
npm install
npm run dev          # API on :8787 and web app on http://localhost:5173
```

## Tests

```bash
npm test             # API and encryption tests
npm run test:e2e     # browser test of the full journey, including a check that the server stores no plaintext
```

## Layout

```
apps/api        Fastify API (Node's built-in SQLite for development)
apps/web        React app (Vite); also the Android app via Capacitor (apps/web/android)
packages/shared Data shapes shared by both
docs/           Spec, security design, roadmap
```
