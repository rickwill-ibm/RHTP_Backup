# Verbatim agent prompts

The ACTUAL, full prompts sent to each build-time agent — not the condensed `prompt_summary` in PROMPT_MASTER_LOG.csv. Use these to assess and improve prompt engineering. One file per iteration, each holding every agent invocation's exact prompt as sent.

Note on structure: each prompt follows the framework's specialist/red-team persona shape — ROLE, mandatory ordered READS (governance + inputs), the pre-allocated NAMESPACE to claim from, numbered SCOPE, explicit VERIFY gates, a fixed OUTPUT CONTRACT, and STYLE rules. The iteration-level master prompt each inherits is coalition/inputs/iteration-N_context.md (also verbatim, synced to docs/production-plan/coalition-run/).

Known improvement (owner-flagged): per-agent prompts are currently hand-authored per wave. The optimization is to COMPOSE them from the reusable persona cards (docs/framework/references/personas.md) + the iteration brief, so they are consistent and individually tuned rather than re-written each time. Tracked as a framework enhancement.
