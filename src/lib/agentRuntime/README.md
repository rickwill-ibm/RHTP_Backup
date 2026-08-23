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
  start(def, opts): WorkflowHandle;      // deterministic id; per-member ordered
  signal(workflowId, signal): Promise;   // deliver a human decision; per-member ordered
  query(workflowId): WorkflowSnapshot;   // visibility read
  setTimer(workflowId, spec): string;    // deterministic timer (injected clock)
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
   also emits `agent.task.executed`; `agent.task.rejected`).

The engine emits ONLY the pre-allocated C2 types — `agent.task.proposed`,
`.approved`, `.rejected`, `.executed`, `.escalated`. Emitting anything else throws
`UnallowedAgentEventError`. Partition key = `memberId`.

## Autonomy is configuration (§10.5)

`autonomyTier` is READ from the manifest and mapped to decision behavior through a
data lookup (`AUTONOMY_BEHAVIOR`), never a code branch:

| tier | behavior |
|---|---|
| `HITL` | wait for a human signal; escalate on SLA breach |
| `HOTL` | auto-approve after the review (SLA) window unless a human rejects first |
| `autonomous` | auto-approve immediately |

Changing a manifest's tier changes behavior with no code change
(`tests/agents/autonomyTier.test.ts`).

## Guardrail: the runtime never sets authoritative state

The engine exposes NO API to set a domain state (e.g. a PA approval). Its only
mutation path is a proposal + a decision; an HITL proposal resolves only on an
external human signal. The owning state machine (e.g. `paMachine`) remains the
single authority — `tests/agents/guardrail.test.ts` asserts no `executed` event
appears without a human approval.

## Least privilege (§10.3)

`ctx.useTool(tool, fn)` calls `registry.assertToolAllowed(agentId, tool)` BEFORE
the effect runs; a tool not in the agent's manifest allowlist throws
`ToolNotAllowedError`.

## Escalation-as-data

[`data/escalation-policies.json`](./data/escalation-policies.json): SLA per
priority tier → escalate up the care-team hierarchy → PARK with audit (never
silently expire). Timer-driven off the injected clock. Tunable without a code
change. On each hop the runtime emits `agent.task.escalated` and moves the work
item to the `escalated` queue; the terminal park is audited and re-activatable.

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
