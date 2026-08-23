# Agent demo seam (`src/lib/agents/demo`)

The `agentRuntime` dataMode seam for the demo screen (mirrors the SDE demo seam).

```ts
const { actions, mode } = await getAgentDemoActions();   // resolves getDataMode('agentRuntime')
```

- `mock` / `seeded` — returns the authored actions
  ([`authored-agent-actions.json`](./authored-agent-actions.json)); the hardcoded
  demo stays green.
- `production` — `runRealAgentDemo()` runs the real agents over the seeded SDE
  demo batch (SDE → dispatcher → agents → HITL auto-approved → executed) and
  projects the emergent actions.

The authored list is kept at **parity** with the emergent output (authored ==
production), proven in `tests/agents/demoSeam.test.ts`. The shape is PHI-safe
(`agentId`, `taskKind`, `actionType`, `memberId`, `outcome`, reference codes).
