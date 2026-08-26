# Iteration 11 - Wave D report: convergence, E9 sweep, five-persona red-team (incl. R5), E12, final closeout

Role: Convergence engineer (B3) + red-team panel host for the full five-persona panel.
Framework v1.3. Working tree: /home/claude/baseline (live). Waves A/B/C/F ran in parallel on
disjoint trees; this Wave D converges them, sweeps for fail-open, hosts the panel, runs the
claim-vs-evidence check, and writes the register FINAL closeout.

## Gate status (composite v1.3)

- `npx tsc --noEmit`: **0 errors**.
- `npx vitest run`: **1509 passed / 1 expected-fail / 91 skipped** (197 files). +74 over I10's 1435.
- `bash check-file-sizes.sh`: **PASS** (ratchet intact; no new violations; 75 frozen legacy files unchanged).
- `npx vitest run tests/governance`: **34 passed** (seam-disposition + namespace gates green).

## 1. Convergence to DRY - yes

Shared partitions reconciled; no duplication across waves:

- **WpcDomain union: 20, appended ONCE** (`src/lib/pipeline/types.ts`, single Wave-B append-only
  block: conditions, diagnostic-reports, family-history). Waves A/C did not touch the union.
- **Registries one-to-one:** `MAPPING_SPECS` = exactly 20 specs, one per domain
  (`src/lib/graph/mapping/index.ts`). Wave A's `providerRef` / `claimsIntegrity` / `carcGroup` /
  `adjustmentTerminology` are HELPERS reused by the existing claims/medication/care-team specs,
  NOT spurious registry rows - the count stays 20. `tests/pipeline/domainRecordCount.test.ts`
  pins 20 from BOTH the compile-time `WpcDomain[]` list and the runtime `MAPPING_SPECS`, set-equal.
- **Provider resolver REUSED not reimplemented:** the 8A-i `anchorProviderRef` sync resolver +
  the ProviderIdentity node namespace are the single source; `providerRefMutations` wraps it and
  is called by claimsFinancial (`SUBMITTED_BY`), medication (`PRESCRIBED_BY`/`DISPENSED_BY`), and
  care-team (`care-team.formed`). No resolver logic duplicated.
- **Terminology gate REUSED:** `routeAdjustmentCodes` calls `selectTerminologyService().validateCode`;
  conditions was added to `CODE_CARRYING_DOMAINS` so it runs the SAME stage-4 semantic gate.
- **Dead-letter store REUSED:** `holdOrphanClaims` persists orphans through the NS-01
  `getDeadLetterStore()` seam; no new store.
- **No new dataMode seam or seamDisposition** - every new capability reuses an existing
  fail-closed seam, so the governance gates are unchanged and green.
- Minor residual (cosmetic): `referral.ts` still inlines its own `anchorProviderRef` + node/edge
  emission (the pioneer path) rather than calling the new helper. The RESOLVER is shared; only the
  emission shape is duplicated. Noted for a future tidy, not a correctness issue.

## 2. E9 fail-open sweep - clean (0 fixed)

Every default path in the new/changed code is fail-SAFE by construction; no Unacceptable found:

- Orphan claim HOLDS, never dangles (`projectClaimsWithIntegrity`: no `ADJUDICATED_BY`/`EXPLAINED_BY`
  edge and no orphan node for an absent Claim; HELD to the dead-letter store).
- Unresolvable provider stays raw (`providerRefMutations`: anchor only on a check-digit-valid NPI;
  no NPI -> raw + `deferred-I8A`; the made-up NPI is never a node key, tested).
- Missing CARC group -> `indeterminate`, never a defaulted liability (`deriveMemberLiability`).
- Narrative-only diagnostic -> honest T2 (`computable:false`, no `REPORTS_RESULT`); never a claimed T1.
- Lifecycle default -> OPEN (referral `active`/loop `''`; goal `active`/`in-progress`); `met`,
  `statusTerminal`, `loopClosed` are DERIVED, never defaulted true.

