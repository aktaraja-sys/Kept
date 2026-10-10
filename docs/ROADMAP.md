# Roadmap

## Done (release 1)
- Zero-knowledge accounts: client-side Argon2id, wrapped vault key, recovery key generated.
- Encrypted vault items: passwords and logins, pensions, life insurance, LPAs (finance and health).
- Encrypted document storage, filed by scope (finance, health, other) and linked to items.
- API tests, crypto tests, browser end-to-end test that checks the server never stores plaintext.

## Next
1. **Security baseline**: TOTP and passkeys, recovery flow, email verification, session list and
   revoke, audit log viewable by the subscriber.
2. **Trusted people**: invite executor, family and attorneys; per-person keypairs; choose what each
   person sees.
3. **Release engine**: death claim (certificate upload, ID check), 7-day hold with alerts and
   cancel, second confirmation, scoped key release; attorney access via OPG "Use a lasting power of
   attorney" code, scoped by LPA type.
4. **People to notify** and partner notification service.
5. **Will builder** (five-step form, draft generation, solicitor review via partner firm).
6. **LPA service**: prepare LPA from vault data; book solicitor certification; track OPG
   registration.
7. **Imports**: Google Drive, Dropbox, iCloud Drive, OneDrive; scan; email-in.
8. **Data links**: open banking (via a regulated provider such as TrueLayer), Pensions Dashboards.
9. **Production**: UK hosting, Postgres, object storage, backups, monitoring, pen test,
   Cyber Essentials Plus, ICO registration, DPIA.
