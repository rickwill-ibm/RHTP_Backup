# Iteration 3, Wave B: the three agents' behaviors + dispatcher (on the G4 runtime)

Agent-behaviors engineer, Iteration 3 Wave B. Built the THREE named agents, the
dispatcher, and the demo seam ON the wave A runtime + manifest registry. No wave A
runtime file (`src/lib/agentRuntime/*`) was modified; the additive
`agent-proposal` / `escalated` work-queue names from wave A were targeted, not
re-added (per the coordinate note). The IDOR role-model closeout is a parallel
agent's scope and was not touched.

## Modules built (all feature-first, ≤400 lines/file, README per folder)

| Module | Purpose |
|---|---|
| `src/lib/agents/outreach/` | Consume an SDE-approved coordinated touchpoint, consent-gate, propose HITL, send on approval |
| `src/lib/agents/referral/` | Open/track a referral, propose HITL, escalate a stall via escalation-as-data |
| `src/lib/agents/pa/` | Drive the `/prior-auth` flow from thread context (O-8); the PA AI-guardrail |
| `src/lib/agents/dispatch/` | Thin dispatcher: route an SDE disposition batch to the right agent by trigger/type (DATA) |
| `src/lib/agents/demo/` | The `agentRuntime` seam: mock authored actions vs real runtime |
| `src/lib/agents/index.ts`, `README.md` | Top-level agent-library surface + domain README |

Largest new file: `dispatch/dispatcher.ts` at 206/400. `manifest/data/agent-manifests.json`
`owningModule` fields were pointed at the real behavior modules (`src/lib/agents/{outreach,referral,pa}`);
no test asserts those strings.

## 1. Outreach agent

`createOutreachWorkflow(deps?)` — a `WorkflowDefinition` governed by the
`outreach-agent` manifest. Flow: `person-context.read` (allowlisted) → **consent
gate** → `proposeAndWait('send-outreach')` → on approval, the send is a
`comms-channel.send` tool call (mockable) emitting `agent.task.executed`; on
rejection, `agent.task.rejected`, no send. Consent-gated by reusing the SDE
consent seam (`consentGranted`, over the provider-access opt-out store): no scope →
`{ outcome: 'suppressed', reason: 'consent-absent' }` — no proposal, no work item,
no send, no events.

## 2. Referral coordination agent

`createReferralWorkflow(deps?)` governed by `referral-coordination-agent`. Reads
`referral-status.read`; a `completed` referral resolves with no action; otherwise
`proposeAndWait('referral-followup')`. **Stall handling is escalation-as-data**:
the proposal registers the runtime's escalation timers, so an unattended proposal
walks SLA → care-team hierarchy → **park with audit** off the injected clock, never
a silent expiry. The agent books no external transaction (read + work-queue tools
only).

## 3. PA documentation agent (O-8) + the AI guardrail

`createPaWorkflow(deps?)` governed by `pa-documentation-agent`. Reads thread
context, prepares DTR, `proposeAndWait('advance-pa-documentation')`, and on
approval appends evidence + applies a **NON-authoritative** advancement to the
`paMachine` (e.g. `submit` with the reviewer as `approvedBy`, `appeal`).

**Guardrail (asserted):** the agent NEVER sets an authoritative PA state.
`assertAgentPaEventAllowed` refuses `claim-response` — the only event that
resolves `Approved`/`Denied` — both up front (the agent fails before it ever
proposes) and again at the `pa-machine.transition` tool. The `paMachine` stays the
single authority: the agent **proposes** documentation, a **human gates**, the
**state machine decides**.

## 4. The dispatcher (thin, generic, no hardcoded persona)

`routeBatch({ batch, memberContext, signals })` (pure, deterministic) reads
`dispatch/data/agent-routing.json` and maps each approved SDE disposition to an
agent by trigger (`actionability` and/or a signal-kind `kindPrefix`) + an optional
per-agent template. Outreach groups by the SDE-composed coordinated touchpoint
(one task/touchpoint); referral/PA route per approved disposition. `runDispatch`
starts each task on the runtime (per-member ordered by the engine). The
trigger→agent map and the PA advancement template are DATA; the code is generic
apply-and-start. A house-pattern validator refuses malformed routing loudly.

## 5. The SDE → agent → HITL → execute loop (seeded, reproduced)

`tests/agents/endToEnd.test.ts` runs the loop from the seeded SDE demo batch with
nothing hardcoded: the real SDE engine folds the seeded signals and approves one
coordinated touchpoint (`summary.touchpoints === 1`, `approved === 5`) → the
dispatcher routes it to the outreach agent → the agent proposes and suspends at
the `agent-proposal` work queue (`agent.task.proposed`, no `executed`) → a human
approves → `agent.task.executed`. The touchpoint id asserted through the loop is
derived from the SDE output, not a literal. **decide→act loop reproduced: yes.**

## 6. The `agentRuntime` demo seam

`getAgentDemoActions()` resolves `getDataMode('agentRuntime')`: `mock`/`seeded`
returns the authored actions (`demo/authored-agent-actions.json`, demo stays
green); `production` runs the real agents over the seeded batch and projects the
emergent executed actions. Authored == emergent (parity), proven in
`demoSeam.test.ts`.

## Tests (`tests/agents/`, +18 this wave, all executed & passing)

- `outreach.test.ts` (3): propose→wait→execute on approval; reject → no send/executed; consent-suppression (no proposal/work-item/send/events).
- `referral.test.ts` (4): propose HITL → execute on approval; reject; **stall → SLA → hierarchy → park** (advanceTime); completed → no-action.
- `paDocumentation.test.ts` (4): propose docs → advance on approval (to `Submitted`, never authoritative); reject; **GUARDRAIL** (claim-response refused, agent fails before proposing, only the state machine reaches `Approved`/`Denied`); appeal-only advance over a denial.
- `dispatcher.test.ts` (4): routes the seeded SDE batch to outreach+referral+PA; deterministic/pure routing; per-member ordering preserved (each `approved` contiguously paired with its own `executed`); malformed routing refuses loudly.
- `endToEnd.test.ts` (1): the seeded decide→act loop.
- `demoSeam.test.ts` (2): mock authored vs production emergent, at parity.

Determinism: every test runs on the injected `ManualClock` (via `createRuntime`);
timers fire only on `advanceTime`. **PA-guardrail asserted: yes.**

## L5: two progress numbers

- New tests authored this wave: **18** (all unit-level, all executed and passing).
- Live-integration-executed count: **0** (unchanged — the agents run entirely on
  the in-memory workflow fake; the Docker-guarded Temporal spec is wave A's and
  still skips-with-reason in this sandbox. No new integration spec was added
  because no new pg/Temporal-backed state was introduced by the agent behaviors).

## Verification status

- `npx tsc --noEmit`: **0 errors**.
- `npx vitest run`: **732 passed**, 1 expected-fail (the deferred IDOR security
  test — a parallel wave's scope, unchanged), 83 skipped (incl. the 5 Temporal
  specs). Nothing prior broke; +18 over wave A's 714.
- `bash check-file-sizes.sh`: **PASS** (ratchet intact; largest new file 206/400).

## Blocking concern

None. Coordination note for convergence: the `agentRuntime` demo seam is async
(`getAgentDemoActions()` returns a Promise) because the runtime is async — a
demo/BFF caller must await it (the SDE seam is sync). The manifest `owningModule`
strings now point at the real modules built this wave.
