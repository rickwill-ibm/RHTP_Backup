# Outreach agent (`src/lib/agents/outreach`)

Consumes an **SDE-approved coordinated touchpoint** (the output of
[`src/lib/sde`](../../sde/README.md)) and drives it through the HITL gate.
Governed by the `outreach-agent` manifest.

```ts
const wf = createOutreachWorkflow();               // default deps: mock send + SDE consent seam
engine.start(wf, { memberId, input: outreachTask });
// person-context.read (allowlisted) -> consent gate -> proposeAndWait -> (approved) comms-channel.send
```

Flow (`outreachAgent.ts`):

1. `person-context.read` (allowlisted tool) reads member context.
2. **Consent gate** — `consentGranted(memberId, task.consentScope, ctx)` (reuses
   the SDE consent seam). No scope → `{ outcome: 'suppressed', reason:
   'consent-absent' }`: no proposal, no work item, no send.
3. `proposeAndWait('send-outreach')` — suspends at the `agent-proposal` work queue.
4. On **approval**, the actual send is a `comms-channel.send` tool call
   (mockable) → `{ outcome: 'executed', sendRef }`. On **rejection** → `{ outcome:
   'rejected' }`, no send.

The runtime emits `agent.task.proposed` → `approved`/`rejected` → `executed`
around this; payloads are PHI-safe (touchpoint id, channel, intent kinds — no
member payload). `buildOutreachAction` is the pure proposal builder.
