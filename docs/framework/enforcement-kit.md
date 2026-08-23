# Enforcement Kit (project-agnostic)

Gates over prose. A rule that lives only in a document gets skipped under pressure; a rule wired into CI or a test cannot be. Each pattern below is the mechanical form of a lesson learned the hard way. Adopt the gate, not just the principle.

## E1 — Fail-closed seam gate (prevents load-bearing stubs from masquerading)
Problem it prevents: a stub that fails OPEN (returns a plausible value in production), masquerades as the real thing, or is dead wiring (a "production" seam no caller actually selects). This class ships silently and is only caught by manual audit.
The gate:
- A seam-disposition manifest declares, for EVERY configurable seam, its production disposition: `real-impl` (a real production implementation is wired), `fail-closed-stub` (production throws a NotConfiguredError until wired), or `mock-only` (a demo-only seam, inert in production).
- A governance test enumerates every seam actually used in the code and asserts each has a manifest entry — so a NEW seam with no declared disposition FAILS CI. This forces every future seam to declare fail-closed vs real.
- For each `fail-closed-stub`: the test drives its production path unconfigured and asserts it THROWS (never returns a value).
- For each `real-impl`: the test asserts production does NOT fall back to the mock/in-memory implementation (the dead-wiring class).
- A companion test asserts no dev/mock/fallback flag defaults to ON, and that such a flag cannot be active when real infrastructure is configured.
Adoption: one manifest file + two test files. The house rule becomes: a new seam either uses the fail-closed NotConfigured pattern or the gate goes red.

## E2 — Quality ratchet (prevents regression on legacy debt without blocking new work)
Problem it prevents: a mid-project standard that would fail thousands of pre-existing lines, so it gets ignored.
The gate: a committed baseline records today's violation set (file sizes, `any` counts, etc.). CI fails only on a NEW violation or GROWTH in a baselined item. The baseline may only shrink, and only in a refactor-only change. New code is always fully compliant; legacy is frozen, not fixed, until deliberately remediated.
Adoption: a size/lint script that reads a `quality-baseline.json`; regenerate only with `--write-baseline` in a refactor-only PR. Verify the gate with a negative test (grow a frozen file, confirm CI fails).

## E3 — Namespace pre-allocation + pinning test (prevents parallel-agent collisions and drift)
Problem it prevents: parallel agents cannot see each other's registrations, so two invent the same id, or one id is spelled differently across the code / a manifest / a routing table and drifts silently.
The gate: the spine reserves ids up front (module paths, seam/flag ids, event/type names) in the iteration context. A pinning test asserts all SURFACES that reference an id agree (the code constant, the manifest entry, the registry, the routing table). Reserving is necessary but not sufficient — the pinning test is what catches the multi-surface drift.
Adoption: a reserved-namespace table in the iteration brief + a `namespaceIntegrity` test updated as each domain/component lands.

## E4 — DRY convergence loop (prevents "cleanup" from being skipped or shallow)
Problem it prevents: treating convergence as optional polish, when it is where the material defects actually surface.
The gate: convergence is a first-class, budgeted wave every iteration, and it repeats until a full re-sweep finds fewer than 3 new material defects AND all gates pass (DRY). Two consecutive clean-enough sweeps end it. Its explicit target is cross-agent assumptions.
Adoption: a convergence wave in every iteration template with a DRY/NOT-DRY verdict as a required output.

## E5 — Authoritative gate owned by the orchestrator (prevents trusting self-reported green)
Problem it prevents: a sub-agent reports "all tests pass" but ran a stale or partial suite; six agents each report green but their merge is red.
The gate: the orchestrator (not any sub-agent) runs the single authoritative type-check + full test suite + size/lint gate after every wave and before every sync. An agent's self-report is a hint, never the truth.
Adoption: an orchestrator checklist; never advance a phase on a sub-agent's word.

## E6 — Artifact-existence verification (prevents phantom completion)
Problem it prevents: an agent reports success while a harness fault meant zero files were written.
The gate: an agent's "done" is accepted only when its named output files exist on disk with plausible content. A cheap harness PROBE runs before every fan-out (one agent exercises read/write/exec); fan-out proceeds only on a clean probe.
Adoption: a probe step + a file-existence check at each phase boundary.

## E7 — Two progress numbers (prevents "tests green" from implying "production-proven")
Problem it prevents: a high passing-test count that is mostly against fakes, read as production-readiness.
The gate: always report BOTH (a) tests passing and (b) count of components whose LIVE-integration spec has actually executed against real infrastructure. When (b) is 0, that is the honest maturity ceiling. Fakes carry a fidelity ledger naming what they do not model, and the live spec is a required (if deferred) CI gate for exactly those properties.
Adoption: a two-number line in every status report + a `FAKE_FIDELITY.md` per fake + Docker-guarded integration specs that skip-with-reason.

