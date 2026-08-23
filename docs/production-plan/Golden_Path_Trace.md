# Golden Path: an A1c result, end to end (Phase-1 Spine)

Status: TARGET-STATE worked example. Nothing below runs today (current state: no pipelines, no backbone, no graph store, SDE hardcoded; evidence pack §Tier B). Every Phase-2 specialist must trace its design through this path and state where it participates; a design that cannot is incomplete by definition (plan §7, gate L). The member is representative, not Maria-specific; the path must hold for any member, any lab, any measure (plan §1.2).

Scenario: a member with diabetes has an HbA1c drawn at a clinic; the result reaches the platform through a QE (Hixny-class) CCD feed; the platform turns it into record, context, coordination, plan, evidence.

## Hop 0: Arrival

A CCD document for the encounter is pulled from the QE by the micro-batch connector (or pushed via QE notification). Format: C-CDA XML containing a Results section with a coded HbA1c observation.

## Hop 1: Land (stage 1)

The raw CCD lands immutably in object storage; the catalog records it. Nothing is transformed.

```json
{
  "landingId": "land-20260402-qe-000317",
  "source": { "system": "hixny-qe", "feed": "ccd-microbatch" },
  "receivedAt": "2026-04-02T09:11:42Z",
  "objectKey": "landing/hixny-qe/2026/04/02/ccd-000317.xml",
  "checksumSha256": "d1f3…9ac0",
  "batchId": "qe-mb-20260402-04",
  "contentType": "application/cda+xml"
}
```

Evidence entry (ADR-005 ledger): `pipeline.landed` with landingId, counts, correlation id `corr-a1c-journey-0042` minted here and propagated through every subsequent hop.

## Hop 2: Stage + validate (stage 2)

Structural validation: XML well-formedness, CCD schematron. Pass -> staging store. Fail -> quarantine lane (30-day alarmed TTL) with a PHI-safe rejection report (document id, rule id, counts; never clinical content). This document passes.

```json
{ "stagingId": "stg-000317", "landingId": "land-20260402-qe-000317",
  "validation": { "schematron": "pass", "ruleFailures": [] }, "disposition": "accepted" }
```

## Hop 3: Transform + enrich (stage 3)

One transform codebase (lane-agnostic; here running as a micro-batch step container).

- **Terminology normalization:** the Results entry carries LOINC `4548-4` (Hemoglobin A1c/Hemoglobin.total). Value 7.2%, UCUM `%`. Local codes, if present instead, map through the terminology service to LOINC; an unmappable code quarantines the entry, not the document.
- **Identity resolution (DP-7):** demographics from the CCD header run through the match engine. Deterministic rule `name+dob-exact` hits (matchEngine.ts short-circuits at 100); the record attaches to anchored identity `mem-7f42a9`, never to the QE's MRN. The source MRN is retained as a source-attributed identifier for survivorship provenance. A 60..90 band score would instead create a possible-match work item; the document would wait on the unmatched-work queue, not load under a guessed identity.
- **Consent + Part 2 labels:** content is scanned against segmentation rules at transformation time. An A1c result is not Part 2 material: `part2Restricted: false`, no segment labels. This is a property of the data from this moment on.
- **Provider identity:** the ordering practitioner resolves by NPI to the anchored practitioner record.

Normalized output (canonical domain model, NormalizedPolicy pattern applied to labs):

```json
{
  "domain": "labs",
  "memberId": "mem-7f42a9",
  "observation": {
    "code": { "system": "http://loinc.org", "code": "4548-4", "display": "Hemoglobin A1c" },
    "value": { "value": 7.2, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%" },
    "effectiveDateTime": "2026-04-01T15:30:00Z",
    "performerNpi": "1234567893",
    "sourceTier": "T1"
  },
  "consentContext": { "part2Restricted": false, "segmentLabels": [] },
  "provenance": { "landingId": "land-20260402-qe-000317", "sourceSystem": "hixny-qe" }
}
```

## Hop 4: Conform + load (stage 4)

US Core Observation (lab) profile `$validate` gates the load. The loader commits, in ONE transaction: the Observation upsert into the FHIR store, a Provenance resource, the outbox row (ADR-006). Reconciliation gate for the batch: entries in = loaded + rejected, alarmed on mismatch.

```json
{
  "resourceType": "Observation",
  "id": "obs-a1c-20260402",
  "meta": { "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab"] },
  "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory" }] }],
  "code": { "coding": [{ "system": "http://loinc.org", "code": "4548-4" }] },
  "subject": { "reference": "Patient/mem-7f42a9" },
  "effectiveDateTime": "2026-04-01T15:30:00Z",
  "valueQuantity": { "value": 7.2, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%" }
}
```

```json
{
  "resourceType": "Provenance",
  "target": [{ "reference": "Observation/obs-a1c-20260402" }],
  "recorded": "2026-04-02T09:14:58Z",
  "agent": [{ "type": { "coding": [{ "code": "assembler" }] }, "who": { "display": "ace-pipeline qe-ccd-adapter" } }],
  "entity": [{ "role": "source", "what": { "display": "land-20260402-qe-000317" } }]
}
```

## Hop 5: Project + propagate (stage 5)

The relay publishes the outbox row as a C2 event on the domain-events topic, partition = mem-7f42a9:

