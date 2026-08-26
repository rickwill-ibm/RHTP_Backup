# Program — Generalized Policy Processing & Provenance-Anchored Review (CMS-0057-F)

**Status:** design / staged plan (coalition-authored, red-team hardened). Not yet built.
**Owner area:** `src/lib/policy` (engine + ingestion) + CMS-0057-F Prior Authorization UI.
**Why this doc:** a code probe showed the engine *recognizes* PA codes but does not *process*
policy criteria; adding one policy to the seed is recognition only. This program makes the
engine process **any** payer/state policy, reprocesses the corpus with document provenance, and
adds a reviewer chatbot that ties every extract to its exact source location — placed in CMS-0057-F.

---

## 1. The problem (grounded in the code)

- `evaluate()` for a PA-required-list policy returns `requiresPA=true`, `criteriaMet=null`,
  `propensityToDeny=35` (a **flat constant**), one "missing-documentation" deficiency — **no clinical
  processing**. For Aetna "covered" policies it does only a crude ICD-10 covered-set screen.
- `criteria.ts` is a real predicate-tree engine (`smeReviewed`-gated) but is **UNWIRED** — only
  re-exported; `evaluate()` never calls it. Its one ruleset is an unreviewed POC.
- `MemberContext = { diagnoses }` only; `fromFhir` projects FHIR Conditions only — **no BMI/vitals/age**,
  so bariatric criteria (BMI≥40) are inexpressible.
- Provenance is coarse (`sourceFile` + `rawTextChars`) — no section/paragraph/line anchors.

So "add Horizon to the seed" is **Stage-1 recognition**; the intelligent decision logic is absent.

## 2. Non-negotiable guardrails (from the red-team — apply in EVERY phase)

1. **POC/unreviewed rulesets are structurally barred from `evaluate()`.** The `smeReviewed` flag alone
   cannot promote a set; promotion also requires a cited **authoritative source** (CMS NCD/LCD or state
   Medicaid manual) + a **named clinical reviewer**. POC rules never influence a member determination.
2. **Anchors are machine-verified.** Every cited `snippet` must byte-match the source at its `charSpan`
   at ingest **and** re-verify before render/decision. Drift (re-OCR/re-pagination) **auto-revokes**
   `smeReviewed` and re-queues for review.
3. **Hard PHI / model separation.** The extraction model call carries **policy text only — never
   `MemberContext`**. All PHI stays server-side; the chatbot payload is references/codes/counts only;
   DLP scan on model egress.
4. **Real maker-checker.** Distinct maker≠checker identities, **per-element** sign-off (no bulk
   "approve all"), the reviewer must have viewed the rendered source anchor before a flip is enabled,
   immutable audit log.
5. **`provenanceClass` quarantine.** Every doc/element is tagged `authoritative | sample | synthetic`.
   Synthetic/sample docs (the Horizon PDF says *"sample summary … placeholder text"*) and OCR-artifact
   columns (the "Confidence %") are ingestible for **pipeline testing only** and can **never** back a
   live decision. Corpus regeneration is **diff-gated** and **preserves** SME edits/overrides.
6. **Advisory-only + plan-scope.** `propensityToDeny` is labelled decision-support; the payer
   `ClaimResponse` is authoritative; no auto-final decision. Plan-type gate: CMS-0057-F binds MA,
   Medicaid/CHIP (FFS+managed care), FFE QHPs — **not** commercial/ERISA. Criteria vary by
   product/state (Medicare NCD vs Medicaid state manuals) and must be selected by plan.

## 3. Phase 0 — Interface freeze (freeze BEFORE any wave builds)

Publish these contracts as stubs so parallel waves don't collide (framework interface-freeze):

```
SourceAnchor  { anchorId, page, sectionHeading, paragraphIdx, lineRange, charSpan:[start,end],
                snippet, contentHash, sourceFile, provenanceClass }
MemberContext { diagnoses, observations[], vitals:{bmi,weight,height}, ageYears, comorbidities[] }   // extended
PlanContext   { lineOfBusiness: 'Commercial'|'Medicaid'|'Medicare', state, payer }
Predicate     += bmiAtLeast|bmiBelow | observationValueCompare | hasComorbidity                        // new leaves
CriteriaSet   += selector (matched to PlanContext), provenance: SourceAnchor[], authoritativeSource
ProvenanceAnchor attached to every code-bucket entry, PolicyIndication, CriteriaRule/CriteriaSet
Review BFF    /api/policy-review/[policyId] · /source · /interrogate · /criteria/[setId]/decision
```

## 4. Staged phases

### Phase 1 — Engine actually decides (wire criteria; give it facts)
- Extend `MemberContext`; `fromFhir.toMemberContext` projects FHIR **Observations** (BMI LOINC 39156-5,
  weight, height; compute BMI when absent; derive age from `Patient.birthDate`).
- Add `Predicate` leaves `bmiAtLeast/below`, `hasComorbidity`, `observationValueCompare`.
- **Wire `evaluateCriteria()` into `evaluate()`** behind the `PlanContext` selector + guardrail #1
  (POC barred). Criteria-bearing policies now yield real `criteriaMet` / deficiencies / **member-specific**
  propensity; the flat-35 / ICD-root path becomes a fallback only when no `CriteriaSet` applies.
