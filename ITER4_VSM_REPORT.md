# ITER4 — Terminology-Asset Management Facility (Value-Set / Version / Lifecycle Registry)

**Scope built:** a FACILITY to manage the currency, versioning, and lifecycle of
**all** governed value sets, code systems, classifications, and ontologies — not
just HCC. Built as an **honest stub/registry**: registry + seed metadata +
currency logic are real-now; live refresh/fetch from external authorities is the
not-configured stub, deferred to the Terminology iteration.

Location: `src/lib/terminology/registry/` (feature-first, ≤400 lines/file, README).
Do-not-touch surfaces (`src/lib/identity`, `src/lib/pipeline/adapters`, graph
mappings) were left untouched.

---

## 1. The asset model — `TerminologyAsset` (`assetTypes.ts`)

One **version** of one managed value set / code system / classification, carrying
lifecycle metadata only (never code content):

| field | meaning |
| --- | --- |
| `id` | unique **per version**, e.g. `cms-hcc-v28` |
| `name` | human name, e.g. `CMS-HCC` |
| `family` | `clinical` \| `risk` \| `quality` \| `behavioral` \| `social` \| `privacy` |
| `steward` | the authority (CMS, NLM/VSAC, HL7 Gravity, SAMHSA, Regenstrief, …) |
| `system` | canonical OID/URL; **versions of one logical asset share this** |
| `version` | version string (**illustrative stub**) |
| `effectiveDate` / `expirationDate` | the version's validity window |
| `status` | `draft` \| `active` \| `superseded` \| `retired` |
| `lastRefreshed` / `refreshCadence` | when last pulled + how often it must be |
| `bindingStrength` | `required` \| `extensible` \| `preferred` \| `example` |
| `sourceUrl` | where the real content is stewarded |

Assets that share a `system` are **versions of one logical asset** (e.g.
`cms-hcc-v24` superseded + `cms-hcc-v28` active), which is how `getActiveVersion`
resolves the current version from any version id.

## 2. The facility — `ValueSetRegistry` (`valueSetRegistry.ts`)

Backed by `data/terminology-assets.json`. **Deterministic**: a clock is injected
(`createValueSetRegistry({ now })`) and every time-sensitive method takes an
optional `asOf`. Surface:

- `register` / `list(family?)` / `get(id)` / `families()`
- `getActiveVersion(assetId, asOf?)` — active version of the logical asset the id
  belongs to (by `system` group)
- `getActiveBySystem(system, asOf?)`
- `isCurrent(assetId, asOf?)` and `checkCurrency(assetId, asOf?)` →
  `{ current, stale, flagged, reason }`
- `listStale(asOf?)` — assets past refresh cadence or expired
- `resolveBinding(domain, purpose, asOf?)` → which value set + **active** version a
  use should bind to (from the seed binding table; 18 bindings seeded)
- `refresh(assetId)` — **NOT-CONFIGURED STUB** (see §4)

`valueSetRegistry` is the process-default singleton over the seed (system clock);
`createValueSetRegistry(opts)` builds isolated, clock-injected instances.

## 3. Seeded families — 26 assets across all 6 families

HCC is deliberately seeded as **one of several** risk models.

- **clinical (8)** — ICD-10-CM (FY2026 active + FY2025 superseded), SNOMED CT US,
  LOINC, RxNorm, CPT/HCPCS, CVX, UCUM.
- **risk (5)** — CMS-HCC (V28 active + **V24 superseded**), RxHCC, HHS-HCC, CDPS.
- **quality (2)** — HEDIS/QARR (VSAC-stewarded), eCQM value sets.
- **behavioral (4)** — DSM-5-TR, ICD-10 F-codes, DC:0-5, LOCUS/CALOCUS acuity.
- **social (5)** — Gravity SDOH, ICD-10 Z-codes (Z55-Z65), LOINC SDOH panels,
  AHC-HRSN + PRAPARE screening instruments.
