# Adversarial Testing Lens Kit (added v1.8)

The red-team panel (R1–R5, `personas.md`) finds design- and claim-level defects. This kit is the
**unit-level layer beneath it**: the specific test lenses a per-module author applies so the tests
already have catch-power _before_ the panel runs — and the source of the tests that E13's mutation
gate then measures. Every lens is derived from a real defect that a fully green gate missed.

## Why (grounded in two real build episodes)

1. **The original miss.** The automated gate (tsc · eslint · prettier · vitest) stayed **green**
   while **13 real defects** sat in the code. The gate caught zero; two independent **adversarial
   agent passes** caught all 13, and every fix was locked with a regression test. Root cause: the
   first-pass tests were **recall / happy-path** ("does it extract the codes? yes"). Every defect
   lived where happy-path tests never look.
2. **The kit turned on fresh code (DTR-authoring iteration).** Applying these same lenses to
   just-written code caught **3 of the author's own defects before push**: a substring code-match
   false positive (L1), a generation gate that unlocked on an inconsistent `{approved, no-doc}`
   state (L2), and a silently truncated grounding corpus (L6). Each was regression-locked (suite
   went 185 → 194). Evidence that the lenses are a **write-time** control, not only a review-time one.

## The 8 lenses

Every changed module carrying logic MUST be tested through each applicable lens. A lens with no
test is an open red-team finding, not a pass.

| # | Lens | The defect class it came from | The test rule |
|---|------|-------------------------------|---------------|
| 1 | **Precision, not just recall** | a harvester fabricated a phantom CPT from a prose line starting with a 5-digit number; an assistant matched a code by substring so `436440` resolved to code `4364` | Extractors/parsers/classifiers/matchers get **negative fixtures** — adversarial inputs that MUST yield nothing / route elsewhere — beside the positive ones. Match on whole tokens, not substrings. |
| 2 | **Guards fail closed** | maker/checker approval **failed OPEN** when `submittedBy` was absent; a stage gate unlocked generation on `approved` alone, ignoring an inconsistent no-document state | Every gate/authz/safety check is tested with its *decisive field absent/null/empty/inconsistent* and MUST deny. Never verify a safety property only on the happy path. Pairs with **E9** (fail-open lint). |
| 3 | **Order-independence / determinism** | a coverage-role conflict resolved by input order; an override tie broke by array order; **two suites passed in file order but failed under `--sequence.shuffle` because a `beforeAll`-shared store was mutated by a sibling test** | Merges/dedups/tie-breaks tested with **reversed input → identical output**; ties broken by a stable key (timestamp/id), not position. **The test SUITE is order-independent too:** no `it` relies on state a sibling wrote — a shared `beforeAll` store a later test mutates makes the suite order-coupled; use `beforeEach` (fresh state) or collapse a real sequence into one `it`. Proven by the shuffle gate (below). |
| 4 | **Target-contract conformance** | 100% of generated FHIR `name`s were invalid (slug lowercased); a bundle validator accepted two Questionnaires; a stepper's index drifted from its order array | Artifacts bound to an external schema (FHIR/X12/CQL) or an internal invariant are tested against that contract's **format, identity, and cardinality** (regex/validator), not just "field present." |
| 5 | **Round-trip + encoding** | `base64` silently corrupted non-ASCII CQL (≥, dashes, smart quotes) | Any encode/decode/serialize is **round-trip** tested with non-ASCII, empty, and large inputs, byte-compared to a reference. |
| 6 | **No silent degradation** | a CQL comorbidity band was silently dropped; a grounding corpus silently truncated at a cap | When code cannot fully satisfy an input it MUST emit a **visible signal** (warning/comment/flag), or the bound must be a **documented, tested** limit. A test asserts the signal/limit exists. Silent narrowing is a defect. |
| 7 | **Claims are enforced** | an interface docstring asserted "never PHI" while copying free-text through; a "grounded only in this document" claim with no mechanism stopping off-context citations | Any invariant/safety property asserted in a doc or type is backed by an **enforcing test** (or mechanism), or the claim is softened. No unenforced guarantees. Mechanizes what **R5** judges. |
| 8 | **Degenerate inputs** | empty `policyId` → `urn:...:` canonical; empty/whitespace/all-punctuation titles; empty question / empty context | Every pure function is tested with **empty / whitespace / all-symbol / oversized** input → sane, non-malformed output, no throw. |

## Mapping onto the red-team panel (`personas.md`)

The lenses are the **unit-level manifestation** of the standing panel — the same defect classes,
applied by the author at write-time rather than by an independent adversary after:

