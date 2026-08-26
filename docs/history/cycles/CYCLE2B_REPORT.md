# Cycle 2B — Care-Plan Hardening Report

Engineer: care-plan hardening (Medical Expert lens + engineering lens), Iteration 0 / Cycle 2.
Scope: extract the frozen `src/lib/services/carePlanGenerator*.ts` files into `src/lib/carePlan/`
(builder / validator / templates per the debt register), stand up the DP-4 acceptance oracle
(golden fixtures + property invariants), add minimal honest citation support and a FHIR
projection. Behavior preserved except two additive/consent-safe hardening changes noted below.
Design reference: `/home/claude/coalition/specialists/g5-careplan.md` (Target Architecture §3,
oracle §3.2, test suite §11), followed where it fits the code reality of this pass.

## 1. Extraction map (old file → new modules)

| Legacy file (frozen, shrink-only) | Before | After | Logic moved to |
|---|---:|---:|---|
| `src/lib/services/carePlanGenerator.ts` | 257 | 12 | `carePlan/builder.ts` (entry point, sharing, impact), `carePlan/templates.ts` (title/summary/addresses), `carePlan/holistic.ts` (holistic entry) |
| `src/lib/services/carePlanGenerator.helpers.ts` | 330 | 14 | `carePlan/analysis.ts` (patient analysis), `carePlan/assignment.ts` (goal-intervention assignment), `carePlan/referrals.ts` (auto-referrals) |
| `src/lib/services/carePlanGenerator.goals.ts` | 348 | 10 | `carePlan/builder.ts` (goal/intervention generation), `carePlan/templates.ts` (modality rules, gap-category intervention templates), `carePlan/careTeam.ts` |
| `src/lib/services/carePlanGenerator.holistic.ts` | 273 | 12 | `carePlan/holistic.ts`, `carePlan/careTeam.ts` |
| `src/lib/services/carePlanGenerator.types.ts` | 61 | 18 | `carePlan/types.ts` |
| **Total legacy** | **1,269** | **66** | **−1,203 lines (−95%)** |

All five legacy files are now thin delegates re-exporting from `@/lib/carePlan` (public
surface only, conventions §4). The four UI callers (`md-smart-launch` panels,
`care-plan-monitor` page, `patient-detail/CarePlanForm`) import the unchanged stable names
`generateComprehensiveCarePlan`, `generateHolisticCarePlan`, `type GeneratedCarePlan` from the
unchanged path — verified by rg before extraction and by `tests/carePlan/delegates.test.ts`.

### New module `src/lib/carePlan/` (every file ≤ 400 lines)

| File | Lines | Role |
|---|---:|---|
| `types.ts` | 107 | Domain shapes (one place) + new `GuidelineCitation` / `PlanCitationIndex` / `SdohSummary`; `clinicalData` narrowed `any` → `unknown` |
| `analysis.ts` | 191 | Input → `PatientAnalysis` (priority, SDOH needs, specialties, urgent actions) |
| `builder.ts` | 348 | Goal/intervention generation, consent-checked sharing, impact, `generateComprehensiveCarePlan` |
| `assignment.ts` | 88 | Goal↔intervention assignment with the P1 backfill backstop |
| `templates.ts` | 292 | Content layer: gap categories, intervention templates, modality rules, plan text, financial constants |
| `citations.ts` | 119 | Citation index from `data/guidelineSources.json`; deterministic post-hoc classifiers |
| `careTeam.ts` | 149 | Care-team assembly (comprehensive + holistic) |
| `referrals.ts` | 97 | Auto-referral creation (persona-free ids; store mutation preserved, marked) |
| `holistic.ts` | 301 | Holistic path + conversion to standard shape; logged fallback |
| `validator.ts` | 115 | DP-4 invariants as pure checks + honest data-limitation flags |
| `fhirMappers.ts` | 102 | `GeneratedCarePlan` → FHIR `CarePlan`/`Goal` (structural R4, draft status, never throws) |
| `index.ts` | 89 | Public surface, re-exports only |
| `README.md` | 77 | Conventions §13.2 template |
| `data/guidelineSources.json` | 74 | Guideline registry — `reviewLevel: reference-level`, `smeReviewed: false`, GB-3 pending |

