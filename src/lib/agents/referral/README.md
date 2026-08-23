# Referral coordination agent (`src/lib/agents/referral`)

Opens/tracks a referral and proposes a coordination action HITL. **Stall handling
is escalation-as-data, not bespoke code**: the proposal registers the runtime's
escalation timers, so an unattended (stalled) proposal walks the
SLA → care-team hierarchy → park path off the injected clock. Governed by the
`referral-coordination-agent` manifest (read + work-queue tools only; it never
books an external transaction).

```ts
engine.start(createReferralWorkflow(), { memberId, input: referralTask });
// referral-status.read -> (completed? resolve) -> proposeAndWait('referral-followup')
```

Flow (`referralAgent.ts`):

1. `referral-status.read` (allowlisted) reads the referral state.
2. `completed` → `{ outcome: 'resolved-no-action' }` (no proposal).
3. Otherwise `proposeAndWait('referral-followup')`. If no human decision arrives
   within the SLA, the runtime escalates up the hierarchy (`agent.task.escalated`
   per hop, item moved to the `escalated` queue) and finally **parks with audit**
   — never a silent expiry. A decision before the SLA cancels escalation.

On approval → `{ outcome: 'executed' }`; on rejection → `{ outcome: 'rejected' }`.
See `tests/agents/referral.test.ts` (stall → hierarchy → park).
