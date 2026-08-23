# Iteration 7 summary — six sensitive + financial domains + F2 (42 CFR Part 2) closure

Record **11/20 → 17/20**. Six C9 domains added across three build waves, converged in
Wave D with the standing E9 fail-open sweep, the mandatory three-persona red-team, and
register F2 advanced. Two Unacceptable fail-opens found and fixed. tsc 0, full suite
green, governance green, ratchet intact.

## What shipped

| Wave | Domains | Notes |
|---|---|---|
| A (high care) | behavioral-health (T1) | BH Conditions + SUD subset; **F2 42 CFR Part 2**: two-factor basis, restricted projection, consent-scope, break-glass, re-disclosure |
| B | claims-financial (T1), pa-lifecycle (T1) | Claim→ClaimResponse→EOB golden-thread chain with CARC/RARC; PA status lifecycle as dated intervals, capture-vs-authoritative boundary compile-checked |
| C | assessments (T1), caregiver-household (T1), documents (**T2**) | QuestionnaireResponse; RelatedPerson (role); DocumentReference honestly T2 (`computable:false`, pointer not parsed) |
| D | convergence + red-team + F2 | union complete (17), pins green, 2 Unacceptable fixed, F2 advanced |

## Two progress numbers

- C9 record-domain coverage: **11/20 → 17/20** (remaining 3 gated on live feeds GB-6).
- Test count: **1132 → 1139 passing** (+7 E9-fix tests), 1 expected-fail, 91 skipped.

## Unacceptable fixed (E9 fail-open sweep)

1. **I7D-1** — Part 2 basis fell open on a missing/ambiguous program signal: SUD
   content with unknown provenance projected as disclosable. Fixed with three-state
   `classifyProgram` + tri-state `federallyAssisted`; SUD content over ambiguous
   provenance now fails SAFE to Part 2-restricted, over-restriction guard preserved.
2. **I7D-2** — lens `scopeCovers` disclosed an unlabeled restricted node under
   NO_CONSENT (vacuous `every`). Fixed fail-closed: an unlabeled restricted node
   requires an explicit Part 2 grant.

## F2 (42 CFR Part 2) — ADVANCED

Basis + enforcement CLOSED: correct two-factor segmentation (2.11/2.12), fail-safe on
ambiguity, restricted projection both backends, consent-directed release
(recipient+purpose+segments), held-restricted-not-dropped, break-glass distinct
elevated PHI-safe audit (2.51), re-disclosure marker + 2.32 notice, fail-closed
enforcement. Residual **F2-b (CRITICAL → I8A)**: consent registry of record, revocation
propagation, break-glass TTL enforcement, minimum-necessary field-level, durable Part 2
audit persistence — the consent-management system.

## Red-team disposition

- R1 (Part 2 + financial-integrity): 8 findings (1 Unacceptable→fixed, 4 HIGH, 3 MED).
- R2 (negative-space): 9-item missing-list; restricted-node handling on both backends
  confirmed present (not a gap).
- R3 (stub-legitimacy): 4 Acceptable + 1 with a HIGH caveat, 0 Risky, 2
  Unacceptable→fixed. part2Consent confirmed not a fail-open stub; documents confirmed
  honest T2.

New CRITICAL: F2-b (I8A). Other new findings HIGH/MED owned by I7 (PA reconciliation),
I8 (claims/assessment/caregiver intelligence), I8A (Part 2 lifecycle, claims linkage,
COB). All routed to the register.

## Verification

tsc 0 · vitest 1139 passed / 1 expected-fail / 91 skipped · governance 31 passed ·
namespace pins 71 passed · size ratchet PASS · console.* 0 · deterministic clock ·
C9 17/20 · register updated · DRY.

## Carried forward to I8A / I8 / I7

- **F2-b (CRITICAL, I8A)**: Part 2 consent lifecycle (registry, revocation, TTL,
  min-necessary field-level, audit persistence).
- **Claims (I8/I8A)**: chain-integrity existence checks, CARC group codes + COB,
  void/reversal, provider identity linkage.
- **PA (I7/I8A)**: appeal timers, drift detection vs authoritative machine.
- **Documents (I8/I9)**: retrieval + virus-scan + parse-to-T1.
- **Assessments/caregiver (I8)**: scoring/banding, relationship end-dating.
