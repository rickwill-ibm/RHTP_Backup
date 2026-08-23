# Terminology-asset registry (`src/lib/terminology/registry/`)

The semantic layer needs more than a code lookup: it needs to manage the
**currency, versioning, and lifecycle** of *every* value set, code system,
classification, and ontology it governs — and HCC is only **one** of many risk
models, while behavioral and social domains bring their own families. This is
that facility, built as an **honest stub/registry** now; live refresh/fetch from
external authorities is the roadmap **Terminology iteration**.

> Every seeded **version** and **date** is an **illustrative stub** pending the
> real terminology server / VSAC SVS+FHIR / CMS HCC crosswalk / Gravity package /
> NLM feeds. The registry manages *metadata*; code **content** is answered by the
> `TerminologyService`, not here.

## The asset model — `TerminologyAsset`

One **version** of one managed value set / code system / classification:

| field | meaning |
| --- | --- |
| `id` | unique per version, e.g. `cms-hcc-v28` |
| `name` | human name, e.g. `CMS-HCC` |
| `family` | `clinical` \| `risk` \| `quality` \| `behavioral` \| `social` \| `privacy` |
| `steward` | the authority (CMS, NLM/VSAC, HL7 Gravity, SAMHSA, …) |
| `system` | canonical OID/URL; versions of one logical asset **share** this |
| `version` | version string (stub), e.g. `V28`, `FY2026`, `2.6.0` |
| `effectiveDate` / `expirationDate` | the version's validity window |
| `status` | `draft` \| `active` \| `superseded` \| `retired` |
| `lastRefreshed` / `refreshCadence` | when it was last pulled + how often it must be |
| `bindingStrength` | `required` \| `extensible` \| `preferred` \| `example` |
| `sourceUrl` | where the real content is stewarded |

Assets sharing a `system` are **versions of one logical asset** (e.g.
`cms-hcc-v24` superseded, `cms-hcc-v28` active).

## The facility — `ValueSetRegistry`

Backed by `data/terminology-assets.json` (the seed). **Deterministic**: inject a
clock via `createValueSetRegistry({ now })`, or pass `asOf` to any time-sensitive
method.

- `register` / `list(family?)` / `get(id)` / `families()` — manage the set.
- `getActiveVersion(assetId, asOf?)` — the active version of the logical asset the
  id belongs to (resolved by `system` group).
- `getActiveBySystem(system, asOf?)` — active version for a code system / value set.
- `isCurrent(assetId, asOf?)` — currency check: active **and** in its
  effective/expiration window at `asOf`.
- `checkCurrency(assetId, asOf?)` — full verdict `{ current, stale, flagged, reason }`.
- `listStale(asOf?)` — assets **past their refresh cadence** or **expired**.
- `resolveBinding(domain, purpose, asOf?)` — which value set + **active** version a
  given use should bind to (from the binding table in the seed).
- `refresh(assetId)` — **NOT-CONFIGURED STUB**: throws
  `TerminologyRefreshNotConfiguredError` naming the steward authority + operation.

## Seeded families (representative, credible stubs)

- **clinical** — ICD-10-CM (FY2026 active + FY2025 superseded), SNOMED CT US,
  LOINC, RxNorm, CPT/HCPCS, CVX, UCUM.
- **risk** — CMS-HCC (V28 active + **V24 superseded**), RxHCC, HHS-HCC, CDPS.
- **quality** — HEDIS/QARR (VSAC-stewarded), eCQM value sets.
- **behavioral** — DSM-5-TR, ICD-10 F-codes, DC:0-5, LOCUS/CALOCUS acuity.
- **social** — Gravity SDOH, ICD-10 Z-codes (Z55-Z65), LOINC SDOH panels,
  AHC-HRSN + PRAPARE screening instruments.
- **privacy** — 42 CFR Part 2 sensitivity value set, HL7 Confidentiality codes.

## Currency / versioning semantics

- **current** = `status === 'active'` **and** `asOf` inside
  `[effectiveDate, expirationDate]`.
- **stale** = `asOf` past `expirationDate`, **or** past
  `lastRefreshed + refreshCadence` (`irregular` never ages out by clock).
- **flagged** = not current **or** stale — a use bound to this version should be
  reviewed.

## Wiring into the `TerminologyService`

`validateCode` and `classify` (seeded service) consult the registry for the
**active version** of the relevant asset and attach a PHI-free `binding`
(`{ assetId, version, status, current }`) to the result. To detect a code
validated against a **retired/superseded** version, use
`validateAgainstAssetVersion(service, registry, assetId, system, code, asOf?)` —
the code may be valid yet `currency.flagged` is `true` because the bound version
is no longer current.

## Real-now vs deferred

- **Real-now**: the registry facility, the seed asset metadata, the binding table,
  and all currency/versioning logic (deterministic).
- **Deferred (Terminology iteration)**: live **refresh/fetch** of value-set
  content from VSAC (SVS + FHIR `$expand`), CMS (HCC crosswalk / model files),
  the HL7 Gravity package, and NLM (RxNorm/LOINC). `refresh` is the fail-loud stub
  until those authority clients are wired.
