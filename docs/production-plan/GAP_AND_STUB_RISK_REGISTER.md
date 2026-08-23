# Gap & Stub Risk Register (retroactive verification of Iterations 0-4)

Produced 2026-08-22 by a three-lens verification panel (healthcare domain-fidelity, negative-space completeness, stub-legitimacy) run against the built code — the new standing verification model (L9), applied retroactively to answer "what else is missing?" This register is cumulative and is updated every iteration going forward.

Source detail: DOMAIN_FIDELITY_FINDINGS.md (26), NEGATIVE_SPACE_FINDINGS.md (31), STUB_LEGITIMACY_FINDINGS.md (26 stubs graded). Totals: ~83 findings. This register ranks the ones that change what we do; the source files carry the full list with failure scenarios.

## Why this register exists

The owner had to personally catch three gaps (identity was a hash stub, no terminology validation, external EMPI protocols missing) that the per-iteration adversarial passes did not. Root cause: those passes verified CONFORMANCE TO PLAN, not CORRECTNESS OF PLAN against healthcare reality, and nobody hunted NEGATIVE SPACE. A labeled stub passed the honesty check even when the stub was load-bearing enough to be a defect. This register is the corrective: verification now attacks three layers (see L9 in the plan).

## RESOLVED THIS SESSION (the 4 Unacceptable stub defects — fixed, not just logged)

These were fail-open / masquerading / dead-wiring defects, worse than the ones the owner caught because they actively mislead. All now fail CLOSED in production, demo still green (873 tests).

| id | defect | fix |
|---|---|---|
| U1 | dev-mock auth defaulted ON; a real-auth production deploy still served a fake "PA approved" from /api/pas/submit | dev-mock auth defaults OFF and is impossible when real auth is configured; explicit opt-in only |
| U2 | structural-only validator masqueraded as the US Core $validate gate and failed OPEN in production | production now fails CLOSED like the terminology gate; renamed so it is not mistaken for real $validate |
| U3 | real EMPI engine scored against 3 mock demo records in production | production throws EmpiCandidateSourceNotConfiguredError; mock source is mock-mode only |
| U4 | evidence "production ledger" seam was dead wiring; DATA_MODE_EVIDENCE=production was a no-op (in-memory) | callers routed through the seam selector; production selects the pg ledger and fails loud if unconfigured |

## CRITICAL — must be owned before any production pilot (open)

| id | area | gap | owning iteration |
|---|---|---|---|
| F1 | X12 834 | maintenance-type codes (INS-3) ignored, status hardcoded active; a termination transaction re-enrolls instead of disenrolling | I5/I6 pipeline hardening |
| F2 | 42 CFR Part 2 | segmentation is a blunt drop on a wrong basis; no consent-directed release, re-disclosure notice, or break-glass | I6 (sensitive domains) + I8A |
| F3 | EMPI | no golden-record survivorship, no cross-reference/link-unlink; id-only records mint a new member per feed, fragmenting the same person across feeds | I8A pillar 1 (external identity) |
| F4 | FHIR conformance | stage-4 gate is 4-field presence; no profile/cardinality/must-support/binding conformance (partly mitigated by U2 fail-closed, but real $validate still absent) | I8A pillar 2 + I9 (HAPI) |
| NS-01 | operability | quarantine, held-identity, and failed-outbox records are return values then dropped; no store, no operator surface, no reviewer UI | NEW BACKLOG: a dead-letter/review subsystem, pull into I5 |
| NS-03 | data lifecycle | no right-to-delete / erasure / retention / purge across the append-only stores (evidence, outbox, graph) | NEW BACKLOG: data-lifecycle iteration |

## HIGH — schedule explicitly (open, selected)

| id | area | gap | owning |
|---|---|---|---|
| F5 | provider identity | no NPI/NPPES resolution; performers/prescribers stay raw strings; breaks attribution, adequacy, referral routing | I8A pillar 1 |
| NS-02 | observability | zero metrics/tracing/correlation-id propagation across all subsystems; runs blind in production | NEW BACKLOG: observability iteration, wire into I9 |
| NS-04 | idempotency | consumer dedupe is in-memory per-call; outbox at-least-once republish can double-produce signals and double-send outreach | I5 convergence (bounded fix) |
| NS-05 | verification | live-integration-executed count is 0; every concurrency/durability guarantee proven only against fakes | I9 (real infra) closes it; until then, honest ceiling |
| R5 | security | sessionSecret defaults to a public constant (cookie forgery if unset) | NEW BACKLOG: quick fail-closed fix, pull into I5 |

## The standing pattern the codebase already has (and where it was skipped)

The repo has a correct safe-stub pattern: production mode throws *NotConfiguredError and fails closed (consent, terminology, dataSources, backbone all do this). Every Unacceptable finding was a place that pattern was skipped, inverted to fail-open, or wired-but-unused. GOING-FORWARD RULE (now L9 + a convention note): a new seam either uses the fail-closed NotConfigured pattern or the verification panel grades it Risky/Unacceptable.

## Disposition summary

- 4 Unacceptable: FIXED this session.
- 6 Critical open: mapped to owning iterations; 2 promoted to NEW BACKLOG (dead-letter/review subsystem; data-lifecycle) because they are cross-cutting subsystems, not domain fill-ins.
- ~15 High: scheduled or backlogged; 2 bounded fixes (NS-04 idempotency, R5 session secret) pulled into Iteration 5 convergence.
- Med + Acceptable: retained in the source files; revisited each iteration.
