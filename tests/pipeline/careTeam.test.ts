import { describe, it, expect } from 'vitest';
import {
  batchStep,
  careTeamAdapter,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import careTeam from './fixtures/careTeam.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['CT-MEM', 'Patient', 'name', 'given', 'family']) {
    expect(s).not.toContain(bad);
  }
}

describe('care-team FHIR-JSON BATCH adapter (CareTeam + participant roster)', () => {
  it('normalizes CareTeam records at T1 and quarantines the participant-less team', () => {
    const landed = land({ source: careTeamAdapter.source, format: 'fhir-json', payload: careTeam.payload });
    const out = batchStep(careTeamAdapter)(landed, deps);

    // 3 in (2 teams + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-participant');
    assertQuarantinePhiSafe(out.quarantined[0]);

    const team = out.normalized.find((r) => r.fhirResourceId === 'CareTeam/ct-1')!;
    expect(team).toMatchObject({
      domain: 'care-team',
      resourceType: 'CareTeam',
      eventType: 'care-team.formed',
      tier: 'T1', // C9 tier assertion
      provenance: 'care-team-authoritative',
    });
    expect(team.memberId).toMatch(/^mem-/); // anchored, never the raw CT-MEM-01
    expect(team.idempotencyKey).toBe('ct:team:ct-1');
    expect(team.occurredAt).toBe('2026-03-01T00:00:00Z');
    // Participants are references + role codes only; a Practitioner participant
    // reuses the Practitioner node kind, a non-practitioner is a CareTeamMember.
    const participants = team.payload.participants as Array<{ participantRef: string; kind: string; role: string }>;
    expect(participants).toContainEqual({ participantRef: 'Practitioner/prac-1', kind: 'Practitioner', role: 'primary-care-physician' });
    expect(participants).toContainEqual({ participantRef: 'CareManager/cm-1', kind: 'CareTeamMember', role: 'care-manager' });
    expect(JSON.stringify(team.payload)).not.toContain('CT-MEM'); // no PHI in payload
  });

  it('every normalized care-team record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: careTeamAdapter.source, format: 'fhir-json', payload: careTeam.payload });
    const out = batchStep(careTeamAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBe('care-team-authoritative');
    }
  });
});

describe('end-to-end care-team pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a care-team.formed event per team (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      careTeamAdapter,
      { source: careTeamAdapter.source, format: 'fhir-json', payload: careTeam.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the participant-less team
    expect(result.affectedMembers).toHaveLength(2); // CT-MEM-01, CT-MEM-02
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('care-team.formed');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
