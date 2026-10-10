# Kept security design

Kept holds the most sensitive information a person has: passwords, pension and insurance details,
identity numbers and legal documents. The design goal is that **Kept, as a company, cannot read any
of it**. A breach of our servers should expose ciphertext only.

This document describes what is built today (MVP) and what must be done before real customer data
is accepted. It is a starting point for an independent security review, not a substitute for one.

## Threat model (summary)

| Threat | Mitigation in this design |
|---|---|
| Database or storage breach | Item contents and files are encrypted on the user's device before upload. The server stores ciphertext, nonces and minimal metadata. |
| Malicious or compromised insider | Same as above. Server never receives the master password, the encryption key or the vault key. |
| Server tampering with records (swapping an item's type or scope) | Item type and scope are bound into the AEAD as associated data, so a swapped record fails to decrypt. |
| Credential stuffing / brute force | Master password stretched with Argon2id on the client; the derived auth key is hashed again on the server with scrypt; login attempts are rate limited per email and per IP. |
| Account enumeration | Pre-login returns a deterministic fake salt for unknown emails. |
| Session theft / CSRF | Random 256-bit session tokens, stored only as SHA-256 hashes; `HttpOnly`, `Secure` (in production), `SameSite=Strict` cookies; mutating requests require an `X-Kept` header. |
| Lost master password | A recovery key is generated at sign-up and shown once. The vault key is also wrapped under it. (The recovery flow itself is on the roadmap.) |

## Keys

```
master password ──Argon2id(salt, ops=3, mem=64 MiB)──► master key (32 bytes, never leaves device)
master key ──KDF(subkey 1, "keptauth")──► auth key   → sent to server, hashed again with scrypt
master key ──KDF(subkey 2, "keptencr")──► enc key    → never leaves device
random ──► vault key (32 bytes)
vault key ──XChaCha20-Poly1305(enc key)──► wrapped vault key       → stored on server
vault key ──XChaCha20-Poly1305(recovery key)──► recovery-wrapped key → stored on server
```

- Library: libsodium (`libsodium-wrappers-sumo`) in the browser.
- AEAD: XChaCha20-Poly1305 (IETF) with random 24-byte nonces.
- Each vault item: JSON encrypted under the vault key, AAD = `kept:item:v1|<id>|<type>|<scope>`.
- Each file: a random per-file key encrypts the bytes (AAD = `kept:file:v1|<id>`). The file key,
  file name, MIME type, category and any linked item are encrypted as metadata under the vault key
  (AAD = `kept:filemeta:v1|<id>|<scope>`).

## What the server can see (plaintext metadata)

- Account email, KDF salt and parameters.
- For each item: an id, its **type** (`login`, `pension`, `life_insurance`, `lpa`), its **scope**
  (`general`, `finance`, `health`), size and timestamps.
- For each file: an id, its **scope**, size and timestamps.

Type and scope are kept in plaintext because the release engine (on death, or to an attorney under
a registered LPA) must decide **which** encrypted records a trusted person may receive without
being able to read them. Scope maps directly to LPA type:

| Scope | Released to |
|---|---|
| `finance` | Property and financial affairs attorneys; executors |
| `health` | Health and welfare attorneys only |
| `general` | Executors (and as the user chooses) |

## Not yet built (must be done before real data)

1. Multi-factor authentication (TOTP and passkeys) and new-device approval.
2. Recovery flow using the recovery key; email verification.
3. Trusted-person key sharing: each trusted person gets a keypair; scoped keys are wrapped to their
   public key and only released by the release engine (verified death or OPG-verified LPA, hold
   period, second confirmation). This is designed in `SPEC.md` and not implemented.
4. Production hosting in the UK, Postgres with encryption at rest, object storage for files,
   backups, key management for server secrets, centralised audit logging.
5. Content Security Policy hardening, subresource integrity, dependency scanning in CI.
6. Independent penetration test and cryptographic design review; Cyber Essentials Plus;
   ICO registration and a DPIA.
