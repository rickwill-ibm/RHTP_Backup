import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultPipelineDeps,
  medicationAdapter,
  runPipeline,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import {
  extractGovernedCodings,
  makeSemanticValidator,
  seedTerminologyService,
} from '@/lib/terminology';
import type { NormalizedRecord } from '@/lib/pipeline/types';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import med from '../pipeline/fixtures/medication.json';

/**
 * Stage-4 SEMANTIC gate (Iteration 4): runs alongside the structural validator.
 * Seeded mode passes demo codes (demo stays green); production mode quarantines
 * a coded record (fail closed, PHI-safe reason); the gate genuinely detects a
 * bad code via the seed allowlist.
 */
const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

afterEach(() => clearSessionDataModes());

/** A NormalizedRecord carrying one RxNorm coding (PHI-free), for direct gate tests. */
function medRecord(rxCode: string): NormalizedRecord {
  return {
    domain: 'medications',
    memberId: 'mem-abc',
    resourceType: 'Medication',
    fhirResourceId: 'Medication/mr-x',
    eventType: 'medication.prescribed',
    tier: 'T1',
    idempotencyKey: 'rx:med:mr-x',
    provenance: 'prescriber-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: medicationAdapter.source,
    occurredAt: '2026-05-01T00:00:00Z',
    payload: {
      medicationRef: 'Medication/mr-x',
      rxNorm: { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: rxCode, display: '' },
      status: 'active',
    },
  };
}

describe('code extraction from a normalized payload', () => {
  it('finds the governed RxNorm coding by system uri', () => {
    const codings = extractGovernedCodings(medRecord('310798').payload);
    expect(codings).toHaveLength(1);
    expect(codings[0]).toMatchObject({ system: 'RxNorm', code: '310798' });
    expect(codings[0].fieldPath).toContain('rxNorm');
  });
});

describe('SemanticValidator over the seed allowlist genuinely detects bad codes', () => {
  const gate = makeSemanticValidator(seedTerminologyService);

  it('passes a seeded (demo) code', () => {
    expect(gate.validate(medRecord('310798')).ok).toBe(true);
  });

  it('flags an unrecognized code with a PHI-safe reason', () => {
    const result = gate.validate(medRecord('999-bogus'));
    expect(result.ok).toBe(false);
    expect(result.issues[0].reasonCode).toBe('semantic-unrecognized-code');
    // PHI-safe: no clinical narrative, only reason + field path.
    expect(JSON.stringify(result.issues)).not.toContain('bogus-name');
  });
});

async function runMeds() {
  const { store } = await makePgMemStore();
  const odeps = makeDeps(store);
  const writer = new OutboxWriter(odeps);
  return runPipeline(
    medicationAdapter,
    { source: medicationAdapter.source, format: 'fhir-json', payload: med.payload },
    deps,
    { writer },
  );
}

describe('stage-4 semantic gate is wired alongside the structural gate', () => {
  it('seeded mode: demo codes pass (4 loaded, only the structural reject quarantined)', async () => {
    setSessionDataMode('terminology', 'seeded');
    const result = await runMeds();
    expect(result.loadReconciliation).toMatchObject({ loaded: 4, balanced: true });
    // The single quarantine is the structurally coding-less request, not a semantic reject.
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].reasonCodes).toContain('missing-medication-code');
  });

  it('production mode: coded records are quarantined (fail closed, PHI-safe) since no server is wired', async () => {
    setSessionDataMode('terminology', 'production');
    const result = await runMeds();
    // Nothing loads: every coded record is held back for lack of a terminology server.
    expect(result.loadReconciliation.loaded).toBe(0);
    const semanticRejects = result.quarantined.filter((q) =>
      q.reasonCodes.includes('semantic-terminology-unavailable'),
    );
    expect(semanticRejects.length).toBeGreaterThan(0);
    // PHI-safe: no member ids, no subject references in the quarantine record.
    const s = JSON.stringify(result.quarantined);
    expect(s).not.toContain('RX-MEM');
    expect(s).not.toContain('Patient');
  });
});
