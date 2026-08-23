# Deploying the Agentic Build Framework — adoption guide

How to put the framework into operation, on this project and on new ones. Three parts: install it (make it loadable), wire it (per-repo mechanical gates), run it (the iteration loop). Then a governance note on the human's role.

## Part 1 — Install the framework (make it loadable in sessions)

The framework is packaged as `agentic-build-framework.skill` (a zip of SKILL.md + references/).

- **In Claude (Cowork / Claude Code):** when the `.skill` file is delivered into a chat, you get an option to save it to your skills, depending on your organization's settings. Once saved, it is available in future sessions and auto-triggers on its keywords (multi-agent build, red team review, adversarial verification, harden a codebase, "what else is missing", agentic engineering process). You can also invoke it explicitly by name.
- **If your org disables in-chat skill save:** an admin adds it through the org skill/marketplace admin flow using the same `.skill` file. Confirm with whoever manages skills for the org.
- **For a brand-new project session:** load the skill at the START of the build session, before the first fan-out, so the personas and gates are in context from the beginning.
- **Team-wide:** commit `docs/framework/` (the unpacked docs) to a shared repo so the methodology is versioned and reviewable, and distribute the `.skill` through the org so every engineer's sessions have it.

## Part 2 — Wire the enforcement gates into a repository (one-time per repo)

The gates are what make the framework stick; a document alone gets skipped. Set these up FIRST on any project — they are cheap and pay off every iteration. On THIS repo they already exist (listed with each item); on a NEW repo, port the pattern.

1. **Quality ratchet (E2).** Add a size/lint script that reads a committed `quality-baseline.json`; CI fails on a NEW violation or growth in a baselined item; regenerate the baseline only in a refactor-only change with `--write-baseline`. (This repo: `check-file-sizes.sh` + `quality-baseline.json`.) Verify with a negative test.
2. **Fail-closed seam gate (E1).** Add a seam-disposition manifest declaring every configurable seam as `real-impl` / `fail-closed-stub` / `mock-only`, plus a governance test that (a) fails if a seam has no declared disposition, (b) proves each fail-closed stub throws in production, (c) proves each real-impl does not fall back to mock, and (d) forbids any dev/mock flag from defaulting on. (This repo: `src/lib/config/seamDispositions.ts` + `tests/governance/seamFailClosed.test.ts` + `noFailOpenDefaults.test.ts`.)
3. **Living risk register (E8).** Add one cumulative register file that every iteration reads at start and updates at end. (This repo: `verification/GAP_AND_STUB_RISK_REGISTER.md`.)
4. **CI wiring.** One workflow runs, per PR: types -> size/ratchet -> lint/boundaries -> unit tests -> governance gates. A pre-commit hook runs the two cheapest (types + size). (This repo: `.github/workflows/convention-gates.yml` + `tools/hooks/pre-commit`.)
5. **Session entry map.** A short `AGENTS.md` (<= 150 lines) at repo root: commands, repo map, read order, hard rules, stop conditions, and a pointer to `docs/framework/`. It is the first thing any agent session reads.
6. **Coding standard.** Adopt a house conventions file (fail-closed seams, feature-first layout, deterministic engines, boundary validation, small files) referenced from `AGENTS.md`.

## Part 3 — Run the iteration loop (every increment)

Each iteration is a sequence of waves; each wave is: probe -> parallel build (disjoint trees) -> convergence -> red-team panel -> orchestrator authoritative gate -> one sync.

1. **Brief.** Write the iteration context: binding governance + the PRE-ALLOCATED namespace (module paths, seam/flag ids, event/type names) + the definition of done + the fidelity/infra reality (fake vs live) + the open register items to pull in.
2. **Probe.** One cheap agent exercises read/write/exec; fan out only on a clean probe.
3. **Spine (if decisions are needed).** Decide, publish contracts, reserve the namespace, author the golden-path example.
4. **Build waves.** 2-4 specialists in parallel on DISJOINT trees, each to the contract + DoD; each ships tests and a fidelity ledger for any fake.
5. **Convergence.** First-class, aimed at cross-agent assumptions, iterate to DRY (< 3 new material defects, all gates pass).
6. **Red-team panel (mandatory).** Spawn the personas from `references/personas.md`: Domain-Fidelity (specialty matched to this iteration's content), Negative-Space (must produce a missing-list), Stub-Legitimacy (grade every stub). Each MUST produce findings. Route them to the register: Unacceptable fixed this iteration; Critical/High to an owning iteration or backlog.
7. **Authoritative gate.** The orchestrator (not a sub-agent) re-runs types + full tests + size/lint + governance gates.
8. **Sync.** One archive to durable storage at the boundary; update the recovery point and the register.

## Part 4 — Governance: the human's role

The framework reduces but does not eliminate the need for a domain-expert human. Your standing responsibilities:
- Approve iteration scope and the gates (what "done" means for this increment).
- Triage the register: confirm the panel's severity calls, decide what is fixed-now vs backlog.
- Provide the domain direction the Domain-Fidelity persona rotates against; when you catch a gap the panel missed, feed it back as a new persona lens so the panel catches that class next time.
- Own the go/no-go on anything gated on external dependencies (infra, SME sign-off, live integration).

## Quick start on a NEW project (checklist)
1. Load the skill. 2. Stand up the enforcement gates (Part 2, items 1-6). 3. Write project direction: the domain, the contracts, the first golden-path example. 4. Pick the Domain-Fidelity specialty for your field. 5. Run iteration 1 as a wave sequence (Part 3). 6. Keep the register from day one.
