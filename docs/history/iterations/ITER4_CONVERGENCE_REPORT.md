# Iteration 4 — Convergence Report (L2 adversarial, cross-agent integration)

Six agents built Iteration 4 in parallel: the L7 domain template + medications
(Wave A), labs-vitals + allergies (Wave B), procedures (Wave C), the internal
EMPI resolver + HELD path (EMPI), the external identity + terminology/semantic
seams (External Seams), and the value-set/version registry facility (VSM). This
convergence pass verified their SEAMS agree and re-ran the authoritative gates.

**Verdict: DRY.** 1 new finding (documentation-only, non-blocking). All gates green.

---

## Authoritative verification (re-run here)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **850 passed**, 1 expected-fail (pre-existing), 83 skipped, **0 failures** (119 files) |
| `bash check-file-sizes.sh` | **PASS** — no new violations; ratchet intact (75 frozen legacy files unchanged); no new file > 400 lines (largest new: `valueSetRegistry.ts` 246) |

---

## Check-by-check findings

### 1. Namespace pinning — CONFIRMED (no drift)
`tests/pipeline/domainNamespaceIntegrity.test.ts` pins **all four** new domains
(medications, labs-vitals, allergies, procedures) in dedicated `describe` blocks.
Each block pins, and asserts agreement across: the domain-id constant, node-kind
constant(s), edge-type constant(s), the pipeline adapter (`.domain/.format/
.arrivalMode`), the mapping spec, **both registries** (`MAPPING_SPECS` membership +
`specFor(eventType)` ownership), and the projector's emitted node kinds + edge
types (including causal-semantics assertions and the standalone-procedure
no-`PERFORMED_DURING` case). The `WpcDomain` union in `src/lib/pipeline/types.ts`
matches exactly: `coverage | encounter | sdoh | medications | labs-vitals |
allergies | procedures` (3 prior + 4 new). No drift to fix.

### 2. C9 coverage — CONFIRMED 7/20; one report inconsistency (**the 1 new finding**)
The record model is honestly **7/20**. All **four new domains are T1 with
provenance**, verified in code:
- medications — T1, `prescriber-authoritative` / `pharmacy-dispense`
- labs-vitals — T1, `lab-result-authoritative` / `clinician-measured`
- allergies — T1, `clinician-asserted`
- procedures — T1, `provider-performed`

**FINDING (documentation, low severity):** `ITER4_WAVEC_REPORT.md`'s C9 matrix
labels the pre-existing `sdoh` row **T2 / "flat-file"**. The actual adapter
(`cboSdoh.ts`) is **T1**, `arrivalMode: 'batch'`, `format: 'flat-file-csv'`, and
Waves A and B correctly show `sdoh` as **T1**. So the C9 rows are NOT byte-consistent
across the three wave reports for the sdoh row. This is a report typo, not a code
defect (no code change needed). **Authoritative tier for `sdoh` is T1.** The four
new domains are unaffected and internally consistent across all reports.

### 3. Stage-4 double gate — CONFIRMED
`conformAndLoad` (stage 4) runs **structural then semantic**, in that order:
Gate 1 = `FhirProfileValidator.validate` (unchanged); Gate 2 = `SemanticValidator.
validate` (new), each `continue`-quarantining on failure. `runPipeline` leaves
`semanticValidator` undefined, so the default path selects `selectSemanticValidator()`
(gate **on** by default). The four domain e2e tests do **not** disable the gate and
pass — proving seeded mode admits every demo code. Every code the 4 fixtures emit is
in `data/terminology-seed.json`:
- RxNorm `310798`, `197361`, `7980` · LOINC `4548-4`, `8480-6`, `2339-0`
- SNOMED `227493005`, `80146002` · CPT `45378`
The noted cross-agent risk (external-seams agent adding procedure codes) is closed:
`45378` and `80146002` are present; the procedure e2e test is green with the gate on.
Production mode fails loud/closed: `productionTerminologyService` throws
`TerminologyServiceNotConfiguredError`, which the gate catches into
`semantic-terminology-unavailable` (quarantine, never admit unverified). All four
adapters carry the `system` URI in the normalized payload coding, so the extractor
actually sees the codes (not a silent no-op). Existing adapters (coverage/encounter/
sdoh) carry no governed-system codings in their payloads, so the newly-default gate
is a no-op for them — the green suite confirms no cross-agent regression.

