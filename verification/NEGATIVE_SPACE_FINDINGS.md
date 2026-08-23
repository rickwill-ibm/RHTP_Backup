# Negative-Space / Completeness Audit — Iterations 0–4

**Retroactive audit. Mandate: enumerate what a production version MUST have that was
built or mentioned NOWHERE.** This is a missing-list, not a pass. Scope: pipeline,
identity/EMPI, terminology (+ value-set registry), graph (dual backend), SDE, outbox,
evidence ledger, carePlan, agents, agentRuntime, authz, consent.

Method: read all five iteration summaries + `docs/BUILD_LESSONS_AND_ROADMAP.md`, then
the code under `src/lib/{pipeline,identity,terminology,graph,sde,outbox,evidence,carePlan,agents,agentRuntime,authz,consent}`,
the `src/app/api` route tree, and the `tests/` tree. Findings are grounded in specific
files; each names the failure scenario the absence enables.

Severity: **CRITICAL** (data loss / silent corruption / compliance breach in prod) ·
**HIGH** (operator-blind or unrecoverable failure class) · **MED** (degraded, real, not
yet dangerous at demo scale) · **LOW** (scale/edge, matters at volume).

Owning iteration: the iteration that built the component and left the gap, or **NEW
BACKLOG** where no roadmap item covers it. Where the roadmap *does* schedule it, that is
noted — but a scheduled item is still absent today and several summaries overstate the
current state ("always audited", "route to human review", "idempotent") in ways the code
does not back up.

---

## Ranked missing-list

### NS-01 — No dead-letter / quarantine / held-review PERSISTENCE or operator surface
- **Component:** pipeline (`transform.ts` quarantine + held records), outbox (`sequencing.failIntent`), identity (`heldIdentity.ts`)
- **Absent:** Quarantine records, held-for-review records, and terminally-failed outbox
  intents are *constructed as return values* and handed back in a result object. There is
  no durable quarantine store, no DLQ table, no queue, and no API route or console to list,
  inspect, re-drive, or resolve any of them. `AlarmSink`/`QuarantineSink` (`outbox/types.ts:133-149`)
  are **optional injected interfaces with no production implementation** (`deps.alarm?.raise`,
  `deps.quarantine?.add`). The EMPI litmus test's whole promise — "possible match is HELD for
  review, never auto-linked" — routes to a lane **that has no reviewer surface and no store**.
- **Failure scenario:** A batch with 30 quarantined records and 4 held-identity records runs;
  the caller drops the result; the records are gone. A member sits permanently unresolvable in
  the possible-match band with nobody able to see or action it. A poison message exhausts retries,
  `failIntent` runs with `alarm` undefined, and the failure is silent — the member's event never
  propagates and no operator is paged.
- **Severity:** CRITICAL
- **Owner:** Iterations 1 & 4 (built the lanes, not the sinks). Reviewer surface = NEW BACKLOG.

### NS-02 — No metrics / telemetry / instrumentation anywhere
- **Component:** all subsystems
- **Absent:** No counters, gauges, histograms, OpenTelemetry, StatsD, or Prometheus in any of
  the twelve components. There is structured logging (`server/log.ts`) and a correlation-id minter,
  but no emitted metric for throughput, quarantine rate, held-review depth, disposition mix,
  escalation-park backlog, projector lag, outbox drain latency, or match auto-link/hold ratios.
- **Failure scenario:** Quarantine rate quietly climbs from 1% to 40% after an upstream schema
  drift; nothing surfaces it because nothing counts it. Operators cannot answer "is the pipeline
  keeping up?", "how many identities are held right now?", "how many agent proposals are aging in
  the queue?" — the system is flying blind in production.
- **Severity:** HIGH
- **Owner:** NEW BACKLOG (cross-cutting; no roadmap item owns observability).

### NS-03 — No right-to-delete / erasure / retention / purge across append-only stores
- **Component:** evidence ledger, outbox (`outbox_intent` "append-mostly, retained"), graph projection, audit
- **Absent:** The design leans hard on immutability (evidence ledger append-only + DB trigger;
  outbox intent table is "the sanctioned per-member ordered event history"; graph is replay-derived).
  There is **no member-erasure, redaction, crypto-shredding, retention window, or archival path**
  anywhere. HIPAA/state right-to-delete and minimum-retention obligations are structurally in
  tension with the immutability design, and that tension is unaddressed.
