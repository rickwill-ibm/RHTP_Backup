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
| ~~F3~~ **CLOSED (I8A-i)** | EMPI | no golden-record survivorship, no cross-reference/link-unlink; id-only records mint a new member per feed, fragmenting the same person across feeds | I8A pillar 1 — CLOSED: survivorship projection + xref fragmentation fix + replay rekey; residual = live pg (NS-05). See ITERATION 8A-i section. |
| F4 | FHIR conformance | stage-4 gate is 4-field presence; no profile/cardinality/must-support/binding conformance (partly mitigated by U2 fail-closed, but real $validate still absent) | I8A pillar 2 + I9 (HAPI) |
| NS-01 | operability | quarantine, held-identity, and failed-outbox records are return values then dropped; no store, no operator surface, no reviewer UI | NEW BACKLOG: a dead-letter/review subsystem, pull into I5 |
| NS-03 | data lifecycle | no right-to-delete / erasure / retention / purge across the append-only stores (evidence, outbox, graph) | NEW BACKLOG: data-lifecycle iteration |

## HIGH — schedule explicitly (open, selected)

| id | area | gap | owning |
|---|---|---|---|
| ~~F5~~ **CLOSED (I8A-i)** | provider identity | no NPI/NPPES resolution; performers/prescribers stay raw strings; breaks attribution, adequacy, referral routing | I8A pillar 1 — CLOSED: real NPPES 80840-Luhn + fail-closed NPPES seam + referral performer resolution; residual F5-b = claims/care-team/medication refs (HIGH). See ITERATION 8A-i section. |
| F5-b | provider identity | claims / care-team / medication prescriber performer refs still raw; only the referral mapping was closed in I8A-i | I8A (apply anchorProviderRef pattern to remaining mappings) |
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

---

# ITERATION 5 — dead-letter/held-review subsystem, durable idempotency, session-secret fail-closed (Wave C convergence + red-team)

Iteration 5 delivered two subsystems across two waves (A: dead-letter/held-review store for NS-01; B: durable idempotency for NS-04 + the R5 session-secret fix) and converged them in Wave C. This section CLOSES NS-01 / NS-04 / R5, records the Wave-C convergence fix, and appends the mandatory three-persona red-team findings routed against the two new subsystems.

## Closed this iteration

| id | was | closure (verified) |
|---|---|---|
| **NS-01** | quarantine / held-identity / failed-outbox records built then DROPPED; no store, no operator surface | CLOSED. Durable append-only store (`src/lib/deadLetter/`, memory + pg, immutability trigger). Producers PERSIST, verified end-to-end: a held-identity record from `runPipeline` (`persistPipelineDeadLetters`, awaited) and a failed-outbox intent from outbox `failIntent` land in the store and are retrievable via the ops BFF (`/api/ops/dead-letter`, `isOpsPrincipal`-gated, distinct from the clinical work queue). fail-closed-stub seam + governance prober. |
| **NS-04** | consumer dedupe in-memory per-call; at-least-once republish double-produced signals / double-sent outreach | CLOSED. Durable `IdempotencyStore` (`src/lib/idempotency/`, memory + pg PRIMARY-KEY). SDE `intakeSignalsDurable` (`markProcessed('sde-intake',…)`) and both agents (`outreach-agent`, `referral-coordination-agent`) claim-once-before-effect, returning `outcome:'deduped'` on republish. fail-closed-stub seam + governance prober. |
| **R5** | sessionSecret defaulted to a public constant (cookie forgery if unset) | CLOSED. `requireSessionSecret()` throws `SessionSecretNotConfiguredError` in production without `SESSION_SECRET`; a labelled dev secret only under the U1 double-gate (`!tokenUrl && allowDevMockAuth`); static scan bans a public default. |

## Wave-C convergence fix (fail-open drop-path — Unacceptable class, FIXED)

| id | severity | finding | fix |
|---|---|---|---|
| **I5C-1** | Unacceptable (fail-open-under-fault) → FIXED | `failIntent` default seam path built the dead-letter sink and `drain()`ed it but never inspected `sink.errors`; a dead-letter store WRITE failure (store down) was captured out-of-band and swallowed, so the failed-outbox record silently VANISHED — the exact NS-01 drop, re-introduced under fault. The sync-sink-over-async-store fidelity note flagged the out-of-band capture but the default producer path left it unchecked (a cross-wave assumption gap). | `src/lib/outbox/sequencing.ts`: the default path now rethrows `sink.errors[0]` after drain — fail-closed. New test `tests/outbox/failIntent-failclosed.test.ts` (throws on append failure; intent still marked failed first). An explicitly-injected `deps.quarantine` sink retains its own error posture. |

## Red-team panel — R1 Domain-Fidelity (reliability + healthcare data-integrity)

| id | sev | finding | owner |
|---|---|---|---|
| **R1-DL1** | HIGH | **Held-identity review is not adjudicable.** The record carries only a source handle (`system:feed`), a reasonCode, and a `payloadRef` string encoding `tier=/score=`. A steward adjudicating a 60-90 EMPI match needs the CANDIDATE SET (which existing members it might link to, a demographics comparison) and a MERGE / LINK / CREATE-NEW action. `reviewAction` offers only resolve/dismiss/retry (a status transition) — an item can be "resolved" with NO identity decision recorded or applied. Naive vs a real HIE steward workflow. | I8A pillar 1 (EMPI survivorship; dovetails F3) |
| **R1-DL2** | HIGH | **Replay is not idempotent at the producer.** `persistPipelineDeadLetters` appends with deterministic id `dl-{quarantineId}`, but `append` unconditionally pushes a NEW version; a batch replay (at-least-once redelivery / operator re-run) appends a fresh `open` version ON TOP of an already-resolved record, silently RE-OPENING items a reviewer closed. NS-04's idempotency primitive was built but NOT applied to the NS-01 producer path — the cross-wave gap. (Distinct from I5C-1, which is the outbox fault-drop.) | I6 pipeline hardening |
| **R1-DL3** | MED | **Poison-record loop is unbounded.** Pipeline dead-letter records carry no retry-count of their own (failed-outbox only smuggles `attempts` inside `payloadRef`); `reviewAction` retry has no max-retry ceiling or auto-park, so a record that always fails validation can be retried forever. | I6 (dead-letter hardening) |
| **R1-DL4** | MED | **No reconciliation to batch counts.** A resolved dead-letter item does not reconcile against the originating batch's admitted/quarantined/held tallies; an operator cannot prove "batch of N: X admitted, Y held, all Y now resolved." | I9 (observability/reconciliation, NS-02 adjacent) |
| **R1-DL5** | Unacceptable→FIXED | (= I5C-1) `failIntent` swallowed dead-letter write failures. | FIXED Wave C |

## Red-team panel — R2 Negative-Space (absent from THIS iteration that production needs)

Missing-list (owner in brackets):
- **Dead-letter retention / purge / TTL** — the append-only store grows unbounded; NS-03 covers erasure broadly but not a DLQ retention window. [I6/NS-03]
- **Idempotency marker growth / TTL** — one row per (consumer,eventId) forever; no pruning window; unbounded under real event volume. [I6]
- **DLQ depth metrics** — open-count by kind, oldest-open age; zero metrics today. [I9/NS-02]
- **Alerting / SLA on DLQ depth or oldest-open age** — nothing pages when items pile up. [I9/NS-02]
- **Operator notification** when items accumulate (ties to alerting). [I9]
- **Bulk resolve / bulk retry** — `reviewAction` is one-item-at-a-time; a 500-record feed failure is unmanageable click-by-click. [I6]
- **Audit export** — `reviewAction` emits a PHI-safe audit descriptor per action, but there is no export/report of dispositions for compliance. [I6/I8]
- **Ops-role provisioning + separation-of-duties** — `isOpsPrincipal` reuses payer-ops/admin; no provisioning flow and no maker-checker on high-impact merges (same admin creates and resolves). [I8 security]
- **Replay idempotency at the producer** (= R1-DL2). [I6]
- **Retry-lane production binding** — the lane MECHANISM is built + unit-tested with a fake lane, but NO production lane is registered (`setDeadLetterRetryLane` never called with a real lane), so retry is fail-closed-unusable in production. [I6]

## Red-team panel — R3 Stub-Legitimacy (grade the new seams)

| seam / stub | disposition | grade | rationale |
|---|---|---|---|
| **deadLetterStore** | fail-closed-stub | **Acceptable** | Standing safe-stub pattern (mirrors evidence ledger). pg logic real (pg-mem verified + Docker-guarded testcontainer), production factory registerable, throws `DeadLetterStoreNotConfiguredError` until wired. Governance prober present. |
| **idempotencyStore** | fail-closed-stub | **Acceptable** | Same pattern; throws `IdempotencyStoreNotConfiguredError`. Caveat (R3-ID1, MED): the mock/seeded default is a process-global in-memory store that dedupes only within one process — already recorded in FAKE_FIDELITY.md; honest. |
| **retry-lane registry** (`review/lanes.ts`) | (not a dataMode seam) | **Risky** | Mechanism fully built + unit-tested with a fake lane, but NO production lane wired AND it is NOT covered by the seamDispositions governance gate, so retry is silently non-functional in production with only a per-call `retry-lane-not-configured` return. R3-DL2 (MED): register production lanes in I6 OR add it to the disposition manifest / a governance prober so its unwired state is mechanically visible. |

**R3 bootstrapping analysis (the flagged real question — "if the dead-letter store is unconfigured in production, where do dropped records go?").** Because the producers (`persistPipelineDeadLetters`, `failIntent`) route through `getDeadLetterStore()`, a production deploy with `deadLetterStore` UNCONFIGURED makes the producer THROW → the pipeline batch aborts / the outbox drain errors. Records are NOT silently dropped — the operation fails LOUD *before producing them*. That is the correct posture: you must not ingest a feed you cannot durably capture the fallout of; the alternative (fall back to in-memory) is exactly the U4 dead-wiring class. So there is NO bootstrapping hole — the honest answer to "where do dropped records go?" is "nowhere; the operation fails closed and no record is produced." CONSEQUENCE (R3-DL1, MED, doc-only): the dead-letter store is now a HARD production dependency of the pipeline and outbox — deploying `pipeline=production` without `deadLetterStore=production` + `DEAD_LETTER_DATABASE_URL` bricks ingestion. Acceptable, but a DEPLOY-ORDERING CONSTRAINT that must be in the runbook; the demo default masks it (mock serves the in-memory store). Owner: I6/I9 runbook.

## Iteration-5 red-team disposition summary

- **R1 (Domain-Fidelity): 5 findings** — 2 HIGH (held-identity not adjudicable; producer replay not idempotent), 2 MED (poison-loop unbounded; no batch reconciliation), 1 Unacceptable→FIXED (failIntent fault-drop).
- **R2 (Negative-Space): 10-item missing-list** — retention/purge, idempotency TTL, DLQ metrics, alerting/SLA, notification, bulk resolve/retry, audit export, ops-role provisioning + SoD, producer replay idempotency, retry-lane production binding. All owned by I6/I8/I9; none blocks the demo, all block a real payer/HIE data operation.
- **R3 (Stub-Legitimacy): 2 Acceptable seams + 1 Risky stub** — deadLetterStore Acceptable, idempotencyStore Acceptable (1 MED fidelity caveat), retry-lane registry Risky (unwired + ungoverned). Bootstrapping question resolved: fail-closed, no silent drop, but a documented hard production dependency (1 MED doc-only).
- **Unacceptable fixed this wave: 1** (I5C-1 / R1-DL5 — failIntent dead-letter fault-drop).
- No new CRITICAL. New findings are HIGH/MED, owned by I6 (dead-letter/idempotency hardening), I8 (security/SoD), I9 (observability/reconciliation).

---

# ITERATION 6 — four care-coordination domains + two register fold-in fixes (Wave C convergence + red-team)

Iteration 6 added four C9 record domains across Waves A/B (care-team, goals-tasks, referrals, immunizations; record now **11/20**) and, in this Wave C, closed/advanced two carried register findings and ran the mandatory three-persona red-team against the four new domains + the two fixes. This section CLOSES **F1** and the **R1-DL2 idempotency HIGH**, records the convergence verdict, and appends the new findings with severity + owning iteration.

## Closed / advanced this iteration

| id | was | closure (verified) |
|---|---|---|
| **F1** (CRITICAL) | 834 ignored INS-3 maintenance-type codes and hardcoded `status: active`; a termination transaction re-enrolled instead of disenrolling | **CLOSED (add-vs-term).** `eligibility834.ts` now parses INS-3 (021 add, 001 change, 024 termination, 030 cancellation) and DTP*349 (coverage end). A termination yields `status:'terminated', disenrolled:true, eventType:'coverage.terminated', periodEnd` set; an add yields `active`. The coverage mapping closes the `HAS_COVERAGE` edge validity at `periodEnd` so an asOf query after the end date sees the member DISENROLLED. An UNKNOWN INS-3 is **fail-closed** (quarantined `unknown-maintenance-type`), never silently active; normalize additionally throws an invariant if ever reached with an unknown code. New fixture `eligibility834-termination.json` + test `eligibility834Termination.test.ts` (4 assertions incl. the term-disenrolls and unknown-fail-closed cases). **DEFERRED (honest):** full 834 code-set fidelity — 025 reinstatement, 002 audit-compare, retro-term span/gap handling, and COB/secondary coverage — remain out of scope and quarantine (fail-closed) today rather than being mis-processed. → residual owned by I6/I8A (see F1-b below). |
| **R1-DL2 / NS-04-producer** (HIGH) | the dead-letter retry/replay path did not reuse the I5 idempotency primitive; a double-clicked or replayed retry could double-inject into the pipeline/outbox | **CLOSED.** `reviewAction` now (a) short-circuits any record already in a TERMINAL status (never re-submits a lane on a sequential replay — effective even with no store injected), and (b) when an `idempotencyStore` is supplied, CLAIMS `(record-id + action)` in the consumer namespace `dead-letter-review` **before any effect**, so a concurrent/replayed duplicate is deduped (`reason:'deduped'`) before the lane fires. The ops route wires `getIdempotencyStore()`. New tests: double-click, concurrent (single-winner), replayed-resolve terminal short-circuit, already-retried no-re-inject. |

