# CLAUDE.md

## ⚑ SESSION PRE-FLIGHT — run before ANY code, state it in one visible line

The full framework (below) scrolls out of working memory mid-task. These six are the
checks that keep getting missed; they are non-negotiable and must be **stated visibly**
at the start of a coding action and at close-out, so adherence is auditable:

1. **VERIFY LIVE.** Every claim — mine, a sub-agent's, a doc's, a screenshot's — is a
   *hypothesis* until grep/read-confirmed against the **live working tree on disk**, never
   a stale copy, upload, or baseline. Sub-agents may review an old snapshot; re-verify here.
2. **REUSE FIRST.** Before writing new code, grep for an existing hook / component / store /
   helper and bind to it. A second hook, a duplicate constant, a parallel store = a defect.
   Name the seam you are reusing in the pre-flight line.
3. **DECISION → COALITION + RED-TEAM.** Any multi-screen, architectural, or IA decision runs
   the coalition + R1–R5 adversarial lenses with chain-of-thought AND tree-of-thought, before code.
4. **DoD GATES (E1–E16).** Every change: browser-verified on the running app · relevant
   grep-gate green (e.g. fail-opens = 0) · demo-preservation parity re-walked · quality
   ratchet respected (never add to a file in `quality-baseline.json`) · `check:all` exits 0.
5. **SINGLE SOURCE.** Extend the existing store/registry/engine; never fork a parallel
   context or state mechanism.
6. **VISIBLE PRE-FLIGHT LINE.** Open each coding action with:
   `Pre-flight — live-verified: <what> · reuse: <seam> · gate: <E##/grep> · red-team: <R#>`
   and close with the DoD result. If it isn't stated, it wasn't done.

---

Read `AGENTS.md` first — it is the session entry map (commands, repo map, read order,
hard rules, stop conditions). The governing coding standard is
`AI-CODING-CONVENTIONS.md` (v2) at the repo root; the archived v1 in
`docs/archive/` is not current guidance.

Non-negotiables, restated for every session: BFF-only security invariant · AI
guardrails (server-side, deterministic-first, human-gated, PHI-safe, labelled,
feature-flagged) · quality ratchet (never add code to a file in
`quality-baseline.json`) · `npm run check:all` must exit 0 before a task is done.

Multi-agent / iteration work follows the **Agentic Build Framework v1.7** at
`docs/framework/` — the wave unit, the five-persona red-team (R1-R5 + on-demand
Performance/Scale) with the lens set DERIVED from the iteration's NFR + regulatory surface,
the E1-E16 composite Definition of Done (adds E14 wired-path / integration ratchet and E15
seam mock<->production parity, and E16 build/bundle-resolution gate), a two-tier done (Definition of Ready up front +
Production-Readiness gate at exit), the program spine (interface-freeze across iterations),
chain-of-thought by default with tree-of-thought injected at decision forks, and the
mandatory provenance close-out (`docs/build-provenance/`). See AGENTS.md "Coalition and
iteration work". The E11 (provenance), E13 (test-effectiveness), E14 (wired-path) and E16 (build) gates
run in CI.