## E8 — Living risk register (prevents findings from evaporating)
Problem it prevents: a review finds gaps that are acknowledged and then forgotten.
The gate: one cumulative register (Gap & Stub Risk Register). Every red-team finding lands there with a disposition: Unacceptable = fixed this iteration; Critical/High = owning iteration or backlog; Med = revisit. Every iteration READS it (open Criticals get pulled in) and UPDATES it (new findings, closed items). It is both an input and an exit artifact.
Adoption: a single register file, reviewed at iteration start and updated at iteration end.

## E9 — Fail-open lint (prevents the recurring highest-severity finding class)
Problem it prevents: fail-open defaults — a config/mode/auth path that returns a plausible value instead of failing closed. This class recurred across three separate red-team passes (a validator defaulting open, a dev-auth flag defaulting on, an X12 code defaulting to "active"), each caught by hand. A recurring finding class that a review keeps catching is a candidate for a gate.
The gate: a lint/test that flags the fail-open shapes — a `?? <default>` or `|| <default>` on a config/mode/auth/status value, a `catch` that neither rethrows nor logs, and any dev/mock/fallback flag whose default is on. Each hit must be justified inline or it fails CI. Pairs with E1 (E1 proves seams throw in production; E9 catches the fail-open shape before it reaches a seam).
Adoption: an eslint rule or a grep-based CI check over `src/`, with an allowlist for genuinely-safe defaults. Promote it the moment the red-team catches the same class twice. SHIFT-LEFT (v1.4): run this as a BUILD-TIME self-check each specialist performs before reporting green — not only as a Wave-D sweep — so the fail-open is caught by the author, not re-found by convergence. The recurrence of this class across iterations (Part 2, identity anchor, deployment config, governance masquerade) is exactly why it belongs at build time.

## E10 — Verbatim prompt provenance (prevents lossy prompt records)
Problem it prevents: logging a SUMMARY of each agent prompt instead of the prompt itself, so the actual instruction cannot be reviewed or improved. A summary hides exactly the structure a prompt-quality review needs.
The gate: every per-agent prompt is captured VERBATIM at send-time to a provenance store (build-provenance/verbatim/), and the master prompt log references the verbatim file rather than restating a condensed version. The master log carries tracking + linkage ids and metadata — `trace_id` (unique, self-describing agent-invocation handle), `step_id` (monotonic step-in-sequence key), `ts` (ISO-8601 timestamp: real send-time for live rows, deterministic synthetic-monotonic for historical rows so the log regenerates byte-identically), plus seq, iteration, wave, phase, role, domain, and the `depends_on`/`builds_on` chain; the verbatim store carries the exact text. Never let the analyzable log's prompt field be a lossy summary. Timestamps must be deterministic in the generator (never `now()`), or the E11 regeneration check can never be byte-stable.
Adoption: a per-iteration verbatim file appended as each agent is invoked; the master CSV's prompt column points to it. Composed prompts (persona standard) make this cheap because the reusable blocks are stable and only SCOPE varies.

## E11 — Provenance completeness + maintenance (prevents the log going stale or partial)
Problem it prevents: the master log silently drifting out of date or covering only part of the build. Real failure modes seen: the log started at the BUILD phase so the entire PLANNING coalition (including the use-case agent that generated the acceptance corpus, and the testing agents) was invisible; new iterations landed in code but their rows were never appended; the log was hand-edited so a regeneration would have erased hand-added rows. A provenance store nobody can trust is worse than none, because it looks complete.
The gate — four rules, checked at every iteration close, not left to habit:
1. **Single generator, one source of truth.** The master log is emitted by ONE generator script (e.g. `build_log.py`) that owns every row. Never hand-append to the CSV/XLSX — a hand-edit is lost on the next regeneration. To add rows, edit the generator and re-run it. The generator emits both the analyzable CSV and the readable XLSX in one pass.
2. **Every agent, every phase — no phase omitted.** One row per agent INVOCATION across the WHOLE build: planning coalition (evidence, spine, every specialist, the use-case/acceptance-corpus agent, the planning adversarial reviewer, data/spec authors, finalizer), build waves, the testing agents, convergence, and the red-team/adversarial panels. A phase that ran but has no rows is a failed gate. Mark fidelity honestly: `live` (captured as it ran), `recon` (reconstructed faithfully — metadata exact, prompt condensed, for agents that predate this rule), `pending` (scheduled, not yet executed).
3. **Lineage set, including dynamic re-prompts.** Every row carries `depends_on` (and `builds_on` where it crosses iterations). Single-shot agents chain probe→build→converge; a DYNAMIC RE-PROMPT (a SendMessage continuation or a convergence re-run that feeds findings back to the same agent) is logged as its own row whose `depends_on` points at the row that triggered it, so the multi-turn lineage is visible rather than hidden.
4. **Regenerate and re-sync every iteration.** Appending the iteration's rows (probe + every build wave + convergence + red-team, plus any planning agents not yet captured), regenerating the CSV/XLSX, and syncing them to the repo is part of the iteration's DoD — the same close-out step as updating the register. The log is stale the moment an iteration closes without it.
Mechanical check (promote from habit to gate): a `check-provenance.sh` that fails CI when (a) the CSV was hand-edited since the last generator run (generator output != committed file), (b) an `ITER*_REPORT.md` / wave report exists for an iteration that has no corresponding log rows, or (c) a `verbatim/` file exists with no row pointing to it. This is the E11 analogue of E9's fail-open lint: the log drifted twice, so it becomes a check.
Adoption: keep the generator in the provenance store; run it and the check at every iteration close; treat a red/partial log exactly like a failing test.