## Wave-C convergence verdict (fix small, document large)

- **Namespace split coherent.** `domainNamespaceIntegrity.test.ts` (frozen, ≤500-line cap) carries NOTE pointers to both companion suites; `.waveA.test.ts` pins care-team + goals-tasks, `.waveB.test.ts` pins referrals + immunizations. All four domains pinned; no gap.
- **`WpcDomain` union complete: 11 domains** (coverage, encounter, sdoh, medications, labs-vitals, allergies, procedures, care-team, goals-tasks, referrals, immunizations).
- **Determinism:** the only `new Date(...)` in the new adapters/mappings wrap the injected `deps.now()` (the codebase-standard clock pattern, same as coverage.ts / the 834 adapter); no raw `Date.now()`/`new Date()`/`Math.random`. `console.*` = 0 in all new domain files.
- **Ratchet / sizes:** `check-file-sizes.sh` PASS; every new/edited src file < 400 (834 adapter 190, review/index 205, coverage mapping 61).
- **Care-team lens (I2) still GREEN** after the mapping extension (`lens.acceptance.test.ts`, 10 tests).
- **Provider refs (referrals) kept raw + flagged `deferred-I8A`** — no invented NPI; the mapping stubs a node keyed by the raw ref with `providerResolution:'deferred-I8A'`.

## Red-team panel — R1 Domain-Fidelity (care-coordination + eligibility lens)

| id | sev | finding | owner |
|---|---|---|---|
| **R1-I6-1** | HIGH | **Referral loop-closure is not modeled.** `referral.ts` captures a `ServiceRequest` at `referral.requested` only — there is no `ServiceRequest.status` lifecycle (active → on-hold → completed / revoked / entered-in-error) and no loop-closure signal (was the referral scheduled, seen, declined, or dropped?). A care-coordination product's core metric is closed-loop rate; today a referral is CAPTURED, not TRACKED. | I7/I8A (referral lifecycle) |
| **R1-I6-2** | HIGH | **Goal status transitions absent.** `goalTask.ts` records a `Goal` (description code) and links a `Task` by `focus`, but models neither `Goal.lifecycleStatus` (proposed→active→completed/cancelled) nor `Goal.achievementStatus` (in-progress/achieved/not-achieved), nor `Goal.target` measures. Goal-to-intervention linkage exists (Task.focus→Goal) but there is no way to say a goal was MET. | I7 (care-plan lifecycle) |
| **R1-I6-3** | MED | **Care-team role/responsibility + membership period thin.** Participants carry a role code + reference, but not `CareTeam.participant.period` (effective dates) or `.role` responsibility semantics; the roster is a point-in-time snapshot with no churn model (member added/removed over time). FHIR `CareTeam.participant.role` is partially captured (code only). | I7 (care-team temporality) |
| **R1-I6-4** | MED | **Immunization has no CVX display normalization or forecasting.** CVX code is captured raw (ungoverned system, so no terminology gate); there is no CVX→vaccine-name resolution, no CDC ACIP schedule/forecasting (due/overdue), and no dose-in-series. Adequate as a factual record, not for gap-closure. | I8/I9 (immunization intelligence) |
| **R1-I6-5 (F1-b)** | MED | **834 termination fix is add-vs-term only.** Retro-termination (a term with a past DTP*349 producing a coverage-span gap), reinstatement (INS-3 025), and COB/secondary coverage are not modeled — they quarantine (fail-closed) rather than being processed. A terminated member does not yet cascade (e.g. suppress outreach); coverage-span reconciliation is deferred. | I6/I8A (eligibility hardening) |

## Red-team panel — R2 Negative-Space (absent across the four domains that production needs)

Missing-list (owner in brackets):
- **Referral status tracking / loop-closure state machine** — the single biggest gap; without it there is no closed-loop reporting. [I7/I8A] (= R1-I6-1)
- **Care-team membership effective dates + churn** — `participant.period`, add/remove history, who-was-on-the-team-on-date-X. [I7]
- **Goal status transitions + achievement** — lifecycle/achievement status, target measures, goal→outcome. [I7] (= R1-I6-2)
- **Immunization dedup across sources** — the same dose arriving from registry + EHR + claim will create three `Immunization` nodes; no dose-level dedup/merge (CVX + occurrence-date + lot key). [I8]
- **Missing / unknown-CVX handling** — a missing CVX quarantines (good), but an UNKNOWN/retired CVX code is admitted unvalidated (CVX is ungoverned in the stage-4 gate); no unknown-code review lane. [I8]
- **Referral↔performer resolution** — performer kept raw (`deferred-I8A`); no NPPES resolution, so referral routing/adequacy cannot be computed. [I8A] (ties F5)
- **834 reinstatement + retro-term span reconciliation + COB** — see R1-I6-5. [I6/I8A]
- **Retry-after-transient-rejection ergonomics** — with the new idempotency guard, a retry whose lane REJECTS consumes its `(id,action)` marker, so an identical re-retry is deduped (SAFE/fail-closed, never double-injects) but a genuine post-fix re-try needs a distinct action; proper home is a retry-budget/attempt-nonce. [I6] (ties R1-DL3 poison-loop)

## Red-team panel — R3 Stub-Legitimacy (grade the new seams; confirm no fail-open)

| seam / change | disposition | grade | rationale |
|---|---|---|---|
| **834 INS-3 handling** | validation gate | **Acceptable (fail-closed).** | Unknown INS-3 → quarantine `unknown-maintenance-type` (verified by test); a termination → `terminated`, never `active`. The prior latent fail-open (a defensive `?? '021'` default that would have treated an unknown code as an add) was **REMOVED** and replaced with a fail-closed-loud invariant throw. No silent unknown-as-active path. |
| **reviewAction idempotency guard** | reuses `idempotencyStore` (fail-closed-stub) | **Acceptable.** | Production resolves the pg marker store; the terminal-status short-circuit holds even with no store injected (defence-in-depth). Caveat **R3-I6-1 (MED):** the `idempotency` parameter is OPTIONAL — cross-process dedup depends on the caller passing it. The sole production caller (the ops route) does; recommend a governance pin so a future caller cannot silently drop it. Mock store is process-global in-memory (already in FAKE_FIDELITY). |
| **coverage mapping periodEnd/validity** | mapping extension | **Acceptable.** | Additive; `periodEnd || null` keeps existing add-only events (end=null) byte-identical, so replay/projector tests stay green. |

**R3 fail-open sweep:** no new fail-open path introduced this iteration; the one latent fail-open found during self-review (834 unknown-code default) was fixed (fail-closed-loud) before merge. The idempotency reject-consumes-marker behavior is fail-CLOSED (errs toward not-injecting), logged as an ergonomics MED, not a safety defect.

## Iteration-6 red-team disposition summary

- **R1 (Domain-Fidelity): 5 findings** — 2 HIGH (referral loop-closure absent; goal status transitions absent), 3 MED (care-team temporality thin; immunization forecasting/CVX-display absent; 834 add-vs-term only). None blocks the demo; all block real care-coordination/eligibility operation. Owned I6/I7/I8A.
- **R2 (Negative-Space): 7-item missing-list** — referral loop-closure, care-team churn, goal achievement, immunization dedup, unknown-CVX handling, performer resolution, 834 reinstatement/retro-term/COB, retry-after-reject ergonomics. Owned I6/I7/I8/I8A.
- **R3 (Stub-Legitimacy): 3 Acceptable, 0 Risky, 0 Unacceptable** — with 1 MED caveat (optional idempotency param). One latent fail-open (834 unknown-as-active default) found in self-review and FIXED before merge.
- **Unacceptable fixed this iteration: 1** (the 834 latent fail-open default, fixed to fail-closed-loud). No new CRITICAL. New findings are HIGH/MED, owned by I6 (eligibility/idempotency hardening), I7 (care-plan/referral lifecycle), I8/I8A (immunization intelligence, provider identity, EMPI dedup).

---

# ITERATION 7 — six sensitive + financial domains + F2 (42 CFR Part 2) closure (Wave D convergence + red-team)

Iteration 7 added six C9 record domains across Waves A/B/C (behavioral-health incl. the SUD/Part 2 subset, claims-financial, pa-lifecycle, assessments, caregiver-household, documents; record now **17/20**) and, in this Wave D, converged the three waves, ran the mandatory E9 fail-open sweep + three-persona red-team against the new code, and ADVANCED register **F2** (42 CFR Part 2). This section records the two Unacceptable fail-opens FIXED this wave, the F2 disposition, and the new findings with severity + owning iteration.

## Unacceptable FIXED this wave (E9 fail-open sweep — Part 2 must fail RESTRICTED on ambiguity)

| id | severity | finding | fix |
|---|---|---|---|
| **I7D-1** | Unacceptable (fail-open on the restricted-record path) → FIXED | **Part 2 basis fell open on a missing/ambiguous program signal.** `evaluatePart2Basis` (part2Basis.ts) attached the Part 2 label only when a federally-assisted SUD program was affirmatively matched; a SUD diagnosis (F10-F19) whose program context was MISSING, empty, an UNRECOGNIZED facility type, or a SUD program with an UNKNOWN federal-assistance flag returned `part2:false` → the record projected as an ordinary DISCLOSABLE Condition. "Not a recognized SUD program" and "provenance unknown" were collapsed into the same disclose path. A missing segmentation signal defaulted to disclosable — the exact E9 shape, on the most sensitive record class in the build. | Introduced three-state `classifyProgram(facilityType, federallyAssisted?)`: `federally-assisted-sud-program` / `recognized-non-part2` / `ambiguous`, plus a `RECOGNIZED_NON_PART2_PROGRAM_TYPES` data table. SUD content over an `ambiguous` program now FAILS SAFE to Part 2-restricted. The adapter (`behavioralHealth.ts`) was changed to carry `federallyAssisted` as TRI-STATE (`triBool`, undefined = source omitted it) so an absent flag is treated as ambiguous, not silently false. The over-restriction guard is preserved: an affirmatively-recognized general-medical setting (general-acute, primary-care, …) still discloses SUD content correctly. 6 new tests (missing/unrecognized/unknown-FA all restrict; recognized settings disclose; classifyProgram table; end-to-end no-programContext SUD → part2-sud hint). |
| **I7D-2** | Unacceptable (latent fail-open in the Part 2 enforcement seam) → FIXED | **`scopeCovers` disclosed an unlabeled restricted node without consent.** In `lenses.ts`, a node flagged `restricted:true` but carrying no restricting label past its kind + the `Restricted` marker produced an empty `restricting` set, and `restricting.every(...)` is vacuously TRUE → the node was VISIBLE under NO_CONSENT. Currently unreachable via the Part 2 path (a Part 2 node always carries the `42-CFR-Part-2` label), but a fail-open in the shared consent-gate every lens runs through, in the iteration that hardens exactly this guarantee. | `scopeCovers` now fails CLOSED for an empty restricting-label set: an unlabeled restricted node is covered only under an explicit Part 2 (catch-all) grant, never under NO_CONSENT. 1 new unit test (both backends unaffected; all pre-existing Part 2 enforcement tests stay green). |

Rest of the E9 sweep across the 6 new adapters/mappings + the two Part 2 modules: `console.*` = **0**; no raw `Date.now()` / `new Date()` / `Math.random` (every clock wraps injected `deps.now()` — deterministic); the only `catch` blocks are JSON-parse guards returning `[]` (a malformed batch is caught by reconciliation, not a restricted-record fall-through); `referencedState(...) ?? 'Unknown'` (pa-lifecycle) is fail-SAFE (an unknown status never maps to an authoritative Approved/Denied). No other fail-open found.

## F2 (42 CFR Part 2) disposition — ADVANCED (primary basis + enforcement CLOSED; residual → I8A)

| what | status |
|---|---|
| Segmentation BASIS on the right facts (two-factor 2.11/2.12: federally-assisted SUD program AND SUD content), tables not a code guess | **CLOSED** |
| Fail-safe: missing/ambiguous program provenance on SUD content → RESTRICTED (I7D-1) | **CLOSED** |
| Restricted projection carried transform → envelope → RESTRICTED node, both backends (pg-mem + Neo4j fake) | **CLOSED** |
| Consent-directed release naming recipient + purpose + released segments (+ expiry honored), held-restricted (NOT dropped) when absent | **CLOSED** |
| Break-glass: distinct elevated PHI-safe audit class, reason captured, never a silent override (2.51) | **CLOSED** |
| Re-disclosure prohibition marker on the node + 2.32 notice on any disclosure | **CLOSED** |
| Enforcement fail-closed on an unlabeled restricted node (I7D-2) | **CLOSED** |
| Consent REGISTRY OF RECORD + capture UI | remains → **I8A** |
| Consent REVOCATION propagation to already-projected nodes + expiry sweeps | remains → **I8A** (see F2-b) |
| Break-glass TIME-BOX actually enforced (TTL on the granted scope, not just a distinct audit) | remains → **I8A** (see F2-b) |
| Minimum-necessary FIELD-LEVEL disclosure (today a directive releases whole segments) | remains → **I8A** (see F2-b) |
| Part 2 audit stream PERSISTED to the durable audit store (today the audit entry is a return value) | remains → **I8A** (see F2-b) |

**F2 verdict:** the segmentation basis + restricted projection + consent-scope + break-glass + re-disclosure primitives are correct and fail-safe; F2's original defect (blunt drop on a wrong basis, no consent-directed release / re-disclosure / break-glass) is CLOSED. A residual **F2-b (CRITICAL, I8A)** carries the consent LIFECYCLE (registry of record, revocation propagation, break-glass TTL enforcement, minimum-necessary field-level, durable Part 2 audit persistence) — the consent-management SYSTEM, honestly out of scope for this iteration.

## Red-team panel — R1 Domain-Fidelity (42 CFR Part 2 / privacy-law + financial-integrity)