## 2. Acceptance oracle — golden fixtures (`tests/carePlan/fixtures/*.json`)

Six member-context fixtures, each with an expected-characteristics assertion set (structural
truths — goal ordering, modality substitution, sharing scope, referral routing — never
byte-exact snapshots). Every header carries
`"clinicalReview": "medical-lens drafted, SME sign-off pending (GB-3)"`, asserted by the suite.

1. `diabetes-transportation` — diabetes HCC + HbA1c gap + transportation barrier: barrier-first
   SDOH goal ordering; at-home lab kit + telehealth substitution; Endocrinology routing;
   no Health-Plan share below the revenue threshold.
2. `bh-part2` — PHQ-9 gap with 42 CFR Part 2-protected SUD context noted: portal-based digital
   screening; asserts NO external FHIR / health-plan sharing occurs (structurally safe output;
   the fixture documents — not disproves — the consent-blind finding F3).
3. `polypharmacy-elder` — CHF+CKD suspects, poly-pharmacy alert, med-rec gap: multi-specialty
   routing, `Mitigate Poly-Pharmacy` goal, medication-review intervention, revenue-gated
   Health-Plan share pinned (consent-checked, default-permitted).
4. `pregnancy` — prenatal timeliness + Edinburgh screening + WIC (food security): barrier-first
   ordering, perinatal screening via portal, food-security SDOH detection.
5. `pediatric-caregiver` — well-child gap + childcare barrier: caregiver-burden detection,
   required in-person visit template, telehealth substitution for follow-up-class care.
6. `minimal-data` — empty clinical arrays: honest thin plan (review-only intervention, zero
   goals, zero referrals, portal-only sharing) and minimal-data limitation flags fire.

## 3. Property invariants (as tests)

Run over the 6 fixtures **plus a deterministic 48-context generated matrix**
(gap-set × HCC-set × alert-set × risk-tier) in `tests/carePlan/invariants.test.ts`:

- **P1** — no goal without at least one intervention (`checkGoalsHaveInterventions`; builder
  backfill is the enforcing mechanism).
- **P3** — every clinical recommendation (every goal and every intervention, plan-level and
  goal-nested) carries ≥1 citation from `data/guidelineSources.json`; every citation is
  honestly marked `reviewLevel: 'reference-level'`, `smeReviewed: false`; the plan-level
  disclaimer must contain "NOT SME-reviewed". (The generator had zero citation support; this
  is the minimal additive field prescribed by the task, not SME-reviewed criteria.)
