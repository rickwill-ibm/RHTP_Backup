# Agentic Systems Designer Output: G2 + G4 (+ gap-derivation projector F1, O-8)

Scope: Signal Disposition Engine on the stream lane (DP-2), gap-derivation projector (trace finding F1, spine-assigned), minimal agent runtime on the journey lane (DP-3, ADR-002), three named first agents with manifests, O-8 stage-3 deepening (the existing /prior-auth machine driven end to end from thread context). Domain panel folded in as stress criteria throughout: journey lens, longitudinal communication lens, clinical workflow lens ("could my agent live in this runtime unchanged").

Framing rule honored (plan §1.2): every capability below is general. Signals, policies, journeys, escalation chains are typed data evaluated by generic engines; nothing keys on Maria's conditions, barriers, or journey shape. The trace matrix rows this output covers (8, 11 partial, 12, 14) are RECONSTRUCTED and REPRESENTATIVE; the design serves the class.

---

## 1. Matrix Row

D1-ready rows. All "current state" is verified evidence; all "target" is design within doctrine.

| Row | Current state | Code evidence | Target architecture | Dependencies |
|---|---|---|---|---|
| G2 SDE (disposition service) | Tier B presentational: 918-line page with hardcoded results ("5 approved, 3 suppressed, 1 delayed, single coordinated touchpoint"); no engine, no stream, no policy store | evidence.md §Tier B (`src/app/signal-disposition-engine/page.tsx`, 918 lines; page absent from staged src/lib copy, cited from evidence only) | Stream-lane disposition service: signal taxonomy as data, per-member signal fold, act/suppress/delay/bundle engine, disposition policy as versioned data packs, every decision explainable (policy ids) plus audited (ADR-005 ledger), memberId-partition ordering per C6; demo page becomes the seamed screen over real dispositions with mock mode retained | Backbone (ADR-002), C2/C6/C10, SDE MVR per C9.4 (1@T1, 3@T1 stream, 5-dispense@T1, 12@T1, 13@T1, 15@T1), gap-derivation projector (below), ADR-005 store (O-1) |
| G2 sub-row: gap-derivation projector (F1) | Absent. No component computes measures; demo gap content is authored | evidence.md §Tier B (WPC screens from hardcoded TS); trace-matrix F1 | Standalone projector consuming C10 record events, evaluating HEDIS GSD/EED-class measure logic held as data, emitting `care-gap.opened/closed`; rebuildable from replay; explicitly NOT certified HEDIS (certification out of scope per spine disposition on F1) | C10 event catalog, C9 domains 3/4/5/6 at declared tiers, backbone |
| G4 agent runtime (journey lane) | Absent. Agent coalition is demo scenario data; no runtime | evidence.md §Tier B ("agent coalition / orchestration: no runtime, demo scenario data only") | Minimal runtime on self-hosted Temporal (ADR-002): manifest registry (manifests as versioned data, conventions §10), workflow façade seam, least-privilege tool broker, HITL gate reusing the goldenThread work queue, escalation engine with DP-3 defaults as data | ADR-002 (Temporal, Postgres-persisted), ADR-005 (proposals persist as evidence), C1 (person-context reads), C2 (agent-emitted events via outbox) |
| G4 sub-row: outreach/engagement agent | Absent | evidence.md §Tier B | HITL journey workflow executing SDE-approved touchpoints: compose (deterministic templates first, optional LLM narration per guardrails), propose to inbox, execute on approval via channel-adapter seam, emit `touchpoint.executed` | SDE dispositions, consent domain 15@T1, communication channel adapter (spike S3) |
| G4 sub-row: referral coordination agent | Absent | evidence.md §Tier B | HITL journey per referral: track `referral.*` events, stall timers, nudge proposals, escalate up care team, close loop; park with audit when exhausted | Referrals 12@T1 (P2), care team 10 (hierarchy for escalation), C10 referral events |
| G4 sub-row: PA/documentation agent (O-8) | PA engine chain is Tier A and real (goldenThread orchestrator, paMachine, DTR, work queue); no journey-lane driver; machine advanced only by per-request calls | evidence.md §Tier A (goldenThread orchestrator + stages + medical necessity + DTR) | Journey workflow driving `paMachine` end to end from thread context (`ThreadResult`): human-gated submit, await payer `claim-response`, more-info documentation loop via existing DTR generator, denial-to-appeal packet proposal, human-gated gap closure; the machine's pure `transition()` remains the single authority | goldenThread public surface (reuse), pa.* events (C10), durable evidence store (O-1/ADR-005) |

---

## 2. Current State Evidence

Citations from evidence.md only; never re-derived.

- SDE: `src/app/signal-disposition-engine/page.tsx`, 918 lines, results hardcoded: "5 approved, 3 suppressed, 1 delayed, single coordinated touchpoint". This string set is the acceptance shape (DP-2), not an implementation to extend. The page file is one of the 66 frozen baseline files; it is retired by extraction, never grown.
- Agent coalition/orchestration: no runtime, demo scenario data only.
- Tier A reuse foundation (verified real, tested): goldenThread orchestrator + stages + medical necessity + DTR; authz guard; consent opt-out seam (`src/lib/consent/providerAccessOptOut.ts`, the house seam exemplar); identity match engine.
- Work queue: `src/lib/goldenThread/workQueue.ts` (113 lines) routes to five reviewer queues with CMS-0057-F SLA clocks (72h expedited / 7d standard via `slaHours` in `src/lib/workflow/paMachine.ts`); `workQueueView.ts` (56 lines) derives the inbox from persisted EvidenceRecords, no separate work-item table. These files are compliant (under cap) and are the named reuse foundation.
- PA machine: `src/lib/workflow/paMachine.ts` (96 lines), pure deterministic table-driven lifecycle; `submit` and `close-gap` are human-gated (`requiresHumanApproval`); Approved/Denied only from a payer `claim-response`. This invariant is inherited unchanged by the PA agent.
- Substrate: absent by design; in-process Map stores; `defaultEvidenceStore()` in-memory; no queue/worker deps. Everything in §3 below is TARGET state on the greenfield substrate.

