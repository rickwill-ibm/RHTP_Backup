# CLAUDE.md

Read `AGENTS.md` first — it is the session entry map (commands, repo map, read order,
hard rules, stop conditions). The governing coding standard is
`AI-CODING-CONVENTIONS.md` (v2) at the repo root; the archived v1 in
`docs/archive/` is not current guidance.

Non-negotiables, restated for every session: BFF-only security invariant · AI
guardrails (server-side, deterministic-first, human-gated, PHI-safe, labelled,
feature-flagged) · quality ratchet (never add code to a file in
`quality-baseline.json`) · `npm run check:all` must exit 0 before a task is done.

Multi-agent / iteration work follows the **Agentic Build Framework v1.4** at
`docs/framework/` — the wave unit, the five-persona red-team (R1-R5 + on-demand
Performance/Scale), the E1-E13 composite Definition of Done, chain-of-thought by default
with tree-of-thought injected at decision forks, and the mandatory provenance close-out
(`docs/build-provenance/`). See AGENTS.md "Coalition and iteration work". The E11
(provenance) and E13 (test-effectiveness) gates run in CI.
