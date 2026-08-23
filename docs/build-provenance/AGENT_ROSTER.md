# Complete agent roster (whole session: planning + build)

Every build-time agent that has run, across BOTH phases. The master CSV (PROMPT_MASTER_LOG.csv) began at the build phase (Iteration 0); this roster adds the PLANNING phase that preceded it, so nothing is missing - including the TCOC 70-use-case agent and the testing agents you asked about. For each: role, where its PROMPT lives, where its OUTPUT lives.

Honest note on the gap: the planning coalition (below, Phase P) ran as the original multi-agent Workflow + follow-on direct agent calls that produced the D1-D7 plan package. Its per-agent prompts live in the workflow script/journal and the transcript; its OUTPUTS are the delivered artifacts (all committed). Those prompts were not captured to build-provenance at the time. This roster indexes them; from Iteration 7 on, every prompt is captured verbatim (E10).

---

## PHASE P — Planning coalition (produced the plan package D1-D7, the 70-use-case corpus, the ADRs/contracts)

| # | agent | role | prompt location | output (delivered + committed) |
|---|---|---|---|---|
| P1 | Repo-gate / evidence | Phase-0 probe of the sibling repos + evidence pack | inline (transcript) | coalition/inputs/{phase0_repo_gate,evidence,use_case_steps}.md |
| P2 | SPINE | ADR-001..006, contracts C1..C10, golden path, 16-step trace matrix, per-specialist manifests | Workflow script + SendMessage | coalition/spine/{load-model,adrs,contracts,golden-path,trace-matrix,manifests}.md |
| P3 | Specialist: Graph & Context (G1) | graph projector design, mapping specs, lens queries | Workflow script | coalition/specialists/g1-graph.md |
| P4 | Specialist: Pipeline + FHIR (G3/X2) | 5-stage pipeline, adapters, outbox, validation | Workflow script | coalition/specialists/g3-pipelines.md |
| P5 | Specialist: Agentic (G2/G4) | SDE + agent runtime design | Workflow script | coalition/specialists/g2g4-agentic.md |
| P6 | Specialist: Care Plan (G5) | care-plan hardening + DP-4 oracle design | Workflow script | coalition/specialists/g5-careplan.md |
| P7 | Specialist: Documentation (X4) | D7 doc pack + honesty ledger | Workflow script | coalition/specialists/x4-documentation.md |
| **P8** | **TCOC Use-Case Expert (+ SME panel)** | **devised the 70-use-case verification corpus across 10 specialty lenses (the agent you asked about)** | **inline agent prompt (transcript)** | **coalition/inputs/use_case_corpus.md (70 cases, families A-O)** |
| P9 | Adversarial reviewer (rubric panel) | scored all 5 specialists + cross-cutting findings | Workflow script | coalition/adversarial-verdict.md |
| P10 | Spine amendment (reconvened) | resolved the 3 cross-cutting findings (C1 orphan, ADR-006 atomicity, compliance orphans) | SendMessage (context intact) - a DYNAMIC RE-PROMPT | coalition/spine/amendment-001.md |
| P11 | Data extractor | built the D1 workbook datasets (5 sheets incl. the 70-case trace) | inline agent prompt | coalition/final/sheet1-5.json -> D1_Gap_Matrix.xlsx |
| P12 | Spec author (D4/D5) | load-test spec + deployment config spec | inline agent prompt | coalition/final/D4_load_test_spec.md, D5_deployment_config_spec.md |
| P13 | Finalizer (orchestrator) | assembled + QA'd D1-D7, committed | orchestrator (me) | docs/production-plan/D1-D7 |

## PHASE B — Build iterations (0-8A-i) — these ARE in PROMPT_MASTER_LOG.csv (49 rows)

Testing agents you asked about (all in the master log):
- **Route-test author** (I0 wave 1B) - 107 API route tests (401/403/400/422/200 + PHI-safe).
- **Property-test author** (I0 wave 2A) - ~3000 generated cases; found the blank-field match bug.
- **Corpus-scenario author** (I0 wave 3B) - turned the 70-case corpus into 15 runnable scenario tests + 55 pending.
- **e2e/a11y spec author** (I0 wave 3C) - Playwright walkthrough + dual-mode + axe.
- Plus every build specialist ships its own domain tests, and every convergence/red-team wave verifies them.

Red-team / adversarial agents (see verbatim/red-team-and-adversarial-prompts.md):
- Verification-round 3-persona panel (domain-fidelity, negative-space, stub-legitimacy) - retroactive on I0-4.
- Per-iteration wave-C/D convergence + red-team (I5, I6, I7; 8A-i pending).
- The unacceptable-fix agent + the governance-seam-gate agent.

## Where dynamic re-prompting (lineage) actually happens
Most build agents are single-shot (one composed prompt -> one result). True multi-turn re-prompting lineage exists in:
1. **Convergence re-run loops** - red-team finds a defect -> the same agent is re-prompted with the findings appended -> re-runs (e.g. the original coalition's adversarial -> flagged specialists re-run; the workflow re-run budget).
2. **SendMessage continuations** - reconvening an agent with context intact (P10 spine amendment is the clearest example: initial spine run -> adversarial findings -> SendMessage re-prompt -> amendment-001).
These chains were not logged as lineage; they are being added to the master log's depends_on column and captured verbatim going forward.

## Totals
Planning phase: ~13 agents. Build phase: ~49 agent invocations (master log). The 70-use-case agent = P8; the testing agents = the I0 wave 1B/2A/3B/3C rows + every specialist's own tests.
