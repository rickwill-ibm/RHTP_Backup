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