- **Failure scenario:** A member exercises a deletion right (or a wrong-person merge must be
  scrubbed). There is no mechanism to remove or tombstone their PHI from the outbox history, the
  evidence ledger, or the projected graph without breaking the replay invariant. Compliance
  cannot be met and unbounded tables grow forever.
- **Severity:** CRITICAL (compliance)
- **Owner:** NEW BACKLOG.

### NS-04 — Consumer idempotency is in-memory, per-call only; at-least-once redelivery double-acts
- **Component:** SDE intake (`sde/intake/signalIntake.ts`), agents (outreach send effect)
- **Absent:** `intakeSignals` dedupes on `eventId` using a `Set` **local to a single function
  call** (`signalIntake.ts:92`). There is no persistent processed-event / consumer-offset store.
  The outbox is explicitly at-least-once on crash-recovery republish (writer pump republishes
  confirmed-but-unpublished rows; summary I2 confirms "at-least-once by design"). Agent tool
  effects (e.g. outreach "sends only on approval") carry **no idempotency key at the effect
  boundary**.
- **Failure scenario:** The outbox republishes a member's confirmed events after a crash. A fresh
  SDE intake call sees them as new (its `seen` Set is empty), produces duplicate signals, yields a
  duplicate approved touchpoint, and the outreach agent sends the member the same message twice.
  "Idempotent on eventId" is true only within one process invocation.
- **Severity:** HIGH
- **Owner:** Iterations 2 (SDE) & 3 (agents).

### NS-05 — Live-integration-executed count = 0: every concurrency/durability guarantee is UNPROVEN
- **Component:** outbox (multi-writer CAS + `UNIQUE(member_id,sequence)`), agentRuntime (Temporal
  durability), graph (Neo4j Cypher semantics, PG projection), evidence (DB immutability trigger)
- **Absent:** Across all four iterations the count of components whose testcontainer/live spec has
  actually run against real infra is **0** (stated in every summary and `FAKE_FIDELITY.md`). pg-mem
  models no concurrency, constraints, or advisory locks; the Neo4j "backend" is an in-memory fake;
  Temporal is an in-process `Map`. The specific L1 lesson — "the outbox passed every pg-mem test but
  carried two real Postgres bugs" — proves fake-green is not production-proven, yet nothing has since
  been run live.
- **Failure scenario:** The `UNIQUE(member_id,sequence)` backstop, the `claimForConfirm` CAS
  retry-on-collision (16-attempt spin, `pgOutboxStore.ts`), the durable escalation timer, and the
  worker-crash proposal-resume all work on the fake and fail (or behave differently) on real infra —
  discovered first in production because no live gate has ever executed.
- **Severity:** HIGH (this is the honest maturity ceiling for everything built)
- **Owner:** Iteration 9/10 per roadmap — but flagged CRITICAL-to-track now.

### NS-06 — Agent runtime timers & state are in-process; escalation SLAs die on restart
- **Component:** agentRuntime (`engine.ts`, `escalation.ts`, `FAKE_FIDELITY.md` gaps 1,3,4)
- **Absent:** Durable timers, worker-crash recovery, and cross-process visibility. Timers live in
  a `Map` and only advance via `advanceTime()`; a restart loses every pending escalation SLA and
  every suspended `proposeAndWait`. The fake-fidelity ledger names these gaps honestly, but the
  durable substitute does not exist yet (Temporal drop-in is a seam).
- **Failure scenario:** A referral stalls; its escalation SLA timer is pending; a deploy restarts
  the worker; the timer silently never fires; the stall never escalates; the member's referral is
  lost with no park, no alarm, no audit — the exact "never silent expiry" guarantee is void across
  a restart.
- **Severity:** HIGH
- **Owner:** Iteration 3 (built the fake) → real substrate Iteration 9.