- Tests incl. adversarial: an unreviewed/POC set must **fail-closed** (never auto-approve). Gates E1–E16.

### Phase 2 — Provenance-anchored ingestion (any policy, any format)
Pipeline (deterministic core, effects at the edge):
`Loader` (PDF/HTML/text → canonical block stream, anchors preserved) → `Segmenter` (addressable
sections/paragraphs) → **LLM Extractor** (server-side, schema-constrained JSON; every asserted
code/product/criterion must cite an anchor or set `sourced:false`; **policy text only, no PHI**) →
`Validator` (byte-match every snippet↔source at its span; mismatch → downgrade to `unsourced`) →
`Normalizer` (existing `aetnaCpb`/`uhcPaList`/`genericPaList` adapters + a new `provenanceAdapter`).
Output: `NormalizedPolicy` + criteria with `smeReviewed:false`, `provenanceClass` set. No auto-approval.

### Phase 3 — Reprocess corpus + update mock (generators + drift gate)
- Supersede `tools/seed/parse_policies.py` with a generator that runs the Phase-2 pipeline over
  `policywork/txt/*` + the Horizon doc (18 total) → regenerates `data/policy-library.seed.json`.
- Regeneration is **additive/idempotent**; a **drift gate** diffs generated vs committed seed and fails
  CI on unreviewed change; SME `smeReviewed` flips + manual overrides live in a **separate layer that
  survives regen**; corpus-count assertions updated deliberately, not overwritten.

### Phase 4 — Review & interrogation chatbot UI (in CMS-0057-F)
- **Screen** `src/app/(reviewer)/prior-auth/review/[policyId]` — three panes via `AppLayout`:
  (left) **source document** paginated + anchor-addressable; (center) **extracted model** cards (codes,
  indications, each `CriteriaSet`/rule) with an `smeReviewed` badge + provenance chip; (right) **chatbot
  dock** + per-element action bar. **Bidirectional linking**: click an extract → highlight its exact
  source span, and click a source span → filter to elements citing it (`anchorId` is the join key).
- **Chatbot**: policy-scoped, server-side model only, grounded **only** in this policy's extract +
  anchors; returns `{answer, citations: ProvenanceAnchor[]}`; the BFF **rejects/degrades** any answer
  without a resolvable citation → renders "Not found in this policy." Structured questions
  (requiresPA / code lists / smeReviewed) answered deterministically from fields, not the model.
  Labelled decision-support, PHI-safe, feature-flagged (`policyReviewChat`) with read-only degradation.
- **Maker-checker**: per-criterion Approve/Annotate/Reject → flips `CriteriaSet.smeReviewed` under
  guardrail #4; each action emits a PHI-safe audit event + an evidence entry.
- **BFF** (`src/app/api/policy-review/*`, Node runtime, reviewer-role gate, correlationId, audit):
  `GET /[policyId]` (extract+anchors) · `GET /[policyId]/source` (paginated segments) ·
  `POST /[policyId]/interrogate` (`{answer,citations}`) · `POST /[policyId]/criteria/[setId]/decision`.
- **CMS-0057-F placement**: add a **"Policy Review"** tile under Prior Authorization in
  `src/app/(cms0057f)/cms/page.tsx` (behind the flag) + a Prior-Auth entry in `api-explorer`.
- **Evidence threading**: append `EvidenceEntry {type:'sme-review', setId, decision, smeReviewed,
  approver, citations}` to the Golden Thread record → projects to AuditEvent; the review decision
  becomes durable evidence feeding the engine's auto-decide gate.

### Phase 5 — Generalize, harden, productionize
- Onboarding a new payer/state = drop a policy doc → pipeline extracts (provenance) → reviewer approves
  via the chatbot → engine processes. **No per-policy code.**
- **Adversarial fixtures MUST fail-closed**: fabricated-anchor, drifted-anchor, artifact-column,
  synthetic-doc. Merge gated on a **golden clinical oracle** (e.g. CMS bariatric NCD) for at least one
  criteria family.
- Production execution target: the external policy engine seam (`POLICY_ENGINE_URL` / real CQL);
  CMS-0057-F PA API + Da Vinci CRD/DTR/PAS conformance.

## 5. Coalition operating model (per wave)
Each phase runs as a wave: probe → parallel specialists on disjoint trees → convergence to DRY →
red-team panel (domain-fidelity clinical/regulatory, negative-space, stub-legitimacy, engineering,
cross-examiner) → orchestrator authoritative gate (E1–E16) → provenance close-out. Definition of Ready
carries the NFR + regulatory manifest (CMS-0057-F PA API, Da Vinci, HIPAA/PHI, auditability, HITL,
no-hallucination). Definition of Done: gates green + provenance-required + SME sign-off where a decision
is influenced.

## 6. Immediate next step (safe, today)
Stage-1a: add Horizon as a PA-list seed record **tagged `provenanceClass: synthetic`** (recognition
only, quarantined from live decisions) + update the corpus-count test. Then execute Phase 0 (freeze the
contracts). Everything else builds on the frozen interfaces.
