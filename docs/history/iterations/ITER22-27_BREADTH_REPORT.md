# Iterations 22–27 — Breadth program (the per-iteration follow-on items)

Six focused follow-on waves closing the breadth items the main program (I12–I21) scheduled. Each ran
the full framework v1.5 loop (DoR → seam-first build → tsc/tests/E14/E15/demo gates → provenance →
sync). Every module is wired to a real entry point (E14 proven), demo preserved throughout.

| # | Wave | Delivered | Route | Gate |
|---|------|-----------|-------|------|
| I22 | **HW1-B** reliability | circuit-breaker+timeout (HS-03), deterministic scheduler for the projection drain + reconciliation (REC-03/HS-02), observability (metrics/latency/SLO), readiness=liveness (HS-06) | `/api/ops/health` | tsc0·5 tests·E14 574→581 |
| I23 | **HW2-B** compliance | HIPAA accounting-of-disclosures + accountable/exempt classification + 6-year retention (AUD-10); break-glass records a disclosure | `/api/ops/disclosures` | tsc0·3 tests·E14 581→583 |
| I24 | **HW-FIN-B** financial | encounter-submission pipeline (999/277CA/MAO-002 reconciliation + resubmission, the C-SUB pipeline half), COB order-of-benefits | `/api/finance/submission` | tsc0·6 tests·E14 583→587 |
| I25 | **HW-AI-B** equity | fairness / disparate-impact monitoring (EEOC four-fifths rule) over AI-influenced decisions | `/api/ops/fairness` | tsc0·4 tests·E14 587→589 |
| I26 | **HW4-B** whole-person | holistic-context SEAM (WPC-01/02): mock=authored (demo intact), production=projected graph, fail-closed | `/api/wpc/context` | tsc0·3 tests·E14 589→591 |
| I27 | **HW5-B** test breadth | property/fuzz tests (6 invariants × 300 seeded runs = 1,800 assertions) over the hardening logic | (test-only) | tsc0·6 tests |

## What this closed
- **HS-03 / HS-06 / REC-03 / HS-02** — external seams now have breaker+timeout; the projection drain +
  reconciliation are real scheduled jobs; readiness = actual liveness (no stuck breaker), not config.
- **AUD-10** — a member/OCR can get an accounting of disclosures; break-glass over a consent opt-out is
  correctly recorded as an accountable disclosure; retention is enforced (flag, never auto-delete).
- **The "no risk revenue earned" Crit** — encounters are only earned when ACCEPTED (no rejecting ack at
  999/277CA/MAO-002); rejected ones drive a bounded resubmission worklist; COB prevents overpayment/FWA.
- **The equity Crit** — AI-influenced decisions are monitored for disparate impact (four-fifths rule),
  small samples not flagged, reports for human review (never auto-acts).
- **WPC-01/02** — the projected graph now reaches a real route through the holistic-context seam; the
  demo's authored context is the mock disposition, unchanged.
- **Test effectiveness** — 1,800 randomized invariant assertions on top of the unit tests + mutation gate.

## Cumulative gate (after I27)
tsc 0 · E14 122/122 (reachable 535 → 591 across the whole program) · demo-preservation golden unchanged
except additive seam entries · provenance 111 rows E11-clean · all hardening + breadth tests green.

## Still open (needs live infra — the honest NS-05 ceiling; named, not silent)
Contract/Inferno/Touchstone suites wired into CI, real-Postgres testcontainer concurrency, the D4
load/soak execution, chaos/failure-injection — all require provisioned infra and are enumerated in
`docs/framework/GO_LIVE_GATES.md`. The durable production dispositions of every seam (pg stores, live
feeds, real X12 transport, the projected-graph aggregator) are registered as fail-closed hooks awaiting
their backends. Plus the HW6 policy-fidelity register items (licensed terminology content).
