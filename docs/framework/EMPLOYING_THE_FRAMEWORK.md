# Employing the Agentic Build Framework

This repo ships with the **Agentic Build Framework** (v1.7). Two parts make it work:

- **The methodology** — how you drive a coalition of agents + a red-team panel + reasoning
  discipline. Lives in `AGENTS.md`, `AI-CODING-CONVENTIONS.md`, and `docs/framework/`
  (`SKILL.md`, `personas.md`, `operating-model.md`, `enforcement-kit.md`).
- **The enforcement** — the mechanical gates that make it stick: `scripts/ci-gates.sh`,
  the git hooks in `tools/hooks/`, and CI `.github/workflows/convention-gates.yml`.

The enforcement is **tool-agnostic** — it binds every developer and every agent equally.
Only *loading the methodology into your agent's context* differs by tool.

---

## One-time setup — every developer, any tool

```bash
# EVERYONE: you already have the repo. From the repo root, run just this:
npm install        # runs "prepare" -> enables the pre-commit + pre-push hooks
```

Only for a **brand-new machine that does not have the repo yet** — run the clone from an
EMPTY parent directory (e.g. `cd ~/code` first), never from inside an existing checkout,
or you will nest a second copy inside your working tree:

```bash
git clone https://github.com/rickwill-ibm/RHTP-Code-Base.git
cd RHTP-Code-Base
npm install
```

That enables the pre-commit and pre-push hooks. From now on:
- **pre-commit** auto-formats staged code + runs the fast size/ratchet gate.
- **pre-push** runs `scripts/ci-gates.sh push` (types, sizes+ratchet, lint, unit,
  wiring E14, provenance E11, page-boundaries, skill-mirror).
- **CI** runs `scripts/ci-gates.sh ci` on every PR — adds mutation E13 and the
  **E16 build gate** (`next build`).

Before you push, run the same gate the CI will run:

```bash
npm run gate:push     # the fast+push tiers
npm run build         # E16 — the production build MUST be green
```

Definition of Done (identical for everyone): `gate:push` green, `next build` green,
the red-team panel ran, provenance updated. "A convention without a gate is a
suggestion" — the methodology guides, the gate enforces.

---

## 1) Claude users (Claude Code / Cowork)

The framework **auto-loads — nothing to paste:**

1. Open the repo. Claude reads `CLAUDE.md` -> `AGENTS.md` (the session entry map:
   commands, repo map, read order, hard rules, stop conditions).
2. The project skill at `.claude/skills/agentic-build-framework/` is auto-discovered.
   It triggers on keywords (**multi-agent build, agent coalition, red team review,
   adversarial verification, harden a codebase, "what else is missing"**), or invoke
   it by name.
3. For any multi-agent / hardening / iteration work, tell Claude:
   *"Follow the Agentic Build Framework."* It loads `docs/framework/` and runs the wave:
   probe -> parallel build (disjoint trees) -> convergence -> **red-team panel (R1-R5)** ->
   orchestrator authoritative gate -> provenance close-out.
4. Let Claude run `npm run gate:push` and `npm run build` as its Definition of Done
   before it proposes commits.

Nothing to install beyond `npm install`. The methodology travels with the repo.

---

## 2) IBM Bob users

Bob does not auto-read `CLAUDE.md` or `.claude/skills/`, so **load the methodology
once at the start of a session:**

1. Point Bob at these files (or paste their contents into the session):
   - `AGENTS.md` — the entry map (commands, repo map, hard rules, stop conditions).
   - `AI-CODING-CONVENTIONS.md` — the coding standard (small files, seams, boundaries,
     determinism, the quality ratchet, the runtime-boundary rule).
   - `docs/framework/SKILL.md` + `personas.md` + `operating-model.md` +
     `enforcement-kit.md` — the wave, the R1-R5 red-team personas, and the E1-E16 gates.
   - Or hand Bob the packaged skill `docs/framework/agentic-build-framework.skill`
     (a zip of the same files).
   - If your Bob setup supports a repo instruction file, `AGENTS.md` is the one to wire
     in (it is the cross-tool entry map).
2. Instruct Bob to work in **waves** and to **run the red-team panel** before reporting
   done — the panel is what catches the gaps conformance review misses.
3. **Enforcement is identical.** Bob's code passes through the same `tools/hooks`
   pre-commit/pre-push and the same CI gate. A gate does not care who (or what) wrote the
   code — a change that breaks the build, grows a frozen file, or leaves an orphan module
   fails regardless of tool. Run `npm run gate:push` + `npm run build` before pushing,
   same as everyone.

---

## What the gate checks (so you know what "green" means)

| Gate | What it catches | Tier |
|------|-----------------|------|
| types | `tsc --noEmit` errors | fast |
| sizes + ratchet | new/growing over-cap **code** files (`.ts/.tsx/.js/.jsx` in src/tests/e2e only; data/docs/generated exempt) | fast |
| lint | eslint on changed files | fast |
| page-boundaries | useSearchParams without a Suspense/loading boundary; heavy Node-only import in `src/app` not externalized; Node builtin in a client/edge file | fast |
| skill-mirror | `.claude/skills` drifted from `docs/framework` | fast |
| test-link E13 | new code with no test link | fast |
| unit / wiring E14 / provenance E11 | failing tests; unwired modules; stale provenance | push |
| mutation E13 | tests that do not actually catch a break | ci |
| **build E16** | `next build` fails (edge/bundle resolution, prerender) | ci |

Run `npm run gate:fast` (seconds), `npm run gate:push` (~1 min), or `npm run gate:ci`
(minutes, incl. build) depending on how far along you are.