- **privacy (2)** — 42 CFR Part 2 sensitivity value set, HL7 Confidentiality codes.

Each seed asset carries a realistic steward, a plausible version + effective date
+ refresh cadence + status, and is flagged `stub: true`. The seed file header and
this report both mark that **versions/dates are illustrative stubs** pending the
real terminology server / VSAC / CMS / Gravity / NLM feeds.

## 4. Currency / versioning semantics

- **current** = `status === 'active'` **and** `asOf ∈ [effectiveDate, expirationDate]`
- **stale** = `asOf` past `expirationDate`, **or** past
  `lastRefreshed + refreshCadence` (cadence→max-age days; `irregular` never ages
  out by clock)
- **flagged** = not current **or** stale — a use bound to this version needs review

Wiring into the `TerminologyService` (`seedTerminologyService.ts`):
`validateCode` and `classify` consult the registry for the **active version** of
the relevant asset (via `SYSTEM_URIS` → `getActiveBySystem`) and attach a PHI-free
`binding` (`{ assetId, version, status, current }`) to each result. To detect a
code validated against a **retired/superseded** version,
`validateAgainstAssetVersion(service, registry, assetId, system, code, asOf?)`
returns `{ validation, currency }` — a code can be structurally valid yet
`currency.flagged === true` because the version it was bound to is no longer
current (e.g. a diagnosis risk-scored against the superseded CMS-HCC **V24**).

## 5. Real-now vs deferred

- **Real-now:** the registry facility, the seed asset metadata + binding table, and
  all currency/versioning logic — deterministic and covered by tests.
- **Deferred (Terminology iteration):** live **refresh/fetch** of value-set
  content from external authorities. `refresh(assetId)` throws
  `TerminologyRefreshNotConfiguredError`, naming the steward authority + operation,
  and the message names the feeds needed: **VSAC SVS + FHIR `$expand`**, **CMS HCC
  crosswalk / model files**, **HL7 Gravity package**, **NLM RxNorm/LOINC**.

## Tests — `tests/terminology/valueSetRegistry.test.ts` (16 new tests)

register + getActiveVersion; `isCurrent` true in-window / false expired / false
superseded; `listStale` finds a past-cadence asset (and an expired one, and treats
`irregular` correctly); `resolveBinding` returns the right value set for a
domain/purpose; a code validated against the superseded CMS-HCC V24 is
currency-flagged; every family (clinical/risk/quality/behavioral/social/privacy)
is asserted covered, with HCC shown as one of four risk models; `refresh` throws
the not-configured stub naming the authority.

## Recommended scope for the Terminology iteration

1. **Authority clients behind `refresh`** — VSAC (SVS + FHIR `$expand`, API-key
   auth), CMS (HCC model files / crosswalk), HL7 Gravity package loader, NLM
   RxNorm/LOINC release feeds. Replace the throwing `refresh` per authority; the
   registry surface does not change.
2. **Version content store** — persist expanded value-set membership per asset
   version so `classify(scheme:'value-set')` and the semantic gate read real
   expansions, not the demo allowlist.
3. **Scheduled currency sweep** — a job over `listStale(now)` that opens refresh
   tasks and, on ingest, updates `version` / `effectiveDate` / `lastRefreshed` /
   `status` (auto-supersede prior versions in the same `system` group).
4. **Binding governance** — promote the seed binding table to a reviewed artifact
   with effective dates, so `resolveBinding` reflects contract/program-year
   changes (e.g. CMS-HCC V24→V28 blend transition).
5. **Wire currency into the stage-4 gate** — quarantine/annotate records whose
   codes were bound to a superseded version, using the `binding` already attached
   to `CodeValidation`.

## Verification

- `npx tsc --noEmit` → **0**
- `npx vitest run` → **fully green** (850 passed, 1 pre-existing expected-fail, 83 skipped)
- `bash check-file-sizes.sh` → **PASS** (no new violations; all new files under caps —
  registry 246/144/64 lines, test 181 lines; seed JSON is size-exempt)
