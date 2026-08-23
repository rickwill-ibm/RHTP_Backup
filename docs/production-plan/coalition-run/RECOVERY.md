# Coalition run — recovery point

Session: https://claude.ai/code/session_012AprHBLhnSAqALLKg6AcgJ
Governing plan: ACE_Production_Gap_Execution_Plan.md v11 (committed at Finalrhtpdemo/docs/production-plan/), gates A–L approved 2026-08-21.

## Active run
- Workflow run ID: `wf_8f8b1cfc-66e` (task wugsfbdkw)
- Script: `/root/.claude/projects/-home-claude/4907ae5f-8abe-5abb-ad72-b2e90427a1bf/workflows/scripts/ace-gap-coalition-wf_8f8b1cfc-66e.js`
- Journal: `.../subagents/workflows/wf_8f8b1cfc-66e/journal.jsonl` (records every agent's return)
- Resume in-session: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_8f8b1cfc-66e"})` — completed agents return cached; only unfinished work re-runs.

## State at last checkpoint
- Phase 0 complete: findings in `inputs/phase0_repo_gate.md` (one-repo topology; WSO2 ref-impl = Tier-B source; PA folder = O-7 content; providernet_analytics = O-3 port source; xlsx lost to compaction — 16 steps RECONSTRUCTED in `inputs/use_case_steps.md`).
- Phase 1 spine: running. Outputs land in `spine/` (load-model, adrs, contracts, golden-path, trace-matrix, manifests).
- Phases 2–3 pending: specialists write to `specialists/` (g1-graph, g3-pipelines, g2g4-agentic, g5-careplan, x4-documentation); adversarial verdict JSON in workflow return.
- Phase 4 (finalizer): builds D1–D7 from those files; deliverables to `Finalrhtpdemo/docs/production-plan/`.

## Rebuild-from-zero procedure (cloud container lost entirely)
1. New session: reconnect the five folders; the plan v11 + this file live on disk under `docs/production-plan/` — they are the spec.
2. Re-stage the code subset (tar `src tests tools package.json tsconfig.json vitest.config.ts` from Finalrhtpdemo to the cloud; run `npm install vitest@4 typescript @types/node`; `npx vitest run` must show 223/223).
3. Re-run the coalition per plan §7 using `coalition-run/inputs/*` as Phase-0 inputs (skip re-probing); any spine/specialist .md files already present under `coalition-run/` are completed checkpoints — reuse, do not regenerate.

## Status update 2026-08-22 (run complete)

The coalition run finished: D1-D7 delivered and written to docs/production-plan/. Spine amendment-001 is embedded in D2_ADRs.md. Plan updated to v12 (retrospective rules R1-R10, iteration queue). Next: Iteration 0 hardening per plan section 12, pending owner go.