---

## 3. Target Architecture

All target state. Designed within doctrine §4, §4A stage 5, ADR-001/002/005/006, C2/C6/C10, DP-2/DP-3. Deviations: none. One spine escalation is recorded in §15 (R1, care-team hierarchy data for escalation chains).

### 3.1 G2: Disposition service (stream lane)

#### 3.1.1 Signal taxonomy (data, not code)

A signal is a typed event about a member from any projector (DP-2). The taxonomy lives at `src/lib/sde/data/signal-taxonomy.json`, zod-parsed at load, additively versioned. Each entry declares:

```
signalType            e.g. "care-gap.opened", "encounter.discharged", "referral.stalled"
sourceEventTypes      C10 event types that raise it (a signal may derive from several)
defaultPriority       urgent | high | routine (policy may reprioritize per member context)
actionability         member-outreach | care-team-task | internal-only
foldBehavior          immediate | windowed (urgent signals fold now; routine accumulate)
ttl                   how long an undispositioned signal stays actionable (expiry emits an
                      audited "expired" disposition, never a silent drop)
consentScope          the consent purpose a resulting touchpoint requires (checked at
                      disposition time on top of transformation-time labels)
dedupeKeyTemplate     e.g. "care-gap:{memberId}:{measure}:{year}" for idempotent intake
sourceGated           optional flag naming a feed dependency (see missed-appointment note)
```

Initial taxonomy (general classes, representative instances): care-gap opened/closed; encounter admit/discharge/ED-arrival (transition-of-care class); SDOH screening completed/barrier identified; referral initiated/stalled/completed; PA submitted/pended/approved/denied; medication dispense-lapse (adherence class, derived from dispense T1 cadence); consent granted/revoked (internal-only: revocation must retract pending touchpoints); assessment submitted. A missed-appointment signal is declared in the taxonomy but marked `sourceGated: scheduling-feed` because no C9 domain currently yields appointment data at T1; the taxonomy row exists so the capability is general, the gate keeps it honest (Tier-B posture: refuses loudly until a source exists).

Part 2 rule: signals derived from `bh.event.recorded` instances carrying restricted labels are dropped at intake by envelope inspection alone (C10.1) unless the SDE deployment is Part 2-cleared; when carried, their dispositions require the consent check to pass at read AND act time. The SDE never parses restricted payloads to decide.

#### 3.1.2 Decision model: act / suppress / delay / bundle

The engine folds the member's pending signal set into one disposition batch:

1. **Intake.** The signal-intake consumer reads the signals topic (memberId partition, C6). Each `signal.raised` upserts into the pending-signal projection (Postgres, memberId-keyed) with dedupe on the taxonomy's dedupe key. Idempotent on eventId; per-member ordering guaranteed by the partition.
2. **Fold trigger.** Two triggers, both per member: (a) arrival of a signal whose taxonomy says `immediate` (ED discharge class), which folds the member's whole pending set now; (b) the member's coordination-window timer (policy-defined cadence, default daily, ASSUMPTION pending state tuning), which folds accumulated `windowed` signals. Fatigue rules are cross-signal, which is exactly why the SDE consumes the stream lane and folds sets; a point-call design cannot see the set (DP-2).
3. **Decision.** The pure disposition engine (`dispositionEngine.ts`, injected clock, no I/O) evaluates the batch against the active policy pack and returns, per signal, one of:
   - **act**: becomes (part of) a touchpoint now;
   - **suppress(reasonCode, policyId)**: e.g. superseded by gap closure, duplicate, consent scope fails, frequency cap reached with no delay slot available inside TTL;
   - **delay(untilWindow, policyId)**: parked to a named coordination window;
   - **bundle(touchpointId, policyId)**: folded into a composed touchpoint with other acts.
4. **Touchpoint composition.** Acts and bundles for one member in one fold compose into a single coordinated touchpoint (channel, timing, content intents ordered by priority). The demo's "5 approved, 3 suppressed, 1 delayed, one coordinated touchpoint" screen is the acceptance shape: the seamed screen renders exactly this summary from real engine output.
5. **Publish.** `disposition.decided` (and the touchpoint record) are written with the SDE's own state change in one transaction via the outbox pattern (ADR-006: internal platform writers use the same outbox; there is exactly one way events are born). Touchpoints with `actionability: member-outreach` are handed to the journey lane (outreach agent, §3.3.1); `care-team-task` touchpoints become inbox work items directly.

Expiry: a signal reaching TTL undispositioned gets an explicit `suppress(reason: expired-ttl)` disposition, audited. Nothing silently expires (DP-3 principle applied to signals too).

#### 3.1.3 Disposition policy as data

Policy packs live at `src/lib/sde/data/disposition-policy.default.json`, loaded through a policy-store seam (`SEAM: sde-policy-store`) so a state deployment tunes policy without a deploy (DP-2): the production implementation reads versioned packs from Postgres with an admin publish flow; the default pack ships as data and remains the mock mode. Pack contents, each rule carrying `id` plus `version`:

- contact-frequency caps (per channel per rolling window, per priority class);
- channel preference resolution (member preference from record; fallback order);
- quiet hours and blackout windows;
- consent scoping rules (purpose per taxonomy consentScope; opt-out short-circuit);
- priority scoring weights (taxonomy default adjusted by member context, e.g. recent ED);
- suppression rules (supersede-on-closure, duplicate-collapse);
- bundling windows (cadence, max intents per touchpoint);
- workforce capacity throttles (daily touchpoint budget per team; ASSUMPTION: staffing counts are configuration until a real workforce source exists, spike S4).