- L1 Precision, L8 Degenerate → **R1** (domain-fidelity) / **R4** (engineering correctness)
- L2 Guards-fail-closed, L7 Claims-enforced → **R3** (stub-legitimacy) / **R4** (security-adversary) — pairs with **E9**
- L3 Order-independence → **R4** (determinism/idempotence)
- L4 Target-contract, L5 Round-trip/encoding → **R1** / **R3** (contract/interface)
- L6 No-silent-degradation → **R2** (negative-space) / **R5** (observability/honesty)

## How it plugs into the existing gates (no duplication)

The process discipline around these lenses is **already** framework machinery — this kit points at
it, it does not re-add it:

- **Finding → regression-lock.** A confirmed lens finding is not "fixed" until a test that
  **fails-before / passes-after** is committed — enforced by **E8** (living risk register) + **E12**
  (claim-vs-evidence) + the **Critical-finding protocol** (mutation-tested regression for Criticals).
- **The tests these lenses produce are exactly what E13 measures.** The lenses tell you _which_
  adversarial tests to write; **E13** (test-effectiveness / mutation sampling) proves they kill
  mutants; **R5** judges whether the surviving assertion is deep enough. Lens kit → E13 → R5 is one
  chain: author-intent, mechanical catch-power, human depth.
- **Testability boundary.** Risky logic lives in **pure, framework-free, gate-tested modules**;
  UI/route/DB shells stay thin. Logic exercisable only through a shell is itself a finding — enforced
  by **E14** (wired-path) + the pure-core/thin-shell architecture. (In the DTR-authoring iteration,
  every one of the three caught defects was catchable precisely because the logic was pure; the React
  shells carried no logic to test.)
- **Build + boot smoke — the gate-invisible class.** Lenses 1–8 are unit-level: necessary, **not
  sufficient**. A ChunkLoadError / edge-bundling regression lives only in the assembled, running app,
  where no unit test can see it. That integration-level complement is **already landed as E16**
  (build / bundle-resolution gate) + its runtime-boundary convention. Both tiers are required.

## Test-suite isolation — the shuffle gate (added v1.9, grounded in two real episodes)

L3 covers the *code* being order-independent; this covers the *test suite* being
order-independent. Same failure mode one level up — and it hid for a whole build session.

**The anti-pattern (recognize it on sight).** A `describe` whose `beforeAll` builds ONE shared
mutable store (a graph, an outbox, a ledger), then several `it`s where at least one **writes** to
that store and another **asserts an exact count or absence** over it:

```
beforeAll → build ONE shared graph/outbox         ← shared, mutable, built once
  it "1. …absent from the graph"      expects 0   ← assumes the store is pristine
  it "2+3. …projects the node"        writes +1   ← mutates the SAME shared store
```

In file order (1→2) it passes; the shuffle gate runs `--sequence.shuffle`, reorders *within* the
file, runs the writer first, and the reader sees the polluted store.

**The two real episodes (v1.9):**
- `tests/wpc/remediationReprocess.test.ts` — `expected [ Condition ] to have length 0 but got 1`
  (the remediation test projected the Condition test 1 asserted was absent).
- `tests/wpc/streamEvent.test.ts` — `expected 'stream' to be 'batch'` (later tests streamed extra
  events into the shared outbox; the "batch events" test counted them as batch rows).

Both fixed by `beforeAll → beforeEach` (fresh store per test). **Do NOT** blanket-convert suites
that load once and only *read* (e.g. `wpcRecordLoad*`) — that re-does expensive setup for no
isolation gain. The smell is specifically **shared `beforeAll` state + a test that writes it**.

**Why it stayed invisible — and the gap now closed.** The shuffled run lives only in the
`pre-merge` / `ci` tiers, NOT in `pre-commit` or the per-chunk `gate:push`. So every push check was
green while CI's `ci` tier (random shuffle seed) went red. Closed by pointing the **`pre-push`
hook at the `pre-merge` tier** (`tools/hooks/pre-push`), so the isolation run happens locally,
attributable to the change that introduced it, before the network.

**Detect / reproduce.** `npm run test:shuffle` (or `npm run gate:pre-merge`) locally; to reproduce
a specific CI failure deterministically, `npx vitest run --sequence.shuffle --sequence.seed=<N>`
and sweep a handful of seeds — CI picks a *random* seed each run, so one green seed is not proof.

## Optional mechanization (candidate gate — backlogged, not landed)

A **negative-fixture meta-check** (registered as **FW-5 / E17-candidate** in
`HW6_BACKLOG_REGISTER.md`): for each module tagged `// LENS:extractor` or `// LENS:validator`,
assert its test file contains at least one negative/reject case. Cheap; catches the recall-only
anti-pattern mechanically. Per E-gate discipline it is **landed green or registered** — never
half-added — so it is a backlog item until its script ships green.

## No-regression note

Additive only. This kit extends R1–R5 and E9/E12/E13/E14/E16 — it removes or weakens nothing. It is
a **v1.8 hardening increment**: the missing write-time discipline that gives E13's mutation gate
something worth measuring.
