import { describe, it, expect } from 'vitest';
// Import from the EXACT pinned module paths (L3) — the import itself pins the paths.
import { medicationAdapter } from '@/lib/pipeline/adapters/medication';
import {
  medicationSpec,
  MEDICATION_DOMAIN,
  MEDICATION_KIND,
  MEDICATION_DISPENSE_KIND,
  PRESCRIBED_FOR,
  DISPENSED_UNDER,
} from '@/lib/graph/mapping/medication';
import { labAdapter } from '@/lib/pipeline/adapters/lab';
import { labSpec, LAB_DOMAIN, OBSERVATION_KIND, OBSERVED_FOR } from '@/lib/graph/mapping/lab';
import { allergyAdapter } from '@/lib/pipeline/adapters/allergy';
import { allergySpec, ALLERGY_DOMAIN, ALLERGY_KIND, ALLERGIC_TO } from '@/lib/graph/mapping/allergy';
import { procedureAdapter } from '@/lib/pipeline/adapters/procedure';
import {
  procedureSpec,
  PROCEDURE_DOMAIN,
  PROCEDURE_KIND,
  PERFORMED_ON,
  PERFORMED_DURING,
} from '@/lib/graph/mapping/procedure';
// Wave B (referrals + immunizations) pins live in domainNamespaceIntegrity.waveB.test.ts.
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { batchStep, defaultPipelineDeps, landStage, type PipelineDeps } from '@/lib/pipeline';
import type { C2Event } from '@/lib/outbox';
import med from './fixtures/medication.json';
import lab from './fixtures/lab.json';
import allergy from './fixtures/allergy.json';
import procedure from './fixtures/procedure.json';

/**
 * The DOMAIN NAMESPACE PINNING test (refined L3, F-C1 lesson from Iteration 3):
 * pin ALL surfaces of the medications domain together — the pipeline adapter, the
 * graph mapping spec, and BOTH registries — and assert they agree on the domain id,
 * node types, edge types, module paths, and registry membership. One drifting
 * surface (an adapter emitting an event no spec claims, a renamed node kind, an
 * unregistered spec) fails here, at the seam, instead of silently in production.
 */
const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

/** Pinned literals — the single source of truth every surface must match. */
const PINNED = {
  domain: 'medications',
  nodeKinds: { prescribed: 'Medication', dispensed: 'MedicationDispense' },
  edgeTypes: { prescribed: 'PRESCRIBED_FOR', dispensed: 'DISPENSED_UNDER' },
  eventTypes: ['medication.prescribed', 'medication.dispensed'] as const,
} as const;

describe('domain namespace integrity — medications', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(MEDICATION_DOMAIN).toBe(PINNED.domain);
    expect(MEDICATION_KIND).toBe(PINNED.nodeKinds.prescribed);
    expect(MEDICATION_DISPENSE_KIND).toBe(PINNED.nodeKinds.dispensed);
    expect(PRESCRIBED_FOR).toBe(PINNED.edgeTypes.prescribed);
    expect(DISPENSED_UNDER).toBe(PINNED.edgeTypes.dispensed);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(medicationAdapter.domain).toBe(PINNED.domain);
    expect(medicationSpec.domain).toBe(PINNED.domain);
    expect(medicationSpec.domain).toBe(MEDICATION_DOMAIN);
  });

  it('both registries carry the medications surfaces', () => {
    // Graph mapping registry: the spec is registered and owns the domain's events.
    expect(MAPPING_SPECS).toContain(medicationSpec);
    for (const et of PINNED.eventTypes) expect(specFor(et)).toBe(medicationSpec);
    // Pipeline registry: the adapter is exported and declares the batch/fhir feed.
    expect(medicationAdapter.format).toBe('fhir-json');
    expect(medicationAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the medications spec', () => {
    const landed = landStage.run(
      { source: medicationAdapter.source, format: 'fhir-json', payload: med.payload },
      deps,
    );
    const records = batchStep(medicationAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(PINNED.domain);
      // The mapping spec that owns this event is the medications spec (no drift).
      expect(specFor(r.eventType)).toBe(medicationSpec);
      emitted.add(r.eventType);
    }
    // Both pinned event subtypes are actually produced by the fixture.
    expect([...emitted].sort()).toEqual([...PINNED.eventTypes].sort());
  });

  it('the mapping projects exactly the pinned node kinds + edge types for each event', () => {
    const nodeKindsOf = (event: C2Event) =>
      projectEvent(event, deps)
        .filter((m): m is UpsertNode => m.op === 'UpsertNode')
        .map((m) => m.kind);
    const edgeTypesOf = (event: C2Event) =>
      projectEvent(event, deps)
        .filter((m): m is UpsertEdge => m.op === 'UpsertEdge')
        .map((m) => m.type);

    const prescribed = ev('medication.prescribed', {
      medicationRef: 'Medication/mr-1', rxNorm: { code: '310798' }, authoredOn: '2026-05-01',
    });
    expect(nodeKindsOf(prescribed)).toContain(MEDICATION_KIND);
    expect(edgeTypesOf(prescribed)).toEqual([PRESCRIBED_FOR]);

    const dispensed = ev('medication.dispensed', {
      dispenseRef: 'MedicationDispense/md-1', prescriptionRef: 'Medication/mr-1',
      rxNorm: { code: '310798' }, whenHandedOver: '2026-05-02', provenance: 'pharmacy-dispense',
    });
    expect(nodeKindsOf(dispensed)).toContain(MEDICATION_DISPENSE_KIND);
    expect(edgeTypesOf(dispensed)).toEqual([DISPENSED_UNDER]);
  });
});

