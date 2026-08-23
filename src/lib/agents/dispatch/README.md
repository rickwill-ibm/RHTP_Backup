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

## API

```ts
const tasks = routeBatch({ batch, memberContext, signals });   // pure, deterministic
const handles = runDispatch(engine, tasks);                    // start on the runtime
```

- `routeBatch` — outreach groups by the SDE-composed **coordinated touchpoint**
  (one task per touchpoint); referral/PA route **per approved disposition**. Pure
  and deterministic (touchpoints in composed order, then approved dispositions in
  batch order).
- `runDispatch` — starts each task with its agent workflow; the engine partitions
  by `memberId`, so per-member ordering is preserved.
- `parseAgentRouting` / `loadAgentRouting` — hand validator (refuses loudly with
  `AgentRoutingError`; a PA route must carry its template).

Routing over the seeded SDE demo batch yields exactly one outreach touchpoint
task, one referral task, and one PA task — see `tests/agents/dispatcher.test.ts`.
