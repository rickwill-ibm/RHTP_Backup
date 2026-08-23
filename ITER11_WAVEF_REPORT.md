# Iteration 11 - Wave F report: framework self-improvement (v1.2 -> v1.3)

Role: Framework author (B1 / spine), disjoint tree, DOCS ONLY under
`docs/framework/`. No product code touched. `src/` and `tests/` untouched (other
waves own those in parallel; this wave is fully disjoint).

## Summary

Added the R5 Verification / Cross-Examiner persona and the E12 claim-vs-evidence
enforcement gate, wired E12 into the composite Definition of Done, and bumped the
framework to v1.3. This is the "stronger verification agent to spot what conformance
review misses" the owner asked for, made mechanical.

## Starting state (important)

The `docs/framework/` package did not exist on disk. The framework had been operated
IMPLICITLY through the iteration and convergence reports (E1 seam-disposition
governance, E3 namespace pinning, E9 fail-open sweep, the three-persona red-team,
the "DoD composite v1.2") but was never extracted into files. As the framework
author for Wave F, I codified the operating framework into `docs/framework/` at
v1.3, grounding every persona and gate in what the corpus demonstrably shows the
build has been running:

- Personas R1-R3 are the panel named in every convergence report (Domain-Fidelity,
  Negative-Space, Stub-Legitimacy; see `ITER7-10 WAVED` reports and
  `verification/STUB_LEGITIMACY_FINDINGS.md`).
- Persona R4 codifies the U1-U4 Unacceptable-defect / governance lens
  (`verification/UNACCEPTABLE_FIXES_REPORT.md`, `GOVERNANCE_GATE_REPORT.md`).
- Gates E1 (seam disposition), E3 (namespace pinning), E9 (fail-open sweep) are the
  gates named explicitly in the reports; the remaining gates codify the recurring
  "DoD composite v1.2" checks (tsc 0, suite green, size ratchet, DRY convergence,
  honesty invariants, prose hygiene, fake-fidelity ledger, determinism).

## Changes

Four files created under `docs/framework/` (all new):

1. `docs/framework/SKILL.md` - v1.3. Version line records R5 + E12; the E-list is
   stated as E1-E12; references the persona list, enforcement kit, operating model,
   and the composite DoD. Includes a "How R5 and E12 fit together" section and the
   repackaging note.
2. `docs/framework/references/personas.md` - R1-R5. R5 is the new
   Verification / Cross-Examiner: for every prior `supported` / `fixed` / `closed` /
   `green` claim it re-reads hostilely (does it hold, is it a shallow-test green, did
   the fix open a new seam) and emits an UPHOLD/DEMOTE verdict per claim with
   rationale. R5 runs last and is bounded by E12.
3. `docs/framework/references/enforcement-kit.md` - E1-E12. E12 is the new
   claim-vs-evidence gate: every register `CLOSED` and every matrix `supported` item
   MUST cite a passing test id that EXISTS and actually exercises the claim; a closed
   item with no live evidence (missing id, vacuous pass, fake that does not model the
   property) is demoted to an open finding. E12 is added to the composite Definition
   of Done, alongside the requirement that the red-team panel now runs all five
   personas R1-R5 with R5's per-claim verdicts.
4. `docs/framework/references/operating-model.md` - the wave unit, namespace
   pre-allocation, the two progress numbers, and lessons L1-L8 (referenced by
   SKILL.md).

## Verification

- No code to compile (docs only); `src/` and `tests/` untouched.
- Internal consistency confirmed:
  - Version line, E-list, and references all say v1.3 / E1-E12.
  - `R5` present in SKILL.md, personas.md, enforcement-kit.md.
  - `E12` present in SKILL.md, personas.md, enforcement-kit.md.
  - personas.md has headings R1, R2, R3, R4, R5.
  - enforcement-kit.md has headings E1 through E12 (contiguous).
  - E12 appears in the composite Definition of Done list, and the DoD's red-team
    line requires personas R1-R5 with R5 uphold/demote verdicts.
- Style: no em dash followed by a space; no double spaces (verified by sweep across
  all four files).

## Repackage command (NOT run here; for the orchestrator to rebuild the distributable)

The framework is distributed as a zip of `docs/framework/`. Exact command:

```
cd /home/claude/baseline && rm -f docs/framework-v1.3.zip && zip -r docs/framework-v1.3.zip docs/framework
```

(Run from the repo root so the archive stores `docs/framework/...` paths. The author
of these docs does not run the repackage; the orchestrator rebuilds and syncs it.)

## Definition of Done

- R5 persona documented: yes (`personas.md`).
- E12 gate documented and wired into the composite DoD: yes (`enforcement-kit.md`).
- SKILL.md bumped to v1.3 with R5 + E12 noted in the version line, E-list, and
  persona/DoD references: yes.
- Internally consistent (E-list, DoD, persona list all mention R5 / E12 / v1.3):
  confirmed.