// ─── labs-vitals (wave B) ─────────────────────────────────────────────────────
const LAB_PINNED = {
  domain: 'labs-vitals',
  nodeKind: 'Observation',
  edgeType: 'OBSERVED_FOR',
  eventTypes: ['observation.recorded'] as const,
} as const;

describe('domain namespace integrity — labs-vitals', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(LAB_DOMAIN).toBe(LAB_PINNED.domain);
    expect(OBSERVATION_KIND).toBe(LAB_PINNED.nodeKind);
    expect(OBSERVED_FOR).toBe(LAB_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(labAdapter.domain).toBe(LAB_PINNED.domain);
    expect(labSpec.domain).toBe(LAB_PINNED.domain);
    expect(labSpec.domain).toBe(LAB_DOMAIN);
  });

  it('both registries carry the labs-vitals surfaces', () => {
    expect(MAPPING_SPECS).toContain(labSpec);
    for (const et of LAB_PINNED.eventTypes) expect(specFor(et)).toBe(labSpec);
    expect(labAdapter.format).toBe('fhir-json');
    expect(labAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the labs-vitals spec', () => {
    const landed = landStage.run(
      { source: labAdapter.source, format: 'fhir-json', payload: lab.payload },
      deps,
    );
    const records = batchStep(labAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(LAB_PINNED.domain);
      expect(specFor(r.eventType)).toBe(labSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...LAB_PINNED.eventTypes].sort());
  });

  it('the mapping projects exactly the pinned node kind + edge type', () => {
    const recorded = ev('observation.recorded', {
      observationRef: 'Observation/o-1', loinc: { code: '4548-4' },
      category: 'laboratory', effectiveDateTime: '2026-06-01',
    });
    const nodeKinds = projectEvent(recorded, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(recorded, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(nodeKinds).toContain(OBSERVATION_KIND);
    expect(edgeTypes).toEqual([OBSERVED_FOR]);
  });
});

// ─── allergies (wave B) ───────────────────────────────────────────────────────
const ALLERGY_PINNED = {
  domain: 'allergies',
  nodeKind: 'AllergyIntolerance',
  edgeType: 'ALLERGIC_TO',
  eventTypes: ['allergy.recorded'] as const,
} as const;

describe('domain namespace integrity — allergies', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(ALLERGY_DOMAIN).toBe(ALLERGY_PINNED.domain);
    expect(ALLERGY_KIND).toBe(ALLERGY_PINNED.nodeKind);
    expect(ALLERGIC_TO).toBe(ALLERGY_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(allergyAdapter.domain).toBe(ALLERGY_PINNED.domain);
    expect(allergySpec.domain).toBe(ALLERGY_PINNED.domain);
    expect(allergySpec.domain).toBe(ALLERGY_DOMAIN);
  });

  it('both registries carry the allergies surfaces', () => {
    expect(MAPPING_SPECS).toContain(allergySpec);
    for (const et of ALLERGY_PINNED.eventTypes) expect(specFor(et)).toBe(allergySpec);
    expect(allergyAdapter.format).toBe('fhir-json');
    expect(allergyAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the allergies spec', () => {
    const landed = landStage.run(
      { source: allergyAdapter.source, format: 'fhir-json', payload: allergy.payload },
      deps,
    );
    const records = batchStep(allergyAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(ALLERGY_PINNED.domain);
      expect(specFor(r.eventType)).toBe(allergySpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...ALLERGY_PINNED.eventTypes].sort());
  });

  it('the mapping projects exactly the pinned node kind + causal edge type', () => {
    const recorded = ev('allergy.recorded', {
      allergyRef: 'AllergyIntolerance/a-1', code: { code: '227493005' },
      criticality: 'high', recordedDate: '2026-04-10', provenance: 'clinician-asserted',
    });
    const nodeKinds = projectEvent(recorded, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const causalEdge = projectEvent(recorded, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === ALLERGIC_TO)!;
    expect(nodeKinds).toContain(ALLERGY_KIND);
    expect(causalEdge.semantics.kind).toBe('causal');
  });
});

// ─── procedures (wave C) ──────────────────────────────────────────────────────
const PROCEDURE_PINNED = {
  domain: 'procedures',
  nodeKind: 'Procedure',
  edgeTypes: { performedOn: 'PERFORMED_ON', performedDuring: 'PERFORMED_DURING' },
  eventTypes: ['procedure.performed'] as const,
} as const;

describe('domain namespace integrity — procedures', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(PROCEDURE_DOMAIN).toBe(PROCEDURE_PINNED.domain);
    expect(PROCEDURE_KIND).toBe(PROCEDURE_PINNED.nodeKind);
    expect(PERFORMED_ON).toBe(PROCEDURE_PINNED.edgeTypes.performedOn);
    expect(PERFORMED_DURING).toBe(PROCEDURE_PINNED.edgeTypes.performedDuring);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(procedureAdapter.domain).toBe(PROCEDURE_PINNED.domain);
    expect(procedureSpec.domain).toBe(PROCEDURE_PINNED.domain);
    expect(procedureSpec.domain).toBe(PROCEDURE_DOMAIN);
  });

  it('both registries carry the procedures surfaces', () => {
    expect(MAPPING_SPECS).toContain(procedureSpec);
    for (const et of PROCEDURE_PINNED.eventTypes) expect(specFor(et)).toBe(procedureSpec);
    expect(procedureAdapter.format).toBe('fhir-json');
    expect(procedureAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the procedures spec', () => {
    const landed = landStage.run(
      { source: procedureAdapter.source, format: 'fhir-json', payload: procedure.payload },
      deps,
    );
    const records = batchStep(procedureAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(PROCEDURE_PINNED.domain);
      expect(specFor(r.eventType)).toBe(procedureSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...PROCEDURE_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kind + causal PERFORMED_ON (+ PERFORMED_DURING when an encounter is referenced)', () => {
    const withEncounter = ev('procedure.performed', {
      procedureRef: 'Procedure/p-1', code: { code: '45378' },
      performedDateTime: '2026-07-01', encounterRef: 'Encounter/e-1', provenance: 'provider-performed',
    });
    const nodeKinds = projectEvent(withEncounter, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(withEncounter, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    const performedOn = projectEvent(withEncounter, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === PERFORMED_ON)!;
    expect(nodeKinds).toContain(PROCEDURE_KIND);
    expect(edgeTypes).toEqual([PERFORMED_ON, PERFORMED_DURING]);
    expect(performedOn.semantics.kind).toBe('causal');

    // A standalone procedure (no encounter ref) emits only PERFORMED_ON.
    const standalone = ev('procedure.performed', {
      procedureRef: 'Procedure/p-2', code: { code: '80146002' },
      performedDateTime: '2026-07-05', encounterRef: '', provenance: 'provider-performed',
    });
    const standaloneEdges = projectEvent(standalone, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(standaloneEdges).toEqual([PERFORMED_ON]);
  });
});

/**
 * NOTE: the referrals + immunizations (Iteration-6) AND claims-financial +
 * pa-lifecycle (Iteration-7 wave B) namespace pins live in the companion suite
 * tests/pipeline/domainNamespaceIntegrity.waveB.test.ts, kept separate so this file
 * stays within the ≤500-line test cap (AI-CODING-CONVENTIONS v2 sec 2-3). It pins
 * the same surfaces (adapter, mapping, both registries).
 */

/**
 * NOTE: the care-team + goals-tasks (Iteration-6) AND behavioral-health (Iteration-7
 * wave A, incl. the F2 Part 2 restricted-node surface) namespace pins live in the
 * companion suite tests/pipeline/domainNamespaceIntegrity.waveA.test.ts, kept
 * separate so this file stays within the ≤500-line test cap (AI-CODING-CONVENTIONS
 * v2 sec 2-3). It pins the same surfaces (adapter, mapping, both registries).
 */

/**
 * NOTE: the assessments, caregiver-household, and documents (Iteration-7 wave C)
 * namespace pins live in the companion suite
 * tests/pipeline/domainNamespaceIntegrity.waveC.test.ts, kept separate so this file
 * stays within the ≤500-line test cap (AI-CODING-CONVENTIONS v2 sec 2-3). It pins the
 * same surfaces (adapter, mapping, both registries) and asserts documents is tier T2.
 */

/** Minimal C2 event for the projector-surface pinning assertions. */
function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-01T00:00:00Z', recordedAt: '2026-05-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'rx-hub', feed: 'medications-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