The only `catch` blocks are JSON-parse guards returning `[]`; every clock wraps `deps.now()`;
`console.*` = 0.

## 3. Five-persona red-team panel

- **R1 Domain-Fidelity: 4 findings** (all MED) - diagnostic status optimistic-`final` default;
  claims outcome optimistic-`complete` default (carried R1-I7-7); family-history relative codes
  ungated; CARC group/NPI captured at the projector but not yet extracted by the claims adapter
  from a raw 835 (Wave A disclosed).
- **R2 Negative-Space: 7-item missing-list** - diagnostic T2 retrieval/parse; family-history
  cross-feed dedup; conditions HCC RAF scoring; referral SLA/timer + encounter reconciliation;
  structured goal target; `routeAdjustmentCodes` not pipeline-invoked + COB absent; field-level
  clinical survivorship tiebreaks.
- **R3 Stub-Legitimacy: 6 graded, all Acceptable** (0 Risky, 0 Unacceptable) - providerRef,
  claimsIntegrity (dead-letter reuse), carcGroup, adjustmentTerminology (Acceptable with a wiring
  caveat - pure, makes no admission decision, cannot fail open), diagnostic-reports T2 (honest),
  family-history relative-not-a-node (PHI-minimal).
- **R4 Governance: 2 findings + 1 verified-OK** - E12 is documented as mechanical but is not yet
  a suite test (agent-executed this wave); the framework-v1.3 distributable zip is not rebuilt
  (Wave F deferred to the orchestrator); no new seam/disposition, so governance gates unchanged.
- **R5 Verification / Cross-Examiner: 10 claims re-read hostilely -> 10 UPHELD, 0 DEMOTED.**
  f5b-resolved, claims-integrity, carc-group, conditions T1+gate, diagnostic T1/T2,
  family-history T1, record-20/20, referral-loop-closure, goal-status, tiebreak - each cited test
  drives the REAL projector/pipeline and exercises the requirement (the tiebreak test's "the two
  tiebreaks disagree on the same facts" is the anti-tautology proof; the claims-integrity test
  proves the orphan is HELD with no dangling edge; the provider test proves the invalid NPI is
  never a node key). No shallow-test green found. Full per-claim verdict table in the register.

## 4. E12 claim-vs-evidence - satisfied

Every register finding closed cites a real test id that EXISTS and passed in the current suite
(each read for depth by R5 and run green): F5-b -> `claimsProviderRef.test.ts`; R1-I7-5 ->
`claimsIntegrity.test.ts`; R1-I7-6 -> `carcGroup.test.ts`; R1-I6-1 -> `referralLifecycle.test.ts`;
R1-I6-2 -> `goalStatus.test.ts`; R1-8Ai-2 -> `survivorshipTiebreak.test.ts`; record 20/20 ->
`domainRecordCount.test.ts` + the three domain test files. No closed item lacks live evidence.

## 5. Register FINAL closeout

`verification/GAP_AND_STUB_RISK_REGISTER.md` gains the Iteration 11 FINAL BUILDABLE CLOSEOUT:
record 20/20; the 6 findings closed (F5-b, R1-I7-5, R1-I7-6, R1-I6-1, R1-I6-2, R1-8Ai-2) each
with its evidencing test; and the FINAL residual list = ONLY the non-buildable items (live
infra/NS-05, licensed content, external accreditation). Build status: **buildable-completion** -
every in-sandbox register finding is closed; the MED enhancements raised this wave are routed to I12+.

## Definition of Done (v1.3)

tsc 0; full suite green; size/ratchet PASS; no fail-open (E9 clean); seams fail-closed (E1, governance
green); convergence DRY; five-persona panel ran incl R5 with per-claim verdicts; E12 satisfied
(no closed item without a live test); zero new Unacceptable; register final closeout done; record
20/20. All met.
