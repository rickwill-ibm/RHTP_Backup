# Iteration 16 — HW-AI: AI governance (tier-independent human-decision invariant)

Phase 1 (closes the phase) · program-spine contract **C-DEC** · framework v1.5 · constraints #1–#3.

## Definition of Ready
- NFR/regulatory manifest: no coverage-affecting/ADVERSE action resolves without a qualified human,
  regardless of autonomy tier (kills HOTL SLA-timeout auto-approve + autonomous-tier flip); every
  adverse decision carries complete provenance (fired rule+version + member-facing reason + appeal);
  demo-neutral; PHI-safe.
- Lens-coverage: AI-governance (owning), domain-fidelity (adverse-determination law), negative-space
  (which action types are adverse), stub-legitimacy (invariant enforced at a real entry point).
- Consumes: C-DEMO, C-TEN, C-STORE, C-AUD. Freezes for downstream: **C-DEC** — HW-FIN (adverse
  financial actions) and HW4 (agents acting on real data) resolve through this gate.

## What landed (all real, WIRED, gated) — the 3-Crit AI-governance finding
- `src/lib/agents/governance/decisionGate.ts` — `isAdverseCoverageAction` (denial/termination/
  reduction/revoke classification), `isQualifiedHumanDecision` (an `autonomy:*`/`system` decider is
  NOT a human), `evaluateDecision` (tier-independent: adverse → human-only), `isAutoApprovable`
  (false for every adverse action on every tier).
- `src/lib/agents/governance/decisionProvenance.ts` — `buildDecisionProvenance` (inputs + fired
  rule/version + member-facing reason + appeal ref) + `isAdverseProvenanceComplete`.
- **Runtime wired** — `src/lib/agentRuntime/engine.ts`: the auto-approve branch now gates on
  `isAutoApprovable(action, tier)`; an adverse action is forced onto the human-required path (no
  auto-approve timer), regardless of HITL/HOTL/autonomous.
- **Real entry point** — `src/app/api/pa/decision/route.ts` (POST, reviewer authz, audited): records
  a coverage decision, enforces the invariant (adverse → 403 without a qualified human; 422 without
  complete provenance), returns the provenance. The decider is the AUTHENTICATED principal, never the body.
- Tests: `tests/agents/governance/decisionGate.test.ts` (6) — classification, tier-independence on
  all three tiers, block-without-human, provenance completeness.

## Proof of wiring (the ratchet SHRANK)
E14: entries **227→228** (the decision route), reachable **546→554**, lib orphans **134→130** — the
decision route pulled the governance modules AND 4 previously-orphaned agentRuntime modules into a
wired path. `wiring-baseline.json` re-frozen at **130** to lock in the improvement (those modules can
no longer regress to orphaned). 54 agent/runtime tests pass (favorable auto-approvals unaffected).

## Gate results
tsc 0 · governance 6 + agent/runtime 54 tests pass · E14 130/130 (orphans −4, reachable +8) ·
demo-preservation 26 pass · FHIR passthrough 7 pass.

## Phase 1 status
HW0 · HW-SEC · HW1(core) · HW2(core) · HW-AI complete → the plan's **safe-to-pilot** core: demo
gate, tenant isolation, wired projection, tamper-evident audit, and the AI-accountability invariant
are all in place and gated. Remaining HW-AI breadth (pre-deploy eval gate, fairness/disparate-impact
monitoring, model/prompt versioning+drift+rollback) is scheduled follow-on.
