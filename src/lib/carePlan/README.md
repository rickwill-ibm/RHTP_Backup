# Care Plan Generator (`src/lib/carePlan`)

Deterministic care-plan generation for the whole-person-care screens: analyze a
member context (gaps, HCC suspects, alerts, SDOH signals), produce goals with
interventions, a care team, sharing targets, reference-level guideline
citations, and an explicit SDOH addressed-or-deferred disposition. Cycle 2
extraction of the five legacy `src/lib/services/carePlanGenerator*.ts` files
(now thin delegates) per the debt-register split: **builder / validator /
templates**.

## Layout

| File | Role |
|------|------|
| `types.ts` | Every shared shape for the domain (one place). Adds `GuidelineCitation`, `PlanCitationIndex`, `SdohSummary` (additive plan fields). |
| `analysis.ts` | `ComprehensivePlanInput` → `PatientAnalysis` (priority, SDOH needs, specialties, urgent actions). |
| `builder.ts` | Goals, interventions, goal assignment, sharing (consent-checked), impact, and `generateComprehensiveCarePlan`. |
| `templates.ts` | Content layer: gap-category matching, intervention templates, modality rules, plan text assembly, financial constants. |
| `citations.ts` | Attaches reference-level citations from `data/guidelineSources.json` to every goal/intervention. |
| `validator.ts` | DP-4 invariants as pure checks (P1 goal-has-intervention, P3 citations, P4 SDOH disposition) + honest data-limitation flags. |
| `careTeam.ts` / `referrals.ts` | Care-team assembly; auto-referral creation for open gaps. |
| `holistic.ts` | Holistic path (context engine → root cause → tiered interventions) converted to the standard plan shape. |
| `fhirMappers.ts` | `GeneratedCarePlan` → FHIR `CarePlan`/`Goal` structural R4 shapes (draft status; never throws). |
| `data/guidelineSources.json` | Guideline source registry — reference-level, `smeReviewed: false`, sign-off pending (GB-3). |

## Public surface

```ts
import {
  generateComprehensiveCarePlan, generateHolisticCarePlan,
  validateGeneratedPlan, toFhirCarePlan, type GeneratedCarePlan,
} from '@/lib/carePlan';
```

Stable entry points (UI callers + legacy delegates depend on these names):
`generateComprehensiveCarePlan(input)`, `generateHolisticCarePlan(input)`,
`type GeneratedCarePlan`.

## Invariants

- **Determinism:** time comes only from `@/lib/clock` (pin with `setClock`);
  same input + same clock ⇒ identical plan. No `Date.now()` here.
- **P1:** no goal without at least one intervention (builder backfills).
- **P3:** every goal/intervention carries ≥1 citation; citations are
  reference-level and `smeReviewed: false` — the disclaimer must survive.
- **P4:** every detected SDOH barrier is in `sdohSummary.addressed` or
  `sdohSummary.deferred` with a reason — never silently dropped.
- **Consent:** external sharing (specialist FHIR push, Health Plan) is gated
  on the provider-access consent seam; seam failure degrades CLOSED.
- **FHIR:** `toFhirCarePlan` never throws; output is Tier-A structural only —
  never claim profile conformance from it (conventions §11).
- **PHI-safe logging:** structured `log.*` with ids/counts only.

## What an agent may change freely / must never change

- **Freely:** template content in `templates.ts` / `data/*.json` (with fixture
  updates); adding validator checks; adding FHIR mappings.
- **Never (without a reviewed contract change):** the three stable entry-point
  names/shapes; the barrier-first goal ordering (SDOH goal is always first
  when needs exist); citation honesty markers (`reviewLevel`, `smeReviewed`);
  determinism (no direct clock/RNG/I-O); silent SDOH drops.
- **Known preserved defects** (do not "fix" casually — behavior is pinned by
  the golden fixtures; see `CYCLE2B_REPORT.md` FINDINGS): keyword-based
  clinical matching, generation-time referralStore mutation, revenue-gated
  health-plan sharing, fabricated care-team contact fields, holistic silent
  fallback, no contraindication input.

## Tests

```bash
npx vitest run tests/carePlan          # domain suite (oracle + invariants)
npx tsc --noEmit && bash check-file-sizes.sh
```

Golden fixtures: `tests/carePlan/fixtures/*.json` — expected-characteristics
assertions (structural truths, not snapshots); each header carries
"medical-lens drafted, SME sign-off pending (GB-3)".
