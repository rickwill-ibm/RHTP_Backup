# AGENTS.md — Session Entry Map (read this first)

Governing standard: `AI-CODING-CONVENTIONS.md` (v2, repo root). The old conventions
are archived at `docs/archive/AI-CODING-CONVENTIONS.v1.md` and are not current guidance.
This file is capped at 150 lines so it always fits in context. Keep it that way.

## Commands

```bash
npm run dev              # app on http://localhost:4029
npm run check:types      # tsc --noEmit               (must be 0)
npm run check:sizes      # size gate + quality ratchet (must pass)
npm run lint             # next lint                   (clean on changed files)
npm test                 # vitest run                  (all passing)
npx vitest run tests/<domain>   # scoped: only the domain you touched
npm run check:all        # full gate: types -> sizes -> lint -> tests
npm run test:contract    # Newman CMS-0057-F contract tests (backbone up)
npm run test:e2e         # Playwright
npm run backbone:up      # HAPI FHIR + services (Docker)
npm run seed:maria       # seed the Maria bundle into HAPI
```

One-time per clone: `git config core.hooksPath tools/hooks` (enables the pre-commit gate).

## Read order for any change

1. This file.
2. `docs/ARCHITECTURE.md` — layers, security invariants, BFF contract.
3. `docs/traceability.md` — capability without a green test = asserted, not verified.
4. The feature `README.md` of the ONE domain you are changing.
5. `AI-CODING-CONVENTIONS.md` — the rules; §13 is the agent-session discipline.

Search before assuming location: `rg "symbolName" src/`. Grep anchors:
`rg "SEAM:"` (swap points) · `rg "INVARIANT:"` · `rg "CONTRACT:"`.

## Pre-flight: Coalition Trigger (MANDATORY — do this FIRST, not a judgment call)

Before writing code, CLASSIFY the change in one line. If it hits ANY trigger, the
architect + software-engineer + adversarial COALITION is REQUIRED:

- a change under `src/lib/**` domain logic (esp. `policy/ identity/ consent/ goldenThread/`), OR
- a NEW module/file, a NEW capability, or > 40 changed lines in one module, OR
- anything touching a safety invariant (`rg "INVARIANT:"`), a fail-closed default, or a
  coverage / eligibility / medical-necessity decision.

Order: architect design → SWE plan → adversarial BEFORE coding → build → adversarial AFTER
coding (each via `Agent`/subagents; log prompts per the provenance rule). Default to the
coalition — do NOT decide case-by-case. A core change is NOT DONE without an entry in
`docs/build-provenance/coalition-log.md` (detail: `docs/framework/coalition-protocol.md`).
Enforced by `g_coalition` in `scripts/ci-gates.sh` — a core change with no log entry FAILS the gate.

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
`consent/` (seam-pattern exemplar — copy this shape), `goldenThread/`,
`networkAdequacy/`, `services/carePlanGenerator*` (legacy, frozen — see ratchet).

## Hard rules (details in AI-CODING-CONVENTIONS.md)

- New files ≤ 400 lines (tests ≤ 500). Functions ≤ 50 lines. No helpers.ts dumping grounds.
- **Ratchet:** never add code to a file listed in `quality-baseline.json`. Extract to a
  new module and call it from the legacy file. The baseline may only shrink, and only
  in refactor-only PRs (`bash check-file-sizes.sh --write-baseline`).
