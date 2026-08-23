# Iteration 20 — HW5: Test-hardening + defect-weeding + named go-live gates

Phase 3 · framework v1.5 (E13 self-improvement) · constraints #1–#3.

## Definition of Ready
- NFR manifest: the hardening-critical modules must have PROVEN test catch-power (not just presence);
  the E13 mutation tool must be accurate; the non-code go-live gates must be named (not discovered late).
- Lens-coverage: test-effectiveness (owning), engineering (tool correctness), completeness-critic
  (what's untested/unnamed).
- Consumes: every prior contract (the modules under test). Freezes: the expanded E13 target set.

## What landed (all real, gated)
### A real bug fixed in the E13 tool itself (found by dogfooding)
- `check-mutation.mjs` used operator strings as REGEX: `new RegExp('||')` is an empty alternation that
  matches **zero-width at every position** — 2,120 bogus "sites" per file. Most became syntax errors
  (falsely "killed"); ones landing inside string literals survived harmlessly (false "gaps"). **Fixed**
  by regex-escaping literal operators (`opRegex`) + masking string/generic interiors (`maskNonCode`).
- Added `mut-equiv` markers for PROVABLY-equivalent mutants (a guarded `x > 9` where x is always even;
  comparisons under an `x !== y` guard; a loop bound whose extra iteration is a no-op) — the standard
  way real mutation tools handle unkillable equivalent mutants, each with a written justification.

### E13 mutation coverage expanded to the hardening-critical set (T-03) — all genuine 100%
`mutation-targets.json` now covers 9 modules. The fixed tool surfaced REAL test gaps, each closed by
STRENGTHENING the test (never deleting the mutant):
| Module | before → after | gap the fixed tool found |
|--------|----------------|--------------------------|
| security/tenant/authz | 100% | (already strong) |
| agents/governance/decisionGate | 75% → 100% | non-adverse auto-resolve branch untested |
| server/auditLedger | 83% → 100% | canonicalization key-order-independence untested |
| lifecycle/recordLifecycle | 67% → 100% | resurrect-from-void correction + retract flags untested |
| finance/riskAdjustment/meat | 33% → 100% | MEAT is an OR (any single element); icd whitespace |
| measures/deqmIngest | 100% | (already strong) |
| terminology/validateCode/membership | 67% → 100% | current-vs-prior version branch untested |
| identity/provider/npi | 100% | 1 equivalent mutant marked |
| identity/survivorship/goldenRecord | — | 3 equivalent mutants marked (guarded comparisons) |

### Named non-code go-live gates
- `docs/framework/GO_LIVE_GATES.md` — pen-test, SOC 2 Type II, HITRUST/ISO, tested DR drill, threat
  model + PIA, FHIR conformance accreditation (Inferno/Touchstone/IHE), CMS-0057-F attestation, load/
  soak — each with owner + lead time, and what the code side already delivered so each can RUN.

## Gate results
tsc 0 · **E13 mutation gate PASSES across all 9 targets** (every sampled mutant killed) · 50
strengthened/new tests pass · E14 122/122 · demo-preservation 26 pass.

## Scope honesty — remaining HW5 breadth (follow-on)
Delivered the test-effectiveness core + the tool fix + named gates. Remaining HW5 items — contract/
Inferno/Newman wired into CI, real-Postgres testcontainer concurrency, executing the D4 load/soak,
property/fuzz on the Part 2 segmenter + X12/FHIR parsers, chaos/failure-injection — are scheduled
(they need live infra or are net-new harnesses); GO_LIVE_GATES.md names them.