### NS-07 — No agent kill switch, per-agent disable, or runtime rollout/rollback
- **Component:** agents/manifest, agentRuntime
- **Absent:** Autonomy is manifest data (`autonomyTier`), but there is **no runtime enable/disable,
  no kill switch, and no rollout/rollback control** to stop a misbehaving agent without a code
  deploy. `flags/flags.ts` exists but is wired to none of agents/SDE/outbox/runtime (grep: zero
  references). Flipping a manifest tier requires redeploying the manifest data.
- **Failure scenario:** The outreach agent begins proposing garbage after a policy-data change.
  There is no switch to halt just that agent; the only remediation is a full redeploy, during which
  it keeps proposing.
- **Severity:** MED (HIGH once any tier is non-HITL)
- **Owner:** NEW BACKLOG.

### NS-08 — No drift detection between the FHIR system-of-record and the graph projection
- **Component:** graph (`projector.ts`, `replay.ts`), pipeline reconciliation
- **Absent:** Reconciliation is **single-batch count-balance only** (`countIn === loaded + rejected`,
  `transform.ts:reconcile`). There is no periodic reconciliation between the FHIR store (source of
  truth) and the projected graph, no count/checksum comparison, no drift alarm. A projection can
  silently diverge (dropped event, projector bug, partial rebuild) and nothing detects it.
- **Failure scenario:** A projector deploy drops a mapping for `MedicationDispense`; new dispenses
  never reach the graph; every batch still "balances" because the pipeline count gate is upstream of
  the projector; the care-gap lens under-reports for weeks before anyone notices by hand.
- **Severity:** HIGH
- **Owner:** NEW BACKLOG.

### NS-09 — No cross-source dedup or referential-integrity / orphan detection in the graph
- **Component:** graph (projector, mappings), pipeline
- **Absent:** Reconciliation covers within-batch counts, not cross-source dedup (same clinical fact
  arriving from two feeds → two nodes) and not referential integrity across domains. Edges like
  `PERFORMED_DURING → Encounter` or `PRESCRIBED_FOR → member` can be projected to a node that was
  never created (out-of-order or dropped upstream event); nothing scans for dangling edges / orphan
  nodes.
- **Failure scenario:** A procedure event references an encounter whose event was quarantined; the
  causal edge points to a non-existent node; the whole-person lens renders a phantom relationship
  and no orphan sweep ever flags it.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-10 — Projector assumes in-order per-member delivery; no out-of-order / stale-write guard
- **Component:** graph (`projector.ts`)
- **Absent:** The projector doc says events "should arrive in per-member outbox sequence order;
  the projector preserves that order." Every mutation is an idempotent upsert keyed by business
  identity — but idempotent upsert is **not** monotonic: a late-delivered OLDER event upserts stale
  values over newer ones. There is no per-node version/sequence high-water-mark rejecting older writes.
- **Failure scenario:** After a backbone rebalance or replay, a member's status-change events arrive
  out of order; the older "eligible" upsert lands after the newer "termed" one; the graph shows the
  member as eligible; no guard rejects the regression.
- **Severity:** MED-HIGH
- **Owner:** Iteration 2.

### NS-11 — Confirmed-but-unpublished outbox rows recover only opportunistically
- **Component:** outbox (`writer.ts` pump, `sweep.ts`)
- **Absent:** If `publisher.publish` throws after `claimForConfirm` flips a row to `confirmed`,
  the row is republished **only on the next pump for that same member** (`writer.ts:66`). The
  reconciliation sweep scans **only `stalePending`** (`sweep.ts:42`), never `confirmed`. A member
  with a stuck confirmed row and no further inbound activity has an event that never publishes and
  no sweep ever recovers it.
- **Failure scenario:** A member's single coverage-termination event confirms, the backbone is down
  at that instant, publish throws; the member has no further events for months; the termination never
  propagates to the graph or SDE; no timer, sweep, or alarm ever revisits it.
- **Severity:** MED
- **Owner:** Iteration 1/2.

