# Data-source adapters (O-2)

Real data-source loaders behind their seams. Generic and persona-free: no
hardcoded Maria journey, no persona-specific values baked into code. Three seams,
one shape each.

| Seam id             | Normalized output                       | Seeded from                         | Production              |
| ------------------- | --------------------------------------- | ----------------------------------- | ----------------------- |
| `goldCardRoster`    | `GoldCardRoster` (cards + PA histories) | `data/gold-card-roster.seed.json`   | stub throws until wired |
| `denialRateFeed`    | `DenialRateFeed` (rates by code/plan)   | `data/denial-rates.seed.json`       | stub throws until wired |
| `providerDirectory` | `ProviderDirectory` (providers)         | `data/provider-directory.seed.json` | stub throws until wired |

## The shape

Each adapter exposes:

1. **A normalized output type** — the source-agnostic model callers depend on.
2. **A `normalizeX(raw, asOf)` boundary parser** — validates and normalizes an
   untrusted document (hand-written guards, the repo's `isEvidenceRecord`
   discipline); malformed rows throw rather than flowing downstream.
3. **A seeded loader** — reads the bundled `data/*.json` (data-is-not-code) and
   returns the normalized type. Deterministic: the caller passes `asOf`.
4. **A production loader stub** — throws `DataSourceNotConfiguredError` (the
   BackboneNotConfigured pattern: fail loud, never a silent missing backend)
   until a real client (payer roster API, adjudication-history feed,
   credentialing directory) replaces the body.
5. **A `getXLoader()` selector** — resolves mock/seeded/production from
   `getDataMode(seam)`. `mock` and `seeded` both serve the seed file here.

## Seam registration

All three ids are registered in `lib/config/dataMode.ts` so ops/config tooling
sees them and `DATA_MODE_GOLD_CARD_ROSTER` / `DATA_MODE_DENIAL_RATE_FEED` /
`DATA_MODE_PROVIDER_DIRECTORY` (or a global `DATA_MODE`) select the mode at
deployment. Default is `mock`, so the demo stays green.

## Relationship to existing seams

`lib/policy/goldCardSource.ts` and `lib/policy/denialRates.ts` are the in-engine
seams these loaders feed: a composition root can adapt a `GoldCardRoster` into a
`GoldCardContext`, or a `DenialRateFeed` into a `DenialRateProvider` (see
`lookupDenialRate`). This module is the durable **loader** layer; those remain
the **engine** injection points. Callers are unchanged this iteration.

## Tests

`tests/dataSources/adapters.test.ts` — normalization (happy path, defaults,
malformed-row rejection), the seeded/production selector, and NotConfigured
behavior for all three.

## Synthetic-entity registry (`syntheticEntities.ts`)

The **single source of truth** for every de-attributed organisation in the demo
corpus. Data lives in `data/synthetic-entities.seed.json`; the module is a thin
typed loader over it.

Why it exists: an earlier wave de-attributed three screens by hand and the same
real names survived in 30+ other files, so `NetworkParticipantsPanel` routed a
click to `/provider-level` and showed the _same organisation under two names_.
Names, short/graph forms, phones, emails, domains and street addresses are now
owned here, and seeds carry an `entityId` rather than a name.

The rule the registry encodes — a real place name may appear as a **LOCATION**
(county, city, ZIP, lat/lng, map label) but never inside an **ORGANISATION**
name; tribal and people names never appear in an organisation name at all.
County values are deliberately _not_ substituted: `Bennett` and `Oglala Lakota`
are load-bearing keys for the networkAdequacy engine.

Contact safety: phones use the NANP-reserved `555-0100..555-0199` fictitious
range, emails and domains use RFC 2606 `example.org`.

`oldNames` / `contactSubstitutions` keys are **provenance only** — the record of
what was retired, and the input to the zero-residue check. Never rendered.

- Apply the registry repo-wide: `node tools/deattribution/sweep.mjs --check|--write`
  (idempotent; carries a documented carve-out for the `Bennett County Health`
  homograph in `src/uhg/**`, explained in the tool's header).
- `tests/dataSources/syntheticEntities.test.ts` — registry shape, contact safety,
  seed resolution, and the repo-wide coherence gate that fails if any retired
  name reappears.