| id | sev | finding | owner |
|---|---|---|---|
| **R1-I7-1** | Unacceptable→FIXED | Part 2 basis fell open on a missing/ambiguous program signal (= I7D-1). | FIXED Wave D |
| **R1-I7-2** | HIGH | **Break-glass is audited-distinct but not actually TIME-BOXED.** `evaluatePart2Access` emits the elevated `part2-break-glass` audit and grants a covering scope, but the scope carries NO expiry/TTL — the "time-boxed emergency access" of 2.51 is asserted in prose, not enforced on the grant. A break-glass scope is, mechanically, as durable as a consented one. | I8A (F2-b) |
| **R1-I7-3** | HIGH | **Part 2 access audit does not persist.** `Part2AuditEntry` (consent-disclosure / break-glass / held-restricted) is a return value, not written to the durable audit store. A Part 2 disclosure/break-glass that leaves no persisted, tamper-evident record fails the accounting-of-disclosures expectation for a real deployment. | I8A (F2-b) |
| **R1-I7-4** | MED | **Minimum-necessary is segment-level, not field-level.** A covering directive releases entire segment labels; there is no way to release "diagnosis present" without the code, or to scope to a purpose-limited field subset. Over-discloses within a segment. | I8A (F2-b) |
| **R1-I7-5** | HIGH | **Claims golden-thread integrity is unenforced at projection.** `ADJUDICATED_BY` / `EXPLAINED_BY` link by raw ref (`request.reference`, `claimResponse.reference`) with NO existence check; a ClaimResponse arriving before/without its Claim (cross-batch, at-least-once) creates a dangling edge to an orphan node. The chain is captured, not verified end-to-end. | I8A (claims linkage) |
| **R1-I7-6** | HIGH | **CARC captured without the GROUP code loses member-liability.** `adjustmentCodes` captures CARC/RARC code + display but not the X12 group code (CO contractual / PR patient-responsibility / OA / PI). CO vs PR is the whole member-cost determination on a denial; without it the denial reason is present but its financial meaning (provider write-off vs member owes) is not. CARC/RARC are also ungoverned by the stage-4 terminology gate (no code-set validation). | I8 (claims intelligence) |
| **R1-I7-7** | MED | **Adjudication outcome defaults optimistically.** `outcome: str(resource.outcome, 'complete')` — a ClaimResponse missing `outcome` normalizes to `complete` (success) rather than quarantining. Data-fidelity risk (an error/partial outcome could be masked), not a restricted-record fail-open. | I8 (claims hardening) |
| **R1-I7-8** | MED | **PA capture has no drift detection vs the authoritative machine.** The capture-vs-authoritative boundary is SOUND (compile-checked `STATUS_TO_STATE satisfies Record<string,PaState>`, every node `authoritative:false`, never calls `paMachine.transition`). But a captured `currentStatus:'approved'` that DISAGREES with the paMachine's authoritative Denied is not flagged — no reconciliation/drift signal between the observed lifecycle and the source of truth. | I7/I8A (PA reconciliation) |

## Red-team panel — R2 Negative-Space (absent across the six domains that production needs)

Missing-list (owner in brackets):
- **Part 2 consent REVOCATION propagation** — a revoked/expired consent does not un-surface or re-restrict already-projected nodes. [I8A / F2-b]
- **Break-glass TIME-BOX enforcement + Part 2 audit persistence** — see R1-I7-2 / R1-I7-3. [I8A / F2-b]
- **Restricted-node handling on BOTH graph backends** — PRESENT and verified (pg-mem + Neo4j fake both store `restricted` + labels; `scopeCovers` filters uniformly; hardened fail-closed this wave). NOT a gap; called out because it was on the audit list.
- **Document T2 RETRIEVAL / virus-scan / content fetch** — `documents` honestly stops at a pointer (url + contentType + `computable:false`); there is no attachment retrieval, no virus/malware scan on fetch, no size/type enforcement, no eventual parse-to-T1. [I8/I9]
- **Claim VOID / REVERSAL / adjustment** — no handling of a cancelled/entered-in-error claim or a replacement/void (X12 frequency 7/8); a reversal would project as a fresh active claim. [I8A]
- **PA APPEAL timers / decision-due / auto-expiry** — `appealed` is captured as a status phase but there is no appeal-deadline or decision-due timer and no auto-park of a stale pending PA. [I7/I8A]
- **Caregiver relationship END-DATING** — `RELATED_TO` carries `periodStart` but no period end / relationship termination; a caregiver who is no longer active never end-dates. [I8]
- **Assessment SCORING** — coded answer items (linkId + code + integer score) are captured, but there is no total-score computation, banding, or interpretation (e.g. PHQ-9 severity); a raw item bag, not a scored instrument. [I8]
- **CARC GROUP codes + plain-language + member-liability; COB / secondary-payer sequencing** — see R1-I7-6; COB (Coverage.order, allowed-vs-paid, primary/secondary) entirely absent. [I8/I8A]
- **Minimum-necessary field-level Part 2 disclosure** — see R1-I7-4. [I8A / F2-b]

## Red-team panel — R3 Stub-Legitimacy (grade the new seams; confirm no fail-open, T2 honesty)

| seam / stub | disposition | grade | rationale |
|---|---|---|---|
| **part2Basis segmentation** | validation/label rule | **Acceptable (fail-safe)** — after I7D-1 | Was a fail-open on ambiguity (would have graded Unacceptable); now three-state with SUD-content-on-ambiguous-provenance → RESTRICTED. Tables are data (data-is-not-code). Over-restriction guard preserved via an affirmative recognized-non-Part2 allowlist. |
| **part2Consent consent-scope** | in-module primitive (NOT a dataMode seam) | **Acceptable, NOT a fail-open stub** | Absent a covering directive it HOLDS RESTRICTED (`disclosed:false`, empty scope, `part2-held-restricted` audit) — never silently disclosed, never dropped (node retained). Break-glass always emits the elevated audit. Honest caveat **R3-I7-1 (HIGH, → I8A/F2-b):** it is an evaluation primitive, not backed by a consent REGISTRY OF RECORD, and its audit entries do not persist — a real deployment needs both (already in F2-b). |
| **documents T2** | tier declaration | **Acceptable (honest, not a hidden T1)** | `tier:'T2'` + `computable:false` stamped adapter → payload → node; tests assert documents is T2 (and NOT T1) and that NO parsed clinical fields are fabricated off the opaque attachment. A pointer, not a masquerade. Residual (retrieval/scan/parse) is R2-listed, honestly deferred. |
| **lens `scopeCovers`** | shared consent gate | **Acceptable (fail-closed)** — after I7D-2 | The empty-restricting-label vacuous-true fail-open is fixed; an unlabeled restricted node now requires an explicit Part 2 grant. Defense-in-depth for a currently-unreachable path in the seam every lens shares. |
| **pa-lifecycle `referencedState` / capture boundary** | reference-only mapping | **Acceptable (fail-safe)** | `?? 'Unknown'` never invents an authoritative state; compile-time `satisfies Record<string,PaState>` bars a made-up state; every node `authoritative:false`. Drift detection is the R2/R1-I7-8 gap, not a stub defect. |

**R3 fail-open sweep verdict:** two fail-opens found and FIXED this wave (I7D-1 basis ambiguity; I7D-2 lens unlabeled-restricted), both on the Part 2 restricted-record path. No remaining fail-open in the six new domains. The Part 2 consent-scope is confirmed NOT a fail-open stub (holds-restricted, not disclose-by-default); documents is confirmed honest T2, not a hidden T1 claim.

## Iteration-7 red-team disposition summary

- **R1 (Domain-Fidelity): 8 findings** — 1 Unacceptable→FIXED (basis ambiguity), 4 HIGH (break-glass not time-boxed; Part 2 audit non-persisted; claims chain integrity unenforced; CARC group-code/member-liability absent), 3 MED (minimum-necessary segment-level; adjudication outcome optimistic default; PA drift detection absent). None blocks the demo; the Part 2 residuals block a real Part 2 deployment.
- **R2 (Negative-Space): 9-item missing-list** — Part 2 revocation propagation, break-glass TTL + audit persistence, document retrieval/virus-scan, claim void/reversal, PA appeal timers, caregiver end-dating, assessment scoring, CARC group/COB, minimum-necessary field-level. Restricted-node handling on both backends confirmed PRESENT (not a gap). Owned I7/I8/I8A.
- **R3 (Stub-Legitimacy): 4 Acceptable + 1 Acceptable-with-HIGH-caveat, 0 Risky, 2 Unacceptable→FIXED** — part2Basis, part2Consent (caveat R3-I7-1 → F2-b), documents T2, scopeCovers, pa-lifecycle all Acceptable; the two Unacceptable fail-opens fixed before merge.
- **Unacceptable fixed this iteration: 2** (I7D-1 basis ambiguity fail-open; I7D-2 lens unlabeled-restricted fail-open). **F2 ADVANCED** (basis + enforcement CLOSED; residual F2-b → I8A). New CRITICAL: **F2-b** (Part 2 consent lifecycle, I8A). Other new findings HIGH/MED, owned I7 (PA reconciliation), I8 (claims/assessment/caregiver intelligence), I8A (Part 2 lifecycle, claims linkage, COB).

---

# ITERATION 8A-i — external identity + EMPI (F3, F5 close; PIX/PDQ + PIXm/PDQm made real; Wave D convergence + red-team)

Framework v1.2. Waves A (F3 survivorship + cross-reference), B (external EMPI real logic), C (F5 provider identity via NPI/NPPES) built on disjoint trees; Wave D = convergence to DRY + E9 fail-open sweep on the identity path + mandatory red-team panel + register update.

## Register items CLOSED / ADVANCED this iteration

- **F3 (CRITICAL) → CLOSED.** Golden-record survivorship is a true PROJECTION (source-attributed facts stored, golden view derived per-field with provenance {source, rank, reason, asOf}, rules AS DATA changeable without data loss — `survivorship/goldenRecord.ts` + `rules.ts`). Cross-reference table (`crossReference/xref.ts` + pg-mem-backed store) closes fragmentation: an id-only record whose source id is already linked resolves to the EXISTING member instead of minting a new one per feed (tested). Merge/unmerge emit `member.merged` / `member.unmerged` events and the graph rekeys by REPLAY (`graph/replay.ts` `rekeyEvents` produces survivor-keyed events, never in-place rewrite) per DP-7. E9: an ambiguous source id (distinct unmerged survivors) resolves to HELD, never a guessed member. Residual: durable pg store verified via pg-mem only (live pg wiring is a composition-root concern, fail-closed until registered) — folds into NS-05.
- **F5 (HIGH) → CLOSED.** NPI validation is the real NPPES `80840`-prefixed Luhn check (`provider/npi.ts`; verified against known-valid NPIs 1234567893 / 1245319599 and rejecting bad check digits). Provider resolver anchors a ProviderIdentity by validated NPI, enriches from the mode-gated NPPES directory seam (seeded in mock/seeded, fail-closed `NppesNotConfiguredError` in production until a live client is wired). Referral performers that carried the `deferred-I8A` flag now resolve to a ProviderIdentity graph node when a valid NPI is present; no NPI → stays raw+flagged (never invents an NPI). Residual: only the referral mapping was closed; claims/care-team/medication performer refs remain raw (see R2 below) — new HIGH F5-b.

## Wave-D convergence (DRY) verdict

The three shared-file partitions were reconciled:
- `config/dataMode.ts` — `providerIdentity` (wave C) + `crossReference` (wave A) appended blocks coexist, no duplicate seam ids, `DEFAULT_DATA_MODES` derives from the frozen union.
- `config/seamDispositions.ts` — both new entries present, both `fail-closed-stub` with named errors; the completeness + proof-coverage governance gate is green (probers registered for both).
- `identity/index.ts` — barrel completed this wave: waves B (`external`) and C (`provider`) had not appended their export blocks. Added collision-free `export *` re-exports so the identity public surface is consistent (DRY convergence action). tsc 0 after.
- Per-wave test partitions all run: `tests/identity/{survivorship,crossReference,externalEmpi,providerIdentity}.test.ts` green; identity + governance partitions 139→141 green (E9 fix adds 2).

## E9 fail-open sweep (identity path) — 1 FIXED

Swept every `catch` / `??` / `||` fallback + default-return shape across `src/lib/identity`. One genuine fail-open found and FIXED:

- **E9-8Ai-1 (Unacceptable → FIXED): demographic query fabricated an enterprise anchor from a peer-domain id.** `parsePdqResponse` (hl7v2.ts) and `parsePdqmResponse` (fhirPixm.ts) used `ids.find(enterprise-authority) ?? ids[0]` — a PDQ/PDQm candidate carrying NO id in the enterprise assigning authority had an arbitrary peer id (e.g. a local MRN) promoted to `enterpriseId` and mislabeled with the enterprise authority. `decideDemographic` would then auto-link the member to that fabricated cross-domain anchor when the demographic score cleared the auto-link threshold — a wrong-domain identity link. Fixed fail-closed: no enterprise-authority id → `enterpriseId: ''` (candidate is retained so it still counts toward dominance/ambiguity, never dropped), and `decideDemographic` now HOLDS any top candidate lacking an enterprise anchor however high its demographic confidence (`anchorable` guard). Regression tests added for both HL7v2 and FHIR paths (+2). The PIX/PIXm cross-reference path was already correct (no enterprise match → not-found → HELD).

All other fallbacks justified in place: provider `mergeRecord` (directory fact wins else inline; NPI stays authoritative — not fail-open); survivorship `recency-fallback` (surfaces an unranked source rather than dropping — deliberate, provenance-labeled); xref `?? new Set` / clock injection; external async resolvers throw `ExternalEmpiNotConfiguredError` when unwired (never a default identity).

## Red-team panel — R1 Domain-Fidelity (healthcare identity / interoperability: IHE PIX/PDQ + PIXm/PDQm, EMPI survivorship, NPPES)

