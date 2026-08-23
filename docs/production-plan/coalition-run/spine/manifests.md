# Phase-2 Specialist Context Manifests + Fixed Output Template (Phase-1 Spine)

Purpose (plan §7, gate L): each specialist loads exactly its manifest, nothing more. Context is the scarce resource (conventions v2 §13); loading beyond the manifest burns the window on material another specialist owns. Every specialist output follows the single fixed template in §7 below, capped at a size the finalizer can merge.

Common to ALL five manifests (load first, in this order):
1. `/home/claude/ACE_Production_Gap_Execution_Plan.md` §1.2, §4, §4A, §5, §6, its own §6A pack(s) only.
2. `/home/claude/coalition/spine/` all six files: load-model.md, adrs.md, contracts.md, golden-path.md, trace-matrix.md, this file's §7 template.
3. `/home/claude/coalition/inputs/evidence.md` and `use_case_steps.md` (framing rule).
4. `/home/claude/AI-CODING-CONVENTIONS_v2.md` in full.

Common NOT-load rule: no specialist loads another specialist's direction pack, output, or anchor files, except where its manifest names them. Nobody re-reads the whole diligence tree; the evidence pack is cited, never re-derived.

---

## 1. Graph & Context Architect (G1)

**Load, beyond common:** DP-1 (plus DP-7 for merge/rekey semantics); `src/lib/wholePersonGraphData.ts` (the 804-line anchor: extract its 52-node/67-edge schema and five lens labels as the ontology seed; never extend the file, ratchet rule); C10.2 graph mapping spec format; ADR-001 in full; trace rows 7, 15; golden-path hop 5b; O-3/O-4/O-5 lines in plan §3.1 (view-model discipline for G7 dashboards).
**Do NOT load:** SDE page source, carePlanGenerator sources, pipeline adapter detail beyond §4A, agent material beyond the role-separation sentence in DP-1.
**Design obligations:** per-domain graph mapping specs (all C10 domains that project); lens query interface for C1; rebuild-from-replay proof plan; Part 2 restricted-node handling; D3 screen seam with mock mode retained; file split stated up front (no file >400 lines).

## 2. Pipeline + FHIR Engineering & Validation pair (G3 + X2)

**Load, beyond common:** §4A verbatim (design WITHIN it); C9 in full (the scope boundary: measured against consumer MVRs, never machinery); C2/C6/C10; ADR-002/003/005/006; DP-7; golden-path hops 0..5; `src/lib/consent/providerAccessOptOut.ts` (C3 exemplar to replicate per adapter seam); `src/lib/identity/matchEngine.ts` (the stage-3 engine being wrapped, plus its blocking-key posture from load-model §4); tools/seed layout (what graduates); O-1/O-2 lines in plan §3.1.
**Do NOT load:** graph mapping detail, SDE/agent internals, care-plan sources, adequacy engine internals.
**Design obligations:** per-source adapter specs (834, 837/835, pharmacy, CCD/QE, ADT, screening, referral webhook, CBO flat file), DAG definitions on the container-step contract, quarantine/remediation workflow, per-feed reconciliation thresholds, phased domain-x-tier coverage plan against C9.1, the O-1 evidence-store swap as the first C3 proof. Definition of done: WPC screens render from the record, mock toggle off.

## 3. Agentic Systems Designer (G2 + G4)

**Load, beyond common:** DP-2 + DP-3; the SDE demo page ONLY as its acceptance shape (the "5 approved, 3 suppressed, 1 delayed, one coordinated touchpoint" semantics from evidence.md; do not load the 918-line page source); C2/C6 ordering + traffic classes; ADR-002 (stream + journey lanes); golden-path hops 6..7; goldenThread work-queue and evidence-viewer patterns (the named reuse foundation; load their public surfaces via feature README + types, per conventions §13.2, not implementations); conventions §9/§10 in full (guardrails, manifests, prompts-as-code); trace finding F1 (gap-derivation projector assigned to this scope); O-8 line in plan §3.1; NC_DAP agent-register workbooks noted in phase0 item 1 for G4 library naming.
**Do NOT load:** graph store internals, pipeline adapter specs, care-plan clinical content, IaC material.
**Design obligations:** disposition service (stream lane, policy-as-data, explainable + audited), gap-derivation projector (F1), minimal agent runtime (journey lane, Temporal per ADR-002), three named agents HITL-first with manifests, escalation defaults per DP-3, no second inbox.

