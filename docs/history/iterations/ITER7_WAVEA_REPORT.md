# Iteration 7 — Wave A (HIGH CARE): behavioral-health domain + F2 (42 CFR Part 2) closure

Wave A delivers the behavioral-health domain (BH conditions + the SUD subset) and
closes register F2 with real Part 2 segmentation: correct basis, restricted
projection, consent-scope check, break-glass, and the re-disclosure marker.

## 1. Behavioral-health domain (`behavioral-health`, T1)

Built end to end via the L7 domain template (8 steps, exactly two registries touched):

| Surface | Path |
|---|---|
| Pipeline adapter | `src/lib/pipeline/adapters/behavioralHealth.ts` |
| Graph mapping spec | `src/lib/graph/mapping/behavioralHealth.ts` |
| Part 2 basis rule set | `src/lib/pipeline/part2Basis.ts` |
| Part 2 consent module | `src/lib/consent/part2Consent.ts` |
| Fixture (synthetic) | `tests/pipeline/fixtures/behavioralHealth.json` |
| Pipeline tests | `tests/pipeline/behavioralHealth.test.ts` |
| Graph tests | `tests/graph/behavioralHealth.test.ts` |
| Namespace pin | `tests/pipeline/domainNamespaceIntegrity.waveA.test.ts` (BH block) |

- **Adapter**: parses a synthetic ICD-10-coded FHIR `Condition` bundle -> normalized
  records at **T1**, provenance `diagnosis-authoritative`, event
  `behavioral-health.condition-recorded`. Subject anchored through the identity seam
  (never the raw id); payload is codes + refs only; one malformed (coding-less)
  Condition quarantines with `missing-condition-code`.
- **Mapping**: `(Member)-[:HAS_CONDITION {dated}]->(Condition)`, associative. The node
  kind is `Condition`; the SUD subset projects as a **RESTRICTED** `Condition` node
  because `resourceNode` reads restriction off the envelope (C10.1).
- Registered in both registries; `WpcDomain` widened with `'behavioral-health'`.
- 4 new ICD-10 F-codes (F11.20, F10.20, F32.1, F41.1) added to the seed terminology
  allowlist (`terminology-seed.json`) so the stage-4 semantic gate admits the fixture
  (the intended data-is-not-code extension point).

## 2. F2 — real 42 CFR Part 2 segmentation

### Segmentation basis (the fix)
The old basis was a blunt drop on a single code (ADT PV1-10 = 'CD', a CSV column).
`part2Basis.ts` replaces it with the **two-factor Part 2 test** (42 CFR 2.11/2.12),
encoded on data tables:

1. **Program context** — the record originates from a *federally-assisted SUD
   program* (`FEDERALLY_ASSISTED_SUD_PROGRAM_TYPES`: OTP, SUD treatment facility,
   detox unit, held-out Part 2 program) AND the program is flagged federally-assisted.
2. **SUD content** — the diagnosis is in the ICD-10 **F10-F19** range.

Part 2 attaches only when **both** hold. The adapter attaches the `part2-sud`
segmentation hint only then; the shared `applySegmentation` maps it to the durable
`42-CFR-Part-2` label carried on the envelope and onto the restricted node. Proven by
tests:
- SUD dx from an OTP -> **Part 2** (`part2Restricted: true`, `42-CFR-Part-2` label).
- Same SUD dx family from a **general hospital** -> **NOT Part 2** (over-restriction
  guard: not restricted on the code alone).
- Non-SUD BH (depression, anxiety) -> **NOT Part 2** (plain `Condition`).
- Unit table: both facts required (program without SUD content, or SUD content
  without a federally-assisted SUD program, both -> not Part 2).

### Consent-directed release (`part2Consent.ts`)
A Part 2 record is disclosed only under a consent directive that **names the recipient
and the purpose** and releases the requested segments (42 CFR 2.31). Modeled as
`Part2ConsentDirective` + `evaluatePart2Access(request, directives, deps)`:
- Matching directive -> `disclosed: true`, audit class `part2-consent-disclosure`, and
  a covering `ConsentScope` the lens read runs under (the restricted node surfaces).