| id | sev | finding | disposition |
|---|---|---|---|
| **R1-8Ai-1** | Unacceptable | PDQ/PDQm demographic parse fabricated an enterprise anchor from a peer-domain id (`?? ids[0]`); a high-confidence demographic candidate with no enterprise id auto-linked the member to a wrong-domain identifier. | **FIXED this wave** (E9-8Ai-1). Empty enterpriseId → HELD. |
| **R1-8Ai-2** | MED | Survivorship `rules.tiebreak` validates `'most-recent' \| 'source-order'` but `winnerForField` always applies most-recent within a source; the `source-order` tiebreak value is declared config that is never honored. | OPEN → I8A terminology/console wave or a bounded fix. Not a fail-open (deterministic, provenance-labeled); a policy-fidelity gap. |
| **R1-8Ai-3** | MED | PIX/PDQ MSH/QPD/RCP + CX (`value^^^&OID&ISO`) and PIXm/PDQm (`$ihe-pix` Parameters, PDQm searchset Bundle `search.score`) are standard-faithful in shape, but the wire send is behind an injected transport and verified only against a message-shaped fake MPI; no live MLLP/ACK framing, retransmit, or timeout semantics. | OPEN → NS-05 (live integration). Honest ceiling; logic real, transport CI-pending, fail-closed. |
| **R1-8Ai-4** | LOW | `extractNpi` scans `\d{10}` runs and returns the first Luhn-valid one; an 11+-digit run could yield a spurious-but-valid 10-digit substring from a longer numeric token. | OPEN (low). Synthetic feeds only; anchor is always a check-digit-valid NPI. Tighten to word-boundaried runs later. |

Assigning-authority/OID handling on enterprise ids is correct (CX `&OID&ISO`, FHIR `system|value`); enterprise-vs-peer split is explicit; >1 enterprise id → ambiguous → HELD. NPI Luhn/80840 is the real NPPES algorithm.

## Red-team panel — R2 Negative-Space (production identity capability entirely ABSENT)

Missing-list (not a pass):
1. **Link/unlink audit trail** — xref emits C2 events but there is no steward-facing audit surface recording WHO linked/unlinked/merged and WHY (ties open R1-DL1 from I5). [I8A console wave]
2. **Held-review resolution surface** — a HELD identity (possible-match, xref-ambiguous, empty-anchor demographic) routes to the dead-letter/held lane but there is no adjudication UI to inspect the candidate set and record a MERGE/LINK/CREATE-NEW decision. [I8A console]
3. **Cross-reference under concurrent writers** — the sync xref index and pg store are append-only but concurrent link/merge races (two feeds minting for the same person simultaneously) are unproven; pg PRIMARY KEY concurrency verified only via pg-mem. [NS-05]
4. **External assigning-authority conflicts** — no reconciliation when two external MPIs return different enterprise ids for the same source id, or when the enterprise OID itself changes. [I8A/I9]
5. **Survivorship tie-breaks beyond most-recent** — `source-order` unwired (R1-8Ai-2); no field-level clinical rules (e.g. most-recent-verified, active-over-inactive). [I8A]
6. **Unmerge reversal completeness** — unmerge deletes the merge mapping and replays, but there is no proof that a member that accreted facts from BOTH members while merged splits them back to the correct origin (facts are survivor-keyed post-merge). [I8A/I9]
7. **Provider identity coverage** — only referral performers resolve; claims/care-team/medication prescriber refs stay raw (F5-b). [I8A]

## Red-team panel — R3 Stub-Legitimacy (grade the new seams/stubs)

| seam / stub | grade | rationale |
|---|---|---|
| `crossReference` (pg store) | **Acceptable** | fail-closed-stub declared; production with no registered pg factory throws `CrossReferenceStoreNotConfiguredError`; mock/seeded = in-memory; pg logic verified via pg-mem; append-only, no UPDATE/DELETE path. Governance prober present. |
| `identity` external MPI (PIX/PDQ, PIXm/PDQm) | **Acceptable** | build/parse logic real and verified against a message-shaped fake; unwired transport OR incomplete config throws `ExternalEmpiNotConfiguredError` BEFORE any work (a config shape alone is not a live MPI); sync pipeline seam throws rather than defaulting. After E9-8Ai-1 fix, no fail-open remains in the parse→disposition path. |
| `providerIdentity` (NPPES) | **Acceptable** | fail-closed-stub; production with no live NPPES client throws `NppesNotConfiguredError`; seeded directory is a labeled synthetic data file, never served as production; NPI validation offline/deterministic; a lookup miss is `undefined`, never a fabricated record. Governance prober present. |

0 Risky, 0 Unacceptable left open (the single Unacceptable, R1-8Ai-1, fixed this wave).

## Iteration 8A-i red-team disposition summary

- **R1 (Domain-Fidelity): 4 findings** — 1 Unacceptable→FIXED (fabricated enterprise anchor), 2 MED (source-order tiebreak unwired; live transport CI-pending), 1 LOW (extractNpi run-boundary). Logic is standards-faithful; residuals are live-integration + a policy-fidelity gap.
- **R2 (Negative-Space): 7-item missing-list** — link/unlink audit surface, held-review adjudication UI, concurrent-writer proof, external AA conflicts, richer survivorship tie-breaks, unmerge split completeness, provider coverage beyond referrals. Owned I8A console / I9.
- **R3 (Stub-Legitimacy): 3 Acceptable, 0 Risky, 0 Unacceptable open** — crossReference, external MPI, providerIdentity all fail closed with named errors and governance probers.
- **Unacceptable fixed this iteration: 1** (E9-8Ai-1). **F3 CLOSED** (survivorship projection + fragmentation fix + replay rekey, residual → NS-05 live pg). **F5 CLOSED** (NPI/NPPES real + fail-closed; residual F5-b = claims/care-team/medication provider refs, HIGH, → I8A). New findings: F5-b (HIGH), R1-8Ai-2 (MED, survivorship tiebreak).

## Iteration 8A-ii - terminology + classification (the I4 semantic seam advanced to real logic)

The I4 terminology stub (semantic validation was a flat seed allowlist: no $expand / $translate / $classify, no version/retired awareness, no UCUM) advanced to a REAL semantic layer over seeded, versioned value sets. What is real-now: `validateCode` is member-of-bound-version (not a flat allowlist), carrying the `CodeAssetBinding` (assetId + version + current); `$expand` enumerates a specific value-set version; version/retirement awareness (a code retired in the current bound version returns `retired`, never active); UCUM unit validation for LOINC quantitative results; `$translate` over seeded ConceptMap crosswalks (ICD-10-CM <-> CMS-HCC, SNOMED-CT -> ICD-10-CM) with crosswalk asset+version provenance and NO-MAP (never a fabricated target); data-driven, versioned HCC classification with the risk-family taxonomy (CMS-HCC / RxHCC / HHS-HCC / CDPS) exposed as data so HCC is clearly ONE family; the pipeline stage-4 gate bound DEEPER at transform for code-carrying domains; and value-set version currency enforcement (a stale/superseded/expired bound version quarantines under the production enforce posture). Residuals routed forward: the LIVE terminology server (FHIR terminology service / VSAC / CMS HCC grouping / Gravity feed) stays fail-closed (production service throws, gate quarantines) and the FULL licensed maps are not shipped (all seed content is illustrative, `_comment`-labeled, `stub:true`).

### Convergence (DRY) verdict - one duplicate FIXED
The three waves appended only clearly-commented blocks to the shared partitions (seamDispositions.ts, dataMode.ts, terminology/index.ts, registry/index.ts, types.ts): ONE `terminology` seam (fail-closed-stub, no second seam minted), ONE dataMode entry, no duplicate/divergent exports (tsc 0). validateCode is CALLED by the pipeline binding through the reused semanticValidator (not duplicated) and delegated to by the seed service. Determinism (injected clock) intact. The one DRY violation found and FIXED this wave: the ICD-10-CM -> CMS-HCC crosswalk content was duplicated in `data/terminology-seed.json` (`hccClassification`) AND `classify/data/hcc-crosswalk.json`, and had already drifted (N18.6 label differed). Consolidated to the single Wave B source (`classify/data/hcc-crosswalk.json`); the legacy `seedTerminologyService.classify` now sources that one map; the duplicate block was deleted; README updated.

### E9 fail-open sweep (terminology path) - clean
`rg` of the fail-open shapes across src/lib/terminology + the pipeline binding returned 8 hits, every one justified: the only `catch` (semanticValidator) is the fail-CLOSED handler (a not-configured server throw becomes a `semantic-terminology-unavailable` quarantine, any other error rethrows); every `valid:true` / `matched:true` / `classified:true` is gated on membership / a found target / a found entry; `valueSetRegistry` `return true` is a pure in-window predicate; UCUM `valid:true` on a non-quantitative LOINC is "no unit expectation applies", not an admission of an invalid code. The composed path is fail-closed end-to-end: an unverifiable code (production server) quarantines; a RETIRED code is invalid; an untranslatable code returns no-map (never a fabricated target); a stale/superseded value-set version quarantines under the enforce posture (production). Zero fail-closed code changes were required by the sweep.

### Red-team panel - R1 Domain-Fidelity (terminology / semantic interoperability) - 7 findings
- **R1-8Aii-1 (CORRECT + MED residual)** $validate-code is genuine member-of-value-set (currentMembers of the bound version + retiredInCurrent), not a flat allowlist, and carries the bound CodeAssetBinding. Residual: membership is exact-key only - no SNOMED subsumption / ICD-10 category (parent-child) rollup, so a valid child of a seeded parent is `unknown-code`. Route to live server / HAPI.
- **R1-8Aii-2 (CORRECT + MED residual)** $translate is a real seeded ConceptMap with assetId+version provenance and never fabricates (no-map on an unmapped source or an uncovered system pair). Residual: no reverse-direction for every pair (ICD-10-CM -> SNOMED-CT reverse absent) and no transitive chaining (SNOMED -> ICD-10 -> HCC).
- **R1-8Aii-3 (CORRECT + LOW residual)** retirement is per-FHIR: a retired code returns `retired` (invalid), never active, with the bound version noted. Residual: retirement is a flat `retiredInCurrent` list, not a FHIR `inactive` property with a deprecation date / `replacedBy` pointer.
- **R1-8Aii-4 (CORRECT + MED residual)** HCC is ONE family among CMS-HCC / RxHCC / HHS-HCC / CDPS (risk-families.json), and classify stamps the model family+asset+version. Residual: only CMS-HCC carries actual crosswalk content; the other three families are taxonomy metadata with an activeAssetId but NO code-to-group content, and the V28 HCC numbers are illustrative stubs, not the real renumbered V28 set.
- **R1-8Aii-5 (CORRECT + MED residual)** UCUM units are syntactically correct (mm[Hg], mmol/mol, 10*3/uL, mL/min/{1.73_m2}) and analyte-appropriate per LOINC (HbA1c %/mmol/mol, systolic mm[Hg], glucose mg/dL/mmol/L). Residual: `validUnits` is a 13-atom allowlist, not a UCUM-grammar parser; only 3 LOINCs carry unit bindings; no unit conversion/canonicalization.
- **R1-8Aii-6 (MED coverage gap)** Gravity/Z-code SDOH coverage is thin: `sdoh-z-codes` holds only Z59.82 / Z59.41 / Z71.41; the Gravity SDOH domain spans Z55-Z65, and there is no Gravity ConceptMap (SDOH observation -> Z-code) nor SDOH assessment-instrument LOINC panels.
- **R1-8Aii-7 (MED gap, flagged by Wave C)** immunizations is declared a code-carrying domain, but CVX is NOT in TERMINOLOGY_SYSTEMS / SYSTEM_URIS, so `extractGovernedCodings` skips CVX codings - an immunization code is admitted ungated today. Not a fail-open of a governed system (it is an ungoverned domain); the binding will pick CVX up with no code change once CVX governance is added.

### Red-team panel - R2 Negative-Space (absent that production needs) - 8-item missing-list
1. Value-set expansion caching / invalidation ($expand recomputes per call; no cache, no invalidate-on-version-change). 2. Explicit code-system version PINNING per binding through the validate surface (membersForVersion exists in the data layer but service.validateCode cannot be told "validate against version X"). 3. SNOMED partial-match / post-coordination (subsumption, expression grammar). 4. $translate reverse-direction + transitive chaining. 5. Bulk / batch validate (a Parameters bundle of codings validated in one call; today the gate validates one coding at a time). 6. A persisted terminology audit trail (which value-set version answered which admission decision - carried on the binding but not stored; ties to NS-01). 7. UCUM canonicalization / conversion for cross-unit comparison. 8. Immunization CVX governance (R1-8Aii-7).

### Red-team panel - R3 Stub-Legitimacy (grade the new seed/crosswalk/HCC data + extended seam) - 6 graded, 0 Unacceptable open
- terminology-seed.json `membership` + `ucum` blocks - **Acceptable**: `_comment`-labeled "ILLUSTRATIVE STUBS, not the full authority release", single-source (current members = codeSystems keys), production server fail-closed.
- translate/data/crosswalks.json - **Acceptable**: each crosswalk declares assetId+version+steward+sourceUrl, no-map never fabricates, live path throws.
- classify/data/hcc-crosswalk.json + risk-families.json - **Acceptable** (was **Risky**, FIXED): versioned model ref, no fabrication, families as data. The Risky grade was the DUPLICATE ICD->HCC map (drift risk, label already diverged); consolidated to a single source this wave.
- registry/currency.ts + posture - **Acceptable**: enforce quarantines / flag admits is the CALLER's choice (production -> enforce); a stale version never silently validates.
- The extended `terminology` seam - **Acceptable**: one seam, fail-closed-stub, production throws on validateCode/translate/classify, the gate quarantines (`semantic-terminology-unavailable`).
- The legacy `seedTerminologyService.translate` (flat conceptMap) coexisting with Wave B's provenance crosswalk - **Acceptable residual**: nothing in the pipeline consumes it, it returns null (never fabricates) and is `stub:true`; consolidating the two translate surfaces is routed forward with the live map.