The pack is zod-parsed at load (schema.ts); an invalid pack refuses loudly (BackboneNotConfiguredError pattern) and the engine keeps the last valid version. Policy evaluation is deterministic: same signal set, same pack, same injected clock, same decisions, forever.

#### 3.1.4 Explainability and audit

Every disposition carries the policy ids and versions that fired (`policyId: "supersede-on-closure/1.2"` as in golden-path hop 7). Three surfaces:

- the `disposition.decided` event payload (per-signal decision, reasonCode, policyId);
- an ADR-005 ledger entry per fold (actor: `sde-engine@<packVersion>`, correlation id propagated from the triggering event, PHI-safe payload: references plus codes only);
- the BFF explanation read: `GET /api/sde/dispositions?memberId=&since=` returns decisions with fired policies; the seamed SDE screen renders it; the same view serves care-team "why was this suppressed" questions (clinical workflow lens).

### 3.2 Gap-derivation projector (F1, spine-assigned to this scope)

Role separation holds: the SDE never computes measures; the graph never acts. The gap-derivation projector is a separate domain (`src/lib/gapDerivation/`), a peer projector on the backbone:

- Consumes C10 record events relevant to measure state: condition, observation, medication dispense, encounter, procedure, immunization events.
- Maintains a per-member measure-state projection (Postgres, memberId-keyed, rebuildable from replay; C10.2 registration rule: it subscribes to the backbone, never reads the graph's store).
- Measure definitions are data (`data/measures/*.json`): denominator criteria, numerator criteria, exclusion criteria, measurement-year windows, expressed against normalized codes (value-set references). HEDIS GSD/EED-class logic ships first because the trace matrix exercises it (steps 5 and 15); the format is general to the class.
- Emits `care-gap.opened` / `care-gap.closed` with `causationId` pointing at the triggering record event and `evidenceRefs` naming the record resources (golden-path 5a shape).
- Honesty boundary (binding note per spine F1 disposition): this is care-gap derivation for coordination, explicitly NOT certified HEDIS measure production. Output events carry `source.system: "ace-measures"` and the docs label the distinction; QARR-class reporting stays unowned (F3, parked).
- Tier awareness: measure evaluation reads the tier labels on projected facts; a gap asserted only from T3 claims shadows carries `evidenceTier: "T3"` in the payload so downstream consumers (SDE priority scoring, care plan) can weigh it honestly. T3 never masquerades as T1 (C9.1 rule applied at the derivation layer).

### 3.3 G4: Minimal agent runtime (journey lane)

Current state: absent (evidence §Tier B). Target: the smallest runtime that makes DP-3's three agents live, on self-hosted Temporal per ADR-002, with every piece of agent authority declared in data.

#### 3.3.1 Runtime components

1. **Manifest registry** (`src/lib/agents/runtime/manifestRegistry.ts` + `manifests/*.json`). Every agent is declared in a versioned manifest (conventions §10.2); the runtime loads manifests at startup, zod-parsed. Nothing about an agent's authority is implicit in code. Autonomy tier is per-agent-per-deployment configuration: the manifest states the shipped tier (HITL for all three), a deployment overlay in `deploy.config.yaml` may hold it there or (later, as an operational decision recorded in the manifest history) promote it. Promotion is never a code change (DP-3).
2. **Workflow façade** (`runtime/journeyFacade.ts`, `SEAM: journey-engine`). Agent journeys are Temporal workflows defined against a thin façade (start, signal, query, timer semantics). Temporal self-hosted on the platform Postgres is the only supported core posture (ADR-002, doctrine 5); the façade exists so the engine remains an adapter boundary, not so alternatives are built now.
3. **Tool broker** (`runtime/toolBroker.ts`). Tools are typed server-side functions wrapping existing engines behind their public surfaces: person-context read (C1), goldenThread `runFinancialClearance` + `paMachine.transition`, DTR generator, evidence append (ADR-005), work-queue submit, communication channel adapter, referral status read. The broker enforces the manifest's tool allowlist at invocation time and emits a PHI-safe audit event per call (least privilege, conventions §10.3; widening an allowlist is a reviewed manifest change).
4. **HITL gate: the goldenThread work queue, reused.** Building a second inbox is a defect (DP-3). Agent proposals persist as evidence records in the ADR-005 store (entry type `agent-proposal`, attributed to the agent identity plus manifest version); a thin router (`inbox/proposalRouter.ts`) derives WorkItem-shaped inbox entries from them exactly as `workItemFromEvidence` derives PA items, reusing `routeToQueue`'s SLA mechanics (`slaHours`, `isSlaBreached`, `dueBy`). The reviewer UI renders one merged inbox: PA queues plus two additive queue names, `agent-proposal-review` and `escalated`. The `QueueName` union in `workQueue.ts` (compliant 113-line file, not baseline-frozen) is extended additively; grouping and SLA display code is unchanged. Human decisions (approve / modify / reject, attributed, reason captured) post to `POST /api/agents/proposals/{id}/decision`, which appends the decision to the evidence record and signals the waiting Temporal workflow. The evidence-viewer pattern is reused for "show me why the agent proposes this": the proposal's evidence record carries the input refs, the disposition or event that triggered it, the policy ids involved.
5. **Escalation engine** (DP-3 defaults, as data at `data/escalation-policy.json`). For every unactioned HITL item: SLA per priority tier (defaults, ASSUMPTION pending owner tuning: urgent 4h, high 24h, routine 72h, all within the CMS clock where a PA item is involved, which keeps its own 72h/7d SLA as the binding outer bound); on breach, escalate up the care-team hierarchy (attributed care team from the record, domain 10; see risk R1 on hierarchy availability); after the chain is exhausted, park with a full audit trail (parked items remain queryable and re-activatable; a parked state is a disposition, not a deletion). Never silently expire. Implemented as Temporal timers on the proposal workflow; every hop appends to the evidence record.

#### 3.3.2 The three first agents (named, HITL, manifested)

**Agent 1: Outreach/engagement agent** (`manifests/outreach-agent.json`).

- Trigger: SDE touchpoint with `actionability: member-outreach` (disposition.decided acts/bundles). One journey workflow per touchpoint.
- Flow: compose (deterministic template engine first: content intents from the touchpoint map to versioned templates in `prompts/outreach/*.md`; optional LLM narration sits on top behind a feature flag, server-side, PHI-safe, schema-parsed output, degrading to the deterministic template by design) -> propose (channel, timing, rendered content) to the inbox -> on approval, execute via the channel-adapter seam (`SEAM: comms-channel`; SMS/email/mail vendors are adapters, spike S3) -> emit `touchpoint.executed` through the outbox -> await member-response events within a follow-up window -> report outcome as a signal (response/no-response) back to the SDE, closing the longitudinal loop.
- Longitudinal communication lens: the agent NEVER originates contact; only SDE-approved touchpoints reach it, so frequency caps and bundling hold across all agents by construction. A consent revocation event retracts pending proposals (workflow signal, audited retraction).
- Injection-awareness (conventions §10.4): record-derived content (member name tokens, gap descriptions) enters prompts as quoted data in a structurally separate block, never as instructions; evals include injection fixtures.

**Agent 2: Referral coordination agent** (`manifests/referral-agent.json`).

- Trigger: `referral.initiated` (platform-initiated or referral-platform webhook). One journey per referral.
- Flow: track `referral.accepted/completed` events; a stall timer (policy data: per service-class expected-response windows) fires `referral.stalled` awareness -> propose a nudge (contact receiving provider, or re-route via the C1 provider-context read joining adequacy candidates, O-6 surface) HITL -> on repeated stall, escalate up the care team per the escalation engine -> on `referral.completed`, close the loop and report closure as a signal -> if the chain exhausts, park with audit.
- Boundary honored (trace F2): this agent proposes, tracks, escalates; it does not execute external booking transactions. Where a closed-loop platform (Unite Us-class) performs the arrangement, the agent consumes its status events; direct booking remains T0 with no owner, and this design does not silently absorb it.

**Agent 3: PA/documentation agent** (`manifests/pa-documentation-agent.json`). This is O-8: the existing /prior-auth machine driven end to end from thread context, the journey lane's first real workload.

- Trigger: a `ready-to-submit` work item (a `ThreadResult` from `runFinancialClearance` persisted as an evidence record) is approved for journey management, or a `pa.submitted` event for an externally initiated PA.
- The workflow wraps `paMachine` without replacing it: the pure `transition()` remains the single authority; the workflow holds `PaState` + `PaContext` as its durable state and only ever advances via legal transitions. The two human gates in the machine (`submit`, `close-gap` require `approvedBy`) map one-to-one onto inbox approvals: the workflow proposes, the human decision supplies `approvedBy`, the transition fires. The agent never sets Approved/Denied; those come only from payer `claim-response` events (pa.approved/pa.denied/pa.pended on the backbone), preserving the machine's own invariant verbatim.
- End-to-end drive from thread context: Draft -> CRD (from the thread's `netRequiresPA`: `crd-none` routes to NoAuthRequired and a human-gated close-gap; `crd-required` proceeds) -> launch-dtr (reuse `selectDtrGenerator`/`generateQuestionnaireFromPolicy` to assemble the questionnaire from the policy corpus) -> prepopulate from the evidence record and person-context (C1) -> evidence-complete -> propose submission (HITL, inbox) -> Submitted -> acknowledged -> Pending -> await claim-response:
  - approved: propose close-gap (HITL) -> GapClosed; emit closure signal;
  - more-info: assemble the requested documentation from thread context via DTR, propose resubmission (HITL) -> resubmit;
  - denied: prepare an appeal packet proposal (evidence record + denial reasons + policy citations from the corpus), route to the existing `denied-appeal` queue -> appeal on approval.
- SLA: the CMS clock from `slaHours(priority)` bounds the journey (72h expedited / 7d standard); escalation-engine timers fire inside it so a proposal never sits until the regulatory clock breaches.
- Every step appends to the evidence record (ADR-005), and every state change emits `pa.*` events via the outbox, feeding the graph (PA lifecycle nodes) and the golden thread.

#### 3.3.3 Stress-criteria pass (domain panel folded in)

- **Journey lens.** All three journeys are multi-day with human waits and timers (72h scheduling-class windows, stall windows, SLA clocks); Temporal persistence means restarts, deploys, and worker loss lose nothing. Verified by workflow replay tests (§11).
- **Longitudinal communication lens.** One member, many signals, one coordinated voice: the SDE is the sole gate to member contact; agents execute dispositions, never originate; caps, bundling, quiet hours are policy data evaluated across the member's whole pending set. Suppressions and delays are as auditable as acts.
- **Clinical workflow lens ("could my agent live in this runtime unchanged").** A new agent needs: a manifest, a workflow definition against the façade, tools from the broker, proposals into the same inbox, escalation from the same policy data. No new inbox, no new SLA mechanics, no new audit path. The three shipped agents prove the runtime by using zero private infrastructure; that is the acceptance test for "minimal runtime" (a fourth agent, e.g. a documentation-prep agent for referrals, would touch only `manifests/` plus one workflow file).

---

## 4. Build Approach and Reuse Map

Reused (named Tier-A code, verbatim or behind its existing surface):

- `paMachine.transition`, `slaHours`, `requiresHumanApproval` (`src/lib/workflow/paMachine.ts`): the PA agent's state authority, unchanged.
- goldenThread public surface (`src/lib/goldenThread/index.ts`): `runFinancialClearance`, `routeToQueue`, `isSlaBreached`, `workItemFromEvidence`, `listWorkItems`, `groupByQueue`, `selectDtrGenerator`, `generateQuestionnaireFromPolicy`.
- Evidence module (`src/lib/evidence`): `EvidenceStore` interface + `appendEntry`; proposals and dispositions ride the ADR-005 swap (O-1) rather than a new store.
- Consent seam pattern (`providerAccessOptOut.ts`) as the C3 template for the three new seams (sde-policy-store, journey-engine, comms-channel); the authz guard on every new BFF route.
- The demo SDE screen as the seamed acceptance surface (mock mode retained per C5 dual-mode).

New, in build order (dependencies before dependents):

1. `src/lib/sde/` engine + taxonomy + policy pack, runnable in mock mode against fixture signal sets (demo screen seam lands here; C5 dual-mode green).
2. `src/lib/gapDerivation/` projector (needs backbone + record events; measure data first, consumer second).
3. Signal intake + pending-signal projection on the backbone (needs ADR-002 substrate).
4. `src/lib/agents/` runtime foundation: manifest registry, façade, tool broker, inbox router, escalation engine.
5. PA/documentation agent (O-8) first among agents: it exercises the runtime against the strongest existing Tier-A chain with zero external-channel dependency.
6. Outreach agent (needs channel-adapter spike S3 resolved; template path ships before any LLM narration).
7. Referral coordination agent (needs referral events at 12@T1, a P2 capability).

Order rationale: 1 proves the decision model offline (Tier-A posture, no keys); 5 proves the journey lane on real engines before any agent needs external vendors; 6 and 7 then ride proven rails.

---

## 5. File-Level Touchpoints

All new files under the 400-line cap; no additions to baseline files; data externalized. The 918-line SDE page is baseline-frozen: its replacement extracts rendering into compliant components consuming the BFF; the page file only shrinks.

```
src/lib/sde/
  types.ts                 signal, disposition, touchpoint, policy shapes
  schema.ts                zod: taxonomy, policy pack, event payloads (C2 payload parse)
  index.ts                 public surface only
  README.md                <=150 lines, conventions §13.2 template
  intake/signalConsumer.ts       backbone consumer, dedupe, projection upsert
  projection/pendingSignalStore.ts   SEAM: sde-signal-store (Postgres real, Map mock)
  policy/policyStore.ts          SEAM: sde-policy-store (versioned packs; default = data file)
  policy/dispositionEngine.ts    pure fold: (signals, pack, memberContext, clock) -> decisions
  policy/explain.ts              decision -> fired-policy explanation view-model
  touchpoint/composer.ts         acts/bundles -> one coordinated touchpoint
  publish/dispositionOutbox.ts   transactional write + outbox rows (ADR-006 pattern)
  data/signal-taxonomy.json
  data/disposition-policy.default.json

src/lib/gapDerivation/
  types.ts  schema.ts  index.ts  README.md
  measureEvaluator.ts            pure: (memberState, measureDef, clock) -> gap transitions
  memberStateStore.ts            SEAM: gap-state-store; rebuildable from replay
  consumer.ts                    backbone consumer -> evaluator -> care-gap.* via outbox
  data/measures/gsd.json  data/measures/eed.json   (format general; instances representative)

src/lib/agents/
  types.ts                 manifest, proposal, journey, escalation shapes
  schema.ts                zod: manifest schema, proposal payloads, decision inputs
  index.ts  README.md
  runtime/manifestRegistry.ts
  runtime/journeyFacade.ts       SEAM: journey-engine (Temporal adapter behind it)
  runtime/toolBroker.ts          allowlist enforcement + per-call audit
  inbox/proposalRouter.ts        evidence 'agent-proposal' -> WorkItem shape; reuses routeToQueue SLA math
  escalation/escalationEngine.ts policy-data evaluation + timer scheduling
  workflows/paJourney.ts         O-8: wraps paMachine transitions
  workflows/outreachJourney.ts
  workflows/referralJourney.ts
  manifests/outreach-agent.json  referral-agent.json  pa-documentation-agent.json
  prompts/outreach/*.md          versioned templates (+ optional narration prompts)
  data/escalation-policy.json

src/lib/goldenThread/workQueue.ts   additive edit only: two queue-name variants
                                    ('agent-proposal-review', 'escalated'); file stays <150 lines

app routes (BFF, all behind authz guard):
  /api/sde/dispositions        GET: decisions + explanations (memberId-scoped, purpose-checked)
  /api/sde/policy              GET active pack version; POST publish (admin, attributed)
  /api/agents/inbox            GET merged work items (PA + agent queues)
  /api/agents/proposals/[id]/decision   POST approve/modify/reject (attributed, signals workflow)
  /api/agents/journeys/[id]    GET journey status (query via façade)

tests/sde/  tests/gapDerivation/  tests/agents/   (incl. evals/ for prompts)
```

Estimated largest file: `dispositionEngine.ts` at ~250 lines (fold + rule dispatch split into per-rule modules if it approaches cap).

---

## 6. Golden-Path Participation

Owned hops: 6, 7, plus agent execution of the resulting touchpoint (per the spine participation map). Payload-level statement:

- **Hop 6 in (signal raised).** Input: `care-gap.closed` C2 event from the gap-derivation projector (this scope also OWNS the 5a derivation step per F1: it consumes `observation.recorded` eventId `5e2d…34ab`, evaluates GSD-class logic, emits the gap event with `causationId` set and `evidenceRefs: ["Observation/obs-a1c-20260402"]`). Signal intake maps it through the taxonomy (`signalType: care-gap.closed`, foldBehavior windowed, actionability internal-then-fold) and upserts the pending projection under `partitionKey mem-7f42a9`, dedupe key `care-gap:mem-7f42a9:GSD:2026`.
- **Hop 7 out (disposition decided).** The fold sees three pending signals (this closure, the pending A1c outreach nudge, a screening follow-up). Engine output exactly as golden-path hop 7: outreach-a1c-overdue -> `suppress` (`reason: superseded:care-gap.closed`, `policyId: supersede-on-closure/1.2`); screening-followup -> `bundle` (`touchpointId: tp-20260410-mem-7f42a9`, `policyId: bundling-window/2.0`). `disposition.decided` publishes on the member partition with `correlationId corr-a1c-journey-0042`; the ledger entry names both fired policies (hop 9 chain: `disposition.decided (2 policies named)`).
- **Touchpoint execution (post-hop-7).** The bundled touchpoint starts an outreach journey: proposal to the inbox, care-team approval, channel-adapter send, `touchpoint.executed` emitted via outbox, outcome signal folded back at the next window. Had the value been 9.4, `care-gap.opened` would instead raise an act-class outreach and, where the plan requires it, hop 8's clinician review would land in the same inbox (work-queue reuse rule, stated in golden-path hop 8).
- Not owned, consumed from: hops 0..5 (pipeline pair) for record events; hop 8 (care plan) consumes the same gap events independently; hop 9 ledger entries are written at every owned step.

O-8 golden-path note: the PA journey is the same pattern on the PA slice of the record: `pa.*` events in, human-gated transitions out, evidence chain throughout; step 12 of the trace matrix runs on it.

---

## 7. Contracts Touched

| Contract | Touchpoint | Grep anchor |
|---|---|---|
| C2 | Every emitted event (signal.raised, disposition.decided, touchpoint.executed, care-gap.*) rides the envelope; payloads zod-parsed at every consumer boundary; `class: "stream"` on all SDE traffic | `// CONTRACT: C2` in publish/consumer modules |
| C6 | Consumer groups: one each for sde-intake, gap-derivation; memberId partition relied on for fold ordering; DLQ per topic with replay; lag as SLO metric | `// CONTRACT: C6` in consumers |
| C10 | New event types registered in the catalog (already present: signal.raised, disposition.decided, touchpoint.executed, care-gap.*); both projections rebuild from replay; registration rule honored (no reading other projectors' stores); additive evolution with eventVersion | `// CONTRACT: C10` |
| C1 | Agents and the SDE read member context only via person-context (purpose-scoped, consent-enforced); the O-6 provider-context read serves referral re-routing | `// CONTRACT: C1` in toolBroker |
| C3 | Three new seams built to the convention (interface first, identified implementations, mock as a mode, attributed mutations, typed errors, contract-tested mock AND real) | `// SEAM: sde-policy-store`, `// SEAM: journey-engine`, `// SEAM: comms-channel`, `// SEAM: sde-signal-store`, `// SEAM: gap-state-store` |
| C5 | SDE screen and inbox surfaces registered in `tools/demo-green/seams.json`; dual-mode assertions added | n/a (registry entry) |
| C9 | SDE MVR (C9.4) consumed as the honesty bound: disposition features degrade explicitly where a domain is below tier (e.g. adherence signals inert until 5-dispense@T1 in P1) | table in README |
| ADR-005 | Proposals, decisions, dispositions, escalation hops as ledger entries; the evidence store swap (O-1) is a dependency, not a re-implementation | `// CONTRACT: ADR-005` (ledger writes) |

---

## 8. Scale Posture

- **Throughput.** Signals topic: 6 partitions pilot / 48 state (load model §3). Stream-class peak <300 events/min at state scale gives two orders of magnitude margin; consumer counts exist for partition parallelism during batch-class windows, when gap derivation is permitted to lag (batch-class exemption, C6 traffic classes) with the 1h post-window catch-up alarm.
- **Budget compliance.** Signal -> disposition <=5s p95 (DP-5, CONFIRMED by the load model: one queue hop plus a policy read on an in-memory pack plus one keyed projection query). ADT receipt -> signal <=60s is owned upstream through hop 5; this scope's share (event -> signal.raised) is one consumer hop, sub-second. No budget dropped; none re-derived (spine-only right).
- **Partition key.** memberId everywhere (C6); the fold's correctness depends on per-member ordering and is documented as such; cross-member ordering is never assumed.
- **Idempotency.** Intake dedupes on eventId plus taxonomy dedupe key; disposition publish carries idempotencyKey `fold:{memberId}:{foldWindowId}`; agent-side mutations (submit, send) carry idempotency keys through the tool broker so Temporal retries are safe (conventions §7.2).
- **Backpressure.** Consumer lag is the SLO metric; the fold is per-member so lag never corrupts, only delays; policy TTLs plus the expired-ttl disposition make delay visible instead of silent; DLQ plus replay runbook per topic (D7 build-gated).
- **Journey lane.** Open workflows track journeys, not events: ASSUMPTION 2% active (load model §4) gives 1K pilot / 140K state, inside a small self-hosted Temporal cluster; two workers pilot, four state. Workflows hold no cross-member state, so the linear-scale argument (partitions x pods) holds.

---

## 9. Portability Posture

Protocol dependencies, a subset of C7's five: Kafka API (backbone), Postgres wire (projections, policy packs, Temporal persistence), OIDC (inbox auth via existing authz), container runtime (workers). Object storage: not required by this scope. Temporal is a self-hosted platform component sanctioned by ADR-002 (doctrine 5: Temporal-class, never Step Functions / Durable Functions), deployed via the IaC platform layer (ADR-004), persisted on the same Postgres; core code touches it only through the journey-engine seam. Channel vendors (SMS/email) sit entirely behind the comms-channel adapter in the IaC-configured edge; no vendor SDK types cross into core (a vendor type in `src/lib` is a defect). No sixth protocol is introduced.

---

## 10. Convention Compliance

- **File split stated up front** (§5): every file under cap; the frozen SDE page and any other baseline file receive zero additions; replacement by extraction only (ratchet §3).
- **BFF surface.** All five routes in §5; browser never calls engines, the backbone, or Temporal; SDE screen and inbox consume `/api/*` only. `// INVARIANT: BFF-only` on each route.
- **AI guardrails (all six).** Server-side only (narration in workflow activities, never client); deterministic-first (template path is the product, narration is flagged garnish that degrades to it by design); human-gated (HITL is the shipped autonomy tier for all three agents; the dial is manifest + deployment config, never a branch); PHI-safe (prompts carry references, codes, first-name token only per template policy; asserted in eval fixtures plus route tests); labelled decision-support (inbox proposals render an agent-authored label with manifest version); feature-flagged with graceful degradation (narration flag off = template path; backbone absent = BackboneNotConfiguredError, loud).
- **Prompts as code** (§10.1): all templates and narration prompts in `prompts/*.md`, versioned, each with eval fixtures including injection cases; a prompt change without a green eval run is not done.
- **Agent manifests** (§10.2/10.5): three manifests as versioned data; tool allowlists minimal (outreach agent cannot touch paMachine; PA agent cannot send member communications); widening is a reviewed manifest change.
- **Determinism** (§7): dispositionEngine, measureEvaluator, escalation evaluation are pure with injected clock; workflows obtain time via Temporal's deterministic APIs through the façade; all external effects in activities with idempotency keys.
- **Typed errors and results** (§6): suppress/delay/park are values (discriminated unions in types.ts); infra failures are coded errors; no silent catch.
- **Observability** (§8): structured logging via the log interface; correlation id propagated from triggering event through fold, proposal, decision, execution (one member journey traceable across lanes); engine counters (folds, suppressions by reason, escalations by hop) exposed for metric projections, never computed inline by dashboards.
- **Traceability rows** (one per capability, added to `docs/traceability.md`): sde-disposition-engine, sde-policy-store, signal-intake, gap-derivation, agent-runtime-foundation, agent-inbox-reuse, escalation-engine, outreach-agent, referral-agent, pa-documentation-agent (O-8). Backbone-gated rows marked; Tier-A offline rows (disposition engine in mock mode, paJourney against in-memory stores) always runnable.
- **DoD gates as acceptance criteria** on every epic: tsc 0, vitest green incl. property + contract + eval suites, lint clean, size gate 0, README + anchors current, `npm run check:all` exit 0.

---

## 11. Acceptance Tests

Named; unit / property / contract / dual-mode / eval per the template.

Unit:
- `sde/dispositionEngine.fold.test.ts`: golden-path batch reproduces suppress + bundle with exact policy ids; act/delay paths; TTL expiry emits audited suppression.
- `sde/taxonomy.schema.test.ts`: invalid taxonomy or policy pack refuses loudly, last valid retained.
- `gapDerivation/measureEvaluator.test.ts`: GSD open at 9.4, close at 7.2, exclusion handling, measurement-year windows; T3-only evidence carries evidenceTier T3.
- `agents/paJourney.transitions.test.ts`: every journey step advances only via legal `paMachine.transition`; submit and close-gap blocked without approvedBy; denied -> appeal packet; more-info -> DTR loop.
- `agents/escalationEngine.test.ts`: SLA tiers, chain walk, park-with-audit terminal, never-silent-expiry.

Property (fast-check):
- `sde/dispositionEngine.property.test.ts`: no act/bundle ever exceeds frequency caps; every suppress carries reason + policyId; no touchpoint violates consent scope or quiet hours; fold is deterministic (same set, pack, clock => same decisions); per-member decision count equals pending-signal count (nothing dropped).
- `agents/toolBroker.property.test.ts`: no invocation outside the manifest allowlist ever executes; autonomy tier is never exceeded (no auto-execute at HITL).

Contract (per seam, mock AND real):
- `sde/policyStore.contract.test.ts`, `sde/pendingSignalStore.contract.test.ts`, `gapDerivation/stateStore.contract.test.ts`, `agents/journeyFacade.contract.test.ts`, `agents/commsChannel.contract.test.ts`; plus rebuild-from-replay proofs: `sde/projection.rebuild.test.ts` and `gapDerivation/rebuild.test.ts` (replay from offset zero reproduces state; merge/unmerge rekey per DP-7).

BFF route tests (per repo pattern): 401/403/400/422/200 plus PHI-safe body assertions for all five routes; consent opt-out short-circuit on member-scoped reads.

Dual-mode demo-green additions (C5): SDE screen renders with mock toggle ON (authored dataset) and OFF (engine results, acceptance shape "N approved, M suppressed, K delayed, one coordinated touchpoint" regions present); inbox renders merged queues in both modes.

Evals (CI like any test): `tests/agents/evals/outreach/*`: representative touchpoints -> parsed output assertions; injection fixtures (record content containing instruction-like text must not alter behavior); PHI-leak assertions on rendered content.

Journey durability: `agents/journeyReplay.test.ts`: Temporal workflow replay determinism for all three workflows; timer survival across simulated worker restart.

---

## 12. Docs-Done Entries

Register rows (C8 schema; owner: Agentic Systems Designer role unless noted):

| audience | document | stateLabel | class | doneGate |
|---|---|---|---|---|
| engineering | `src/lib/sde/README.md` | current-state at merge | build-gated (epic E1) | fold semantics + policy pack format documented; dual-mode test green |
| engineering | `src/lib/gapDerivation/README.md` incl. "not certified HEDIS" boundary | current-state | build-gated (E2) | rebuild proof green; honesty boundary stated |
| engineering | `src/lib/agents/README.md` + manifest schema doc (generated from schema.ts, never hand-written) | current-state | build-gated (E3) | manifest schema rendered from zod; three manifests validate |
| operations/SRE | runbook: signals/dispositions DLQ replay; policy-pack publish + rollback | target-state until lane lands | build-gated (E1/E4) | replay executed against a test topic; documented from the run |
| operations/SRE | runbook: journey lane ops (Temporal health, stuck-workflow triage, escalation-park review) | target-state | build-gated (E3) | first parked-item drill executed |
| compliance/audit | disposition explainability note (how every suppression is reconstructed from ledger + policy ids) | current-state at E1 done | build-gated (E1) | one full fold reconstructed from the ledger in the doc's worked example |
| enablement/field | SDE demo operator note update (mock vs engine mode; honest answer: which dispositions are real) | current-state | build-gated (E1) | dual-mode walkthrough green |
| engineering | traceability rows (§10 list) appended | current-state | per epic | row lands with green test |

---

## 13. Effort S/M/L with Assumptions

| Epic | Effort | Assumptions |
|---|---|---|
| E1 SDE engine + taxonomy + policy packs + seamed screen + BFF | M | ASSUMPTION: backbone dev-compose (ADR-002) available when intake lands; engine and screen ship first in mock mode without it |
| E2 Gap-derivation projector + measure data (GSD/EED-class) | M | ASSUMPTION: value-set references resolvable from the existing terminology assets; certification excluded by scope |
| E3 Agent runtime foundation (registry, façade, broker, inbox reuse, escalation) | M | ASSUMPTION: additive QueueName extension accepted by the goldenThread owner (same specialist family, low risk); Temporal dev-compose provided by X1 |
| E4 Signal intake + pending projection on backbone | S | ASSUMPTION: C6 topics provisioned by X1 with load-model partition counts |
| E5 PA/documentation agent (O-8) | M | ASSUMPTION: pa.* events emitted by the goldenThread persistence work (C9 #17 P1, pipeline pair); until then the journey runs Tier-A offline against in-memory stores in tests |
| E6 Outreach agent + templates + evals | M | ASSUMPTION: one channel adapter (spike S3 vendor) suffices for first ship; narration flag ships OFF |
| E7 Referral coordination agent | S | ASSUMPTION: referral platform webhook path (G3, P2) delivers referral.* events; stall windows are policy data with placeholder defaults |

---

## 14. Spike Tickets

- **S1 Temporal ops posture on AWS + Azure.** Question: exact self-hosted Temporal deployment shape in the ADR-004 platform layer (versions, Postgres sizing at 140K open workflows, upgrade path) and the dev-compose story. Timebox before E3.
- **S2 Coordination-window semantics.** Question: is a per-member daily fold window the right default, or per-priority windows (urgent immediate, high 4h, routine daily)? Decided with one week of representative signal fixtures against the policy engine; output is policy-pack defaults, not code.
- **S3 Communication channel adapter.** Question: which SMS/email path fits the C7 posture for pilot (self-hosted gateway vs IaC-edge vendor), and what consent metadata the channel needs. Blocks E6 execution step only.
- **S4 Workforce capacity source.** Question: where do care-team staffing counts come from for capacity throttles; until answered, capacity policy is a configured daily budget (documented ASSUMPTION).
- **S5 Care-team hierarchy for escalation.** Question: can an escalation chain be derived from CareTeam/PractitionerRole at 10@T3 (P1) or only at 10@T1 (P2)? Determines whether P1 escalation is chain-walk or direct-to-park (see R1).

---

## 15. Risks

Ranked.

1. **R1: Escalation chains need care-team hierarchy the record lacks at P1** (domain 10 is T3 claims-attribution until P2). Mitigation: escalation engine reads the chain through C1; when the chain is empty it goes one audited hop (assigned reviewer) then park-with-audit, which DP-3 permits. ESCALATION to spine: confirm this degraded P1 behavior is acceptable, or pull care-team T1 earlier for pilot deployments where rosters exist.
2. **R2: Consent revocation racing an in-flight touchpoint.** Mitigation: consent events are taxonomy signals with `immediate` fold; the outreach workflow re-checks consent scope in the execution activity (read-time check on top of labels, C1 rule); the send is idempotent and the retraction is audited. Covered by a named property test.
3. **R3: Second-inbox drift.** Any surface listing agent work outside the merged queue is the DP-3 defect. Mitigation: adversarial-review axis already exists; the inbox router is the only WorkItem producer for agents; acceptance test asserts agent proposals appear via `groupByQueue` in the existing reviewer UI.
4. **R4: Gap-derivation scope creep toward measure certification** (F1 boundary). Mitigation: the honesty boundary is in the README doneGate, event source labels, and the D7 compliance note; QARR-class reporting remains parked (F3) and this design takes none of it.
5. **R5: Policy-pack misconfiguration silently suppressing outreach at scale.** Mitigation: pack publish is attributed with a diff summary; suppression-rate counters per reason feed an alarmed metric projection; the last-valid-pack fallback plus loud refusal on invalid packs (§6 error doctrine).
6. **R6: Temporal operational burden lands on a team that has never run it.** Mitigation: ADR-002 accepts the cost; S1 spike plus build-gated journey-lane runbook (D7) before any agent goes past pilot; workflows stay engine-thin (logic in pure modules) so the blast radius of an engine issue is orchestration, not decisions.
7. **R7: LLM narration undermining determinism or leaking PHI.** Mitigation: narration is flagged OFF by default, schema-parsed, template-fallback by design; eval suites carry injection and PHI assertions; guardrails §9 wired as tests, not prose.
8. **R8: paMachine invariant erosion when wrapped by the journey** (agent effectively auto-advancing human gates). Mitigation: `requiresHumanApproval` is enforced inside the pure machine itself (evidence: transition() rejects without approvedBy); the workflow cannot bypass it; property test asserts no journey path reaches Submitted or GapClosed without an attributed human decision event.
