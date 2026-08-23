# Contract Register C1..C10 (Phase-1 Spine, binding)

Order of presentation: C9 first (per plan §7, it bounds G3 and defines what C1 projects), then C10 and C2 (the propagation pair), then the rest. Every contract carries a grep anchor convention: code touching contract Cn carries `// CONTRACT: Cn`. Evolution across all contracts: additive only, versioned, breaking change = new contract version with a stated deprecation window (default two release phases, ASSUMPTION pending owner policy).

---

## C9: WPC Record Target Model

### C9.1 Domain x tier x source x phase (all twenty domains)

Tiers (binding honesty scale): T1 discrete coded (computable), T2 document-level (attached, not computable), T3 claims-inferred shadow (lagged, biased), T0 absent. T2/T3 never reported as T1. "Current" = pipeline-fed tier today, which is T0 for every domain (evidence: seed script is the only populator; WPC screens render from hardcoded TS). Seed-only presence is noted where it exists but never counts as coverage.

Phases: **P1** Foundation (batch lane: 834, 837/835, pharmacy, provider directory; O-1/O-2). **P2** Clinical + social streams (ADT, QE CCD, in-product screening, referral platform, consent labels; graph and SDE go live). **P3** Full whole-person (CBO/HMIS flat files, member-reported PGD, Part 2 SUD lane, registries, documents at scale).