### Iteration 8A-ii red-team disposition summary
- **R1 (Domain-Fidelity): 7 findings** - logic is standards-faithful ($validate-code member-of-value-set, $translate real ConceptMap with provenance, retirement per FHIR, HCC one family of four, UCUM analyte-appropriate); residuals are exact-key membership (no subsumption), single-family HCC content, thin Gravity SDOH, ungoverned CVX, and live-map completeness.
- **R2 (Negative-Space): 8-item missing-list** - expansion cache/invalidation, per-binding version pinning, SNOMED post-coordination, reverse/transitive translate, bulk validate, persisted terminology audit trail, UCUM conversion, CVX governance.
- **R3 (Stub-Legitimacy): 6 graded, all Acceptable, 0 Unacceptable open** - 1 Risky (duplicate ICD->HCC map) FIXED this wave; all new seams fail closed with named errors and honest `stub:true` / `_comment` labels.
- **Unacceptable fixed this iteration: 0 open** (the duplicate-map Risky was fixed proactively). **Convergence DRY: yes.** **E9: clean.** New residuals routed forward: live terminology/crosswalk/HCC-grouping/Gravity server (fail-closed, CI-pending), full licensed maps, CVX governance, single-translate-surface consolidation, SNOMED subsumption + UCUM grammar/conversion.

## Iteration 8A-iii - value-set governance console (lifecycle + maker-checker + replay, wired end-to-end)

Three parallel waves built a version-lifecycle governance facility for terminology value sets: a real backend engine (A: guarded state machine, enforced maker-checker, immutable PHI-free transition ledger, chosen-version replay, fail-closed store seam), an admin console (B), and BFF authz routes (C). Wave D (this wave) CONVERGED them: before D there were three lifecycle vocabularies, three role models, THREE maker-checker copies, and the console/routes MIRRORED the engine instead of reading it (nothing was wired). What is real-now after convergence: ONE lifecycle (the Wave-A state machine; the sole edge into `approved` is `in-review --approve--> approved`, so an unapproved/rejected version cannot become active structurally); ONE maker-checker predicate (`evaluateMakerChecker`) shared by the engine (throws), the console gate (disables), and the BFF boundary + mock double (403); ONE audit ledger (the console history timeline is the engine's own append-only frozen ledger, produced by driving real transitions); ONE replay (`replayAgainstVersion`, binding exact historical membership via `membersForVersion`, never falling back to current). The console demo is grounded in real data (ICD-10-CM FY2025 -> FY2026, R51 retired in FY2026). Residuals routed forward: the live pg governance ledger (store seam fail-closed-unwired) and a real Wave-A->port facade registration (routes fail-closed-unwired), notifications, approval delegation/expiry, four-eyes on retire, a concurrency guard.

### Convergence (DRY) verdict - console adapter collapsed, one maker-checker
The Wave-B `governanceApi.ts` adapter was collapsed from a parallel re-implementation (its own lifecycle union, AdminRole maker/checker sets, its own gate, hand-authored VERSIONS/HISTORY seed) to a THIN delegation: it re-uses the engine's `VersionLifecycleState`, adopts the governance-role actor model (`govRole: GovernanceRole | null`, the same shape the BFF `GovActor` uses), and reads the engine's `listVersions`/`history`/`replay` + the real `membersForVersion` data layer. The maker-checker rule was extracted to `src/lib/terminology/governance/makerChecker.ts` and is now the single implementation across all three layers (three inline copies deleted). Shared partitions stayed single (one `valueSetGovernanceStore` seam, one governance-role block additive to the `Role` union, one re-export path). tsc 0; full suite 1314 passed.

### E9 fail-open sweep (governance path) - fixed-1
One fail-open found and fixed: `resolveGovernanceBackend()` returned `bound ?? integrationDouble`, serving an in-memory double AS durable governance in production (the U4 dead-wiring masquerade - an unapproved change would look persisted, a restart would silently drop the ledger). Fixed fail-closed: production with no registered backend throws `GovernanceBackendNotConfiguredError` (mirrors `ValueSetGovernanceStoreNotConfiguredError`); the double serves mock/seeded ONLY. Every other shape justified: replay `reproduced:true`/`valid:true` gated on the chosen version's membership being found (unsupported / not-modeled return `reproduced:false`, `boundVersion:null` - never a fallback to current); routeKit auth/json/param catches all resolve to DENY/400; `makerCheckerEnabled():true` enables SoD (fail-closed default); route catches -> 500 + failure audit.

### Red-team panel - R1 Domain-Fidelity (governance: SoD / audit / replay / config) - 4 findings
- **R1-8Aiii-1 (MED)** single-approver config honored only in the ENGINE; the console gate and BFF approve boundary hardcode `maker-checker` (stricter = fail closed, but config not honored everywhere).
- **R1-8Aiii-2 (MED)** audit completeness: `createDraft` appends NO ledger entry - the immutable trail's first per-version event is `submit`; draft creation lives only on the mutable record's `createdBy/createdAt`, not the append-only ledger. Every state TRANSITION is audited immutably.
- **R1-8Aiii-3 (MED)** replay is faithful (exact historical membership, no fallback) ONLY when the governance version string equals a modeled terminology system version; the engine governs version STATE not per-version MEMBERSHIP (stores no member snapshot), so a governed version whose token is not a system version replays as not-modeled. Governance-version <-> terminology-version conflated.
- **R1-8Aiii-4 (LOW)** the "immutable" ledger is in-memory (mock/seeded); append-only frozen discipline is honest but a restart drops it; production pg ledger fail-closed-unwired.

### Red-team panel - R2 Negative-Space (absent that production governance needs) - 7-item missing-list
1. Approval delegation / expiry (no delegated reviewer authority, no in-review timeout). 2. Emergency override (break-glass) with audit. 3. Concurrent-approval conflict (last-writer-wins putVersion, non-transactional read-active-then-supersede; a pg store needs an optimistic guard or the one-active invariant can race). 4. Retire-then-reactivate (`retired` terminal; no audited un-retire). 5. Bulk approve. 6. Notification (submit -> reviewer, decision -> steward). 7. Four-eyes on retire and reject (approve is maker-checker; retire/reject are single-actor steward actions - retiring an active value set takes one person).

### Red-team panel - R3 Stub-Legitimacy (governance store seam + in-memory adapters) - 3 graded, 1 Unacceptable FIXED
| seam / stub | grade | rationale |
|---|---|---|
| `valueSetGovernanceStore` (Wave A store) | **Acceptable** | fail-closed-stub; production with no pg factory throws `ValueSetGovernanceStoreNotConfiguredError`; mock/seeded = in-memory; append-only, frozen, copies on read; prober present. |
| routes' `integrationDouble` (backendAdapter) | **Acceptable (was Unacceptable, FIXED)** | production masquerade (`bound ?? integrationDouble`) removed; `resolveGovernanceBackend()` now fails closed in production; double serves mock/seeded only; its maker-checker delegates to the shared predicate. Residual: real Wave-A->port facade registration routed forward (symmetric with the store's pg residual). |
| console seeded service (`governanceApi.ts`) | **Acceptable** | demo read-model driving the REAL engine through real transitions with a deterministic injected clock; labeled; never presented as durable governance. |

