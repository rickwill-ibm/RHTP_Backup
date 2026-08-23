# Iteration 0 (Hardening) — Summary

Three cycles, all DRY. Baseline 223 tests → 519 passing (+296), 6 documented expected-fail findings, 64 capability-pending skips. tsc 0, ratchet intact, app compiles.

## Cycle 1 — mechanical + boundary
- Persona-in-logic defects fixed (id-minting, dispatch keys, page fallbacks) via new src/lib/config/demoDefaults.ts; ~100 legitimate demo-data files classified and left.
- Determinism: 45 call sites across engines/services routed through new src/lib/clock.ts seam (inject clock/rng).
- Logging: new src/lib/server/log.ts (structured, PHI-safe); zero console.log/debug remain in src; one live PHI redaction.
- 25 API routes covered: 107 route tests (auth/authz/validation/happy/PHI-safe), 9 named infra skips.
- Mode registry: src/lib/config/dataMode.ts — mock|seeded|production per seam, session-override > per-seam env > global > default-mock; consent + FHIR-store wired, graph/SDE anchored. This is the mock→production config switch.

## Cycle 2 — domain deep passes
- Property tests for match, policy, adequacy, golden-thread, consent (~3,000 generated cases). Found + fixed a REAL match bug family: blank/whitespace fields produced false matches across deterministic rules AND probabilistic tier.
- Care-plan monolith extracted: 5 frozen files 1,269 → 66 lines (thin delegates); new src/lib/carePlan/ (14 modules ≤400 lines). DP-4 oracle: 6 golden fixtures + property invariants (goal-has-intervention, citation-required, SDOH addressed-or-deferred, deterministic, FHIR-conformant). 9 findings documented (contraindication input absent, etc.).

## Cycle 3 — adversarial scenario + e2e + security
- Security lens: found 2 HIGH (consent-read bypass, IDOR), fixed the match consent-gate; 4 MED/LOW documented with file:line + fix recs; PHI-fuzz + AI-guardrail tests.
- Corpus: 15 of 70 cases now executable scenario tests; 55 registered as capability-pending skips (every case accounted).
- e2e/a11y: C5 demo walkthrough + dual-mode + axe specs authored (CI-runnable; live run CI-pending on sandbox server limitation).
- Fixed a pre-existing Next.js illegal-page-export bug (agent-library) via extraction to coalition.ts.

## Carried findings (documented, not silently fixed)
- Match: none open (fixed). Care plan F1-F9: contraindication input, gen-time mutation, hardcoded financial entanglement, keyword clinical typing — architectural, tracked.
- Security: consent-read bypass on fhir/evidence passthrough routes (HIGH) — needs the same gate the match route now has.
- Convention gates (boundaries lint, error-level any/console) still need one npm/CI session.
