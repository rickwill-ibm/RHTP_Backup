# Iteration 12 — HW0: Demo-preservation harness + installer profiles + parity gate

Phase 1 · SAFETY NET (must precede all wiring) · framework v1.5 · governing constraints #1–#4.

## Definition of Ready (v1.5)
- NFR/regulatory manifest: determinism (golden must regenerate byte-identically), zero-backend
  runnability (constraint #3), no demo regression (constraint #2), external-measures preserved
  as authored mock (constraint #4).
- Lens-coverage: negative-space (what demo surface is unguarded), stub-legitimacy (is the gate
  real or cosmetic), engineering (determinism), domain-fidelity (are the right payer panels pinned).
- Consumes: none (foundation). Freezes for downstream: **C-DEMO** (demo golden + `check:demo` gate;
  `SEAM_PARITY` E15 registry).

## What landed (all real, gated)
- `src/lib/demoPreservation/` — `fingerprint.ts` (canonical-JSON + FNV-1a, volatile-field
  normalizer), `capture.ts` (13 authored demo panels → deterministic fingerprints), `shape.ts`
  (structural shape extraction + `assertShapeEquivalent` = E15), `parity.ts` (7-seam frozen-shape
  registry + `assertSeamParityWithProduction`), `index.ts`.
- `tests/demoPreservation/` — `demo-preservation.test.ts` (golden compare, 13 panels) +
  `seam-parity.test.ts` (frozen seam shapes + installer mock-default lock). Goldens:
  `demo-golden.json`, `seam-shapes-golden.json`.
- `docs/framework/INSTALL_PROFILES.md` — frontend-only+mock as a tested first-class profile.
- `docs/framework/PROGRAM_SPINE.md` — the I12–I21 dependency graph + interface registry + phase gates.
- `package.json` — `check:demo` script, wired into `check:framework`.
- `check-wiring.mjs` (E14) — exempts the `demoPreservation/` gate-harness namespace (reached by
  tests + the gate by design, not unwired production).

## Demo surface pinned (the golden)
graph.nodes(55) · graph.edges(77) · graph.lenses(6) · graph.activeSignals(5) · smart.cdsCards(5) ·
smart.orderCatalog(19) · smart.careTeamCandidates(3) · roster.patients(12) · roster.providers(10) ·
measures.stars(4) · measures.hedis(4) · measures.mips(3) · config.dataModes(22). Volatile demo
timestamps are normalized so the golden is deterministic (proven: two consecutive runs identical).

## Gate results
- tsc --noEmit: **0**.
- demo-preservation + parity suite: **26 tests pass**; deterministic across repeated runs.
- E14 wired-path: **134/134 (PASS)** — the harness namespace is a first-class exemption.
- Constraint #3 lock: every seam defaults to `mock`; zero-backend resolution proven by test.

## Production-Readiness / ceiling
HW0 is a gate, not a runtime capability — "production-ready" here = the gate is real, deterministic,
and CI-wired. It now guards every later iteration: HW1–HW6 must keep `check:demo` green.