| # | Domain | Current (pipeline-fed) | P1 target | P2 target | P3 target | MVR consumers (C9.4) |
|---|---|---|---|---|---|---|
| 1 | Demographics / identity | T0 (Patient seeded only) | T1 @834 (survivorship per DP-7) | T1 enriched @QE CCD | T1 + household links | all consumers |
| 2 | Coverage / eligibility | T0 (Coverage seeded) | T1 @834 | T1 (delta stream) | T1 | graph, adequacy, golden thread, agents |
| 3 | Encounters / utilization | T0 | T3 @837 | T1 events @ADT; T2 @CCD | T1 | graph, SDE (T1 stream), care plan |
| 4 | Conditions | T0 (3 seeded) | T3 @837 dx shadows | partial T1 @CCD coded problems | T1 | graph, care plan, SDE |
| 5 | Medications (prescribed AND dispensed) | T0 (1 MedicationRequest seeded) | dispensed T1 @pharmacy feed; prescribed T3 @claims | prescribed partial T1 @CCD | both T1 | care plan, SDE (adherence signals) |
| 6 | Labs / vitals | T0 (1 Observation seeded) | T0 | partial T1 @CCD/QE coded results (LOINC) | T1 @direct lab feeds (ASSUMPTION: lab-feed availability) | care plan, SDE, graph (golden path domain) |
| 7 | Procedures | T0 | T3 @837 | T2 @CCD | partial T1 | graph, golden thread |
| 8 | Immunizations | T0 | T0 | T2 @CCD | T1 @registry (NYSIIS-class, ASSUMPTION) | care plan |
| 9 | Allergies | T0 | T0 | T2 + partial T1 @CCD | T1 | care plan (contraindication gate; see honesty note) |
| 10 | Care team / attribution | T0 | T3 @claims attribution + provider directory T1 | T1 @CCD care team | T1 | graph, adequacy, agents |
| 11 | Care plans / goals / tasks | T0 | T0 | T1 platform-authored (G5 output persisted to record) | T1 | graph, agents, golden thread |
| 12 | Referrals / service requests | T0 (1 ServiceRequest seeded) | T0 | T1 @referral platform webhook + platform-initiated | T1 incl closed-loop status | SDE, adequacy, agents, graph |
| 13 | SDOH (Gravity: screenings, Z-codes, goals, referrals) | T0 | Z-code T3 shadow @claims | T1 @in-product AHC HRSN screening (provenance-tagged) | T1 + CBO/HMIS flat-file paths | graph, SDE, care plan |
| 14 | Behavioral health incl SUD (Part 2) | T0 | BH T3 @claims | BH T2/partial T1 @QE where consent allows | SUD exclusively via Part 2-segmented lane, labeled at stage 3 | care plan, SDE (consent-gated reads only) |
| 15 | Consent / directives | T0 (1 Consent seeded; mock store in code) | T1 (consent store seam swap; opt-out model live) | T1 + Part 2 segmentation labels record-native | T1 | every consumer (read scoping) |
| 16 | Claims / financial (golden thread) | T0 (Claim/EOB seeded) | T1 @837/835 (financial facts are T1; clinical inference from them stays T3) | T1 | T1 | golden thread, adequacy |
| 17 | PA lifecycle | T0 (engine real, record not pipeline-fed) | T1 platform-native (goldenThread persisted with Provenance) | T1 | T1 | golden thread, agents, graph |
| 18 | Assessments / member-reported | T0 (1 Questionnaire seeded) | T0 | T1 @in-product questionnaires | T1 + SMS/app PGD stream | SDE, care plan |
| 19 | Caregiver / household (RelatedPerson) | T0 | T0 | partial T1 @CCD + screening | T1 | graph, agents |
| 20 | Documents (DocumentReference) | T0 | T0 | T2 @CCD-as-document with provenance | T2 at scale (T2 is this domain's terminal tier by definition) | care plan (human review), compliance |

### C9.2 Source-to-domain yield map (per plan C9.3, restated as binding)

834 -> coverage T1 + demographics T1. 837/835 -> utilization/condition/procedure/medication shadows T3 + financial T1. CCD/QE -> mostly T2 with partial T1 where coded (meds, problems, labs). Pharmacy -> dispense T1. ADT -> encounter events T1 (stream). In-product screening -> SDOH T1 with provenance. Referral platforms -> referral T1. Part 2 segmentation and consent scoping are record-model-native from P1; retrofitting is a rebuild, therefore banned.

### C9.4 Consumer MVR declarations

Completeness is measured only as % of each MVR fed from real pipelines at the declared tier, mock toggle off.

| Consumer | Minimum-viable record (domain @ tier) |
|---|---|
| Graph G1 | 1@T1, 2@T1, 3@>=T3, 4@>=T3, 12@T1, 13@T1, 17@T1 |
| SDE G2 | 1@T1, 3@T1 stream (ADT), 5-dispense@T1, 12@T1, 13@T1, 15@T1 |
| Care plan G5 | 4@partial T1, 5@T1 dispense, 6@partial T1, 9@>=T2 (honesty note: contraindication checking is asserted only at 9@T1; below that the plan output carries a data-limitation flag), 13@T1, 15@T1 |
| Adequacy G7 | 2@T1, 10@T1 (provider identity NPI-anchored per DP-7), 12@T1 |
| Agents G4 | SDE outputs + 11@T1, 12@T1, 15@T1, 17@T1 |
| Golden thread | 16@T1, 17@T1, plus ADR-005 evidence ledger |

---

## C10: Projection and propagation contract

### C10.1 Event catalog (event types per domain; all ride the C2 envelope)

| Domain | Event types |
|---|---|
| Identity (DP-7) | identity.member.anchored, identity.traits.updated, identity.member.merged, identity.member.unmerged |
| Coverage | coverage.enrolled, coverage.changed, coverage.terminated |
| Encounters | encounter.admitted, encounter.discharged, encounter.transferred, encounter.ed-arrival, encounter.recorded |
| Conditions | condition.recorded, condition.resolved |
| Medications | medication.prescribed, medication.dispensed |
| Labs/vitals | observation.recorded |
| Procedures | procedure.recorded |
| Immunizations | immunization.recorded |
| Allergies | allergy.recorded, allergy.resolved |
| Care team | care-team.attributed, care-team.changed |
| Care plan | care-plan.created, care-plan.updated, goal.set, goal.met, task.created, task.completed |
| Referrals | referral.initiated, referral.accepted, referral.stalled, referral.completed |
| SDOH | sdoh.screening.completed, sdoh.barrier.identified, sdoh.barrier.resolved |
| Behavioral health | bh.event.recorded (Part 2 instances carry restricted labels; projectors without Part 2 clearance drop them by envelope inspection alone, never by payload parsing) |
| Consent | consent.granted, consent.revoked, consent.optout.recorded, consent.optout.revoked |
| Claims/financial | claim.received, claim.adjudicated, payment.posted |
| PA lifecycle | pa.submitted, pa.pended, pa.approved, pa.denied, pa.goldcard.applied |
| Assessments | assessment.submitted |
| Household | related-person.linked, related-person.unlinked |
| Documents | document.attached |
| Care gaps (derived) | care-gap.opened, care-gap.closed |
| SDE (out) | signal.raised, disposition.decided, touchpoint.executed |

### C10.2 Ordering, idempotency, evolution

- **Ordering:** partition key = memberId; per-member commit order preserved by the ADR-006 relay; cross-member ordering is never promised; consumers must not depend on it.
- **Idempotency:** consumers deduplicate on eventId; externally triggered mutations carry idempotencyKey (conventions v2 §7.2); redelivery is expected (at-least-once, C6).
- **Rebuild:** every projector must rebuild its store from record replay; a projector that cannot is rejected at review (merge/unmerge per DP-7 rekeys by replay, never in-place).
- **Registration:** a new projector subscribes to the backbone; it never reads another projector's store as a source.
- **Evolution:** additive only; eventVersion in the envelope; a breaking change is a new event type; deprecation window two release phases (ASSUMPTION pending owner policy).
- **Graph mapping spec format (per-domain, owned by G1):** resource/event type -> node type(s), edge type(s) with dated validity, label propagation incl Part 2 restriction, provenance for causal edges per DP-1.

---

## C2: Event envelope (JSON Schema + samples)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ace.platform/schemas/c2-event-envelope/1.0.0",
  "title": "ACE Domain Event Envelope",
  "type": "object",
  "required": ["eventId", "eventType", "eventVersion", "occurredAt", "recordedAt",
               "memberId", "partitionKey", "class", "source", "idempotencyKey",
               "correlationId", "consentContext", "payload"],
  "additionalProperties": false,
  "properties": {
    "eventId":       { "type": "string", "format": "uuid" },
    "eventType":     { "type": "string", "pattern": "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+$" },
    "eventVersion":  { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "occurredAt":    { "type": "string", "format": "date-time" },
    "recordedAt":    { "type": "string", "format": "date-time" },
    "memberId":      { "type": "string", "description": "Anchored member identity (post match-engine), never a raw source id" },
    "partitionKey":  { "type": "string", "description": "Equals memberId; explicit so infra never re-derives it" },
    "class":         { "type": "string", "enum": ["stream", "batch"], "description": "Latency-budget class per load model §2.1" },
    "sequence":      { "type": "integer", "minimum": 0, "description": "Per-member commit sequence from the outbox relay" },
    "correlationId": { "type": "string", "description": "Traces one member journey across lanes (conventions v2 §8.2)" },
    "causationId":   { "type": "string", "description": "eventId of the event that caused this one, if any" },
    "idempotencyKey": { "type": "string" },
    "source": {
      "type": "object",
      "required": ["system", "feed"],
      "additionalProperties": false,
      "properties": {
        "system":  { "type": "string" },
        "feed":    { "type": "string" },
        "batchId": { "type": "string" },
        "tier":    { "type": "string", "enum": ["T1", "T2", "T3"] }
      }
    },
    "consentContext": {
      "type": "object",
      "required": ["part2Restricted"],
      "additionalProperties": false,
      "properties": {
        "part2Restricted": { "type": "boolean" },
        "segmentLabels":   { "type": "array", "items": { "type": "string" } }
      }
    },
    "payload": { "type": "object", "description": "PHI-minimal: references and codes, never free-text clinical narrative. Schema per eventType, versioned by eventVersion, zod-parsed at every consumer boundary." }
  }
}
```

### C2 sample: care gap (derived)

```json
{
  "eventId": "0b6f3c2e-8f1a-4d5e-9c47-2a1e6b9d4f10",
  "eventType": "care-gap.opened",
  "eventVersion": "1.0",
  "occurredAt": "2026-04-02T09:15:00Z",
  "recordedAt": "2026-04-02T09:15:04Z",
  "memberId": "mem-7f42a9",
  "partitionKey": "mem-7f42a9",
  "class": "stream",
  "sequence": 118,
  "correlationId": "corr-a1c-journey-0042",
  "causationId": "5e2d9a11-77c0-4b1f-8a3e-90cd12ef34ab",
  "idempotencyKey": "care-gap:mem-7f42a9:HEDIS-GSD:2026",
  "source": { "system": "ace-measures", "feed": "gap-derivation", "tier": "T1" },
  "consentContext": { "part2Restricted": false, "segmentLabels": [] },
  "payload": {
    "gapId": "gap-gsd-2026-mem-7f42a9",
    "measure": { "system": "HEDIS", "code": "GSD", "year": 2026 },
    "status": "open",
    "evidenceRefs": ["Observation/obs-a1c-20260402"]
  }
}
```

### C2 sample: ADT encounter

```json
{
  "eventId": "9d21c4b7-3e6f-42aa-b0c8-51f7d8e2a933",
  "eventType": "encounter.admitted",
  "eventVersion": "1.0",
  "occurredAt": "2026-04-01T22:47:00Z",
  "recordedAt": "2026-04-01T22:47:21Z",
  "memberId": "mem-7f42a9",
  "partitionKey": "mem-7f42a9",
  "class": "stream",
  "sequence": 115,
  "correlationId": "corr-adt-20260401-8812",
  "idempotencyKey": "adt:hix-msg-20260401-004417",
  "source": { "system": "hixny-qe", "feed": "adt-hl7v2", "batchId": "n/a", "tier": "T1" },
  "consentContext": { "part2Restricted": false, "segmentLabels": [] },
  "payload": {
    "encounterRef": "Encounter/enc-20260401-8812",
    "encounterClass": "IMP",
    "facilityNpi": "1234567893",
    "admitReasonCode": { "system": "http://snomed.info/sct", "code": "44054006" }
  }
}
```

### C2 sample: SDOH screening

```json
{
  "eventId": "4a8e1f60-2b9c-47d3-a5e6-7c0d9b8f21e4",
  "eventType": "sdoh.screening.completed",
  "eventVersion": "1.0",
  "occurredAt": "2026-04-03T14:02:00Z",
  "recordedAt": "2026-04-03T14:02:03Z",
  "memberId": "mem-7f42a9",
  "partitionKey": "mem-7f42a9",
  "class": "stream",
  "sequence": 119,
  "correlationId": "corr-screening-3391",
  "idempotencyKey": "screening:qr-ahc-hrsn-3391",
  "source": { "system": "ace-app", "feed": "in-product-screening", "tier": "T1" },
  "consentContext": { "part2Restricted": false, "segmentLabels": [] },
  "payload": {
    "responseRef": "QuestionnaireResponse/qr-ahc-hrsn-3391",
    "instrument": { "system": "ahc-hrsn", "version": "1.1" },
    "positiveDomains": [
      { "domain": "transportation-insecurity", "zCode": { "system": "http://hl7.org/fhir/sid/icd-10-cm", "code": "Z59.82" } }
    ],
    "provenance": "patient-reported"
  }
}
```

---

## C6: Event backbone contract

Kafka API only (ADR-002). Partition key = memberId on every topic. Delivery: at-least-once; consumers idempotent per C10.2. Per-partition ordering guaranteed; nothing else. Traffic classes per the load model: stream-class events honor DP-5 latency budgets; batch-class events are exempt with an alarmed 1h post-window catch-up. DLQ per topic with mirrored keying; every DLQ has a replay runbook (D7 build-gated) plus a replay tool that re-publishes with original eventId so idempotent consumers stay safe. Replay of a full topic from offset zero is a supported operation (projector rebuild). Consumer groups: one per projector; lag is a first-class SLO metric.

---

## C1: Person-context read API

Endpoint sketch (BFF-only; browser never calls engines directly):

```
GET /api/person-context/{memberId}
  ?sections=demographics,coverage,conditions,gaps,sdoh,careTeam,carePlan,referrals,pa,provider
  &purpose=treatment|care-coordination|operations|audit
  &asOf=2026-04-03T00:00:00Z            (optional point-in-time view)
GET /api/person-context/{memberId}/lens/{lensId}   (the five DP-1 lens queries; graph-backed)
GET /api/person-context/{memberId}/provider-context (O-6 extension: adequacy-joined provider
  model linking gaps -> referral candidates -> PA posture, NPI-anchored per DP-7)
```

Response: a projection of the C9 record, assembled from CQRS read models, every section carrying its tier label (T1/T2/T3) so no consumer can mistake shadow data for coded data. Sections the caller's purpose does not justify are omitted, not blanked.

**Consent enforcement statement (binding).** Every read is scoped by requestor purpose plus the member's consent state, enforced server-side by the existing authz guard pattern (Tier-A code) before projection assembly: provider-access reads check the opt-out store (isOptedOut short-circuits to 403 with a PHI-safe body); Part 2-labeled content is excluded unless the purpose plus consent scope explicitly permit it, evaluated at read time on top of the transformation-time labels; every access emits a PHI-safe audit event with correlation id to the ADR-005 ledger. p95 <= 300ms per the load model.

---

## C3: Seam convention (codified from the consent module + conventions v2 §5/§7)

Verified exemplar: `src/lib/consent/providerAccessOptOut.ts`. The convention, extracted as binding rules:

1. **Interface first.** The seam is a TypeScript interface in the domain's `types.ts` (e.g. `ProviderAccessConsentStore`); callers depend only on it, imported via `index.ts`.
2. **Identified implementations.** Every implementation carries an `id: string` so audit and logs name the active source (`'mock-provider-access-consent'`).
3. **Mock is a mode, not a stub.** The in-memory implementation remains selectable forever (the Mock Data toggle is the seam switch); demo stays green through every swap.
4. **Attributed mutations, never silent.** Every state change requires an actor (`recordedBy` throws when absent) plus a timestamp; optional reason captured.
5. **Expected outcomes are values.** Absence of a record is a defined default (`isOptedOut` -> false), never an exception; infrastructure failure throws typed coded errors (BackboneNotConfiguredError pattern).
6. **Swap without touching callers.** Production source replaces the mock behind the same interface; the diff touches wiring only.
7. **Anchored and contract-tested.** `// SEAM: <name>` at the interface; one contract test suite runs against mock AND real; a swap that passes is a safe swap. Boundary data is zod-parsed per conventions v2 §5.

---

## C4: FHIR profile set

Base: FHIR R4, US Core 6.1. Correction stands: ReferralRequest does not exist in R4; referrals are ServiceRequest. Profiles: US Core Patient, Coverage, Encounter, Condition, MedicationRequest, MedicationDispense, Observation (lab, vital signs), DiagnosticReport, Procedure, Immunization, AllergyIntolerance, CareTeam, RelatedPerson, DocumentReference, QuestionnaireResponse. Care planning: US Core CarePlan, Goal, plus Task and ServiceRequest. SDOH: Gravity SDOH Clinical Care profiles (SDOHCC Observation Screening Response, Condition, Goal, ServiceRequest) with Gravity value sets and Z-codes. PA/financial: Da Vinci PAS, DTR, CRD as already exercised by the Newman contract tests; Claim, ClaimResponse, ExplanationOfBenefit. Every pipeline load passes profile $validate at stage 4 as a gate; Provenance per load per §4A.

---

## C5: Demo-stays-green regression contract (mechanical)

Two automated Playwright suites, run per phase; a red run blocks merge:
1. **Walkthrough:** the demo click path (12-scene arc) executed end to end.
2. **Dual-mode:** every seamed screen renders correctly with the mock toggle ON and with it OFF. A screen is "seamed" the moment its data source gains a `SEAM:` anchor; the suite discovers seamed screens from a checked-in registry (`tools/demo-green/seams.json`) that the C3 contract test updates. Assertions are structural (named regions render, no error boundary, no empty-state where data is expected), never pixel-exact.

---

## C7: Infrastructure abstraction contract

Core services may depend on exactly five protocols: Postgres wire, Kafka API, S3-compatible object storage, OIDC, container runtime (OCI). Everything hyperscaler-specific lives in the IaC layer (ADR-004). Adding a sixth protocol dependency to core is an ADR-level decision, never a specialist choice. Lint enforcement: dependency allowlist checked in CI (build-gated tooling item).

---

## C8: Documentation contract

Audience map (six audiences per D7): executive/state program, engineering, operations/SRE, deployment, compliance/audit, enablement/field. Register schema, committed at `docs/REGISTER.md`, one row per document:

| Field | Type | Rule |
|---|---|---|
| audience | enum(6) | exactly one primary |
| document | path | lives under docs/, versioned with code |
| stateLabel | current-state \| target-state \| mixed-labeled | mixed requires per-section labels |
| class | authored-now \| build-gated | build-gated rows name their epic |
| owner | role | a person or specialist role, never "team" |
| doneGate | text | the acceptance criterion that makes the doc true; epics are not done without it |
| generatedFrom | source path or "hand-authored" | generatable content is never hand-maintained |

Engineering rows absorb the existing `docs/` tree (ARCHITECTURE.md, traceability.md, conformance-plan.md, feature READMEs) as already-owned entries. Docs-stay-current: a PR changing a seam, contract, or deployment surface without touching its doc fails review.