- **BFF-only:** browser -> /api/* only. No secrets in NEXT_PUBLIC_*. PHI-safe audit
  events on privileged actions.
- **AI guardrails:** model calls server-side only, deterministic fallback, human-gated,
  PHI-safe payloads, labelled decision-support, feature-flagged.
- **Boundaries are parsed:** external payloads (FHIR, X12, QE, LLM output) go through
  a zod schema in the domain's schema.ts. No `any` in new code.
- **Deterministic engines:** clock/RNG/IO injected via deps. Idempotency keys on mutations.
- **Prompts are code:** versioned files with eval fixtures, never inline strings.
- One domain / one seam per session. Never mix refactor with feature in one PR.

## Stop and report (do not guess) when

- a symbol you expected cannot be found by search;
- a test fails for reasons outside your change;
- your fix requires editing a baselined (over-cap) file or a second domain;
- an interface change would break callers you have not read.

## Definition of done

`npm run check:all` exits 0 · traceability row added for new capabilities · feature
README updated · commit message says what changed, why, and which invariants/contracts
were touched.

**Commit messages carry NO co-authoring or tool-attribution trailers** — no
`Co-Authored-By:` line, no "Generated with", no assistant/tool name anywhere in the
message. The message describes the change; authorship is the committer. This applies to
every commit an agent proposes or a human runs from an agent's suggestion.

## Coalition and iteration work — governed by the Agentic Build Framework v1.7

ANY multi-agent build, hardening, or iteration work on this platform MUST load and follow
the **Agentic Build Framework v1.7** at `docs/framework/` (`SKILL.md` + `personas.md` +
`enforcement-kit.md` + `operating-model.md`). Read it before orchestrating agents. Essentials:

- **Wave unit:** probe -> spine (publish the inter-wave INTERFACE first — interface-freeze)
  -> parallel specialists on disjoint trees -> convergence to DRY -> the FIVE-persona
  red-team panel (R1 domain-fidelity, R2 negative-space, R3 stub-legitimacy, R4 governance,
  R5 cross-examiner; + the on-demand Performance/Scale adversary for substrate/scale work)
  -> the orchestrator's OWN authoritative gate -> provenance close-out -> one sync. The
  required adversarial LENS SET is DERIVED from the iteration's NFR + regulatory surface
  (lens-completeness doctrine), not a fixed panel.
- **Composite Definition of Done = E1-E16** (enforcement-kit.md): fail-closed seams (E1),
  quality ratchet (E2), namespace + shared-file partitions (E3), DRY convergence (E4),
  authoritative gate (E5), artifact-existence probe (E6), fidelity ledgers (E7), living
  risk register (E8), fail-open lint run at BUILD TIME not just review (E9 shift-left),
  verbatim prompts (E10), provenance completeness `docs/build-provenance/check-provenance.sh`
  (E11), claim-vs-evidence (E12), test-effectiveness `docs/build-provenance/check-testlink.mjs`
  + `check-mutation.mjs` on the critical set (E13), WIRED-PATH / integration ratchet
  `docs/build-provenance/check-wiring.mjs` — no unit-tested-but-unreachable module, new
  orphans fail against `wiring-baseline.json` (E14), and the seam MOCK<->PRODUCTION PARITY
  gate — mock and production dispositions are shape-equivalent (E15), and the BUILD / BUNDLE-RESOLUTION gate - the real `next build` passes so no Node-only module bled into an edge/client bundle (E16, ci tier).
- **Two-tier done (v1.5):** open each iteration with a Definition of READY (an NFR +
  regulatory manifest with acceptance criteria + a lens-coverage map); close with a
  Production-READINESS gate that VERIFIES that manifest — CI-green is not production-ready.
  Every CRITICAL fix passes the critical-finding protocol (N-skeptic verify + mutation-tested
  regression + a red-team RE-ATTACK proving the exploit is closed) before E12 accepts it.
- **Program spine (v1.5):** a multi-iteration program keeps a cross-iteration dependency
  graph + shared interface registry + phase gates; sequence iterations by DEPENDENCY, not
  severity — freeze and publish a foundational contract (tenancy, audit spine) BEFORE the
  iterations that build on it.
- **Reasoning mode:** chain-of-thought by default; INJECT tree-of-thought at design /
  red-team-hypothesis / ambiguity forks (enumerate -> score -> prune -> proceed). Not on
  mechanical single-path tasks.
- **Provenance is mandatory:** every agent invocation is a row in
  `docs/build-provenance/PROMPT_MASTER_LOG.csv` (regenerate via `build_log.py`);
  `check-provenance.sh` must pass; per-agent prompts captured verbatim under `verbatim/`.

The framework's E11/E13/E14 checks are wired into CI (`.github/workflows/convention-gates.yml`).
The `docs/production-plan/ACE_Production_Gap_Execution_Plan.md` remains the binding DOMAIN /
governance plan (record model, ADRs, contracts, risk register); the framework above
SUPERSEDES its generic orchestration guidance (the former "R1-R10 in section 11") with the
v1.7 wave + E1-E16 model.
