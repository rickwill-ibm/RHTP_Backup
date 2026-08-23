# Iteration 3, Wave A: Agent runtime (G4) + manifest registry

Agent-runtime engineer, Iteration 3 Wave A. Scope built: the governed journey-lane
runtime and the manifest registry ONLY. The three agents' behaviors and the IDOR
role-model closeout are owned by parallel agents and were not touched. No
`src/app/api` route and no `src/lib/authz` file was modified.

## Modules created

| Module | Purpose |
|---|---|
| `src/lib/agentRuntime/` | WorkflowEngine interface + in-memory fake, HITL primitive, escalation-as-data, PHI-safe C2 event emission |
| `src/lib/agents/manifest/` | Manifest-as-data registry: versioned data, typed loader, `getAgentManifest(id)`, least-privilege enforcement |

Seam registration: `agentRuntime` and `agentManifests` added to
`src/lib/config/dataMode.ts` (mock authored actions vs production runtime; no
collision with taken ids). Additive reuse of the existing HITL work queue: two
queue names (`agent-proposal`, `escalated`) added to
`src/lib/goldenThread/workQueue.ts` + `workQueueView.ts` so agent proposals render
in the existing reviewer inbox. No second inbox was built (DP-3).

## 1. The runtime interface

`WorkflowEngine` (`src/lib/agentRuntime/types.ts`): `start` / `signal` / `query` /
`setTimer` / `complete`. Deterministic (time from an injected `ManualClock`;
timers fire only on `advanceTime`, never wall time). Per-member ordered: `memberId`
is the partition key and signal + timer handling for one member is serialized
through a promise-chain lock. The in-memory fake `InMemoryWorkflowEngine`
(`engine.ts` + `engineSupport.ts`) implements it; the Temporal-class drop-in point
is the `// SEAM: workflow-engine` anchor.

## 2. HITL primitive

`ctx.proposeAndWait(action)`: emits `agent.task.proposed`, creates an
`agent-proposal` work-queue item in the existing goldenThread queue, registers
escalation timers, then suspends. It resumes on a human decision signal:
`agent.task.approved` (which also emits `agent.task.executed`) or
`agent.task.rejected`. Only the five pre-allocated C2 types are emittable
(`agent.task.proposed|approved|rejected|executed|escalated`); anything else throws
`UnallowedAgentEventError`. Partition key is `memberId`; payloads are PHI-safe
(refs + codes only).

AI guardrail: the engine has no API to set an authoritative domain state. Its only
mutation path is a proposal plus a decision, and an HITL proposal never resolves
without an external human signal. The owning state machine (paMachine) stays the
single authority.

## 3. Manifest-as-data

`data/agent-manifests.json` registers the three pre-allocated ids only:
`outreach-agent`, `referral-coordination-agent`, `pa-documentation-agent`. Each
declares `{id, version, purpose, toolAllowlist, autonomyTier, escalationPolicyRef,
phiPosture, owningModule}`. A hand validator (house pattern, refuses loudly with
`AgentManifestError`; no zod). Least privilege: `registry.assertToolAllowed` is the
single gate every `ctx.useTool` call passes through and throws `ToolNotAllowedError`
for a tool outside the allowlist. Autonomy tier is READ from the manifest and
mapped to decision behavior through a data table (`AUTONOMY_BEHAVIOR`), never an
`if (agentId === ...)` branch. Flipping a manifest's tier changes behavior with no
code change (proven by `autonomyTier.test.ts`).

## 4. Escalation-as-data

`data/escalation-policies.json`: SLA per priority tier (urgent 4h / high 24h /
routine 72h) then escalate up the care-team hierarchy then PARK with audit, never
silent expiry. Timer-driven off the injected clock (deterministic). On each hop the
runtime emits `agent.task.escalated` and moves the work item to the `escalated`
queue; the terminal park is audited and the workflow stays waiting (re-activatable),
not failed. Tunable without a code change; the validator refuses a set that does not
cover every priority.

## 5. Fake-fidelity ledger (L1)

`src/lib/agentRuntime/FAKE_FIDELITY.md` names exactly what the in-memory fake does
NOT model vs real Temporal: (1) durable timers across restart, (2) at-least-once
activity retries, (3) worker crash recovery, (4) visibility/query across processes,
(5) sticky-execution replay determinism. Each maps to an assertion in the
Docker-guarded spec `tests/integration/agentRuntime.temporal.testcontainers.test.ts`,
which skips-with-reason when Docker/Temporal is absent (this sandbox) and runs those
five properties in CI. The fake is faithful to the runtime CONTRACT (interface, HITL
semantics, per-member ordering, escalation-as-data, event-type allowlist, least
privilege) but not to Temporal's durability guarantees.

## 6. Tests

New unit tests (`tests/agents/`), all green:

- `manifest.test.ts` (5): registry loads pre-allocated ids, `getAgentManifest`,
  unknown-id throw, least-privilege allow/deny, malformed refuses loudly.
- `proposeAndWait.test.ts` (3): suspend then resume on approval (proposed +
  approved + executed, work item created); rejection path (no executed); duplicate
  signal idempotent.
- `leastPrivilege.test.ts` (2): disallowed tool throws; allowed tool runs.
- `autonomyTier.test.ts` (3): HITL suspends; autonomous auto-approves; HOTL
  auto-approves after the SLA window. Behavior changes by data alone.
- `escalation.test.ts` (3): SLA timers walk the hierarchy then park with audit;
  a decision cancels escalation; policy validation.
- `perMemberOrdering.test.ts` (2, L4): concurrent signals for one member serialize
  (each approved is contiguously paired with its own executed); members independent.
- `guardrail.test.ts` (3): no executed without approval; engine exposes no
  authoritative-state API; only pre-allocated event types emit.

Docker-guarded integration spec (5 it, skipped here) asserts the five fake-fidelity
properties in CI.

## L5: two progress numbers

- New tests authored this wave: 26 (21 passing unit + 5 Docker-guarded integration).
- Live-integration-executed count: 0 (CI-pending; no Temporal/Docker in this
  environment, spec skips-with-reason).

## Verification status

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: full suite green (714 passed, 1 expected-fail which is the
  IDOR agent's deferred security test outside this scope, 83 skipped incl. the 5
  Temporal specs). Nothing prior broke.
- `bash check-file-sizes.sh`: PASS (ratchet intact; largest new file
  `engine.ts` at 359/400 after splitting support out to `engineSupport.ts`).

## Blocking concern

None. One note for the convergence owner: the additive `agent-proposal` /
`escalated` queue names in `goldenThread/workQueue.ts` are the reuse point the
parallel agents-behavior wave's proposal router must target, so coordinate to avoid
a duplicate queue-name edit.
