# Kept product spec

Kept makes life easier for the people you love: everything they will need, in one secure place,
opened only when it is needed and wired into probate.

## Personas

- **Subscriber**: adult aged 35+, builds and maintains the vault.
- **Executor**: named in the will; receives scoped access after a verified death.
- **Attorney**: appointed under a registered Lasting Power of Attorney (LPA); receives access
  matching the LPA type if the subscriber loses capacity.
- **Family member**: sees what the subscriber chooses (for example, people to notify).

## Release 1 (this build)

### Accounts
- Sign up with email and a master password (minimum 12 characters, strength meter).
- Recovery key shown once at sign-up; user must confirm they have saved it.
- Sign in, sign out, lock (clears keys from memory). Auto-lock after 10 minutes idle.

### Passwords and logins
- Fields: name, website, username, password, notes, **what should happen after I die**
  (memorialise, close, hand over to someone, download content first then close, other) and who to
  hand over to.
- Password generator, show/hide, copy.

### Pensions
- Fields: provider, scheme name, type (workplace defined contribution, workplace final salary,
  personal, SIPP, State Pension, annuity, other), member or policy number, approximate value and
  valuation date, **beneficiary nomination made?** (yes / no / not sure), nominated beneficiaries,
  provider contact, notes.
- The app flags pensions without a nomination.
- Documents (statements, nomination forms) can be attached; scope `finance`.

### Life insurance
- Fields: insurer, policy number, type (term, whole of life, death in service, critical illness,
  mortgage protection, other), sum assured, **written in trust?** (yes / no / not sure), trustees,
  beneficiaries, premium and frequency, end date, insurer contact, notes.
- The app flags policies not written in trust, since proceeds may then fall into the estate.
- Documents attachable; scope `finance`.

### Lasting Powers of Attorney
- Two separate records, each with its own documents:
  - **Property and financial affairs** (scope `finance`)
  - **Health and welfare** (scope `health`)
- Fields: status (not made, in progress, signed, registered), OPG reference, registration date,
  attorneys, replacement attorneys, how attorneys make decisions (jointly; jointly and severally;
  jointly for some decisions), life-sustaining treatment (health and welfare only), where the
  original is kept, notes.
- Guidance to make a missing LPA, including the Kept LPA service (£150, or £250 for both; prepared
  from the vault and certified by a solicitor).

### Documents
- Upload any file (PDF, image, Word) up to 25 MB; encrypted on the device first.
- Every document is filed as **Finance**, **Health** or **Other**, with a category (statement,
  policy, LPA, medical, identity, other) and optionally linked to a pension, policy or LPA.
- Health and finance documents are kept apart so they can later be released only to the matching
  attorneys.

## Later releases (see ROADMAP.md)

Trusted people and release rules; death claim with hold and second confirmation; attorney access via
OPG verification; people to notify and provider notification; probate pack; will builder; open
banking and Pensions Dashboard links; cloud-app import; MFA and passkeys; native apps.
