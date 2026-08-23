# Iteration 21 — HW6: Policy-fidelity backlog (register + one ready item)

Phase 3 close (program close) · framework v1.5 · constraints #1–#3. Non-blocker per the plan.

## What landed
- `docs/framework/HW6_BACKLOG_REGISTER.md` — the E8 living-risk register for the 9 remaining
  policy-fidelity items (SNOMED subsumption, ICD rollup, reverse/transitive translate, HCC V28 content,
  UCUM grammar, Gravity SDOH, survivorship tiebreak table, field-level Part 2, consent-revocation
  propagation), each with status + owner + where it plugs in. None gates a pilot.
- **HW6-2 built + wired** — `src/lib/finance/riskAdjustment/icdRollup.ts`: `icdCategory` / `icdChapter`
  / `rollupWithheldByCategory`. Wired into the existing `/api/risk-adjustment/hcc` route response
  (`withheldByCategory`) so a RADV analyst gets a category-grouped remediation worklist. Tested.

## Why the rest stays in the register (honest)
The remaining items are either gated on LICENSED external content (SNOMED, CMS HCC V28) — the NS-05
ceiling, not a code gap — or bounded fidelity refinements the demo and Phase 1–2 controls do not depend
on. Forcing them into a build would add code faster than value; the register schedules them properly.

## Gate results
tsc 0 · icdRollup tests 3 pass · E14 122/122 (reachable +1, WIRED) · demo-preservation 26 pass.

## Program close
This completes the 10-iteration hardening program (I12–I21) across Phases 1–3, run under framework
v1.5, with the demo preserved at every step and the "unwired realness" backlog burned down 134 → 122.
