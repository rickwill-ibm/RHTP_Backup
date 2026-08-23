# Iteration 6 — coalition prompt log (care-team + workflow domains)

Build-time coalition prompts for Iteration 6, logged for review of agent sophistication and to improve future generation instructions. NOT product code. Record moved 7/20 -> 11/20; 1038 tests green, DRY. Each entry: role, the task prompt (condensed faithfully), inputs, output, gate outcome, and REVIEW NOTES (the prompt-quality reflection that feeds docs/framework).

Governing brief for the whole iteration: `coalition/inputs/iteration6_context.md` (synced to docs/production-plan/coalition-run/). That file is the iteration's master prompt; the per-agent prompts below inherit it.

---

## A0 — Probe (harness health)
Role: harness probe (framework E6).
Prompt (condensed): node check; confirm _TEMPLATE.md, careteam.ts, idempotency, namespace test exist; list current C9 domain ids; find the 834 adapter; write .iter6probe.
Output: node ok; 4 files present; 8 C9 domains found; 834 path confirmed.
Gate: clean -> fan-out authorized.
REVIEW NOTES: good — the probe doubled as a scope check (it surfaced that care-team already existed as a graph node), which prevented a duplicate-domain assumption in wave A. Keep pairing the probe with a light scope enumeration.

## A1 — Wave A specialist (care-team + goals/tasks)
Role: domain specialist (framework B2), disjoint tree.
Prompt (condensed): build care-team and goals-tasks domains THROUGH the L7 template; EXTEND the existing careteam graph mapping (do not duplicate or break the I2 lens); reserve names from the pinned namespace; register in both registries; update the namespace pinning test; tests per domain (normalization, projection, lens read, C9 tier); do not touch wave B / 834 / idempotency.
Inputs: iteration6_context.md, _TEMPLATE.md, medication reference, existing careteam.ts.
Output: 2 domains T1; careteam lens preserved byte-for-byte in a dedicated branch; matches() widened to claim care-team.*; 28 tests; namespace pins moved to a compliant companion file to respect the 500-line ratchet cap.
Gate: green on its own surface; a transient cross-wave tsc red on the shared namespace file (both waves split it concurrently) cleared when wave B finished.
REVIEW NOTES: the explicit "EXTEND, do not duplicate, keep the I2 lens green" instruction worked — the agent preserved the demo path exactly. LESSON for future prompts: when two parallel agents must both edit a SHARED file (the namespace test), the brief should pre-declare HOW they partition it (e.g. per-wave companion files) so the split is designed, not improvised mid-run. This is an L3 refinement: pre-allocate not just names but shared-file partitions.

## A2 — Wave B specialist (referrals + immunizations)
Role: domain specialist (framework B2), disjoint tree.
Prompt (condensed): build referrals (ServiceRequest) and immunizations (CVX Immunization) THROUGH the template; keep provider/performer refs RAW and flagged deferred-I8A (do not invent NPI/NPPES); dated edges; register both; pin both; tests per domain.
Inputs: same template + reference.
Output: 2 domains T1; provider refs kept opaque with providerResolution: deferred-I8A; 27 tests; own companion namespace-pin file mirroring wave A.
Gate: green (1030 passed after merge).
REVIEW NOTES: the "do not invent provider identity, flag deferred" instruction is exactly the honesty guardrail that prevents a future masquerading-stub finding — this is the fix for the class the owner caught earlier, now baked into the prompt. Keep this pattern for every domain that references an unresolved entity.

## C1 — Wave C (register fold-ins + convergence + red-team panel)
Role: convergence engineer (B3) + red-team panel host (R1/R2/R3).
Prompt (condensed): fix the idempotency-reuse HIGH (guard dead-letter retry/replay with the NS-04 primitive) and the 834 INS-3 termination CRITICAL (add-vs-term-vs-cancel + DTP*349, unknown code fails closed); converge to DRY; then run the mandatory red-team panel (domain-fidelity care-coordination+eligibility lens, negative-space, stub-legitimacy), every persona must produce findings; fix Unacceptable now; update the register.
Output: both fold-ins fixed + tested; convergence clean; red-team produced 5 (R1) + 7 (R2) + 3 (R3) findings; found and fixed 1 Unacceptable (a latent 834 `?? '021'` fail-open defaulting unknown maintenance codes to active); DRY.
Gate: tsc 0; 1038 passed; governance 31 passed; ratchet PASS.
REVIEW NOTES: the red-team panel caught a fail-open the build+convergence missed AGAIN (the 834 default) — third iteration running where the panel is the control that finds the load-bearing defect. This validates making it mandatory. LESSON: the panel prompt should explicitly instruct a "fail-open sweep" as a named check (rg for `?? <default>` and silent catches), since fail-open is the recurring highest-severity class. Consider promoting that to a mechanical lint rule (candidate E9).

---

## Iteration-level prompt-quality takeaways (feed to docs/framework)
1. Pre-allocate SHARED-FILE partitions, not just names (L3 refinement) — two parallel agents editing one test file should be told how to split it.
2. The "keep the unresolved entity raw + flag deferred" instruction is the durable fix for masquerading stubs; make it a standard clause for any domain referencing an unresolved entity.
3. Fail-open is the recurring top-severity finding class; add an explicit fail-open sweep to the red-team prompt and evaluate a mechanical lint (candidate enforcement E9).
4. Pairing the probe with a scope enumeration prevented a duplicate-domain assumption; keep it.
