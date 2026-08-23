# Iteration 7 — Wave C report (assessments + caregiver-household + documents)

Built three C9 record domains through the L7 domain-adapter template
(`src/lib/pipeline/adapters/_TEMPLATE.md`), using the medications adapter/mapping as
the worked reference. Generic + synthetic throughout (§1.2): no persona is
hardcoded; every subject is a source id anchored through the injected identity
seam, id-only (deterministic path) exactly as medications does. Clock injected.

## Progress numbers

- C9 domain coverage: **14/20 -> 17/20** for this wave's three rows (the iteration's
  17/20 headline is reached jointly with waves A + B).
- New wave-C tests: **39** across 7 files, all green.

## The three domains

### 1. assessments (`assessments`, tier T1)

- Adapter `src/lib/pipeline/adapters/assessment.ts`: synthetic FHIR
  `QuestionnaireResponse` bundle -> normalized assessment records at T1. Provenance
  is **honest about who answered**: a response whose `source`/`author` resolves to
  the SAME subject is `patient-reported`; a clinician/proxy-recorded one is
  `clinician-recorded`. Payload carries the questionnaire ref + coded answer items
  (link id + code + integer score) only — never the free-text answer narrative.
  `eventType: assessment.completed`.
- Mapping `src/lib/graph/mapping/assessment.ts`: node `QuestionnaireResponse`, edge
  `ASSESSED_BY` (Member -> QuestionnaireResponse), dated from `authored`,
  associative (a completed questionnaire is a factual record, not an asserted causal
  claim). The patient-reported flag + provenance ride the node/edge as PHI-safe
  properties.
- Registered in both registries (`assessmentAdapter`, `assessmentSpec`).

### 2. caregiver-household (`caregiver-household`, tier T1)

- Adapter `src/lib/pipeline/adapters/caregiver.ts`: synthetic FHIR `RelatedPerson`
  bundle -> normalized caregiver/household records at T1. Carries the coded
  RELATIONSHIP ROLE (v3-RoleCode) + a period only; the related person's own name is
  never normalized onto the record (PHI-minimal). `eventType: caregiver.related`.
- Mapping `src/lib/graph/mapping/caregiver.ts`: node `RelatedPerson`, edge
  `RELATED_TO` (Member -> RelatedPerson) carrying the relationship `role` on the
  edge, dated from `periodStart`, associative.
- Registered in both registries (`caregiverAdapter`, `caregiverSpec`).

### 3. documents (`documents`, tier **T2** — DOCUMENT-LEVEL, honestly NOT computable)

- Adapter `src/lib/pipeline/adapters/document.ts`: synthetic FHIR
  `DocumentReference` bundle -> normalized document records at **tier T2**. This is
  the point of the domain: a CCD/PDF is attached and human-readable but **not
  computable**. The adapter deliberately does NOT parse the attachment. The payload
  carries the document TYPE code (LOINC), a content POINTER (url + contentType +
  title), and a `computable: false` honesty marker — and nothing that pretends to be
  extracted structured clinical data. A CCD's problems/meds/results would be T1
  domains in their own coded feeds; claiming them from an opaque attachment would be
  a fidelity lie, so the tier is T2 and the record is a pointer, not parsed content.
  `eventType: document.referenced`.
- Mapping `src/lib/graph/mapping/document.ts`: node `DocumentReference` (carries doc
  type + content pointer + `computable: false`, never parsed clinical fields), edge
  `DOCUMENTED_BY` (Member -> DocumentReference), dated from the document date,
  associative.
- Registered in both registries (`documentAdapter`, `documentSpec`).

## The honest T2 documents tier

`documents` is tier **T2** end to end: the adapter stamps `tier: 'T2'`, the record's
`payload.computable` is `false`, the projected `DocumentReference` node carries the
`computable:false` marker plus a content pointer, and the event rides at
`source.tier === 'T2'`. Tests assert **specifically** that documents is T2 (and NOT
T1), that every record declares `computable:false`, and that the payload/node carry
NO parsed clinical data (no `observations`/`conditions` fabricated off the
attachment). What remains for a future iteration is real document parsing into the
coded T1 domains — deliberately out of scope here; this domain honestly stops at the
pointer.

## Tests

Per-domain: normalization + C9 tier assertion + end-to-end `runPipeline`
(pipeline tests), projection + both-backend byte-identical rebuild + idempotency +
whole-person lens read (graph tests), and the namespace pin.

- `tests/pipeline/assessment.test.ts`, `tests/graph/assessment.test.ts`
- `tests/pipeline/caregiver.test.ts`, `tests/graph/caregiver.test.ts`
- `tests/pipeline/document.test.ts`, `tests/graph/document.test.ts` (T2 + not-computable assertions)
- `tests/pipeline/domainNamespaceIntegrity.waveC.test.ts` — wave-C namespace pin
  (owned by this wave). Pins domain id, node kinds, edge types, module paths, and
  registry membership for all three domains; asserts every adapter eventType is
  claimed by exactly its spec, all assessments/caregiver records are T1, and
  documents is T2 with `computable:false`. The main frozen
  `domainNamespaceIntegrity.test.ts` keeps a pointer note to this companion file.

Seed: added the three document-type LOINC codes (34133-9, 18842-5, 11506-3) to
`src/lib/terminology/data/terminology-seed.json` so the stage-4 semantic gate admits
the documents fixture (standard domain-onboarding, same as labs' LOINCs).

## C9 coverage matrix rows (this wave)

| Domain id | Tier | Adapter | Mapping | Node type | Edge type(s) | Arrival |
|---|---|---|---|---|---|---|
| assessments | T1 | assessment.ts | assessment.ts | QuestionnaireResponse | ASSESSED_BY (Member->QR) | batch / fhir-json |
| caregiver-household | T1 | caregiver.ts | caregiver.ts | RelatedPerson | RELATED_TO (Member->RelatedPerson, role) | batch / fhir-json |
| documents | **T2** | document.ts | document.ts | DocumentReference | DOCUMENTED_BY (Member->DocRef) | batch / fhir-json |

## Verification

- `npx tsc --noEmit`: **0 errors in all wave-C files** (assessment/caregiver/document
  adapters + mappings + tests). The remaining tsc errors in the tree are confined to
  wave A (`behavioralHealth.ts`) and wave B (`claimsFinancial.ts`) concurrent
  in-progress files that had not yet widened the shared `WpcDomain` union at check
  time; they resolve as those waves land and at wave-D convergence.
- `npx vitest run` wave C: **39/39 green** (7 files). The only failing files in the
  full pipeline/graph run are `behavioralHealth.test.ts` (wave A) and
  `claimsFinancial.test.ts` (wave B) — other waves' in-progress work, not touched
  here.
- `bash check-file-sizes.sh`: **PASS** (ratchet intact; every wave-C src file <=400,
  test file <=500 — largest is the 238-line wave-C namespace pin).
