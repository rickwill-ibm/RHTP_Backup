# Coalition Trigger Protocol (Agentic Build Framework v1.7, §13.6)

**Why this exists.** The framework already *recommends* an architect/SWE design pass and
adversarial red-team. Recommendations get skipped under time pressure — "a convention without a
gate is a suggestion." This protocol converts the recommendation into a **mechanical trigger + a
CI gate**, so invoking the coalition is not a judgment call the agent can quietly get wrong.

## 1. Pre-flight classification (the FIRST step of any change)

Before writing code, classify the change in one line and record which agents are required.
This happens up front — surfacing a skip *before* code, not after.

## 2. Trigger table (mechanical — if ANY row matches, the coalition is REQUIRED)

| Trigger | Example |
|---|---|
| Change under `src/lib/**` domain logic | `policy/`, `identity/`, `consent/`, `goldenThread/`, `networkAdequacy/` |
| A new module / new file | a new `*.ts` under `src/lib/**` |
| A new capability | a new engine behavior, gate, or public function |
| > 40 changed lines in one module | non-trivial edit |
| Touches a safety invariant / fail-closed default | `rg "INVARIANT:"`, coverage / eligibility / medical-necessity decisions |

Trivial changes (copy, styling, a one-line config, a doc typo) do **not** trigger it. When in
doubt, trigger — the case-by-case judgment is exactly the unreliable component this removes.

## 3. Required coalition (in order, each logged)

1. **Architect design pass** — model, boundaries, invariants, trade-offs. (`Agent` architect/Plan)
2. **Software-engineer implementation plan** — concrete signatures, file map, test matrix, sequencing.
3. **Adversarial review BEFORE coding** — attack the *design*; NO-GO blocks coding until fixed.
4. **Build** — implement to the hardened design; gate in the mirror (tsc + tests + prettier + eslint).
5. **Adversarial review AFTER coding** — attack the *implementation*; every finding fixed + pinned with a regression test.

Use `Agent`/subagents; capture prompts verbatim per the provenance rule
(`docs/build-provenance/` + `PROMPT_MASTER_LOG.csv`). Inject tree-of-thought at the design and
red-team-hypothesis forks (enumerate → score → prune).

## 4. Definition of Done (artifact requirement — this is what the gate checks)

A change that hit the trigger is **not done** until `docs/build-provenance/coalition-log.md` has an
entry for it: date, scope (files/paths), the architect + SWE design refs, and the adversarial
findings from **both** rounds with their resolution.

## 5. Enforcement

- **Auto-invocation:** this protocol is summarized in `AGENTS.md` (the read-first session entry
  map), so every session pre-flight-classifies before touching core logic.
- **Mechanical gate:** `g_coalition` in `scripts/ci-gates.sh` (push / pre-merge / ci tiers) fails
  any landing whose changed files touch a core-logic path but that carries **no** new
  `coalition-log.md` entry. It cannot prove an agent ran, but it makes a skip *visible and blocking*
  — the same way E11/E13/E14 make missing provenance/tests blocking.

**Honest limit.** No gate can force one agent to invoke another mid-work; gates run at
commit/push. The pre-flight (instruction) is what makes the coalition run up front; the gate is the
backstop that stops a core change from *landing* without the artifacts. Both are needed.
