# Revenue-Cycle agent (`src/lib/agents/revenueCycle`)

Consumes an order→cash **`underpaid` reconciliation verdict** and drives a
recovery-appeal **DRAFT** through the HITL gate. Governed by the
`revenue-cycle-agent` manifest.

```ts
const wf = createRecoveryWorkflow(deps); // deps.recordDraft appends the draft to the evidence spine
engine.start(wf, { memberId, input: recoveryTask });
// reconciliation.read (allowlisted) -> interlock -> evidence.append (draft) -> proposeAndWait (suspends)
```

Flow (`revenueCycleAgent.ts`):

1. `reconciliation.read` (allowlisted tool) reads the recovery context
   (references-only — claim/remittance/auth ids + delta, no member payload).
2. **Twin-ladder interlock** — `evaluateInterlock({ manifestTier, evidenceTier,
action, isSubmission: true })`. The result is CONSUMED: `permittedRung` (the
   weakest link of autonomy × evidence) and `requiresHuman` (a payer-facing
   submission is human-gated regardless of rung — the workflow throws if the
   invariant is ever violated).
3. **FIX-1 — the agent is the single writer of the draft.** `evidence.append`
   (allowlisted tool) writes the recovery DRAFT via `deps.recordDraft(task,
permittedRung)` at propose-time, BEFORE suspension, under `assertToolAllowed`.
   `orderToCash` never writes the draft directly.
4. `proposeAndWait('draft-appeal')` — suspends at the `agent-proposal` work queue
   for the human SUBMISSION decision.

A payer-facing **SUBMISSION** is never auto-executed regardless of rung (Wave-1
FIX-1, evolved in Wave-4). The manifest allowlist now grants **`claim.submit-appeal`**,
so the agent **CAN** transmit — but ONLY in the post-approval branch, after
`proposeAndWait` resolves with a **QUALIFIED-HUMAN** decision. It is impossible
_without_ one (not _structurally_ impossible): at **any** tier the proposal is
`isSubmission`, so the runtime auto-approve gate refuses it (`isSubmission` →
`isAutoApprovable` false — there is **no** auto-submit path at any tier), and the
workflow body ASSERTS `isQualifiedHumanDecision` before the submit tool, so a
`system`/`autonomy:*` signaller can never reach it. A REJECT is terminal with no
submission. The transmit itself is a **MOCK, not-transmitted** channel
(`channel:'mock'`, `transmitted:false`) behind the **fail-closed** real-EDI
`submissionGateway` seam (production `load()` throws until a real 837/appeal
clearinghouse is wired). The submission runs on the decision route's
reconstruct-and-signal engine, never at draft/dispatch time. Because step 4
suspends, in a per-request engine `run` may not complete to the return — the caller
reads the durable draft + proposal from engine state after suspension.

The runtime emits `agent.task.proposed` → `approved`/`rejected` → `executed`
around the proposal; payloads are PHI-safe (claim/remittance/auth ids, delta as a
string — no member payload). `buildRecoveryAction` is the pure proposal builder.
