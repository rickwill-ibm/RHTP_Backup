# MTM Agent

**Domain:** `src/lib/agents/mtm/`  
**Autonomy tier:** `HITL_ADVISORY` — decision-support only, physician acknowledges  
**Feature flag:** `MTM_AGENT_ENABLED`

## Purpose

The MTM (Medication Therapy Management) Agent screens new medication orders against the patient's active medication list before they are written to FHIR. It surfaces clinical safety findings for the prescriber to review and acknowledge — it is **never** the final decision-maker.

## Public surface

Import from `@/lib/agents/mtm` (the index). Never reach into sub-modules directly.

```ts
import { evaluate, searchDrugs, checkDuplicateTherapy } from '@/lib/agents/mtm';
```

## Safety rules implemented

| Rule | Standard | Severity |
|---|---|---|
| Drug–drug interaction | RxNav / NDF-RT / DrugBank | contraindicated → minor |
| Duplicate therapy (same ATC L4) | CMS Part D MTM | moderate |
| Refill too soon (<80% consumed) | CMS Part D MTM | minor |
| Beers Criteria PIM (≥65 yrs) | AGS 2023 | moderate |

## Data flow

```
AddMedicationForm (UI)
  → POST /api/mtm/drug-lookup      RxNorm REST API (NLM, free, no key)
  → POST /api/mtm/ndc              FDA openFDA Drug NDC API (free, no key)
  → POST /api/mtm/interactions     RxNav Drug Interaction API (NLM, free, no key)
  → evaluate()                     Pure engine, client-side, deterministic
  → MtmSafetyPanel                 UI chip list; physician acknowledges each finding
  → FHIR MedicationRequest.create()
```

## Invariants

- **Server-side only:** All external API calls go through `/api/mtm/*` BFF routes. No API keys in `NEXT_PUBLIC_*`.
- **Read-only:** The MTM agent never writes to FHIR. It reads the active med list and proposes safety findings.
- **PHI-safe:** BFF routes never log medication names or patient identifiers to server logs.
- **Hard block only on `contraindicated`:** All other findings are advisory. The submit button is disabled only when `hardBlock: true` (severity = contraindicated). The physician can override advisory findings after acknowledging each one.
- **Deterministic core:** `mtmEngine.evaluate()` is a pure function. Clock is injected via `nowIso` for testing.

## File map

| File | Purpose |
|---|---|
| `types.ts` | All domain types (DrugLookupResult, MtmFinding, MtmCheckInput, …) |
| `schema.ts` | Zod schemas for all external API boundaries |
| `index.ts` | Public re-exports only |
| `mtmEngine.ts` | Pure evaluate() orchestrator |
| `drugLookup.ts` | Client-side BFF caller (searchDrugs, fetchNdcForRxcui) |
| `duplicateTherapyChecker.ts` | CMS Part D duplicate therapy rule |
| `refillTooSoonChecker.ts` | CMS Part D refill-too-soon rule |
| `interactionChecker.ts` | RxNav normaliser + severity mapper |
| `beersCriteriaChecker.ts` | AGS 2023 Beers Criteria PIM check |
| `manifest.ts` | Agent manifest (governance metadata) |
| `data/beers-criteria.json` | Static Beers Criteria table (10 high-priority entries) |

## BFF routes

| Route | Method | Purpose |
|---|---|---|
| `/api/mtm/drug-lookup` | POST `{term}` | Typeahead → DrugLookupResult[] |
| `/api/mtm/ndc` | POST `{rxcui}` | RxCUI → NDC list |
| `/api/mtm/interactions` | POST `{rxcuis[]}` | RxCUI list → DrugInteraction[] |
