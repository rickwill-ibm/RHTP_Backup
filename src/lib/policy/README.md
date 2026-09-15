# Generalized Policy Engine (`src/lib/policy`)

Ingest **any** payer / state-agency medical policy into one normalized model, then
evaluate a member's ordered service into a **Coverage Determination** that threads
into the Golden Thread Evidence Record (Da Vinci CRD → DTR → PAS input).

## Why

Prior authorization turns on two questions: _does this service require PA?_ and
_is it medically necessary for this member?_ Different payers answer them in
different document formats. This module makes the **engine** source-agnostic:
the answer logic never changes; only small **ingestion adapters** know a given
payer's format.

## Layout

| File                            | Role                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `types.ts`                      | `NormalizedPolicy` model + evaluation types (`MemberContext`, `OrderContext`, `CoverageDetermination`). |
| `ingest/`                       | `PolicyIngestionAdapter` interface + registry; reference adapters for Aetna CPBs and UHC PA lists.      |
| `policyLibrary.ts`              | Loader + `byCode` / `byNumber` indices. Mock mode loads the bundled seed through the adapters.          |
| `policyEngine.ts`               | Pure `evaluate(member, order, library) → CoverageDetermination`.                                        |
| `fromFhir.ts`                   | Project FHIR `Condition` / `ServiceRequest` → engine inputs.                                            |
| `data/policy-library.seed.json` | 17 real policies (15 Aetna Cardiac CPBs + 2 UHC PA lists), produced by `tools/seed/parse_policies.py`.  |

## Use it

```ts
import { loadMockLibrary, evaluate, toMemberContext, serviceRequestToOrder } from '@/lib/policy';

const library = loadMockLibrary(); // real parsed corpus
const member = toMemberContext(patientId, conditions); // from FHIR
const order = serviceRequestToOrder(serviceRequest); // e.g. CPT 72148
const det = evaluate(member, order, library);
// det.requiresPA · det.outcome · det.criteriaMet · det.deficiencies · det.propensityToDeny
```

## Add a payer (non-mock)

Write an extractor that emits raw records for the new source, then an adapter
that normalizes them:

```ts
import { registerAdapter, ingestLibrary } from '@/lib/policy';
registerAdapter(myStateMedicaidAdapter); // one file; engine unchanged
const { library } = ingestLibrary(myRawRecords); // live library
```

## Guardrails

- `propensityToDeny` is a transparent, labelled **decision-support** estimate —
  never the determination. The payer's `ClaimResponse` is authoritative.
- Criteria matching today is an ICD-10 covered-set screen, not executable CQL
  (see plan increment **GT-9**).
- Regenerate the seed with `python3 tools/seed/parse_policies.py` (expects the
  policy text under `policywork/txt/`).

Tests: `tests/policy/policyEngine.test.ts` (library load/index, Maria mock-data
evaluation, criteria approve/deficiency paths, experimental path, accuracy
anchors — 19/19 anchor checks).
