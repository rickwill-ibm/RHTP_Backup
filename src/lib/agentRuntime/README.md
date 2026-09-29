# Agent runtime — journey lane (`src/lib/agentRuntime`)

The minimal governed runtime that ACTS on decisions (G4, ADR-002). It sits behind
a `WorkflowEngine` interface; an in-memory fake implements it for tests, and a
Temporal-class engine drops in at the `// SEAM: workflow-engine` anchor with the
same interface. See [FAKE_FIDELITY.md](./FAKE_FIDELITY.md) for what the fake does
NOT model (the L1 ledger) and `tests/integration/agentRuntime.temporal.testcontainers.test.ts`
for the Docker-guarded spec that asserts those properties.

## The interface

```ts
interface WorkflowEngine {
  start(def, opts): WorkflowHandle; // deterministic id; per-member ordered
  signal(workflowId, signal): Promise; // deliver a human decision; per-member ordered
  query(workflowId): WorkflowSnapshot; // visibility read
  setTimer(workflowId, spec): string; // deterministic timer (injected clock)
  complete(workflowId, result): Promise; // terminal
}
```

- **Deterministic**: time comes from an injected `ManualClock`; timers fire only
  when `advanceTime(ms)` is called, never on wall time. Same inputs, same run.
- **Per-member ordering** (C6): `memberId` is the partition key. Signals and timer
  firings for one member are serialized through a promise-chain lock, so
  concurrent signals never interleave for the same member (proven by
  `tests/agents/perMemberOrdering.test.ts`).

## The HITL primitive: `proposeAndWait`

The runtime's ONE way to act. A workflow calls `ctx.proposeAndWait(action)`, which:

1. emits an `agent.task.proposed` C2 event (PHI-safe: refs + codes only);
2. creates an `agent-proposal` work-queue item in the EXISTING goldenThread queue
   (reuse, not a second inbox — DP-3);
3. registers escalation timers; then **suspends**;
4. resumes when a human decision signal arrives (`agent.task.approved` →
   `agent.task.rejected`). The engine emits NO execution event at decision time — it performs no
   effects — only `agent.task.settled` when the workflow actually settles, carrying the outcome the
   workflow itself reported (register G-002).

The engine emits ONLY the pre-allocated C2 types — `agent.task.proposed`,
`.approved`, `.rejected`, `.settled`, `.escalated`, `.abandoned`. Emitting anything
else throws `UnallowedAgentEventError`. Partition key = `memberId`.

`.executed` was REMOVED (register G-002): it was emitted at approval time, before the
workflow body resumed, so the engine was asserting an effect it neither performed nor
observed. `.settled` replaces it and fires when the workflow actually settles, carrying
an outcome code from a closed vocabulary. `.abandoned` was ADDED (G-001) so the
escalation terminal stops masquerading as one more `escalated` hop.

## Autonomy is configuration (§10.5)

`autonomyTier` is READ from the manifest and mapped to decision behavior through a
data lookup (`AUTONOMY_BEHAVIOR`), never a code branch:

| tier         | behavior                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `HITL`       | wait for a human signal; escalate on SLA breach                         |
| `HOTL`       | auto-approve after the review (SLA) window unless a human rejects first |
| `autonomous` | auto-approve immediately                                                |

Changing a manifest's tier changes behavior with no code change
(`tests/agents/autonomyTier.test.ts`).

## Guardrail: the runtime never sets authoritative state

The engine exposes NO API to set a domain state (e.g. a PA approval). Its only
mutation path is a proposal + a decision; an HITL proposal resolves only on an
external human signal. The owning state machine (e.g. `paMachine`) remains the
single authority. `tests/agents/guardrail.test.ts` asserts no `agent.task.settled`
event appears without a human approval, and `tests/agents/paDocumentation.test.ts`
asserts that an agent handed an authoritative event fails BEFORE proposing — with the
refusal on the record as `settled{status:'failed', outcome:'errored'}`, not in silence.

## Least privilege (§10.3)

`ctx.useTool(tool, fn)` calls `registry.assertToolAllowed(agentId, tool)` BEFORE
the effect runs; a tool not in the agent's manifest allowlist throws
`ToolNotAllowedError`.

## Escalation-as-data

[`data/escalation-policies.json`](./data/escalation-policies.json): SLA per
priority tier → escalate up the care-team hierarchy → PARK with audit (never
silently expire). Timer-driven off the injected clock. Tunable without a code
change. On each hop the runtime emits `agent.task.escalated` and moves the work
item to the `escalated` queue. The terminal is an ABANDONMENT, not a park: the item
moves to its own `parked` queue, `agent.task.abandoned` is emitted, and the workflow is
terminated with status `abandoned`. It is **not re-activatable** — a decision arriving
afterwards is refused with `WorkflowTerminatedError`, because resolving it would resume
a body the runtime had already declared abandoned and run its effect invisibly. Re-filing
a parked item is a human act.

**The ladder does not fire in the running application.** Timers advance only through
`advanceTime()`, which has no caller in `src/`; every composition root pins the clock.
See FAKE_FIDELITY.md.

## Wiring

```ts
import { createRuntime } from '@/lib/agentRuntime';
const { engine, clock, eventSink, inbox } = createRuntime({ startMs });
const handle = engine.start(myWorkflowDef, { memberId, input });
await engine.signal(handle.workflowId, { name: 'agent.task.approved', proposalId, decidedBy });
await handle.done;
```

Production drop-in: swap the fake for a Temporal engine at the seam, and the
in-memory event sink for the outbox-backed sink (`// SEAM: agent-event-outbox`).
The `agentRuntime` dataMode selects authored actions (mock) vs the real engine
(production).
