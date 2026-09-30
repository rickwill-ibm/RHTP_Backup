# Agent library (`src/lib/agents`)

The three governed agents built **on** the agent runtime
([`src/lib/agentRuntime`](../agentRuntime/README.md)) and the manifest registry
([`manifest/`](./manifest/README.md)), plus the dispatcher that routes SDE
decisions to them and the demo seam. This is the "agent behaviors" half of G4:
the runtime provides the HITL primitive and escalation-as-data; the agents are
the workflow bodies that use them.

```
SDE disposition batch                (src/lib/sde — the DECISION)
        │
        ▼
  dispatch/  (route by trigger/type, DATA)   ── the thin composition root
        ├─ outreach/   consume a coordinated touchpoint, consent-gate, propose, send
        ├─ referral/   open/track a referral, propose, escalate a stall (as data)
        └─ pa/         drive /prior-auth from thread context, propose docs (O-8)
        │
        ▼
  runtime.proposeAndWait  → agent.task.proposed → work queue (HITL) →
        approve → agent.task.approved   |  reject → agent.task.rejected
           (… then agent.task.settled, with the outcome the workflow reported)
```

## The three agents

| agent (manifest id)           | consumes                               | proposes                   | on approval                                           |
| ----------------------------- | -------------------------------------- | -------------------------- | ----------------------------------------------------- |
| `outreach-agent`              | an SDE-approved coordinated touchpoint | `send-outreach`            | sends via `comms-channel.send` (mockable)             |
| `referral-coordination-agent` | a referral (open/stalled)              | `referral-followup`        | records the follow-up; a stall escalates as data      |
| `pa-documentation-agent`      | `/prior-auth` thread context (O-8)     | `advance-pa-documentation` | appends evidence + a NON-authoritative PA advancement |

Every agent is a `WorkflowDefinition` whose `agentId` names the governing
manifest. All authority (tool allowlist, autonomy tier, escalation policy, PHI
posture) is read from the manifest; nothing is implicit in code. Each tool call
passes `ctx.useTool` → the least-privilege allowlist gate. Each proposal suspends
at the existing goldenThread work queue (`agent-proposal` item); none builds a
second inbox.

## Consent gate (outreach)

The outreach agent reuses the consent seam
([`src/lib/sde` `consentGranted`](../sde/consentGate.ts), over the
provider-access opt-out store): **no outreach is proposed without the
touchpoint's consent scope**. Absent consent yields a `suppressed` result with
reason `consent-absent` — never a silent send, and never a proposal that could be
approved into a send.

## AI guardrail (PA)

The `pa-documentation-agent` **never sets an authoritative PA state**. The only
event that resolves `Approved`/`Denied` is a payer `ClaimResponse`
(`claim-response`), applied by the `paMachine` state machine. `assertAgentPaEventAllowed`
refuses that event both before proposing and at the `pa-machine.transition` tool,
so the agent can advance documentation (e.g. `submit`, `appeal`) but can never
decide the claim. Asserted in `tests/agents/paDocumentation.test.ts`.

## Dispatcher (`dispatch/`)

`routeBatch(input)` (pure) reads the routing table
([`dispatch/data/agent-routing.json`](./dispatch/data/agent-routing.json)) and
maps each approved SDE disposition to an agent by trigger (actionability and/or a
signal-kind prefix). Outreach groups by the SDE-composed coordinated touchpoint;
referral/PA route per approved disposition. No persona is hardcoded in code — the
trigger→agent map and the PA advancement template are data. `runDispatch(engine,
tasks)` starts each task on the runtime (per-member ordered by the engine).

## Demo seam: `agentRuntime`

`getAgentDemoActions()` resolves `getDataMode('agentRuntime')`:

- `mock`/`seeded` — the authored actions
  ([`demo/authored-agent-actions.json`](./demo/authored-agent-actions.json)); the
  demo stays green.
- `production` — runs the real agents over the seeded SDE demo batch
  (SDE → dispatcher → agents → HITL auto-approved → settled) and projects the
  emergent actions. Authored == emergent (parity), proven in
  `tests/agents/demoSeam.test.ts`.

## Tests

`tests/agents/` — each agent proposes-and-waits then executes on approval /
rejects on rejection; outreach consent-suppression; referral stall → escalation →
abandonment terminal; the PA guardrail (cannot set an authoritative PA state); the dispatcher
routes a seeded SDE batch to the right agents; per-member ordering; and the full
seeded decide→act loop (`endToEnd.test.ts`).