## E12 — Claim-vs-evidence check (prevents a "closed" that nothing proves) — added v1.3
Problem it prevents: a register finding marked CLOSED, or a conformance capability marked supported, that no live passing test actually substantiates — the "closed on a stub" / "shallow-green" failure the R5 cross-examiner hunts by judgment. A gate makes it mechanical.
The gate: every item marked CLOSED (risk register) or supported (conformance matrix) must cite a test id (file + name) that EXISTS and passes in the current suite. A check parses the register/matrix for such items, resolves each cited test id against the actual test files + a green run, and FAILS when a closed/supported item cites no test, cites a non-existent test, or cites a test that does not run green. Pairs with R5 (E12 mechanizes the claim-vs-evidence half of the cross-examination; R5 still judges whether the cited test is deep enough).
Adoption: a `check-claims.sh` (or a test) run at iteration close and in CI; a closed item with no live evidence fails exactly like a broken build. Promote it the moment a "closed" is found resting on nothing.

## E13 — Test-effectiveness gate (measures catch-power, not test count) — added v1.4
Problem it prevents: mistaking test PRESENCE for test EFFECTIVENESS. "1500 tests passing" says nothing about whether a test would actually FAIL if the code were broken - a test that asserts a mock's own return value, or only the happy path, is green and worthless. Counting tests, and even coverage, can hide this; the R5 cross-examiner judges it by eye, but a machine should measure it.
The gate — two dependency-free checks (no Stryker, no coverage provider required):
1. **New-code test-link** (`check-testlink.mjs`): every substantive new/changed source module must be referenced by at least one test file. Catches the blunt failure - new code that ships with NO test at all. Barrels, pure type/data files, and templates are exempt.
2. **Mutation sampling** (`check-mutation.mjs`): for a set of CRITICAL modules, inject small meaning-changing mutations one at a time (flip a comparison, negate a boolean, swap `&&`/`||`, invert `===`/`!==`, toggle `true`/`false`) and re-run that module's tests. A mutant the tests still pass through SURVIVED - a real hole; a mutant that makes a test fail was KILLED - the tests have catch-power. Sampled (a bounded number of mutants per file, scoped test command) so it is cheap enough to run at every iteration close. The file is always restored, killed or survived.
Optional add-on when the team has it: real changed-line coverage via a vitest/istanbul provider - higher fidelity, but NOT required, because the two checks above are dependency-free and mutation is the truer effectiveness signal.
Adoption: keep both scripts in the provenance kit with a `mutation-targets.json` naming the critical modules; run them at iteration close and in CI. A survivor is fixed by STRENGTHENING the test (add the missing assertion), never by deleting the mutant. Pairs with R5 (E13 measures; R5 judges whether the surviving assertion is deep enough) and R6-if-adopted.

## Definition of Done (the composite gate every increment must pass)
- Types clean, full test suite green (orchestrator-run, E5), size/ratchet gate pass (E2).
- Every new file within limits, feature-first, deterministic (clock/rng injected), fail-closed seams declared (E1).
- Namespace pinned (E3); convergence DRY (E4); harness probe was clean and artifacts exist (E6).
- Two progress numbers reported; fakes carry fidelity ledgers (E7).
- Red-team panel ran; register updated; zero new Unacceptable stubs (E8 + panel).
- No fail-open shapes introduced (E9); every per-agent prompt captured verbatim (E10).
- **Provenance regenerated from its single generator, complete across all phases, lineage set, and re-synced (E11) — the master log is never left stale or hand-edited.**
- **The five-persona red-team panel ran including R5 (cross-examiner); every new/changed CLOSED or supported claim cites a live passing test (E12); R5 demotions are routed back to their true status.**
- **Test-effectiveness proven (E13): new modules are test-linked, and the critical-module mutation sample was fully killed (a survivor is a failed gate, fixed by strengthening the test).**
- **The recurring fail-open class was run as a build-time self-check before review (E9 shift-left), not deferred to the sweep.**
- One sync per boundary; recovery point current; a labeled backup precedes an XL/irreversible iteration (L10).
