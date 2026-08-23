# Build Provenance — coalition agent prompt log

## What this is (and is NOT)
This folder is a REVIEW ARTIFACT, not product code. It records the prompts given to the build-time coalition agents (the sub-agents that WROTE the platform code), so the sophistication and accuracy of those agents can be reviewed and the generation instructions improved over time. It is the audit trail of HOW the code was produced, kept deliberately OUTSIDE `src/` so it is never confused with the product's own runtime prompts (which, when they exist, live at `src/lib/<domain>/prompts/` per convention).

Two distinct layers, do not conflate:
- BUILD-TIME coalition prompts (logged HERE): the instructions the orchestrator gives each specialist / convergence / red-team agent to produce the code. Ephemeral to the build, valuable as a record for improving future prompting.
- RUNTIME product prompts (NOT here; not built yet): prompts the shipped platform's own agents would send an LLM. Those are deterministic today (no LLM), so none exist; when built they live under `src/`.

## Why keep it
- Review the agents' level of sophistication and accuracy per task.
- Improve future generation/guidance instructions (this feeds docs/framework, especially the persona library).
- Reproducibility and audit: what instruction produced which code, and did it hold up under the red-team panel.

## Placement rationale
`docs/build-provenance/` — a docs subtree, clearly labeled, alongside `docs/framework` (the reusable methodology) and `docs/production-plan` (the plan). Never under `src/`, `tests/`, or any path a build tool scans, so it cannot be mistaken for code or tests.

## Format
One file per iteration: `iteration-N-prompts.md`. Each agent invocation is one entry: role/persona, the task prompt (faithful, lightly condensed for readability), inputs it was given, a summary of what it produced, the gate/verdict outcome, and REVIEW NOTES (a prompt-quality reflection — what the prompt did well, what a future version should tighten). The review notes are the point: they are where prompt-engineering lessons accumulate.

## The master log (for longitudinal analysis)
- **PROMPT_MASTER_LOG.csv** and **.xlsx** — ONE row per build-time agent invocation across ALL iterations (0-6), columnar for analysis. Columns: seq (global longitudinal order), iteration, wave, phase, depends_on (the traceability chain — prior seq numbers this invocation consumed), builds_on (functional cross-iteration linkage), agent_role/label, workstream_domain, prompt_summary, key_inputs, output_summary, gate_result, findings, fidelity (live vs recon), review_note.
- To trace the chain: sort by `seq`, then follow `depends_on` backward to reconstruct exactly how the agents interacted across the whole build (e.g. iter6 red-team <- iter6 builds <- iter6 probe <- iter5 close <- ... <- iter0 probe). The xlsx has autofilter + frozen header; filter by phase to isolate all red-team runs, by workstream_domain to see one domain's history, or by iteration to see one increment's flow.
- fidelity column: rows marked `recon` are reconstructed faithfully from iteration summaries + wave reports (metadata accurate, prompt condensed); `live` rows were logged as they ran.

## Index (per-iteration narrative logs)
- iteration-6-prompts.md — care-team + workflow domains (first iteration logged live, with review notes).
- Future iterations append both a narrative `iteration-N-prompts.md` AND rows to the master CSV/xlsx.
- Earlier iterations (0-5) narrative detail lives in the session transcript + the ITERATION*_SUMMARY.md and wave reports; the master log carries their metadata rows.