### NS-12 — No distributed tracing / correlation-id propagation end-to-end
- **Component:** server/correlation, outbox → projector → SDE → agentRuntime → work queue
- **Absent:** `correlationId` is minted/propagated at the HTTP edge and stamped on the outbox
  envelope, but there is no span model and no evidence it is threaded through the async fan-out
  (projector, SDE intake, dispatcher, agent proposal, escalation). No trace ties an inbound feed
  record to the downstream touchpoint it caused.
- **Failure scenario:** A member complains they got a wrong outreach message. An operator cannot
  trace that touchpoint back through agent → SDE disposition → signal → source event → feed batch,
  because no correlation thread survives the lane hops.
- **Severity:** MED-HIGH
- **Owner:** NEW BACKLOG.

### NS-13 — Consent store is an in-memory Map with no history, no persistence, no expiry
- **Component:** consent (`providerAccessOptOut.ts`)
- **Absent:** The store is a `Map` (`createMockProviderAccessConsentStore`). `optOut`/`revokeOptOut`
  **overwrite the prior record** — despite the "always audited, never silent" claim there is **no
  consent version history**, no append-only trail of who changed consent when. No time-bounded /
  expiring consent. No Payer-to-Payer opt-*in* consent modeled (only Provider-Access opt-out).
  Production mode throws (unwired).
- **Failure scenario:** A member opts out, then a support agent erroneously revokes it; the opt-out
  record is overwritten; there is no history proving the member ever opted out; a provider reads the
  data; the compliance breach is unprovable and unattributable.
- **Severity:** HIGH
- **Owner:** Iteration 1 (built the mock). Real store = NEW BACKLOG.

### NS-14 — Break-glass override has no post-hoc review, notification, or reconciliation workflow
- **Component:** authz (`guard.ts`)
- **Absent:** Break-glass overrides the member's Provider-Access opt-out and sets `elevatedAudit:true`
  — but there is no downstream: no break-glass review queue, no member notification, no periodic
  break-glass reconciliation report, no expiry on the elevated grant. "Elevated audit" is a boolean,
  not a workflow.
- **Failure scenario:** A provider routinely checks "break-glass" to bypass opt-outs; every access is
  technically audited but nothing ever reviews the audit; systematic opt-out circumvention goes
  undetected.
- **Severity:** MED-HIGH
- **Owner:** NEW BACKLOG.

### NS-15 — No PII/PHI minimization at rest for stored outbox envelopes
- **Component:** outbox (`outbox_intent` stores "full C2 payload"), pipeline propagation
- **Absent:** The outbox README states the intent row commits the "Full C2 payload" and the table is
  retained as the event history. Segmentation labels ride the envelope, but the **Part 2 / restricted
  payload is persisted in the intent table** and retained indefinitely (see NS-03). There is no
  field-level minimization, tokenization, or at-rest encryption strategy named for this store.
- **Failure scenario:** The `outbox_intent` table is the largest concentration of raw PHI in the
  system, retained forever, with no minimization — a single table compromise exposes the full event
  history for every member.
- **Severity:** MED-HIGH
- **Owner:** Iteration 1/2.

### NS-16 — No schema evolution / versioning of stored C2 events
- **Component:** outbox (`envelope.ts`), graph replay, SDE intake, evidence
- **Absent:** C2 envelopes are validated against "the contracts.md C2 schema" at publish, but there
  is no `schemaVersion` on the stored envelope and no dual-read / migration path. The outbox history
  and evidence ledger are permanent; a contract change has no forward/backward-compat story for
  already-stored records that a replay must re-consume.
- **Failure scenario:** A field is added/renamed in the C2 contract; a rebuild-from-replay over
  months-old stored events feeds the new projector envelopes it can't parse; replay breaks or
  silently mis-maps; there is no version discriminator to branch on.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-17 — Identity survivorship (DP-7) is union-find rekey only; no field-level rules or conflict resolution
- **Component:** graph (`replay.ts` merge/unmerge), identity
- **Absent:** Merge is a union-find rekey (`mergedMemberId → survivingMemberId`, path-compressed) by
  replay. There are **no field-level survivorship rules** (which source wins for conflicting name/DOB/
  address), no conflict detection when merged members carry contradictory authoritative data, and no
  merge review/approval surface. The roadmap (I8A) names "internal-vs-external reconciliation/
  survivorship" as future — today it is rekey-only.
