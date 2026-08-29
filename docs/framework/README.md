# Agentic Build Framework

A reusable, project-agnostic framework for building software with a coalition of AI agents — verifying it adversarially and enforcing quality mechanically. Extracted from a large healthcare-platform build; written to apply to any project and any team.

Share this folder with your team. Everything needed to adopt the framework is here.

**Release: v1.8** (see "What's new in v1.8" below; v1.6–v1.7 hardening in `FRAMEWORK_HARDENING.md` + `SKILL.md`). Earlier enhancements (v1.1–v1.5) are retained and summarized further down.

---

## Why this exists (the one problem it solves)

Multi-agent builds fail in a specific, recurring way: the build agents — and even the "cleanup" pass — verify **conformance to the plan**. So a gap the *plan itself* missed (a naive design, a load-bearing stub, an entirely absent capability) ships even though everyone was honest. Only a domain expert or the customer notices, too late.

The framework closes that hole with four layers working together:
1. **Operating model** — how orchestration runs (the wave as the unit of work; rules that make it reliable).
2. **Persona library** — who does the work: build roles plus a **red-team panel** that catches what conformance review cannot.
3. **Enforcement kit** — mechanical gates, because a rule in a document gets skipped under pressure but a rule in CI cannot.
4. **Definition of Done** — the composite gate every increment must pass.

**The single most important habit:** verification attacks three layers, not one — does the code match the spec (conformance), is the spec right against real-world domain practice (domain-fidelity), and what is entirely absent that production needs (negative-space).

---

## What's in this package

```
agentic-build-framework/
  README.md                         <- you are here (team overview + enhancements)
  agentic-build-framework.skill     <- the installable skill (a zip; load it in Claude/Claude Code)
  SKILL.md                          <- the skill's entry document
  ADOPTION_GUIDE.md                 <- step-by-step: install, wire the gates, run the loop
  references/
    operating-model.md              <- the wave, the iteration lifecycle, orchestration rules + build lessons
    personas.md                     <- reusable build + red-team persona cards + the Prompt Composition Standard
    enforcement-kit.md              <- the mechanical gates E1-E15 + the composite Definition of Done
  provenance/                       <- the E11/E13/E14 mechanical kit (reference implementations)
    build_log.py                    <- the single generator that emits the master prompt log (CSV + XLSX)
    check-provenance.sh             <- the E11 mechanical check (fails on a stale, hand-edited, or partial log)
    check-testlink.mjs              <- E13: every substantive new module must be referenced by a test
    check-mutation.mjs              <- E13: sampled mutation runner (do tests actually CATCH a break?)
    mutation-targets.json           <- E13: the critical modules the mutation runner targets
    check-wiring.mjs                <- NEW v1.5: E14 wired-path ratchet (import-graph reachability)
    wiring-baseline.json            <- NEW v1.5: the E14 known-orphan baseline (ratchet burns it down)
    PROVENANCE_GUIDE.md             <- how to stand up a provenance store + the column schema
```

---

## How your team uses it (three moves)

1. **Install** — the `.skill` file loads the framework into a Claude / Claude Code session (auto-triggers on "multi-agent build", "red team review", "harden a codebase", etc.). Full install paths (in-app, org-managed, or a repo-scoped `.claude/skills/` drop) are in `ADOPTION_GUIDE.md`. For team-wide use, commit this folder to a shared repo and distribute the `.skill` through your org.
2. **Wire the gates first** (one-time per repo) — the quality ratchet (E2), the fail-closed seam gate (E1), the fail-open lint (E9), the living risk register (E8), and the provenance store + check (E10/E11, see `provenance/`). These are cheap and are what prevent recurrence. `ADOPTION_GUIDE.md` Part 2 has the exact setup.
3. **Run each iteration as a wave** — brief with a pre-allocated namespace, probe, spine (decisions + contracts + per-agent context manifests), parallel specialists on disjoint trees, convergence to DRY, then the **mandatory red-team panel**, then your own authoritative gate, then the **provenance close-out** (E11), then one sync. `operating-model.md` and `ADOPTION_GUIDE.md` Part 3 walk it.

The red-team panel is not optional, and every persona must produce findings — "looks fine" is a failed review. Findings route to the register: fix the Unacceptable now, schedule the Critical/High.

---

## What's new in v1.8 (this release adds)

The unit-level testing discipline beneath the R1–R5 panel — the layer that gives the mutation gate something worth measuring:

