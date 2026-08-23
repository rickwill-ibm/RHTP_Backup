# PA documentation agent (`src/lib/agents/pa`) — O-8

Drives the existing goldenThread `/prior-auth` flow from thread context: prepares
documentation (DTR) and proposes a PA-advancement action under a human gate.
Governed by the `pa-documentation-agent` manifest.

```ts
engine.start(createPaWorkflow(), { memberId, input: paTask });
// guardrail-check -> person-context.read -> dtr.generate -> proposeAndWait -> (approved) evidence.append + pa-machine.transition
```

## The AI guardrail (the point of this agent)

The agent **NEVER sets an authoritative PA state.** The only event that resolves
`Approved`/`Denied` is a payer `ClaimResponse` (`claim-response`), applied by the
[`paMachine`](../../workflow/paMachine.ts) — the single authority.

`assertAgentPaEventAllowed(event)` throws `AgentAuthorityError` for any
authoritative event (`claim-response`). It runs **twice**: up front (so the agent
never even proposes such an action — it fails before HITL) and again at the
`pa-machine.transition` tool (defense in depth). The agent can therefore advance
documentation (`submit` with the reviewer as `approvedBy`, `appeal`, …) and reach
workflow states like `Submitted`/`AppealOrReview`, but has **no path** to
`Approved`/`Denied`.

The loop is: the agent **proposes** evidence/documentation → a **human gates** at
the work queue → the **state machine decides**. Asserted in
`tests/agents/paDocumentation.test.ts`:

- the guardrail refuses `claim-response`;
- an agent handed a `claim-response` fails before proposing (no `proposed`/`executed`);
- only `transition('Pending', claim-response, …)` reaches `Approved`/`Denied` —
  a path the agent never takes.