## 4. Care Plan pair (G5)

**Load, beyond common:** DP-4; C4 care-planning profiles; the carePlanGenerator debt-register prescription (builder/validator/templates split, from evidence.md; load generator sources only per module as being split, one domain per session); golden-path hop 8; C9.4 care-plan MVR incl the allergy honesty flag; O-7 line in plan §3.1 plus the PA-folder content sources named in phase0 item 3; goldenThread work-queue public surface (review flow reuse).
**Do NOT load:** pipeline, graph, backbone internals beyond the C2 consumption shape; SDE internals beyond the touchpoint hand-off.
**Design obligations:** the DP-4 acceptance oracle (golden fixtures signed by the Medical Expert lens, property invariants, FHIR conformance), test-suite spec for a currently zero-test 1,262-line service, deterministic core with LLM narration on top per guardrails, O-7 content flagged not-SME-reviewed until GB-3.

## 5. Documentation Specialist (X4)

**Load, beyond common:** C8 in full; plan §8 D7 table verbatim; doctrine 9; the existing docs tree file LIST from evidence item 5 (load individual docs only when absorbing them into the register); the 145-vs-223 drift action (plan §3.1 end); trace-matrix findings (they are current-vs-target ledger content).
**Do NOT load:** any source code beyond grep-anchor conventions; other specialists' pack detail (their docs-done entries arrive via the template).
**Design obligations:** `docs/REGISTER.md` per the C8 schema; the authored-now set from verified evidence only; templates + docs-done criteria for every build-gated doc, handed to the other four specialists; no operational fiction (target-state prose never passable as current-state); generatable content never hand-written.

---

## 7. Fixed output template (ALL specialists; sections mandatory, in this order; total output <= ~2,500 lines so the finalizer can merge five)

```markdown
# <Specialist> Output: <gap areas>

## 1. Matrix Row
D1-ready row(s): current state, code evidence (file:line), target architecture,
dependencies. RECONSTRUCTED/REPRESENTATIVE labels carried where applicable.

## 2. Current State Evidence
Citations from evidence.md only. Never re-derived, never contradicted.

## 3. Target Architecture
Design within doctrine + ADRs + own direction pack. Deviations: none permitted;
a needed deviation is an escalation, not a design choice.

## 4. Build Approach and Reuse Map
What is reused (named existing Tier-A code), what is new, in what order.

## 5. File-Level Touchpoints
Proposed file layout under src/lib/<domain>/ per conventions §4; every file under
the 400-line cap; no additions to baseline files; data externalized to data/.

## 6. Golden-Path Participation
Which hops of golden-path.md this design owns; payload-level statement of its
inputs and outputs at each owned hop. A design that cannot state this is
incomplete by definition.

## 7. Contracts Touched
Cn list with the exact touchpoint per contract; grep anchors named.

## 8. Scale Posture
Throughput vs the load model, partition key, idempotency, backpressure,
budget compliance (budgets may not be dropped; re-derivation is spine-only).

## 9. Portability Posture
Protocol dependencies (must be a subset of C7's five); anything else is a defect.

## 10. Convention Compliance
File split stated, BFF route surface, AI-guardrail posture where AI is involved,
determinism (injected clock/RNG/IO), traceability rows, DoD gates as acceptance
criteria, grep anchors.

## 11. Acceptance Tests
Named tests: unit, property (engines), contract (per seam, mock AND real),
dual-mode demo-green additions, eval suites where prompts exist.

## 12. Docs-Done Entries
Register rows (C8 schema) for every epic; build-gated templates referenced.

## 13. Effort S/M/L with Assumptions
Per epic. No week-precision. Each assumption labeled ASSUMPTION.

## 14. Spike Tickets
Named unknowns worth a timeboxed spike, with the question each answers.

## 15. Risks
Ranked; each with the doctrine/contract that mitigates or the escalation it needs.
```
