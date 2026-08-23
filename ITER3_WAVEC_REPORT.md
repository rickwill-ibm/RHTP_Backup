# Iteration 3, Wave C — convergence self-review (G4 runtime + 3 agents + IDOR)

Convergence engineer, Iteration 3. Adversarial cross-agent review of everything
Iteration 3 built in parallel: `src/lib/agentRuntime` (Wave A), `src/lib/agents`
(manifest + outreach/referral/pa/dispatch/demo, Wave B), `src/lib/authz/principal`
+ the two fixed routes (IDOR). Focus (L2): the CROSS-AGENT seams three parallel
agents could not see across.

## Verdict: DRY

- **New material defects: 0** requiring a production-code change.
- **Convergence findings: 3** (1 low-severity latent seam — fixed with a test
  gate; 1 guardrail-coverage gap — filled; 1 doc-only least-privilege note).
- All authoritative gates green (below). Two test files added (+6 tests), no
  production file touched.

## The one focus finding (F-C1, LOW, FIXED) — the routing `agentId` seam

Three surfaces name the agent ids **independently** because three agents built in
parallel: the code constants (`OUTREACH_AGENT_ID` / `REFERRAL_AGENT_ID` /
`PA_AGENT_ID`), the manifest data (`data/agent-manifests.json`), and the routing
data (`data/agent-routing.json`, `route.agentId`).

`runDispatch` selects a workflow by **`taskKind`** (each workflow carries its own
id constant, which the engine uses for manifest lookup + least privilege), while
`route.agentId` is consumed **only** in `demo/index.ts:projectResult` for the
display row — it is never validated against the manifest ids nor against the
constant its `taskKind` actually runs under. A typo or a rename on any one surface
would drift silently: execution and authz stay correct (they key off the
constant), but the demo projection would mislabel, and nothing would fail.

- **Impact:** latent — no runtime authz hole today (the three surfaces currently
  agree; execution never trusts `route.agentId`). It is a maintainability /
  demo-correctness gap, exactly the kind a parallel build leaves behind.
- **Fix (test-only):** `tests/agents/namespaceIntegrity.test.ts` pins all three
  surfaces to the same three ids (`route.agentId === TASKKIND_TO_CONSTANT[kind]`,
  every routing id ∈ manifest ids, manifest ids == constants), plus the 5 C2 event
  types and the 2 queue names. Any future rename on one surface now fails loudly
  here. No production change was needed because the surfaces agree today.

## Checklist results

