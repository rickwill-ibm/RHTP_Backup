import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { type UpsertEdge } from '@/lib/graph';
import {
  projectClaimsWithIntegrity,
  holdOrphanClaims,
} from '@/lib/graph/mapping/claimsIntegrity';
import { ADJUDICATED_BY, EXPLAINED_BY } from '@/lib/graph/mapping/claimsFinancial';
import { createMemoryDeadLetterStore } from '@/lib/deadLetter';

/**
 * Claims golden-thread integrity: a ClaimResponse whose Claim node is ABSENT must
 * HOLD (dead-letter) rather than project a dangling ADJUDICATED_BY / EXPLAINED_BY
 * edge. E9: the orphan is held, never dangled, never silently dropped.
 */
const deps = { now: () => 1_700_000_000_000 };

function ev(eventType: string, payload: Record<string, unknown>, memberId = 'M1'): C2Event {
  return {
    eventId: `evt-${payload.responseRef ?? payload.claimRef ?? payload.eobRef}`, eventType, eventVersion: '1.0',
    occurredAt: '2026-04-05T00:00:00Z', recordedAt: '2026-04-05T00:00:00Z',
    memberId, partitionKey: memberId, class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: `idem-${eventType}-${payload.claimRef ?? ''}`,
    source: { system: 'claims-hub', feed: 'claims-financial-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
function edgeTypes(muts: { op: string }[]): string[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => (m as UpsertEdge).type);
}

const submitted = (claimRef: string) => ev('claim.submitted', { claimRef, total: 250, created: '2026-04-01' });
const adjudicated = (claimRef: string, responseRef: string) =>
  ev('claim.adjudicated', { responseRef, claimRef, outcome: 'complete', created: '2026-04-05' });
const explained = (claimRef: string, responseRef: string, eobRef: string) =>
  ev('claim.explained', { eobRef, responseRef, claimRef, outcome: 'complete', created: '2026-04-06' });

describe('claims golden-thread integrity: an intact chain projects fully', () => {
  it('submit -> adjudicate -> explain of a present claim projects both chain edges, holds nothing', () => {
    const { mutations, held } = projectClaimsWithIntegrity(
      [submitted('Claim/c-1'), adjudicated('Claim/c-1', 'ClaimResponse/r-1'), explained('Claim/c-1', 'ClaimResponse/r-1', 'ExplanationOfBenefit/e-1')],
      deps,
    );
    expect(held).toHaveLength(0);
    expect(edgeTypes(mutations)).toContain(ADJUDICATED_BY);
    expect(edgeTypes(mutations)).toContain(EXPLAINED_BY);
  });
});

describe('claims golden-thread integrity: an ORPHAN adjudication holds, does not dangle', () => {
  it('adjudicating a never-submitted claim emits NO ADJUDICATED_BY edge and holds it', () => {
    const { mutations, held } = projectClaimsWithIntegrity(
      [adjudicated('Claim/absent', 'ClaimResponse/r-9')],
      deps,
    );
    // No dangling edge into the absent Claim.
    expect(edgeTypes(mutations)).not.toContain(ADJUDICATED_BY);
    // Held instead.
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ kind: 'quarantine', reasonCode: 'orphan-claim-response', sourceRef: 'ClaimResponse/r-9' });
    expect(held[0].payloadRef).toContain('Claim/absent');
  });

  it('an orphan EXPLAINED (its claim absent) holds, emitting no EXPLAINED_BY edge', () => {
    const { mutations, held } = projectClaimsWithIntegrity(
      [explained('Claim/absent', 'ClaimResponse/r-9', 'ExplanationOfBenefit/e-9')],
      deps,
    );
    expect(edgeTypes(mutations)).not.toContain(EXPLAINED_BY);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ kind: 'quarantine', reasonCode: 'orphan-claim-explanation', sourceRef: 'ExplanationOfBenefit/e-9' });
  });

  it('a claim present only in a PRIOR batch (knownClaims) is honored, not held', () => {
    const { mutations, held } = projectClaimsWithIntegrity(
      [adjudicated('Claim/c-earlier', 'ClaimResponse/r-2')],
      deps,
      { knownClaims: ['Claim/c-earlier'] },
    );
    expect(held).toHaveLength(0);
    expect(edgeTypes(mutations)).toContain(ADJUDICATED_BY);
  });

  it('holds reuse the dead-letter store and stay PHI-safe (ids/codes/refs only)', async () => {
    const store = createMemoryDeadLetterStore();
    const { held } = projectClaimsWithIntegrity([adjudicated('Claim/absent', 'ClaimResponse/r-9')], deps);
    const records = await holdOrphanClaims(held, store);
    expect(records).toHaveLength(1);
    const listed = await store.list({ kind: 'quarantine' });
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe('open');
    expect(listed[0].reasonCode).toBe('orphan-claim-response');
    // PHI-safe: no member name / DOB / raw payload; only anchored id + codes + refs.
    const s = JSON.stringify(records[0]);
    expect(s).not.toContain('Patient/');
  });
});
