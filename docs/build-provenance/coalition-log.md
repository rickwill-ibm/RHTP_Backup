# Coalition Log

Append-only record of the architect + SWE + adversarial coalition run for each core-logic change,
per `docs/framework/coalition-protocol.md`. Enforced by `g_coalition` in `scripts/ci-gates.sh`:
a landing that touches a core-logic path with no new entry here FAILS the gate.

Newest first. One entry per qualifying change.

---

## 2026-08-29 — Encoding-review code ROUTING (honest per-code signal, no fabricated disposition)

**Scope (core-logic paths):** `src/lib/policy/review/codeRouting.ts` (new), `src/lib/policy/review/encodingReview.ts` (additive `routing?` field on `ReviewElementInput`), `src/lib/policy/review/fromPolicyReview.ts` (wire `routing` through the procedure elements + `CodingMapContribution`). UI consumer: `src/components/policy/EncodingReviewPanel.tsx` (grouping only).

**Trigger:** core `src/lib/policy/review/**` change + new module + a coverage/medical-necessity-adjacent surface (procedure-code disposition). Coalition mandatory.

**Problem:** the review screen showed every procedure code with the identical generic "Assign coverage role (covered / not-covered / investigational)" line — no signal. Root cause: `deterministicCodingMap` deliberately proposes no role (it "cannot invent coverage decisions"); the AI coding-map path is unconfigured in the demo.

**Architect design pass:** rather than propose a disposition, derive a *routing hint* — WHERE each code's evidence sits — from the one honest, provenance-anchored structural signal (`review.notMedicallyNecessary[]`). Codes named (word-boundary) in an exclusion/investigational statement route `excluded` with the statement as provenance + a `classifyBasis` basis; all others route `assign`. Additive model field; `deterministicCodingMap` left byte-identical (its defect pins stay green); UI groups the queue by routing so it isn't a wall of identical rows, stating the "assign role" instruction once per group.

**Adversarial BEFORE coding (payer-UM SME + encoding specialist — NO-GO on the first design, then revised):**
- The ORIGINAL proposal (auto-label each code "Covered · PA required" from code-in-guideline membership) was **NO-GO**: the extractor's `guidelineCodes` is a flat, context-free harvest, so "member of the covered set" does not exist as data; asserting coverage would be a fabricated determination, would anchor the maker (automation bias), and — by replacing the blocking `verify` flag — would let codes silently leave review via `bulkAcceptCleanExplicit` / the 60% `canSubmit`. "PA applies ⇐ policy has criteria" was also rejected (gold-carding, statutory carve-outs, site-of-service, benefit exclusion).
- Design revised to meet the adversarial's conditional-GO: routing NEVER sets `role`; every routed code `requiresAssignment: true` and keeps its blocking flag (cannot be bulk-accepted); fail-safe to `assign` on any missing/ambiguous signal; no PA assertion; `excluded` only from an explicit negation/exclusion statement, carrying that statement as provenance.

**Adversarial AFTER coding (INVARIANTs pinned as tests):** `tests/policy/codeRouting.test.ts` (8 tests) pins: excluded routing carries provenance + basis and never a `role`; word-boundary matching (43644 ≠ 436440/143644); a non-negation prose mention does NOT route excluded; benefit-exclusion vs investigational basis; empty inputs → `{}`; every routed code `requiresAssignment`. INVARIANT comments in `codeRouting.ts` mark the fail-safe and no-coverage-decision rules.

**Result:** mirror gate green — 363 tests pass (355 prior + 8 new), prettier + size ratchet clean, app compiles (`next dev`). Delivered to device.

**Honest limit:** for a policy whose codes are all in the coding list with no per-code exclusion statements, all codes route `assign` (one group) — differentiation appears only where the policy itself distinguishes codes. Richer per-code dispositions require the AI coding-map path (endpoint + key), which stays out of scope here. Full `PROMPT_MASTER_LOG.csv` provenance rows to be appended in the provenance close-out.

---

## 2026-08-28 — Clinical measure encoder: enterprise hardening

**Scope (core-logic paths):** `src/lib/policy/encode/{measure,measureScan,dimensions,dimensionResolve,encode,evaluate,fhir,time,ir,index}.ts`, `src/lib/policy/review/{fromPolicyReview,encodingReview}.ts`.

**Trigger:** core `src/lib/policy/**` change + new modules + new capability + touches fail-closed
defaults and a medical-necessity/eligibility decision. Coalition mandatory.

**Architect design pass:** field↔unit↔range dimension registry; clause-scoped field resolution
(field noun resolved at sentence scope, operator/value/unit in a tight local window); band-aware
parsing (ranges never shattered); fail-safe range gate (flag, never silent-drop); local polarity
detection; multi-measure per criterion wired through evaluate + FHIR + review.

**SWE implementation plan:** modular layout to keep every file ≤ 400 lines (`dimensions.ts`
registry split from `measure.ts`); back-compat shims (`parseScalarMeasure`/`encodeMeasure`) so the
existing suite stays green; explicit preserved-test list; per-defect regression pins.

**Adversarial BEFORE coding (two lenses — NO-GO):**
- Engineering/regression: silent range-drops flip eval outcomes; `measures[0]` reordering breaks the
  range tests; compound-BP regresses to scalar; threshold-variant attaches to the wrong field;
  half-wired multi-measure = false coverage. → design revised (bands-first, compound-BP preserved,
  flag-not-drop range gate, variant-by-field, multi-measure fully wired).
- Clinical/extraction: comma-clamped windows drop the modal "BMI, …, of at least 40 kg/m²"; the "or"
  clamp kills "40 or greater"; per-comparator scan shatters "35 to 39.9"; polarity inversion on
  "not medically necessary". → clause-scoped field resolution + postfix-atomic + bands-first + polarity flag.

**Adversarial AFTER coding (post-implementation — NO-GO, then fixed + pinned):**
- CRITICAL: `negatedLocally` was a dead flag → an exclusion evaluated as a positive eligibility gate
  (false approval). Fixed: encode raises a reviewFlag so it can never auto-approve. Pinned.
- HIGH: phantom same-field measure → duplicate FHIR linkId. Fixed: unit-owner precedence + same-field
  dedupe + index-based linkIds. Pinned.
- MEDIUM: compound BP bypassed the range gate. Fixed: routed through the gate. Pinned.
- LOW: word-numerals > twenty dropped silently. Fixed: extended + flag on unresolved. Pinned.

**Result:** mirror gate green — tsc clean, 355 tests, prettier + eslint clean. Delivered to device;
size ratchet passes. Tests: `tests/encode/measure.{registry,hardened,defects}.test.ts`,
`tests/policy/encodingReview.test.ts`.

**Note:** this entry is retroactive — the coalition was run before this protocol existed; logging it
here both records it and seeds the log the `g_coalition` gate now requires.
