# Iteration 7 — Wave D: convergence + E9 fail-open sweep + red-team panel + F2 verification

Wave D converges the three Iteration-7 build waves (A behavioral-health/Part 2, B
claims-financial/pa-lifecycle, C assessments/caregiver/documents), runs the standing
E9 fail-open sweep and the mandatory three-persona red-team (R1 42 CFR Part 2 /
privacy-law + financial-integrity, R2 negative-space, R3 stub-legitimacy), fixes the
Unacceptable findings, advances register F2, and proves the composite Definition of
Done. Record 11/20 → **17/20**.

## 1. Convergence (cross-agent)

Three waves edited the shared registries and three per-wave namespace companion
files. All coherent, no merge artifact:

- **`src/lib/pipeline/types.ts` `WpcDomain` union — complete at 17**: coverage,
  encounter, sdoh, medications, labs-vitals, allergies, procedures, care-team,
  goals-tasks, referrals, immunizations, claims-financial, pa-lifecycle,
  behavioral-health, assessments, caregiver-household, documents.
- **`src/lib/pipeline/index.ts`**: all six new adapters exported
  (`behavioralHealthAdapter`, `claimsFinancialAdapter`, `priorAuthLifecycleAdapter`,
  `assessmentAdapter`, `caregiverAdapter`, `documentAdapter`) plus the Part 2 basis
  surface (now also `classifyProgram`, `RECOGNIZED_NON_PART2_PROGRAM_TYPES`,
  `ProgramClass`).
- **`src/lib/graph/mapping/index.ts` `MAPPING_SPECS`**: all six specs imported and
  appended; 17 specs total, disjoint by eventType.
- **Namespace pinning (E3)**: `domainNamespaceIntegrity.wave{A,B,C}.test.ts` each own
  their pins — waveA (care-team, goals-tasks, **behavioral-health** incl. the Part 2
  restricted surface), waveB (referrals, immunizations, **claims-financial**,
  **pa-lifecycle**), waveC (assessments, caregiver-household, documents). The frozen
  main file keeps ≤500-line-cap pointer NOTEs to each companion — updated this wave so
  the notes name the Iteration-7 domains too. 71 pin tests green.
- **Determinism (clock seam)**: every `new Date(...)` in the six adapters + six
  mappings + the two Part 2 modules wraps injected `deps.now()`; no raw `Date.now()` /
  `new Date()` / `Math.random`.
- **`console.*` = 0** across all new files. **Ratchet PASS** (largest new src
  part2Basis 219, well under 400; every touched file under cap). **BFF-only** intact
  (no route reaches a store directly). **No merge artifact** (conflict-marker scan
  clean).

## 2. E9 fail-open sweep (standing check) — 2 Unacceptable found + FIXED

Swept the six new adapters/mappings + `part2Basis.ts` + `part2Consent.ts` for
fail-open shapes: `?? <default>` / `|| <default>` on a status/mode/config/label,
silent catch, any default that turns a restricted record permissive.

**I7D-1 (Unacceptable → FIXED) — Part 2 basis fell open on ambiguity.**
`evaluatePart2Basis` labeled Part 2 only on an affirmative federally-assisted SUD
program match; SUD content (F10-F19) with a MISSING, empty, UNRECOGNIZED, or
unknown-federal-assistance program context returned `part2:false` → projected as a
DISCLOSABLE Condition. "Not a recognized SUD program" and "provenance unknown" shared
one disclose path — a missing segmentation signal defaulting to disclosable, on the
most sensitive record class in the build. **Fix:** three-state
`classifyProgram(facilityType, federallyAssisted?)`
(`federally-assisted-sud-program` / `recognized-non-part2` / `ambiguous`) +
a `RECOGNIZED_NON_PART2_PROGRAM_TYPES` data table; SUD content over an `ambiguous`
program now FAILS SAFE to Part 2-restricted. The adapter carries `federallyAssisted`
TRI-STATE (`triBool`, undefined = source omitted it) so an absent flag reads as
ambiguous, not silently false. The over-restriction guard is preserved: an
affirmatively-recognized general-medical setting still discloses SUD content. +6 tests.

**I7D-2 (Unacceptable, latent → FIXED) — lens disclosed an unlabeled restricted node.**
`scopeCovers` (lenses.ts): a node flagged `restricted:true` with no restricting label
past its kind + `Restricted` produced an empty set, and `restricting.every(...)` is
vacuously TRUE → visible under NO_CONSENT. Unreachable via the current Part 2 path (a
Part 2 node always carries `42-CFR-Part-2`) but a fail-open in the shared consent gate
every lens runs through. **Fix:** an empty restricting-label set now fails CLOSED — an
unlabeled restricted node is covered only under an explicit Part 2 grant. +1 test; all
pre-existing Part 2 enforcement tests stay green.

Rest of the sweep clean: the only `catch` blocks are JSON-parse guards returning `[]`
(caught by reconciliation, not a restricted-record fall-through); pa-lifecycle
`referencedState(...) ?? 'Unknown'` is fail-SAFE (never an authoritative
Approved/Denied); claims `outcome ?? 'complete'` is a data-fidelity MED, not a
restricted-record fail-open.

## 3. Red-team panel

Full detail (findings, failure scenarios, owners) appended to
`verification/GAP_AND_STUB_RISK_REGISTER.md` (Iteration-7 section). Summary:

- **R1 (Part 2 / privacy-law + financial-integrity): 8 findings** — 1 Unacceptable→FIXED
  (basis ambiguity I7D-1); 4 HIGH (break-glass audited-distinct but not actually
  TIME-BOXED; Part 2 access audit does not persist; claims golden-thread integrity
  unenforced at projection — dangling ADJUDICATED_BY/EXPLAINED_BY to orphan nodes;
  CARC captured without the X12 GROUP code, losing CO-vs-PR member-liability); 3 MED
  (minimum-necessary is segment-level not field-level; adjudication outcome defaults
  optimistically; PA capture has no drift detection vs the authoritative paMachine —
  the boundary itself is SOUND and compile-checked).
- **R2 (Negative-Space): 9-item missing-list** — Part 2 consent revocation
  propagation; break-glass TTL enforcement + Part 2 audit persistence; document T2
  retrieval / virus-scan / parse-to-T1; claim void/reversal/adjustment; PA appeal
  timers / decision-due / auto-expiry; caregiver relationship end-dating; assessment
  scoring/banding; CARC group codes + COB/secondary-payer sequencing; minimum-necessary
  field-level. Restricted-node handling on BOTH backends confirmed PRESENT (pg-mem +
  Neo4j fake store `restricted` + labels; `scopeCovers` filters uniformly) — not a gap.
- **R3 (Stub-Legitimacy): 4 Acceptable + 1 Acceptable-with-HIGH-caveat, 0 Risky, 2
  Unacceptable→FIXED** — part2Basis now fail-safe; part2Consent confirmed NOT a
  fail-open stub (holds-restricted, not disclose-by-default; caveat R3-I7-1: no consent
  registry of record / audit persistence → F2-b); documents confirmed honest T2 (not a
  hidden T1); scopeCovers fail-closed; pa-lifecycle capture boundary fail-safe.

## 4. F2 (42 CFR Part 2) disposition — ADVANCED

**CLOSED:** two-factor segmentation basis on the right facts (2.11/2.12);
fail-safe restrict on ambiguous provenance (I7D-1); restricted projection both
backends; consent-directed release naming recipient + purpose + segments (+ expiry
honored); held-restricted (not dropped) when absent; break-glass distinct elevated
PHI-safe audit (2.51); re-disclosure marker on the node + 2.32 notice; enforcement
fail-closed on an unlabeled restricted node (I7D-2). F2's original defect (blunt drop
on a wrong basis, no consent-directed release / re-disclosure / break-glass) is
resolved.

**Remains → I8A as residual F2-b (CRITICAL):** consent registry of record + capture
UI; consent REVOCATION propagation to already-projected nodes + expiry sweeps;
break-glass TIME-BOX actually enforced (TTL on the granted scope); minimum-necessary
FIELD-LEVEL disclosure; Part 2 audit stream PERSISTED to the durable audit store. This
is the consent-management SYSTEM, honestly out of scope for this iteration.

## 5. Verification (composite DoD)

- `npx tsc --noEmit` → **0**.
- `npx vitest run` → **1139 passed, 1 expected-fail (pre-existing intentional), 91
  skipped** (158 files passed, 7 skipped). +7 over the Iteration-7 baseline (the E9 fix
  tests). Orchestrator re-verifies authoritatively.
- `npx vitest run tests/governance` → **31 passed** (fail-closed seams intact, E1
  governance green).
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; 75 frozen legacy files
  unchanged or smaller; every new/edited file under cap).
- Namespace pins → **71 passed** (4 files: main + waveA/B/C).
- Part 2 fails-safe: SUD content on missing/unrecognized/unknown-FA program →
  RESTRICTED (I7D-1 tests); unlabeled restricted node hidden without consent (I7D-2
  test).
- **C9 matrix: 17/20**. Remaining 3 gated on live feeds (GB-6).
- Register updated: **yes**.

## 6. DRY

DRY. The E9 fixes reused existing seams rather than adding parallel machinery: the
Part 2 basis fix extends the existing segmentation hint→label pipeline and the
data-is-not-code table pattern; the projection still flows through the shared
`resourceNode`/`isRestricted` envelope-read; the lens fix is a single guard in the one
shared `scopeCovers` all five lenses call. No duplicated logic introduced.

## C9 coverage matrix (Iteration-7 rows, 11/20 → 17/20)

| Domain | id | Tier | Node / Edge | Part 2 |
|---|---|---|---|---|
| Behavioral health | `behavioral-health` | T1 | Condition / HAS_CONDITION | SUD subset RESTRICTED (two-factor basis, fail-safe on ambiguity) |
| Claims financial | `claims-financial` | T1 | Claim, ClaimResponse, EOB / HAS_CLAIM, ADJUDICATED_BY (causal), EXPLAINED_BY | — |
| PA lifecycle | `pa-lifecycle` | T1 | PriorAuthRequest, PaStatusEvent / HAS_PA_REQUEST, HAS_PA_STATUS (dated), PA_FOR_SERVICE, PA_FOR_CLAIM | — (capture, non-authoritative) |
| Assessments | `assessments` | T1 | QuestionnaireResponse / ASSESSED_BY | — |
| Caregiver household | `caregiver-household` | T1 | RelatedPerson / RELATED_TO (role) | — |
| Documents | `documents` | **T2** | DocumentReference / DOCUMENTED_BY | — (honest T2, `computable:false`) |