- **Adversarial Testing Lens Kit (`ADVERSARIAL_TESTING_LENSES.md`).** 8 write-time test lenses — precision-not-recall, guards-fail-closed, order-independence, target-contract conformance, round-trip/encoding, no-silent-degradation, claims-enforced, degenerate-inputs — each **derived from a real defect a fully green gate missed**. Applied by the module author before the adversarial panel runs. Reconciled with the existing machinery rather than duplicating it: the lenses feed **E13** (which proves the tests kill mutants) and **R5** (which judges their depth); the finding→regression-lock rule is **E8 + E12 + the Critical-finding protocol**; the testability boundary is **E14** + pure-core/thin-shell; and the build-boot integration complement is already **E16**. Mapped onto R1–R5 in `personas.md`. Validated in-session on freshly-written code (caught 3 author defects before push). Ships a candidate mechanization — a negative-fixture meta-check — registered as **FW-5** in `HW6_BACKLOG_REGISTER.md` (landed green or backlogged, never half-added).

## What's new in v1.5 (this release adds)

Distilled from an adversarial deployment-hardening review aimed at the framework's *own* blind spots — the defects a disciplined multi-agent build still ships:

- **E14 — the WIRED-PATH / integration gate (`provenance/check-wiring.mjs`).** Catches "**unwired realness**": a production-shaped, unit-tested module that no real entry point actually reaches — built and green, but called by nothing but its own tests. This is the single most damaging defect a *disciplined* build produces, because every conformance signal is green. The check builds the static import graph, marks everything reachable from real entry points (routes/pages + middleware), and flags `src/lib` modules reached only by tests. It is a **ratchet** (`wiring-baseline.json` freezes the known backlog; only a *new* orphan fails), so a codebase with wiring debt stays green while it burns it down. Dependency-free.
- **E15 — the seam MOCK↔PRODUCTION PARITY gate.** Every seam's mock and production dispositions must satisfy the same interface and return structurally-equivalent output (values differ; shape and contract do not), proven by a per-seam parity test. This stops a demo from silently misrepresenting production. E1 proves the seam fails closed in production; E15 proves the mock honestly represents it.
- **Lens-completeness doctrine.** A fixed red-team panel guarantees blind spots. The required adversarial lens set is now **derived from the domain's non-functional + regulatory surface** and coverage is proven. Ships a starter regulated/payer taxonomy: security & multi-tenancy, AI-governance, financial-integrity, observability, privacy, DR.
- **Two-tier "done."** A **Definition of READY** up front (an NFR + regulatory manifest — the -ilities the increment must meet, with acceptance criteria — plus a lens-coverage map), and a **Production-READINESS gate** at exit. CI-green is not production-ready; the manifest is verified, not just the functional tests.
- **Program spine (interface-freeze across iterations).** A multi-iteration program maintains a cross-iteration dependency graph, a shared interface registry, and phase gates. Iterations are sequenced by dependency, not severity — a foundational contract (tenancy, an audit spine) is frozen and published *before* the iterations that build on it.
- **Critical-finding protocol.** Every Critical fix must pass N-skeptic verify **+ a mutation-tested regression + a red-team RE-ATTACK** proving the exploit is closed, before E12 accepts it as closed.

## What v1.4 added (retained)

Distilled from a full 11-iteration build - each item fixes a cost we actually paid:

