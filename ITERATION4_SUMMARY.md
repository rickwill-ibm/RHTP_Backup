# Iteration 4 — summary (clinical-core domains + EMPI identity + terminology/VSM seams)

Iteration 4 was built by **six parallel agents** and converged under an L2
adversarial cross-agent pass. It captured the proven adapter shape into ONE
template, drove the record model from **3/20 → 7/20** through it, replaced the
identity hash stub with a real match engine, and stood up the terminology /
semantic-validation seam plus a value-set lifecycle registry — every external
integration fail-loud, the demo green by default.

## What was delivered

**The L7 domain template (`src/lib/pipeline/adapters/_TEMPLATE.md`).** The golden
checklist for a new record domain: the exact files (adapter, mapping, fixture, two
test files), the exact **two registries** to touch (`pipeline/index.ts` export +
graph `MAPPING_SPECS`), the `WpcDomain` union widening, and an 8-step recipe with
**medications inlined as the worked example** so a domain agent cannot drift.

**Four clinical-core record domains, all T1 with provenance, built through the
template (record 3/20 → 7/20):**
- **medications** — one FHIR feed → `Medication` (prescribed, assoc `PRESCRIBED_FOR`)
  + `MedicationDispense` (causal `DISPENSED_UNDER`, asserter=pharmacy).
- **labs-vitals** — LOINC `Observation` (assoc `OBSERVED_FOR`; category picks
  lab-authoritative vs clinician-measured provenance).
- **allergies** — `AllergyIntolerance` (causal `ALLERGIC_TO`, clinician-asserted).
- **procedures** — CPT/SNOMED `Procedure` (causal `PERFORMED_ON`, + assoc
  `PERFORMED_DURING` → existing Encounter when referenced).

Each pins all its surfaces in `tests/pipeline/domainNamespaceIntegrity.test.ts`
(adapter + mapping + both registries + node/edge types), both graph backends
rebuild byte-identical, and the whole-person lens surfaces the domain.

**EMPI-backed identity resolution (`src/lib/identity/empiResolver.ts`).** The
pipeline identity seam now resolves through the **real match engine** (deterministic
rules + probabilistic scoring, autoLink ≥ 90 / possibleMatch ≥ 60) in production,
the deterministic stub in mock/seeded (stable demo ids). A **possible match (60–90)
is HELD for review** — throws `HeldIdentityError`, routes to the held-for-review
lane, and **never auto-links**. Selection is config-only via `selectIdentityResolver()`.

**External identity seams (`src/lib/identity/external/`).** IHE **PIX/PDQ** (HL7v2)
and **PIXm/PDQm** (FHIR) resolvers behind one `ExternalIdentityResolver` seam,
selectable by `IDENTITY_RESOLVER_KIND`; both throw `ExternalEmpiNotConfiguredError`
naming the exact config each needs. `internal` stays default.

**Terminology + semantic gate (`src/lib/terminology/`).** A `TerminologyService`
(validateCode / translate / classify) over 6 governed systems (RxNorm, LOINC,
SNOMED-CT, ICD-10-CM, CPT-HCPCS, HCC). Stage 4 now runs **two gates**: the existing
structural `FhirProfileValidator`, then the new `SemanticValidator` — seed allowlist
in mock/seeded (demo codes valid → green), fail-closed in production
(`semantic-terminology-unavailable`).

**Value-set / version / lifecycle registry (`src/lib/terminology/registry/`).** A
facility managing currency/versioning/lifecycle of **26 governed assets across 6
families** (clinical/risk/quality/behavioral/social/privacy), deterministic
(injected clock), with `getActiveVersion`, `isCurrent`/`checkCurrency`,
`listStale`, `resolveBinding`. Wired into the service so a validated code carries
which version it was checked against; a code bound to a **superseded** version
(e.g. CMS-HCC V24) is currency-flagged. `refresh()` is the deferred not-configured
stub.

## Real vs seam/stub vs CI-pending

- **Real now:** template + 4 domains (end-to-end, both graph backends); EMPI
  match-engine resolution + HELD path; the stage-4 double gate; the seed
  terminology service; the value-set lifecycle registry + currency logic.
- **Seam / stub (fail-loud):** external EMPI (PIX/PDQ, PIXm/PDQm); production
  terminology server; value-set `refresh()`; HCC crosswalk is a demo stub; the EMPI
  candidate registry is the mock `IdentitySource`.
- **CI-pending:** real-backend integration count stays **0** — all new work runs
  over in-memory / pg-mem fakes (no HAPI `$validate`, no live PIX/PDQ manager, no
  FHIR terminology server).

## Verification

- `npx tsc --noEmit` → **0**
- `npx vitest run` → **850 passed**, 1 expected-fail (pre-existing), 83 skipped, 0
  failures (119 files)
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; no new file > 400 lines)

Convergence verdict: **DRY** — 1 documentation-only finding (Wave C's C9 matrix
mislabels the pre-existing `sdoh` row T2/flat-file; true value T1/batch, per the
`cboSdoh` adapter and Waves A/B), non-blocking, corrected in the convergence report.
See `ITER4_CONVERGENCE_REPORT.md`.