- **Failure scenario:** Two records with different authoritative DOBs are merged; the graph rekeys
  both under one member but has no rule for which DOB survives; the whole-person record now carries a
  silently-picked (or both) DOB with no provenance-based resolution and no reviewer sign-off.
- **Severity:** MED
- **Owner:** Iteration 2 (merge mechanics); survivorship = Iteration 8A / NEW BACKLOG.

### NS-18 — Unmerge / merge-retraction has no operational surface; append-only log can't retract
- **Component:** graph (`replay.ts`), outbox
- **Absent:** Unmerge is "the same event class in reverse" and correctness depends on *removing the
  merge event from (or adding the unmerge event to) the log*. But the outbox is append-only and
  there is **no tooling, route, or surface** to issue a merge, review a proposed merge, or retract an
  erroneous one. A wrong merge is a whole-person-corruption event with no human-driven path to undo it.
- **Failure scenario:** An operator discovers two members were wrongly merged; there is no admin
  action to emit the compensating `member.unmerged` event; the corruption persists until an engineer
  hand-crafts an event.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-19 — No backfill / reprocessing tooling beyond single-member replay
- **Component:** pipeline, SDE, graph
- **Absent:** Replay exists per member for graph rebuild. There is no bulk reprocess, no
  reprocess-since-version, and no re-intake after a taxonomy/policy/mapping change. When the SDE
  disposition policy or the signal taxonomy changes, already-consumed events are not re-evaluated;
  when a new domain mapping ships, historical events are not re-projected en masse.
- **Failure scenario:** A taxonomy fix corrects a mis-classified signal type. Only *future* events
  benefit; the entire back-catalog stays mis-dispositioned with no batch re-intake mechanism.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-20 — Terminology value-set registry has no persistence, no version history, no approval lifecycle
- **Component:** terminology/registry (`valueSetRegistry.ts`)
- **Absent:** The registry is an in-memory `Map`; `register()` **overwrites by id** with no version
  guard. Lifecycle states (`draft→proposed→approved→active→superseded→retired`) exist as *data
  fields* but there are **no transition guards, no approval gate, and no immutable change history**
  (who approved which version when). The roadmap's I8A governance console (dual-mode access, approval
  workflow, traceability, version-replay) is entirely absent — yet the stub is wired into the
  stage-4 semantic gate as if governed.
- **Failure scenario:** An engineer calls `register()` and silently swaps an active value-set version
  with no approval and no audit; every downstream semantic validation now binds to the unreviewed
  version; there is no record of the change or who made it.
- **Severity:** MED
- **Owner:** Iteration 4 (stub) → Iteration 8A pillar 4.

### NS-21 — External seams (PIX/PDQ, terminology server, production consent/evidence) are throw-stubs with zero contract tests
- **Component:** identity/external, terminology (production service), consent, evidence
- **Absent:** `pixPdqResolver`, `pixmPdqmResolver`, `productionTerminologyService`, the production
  consent store, and the production evidence factory all **throw NotConfigured**. Fail-loud is correct,
  but there is **no conformance/contract test** against any reference implementation for any of them.
  Their real behavior (HL7v2 framing, FHIR `$ihe-pix` params, `$validate-code` semantics, survivorship
  of external ids) is completely unproven.
- **Failure scenario:** The PIX adapter is wired to a real MPI in a later iteration and fails the first
  connectathon because message framing / assigning-authority OID handling was never tested against
  anything.
- **Severity:** MED
- **Owner:** Iteration 4 (stubs) → Iteration 8A.

### NS-22 — No admin surfaces or runbooks for any G-series subsystem
- **Component:** outbox DLQ, held-review, terminology registry, agent runtime, escalation parks
- **Absent:** The only operational route is `/api/work-queue` (the PA-reviewer queue). There is no
  admin route or console for: outbox failed/quarantine inspection, held-identity review, terminology
  version adoption, agent enable/disable, escalation-park inspection, or SDE disposition review. No
  per-subsystem runbook exists (docs has only the roadmap). Operators have no surface for five new
  subsystems.
