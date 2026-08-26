# Iteration 3 — summary (G4 governed agent runtime + 3 agents + IDOR closeout)

Iteration 3 added a **governed journey-lane agent runtime (G4)**, the **three named
agents** that run on it, and closed the **two deferred IDOR findings** with a
session-principal role model — built by three parallel agents (Wave A runtime,
Wave B behaviors, IDOR) and converged in Wave C.

## What was delivered

**G4 runtime (`src/lib/agentRuntime`).** A `WorkflowEngine` interface
(`start`/`signal`/`query`/`setTimer`/`complete`) with an in-memory fake
(`InMemoryWorkflowEngine`) behind a `// SEAM: workflow-engine` anchor for a
Temporal-class drop-in. Deterministic (injected `ManualClock`; timers fire only on
`advanceTime`), per-member ordered (`memberId` partition via a promise-chain lock).
The core primitive is **`ctx.proposeAndWait(action)`**: emit
`agent.task.proposed`, post a work item, then **suspend** until a human decision.
Only the 5 pre-allocated PHI-safe C2 event types can emit
(`proposed|approved|rejected|executed|escalated`).

**Manifest-as-data (`src/lib/agents/manifest`).** Three agents declared in
`data/agent-manifests.json` (`outreach-agent`, `referral-coordination-agent`,
`pa-documentation-agent`) with `{toolAllowlist, autonomyTier, escalationPolicyRef,
phiPosture, owningModule}`. A hand validator refuses loudly (house pattern, no zod).
`registry.assertToolAllowed` is the single least-privilege gate on every tool call.

**Three agents (`src/lib/agents`).**
- **outreach** — consumes an SDE-approved touchpoint, **consent-gates**, proposes,
  sends only on approval.
- **referral** — opens/tracks a referral; a stall walks **escalation-as-data**
  (SLA → care-team hierarchy → **park with audit**, never silent expiry); books no
  external transaction.
- **pa** (O-8) — drives the `/prior-auth` flow from thread context under a human
  gate; **never sets an authoritative PA state** (`claim-response` refused twice).
- **dispatch** — a thin, generic, data-driven router (`data/agent-routing.json`);
  no persona is hardcoded in code.
- **demo** — the `agentRuntime` dataMode seam: authored actions (mock) vs emergent
  actions from the real agents (production), proven at parity.

**IDOR closeout (`src/lib/authz/principal` + 2 routes).** A session-principal role
model (`getPrincipal` → `{userId, role, authorizedMemberScope}`) derived from
non-secret session facts, fail-secure to self-only. `canAccessMember` gates
`/api/evidence/[id]` and `/api/financial-clearance` with a PHI-safe audited 403;
the two IDOR `it.fails` flipped to positive 403 assertions. Replaces the previously
trusted hardcoded `role:'pa-reviewer'` + request-supplied member id.

## The decide → act → HITL loop

`SDE dispositions → dispatcher routes by trigger/type → agent proposes + SUSPENDS
at the existing reviewer work queue (agent.task.proposed) → human approves →
agent.task.executed → the effect runs`. Reproduced end-to-end from the seeded SDE
batch with nothing hardcoded (`endToEnd.test.ts`): the touchpoint id asserted
through the loop is derived from the SDE output.

## Autonomy-as-config

Autonomy is a manifest field mapped through a data table
(`AUTONOMY_BEHAVIOR[tier]`), never a code branch: `HITL` → a human approves every
action; `HOTL` → auto-approve after the review window; `autonomous` → immediate.
All three shipped agents are **HITL**, so no auto-approve path is reachable —
flipping the manifest tier changes behavior with zero code change (proven by
`autonomyTier.test.ts`). Escalation SLAs and the hierarchy are likewise data
(`escalation-policies.json`), tunable without code.

## Fake-verified vs CI-pending

- **Fake-verified here:** the runtime CONTRACT — HITL suspend/resume, per-member
  ordering, least privilege, event-type allowlist, escalation-as-data, the
  guardrails, the decide→act loop, and all IDOR authz. All on the in-memory fake.
- **CI-pending (Live-integration-executed = 0):** the five Temporal durability
  properties (durable timers across restart, at-least-once retries, worker-crash
  recovery, cross-process visibility, sticky-replay determinism) — named in
  `FAKE_FIDELITY.md` and asserted by the Docker-guarded testcontainers spec, which
  skips-with-reason in this sandbox and runs in CI.

## Carried findings

- `/api/match` no-body-validation in dev-mock (cycle-3 MEDIUM) — the 1 remaining
  `it.fails`; input-validation, deferred.
- Panel scope is enforced but not yet sourced — reviewers resolve to `org` scope
  until a panel-assignment store lands (then auto-bounded, no route change).
- `/api/work-queue` still hardcodes `role:'pa-reviewer'` (list surface, no
  per-member id) — a mechanically-identical principal-wiring follow-up.
- referral manifest over-grants `provider-context.read` (declared, unused).

## Gates (authoritative)

- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 738 passed | 1 expected-fail | 83 skipped.
- `bash check-file-sizes.sh` → PASS (ratchet intact).

**Convergence verdict: DRY** — 0 material defects requiring a code change; the one
latent cross-agent seam (routing `agentId` never cross-checked) closed with a
namespace-integrity test gate; the outreach/referral guardrail coverage gap filled.