- **Reasoning-mode doctrine (chain-of-thought by default, tree-of-thought at the forks).** CoT is right for execution; but at design decisions, red-team hypothesis generation, and ambiguous-requirement forks - where the wrong single path is expensive to reverse - agents now BRANCH (enumerate approaches, score, prune, proceed on the survivor). ToT is injected at those forks only, never into mechanical single-path work.
- **E13 - the test-effectiveness gate (dependency-free, no Stryker).** Two checks in `provenance/`: `check-testlink.mjs` (every substantive new module must be referenced by a test - catches wholly-untested code) and `check-mutation.mjs` (injects small meaning-changing mutations into critical modules and re-runs their tests; a mutant the tests still pass through is a hole). It measures whether tests would actually CATCH a break, not just that they exist and pass. `mutation-targets.json` names the critical set.
- **E9 shift-left.** The recurring fail-open class becomes a build-time self-check the specialist runs before reporting green, not just a Wave-D sweep - so it is caught by the author, and the red-team is freed to hunt novel defects.
- **Spine interface-freeze.** When one wave consumes another's output, the spine publishes the interface (a stub) before either starts; both code against the stub, never each other's in-flight symbols. Kills cross-wave transient errors and the "downstream wave guessed the adapter" rework.
- **Tighter adversarial loop.** HIGH/Unacceptable findings trigger an immediate in-wave fix; the highest-stakes findings get N-independent-skeptic voting; the R1 lens rotates to the iteration's subject.
- **On-demand Performance/Scale adversary** for substrate/deployment iterations (the fakes hide scale), plus lessons **L10-L12** (checkpoint + checksum-diff sync, locate-don't-recreate, right-size the fan-out).

## What v1.3 added (retained)

**R5 - the Verification / Cross-Examiner adversary** (a fifth red-team persona that hostilely re-reads every prior supported/fixed/closed/green claim and returns uphold/demote) and **E12** (the claim-vs-evidence gate: every closed/supported item must cite a live passing test).

## What's new in v1.2 (the enhancement this release adds)

**E11 — Provenance completeness + maintenance, with tracking + linkage ids.** This came straight from a real failure: the master prompt log had silently gone stale and partial — it started at the *build* phase, so the entire *planning* coalition (including the agent that generated the acceptance-use-case corpus, and the testing agents) was invisible; new iterations landed in code but their rows were never appended; and because rows had been hand-added to the CSV, any regeneration would have erased them. A provenance store nobody can trust is worse than none, because it *looks* complete.

v1.2 turns provenance-maintenance from a manual habit into an enforced step:

- **Single generator, one source of truth.** The log is emitted by ONE script (`provenance/build_log.py`) that owns every row. You never hand-edit the CSV — you edit the generator and re-run it. It emits both the analyzable CSV and a readable, phase-colored XLSX (plus a roster index sheet) in one pass.
- **Every agent, every phase — no phase omitted.** One row per agent invocation across the *whole* build: planning coalition (evidence, spine, specialists, the use-case/acceptance-corpus agent, the planning adversarial reviewer, data/spec authors, finalizer), build waves, testing agents, convergence, and the red-team panels. Fidelity is marked honestly: `live` / `recon` / `pending`.
- **Lineage, including dynamic re-prompts.** Every row carries `depends_on` / `builds_on`. A dynamic re-prompt (a SendMessage continuation or a convergence re-run that feeds findings back to the same agent) is logged as its own row pointing at the row that triggered it — so the multi-turn lineage is visible, not hidden.
- **Tracking + linkage ids on every row:** `trace_id` (a unique, self-describing invocation handle, e.g. `TRC-P-use-case-0008`), `step_id` (a monotonic step-in-sequence key), and `ts` (ISO-8601 timestamp). Timestamps are **deterministic** in the generator (real send-time for live rows; a fixed-anchor synthetic-monotonic value for historical rows) so the log regenerates byte-identically and the check below stays stable.
- **Regenerate + re-sync every iteration** as a Definition-of-Done step — the same close-out discipline as updating the risk register.
- **The mechanical check** (`provenance/check-provenance.sh`) is the "gate over prose" half: it fails CI when the committed CSV doesn't match its generator (catches hand-edits and un-generated iterations), when a verbatim prompt file is orphaned, or when a wave report has no matching log rows. A stale or partial log now turns red like a failing test.

**Definition of Done addition:** an increment is not done unless the provenance is regenerated from its single generator, complete across all phases, lineage + tracking ids set, and re-synced (E11).

---

## What v1.1 added (retained)

- **Prompt Composition Standard** (`personas.md`) — per-agent prompts composed from six stable blocks (ROLE · BRIEF · CONTEXT MANIFEST · SCOPE · DoD · OUTPUT), only SCOPE bespoke; kills boilerplate and structural drift.
- **E9 Fail-open Lint** (`enforcement-kit.md`) — the most recurring red-team finding class (a config/auth/status path returning a plausible value instead of failing closed) promoted to a CI gate.
- **E10 Verbatim Prompt Provenance** (`enforcement-kit.md`) — every agent prompt captured verbatim at send-time; the analyzable log references it, never a lossy summary. (v1.2's E11 is what keeps that log complete and current.)
- **Context manifests + shared-file partitions** (`operating-model.md`) — the spine hands each specialist an exact reads/namespace manifest and pre-declares how parallel agents split any shared file.

Full mechanical gate list is **E1-E15** in `enforcement-kit.md`; the reusable roles and the composition standard are in `personas.md`.

---

## The 30-second pitch for a skeptical teammate

You already review PRs. This adds three things review misses: a **domain expert who looks for what the plan got wrong**, a **skeptic who lists what is entirely missing** (run every iteration, forced to produce findings), and a **provenance trail** — every agent, its exact prompt, its lineage, and a trace id — that stays complete because a check enforces it. Plus **mechanical gates** so the fixes stick (a stub can't masquerade as real, a seam can't fail open, a legacy debt can't grow, a prompt log can't silently rot). It is heavier than a solo build; the payoff is that the expensive, silent gaps get caught by process instead of by your customer.
