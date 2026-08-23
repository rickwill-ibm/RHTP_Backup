# Iteration 6 — Summary (four care-coordination domains + register fold-in)

Iteration 6 grew the C9 record-domain corpus from **7/20 → 11/20** by adding four
FHIR-JSON T1 domains through the L7 domain template, then closed two carried
register findings and ran the standing three-persona red-team (L9).

## Waves

| Wave | Delivered |
|---|---|
| **A** | `care-team` (extended the I2 care-team mapping WITHOUT breaking the lens) + `goals-tasks` (Goal + Task, Task.focus→Goal linkage). |
| **B** | `referrals` (ServiceRequest; performer kept raw, `deferred-I8A`) + `immunizations` (CVX). |
| **C** | Register fold-in fixes (idempotency HIGH + 834 CRITICAL), convergence, red-team. |

## Register findings closed / advanced

- **F1 (CRITICAL) — CLOSED (add-vs-term).** 834 now parses INS-3 (021/001/024/030)
  + DTP*349; a termination disenrolls (`terminated`, `periodEnd`, closed
  `HAS_COVERAGE` validity), an add stays `active`, an unknown code is fail-closed.
  Full 834 code-set fidelity (reinstatement, retro-term span, COB) honestly deferred.
- **R1-DL2 idempotency HIGH — CLOSED.** The dead-letter retry/replay path reuses the
  NS-04 idempotency primitive: terminal short-circuit + claim-once
  `(record-id + action)` in the `dead-letter-review` consumer namespace before any
  effect. A double-clicked/replayed retry injects exactly once.

## Domain coverage after Iteration 6

11/20: coverage, encounter, sdoh, medications, labs-vitals, allergies, procedures,
**care-team, goals-tasks, referrals, immunizations**. `WpcDomain` union complete;
namespace pins split into frozen main + `.waveA`/`.waveB` companions with pointers.

## Red-team disposition (Wave C)

- **R1 (Domain-Fidelity): 5** — 2 HIGH (referral loop-closure absent; goal status
  transitions absent), 3 MED (care-team temporality; immunization forecasting;
  834 add-vs-term only). → I6/I7/I8A.
- **R2 (Negative-Space): 7-item missing-list** — referral loop-closure state machine,
  care-team churn, goal achievement, immunization dedup, unknown-CVX handling,
  performer resolution, 834 reinstatement/retro-term/COB + retry-after-reject.
- **R3 (Stub-Legitimacy): 3 Acceptable, 0 Risky, 0 Unacceptable** (1 MED: optional
  idempotency param). One latent fail-open (834 unknown-as-active default) found in
  self-review and FIXED to fail-closed-loud before merge.
- **Unacceptable fixed: 1.** No new CRITICAL.

## Verification

- `npx tsc --noEmit` = 0.
- `npx vitest run` = fully green (1038 passed, 1 expected-fail, 91 skipped).
- `bash check-file-sizes.sh` = PASS (ratchet intact).
- `npx vitest run tests/governance` = 31 passed.

## Verdict: **DRY**

Fixes reuse existing seams (idempotency primitive, in-place 834 adapter + coverage
mapping) rather than duplicating logic; new domains follow the single template.

## Standing gaps carried forward (owning iteration)

- **I7**: referral lifecycle / loop-closure, care-team temporality, care-plan goal
  achievement.
- **I8/I8A**: EMPI survivorship (F3), provider/NPPES resolution (F5), immunization
  dedup + intelligence, 834 reinstatement/retro-term/COB, 42 CFR Part 2 (F2).
- **I9**: DLQ metrics/alerting/reconciliation (NS-02), real-infra verification (NS-05),
  real `$validate` (F4).