1. **Namespace integrity (L3): PASS.** The 5 C2 event types are defined once in
   `agentRuntime/types.ts` (`AGENT_C2_EVENT_TYPES`), reused everywhere via the
   allowlist guard. The 3 agent ids are consistent across constants / manifests /
   routing (now locked by F-C1's test). `agent-proposal` / `escalated` are declared
   **once** in `goldenThread/workQueue.ts` (`QueueName` union) — Wave A added them
   to the type + `workQueueView`; Wave B targeted the same names, no duplicate
   definition. No seam-id/module/event-type collision found.

2. **The 1 expected-fail (item 2): CONFIRMED legitimate.**
   `tests/security/input-validation.test.ts` →
   `it.fails('SAFE would be: a malformed $member-match body is 400, not a 200
   identity')`. It is the cycle-3 MEDIUM input-validation finding: `/api/match`
   short-circuits on `devMockEnabled()` before the `!parameters` check, so a
   garbage body returns a 200 default identity instead of a 400. It is **not** an
   IDOR regression and **not** a dropped IDOR fix — the two IDOR `it.fails`
   (evidence + financial-clearance) were flipped to positive 403 assertions in
   `idor.test.ts`. Whole-repo `it.fails` count = **1**, this one.

3. **Manifest ↔ behavior consistency: PASS (one doc note).** Every tool each agent
   actually calls via `ctx.useTool` is in its manifest `toolAllowlist`
   (outreach: `person-context.read`, `comms-channel.send`; referral:
   `referral-status.read`; pa: `person-context.read`, `dtr.generate`,
   `evidence.append`, `pa-machine.transition`). `useTool` routes every call through
   `registry.assertToolAllowed` — the single least-privilege gate. The dispatcher
   routes to the manifest ids (locked by F-C1). Autonomy tier is READ from the
   manifest and mapped through the `AUTONOMY_BEHAVIOR` data table — never an
   `if (agentId === …)` / `if (tier === …)` branch (grep-confirmed; the only
   `taskKind ===` branches select an input shape, not authority).
   - **F-C2 (doc-only, LOW): referral over-grants `provider-context.read`** — it is
     in the allowlist but the agent never calls it. This is a least-privilege
     *widening* (declared-but-unused), not a violation (the guarantee "no tool used
     outside the allowlist" holds). Tighten the allowlist when the read stays
     unused, or wire the read it implies.

4. **AI guardrail across all three agents: PASS, coverage gap filled.** None can
   set an authoritative state directly: the engine exposes no state-setter (its
   only mutation is propose + human decision); PA refuses `claim-response` both up
   front and at the transition tool (`assertAgentPaEventAllowed`, defense in depth);
   outreach sends only via a post-approval tool call; referral books no external
   transaction (read + work-queue only). The PA guardrail was explicitly tested; the
   outreach/referral guardrail was only *implicit* (reject/suspend assertions).
   **Filled:** `tests/agents/agentGuardrail.test.ts` proves neither outreach nor
   referral produces its authoritative effect while suspended, and that **240h of
   virtual time with no human signal never approves** a HITL agent (time only
   escalates).

5. **Determinism: PASS.** `rg "Date\.now\(\)|Math\.random\(\)|new Date\(\)"` over
   `agentRuntime` + `agents` = **0 hits**. Time enters only through the injected
   `ManualClock`; timers fire only on `advanceTime`. (The runtime's `ManualClock`
   is the deterministic virtual-time driver — a distinct concept from, and not a
   duplicate of, the global `src/lib/clock.ts` seam.)

6. **console.*: PASS.** `rg "console\.(log|debug)" src` = **0**.

7. **HITL integrity: PASS.** For the HITL tier (all three shipped agents),
   `AUTONOMY_BEHAVIOR.HITL.autoApprove === 'never'`: `proposeAndWait` returns a
   deferred that resolves **only** on an external `agent.task.approved` /
   `agent.task.rejected` signal via `signal()` → `decide()`; the escalation timer
   escalates/parks but never resolves it. (The `immediate` / `after-sla`
   auto-approve paths exist for the `autonomous` / `HOTL` tiers — autonomy-as-config
   — but no shipped manifest declares them.) The work queue is **reused**: proposals
   are goldenThread `WorkItem`s in the `agent-proposal` / `escalated` queues; the
   `ProposalInbox` port carries the same `WorkItem`/`QueueName` vocabulary. Grep for
   a competing inbox found only `agentRuntime/inbox.ts`, which is that reuse adapter,
   **not** a second store (DP-3 holds).

8. **Ratchet / convention / BFF-only: PASS.** No file > 400 (gate PASS; largest new
   `engine.ts` 359). No inline data that belongs in `data/*.json` — escalation
   policies, manifests, and routing are all JSON; the only in-code arrays are the
   C2 event-type enum and the 3-row autonomy behavior table (both are typed policy
   source-of-truth, not config). **No client component imports the runtime** — grep
   of every `'use client'` file for `@/lib/agents` / `@/lib/agentRuntime` = none;
   the runtime is reached only server-side.

9. **L1: PASS.** `src/lib/agentRuntime/FAKE_FIDELITY.md` exists and names the five
   properties the in-memory fake does not model vs real Temporal. The Docker-guarded
   `tests/integration/agentRuntime.temporal.testcontainers.test.ts` uses
   `describe.skipIf(!HAS_DOCKER)` and logs a skip-with-reason (Docker/Temporal
   absent in this sandbox; runs in CI).

## Verification (authoritative)

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` → **738 passed | 1 expected-fail | 83 skipped** (104 files
  passed, 5 skipped incl. the 5 Temporal specs). +6 over Wave B's 732 (the two
  convergence test files). Nothing prior broke.
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; 75 frozen files unchanged).

## Carried findings (unchanged, documented)

- **`/api/match` no-body-validation** (cycle-3 MEDIUM #5) — the 1 remaining
  `it.fails`. Input-validation finding, not IDOR; deferred.
- **Panel scope enforced but not sourced** (IDOR report) — `getPrincipal` supports
  `panel` scope and the routes enforce it, but no reviewer→panel assignment store
  exists, so production reviewers resolve to `org` scope (preserves today's
  behavior). When the store lands, reviewers are auto-bounded, no route change.
- **`/api/work-queue`** still carries a hardcoded `role:'pa-reviewer'` — a list
  surface with no per-member id, not one of the 2 IDOR findings; principal wiring
  is a mechanically-identical follow-up.
- **F-C2** referral `provider-context.read` over-grant (above).
- **Live-integration-executed count: 0** — the runtime + agents run on the
  in-memory fake; Temporal fidelity is CI-pending (fake-verified here).