- **Failure scenario:** An on-call engineer is paged for "outbox-intent-failed" (if the alarm were
  even wired) and has no console, no runbook, and no query path to triage it.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-23 — No alerting channels wired; SLA breaches and aging queues page nobody
- **Component:** outbox (`AlarmSink`), agentRuntime (escalation park), pipeline (quarantine)
- **Absent:** `AlarmSink` is an interface with no concrete channel (page/email/Slack/PagerDuty). There
  is no alert on escalation-park, no aging alert on held-review or quarantine, no SLA-breach alert. The
  "raise the alarm" in `failIntent` calls an optional no-op by default.
- **Failure scenario:** Escalations pile up in the park state, held identities age past any reasonable
  review SLA, quarantine grows — and no human is ever notified because no channel is connected.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-24 — Read-path access is unaudited; audit trail is decision-only
- **Component:** graph lenses, evidence `get`/`list`, authz
- **Absent:** Audit exists for SDE dispositions and agent decisions and the evidence ledger is
  append-only, but **reads are not audited**: who queried a whole-person lens, who read a member's
  evidence record, who ran a care-gap query. HIPAA accounting-of-disclosures needs read audit; there
  is no read-audit sink on the lens or evidence read paths.
- **Failure scenario:** A member requests an accounting of who accessed their record; the system can
  report writes/decisions but not reads; the disclosure accounting is incomplete.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-25 — Malformed / untrusted backbone messages are not validated at consumer intake
- **Component:** SDE intake (`signalIntake.ts`), graph projector
- **Absent:** Envelopes are validated at the **publish** boundary, but consumers (SDE intake, projector)
  trust the envelope shape — `signalFromEvent` reads `event.consentContext.part2Restricted`,
  `event.payload`, `event.eventType` with no schema re-validation. A malformed or truncated message
  from the backbone (or a schema-mismatched producer) is consumed as-is.
- **Failure scenario:** A message arrives with `consentContext` undefined (producer bug / partial
  write); `event.consentContext.part2Restricted` throws inside intake, poisoning the whole batch fold —
  or worse, a restricted event with a malformed context is treated as unrestricted and a Part 2 signal
  leaks into a non-cleared deployment.
- **Severity:** MED-HIGH (Part 2 leak path)
- **Owner:** Iteration 2.

### NS-26 — Partial-batch failure in stages 4–5 has no transaction / checkpoint / resumability
- **Component:** pipeline (`load.ts`, `pipeline.ts`, `projectAndPropagate`)
- **Absent:** Stage 4 commits intents and stage 5 propagates; if the process dies mid-batch, some
  intents are committed and some are not. The reconciliation gate asserts counts for the records it
  *processed*, but there is no batch-level transaction, no checkpoint/offset, and no resumable restart —
  a re-run reprocesses from the top relying on per-record idempotency keys, with no batch-completion marker.
- **Failure scenario:** A 10k-record 834 batch dies at record 6k; 6k intents committed; on retry the
  operator cannot tell where it stopped; the reconciliation report for the partial run "balances" on the
  6k it saw, masking that 4k never landed.
- **Severity:** MED
- **Owner:** Iteration 1.

### NS-27 — No payload-size limits or backpressure on any ingestion path
- **Component:** pipeline land/stage, outbox pump, SDE intake
- **Absent:** No max-payload guard, no batch-size cap, no backpressure/throttle on the outbox pump or
  SDE fold. An oversized FHIR bundle or a flood of events has no admission control; everything is
  processed in-memory (`intakeSignals` folds an entire event array; pump drains a whole member).
- **Failure scenario:** A malformed feed drops a single 2GB "bundle"; the land/stage path buffers it in
  memory and OOM-kills the worker, taking down all in-flight members' processing.
- **Severity:** MED
- **Owner:** NEW BACKLOG.

### NS-28 — Cross-source clock skew is unreconciled; ordering fallbacks trust source clocks
- **Component:** SDE intake (`sortByOrder`), outbox envelope `occurredAt`
- **Absent:** Per-member ordering relies on the outbox `sequence`, but `sortByOrder` falls back to
  `occurredAtMs` (source-supplied `occurredAt`) when sequence is absent, and signal `ttlHours` /
  disposition cadence math is wall-clock over source timestamps. No skew detection or normalization
  across feeds with different clocks.
