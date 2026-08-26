# Iteration 18 — HW-FIN: Financial / actuarial integrity (core: RADV-defensible risk adjustment)

Phase 2 (closes the phase) · program-spine contract **C-SUB** · framework v1.5 · constraints #1–#3.

## Definition of Ready
- NFR/regulatory manifest: no HCC is submittable without MEAT + source-document linkage (RADV-
  defensible); an unsupported diagnosis can be RETRACTED before submission; the pre-submission scrub
  withholds everything non-defensible/retracted; tenant-scoped + audited; demo-safe.
- Lens-coverage: financial/actuarial integrity (owning), compliance (RADV/CMS), negative-space
  (diagnoses captured with zero chart support), CRUD-correctness (retract lifecycle).
- Consumes: C-DEMO, C-TEN, C-AUD, C-LIFE (retract). Freezes for downstream: **C-SUB** (submission
  gate) — HW4's revenue view reads submittable/withheld from here.

## What landed (all real, WIRED, gated) — addresses the 6-Crit financial lens
- `src/lib/finance/riskAdjustment/meat.ts` — `assessRadvDefensibility(capture)`: requires ≥1 MEAT
  element (Monitored/Evaluated/Assessed/Treated) + a source-document reference + a valid face-to-face
  DOS + a valid rendering-provider NPI + a supporting ICD-10 — returns the PHI-safe deficiency list.
- `src/lib/finance/riskAdjustment/submission.ts` — `evaluateSubmission` (only a defensible, active dx
  is submittable), `retractDiagnosis` (pre-submission retract, ties to C-LIFE void), `scrubForSubmission`
  (partitions a batch into submitted vs withheld+reasons) — the defensible pre-EDPS/RAPS scrub.
- **Real entry point** — `src/app/api/risk-adjustment/hcc/route.ts`: POST (validate a capture batch) +
  DELETE (retract). Tenant-scoped per member (C-TEN), reviewer/ops/auditor authz, audited (C-AUD).
- Tests: `tests/finance/riskAdjustment.test.ts` (5) — defensibility, each deficiency class, retract
  withholds, batch scrub partitioning.

## Proof of wiring
E14: entries **229→230** (risk-adjustment route), reachable **564→568 (+4)** (the riskAdjustment
modules reached via a real route), lib orphans **122/122** (no new). Demo-preservation 26 pass.

## Gate results
tsc 0 · risk-adjustment tests 5 pass · E14 122/122 (reachable +4) · demo-preservation 26 pass.

## Phase 2 status
HW3 (CRUD/reprocessing core) + HW-FIN (financial-integrity core) complete → the plan's Phase 2
"operationally + financially correct" core: corrections re-project, voids retract, and only
RADV-defensible diagnoses earn risk revenue. Remaining HW-FIN breadth (the full EDPS/RAPS/Medicaid
submission pipeline with 999/277CA/MAO-002 acceptance-rejection reconciliation + resubmission, COB
order-of-benefits, duplicate/overpayment + FWA detection, TCOC/PMPM/MLR derived from adjudicated
dollars) is scheduled follow-on; the defensibility + retract keystone is production-real now.