- **P4** — every SDOH barrier detected from input is in `sdohSummary.addressed` or
  `sdohSummary.deferred` with a coded reason — never silently dropped (holistic path defers
  with `not-covered-by-holistic-template; clinician review required` when its templates
  don't cover a detected need).
- **P5** — determinism: same context twice ⇒ byte-identical plan under the pinned
  `@/lib/clock` (covers referral-id minting, due dates, ordering).
- **P6** — every generated plan maps through `toFhirCarePlan`/`toFhirGoal` without throwing:
  draft CarePlan + plan intent + subject reference + one Goal per plan goal + deduped
  activities. Tier-A structural only — explicitly not a conformance claim.
- **P2 (contraindications) is NOT claimed**: the input shape carries no allergy/medication
  data, so the validator emits the explicit
  `contraindication-checking-not-asserted` data-limitation flag instead (asserted in tests).

Negative-path coverage: `tests/carePlan/validator.test.ts` proves each check detects its
defect. Total new tests: **47** across 5 suites (goldenFixtures 20, invariants 6,
validator 11, fhirMappers 6, delegates 4).

## 4. FINDINGS (defects observed while extracting — behavior preserved per instruction)

- **F1 — No contraindication input.** `ComprehensivePlanInput` has no allergies, active
  medication list, or interaction data; DP-4 P2 is unimplementable against it. Handled
  honestly: validator emits `contraindication-checking-not-asserted` on every plan. Target
  remains C1 person-context input (g5 §3.3).
- **F2 — Side effect inside generation.** `createReferralsForCareGaps` mutates the
  browser-memory `referralStore` during plan generation, before any clinician review. UI
  depends on it; preserved and marked in `referrals.ts`. Target: draft ServiceRequests in the
  plan, referral initiation as an approval-time effect.
- **F3 — Consent-blind sharing (partially guarded this pass).** `determineSharing` pushed
  specialist "(via FHIR)" shares and a revenue-gated Health-Plan share with no consent check.
  Cycle 2 adds a behavior-safe guard: external pushes now consult
  `getProviderAccessConsentStore().isOptedOut(patientId)` (default no-record state preserves
  legacy output exactly); if the consent seam is unavailable, sharing degrades CLOSED with a
  structured warning. The revenue-threshold trigger itself (> $5,000 ⇒ share with Health
  Plan) is preserved and remains a clinical/financial-entanglement defect.
- **F4 — Financial values entangled and hardcoded.** Program bonuses 2500/2000/3000, 15%
  shared-savings factor, $5,000 share threshold — now named constants in `templates.ts`
  (single source), still hardcoded, still feeding sharing/impact. Data-file externalization +
  clinical/financial separation is the named follow-on (g5 §3.3).
- **F5 — Fabricated contact data.** Care-team emails synthesized from provider names, NPI
  placeholder strings. Preserved verbatim in `careTeam.ts`, marked.
- **F6 — Demo-journey keyword typing in the holistic path.** `mapModalityToType` keys off
  phrases like "activate unite us", "caregiver alliance", "autism family support",
  "respite care program". Preserved verbatim, marked.
- **F7 — Silent degradation.** `generateHolisticCarePlan` falls back to the comprehensive
  plan on ANY error; goal-assignment errors are swallowed. Both preserved (behavior), but now
  logged structurally (`carePlan.holistic.fallbackToComprehensive`,
  `carePlan.assignInterventions.failed`) instead of raw `console.error`.
- **F8 — Keyword-string clinical logic throughout.** Specialty routing, SDOH detection, gap
  categorization, impact-relatedness matching all match free text, no coded value sets.
  Preserved, but now centralized (`templates.categorizeGap`, `referrals.specialtyForGap`,
  `analysis.detectSDoHNeeds`) so coded-trigger replacement is a data change, not a rewrite.
- **F9 — PHI-in-logs: verified fixed** (Cycle 1 wave-1 logger work held). The generation path
  logs only ids/counts through `src/lib/server/log.ts`; the new module contains zero raw
  `console.*` call sites; persona-free referral ids verified by test (`ref-<member-slug>-…`,
  no persona names).

## 5. Verification

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → **55 files passed; 411 passed, 2 expected-fail (pre-existing
  `tests/property/matchEngine.property.test.ts` FINDING captures), 9 skipped** — includes the
  47 new `tests/carePlan` tests, all green.
- `bash check-file-sizes.sh` → **PASS** — "no new violations; ratchet intact (75 frozen legacy
  files unchanged or smaller)". The five carePlanGenerator files SHRANK 1,269 → 66 lines
  (table §1); every new file ≤ 400 lines (largest: `builder.ts` at exactly 400 pre-format,
  348 after the assignment split).
- `npx next lint` scoped to every new/changed file → 0 warnings, 0 errors (repo-wide lint has
  pre-existing prettier failures in untouched `src/app/admin-console/*` pages).

## 6. Honesty notes

- Fixture sign-off is the coalition's internal medical-lens review, **not** GB-3 external SME
  sign-off, and is never represented as such (headers say so).
- Citations are reference-level guideline-family pointers, **not** extracted clinical
  criteria; every record and the registry `_meta` carry `smeReviewed: false`.
- FHIR mapping is Tier-A structural; conformance (`$validate`, US Core / Gravity profiles)
  remains the backbone-gated activity named in g5 §3.2/§11.