- No matching directive -> **held-restricted**: `disclosed: false`, empty scope, audit
  class `part2-held-restricted`. The node is NOT dropped — it stays in the store
  (asserted in test) and is simply not surfaced. Never silently disclosed, never
  silently dropped.

### Break-glass (distinct, audited)
Emergency access (42 CFR 2.51) via `breakGlass: true` + a captured reason. Reuses the
`lib/authz/guard.ts` pattern (explicit boolean forces elevated audit). Produces a
**distinct audit class** `part2-break-glass` with `elevated: true`, the reason
captured, and a **PHI-safe** audit entry (test asserts no diagnosis code / display
leaks). Never a silent override — it always emits the elevated audit record.

### Re-disclosure marker
Whenever data is disclosed (consent or break-glass) the decision carries
`reDisclosureProhibited: true` and the `PART2_REDISCLOSURE_NOTICE` (42 CFR 2.32) that
must accompany the disclosure. The durable marker also travels **with the node**: a
restricted `Condition` carries `reDisclosureProhibited: true` in its properties.

### Restricted lens enforcement (both backends)
- `whole-person` **excludes** the SUD `Condition` without consent, keeps the plain BH
  condition — on pg-mem and the Neo4j fake.
- `part2-restricted` lens is **empty without scope**, **includes** the node **with**
  the consent- or break-glass-derived scope.

## 3. What F2 closes vs. what remains for I8A

**Closed now:** correct two-factor segmentation basis; restricted projection carried
transform -> envelope -> RESTRICTED node; consent-scope check (recipient + purpose
directed release); held-restricted (not dropped) when absent; break-glass with a
distinct elevated PHI-safe audit class; re-disclosure prohibition marker + notice.

**Remains for I8A (honest scope):** a consent registry of record and full lifecycle
management — capture UI, revocation propagation to already-projected nodes, expiry
sweeps, and persistence of the Part 2 audit stream to the durable audit store. This
wave delivers the correct basis + enforcement primitives, not the consent-management
system.

## 4. Tests (21 new)

- **Pipeline (8)**: BH normalization at T1; quarantine of the coding-less record;
  hints stripped from payload; SUD-in-program gets the Part 2 label; SUD-in-hospital
  does NOT (over-restriction guard); non-SUD BH does NOT; the two-factor basis table;
  end-to-end `runPipeline` propagating exactly one Part 2-labeled envelope.
- **Graph (8)**: associative `HAS_CONDITION`; restricted SUD node with Part 2 +
  re-disclosure marker + labels; both backends identical; whole-person excludes the
  restricted node without consent; part2-restricted lens empty/populated by scope;
  consent-directed disclosure; held-restricted (node retained); break-glass audited.
- **Namespace pin (5)**: behavioral-health domain id, node kind, edge type, both
  registries, and every emitted eventType claimed by exactly the BH spec.

## 5. Verification

- `npx tsc --noEmit` -> **0**.
- `npx vitest run` (new BH + namespace suites) -> **32 passed**.
- `npx vitest run tests/governance` -> **31 passed** (fail-closed seams intact).
- `bash check-file-sizes.sh` -> **PASS** (ratchet intact; every new file <= cap:
  part2Basis 134, adapter 169, mapping 73, consent 198, tests 134/175/252).
- Full suite: **1131 passed, 91 skipped, 1 expected-fail, 1 failed**. The single
  failure is `tests/pipeline/claimsFinancial.test.ts` — a **Wave B** file (claims/pa,
  outside this wave's scope; a PHI token `patient.reference` in their quarantine
  `fieldPaths`). All behavioral-health + F2 + governance + namespace tests are green;
  the Wave B failure is for that wave / Wave D convergence to resolve.

## C9 coverage matrix (Wave A row added)

| Domain | id | Tier | Adapter | Mapping | Node / Edge | Arrival | Part 2 |
|---|---|---|---|---|---|---|---|
| Behavioral health | `behavioral-health` | T1 | behavioralHealth | behavioralHealth | Condition / HAS_CONDITION | batch | SUD subset RESTRICTED (2-factor basis) |