- **Failure scenario:** Two feeds with a 10-minute clock skew emit events for one member without
  sequence (a stream consumer path); `sortByOrder` orders them by skewed `occurredAt`; the SDE folds
  them in the wrong causal order and suppresses the wrong signal.
- **Severity:** LOW-MED
- **Owner:** Iteration 2.

### NS-29 — Hot-partition member has no mitigation; per-member lock is a throughput ceiling
- **Component:** outbox (`memberLock.ts`), agentRuntime (per-member partition)
- **Absent:** Ordering is enforced by a per-member single-writer lock (promise-chain). A very
  high-volume member — or a post-merge "super-member" aggregating many source ids — serializes all its
  work behind one lock with no sharding, sub-partitioning, or fairness control. Real partition
  rebalancing (Kafka) is also unmodeled by the fakes.
- **Failure scenario:** A merged member accumulates thousands of events; its single lock serializes the
  drain; that member's downstream (graph, SDE, agents) falls hours behind while other members are fine,
  and nothing shards the hot key.
- **Severity:** LOW-MED
- **Owner:** Iteration 9 (real substrate) / NEW BACKLOG.

### NS-30 — No per-tenant / multi-tenant isolation of config, policy, consent, or manifests
- **Component:** config/dataMode, sde policy, consent, agents/manifest, terminology
- **Absent:** All config is global (`getDataMode`, single policy JSON, single consent store, single
  manifest set, single terminology seed). Zero `tenant`/`org` scoping in any of the twelve components.
  If more than one payer/tenant is ever served from one deployment, their policy, consent, and terminology
  bindings are not isolated.
- **Failure scenario:** A second payer is onboarded; there is no way to give them a distinct disposition
  policy or consent store without forking config globally; tenant A's policy governs tenant B's members.
- **Severity:** LOW-MED (depends on multi-tenant intent)
- **Owner:** NEW BACKLOG.

### NS-31 — Duplicate-delivery / exactly-once is proven only downstream-of-idempotence, never end-to-end
- **Component:** outbox → projector → SDE → agent effect
- **Absent:** Each hop claims idempotence (projector upsert, SDE `eventId`, agent proposal), but there
  is no end-to-end exactly-once proof and the terminal effect (outreach send, referral open) has no
  idempotency key (see NS-04). "Downstream is idempotent" is asserted per-component against fakes, never
  demonstrated across the full at-least-once chain under real retry.
- **Failure scenario:** A duplicate propagates the full chain; each component individually "dedupes"
  against its in-memory state but the chain has been restarted between hops, so the terminal side-effect
  fires twice.
- **Severity:** MED
- **Owner:** Iterations 2–3 / Iteration 10 (conformance).

---

## Coverage note (testing negative space)

- **Testcontainer / live specs authored but executed 0 times:** `outbox.testcontainers`,
  `graph.neo4j.testcontainers`, `graph.lens.testcontainers`, `agentRuntime.temporal.testcontainers`,
  `evidence/store/pgEvidenceLedger.integration`. Every property they assert (real UNIQUE rejection,
  writer-vs-sweep exactly-once, durable timers, crash-resume, DB immutability trigger, live dual-backend
  parity) is **unproven** (NS-05).
- **Throw-stub paths with no positive test:** production consent, production evidence factory,
  production terminology service, `registry.refresh`, all four external EMPI resolvers (NS-21).
- **Happy-path-only against fakes:** graph projector ordering (no out-of-order test, NS-10), SDE intake
  redelivery across calls (no cross-call dedupe test, NS-04), quarantine/held-record downstream (no
  consumer exists to test, NS-01).

---

**Total findings: 31.** Categories with the thinnest coverage: operator visibility (metrics, tracing,
alerting, admin surfaces — NS-02/12/22/23/24), the human review lanes that were *routed to but never
built* (NS-01/13/14/18/20), and data lifecycle vs. an immutability-first design (NS-03/15/16).
