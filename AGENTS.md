# AGENTS.md — Session Entry Map (read this first)

Governing standard: `AI-CODING-CONVENTIONS.md` (v2, repo root). The old conventions
are archived at `docs/archive/AI-CODING-CONVENTIONS.v1.md` and are not current guidance.
This file is capped at 150 lines so it always fits in context. Keep it that way.

## SESSION START — Deploy the Coalition (run this prompt FIRST, every session)

Copy the block below and send it as your first message to the AI agent before any work:

```
RHTP SESSION START — COALITION DEPLOYMENT

You are working on the RHTP platform (rickwill-ibm/RHTP-Code-Base).
Before any code, docs, or config change, confirm the following coalition is active:

BUILD AGENTS (in wave order):
  B0 Orchestrator  — sequences waves; owns the authoritative gate run (never trusts
                     sub-agent self-reports); runs npm run check:all itself before every commit.
  B1 Spine/Architect — one decisive pass before fan-out; ADRs, binding contracts,
                     namespace pre-allocation, golden-path worked example.
  B2 Specialist(s) — N in parallel on DISJOINT trees; one slice each; ships tests
                     with every capability; answers: "what did the spine reserve for me?"
  B3 Convergence   — adversarially reconciles parallel outputs; DRY/NOT-DRY verdict;
                     targets cross-agent assumptions at shared seams.

RED-TEAM PANEL (mandatory after convergence, every iteration — "looks fine" = failed review):
  R1 Domain-Fidelity   — FHIR/HEDIS/CMS-0057-F/Da Vinci/revenue-cycle gaps; 15-30 findings.
  R2 Negative-Space    — what is entirely ABSENT (failure paths, observability, data lifecycle,
                         governance/config, human/workflow roles); 20-35 findings.
  R3 Stub-Legitimacy   — every stub/mock/fake graded Acceptable/Risky/Unacceptable;
                         Unacceptable fixed SAME iteration.
  R4 Engineering       — security (authz bypass, PHI/PII leak, IDOR), concurrency,
                         convention violations; ranked findings with file:line.
  R5 Cross-Examiner    — targets the CLAIMS themselves; UPHOLD or DEMOTE every
                         "done/closed/passing" assertion; "everything upholds" only if
                         each claim was re-checked against live evidence.
  ON-DEMAND Scale      — triggered for substrate/high-throughput iterations only.

REASONING MODE:
  Default: chain-of-thought (linear path for execution tasks).
  Inject tree-of-thought ONLY at: design forks (≥2 viable approaches, high reversal cost),
  red-team hypothesis generation (branch → score → prune → deep-dive survivors),
  ambiguous-requirement forks. Never on mechanical single-path tasks.

PRE-FLIGHT (before any code — mandatory):
  1. Classify the change in one line.
  2. If ANY trigger matches → full coalition required + coalition-log.md entry:
       • change under src/lib/** domain logic
       • new module/file or new capability
       • > 40 changed lines in one module
       • touches a safety invariant (rg "INVARIANT:") or fail-closed default
  3. Read: AGENTS.md → docs/ARCHITECTURE.md → docs/traceability.md → feature README.
  4. Search before assuming: rg "symbolName" src/

GATE (every commit): npm run check:all must exit 0 (tsc 0 · sizes PASS · lint clean · tests green).
Full detail: docs/framework/ (personas.md · coalition-protocol.md · enforcement-kit.md · operating-model.md)
```

## Commands

```bash
npm run dev              # app on http://localhost:4032
npm run check:types      # tsc --noEmit               (must be 0)
npm run check:sizes      # size gate + quality ratchet (must pass)
npm run lint             # next lint                   (clean on changed files)
npm test                 # vitest run                  (all passing)
npx vitest run tests/<domain>   # scoped: only the domain you touched
npm run check:all        # full gate: types -> sizes -> lint -> tests
npm run gate:push        # full local gate before git push
npm run test:contract    # Newman CMS-0057-F contract tests (backbone up)
npm run backbone:up      # HAPI FHIR + services (Docker)
npm run seed:maria       # seed the Maria bundle into HAPI
```

One-time per clone: `git config core.hooksPath tools/hooks` (enables the pre-commit gate).

## Read order for any change

1. This file (and run the SESSION START prompt above).
2. `docs/ARCHITECTURE.md` — layers, security invariants, BFF contract.
3. `docs/traceability.md` — capability without a green test = asserted, not verified.
4. The feature `README.md` of the ONE domain you are changing.
5. `AI-CODING-CONVENTIONS.md` — the rules; §13 is the agent-session discipline.

Search before assuming location: `rg "symbolName" src/`. Grep anchors:
`rg "SEAM:"` (swap points) · `rg "INVARIANT:"` · `rg "CONTRACT:"`.

## Repo map

```
src/lib/<domain>/     pure domain logic (no React/Next imports)
                      types.ts | schema.ts | <name>Engine.ts | ingest/ | data/ | index.ts | README.md
src/lib/server/       server-only (audit, sessions, logging) — never imported by UI
src/components/       presentation only — no business rules
src/app/              Next.js routes; pages are thin, load via /api/* (BFF)
src/app/api/          BFF routes — the ONLY thing the browser calls
tests/<domain>/       one test file per domain module (+ fixtures/ as JSON)
e2e/                  Playwright
fhir/ install/        HAPI FHIR backbone (Docker), seed + install tooling
tools/                seed scripts, contract tests, hooks
docs/                 architecture, traceability, conformance plan, framework, build-provenance, archive/
```

Key domains: `policy/` (engine + 17-policy corpus), `identity/` (match engine),
`consent/` (seam-pattern exemplar), `goldenThread/`, `networkAdequacy/`.

## Hard rules (details in AI-CODING-CONVENTIONS.md)

- New files ≤ 400 lines (tests ≤ 500). Functions ≤ 50 lines. No helpers.ts dumping grounds.
- **Ratchet:** never add code to a file in `quality-baseline.json`. Extract → new module → call it.
- **BFF-only:** browser → /api/* only. No secrets in NEXT_PUBLIC_*. PHI-safe audit events.
- **AI guardrails:** server-side only, deterministic fallback, human-gated, PHI-safe, feature-flagged.
- **Boundaries parsed:** FHIR/X12/QE/LLM output through a zod schema in schema.ts. No `any`.
- **Deterministic engines:** clock/RNG/IO injected via deps. Idempotency keys on mutations.
- One domain / one seam per session. Never mix refactor with feature in one PR.

## Stop and report (do not guess) when

- a symbol expected cannot be found by search;
- a test fails for reasons outside your change;
- your fix requires editing a baselined file or a second domain;
- an interface change would break callers you have not read.

## Definition of done

`npm run check:all` exits 0 · traceability row added for new capabilities · feature README
updated · `coalition-log.md` entry for every triggered change · commit message states what
changed, why, and which invariants/contracts were touched. **No Co-Authored-By or tool
attribution trailers in any commit message.**

## Enforcement gates E1–E16 + coalition gate

Full detail: `docs/framework/enforcement-kit.md`. The `g_coalition` gate in
`scripts/ci-gates.sh` fails any landing on a core-logic path with no new `coalition-log.md`
entry. E11/E13/E14 are wired in `.github/workflows/convention-gates.yml`.
Framework: `docs/framework/` — `personas.md` · `coalition-protocol.md` ·
`enforcement-kit.md` · `operating-model.md` · `SKILL.md`.