### 4. Identity — CONFIRMED (one selection path, no collision)
`selectIdentityResolver()` (`stages.ts`) is the single path: it first checks the
external resolver KIND (`externalIdentityResolverFor(identityResolverKind())`); if
`internal` (default), it selects `empiResolver` in production and
`defaultIdentityResolver` (deterministic djb2 stub) in mock/seeded. External stubs
`pixPdqIdentityResolver` / `pixmPdqmIdentityResolver` are selectable via session
override or `IDENTITY_RESOLVER_KIND` and throw `ExternalEmpiNotConfiguredError`
naming the exact config each family needs (MLLP endpoint + AA OID + app/facility
for PIX/PDQ; FHIR base URL + AA system + auth for PIXm/PDQm). The possible-match
band **[60, 90)** in `empiResolver` throws `HeldIdentityError` →
`runTransform` diverts to the held-for-review lane (`status: 'held-for-review'`,
`identity-possible-match`, PHI-safe `identityHold`); **no NormalizedRecord is
produced, so it never auto-links**. Deterministic hit or score ≥ 90 links; score
< 60 / id-only mints a deterministic anchored id. No selection collision.

### 5. Terminology registry ↔ service — CONFIRMED
`seedTerminologyService.validateCode`/`classify` consult
`valueSetRegistry.getActiveBySystem(uri)` for the **active** version and attach a
PHI-free `binding {assetId, version, status, current}`. A code checked against a
retired/superseded version is surfaced via `validateAgainstAssetVersion(...)`,
which returns `{validation, currency}` where `currency.flagged === true` for a
superseded binding (e.g. CMS-HCC **V24**). The **6 governed code systems**
(RxNorm, LOINC, SNOMED-CT, ICD-10-CM, CPT-HCPCS, HCC) are seeded; the registry
seeds **26 assets across all 6 families** (clinical 8, risk 5, social 5, behavioral
4, quality 2, privacy 2). `refresh()` is the deferred not-configured stub.

### 6. Determinism — CONFIRMED
No raw non-determinism in the target surfaces. Every time access flows through a
clock seam: adapters + graph mappings use `deps.now()` (injected clock);
`valueSetRegistry` injects `opts.now` (deterministic in tests via
`createValueSetRegistry({ now })`, system-clock default for the process singleton);
remaining `new Date(...)` calls are pure ISO-string parses of input. No
`Date.now`/`Math.random` on any hot path. `console.*` = **0** across all Iteration 4
dirs. Ratchet/convention/BFF-only intact; no new file > 400 lines.

### 7. Seam-id collisions — CONFIRMED (none)
The 10 `getDataMode('...')` ids are distinct: `identity`, `terminology`, `sde`,
`signalDisposition`, `graph`, `evidence`, `agentRuntime`, `agentManifests`,
`consent`, `fhirStore`. The two new seams (`identity`, `terminology`) collide with
neither each other nor any prior id. The four new record domains use **no**
`getDataMode` seam (pure record adapters), so they cannot collide. External
identity uses its own orthogonal `IDENTITY_RESOLVER_KIND` config layered over the
`identity` seam — not a dataMode id.

---

## Real vs seam/stub vs CI-pending (cross-agent honest status)

**Real now:** the L7 template + 4 record domains (adapter → normalize → project →
graph → lens, both backends byte-identical); EMPI-backed resolution (real
`matchEngine` deterministic rules + probabilistic scoring, 90/60 thresholds,
held-not-linked, idempotent mint); the stage-4 double gate; the seed terminology
allowlist (validateCode/translate/classify) + the value-set/version/lifecycle
registry facility with currency logic.

**Seam / stub (fail-loud until wired):** external EMPI over PIX/PDQ + PIXm/PDQm
(typed queries/responses + config shapes; throw NotConfigured); production
terminology server (throws → gate fails closed); `refresh()` of value-set content
from external authorities (throws, names VSAC/CMS/Gravity/NLM); the EMPI candidate
registry is the mock `IdentitySource`; the anchored-id crosswalk is derived, not a
persisted master index; HCC crosswalk is a demo stub, not the full CMS mapping.

**CI-pending:** real-backend integration count stays **0** for this iteration — all
new work runs over in-memory / pg-mem fakes; no HAPI `$validate`, no live PIX/PDQ
manager, no FHIR terminology server wired.

---

## Verdict

**DRY** — 1 new material defect (a Wave C C9-matrix documentation typo: `sdoh`
labeled T2/flat-file vs the true T1/batch), below the < 3 threshold, non-blocking;
and all three authoritative gates pass. Recommend correcting the sdoh row in
`ITER4_WAVEC_REPORT.md` to T1/batch for report-set consistency; no code change.