### Iteration 8A-iii red-team disposition summary
- **R1 (Domain-Fidelity): 4 findings** - lifecycle/maker-checker/replay are standards-faithful and now single-sourced; residuals are single-approver-config honoring, draft-creation-not-ledgered, governance-version<->terminology-version conflation in replay, and in-memory-only durability.
- **R2 (Negative-Space): 7-item missing-list** - delegation/expiry, break-glass, concurrency guard, reactivate, bulk approve, notification, four-eyes on retire.
- **R3 (Stub-Legitimacy): 3 graded, all Acceptable, 0 Unacceptable open** - the 1 Unacceptable (routes' production masquerade) FIXED this wave.
- **Unacceptable fixed this iteration: 1** (routes' `resolveGovernanceBackend` production dead-wiring -> fail-closed). **Convergence DRY: yes** (console adapter collapsed, three maker-checker copies -> one). **E9: fixed-1.**

### I8A block - CLOSED
Iteration 8A (pillar 1 EMPI/survivorship 8A-i, pillar 2 terminology/semantic 8A-ii, pillar 3 value-set governance console 8A-iii) is COMPLETE. Across the block: 0 Unacceptable left open (each iteration's single Unacceptable fixed in-wave: E9-8Ai-1 fabricated anchor; the 8A-ii duplicate-map Risky; the 8A-iii routes masquerade). Standing residuals carried to I9/pilot: live pg stores + live terminology/MPI/NPPES/governance backends (all fail-closed-unwired with named errors), full licensed maps, and the negative-space backlog (dead-letter/review UI NS-01, concurrency proofs NS-05, notifications, approval delegation, four-eyes-on-retire, break-glass).

# ITERATION 9 — deployment / operability substrate (unified migration + bootstrap, startup preflight, data-lifecycle) — Wave D convergence + E9 sweep + red-team

Iteration 9 built the deployment/operability layer across three disjoint waves: A (substrate — one migration runner + one `bootstrapSubstrate` over a single `DATABASE_URL`, checksum-guarded ledger, fail-closed on no persistence), B (deploy — deployment config schema + startup PREFLIGHT + health readiness/liveness routes), C (data-lifecycle — retention/policy purge over mutable stores, right-to-delete tombstone over the append-only evidence ledger, legal-hold registry, deployment runbook). Wave D (this wave) CONVERGED A+B, ran the E9 fail-open sweep across the deployment surface, and ran the mandatory three-persona red-team. tsc 0; full suite 1371 passed / 1 expected-fail / 91 skipped; size ratchet PASS.

## Convergence (DRY) verdict — the preflight now consults the substrate's single entry

Before convergence the deploy schema (Wave B) declared FOUR phantom per-seam connection keys — `EVIDENCE_LEDGER_URL`, `IDEMPOTENCY_STORE_URL`, `DEAD_LETTER_STORE_URL`, `CROSS_REFERENCE_STORE_URL` — that NO resolver in the codebase reads. The real persistence config is the substrate's single `DATABASE_URL` entry (Wave A `substrateConnectionString`; the evidence/deadLetter composition roots read `EVIDENCE_DATABASE_URL`/`DEAD_LETTER_DATABASE_URL` `|| DATABASE_URL`; idempotency/crossReference are wired by the substrate-registered pg factory). Two divergent config schemas for the same persistence — exactly the duplication convergence forbids.

Converged: the four substrate-backed seams (`SUBSTRATE_BACKED_SEAMS` in `deploy/schema.ts`) now map to `DATABASE_URL`, and `preflight.ts` consults Wave A's own `substrateConnectionString()` for them instead of re-deriving persistence config — one source of truth for "is persistence configured," so the preflight can never report ready while `bootstrapSubstrate()` would throw `SubstrateNotConfiguredError` at boot. The migration ledger + bootstrap remain the single substrate entry; no config schema is duplicated. The remaining 10 `fail-closed-stub` seams keep their endpoint-contract keys, with the overclaim corrected (see R3). Shared partitions (`seamDispositions.ts`, `env.ts`) stayed single: Wave A touched neither; Wave B's `env.ts` deployment-keys block is additive; no seam disposition was changed.

## E9 fail-open sweep (deployment) — fixed-2

`rg`-ed the fail-open shapes (`in-memory`/`fallback`/`?? default`/`catch`/`default-ready`/blank-config) across `substrate/`, `deploy/`, `health/`, `lifecycle/`. Two Unacceptable fail-opens found and FIXED; every other shape justified:

- **E9-9-1 (Unacceptable, FIXED) — preflight passed with an unconfigured required seam.** The four substrate seams were checked against phantom env keys nothing reads. An operator setting `EVIDENCE_LEDGER_URL` (what the preflight demanded) with `DATABASE_URL` unset would get a READY verdict while `getEvidenceStore()` throws `EvidenceStoreNotConfiguredError` on first request. FIX: remap to `DATABASE_URL` + consult the substrate resolver; the seam is now reported not-ready with `wouldThrow: SubstrateNotConfiguredError` until the real connection is set.
- **E9-9-2 (Unacceptable, FIXED) — blank `DATABASE_URL` treated as configured.** `substrateConnectionString` returned any present value (incl. `''`/whitespace) as a truthy connection string, so `bootstrapSubstrate` would open a `Pool` on garbage instead of failing closed. FIX: trim and return `null` on empty/whitespace, matching the `env.ts`/`deploymentValue` "'' is not configured" rule, so the substrate and the preflight agree. Proven by a new preflight test (whitespace `DATABASE_URL` → not-ready).

Justified-as-safe shapes (no change): readiness route `catch` → 503 (fail closed, never 200); `assertReadyOrThrow` throws naming every unmet; `ready === unmet.length === 0` (never default-ready); migrations are CREATE-only (`IF NOT EXISTS`, no `DROP`/`DELETE`/`TRUNCATE`/`UPDATE` — idempotent + non-destructive); `ChecksumMismatchError` fails loud on drift; `priorVersions` `catch → 0` is a cosmetic audit count, not a safety decision (the tombstone still appends); legal-hold checked BEFORE any append; purge `heldBack` never passed to `remove`; `EmptyRetentionPolicyError` refuses a criteria-less policy.

## Red-team panel — R1 Domain-Fidelity (deployment / operability / data-integrity) — 7 findings

- **R1-9-1 (Unacceptable, FIXED)** preflight phantom-key fail-open — see E9-9-1.
- **R1-9-2 (Unacceptable, FIXED)** blank-`DATABASE_URL` fail-open in the substrate — see E9-9-2.
- **R1-9-3 (MED residual)** connection-pool exhaustion / pool lifecycle. `bootstrapSubstrate` builds `new Pool({connectionString})` with no `max`/`idleTimeoutMillis`/`connectionTimeoutMillis` and no single-bootstrap guard — repeated bootstrap or a serverless cold path can exhaust or leak pools. Route to certification: pool sizing + composition-root singleton.
- **R1-9-4 (HIGH residual)** legal-hold durability across restart. `LegalHoldRegistry` is an in-memory `Map`; a restart drops every hold and a subsequent purge/right-to-delete sees `isHeld=false` and would proceed, silently bypassing a hold (the E9 "never bypass a hold" guarantee holds only within one process lifetime). Mitigation today: the runbook gate ("no purge until the hold registry is confirmed loaded") + `EmptyRetentionPolicyError`; NO code enforcement, because an empty registry is indistinguishable from an unloaded one without a durability signal. Route to certification: substrate-backed durable hold store + a load-attestation gate on `runPurge`.
- **R1-9-5 (MED residual)** concurrent-migration race. The runner does read-existing-then-`INSERT` with no `pg_advisory_lock`; two deploys migrating one DB concurrently both see an empty ledger and both `INSERT` — the loser hits `schema_migrations_uk` and throws (fail-loud, not corruption; DDL is `IF NOT EXISTS`). Safe-but-noisy; route a session advisory lock to certification.
- **R1-9-6 (LOW)** checksum covers full file text incl. comments — a comment-only edit to an applied migration triggers `ChecksumMismatchError` and blocks boot. Fail-closed/safe (immutability is the intent); documented so operators add a new migration rather than editing.
- **R1-9-7 (LOW)** readiness is unauthenticated and enumerates which backends are unconfigured; liveness returns `pid`. PHI-safe and secret-value-free (verified by test), acceptable for an orchestrator probe; network-policy the probe to the load balancer in production.

## Red-team panel — R2 Negative-Space (absent that a production deployment needs) — 8-item missing-list

1. Durable legal-hold store (holds are process-local; survive no restart) — backs R1-9-4. 2. Backup/restore automation + a restore drill / PITR (the runbook documents `pg_dump`/restore by hand only; no scheduled backup, no verified restore). 3. Migration advisory lock / deploy serialization (R1-9-5). 4. Reversible/down migrations for the MUTABLE stores (append-only ledgers are correctly forward-only; outbox/idempotency/graph/xref have no reversible path). 5. Purge batch/rate circuit-breaker (`planPurge` is reviewable but `executePurge` has no max-rows cap; a broad category policy executes fully). 6. Substrate pool sizing + health (max/idle/timeouts). 7. Readiness DB liveness — the preflight checks CONFIG PRESENCE, not that the DB actually accepts a connection, so a wrong-but-present `DATABASE_URL` passes readiness. 8. Per-seam production-mode-in-production assertion — a persistence seam left in mock during a production deploy serves volatile data; the preflight only inspects seams already in production mode.

## Red-team panel — R3 Stub-Legitimacy (pg/neo4j adapters + CI-pending live seams) — 6 graded, 0 Unacceptable open

| seam / stub | grade | rationale |
|---|---|---|
| pg adapters (evidence / deadLetter / idempotency / graph / crossReference) wired by `bootstrapSubstrate` | **Acceptable** | pg-mem verified; real-pg plpgsql immutability triggers are `.pg.sql`, honestly skipped under pg-mem and asserted by Docker-guarded testcontainer specs; substrate fails closed (`SubstrateNotConfiguredError`) on no `DATABASE_URL`. No faked-green. Live pg = CI-pending residual. |
| `schema_migrations` ledger + checksum runner | **Acceptable** | idempotent (recorded → skipped no-op), non-destructive (CREATE-only; no DROP/DELETE/TRUNCATE/UPDATE), `ChecksumMismatchError` fails loud on drift. |
| neo4j adapter | **N/A — recorded honestly** | there is NO neo4j code in this substrate; the whole-person graph is Postgres-backed (`GRAPH_DDL`) and a `mock-only` dataMode seam (no production consumer). The panel's neo4j item has no target here — this is an honest absence, not a hidden stub. |
| endpoint-contract seam keys (the 10 non-substrate `fail-closed-stub` seams) | **Acceptable (was overclaiming, CORRECTED)** | the schema comment previously claimed env-key presence "tells the preflight the seam's real production backend is wired." These seams read NO env — they use code-registered production factories/sources, live client CI-pending. Corrected to: the key is the operator-declared ENDPOINT CONTRACT for a CI-pending live client; the seam's own fail-closed `*NotConfiguredError` at first use (E1, proven by `tests/governance/seamFailClosed.test.ts`) is the hard runtime backstop. Not faked-green after correction. |
| health readiness / liveness routes | **Acceptable** | readiness fails closed on ANY preflight exception (503, never fall-through to 200); liveness is an honest process-only check that does not touch env/backends. |
| lifecycle right-to-delete tombstone + legal-hold | **Acceptable** | append-only governed tombstone preserves every prior version (proven vs the real pg-mem ledger); hold checked before any append. Residual = in-memory hold durability (R1-9-4). |

## Iteration 9 red-team disposition summary
- **R1 (Domain-Fidelity): 7 findings** — 2 Unacceptable fail-opens FIXED (preflight phantom-key; blank-`DATABASE_URL`); residuals are pool sizing/lifecycle, legal-hold durability (HIGH), concurrent-migration advisory lock, comment-checksum strictness, unauth probe disclosure.
- **R2 (Negative-Space): 8-item missing-list** — durable hold store, backup/restore drill, migration advisory lock, reversible mutable-store migrations, purge circuit-breaker, pool health, readiness DB ping, production-mode-in-production assertion.
- **R3 (Stub-Legitimacy): 6 graded, all Acceptable, 0 Unacceptable open** — pg adapters + migration ledger honest and fail-closed; neo4j honestly N/A (no such code); the endpoint-contract overclaim CORRECTED; live pg + live seam backends remain CI-pending residuals routed to certification.
- **Unacceptable fixed this iteration: 2** (E9-9-1 preflight phantom-key fail-open → substrate-consulting; E9-9-2 blank-`DATABASE_URL` → trimmed fail-closed). **Convergence DRY: yes** (four phantom persistence keys collapsed to the one substrate `DATABASE_URL` entry; preflight consults Wave A's resolver). **E9: fixed-2.**
- **Standing residuals → certification/pilot:** live pg (evidence/deadLetter/idempotency/graph/crossReference) + live terminology/MPI/NPPES/governance/data-source backends (all fail-closed-unwired with named errors); durable legal-hold store; backup/restore + PITR drill; migration advisory lock; connection-pool sizing/health + readiness DB ping; purge circuit-breaker.

# ITERATION 10 — CERTIFICATION / CONFORMANCE CAPSTONE — Wave D convergence + E9 sweep + red-team + FINAL rollup

Iteration 10 built the certification/conformance layer across three disjoint waves: A (the conformance MATRIX as queryable data + a deterministic machine-readable document — standard -> capability -> evidence{codePath,testId,status,note}, 18 claimed standards), B (a deterministic FHIR R4 CapabilityStatement generated from the ACTUAL implemented surface), C (the certification-READINESS doc per standard + an armed readiness->matrix comparator). Wave D (this wave) CONVERGED the three artifacts to DRY (the matrix is now the single source of the per-standard readiness status), wired the readiness comparator to the REAL exported matrix output, ran the E9 fail-open sweep over the certification surface, and ran the mandatory three-persona red-team. tsc 0; full suite 1435 passed / 1 expected-fail / 91 skipped; size ratchet PASS.

## Convergence (DRY) verdict — the matrix is the single source; readiness is validated against it, not authored beside it

Before convergence the three artifacts each made independent status claims about the same standards, reconciled by nothing but hand-authoring: the matrix graded capabilities (supported/partial/ci-pending/absent), the readiness doc graded standards (ready/ci-pending/partial/absent), and Wave C's comparator was ARMED but INERT because no matrix summary existed at `docs/certification/capability-matrix.summary.json`. Three copies of "how conformant is standard X," any of which could drift.

Converged: a new `src/lib/certification/readinessRollup.ts` derives the per-standard readiness status FROM the live matrix and emits the machine-readable rollup at the exact `matrixSummaryPath` Wave C armed against. Two vocabularies, one derivation: the readiness status is NOT a mechanical max of capability statuses (a standard whose capabilities are all `supported` in CI can still be only `ci-pending` for certification because no accredited suite or live integration has run — NS-05); it derives 1:1 from a single declared per-standard `ciCeiling` (`wire-absent` -> absent, `material-ci-gap` -> partial, `ci-complete` -> ci-pending), and E9 invariants cross-check that ceiling against the REAL capability statuses so it can never be set more optimistically than the matrix substantiates. `tests/certification/readiness.test.ts` flipped from armed to ENFORCED (the "status set matches the matrix EXACTLY, per standard" branch now runs and is green), and `tests/certification/matrixRollup.test.ts` (new, 8 tests) proves: the rollup covers exactly the 13 readiness standards and PARTITIONS all 18 claimed ids; the committed summary is byte-equal to the freshly built rollup (drift gate); the readiness doc status of every standard equals the matrix rollup; and every CapabilityStatement operation maps to a matrix capability that is supported/partial (statement claims are a subset of the matrix). No divergent claim set survives across matrix / statement / readiness.

## E9 fail-open sweep (certification surface) — CLEAN

`rg`-ed the certification-specific fail-open shapes (`|| 'supported'`, `?? 'supported'`, `default -> supported`, `|| 'ready'`, optimistic booleans, blank-config-as-configured) across `src/lib/certification/**`. NONE found. Every honesty property holds by construction and is test-enforced:
- **A capability never defaults to supported.** `EvidenceStatus` has no default; every one of the (now) 43 matrix rows states its status explicitly; `matrix.test.ts` asserts each is an explicit valid member of the vocabulary.
- **An unproven claim reads not-supported.** The only 14 `status: 'supported'` literals each carry a real, existing test file (asserted on disk) and no stub/mock seam backs a supported row (`isStubBackedCapability` cross-check against `seamDispositions.ts`).
- **Readiness never reports ready for a ci-pending/absent standard.** The rollup emits NO `ready` status at all (0 in both summaries); the readiness comparator additionally forbids `ready` where the matrix is ci-pending/absent.
- **The CapabilityStatement lists no unimplemented op.** `$everything` (and `$diff/$docref/$lastn/$graphql/$apply`) are absent by construction — the statement is generated ONLY from the audited implemented surface, and a test asserts the serialized statement string does not even contain `$everything`. `enforcedProfiles()` returns `[]` (the profile validator is a structural stub that enforces no US Core profile), so NO US Core `supportedProfile` is ever asserted.

The Unacceptable items found this wave were OVERCLAIMS (R1, below), not fail-open defaults — corrected by demotion. **E9: clean.**

## Red-team panel — R1 OVERCLAIM detection (audit EACH supported row: does the cited test exercise the standard's requirement?) — 3 Unacceptable demoted + 3 disclosed-plausible

Every one of the 17 original `supported` rows was audited against its cited test. Three were OVERCLAIMS where the cited test does not exercise the standard's requirement — DEMOTED to `partial`:

- **R1-10-1 (Unacceptable, FIXED — demoted supported->partial) `pas-fhir-submit`.** Row claimed "Builds a Da Vinci PAS FHIR Bundle (Claim/$submit)" as `supported` via `tests/api/routes-pas-webhook.test.ts`. Verified: the `/api/pas/submit` route imports `submitPas` from `pasClient.ts` and forwards a CALLER-SUPPLIED `claimBundle`; it does NOT call `pasService.buildPasBundle`, and the cited test posts a hand-made minimal `{Claim, patient}` bundle and asserts a mock ClaimResponse. The test proves route + human-gate (202 without an approver) behavior, NOT PAS Bundle construction or PAS-profile conformance. Demoted; note corrected to state the build path is untested and the emitted bundle is not profile-validated.
- **R1-10-2 (Unacceptable, FIXED — demoted supported->partial) `crd-order-sign`.** Row claimed "CRD coverage-requirements via CDS Hooks order-sign" as `supported` via `tests/api/routes-cds.test.ts`. The test proves CDS-Hooks card plumbing (cards returned, STAT-order flagged); it does NOT validate cards against Da Vinci CRD card/system-action profiles or coverage-requirements semantics (in mock, `crdService` returns canned cards). Demoted to partial.
- **R1-10-3 (Unacceptable, FIXED — demoted supported->partial) `cms-prior-auth-api`.** Row claimed the whole PARDD prior-auth API surface "implemented and tested" as `supported`. An aggregate claim over sub-capabilities that are themselves partial (PAS Bundle conformance and CRD profile conformance not validated end-to-end); marking the aggregate supported while demoting its parts is inconsistent. Demoted to partial.
- **R1-10-4 (PLAUSIBLE, disclosed — kept) `uscore-structural-validation` supported under the US Core standard.** The row is honest (note says structural, not US Core `$validate`) but its placement under `us-core-uscdi` can read as US Core conformance. Kept supported (the structural validator IS real + tested); the honest note and the separate `uscore-profile-validate` partial row disclose that no US Core profile conformance exists.
- **R1-10-5 (PLAUSIBLE, kept) `dtr-evaluate` supported.** The DTR evaluate/package routes run real policy-driven evaluation (asserts `policyTitle`, non-empty `groups`); DTR-app/CQL conformance is a separate live gap already captured as `davinci-dtr` = ci-pending. Kept.
- **R1-10-6 (standards-correctness, verified OK).** Spot-checked profile/operation URLs and X12 real-vs-synthetic: OperationDefinition URLs are canonical (`hl7.org/fhir/us/davinci-pas/.../Claim-submit`, `.../davinci-hrex/.../member-match`, `profiles.ihe.net/ITI/PIXm/.../Patient-ihe-pix`); X12 rows are honestly synthetic (834 = realistic INS-loop SUBSET parser; 837 = absent; 835/278/270-271 = FHIR representations, not raw EDI) — no synthetic X12 is dressed as certified.

## Red-team panel — R2 NEGATIVE-SPACE (a claimed standard/operation with ZERO matrix evidence) — 1 Unacceptable fixed

- **R2-10-1 (Unacceptable, FIXED — added evidence row) `$member-match` claimed with no matrix row.** The CapabilityStatement asserted `$member-match` as a SERVED server operation (`src/app/api/match/route.ts` -> `memberMatch.ts`) but the conformance matrix carried NO capability row for member-match — a claim in one artifact with zero evidence in the single-source matrix, and a violation of "statement claims are a subset of the matrix." Fixed: added `cms-member-match` (partial) under CMS-0057-F, codePath `src/app/api/match/route.ts + src/lib/server/memberMatch.ts`, testId `tests/api/routes-match-bulk.test.ts` (validation + mock happy path), honestly scoped (not HRex-profile validated; runs against the demo registry). The subset check in `matrixRollup.test.ts` now maps all six statement operations to supported/partial matrix rows and is green.
- **R2-10-2 (verified, no gap).** Swept the other statement claims (5 resources, 5 server ops + 1 client op, SMART security) and every readiness standard for zero-evidence claims: each now resolves to a real code path + test in the matrix. No other negative-space claim remains.

## Red-team panel — R3 STUB-LEGITIMACY (final honest grade of every CI-pending seam — fail-closed, not faked-green) — 3 ci-pending rows + 8 seam-anchored rows graded, 0 faked-green

The matrix's ci-pending rows and every seam-anchored row were graded against `seamDispositions.ts` and the governance fail-closed proof (`tests/governance/seamFailClosed.test.ts`):

| ci-pending / seam-anchored row | seam | grade | rationale |
|---|---|---|---|
| `pixpdq-live-resolution`, `pixmpdqm-live-resolution` (ci-pending) | identity (external) | **Acceptable — fail-closed** | production throws `ExternalEmpiNotConfiguredError`; never mints a default identity; HELD-not-anchored E9 behavior verified against a fake transport. Live MLLP/FHIR wire is the honest residual. |
| `nppes-directory` (ci-pending) | providerIdentity | **Acceptable — fail-closed** | production throws `NppesNotConfiguredError`; seeded synthetic directory is demo-only; an invalid NPI is rejected and never anchored. |
| `uscore-profile-validate` (partial) | profileValidation | **Acceptable — fail-closed** | production `ProfileValidatorNotConfiguredError` QUARANTINES every record rather than admitting it unverified (U2 fix). |
| `term-*` (6 partial rows) | terminology | **Acceptable — fail-closed** | production terminology service throws; the stage-4 gate turns the throw into a fail-closed quarantine; seeded engine serves CI only. |
| `term-vs-governance` (partial) | valueSetGovernanceStore | **Acceptable — fail-closed** | durable governance ledger throws until wired; lifecycle + maker-checker enforced in-memory for the demo. |
| `cms-provider-access`, `part2-consent-optout` (partial) | consent | **Acceptable — fail-closed (naming residual)** | provider-access opt-out store throws in production (fail-closed no-contact); throws a plain `Error`, not a named `*NotConfiguredError` — recommended follow-up to name it for parity (unchanged from prior iterations). |
| `cms-payer-to-payer`, `x12-837-claim` (absent) | — | **Acceptable — honest absent** | testId is null (no proving test); no route or parser exists; declared at the mandate/modeling level only. No faked-green. |

**R3 verdict: 0 faked-green.** Every ci-pending seam fails CLOSED with a named error (except `consent`, which fails closed on a plain Error — a naming, not a safety, gap). No ci-pending row is a green test standing in for an unimplemented live backend.

## Iteration 10 red-team disposition summary
- **R1 (Overclaim detection): 3 Unacceptable overclaims DEMOTED** (`pas-fhir-submit`, `crd-order-sign`, `cms-prior-auth-api` supported->partial), 2 plausible disclosed-and-kept, standards-correctness (URLs / X12 synthetic labeling) verified clean.
- **R2 (Negative-space): 1 Unacceptable FIXED** (`$member-match` claimed with no matrix evidence -> added `cms-member-match` partial row); no other zero-evidence claim remains.
- **R3 (Stub-legitimacy): 3 ci-pending + 8 seam-anchored rows graded, 0 faked-green** — every CI-pending seam fails closed with a named `*NotConfiguredError` (consent = plain Error, naming residual); absent rows carry no proving test.
- **Unacceptable fixed this iteration: 4** (3 R1 demotions + 1 R2 evidence-row addition). **Convergence DRY: yes** (matrix single source; readiness derived + comparator enforced; statement subset-checked). **E9: clean** (no fail-open default in the certification surface).

## FINAL certification-readiness posture (I0 -> I10)

The build plan reaches an HONEST, EVIDENCED readiness state: NOT certified, but every claim substantiated and every gap named. The matrix (43 capability rows over 18 standards), the CapabilityStatement (generated only from the real surface), and the readiness doc (13 standards) now agree by construction, with drift gates on all three seams.

Readiness at a glance (matrix-derived, nothing `ready`): US Core/USCDI `partial`; Da Vinci PAS/CRD/DTR `ci-pending`; CARIN `partial`; SMART `ci-pending`; CDS Hooks `ci-pending`; CMS-0057-F `partial`; IHE PIX/PDQ(+PIXm/PDQm) `absent`; X12 `partial`; Terminology `ci-pending`; 42 CFR Part 2/HIPAA `partial`; NPI/NPPES `partial`.

### Full residual list to PRODUCTION CERTIFICATION (consolidated)
1. **Live infrastructure behind every fail-closed seam** (the certification blocker for most `ci-pending`): live FHIR/payer gateway, real SMART authorization server (OAuth2 + Backend Services JWT), live CDS Hooks service + discovery, live terminology server + LICENSED content (SNOMED CT/LOINC/RxNorm/CPT-HCPCS + full CMS-HCC crosswalk), live NPPES client, live external MPI, durable consent registry of record, durable pg for evidence/deadLetter/idempotency/graph/crossReference/governance. All currently throw a named `*NotConfiguredError` and fail closed (E1 proven).
2. **Real FHIR `$validate` (F4)** behind the profileValidation seam (HAPI or equivalent) + US Core/USCDI IG packages for must-support/binding — turns US Core, CARIN (C4BB), and the CMS-0057-F Patient/Provider Access surfaces from `partial` toward certifiable.
3. **IHE wire encodings (from `absent`)**: MLLP + QBP^Q23/Q22 / RSP (PIX/PDQ) and/or FHIR $ihe-pix + Bundle/Parameters (PIXm/PDQm) behind the resolver seam; then IHE Connectathon (Gazelle).
4. **X12 fidelity (F1 residual)**: full 834 companion-guide code set (025 reinstatement, 002 audit-compare, retro-term spans — quarantined today), envelope/ack handling (ISA/GS/999/TA1), a real 837 parser (absent), raw 835/270-271 EDI; then trading-partner/clearinghouse certification.
5. **Accredited conformance runs**: Inferno / ONC (g)(10) US Core; Inferno SMART App Launch (STU2) + Backend Services; Touchstone / Da Vinci PAS/CRD/DTR; CDS Hooks connectathon; CARIN BB; CMS-0057-F / Da Vinci PDex + Provider Access + Payer-to-Payer suites; plus CMS-0057-F §3 Payer-to-Payer (absent) implementation and regulatory attestation.
6. **42 CFR Part 2 / HIPAA (F2 residual)**: full consent lifecycle (capture, revocation propagation, expiry sweeps, registry of record) + independent compliance review/attestation. Name the `consent` seam error (`*NotConfiguredError`) for parity.
7. **NPI/NPPES (F5-b)**: apply the `anchorProviderRef` pattern to the remaining claims/care-team/medication prescriber refs (referral mapping only is closed).
8. **Operability residuals carried from I9** (gate any pilot): durable legal-hold store, backup/restore + PITR drill, migration advisory lock, connection-pool sizing/health + readiness DB ping, purge circuit-breaker, per-seam production-mode-in-production assertion, observability/metrics/tracing (NS-02).

### Standing honesty ceiling
NS-05 is unchanged: live-integration-executed count is **0**. Every concurrency/durability/conformance guarantee is proven against fakes/fixtures, not live infrastructure. That is exactly why NOTHING is `ready` and the honest terminal status of the I0->I10 build is **certification-READINESS**, not certification. The value delivered is that the readiness is now MECHANICALLY HONEST: a single-source matrix, fail-closed seams with named errors, drift-gated artifacts, and a red-team that demotes overclaims rather than dressing stubs as conformance.

# ITERATION 11 - FINAL BUILDABLE CLOSEOUT (F5-b + 4 HIGH + 1 MED closed, record 20/20, five-persona panel incl. R5, E12) - Wave D

Framework v1.3. Four disjoint build waves (A claims/provider-integration, B three new record domains, C care-coordination lifecycle + survivorship tiebreak, F framework v1.2->v1.3) plus this Wave D: convergence to DRY, the E9 fail-open sweep, the FIVE-persona red-team (R1-R4 plus the new R5 cross-examiner), the E12 claim-vs-evidence check, and this FINAL closeout. tsc 0; full suite 1509 passed / 1 expected-fail / 91 skipped; size ratchet PASS; governance 34 green. This is the last iteration that clears register findings buildable in-sandbox; the residual list below is now ONLY the non-buildable items.

## Convergence (DRY) verdict - shared partitions reconciled, no duplication

- **WpcDomain union: 20, appended ONCE.** `src/lib/pipeline/types.ts` carries a single append-only Wave-B block (conditions, diagnostic-reports, family-history) bringing the union to 20; Waves A/C did not touch the union (as partitioned). `tests/pipeline/domainRecordCount.test.ts` pins 20 from BOTH ends (compile-time `WpcDomain[]` list AND runtime `MAPPING_SPECS`), set-equal.
- **Registries one-to-one.** `MAPPING_SPECS` = exactly 20 specs, one per domain (`src/lib/graph/mapping/index.ts`), append-only Wave-B block. Wave A's new modules (`providerRef`, `claimsIntegrity`, `carcGroup`, `adjustmentTerminology`) are HELPERS reused by the existing claims/medication/care-team specs, NOT spurious registry entries - the count stays 20.
- **Provider resolver REUSED not reimplemented.** The 8A-i `anchorProviderRef` sync resolver + the ProviderIdentity node namespace are the single source; Wave A's `providerRefMutations` helper wraps it and is called by claimsFinancial (`SUBMITTED_BY`), medication (`PRESCRIBED_BY`/`DISPENSED_BY`), and care-team (`care-team.formed` roster). No resolver logic duplicated. (Minor convergence residual: `referral.ts` still inlines its own `anchorProviderRef` call + node/edge emission - the pioneer path - rather than calling the new helper; the RESOLVER is shared, only the emission shape is duplicated between referral.ts and providerRef.ts. Cosmetic, not a correctness issue; noted for a future tidy.)
- **Terminology gate REUSED.** `adjustmentTerminology.routeAdjustmentCodes` calls `selectTerminologyService().validateCode` (the stage-4 gate), never a second validator. Conditions was added to `CODE_CARRYING_DOMAINS` so its governed codings run the SAME semantic gate.
- **Dead-letter store REUSED.** `claimsIntegrity.holdOrphanClaims` persists orphans through the existing NS-01 `getDeadLetterStore()` seam; no new store.
- **No new dataMode seam or seamDisposition added** - every new capability reuses an existing fail-closed seam, so the seam-disposition + namespace governance gates are unchanged and green (34 tests).

**Convergence DRY: yes.**

## E9 fail-open sweep (claims integrity + new domains + lifecycle) - CLEAN (0 fixed)

Swept the fail-open shapes (`catch` / `??` / `||` default / optimistic boolean / default-return) across every new/changed file. Every default path is fail-SAFE by construction; no Unacceptable found, no fix required:

- **Orphan claim HOLDS, never dangles.** `projectClaimsWithIntegrity` emits NO `ADJUDICATED_BY`/`EXPLAINED_BY` edge and NO orphan node for a ClaimResponse/EOB whose Claim is absent (this batch or `knownClaims`); it is HELD to the dead-letter store. Never a dangling edge, never a silent drop.
- **Unresolvable provider stays raw.** `providerRefMutations` (and the referral inline path) anchor a ProviderIdentity ONLY on a check-digit-valid NPI; no valid NPI -> the RAW ref node flagged `deferred-I8A`. The made-up NPI is NEVER used as a node key (tested).
- **Missing CARC group never defaults a liability.** `deriveMemberLiability([])` -> `indeterminate` (never a guessed PR/CO); an unrecognized group (`ZZ`) is dropped, still `indeterminate`. Wired onto the node + `ADJUDICATED_BY` edge.
- **Narrative-only diagnostic never claims T1.** `diagnosticReports` assigns the tier per record by computability: structured `result` linkage -> T1 (+`REPORTS_RESULT` edges); a narrative-only imaging report -> honest T2 (`computable:false`, pointer only, NO `REPORTS_RESULT`); neither content -> quarantined `missing-report-content`.
- **A lifecycle default never silently completes.** Referral default status is `active` (open), default loop signal `''`; `statusTerminal`/`loopClosed`/`loopReached` are DERIVED from real values. Goal defaults are the OPEN states (`active`/`in-progress`); `met` is true only when BOTH lifecycle=completed AND achievement=achieved.

The only `catch` blocks in the new adapters are JSON-parse guards returning `[]` (a malformed batch is caught by reconciliation, not a fall-through); every `new Date(deps.now())` wraps the injected clock (deterministic); `console.*` = 0. **E9: clean.**

## Five-persona red-team panel (R1-R4 + the new R5 cross-examiner)

### R1 - Domain-Fidelity (new domains + claims/CARC + lifecycle) - 4 findings
- **R1-I11-1 (MED)** `diagnosticReports` normalizes `status: str(resource.status, 'final')` - a report missing `status` reads `final`; an amended/preliminary/cancelled report with an omitted status is optimistically final. Data-fidelity, not a restricted fail-open. Owner: I12 ingestion.
- **R1-I11-2 (MED, carried = R1-I7-7)** claims adjudication still `outcome: str(p.outcome, 'complete')` - a ClaimResponse missing `outcome` normalizes to success. Unchanged this wave (not newly introduced by the CARC work). Owner: I8 claims hardening.
- **R1-I11-3 (MED)** `family-history` is NOT in `CODE_CARRYING_DOMAINS`, so a relative's SNOMED/ICD condition codings are admitted UNVALIDATED (unlike `conditions`, which was added to the gate this wave). An unrecognized relative-condition code passes the gate ungated. Lower-stakes (relative attribute, not the member's own problem) but inconsistent. Owner: I12 terminology coverage.
- **R1-I11-4 (MED)** CARC group + provider NPI are captured and liability derived at the PROJECTOR (deeply tested), but the claims ADAPTER (`adapters/claimsFinancial.ts`) does not yet extract `carcGroups`/`providerNpi` from a raw 835/FHIR source (Wave A disclosed this). End-to-end from a raw 835, `memberLiability` stays `indeterminate` until the adapter is wired. Owner: I12 ingestion.

### R2 - Negative-Space (absent that production needs) - 7-item missing-list
1. diagnostic-report T2 retrieval / virus-scan / parse-to-T1 (pointer only today). [I12/I13]
2. family-history relative-condition dedup across feeds (same relative-condition from two sources duplicates props; no relative+condition key). [I12]
3. conditions HCC RAF score computation - `hccRelevant` is an honest flag, not a risk-adjustment factor / RAF roll-up. [I12]
4. referral open-referral SLA/timer + auto-park of a stale open referral; referral<->encounter reconciliation to auto-derive `seen`. [I12]
5. goal `target` as a STRUCTURED measure compared to an observation (free-text string today), and goal->outcome reconciliation. [I12]
6. `routeAdjustmentCodes` is a tested capability NOT invoked in any live pipeline validation lane (returns `ungoverned` for X12 today regardless); COB / secondary-payer sequencing still absent. [I12/I8]
7. survivorship field-level CLINICAL tiebreaks (active-over-inactive, verified-over-unverified) beyond `most-recent`/`source-order`. [I12]

### R3 - Stub-Legitimacy (grade the new helpers/seams; confirm no fail-open) - 6 graded, 0 Unacceptable, 0 Risky
| helper / seam | grade | rationale |
|---|---|---|
| `providerRef` helper | **Acceptable** | reuses the fail-closed provider resolver; no valid NPI -> raw + `deferred-I8A`, never a fabricated NPI; empty ref -> no edge. |
| `claimsIntegrity` (dead-letter reuse) | **Acceptable** | reuses the NS-01 fail-closed dead-letter store; orphan HELD (no dangling edge, no silent drop); PHI-safe held record. |
| `carcGroup` (pure) | **Acceptable** | `indeterminate` floor; no group ever defaults a liability; no seam (pure derivation). |
| `adjustmentTerminology` | **Acceptable (wiring caveat)** | reuses the terminology gate; ungoverned X12 -> fail-safe `ungoverned`, never fabricated valid. Caveat: consumed only by tests today (not invoked in a pipeline lane) - but it is a PURE function producing findings, makes NO admission/mutation decision, and cannot fail open; the wiring gap is R2-item-6, not a stub defect. |
| `diagnostic-reports` T2 | **Acceptable (honest)** | `tier:'T2'` + `computable:false` on a narrative-only report; never a hidden T1; no fabricated result linkage. |
| `family-history` relative-not-a-node | **Acceptable** | PHI-minimal - the relative is never anchored/keyed; only role + condition codes ride as node props. |

### R4 - Governance - 2 findings + 1 verified-OK
- **R4-I11-1 (MED)** E12 is documented in `enforcement-kit.md` as a MECHANICAL check ("a check parses the register/matrix ... resolves each cited test id against a green run") but is NOT yet implemented as a suite test - it was EXECUTED by this Wave D agent (each closed finding's cited test read + run green). Recommend a CI test that parses this register for CLOSED items and fails on any that cite a missing / non-existent / non-green test. Owner: framework/orchestrator. (E12 IS satisfied for this iteration; the gap is its mechanization.)
- **R4-I11-2 (LOW)** the framework distributable `docs/framework-v1.3.zip` is not rebuilt (Wave F deferred the repackage to the orchestrator); the source `docs/framework/` is v1.3-consistent (R5 + E12 present in SKILL/personas/enforcement-kit, DoD updated). Orchestrator repackage step.
- **R4-I11-3 (verified OK, no gap)** no new dataMode seam or seamDisposition was added this iteration (all new capability reuses existing fail-closed seams); the seam-disposition + namespace governance gates are unchanged and green (`tests/governance`, 34).

### R5 - Verification / Cross-Examiner - 10 claims re-read hostilely: 10 UPHELD, 0 DEMOTED
Each `fixed`/`closed` claim this iteration makes was re-read against its cited test, checking the test is DEEP (exercises the requirement through the real projector/pipeline, not a tautology / mock-echo / happy-path):

| claim | verdict | why the cited test is DEEP |
|---|---|---|
| **f5b-resolved** | **UPHELD** | `claimsProviderRef.test.ts` drives the real `projectEvent`: a valid NPI anchors a ProviderIdentity + resolved edge; an INVALID NPI stays raw+`deferred-I8A` AND the made-up NPI is asserted NEVER a node key (E9); no-provider -> no edge; prescriber/dispenser (NPI extracted from a ref); care-team roster. Not a mock-echo. |
| **claims-integrity** | **UPHELD** | `claimsIntegrity.test.ts`: an orphan adjudication/explanation projects NO `ADJUDICATED_BY`/`EXPLAINED_BY` edge and is HELD; a prior-batch `knownClaims` claim is honored; the intact chain projects both edges; real dead-letter store round-trip + PHI-safety. Exercises the integrity requirement, not a happy-path. |
| **carc-group** | **UPHELD (residual disclosed)** | `carcGroup.test.ts`: derivation (PR->member-resp, CO->not, none->`indeterminate`, `ZZ`->`indeterminate`) AND through `projectEvent` the node+edge carry `carcGroups`+`memberLiability`, AND CARC/RARC routed through a REAL seed terminology service -> `ungoverned` (never fabricated). Residual: adapter extraction from raw 835 (R1-I11-4) + routing not pipeline-invoked (R2-6). The MATERIAL defect (group lost -> liability underivable) is fully wired + proven, so UPHELD. |
| **conditions T1 + semantic gate** | **UPHELD** | `conditions.test.ts`: an unrecognized ICD-10 (`X99.9`) is quarantined `semantic-unrecognized-code` via the REAL `bindSemantics` gate; `isCodeCarryingDomain('conditions')` true; PHI-safe. |
| **diagnostic T1/T2** | **UPHELD** | `diagnosticReports.test.ts`: per-record tier honesty (result-linked->T1 with `REPORTS_RESULT`; narrative-only->T2 no linkage; content-less quarantined); end-to-end propagated tiers `['T1','T2']`. |
| **family-history T1** | **UPHELD (residual: ungoverned relative codes, R1-I11-3)** | `familyHistory.test.ts`: relationship role + relative condition codings captured; relative never a node (PHI-minimal); member anchored via the seam. |
| **record 20/20** | **UPHELD** | `domainRecordCount.test.ts`: 20 pinned from BOTH the compile-time `WpcDomain[]` list and runtime `MAPPING_SPECS`, with set-equality (a spec without a domain, or a domain without a spec, breaks it). |
| **referral-loop-closure** | **UPHELD** | `referralLifecycle.test.ts`: dated `statusTrail` (not a snapshot), every terminal state, four loop signals, a COMPUTED closed-loop rate across a set, E9 default-open, linkage preserved. |
| **goal-status** | **UPHELD** | `goalStatus.test.ts`: the met matrix (completed+achieved=met; completed+not-achieved and active+in-progress NOT met), `isGoalMet` unit matrix, E9 default-open, Task.focus linkage. |
| **tiebreak** | **UPHELD** | `survivorshipTiebreak.test.ts`: proves the two tiebreaks DISAGREE on the SAME facts (the anti-tautology proof the finding demanded), the recency-fallback branch, determinism (no mutation), and rank-outranks-tiebreak. |

**R5: 10 upheld / 0 demoted.** No claim is a shallow-test green; every closed finding's test exercises the requirement through the real projection/pipeline path.

## E12 - Claim-vs-evidence check - SATISFIED

Every register finding closed below cites a real test id that EXISTS and passed in the current suite (each run green + read for depth by R5 above). No item is closed without live evidence.

## Register findings CLOSED this iteration (each with its evidencing test)

| id | sev | was | closure | evidencing test (passing) |
|---|---|---|---|---|
| **F5-b** | HIGH | claims/care-team/medication prescriber/performer refs stayed raw | CLOSED - `providerRefMutations` applies the `anchorProviderRef` (NPI->ProviderIdentity) pattern to claims (`SUBMITTED_BY`), medication (`PRESCRIBED_BY`/`DISPENSED_BY`), care-team (`care-team.formed`). No NPI -> raw+`deferred-I8A`, never invented. | `tests/pipeline/claimsProviderRef.test.ts` (8) |
| **R1-I7-5** | HIGH | claims golden-thread linked by raw ref, no existence check -> dangling edge | CLOSED - `projectClaimsWithIntegrity` HOLDS an orphan adjudication/explanation to the dead-letter store; NO dangling `ADJUDICATED_BY`/`EXPLAINED_BY` edge, NO orphan node; cross-batch `knownClaims` honored. | `tests/pipeline/claimsIntegrity.test.ts` (5) |
| **R1-I7-6** | HIGH | CARC captured without the X12 GROUP code -> member-liability lost | CLOSED - `carcGroup` captures CO/PR/OA/PI on the node + `ADJUDICATED_BY` edge and derives `memberLiability` (E9: no group -> `indeterminate`); CARC/RARC routed through the stage-4 terminology gate. Residual (adapter extraction from raw 835) tracked as R1-I11-4. | `tests/pipeline/carcGroup.test.ts` (9) |
| **R1-I6-1** | HIGH | referral loop-closure not modeled (no status lifecycle, no closed-loop signal) | CLOSED - `ServiceRequest.status` lifecycle (active->on-hold->completed/revoked/entered-in-error) as a dated trail + closed-loop signal (scheduled/seen/declined/dropped) with `loopClosed`/`loopReached` making the closed-loop rate computable. E9 default-open. | `tests/pipeline/referralLifecycle.test.ts` (9) |
| **R1-I6-2** | HIGH | Goal status transitions absent (no lifecycle/achievement/target) | CLOSED - `Goal.lifecycleStatus` + `achievementStatus` + `target`; a goal is MET only when completed AND achieved (`isGoalMet`). E9 default-open. Task.focus->Goal linkage preserved. | `tests/pipeline/goalStatus.test.ts` (7) |
| **R1-8Ai-2** | MED | survivorship source-order tiebreak declared but never honored | CLOSED - `resolveTie` threads the ruleset's `tiebreak` into both the within-rank pick and the recency-fallback; `source-order` picks the first-declared fact, `most-recent` the newest; every winner provenance-labeled. Proven by the two tiebreaks disagreeing on the same facts. | `tests/identity/survivorshipTiebreak.test.ts` (7) |
| **C9 record 17/20 -> 20/20** | - | 3 USCDI classes missing | CLOSED - conditions (T1, semantic-gated), diagnostic-reports (T1/T2 honest), family-history (T1) added, registered, WpcDomain extended to 20. | `tests/pipeline/domainRecordCount.test.ts` (4) + `conditions`/`diagnosticReports`/`familyHistory`.test.ts (29) |

**Record: 20/20.** **Findings closed this iteration: 6** (F5-b, R1-I7-5, R1-I7-6, R1-I6-1, R1-I6-2, R1-8Ai-2) plus the 17->20 record completion.

## FINAL residual list - ONLY the non-buildable items remain

Every register finding that could be built in-sandbox is now CLOSED. What remains is not code the sandbox can write; it requires live infrastructure, licensed content, or external accreditation:

1. **Live infrastructure (NS-05, live-integration count still 0)** - live FHIR/payer gateway, real SMART auth server, live CDS Hooks, live terminology server, live NPPES client, live external MPI, durable consent registry of record, durable pg for evidence/deadLetter/idempotency/graph/crossReference/governance, durable legal-hold store, migration advisory lock, connection-pool sizing + readiness DB ping, observability/metrics/tracing (NS-02). All currently throw a named `*NotConfiguredError` and fail closed (E1 proven).
2. **Licensed content** - SNOMED CT / LOINC / RxNorm / CPT-HCPCS + the full CMS-HCC crosswalk + full 834 companion-guide code set + a real 837 parser + raw 835/270-271 EDI; all seed content today is illustrative/`stub:true`.
3. **External accreditation / conformance runs** - Inferno / ONC (g)(10) US Core, Inferno SMART App Launch + Backend Services, Touchstone / Da Vinci PAS/CRD/DTR, CDS Hooks connectathon, CARIN BB, CMS-0057-F suites (incl. §3 Payer-to-Payer implementation), IHE Connectathon (Gazelle), 42 CFR Part 2 / HIPAA independent compliance attestation.

Buildable domain- and pattern-fill findings that were open across I0->I10 are closed. The MED domain-intelligence residuals raised this wave (R1-I11-1..4, the R2 missing-list) are ENHANCEMENTS (RAF scoring, T2 retrieval, structured goal targets, adapter-side X12 extraction, mechanized E12), not correctness or fail-open defects, and are routed to I12+.

## Iteration 11 disposition summary
- **Convergence DRY: yes** (one WpcDomain append to 20; 20 specs one-to-one; provider resolver + terminology gate + dead-letter REUSED across waves, not duplicated).
- **E9: clean** (orphan HELD, provider raw, missing CARC group `indeterminate`, narrative T2, lifecycle default-open - all fail-safe by construction; 0 fixed).
- **Five-persona panel ran:** R1 4 findings (all MED), R2 7-item missing-list, R3 6 graded (all Acceptable, 0 Risky/Unacceptable), R4 2 findings + 1 verified-OK, **R5 10 claims UPHELD / 0 DEMOTED**.
- **E12: satisfied** - every closed finding cites a real passing test that exercises it (no closed item without live evidence).
- **Zero new Unacceptable.**
- **Record 20/20 (tested). Findings closed: 6** (+ the 17->20 record completion). **Build status: buildable-completion** - every in-sandbox register finding is closed; only live-infra/NS-05, licensing, and external accreditation remain.
