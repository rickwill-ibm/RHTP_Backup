# Hardening Program Spine (I12–I21) — v1.5 program-level interface-freeze

The program-level analogue of the intra-wave interface-freeze. It exists so ten
hardening iterations build *against frozen contracts* instead of reworking each
other. Sequenced by DEPENDENCY + go-live risk, not severity. Governed by the four
owner-set constraints (seam-first / demo-preserved-at-all-costs / frontend-only+mock
install / external HEDIS-Stars measures) — see `verification/hardening/HARDENING_PLAN.md`.

## Cross-iteration dependency graph

```
HW0 (I12) demo-preservation gate + parity ── gates ──► every later iteration
        │
        ▼
HW-SEC (I13) TENANT/PLAN/LOB boundary ──── publishes TenantContext ──► HW1, HW2, HW3, HW-FIN, HW4
        │                                   (every durable store is tenant-scoped from day 1)
        ▼
HW1 (I14) durable substrate + HA + obs ── publishes Store<T>, Outbox consumer,
        │                                   Scheduler, ObservabilityContext ──► HW2, HW3, HW-FIN, HW4
        ▼
HW2 (I15) audit spine (durable ledger) ── publishes AuditSink, Disclosure API ──► HW3, HW-AI, HW-FIN, HW4
        │
        ▼
HW-AI (I16) human-decision INVARIANT ──── publishes DecisionGate (tier-independent) ──► HW-FIN, HW4
        │
        ▼   ── Phase 1 gate (safe-to-pilot) closes here ──
HW3 (I17) CRUD + correction/void + reprocessing ── publishes RecordLifecycle,
        │                                            Idempotency, Replay ──► HW-FIN, HW4
        ▼
HW-FIN (I18) MEAT + encounter submission + COB ── publishes SubmissionPipeline ──► HW4 (revenue view)
        │
        ▼   ── Phase 2 gate (operationally + financially correct) closes here ──
HW4 (I19) whole-person depth + DEQM measures ingestion (consumes ALL above)
        ▼
HW5 (I20) test-hardening + name non-code gates (threads through; owns net-new harnesses)
        ▼
HW6 (I21) policy-fidelity backlog cleanup
```

## Interface registry (frozen contracts each iteration PUBLISHES, later ones CONSUME)

| # | Iteration | Publishes (frozen interface) | Consumed by |
|---|-----------|------------------------------|-------------|
| C-DEMO | HW0 | `demoGolden` snapshot set + `check-demo-preservation` gate; `seamParity` descriptor (E15) | all |
| C-TEN | HW-SEC | `TenantContext { tenantId, planId, lob }` + `assertTenantScope()` authz predicate | HW1–HW4, HW-FIN |
| C-STORE | HW1 | `Store<T>` (tenant-scoped CRUD+list), `OutboxConsumer`, `Scheduler`, `Health.liveness()` | HW2, HW3, HW-FIN, HW4 |
| C-OBS | HW1 | `ObservabilityContext { metric, span, correlationId }` | all later |
| C-AUD | HW2 | `AuditSink.record(event)` (tamper-evident) + `DisclosureLog` | HW3, HW-AI, HW-FIN, HW4 |
| C-DEC | HW-AI | `DecisionGate.resolve()` — tier-independent human-decision invariant | HW-FIN, HW4 |
| C-LIFE | HW3 | `RecordLifecycle { update, void, amend }`, `Idempotency`, `Replay` | HW-FIN, HW4 |
| C-SUB | HW-FIN | `SubmissionPipeline` (EDPS/RAPS + 999/277CA/MAO-002 recon) | HW4 |
| C-MEAS | HW4 | `MeasuresIngest` (DEQM Measure/MeasureReport/Gaps adapter) | — |

Rule: an iteration may only CONSUME a contract that a prior iteration has FROZEN
(published + shape-tested). Freezing a contract = a typed stub + a parity/contract
test landed and green, BEFORE the consuming iteration starts. The tenant boundary
(C-TEN) is the keystone: HW-SEC publishes it before HW1 builds stores, so stores are
tenant-scoped by construction, not retrofitted.

## Phase gates (a phase does not start until the prior phase's contracts are frozen + production-ready)

- **Phase 1 (safe-to-pilot):** HW0, HW-SEC, HW1, HW2, HW-AI. Exit gate: tenancy +
  security + audit + HA + AI-accountability blockers closed; demo-preservation green;
  every new store tenant-scoped and observable. This is the pilot line.
- **Phase 2 (operationally + financially correct):** HW3, HW-FIN. Exit gate: CRUD/void/
  reprocessing real; MEAT + encounter submission wired; TCOC/PMPM/MLR from adjudicated
  dollars. Required before real member/claims volume.
- **Phase 3 (value depth + confidence):** HW4, HW5, HW6. Exit gate: whole-person depth
  wired to the real graph behind the seam; measures ingested (not computed); net-new
  test harnesses + named non-code go-live gates.

## Per-iteration Definition of Ready (opened before each iteration builds)

Each iteration opens with: (a) its NFR + regulatory manifest (the -ilities it must
meet, with acceptance criteria); (b) its lens-coverage map (the derived adversarial
lenses with owning personas); (c) the list of upstream contracts it consumes (must be
frozen); (d) the contract(s) it will freeze for downstream. Exit = Production-Readiness
gate verifies the manifest (not merely CI-green), demo-preservation gate green (E14/E15
+ demo golden), and every Critical fix passed the critical-finding protocol.

## Standing ceiling (NS-05, honest)
Live-infra cutover, licensed terminology content, and external accreditation
(Inferno/Touchstone/IHE/SOC2/pen-test) are process, not code. HW5 wires the suites so
they RUN the moment infra exists; the program does not claim them as closed.