```json
{
  "eventId": "5e2d9a11-77c0-4b1f-8a3e-90cd12ef34ab",
  "eventType": "observation.recorded",
  "eventVersion": "1.0",
  "occurredAt": "2026-04-01T15:30:00Z",
  "recordedAt": "2026-04-02T09:14:58Z",
  "memberId": "mem-7f42a9",
  "partitionKey": "mem-7f42a9",
  "class": "stream",
  "sequence": 116,
  "correlationId": "corr-a1c-journey-0042",
  "idempotencyKey": "load:land-20260402-qe-000317:obs-a1c-20260402",
  "source": { "system": "hixny-qe", "feed": "ccd-microbatch", "batchId": "qe-mb-20260402-04", "tier": "T1" },
  "consentContext": { "part2Restricted": false, "segmentLabels": [] },
  "payload": {
    "observationRef": "Observation/obs-a1c-20260402",
    "code": { "system": "http://loinc.org", "code": "4548-4" },
    "valueQuantity": { "value": 7.2, "unit": "%" }
  }
}
```

Downstream projectors consume independently.

### 5a. Care-gap derivation

The measure evaluator (see trace-matrix finding F2 on ownership) consumes the event, evaluates HEDIS GSD-class logic: member has diabetes, A1c now documented at 7.2 (<8), gap transitions. It emits `care-gap.closed` (or `care-gap.opened` had the value been 9.4) with `causationId` = the observation event, `evidenceRefs: ["Observation/obs-a1c-20260402"]`. Sample shape: contracts.md C2 care-gap sample.

### 5b. Graph projection (G1)

The graph projector applies the labs mapping spec. Changes to the member's subgraph:

- Node upsert: `LabResult {id: obs-a1c-20260402, code: 4548-4, value: 7.2, effectiveAt: 2026-04-01}` (Encounter/Event taxonomy per DP-1).
- Edge add: `(Person mem-7f42a9) -[HAS_EVENT {at: 2026-04-01}]-> (LabResult obs-a1c-20260402)` (dated, per DP-1 temporality).
- Edge add: `(LabResult) -[EVIDENCES {assertedBy: measure-engine, at: 2026-04-02}]-> (CareGap gap-gsd-2026)` associative edge; provenance carried because gap linkage is an assertion (DP-1 causality rule).
- Node update: `CareGap gap-gsd-2026.status -> closed` on the 5a event.

The subgraph remains rebuildable from replay; the D3 lens "care gaps in context" now answers with real data.

## Hop 6: Signal raised

The gap event is a signal by definition (DP-2: a signal is a typed event about a member from any projector). Signal intake enqueues on the signals topic:

```json
{ "eventType": "signal.raised", "memberId": "mem-7f42a9", "class": "stream",
  "payload": { "signalType": "care-gap.closed", "sourceEventId": "…34ab",
               "priority": "routine", "gapRef": "gap-gsd-2026-mem-7f42a9" } }
```

## Hop 7: SDE disposition (G2)

The SDE folds the member's open signal batch (this gap closure, plus a pending outreach nudge scheduled when the gap was open, plus a screening follow-up) under data-driven policy: contact-frequency caps, channel preference, consent scope, priority. Decision for this batch: the pending A1c outreach is **suppressed** (reason: gap closed by result), the screening follow-up is **bundled** into the next scheduled touchpoint. Every disposition is explainable and audited:

```json
{
  "eventType": "disposition.decided", "memberId": "mem-7f42a9", "class": "stream",
  "correlationId": "corr-a1c-journey-0042",
  "payload": {
    "dispositions": [
      { "signal": "outreach-a1c-overdue", "decision": "suppress",
        "reason": "superseded:care-gap.closed", "policyId": "supersede-on-closure/1.2" },
      { "signal": "screening-followup", "decision": "bundle",
        "touchpointId": "tp-20260410-mem-7f42a9", "policyId": "bundling-window/2.0" }
    ]
  }
}
```

## Hop 8: Care plan update (G5)

The care-plan service consumes the gap-closure event for a member with an active plan: the glycemic-control goal gets a progress annotation citing the observation; no intervention change is generated (deterministic engine; DP-4 invariants hold: the goal keeps its intervention, the citation set carries its guideline source id). Output persists to the record as CarePlan/Goal updates per C4, which themselves emit `care-plan.updated` through the same outbox, closing the loop without dual-write.

```json
{ "eventType": "care-plan.updated", "memberId": "mem-7f42a9", "class": "stream",
  "causationId": "care-gap.closed event id",
  "payload": { "carePlanRef": "CarePlan/cp-mem-7f42a9", "change": "goal-progress",
               "goalRef": "Goal/goal-glycemic-control",
               "evidenceRefs": ["Observation/obs-a1c-20260402"] } }
```

Clinician review: the plan change lands in the existing work-queue inbox (DP-3 reuse rule) as a review item when policy requires human sign-off.

## Hop 9: Evidence record (ADR-005)

The ledger now holds the append-only chain for this correlation id: `pipeline.landed` -> `pipeline.staged` -> `identity.resolved (rule: name+dob-exact)` -> `record.loaded (Observation + Provenance)` -> `event.published` -> `care-gap.closed` -> `graph.projected` -> `disposition.decided (2 policies named)` -> `care-plan.updated`. Each entry: actor, timestamp, correlation id, PHI-safe payload (references and codes only). Record-affecting entries are additionally projected as FHIR Provenance/AuditEvent (derived, rebuildable). This chain is what the golden thread, GB-7 review, the compliance audience consume.

## Specialist participation map (each Phase-2 output must state its hops)

| Specialist | Hops owned |
|---|---|
| Pipeline + FHIR pair (G3/X2) | 0..5 (land through publish), reconciliation, quarantine |
| Graph & Context (G1) | 5b, lens serving for C1 |
| Agentic (G2/G4) | 6..7, plus agent execution of any resulting touchpoint (hop 7 outputs feed the outreach agent HITL) |
| Care plan pair (G5) | 8 |
| Documentation (X4) | evidence-chain narrative, runbook skeletons for every hop's failure mode |
