# Provider identity (F5) — NPI validation + NPPES resolution

Closes register item **F5 (HIGH)**: performers/prescribers used to stay raw
strings, breaking attribution, network adequacy, and referral routing. This
module validates NPIs, resolves a provider to an **NPI-anchored
`ProviderIdentity`**, and projects it as a `ProviderIdentity` graph node so the
raw + `deferred-I8A` performer refs from earlier iterations now resolve.

## What is here

| File | Responsibility |
| --- | --- |
| `npi.ts` | NPI validation — the NPPES `80840`-prefixed Luhn check digit. `isValidNpi`, `assertValidNpi`, `extractNpi`, `InvalidNpiError`. Pure, offline, deterministic. |
| `types.ts` | `ProviderIdentity` (NPI-anchored), `ProviderResolveInput`, `NppesNotConfiguredError`. |
| `seedDirectory.ts` | The seeded synthetic provider directory **data file** (mock/seeded backing). Every NPI is check-digit valid; the providers are fabricated demo entities (no PHI). |
| `directory.ts` | The `providerIdentity` **seam**: `getProviderDirectory()` returns the seed in mock/seeded and the registered live NPPES client in production, throwing `NppesNotConfiguredError` when none is wired (**fail closed**). |
| `resolver.ts` | `resolveProvider` (async, seam-backed enrichment) and `anchorProviderRef` (sync, registry-free anchor for the graph mapping). |
| `node.ts` | The `ProviderIdentity` graph node namespace: `PROVIDER_IDENTITY_KIND`, `providerNodeKey`, `providerNodeProps`. Imports nothing from the graph layer. |

## The NPI check (npi.ts)

An NPI is 10 digits; the 10th is a Luhn check digit computed over the first 9
digits **prefixed with `80840`** (the ISO 7812 issuer prefix for the
health-industry numbering space). `base = "80840" + firstNine`; the check digit
is the standard Luhn digit of `base`; valid ⟺ it equals the 10th digit. This
proves the digits are self-consistent, **not** that the NPI is enrolled in NPPES
— registry existence is the seam's concern.

## The seam (directory.ts) — fail-closed

`providerIdentity` follows the platform's one safe-stub pattern (see
`config/README.seams.md`):

- **mock / seeded** → the seeded synthetic directory; the demo stays green.
- **production** → the registered live NPPES client, or **throw
  `NppesNotConfiguredError`** when none is wired. Production never serves the
  seed dressed up as real data.

Declared in `config/dataMode.ts` (`DATA_MODE_SEAMS`) and
`config/seamDispositions.ts` (`fail-closed-stub`), proved by
`tests/governance/seamFailClosed.test.ts`.

## Resolution and the graph (resolver.ts, node.ts)

`resolveProvider` validates the NPI (throwing `InvalidNpiError` on a bad
explicit NPI), then enriches from the directory; a validated NPI with no
directory record still resolves — but only to its real anchor plus the inline
facts the feed gave.

The graph mapping is pure and synchronous, so it uses `anchorProviderRef`: it
validates the NPI and anchors a `ProviderIdentity` from inline attributes, or
returns `null` (no valid NPI) so the caller keeps the ref raw. A resolved
provider projects as a `ProviderIdentity` node keyed `npi:<npi>` — two feeds
naming the same provider by NPI converge on **one** node.

## E9 — never fail open to a fabricated identity

- An invalid NPI is **rejected**: `null` in the sync path, `InvalidNpiError` in
  the async path. It is never rounded, guessed, or anchored.
- A validated NPI with no directory record resolves to its **real** anchor plus
  inline facts only — the resolver never invents a name/taxonomy.
- Production with no NPPES client wired **throws** — never a fake record.
- In the referral mapping, a performer with no valid NPI stays **raw +
  `deferred-I8A`**, exactly as before.
