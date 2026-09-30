# Agent dispatcher (`src/lib/agents/dispatch`)

A thin composition root: given an **SDE disposition batch**, route each approved
action to the right agent by trigger/type, then start the tasks on the runtime.

## Routing is data

[`data/agent-routing.json`](./data/agent-routing.json) is a versioned table of
rules. A rule matches a signal by `actionability` and/or a `kindPrefix`, and maps
to an `agentId` + `taskKind` (+ an optional per-agent template). The code is a
generic apply-and-start — **no persona is hardcoded**.

```jsonc
{ "id": "member-outreach",  "agentId": "outreach-agent",              "taskKind": "outreach", "match": { "actionability": "member-outreach" } }
{ "id": "referral-coordination", "agentId": "referral-coordination-agent", "taskKind": "referral", "match": { "kindPrefix": "referral" } }
{ "id": "pa-appeal-documentation", "agentId": "pa-documentation-agent", "taskKind": "pa", "match": { "kindPrefix": "denial" },
  "pa": { "currentState": "Denied", "advanceEvent": { "type": "appeal" } } }
```

## The disclosure gate is not optional

**Routing a signal to an agent IS a disclosure** — the agent receives the member's
context and may act on it. So `DispatchInput.disclosure` is **required**, and
there is no dispatch path that skips the decision plane.

This README previously documented `routeBatch({ batch, memberContext, signals })`
with no disclosure argument, and the router held `if (!gate) return true`: a
published, documented total bypass of the plane, reachable from the public barrel.
An MHL §33.13 or PHL Art 27-F signal dispatched through it with **zero ledger
rows**. Both are gone.

```ts
const disclosure = {
  classFloorFor: taxonomyClassFloor(), // @/lib/sde — the ONE floor supplier
  capabilities: agentCapabilities(), // @/lib/agents/manifest
  basesFor: (memberId) => loadConsentBases(memberId),
  recipientFor: (agentId) => recipientForAgent(agentId),
  ledger: createDisclosureLedger(),
  nowMs,
};
const { tasks, refusals } = routeBatchGated({ batch, memberContext, signals, disclosure });
const handles = runDispatch(engine, tasks); // start on the runtime
```

## Dispatch is total — there is no default agent

Every `taskKind` is either started on **its own** declared workflow or **refused
with a coded `AgentRoutingError`**. There is no fallback branch.

`runDispatch` previously held three `if`s and a bare `return
engine.start(workflows.pa, …)`, so every kind that was not `outreach` or
`referral` ran as the **prior-authorisation agent**. `routeBatchGated` held the same
shape one layer up (`route.taskKind === 'referral' ? referralTaskFor : paTaskFor`).
Adding one routed agent with a new kind therefore sent its signals to the PA agent in
both places, which is why `bh-screening-triage-agent` shipped with `routes: []`: routing
it would have put a behavioural-health screen on the PA workflow.

> **Scope, corrected.** Earlier text here said prior authorisation was *withdrawn by a
> standing scope decision*. It is not: `data/agent-routing.json` ships a live `pa` route
> on `kindPrefix: 'denial'`, the seeded batch carries `sig-5` (`denial.issued`), and
> `pa-documentation-agent` dispatches on every demo run. PA **appeal documentation** is in
> scope — a denied behavioural-health service is a care-coordination event, not only a
> utilization-review one. The defect these switches close was never that PA is out of
> scope; it is that an unguarded default sent the **wrong kind** to it.

Both are now exhaustive switches whose `default` binds `never`, so **widening
`AgentTaskKind` or `DispatchedTask` is a `tsc --noEmit` failure**, not a runtime
substitution. The throw behind it is for a `routing` object handed in-process that
never passed `parseAgentRouting`. See `tests/agents/dispatchTotality.test.ts`.

## API

- `routeBatchGated` — the full shape: the tasks **and the refusals**, because a
  refusal a caller cannot see is a refusal nobody can evidence. Each refusal
  carries a `reason` code and, when one was made, the `DisclosureDecision`:

  | `reason`               | meaning                                                                          |
  | ---------------------- | -------------------------------------------------------------------------------- |
  | `disclosure-denied`    | the plane denied it; `decision` carries the regime                               |
  | `signal-unreadable`    | an intent or an approved disposition named a signal the batch does not carry     |
  | `consent-scope-absent` | the surviving opener named no purpose to contact for                             |
  | `no-route`             | **no routing rule matched** — the platform received the signal and did nothing   |
  | `referral-ref-absent`  | a referral route matched but the signal carries no `refs.referral`               |
  | `thread-ref-absent`    | a PA route matched but the signal carries neither `refs.claim` nor `refs.thread` |

  `no-route` closes a silent drop: `firstMatch` returning `undefined` led to a bare
  `continue`, so the seeded demo batch's `adt.discharge` (sig-2) and
  `screening.result` (sig-3) — both approved, both `care-team-task` — produced no
  task and no record. Their member touchpoint still went out (they are bundled into
  it); what vanished was the care-team-task dispatch. Both now surface as
  `no-route`, with `agentId` = `NO_AGENT` (`agent/none`, named rather than empty, so
  the record shows the lookup found nothing).

  `referral-ref-absent` / `thread-ref-absent` replace `?? sig.signalId`, which handed
  an agent a **signal id in a field consumed as a FHIR reference** — the agent acted
  on, and the ledger cited, a reference that resolves to nothing, and downstream
  dedup keyed on it collided across every ref-less signal for the member. The
  `claim ?? thread` preference is unchanged; only the third link is gone.

- `routeBatch` — `routeBatchGated(input).tasks`. Same decisions, tasks only.
  Outreach groups by the SDE-composed **coordinated touchpoint** (one task per
  touchpoint, decided **intent by intent**); referral/PA route **per approved
  disposition**. Pure and deterministic (touchpoints in composed order, then
  approved dispositions in batch order).
- `assertNoUngatedPart2` — the runtime backstop for a caller that arrives with no
  gate anyway. Despite the name (kept for barrel compatibility) it covers **every**
  class needing a specific written basis, plus any class the taxonomy does not
  govern: floor ∪ provenance ∩ `HEIGHTENED_BASIS_REQUIRED`.
- `decideDispatchDisclosure` / `decideTouchpointDisclosure` — the gate itself.
  `DisclosedTouchpoint` is the brand a touchpoint only acquires by clearing it, and
  `OutreachTask.touchpoint` is typed as the brand, so an undecided touchpoint
  cannot be handed to the outreach agent.
- `runDispatch` — starts each task with its agent workflow; the engine partitions
  by `memberId`, so per-member ordering is preserved.
- `parseAgentRouting` / `loadAgentRouting` — hand validator in `routingSchema.ts`
  (refuses loudly with `AgentRoutingError`; a PA route must carry its template).

Routing over the seeded SDE demo batch yields exactly one outreach touchpoint
task, one referral task, and one PA task — with the Part 2 intent stripped from the
touchpoint and recorded as a refusal, and `sig-2`/`sig-3` recorded as `no-route`.
See `tests/agents/dispatcher.test.ts`, `tests/agents/dispatchTotality.test.ts` and
`tests/agents/disclosure/demoPathRefuses.test.ts`.
