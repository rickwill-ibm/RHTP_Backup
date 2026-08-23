import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { projectEvent, type Mutation, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { CLAIM_RESPONSE_KIND, ADJUDICATED_BY } from '@/lib/graph/mapping/claimsFinancial';
import { deriveMemberLiability, normalizeGroups } from '@/lib/graph/mapping/carcGroup';
import {
  routeAdjustmentCodes,
  CARC_SYSTEM_URI,
  RARC_SYSTEM_URI,
} from '@/lib/graph/mapping/adjustmentTerminology';
import { createSeedTerminologyService } from '@/lib/terminology';

/**
 * F5: capture the X12 CARC GROUP (CO/PR/OA/PI) on the adjudication so member
 * liability is derivable (CO write-off vs PR member-owes), and route CARC/RARC codes
 * through the stage-4 terminology gate. E9: a MISSING group never defaults a
 * liability (it is 'indeterminate').
 */
const deps = { now: () => 1_700_000_000_000 };

function ev(payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType: 'claim.adjudicated', eventVersion: '1.0',
    occurredAt: '2026-04-14T00:00:00Z', recordedAt: '2026-04-14T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'claims-hub', feed: 'claims-financial-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
function responseNode(m: Mutation[]): UpsertNode {
  return m.filter((x): x is UpsertNode => x.op === 'UpsertNode').find((n) => n.kind === CLAIM_RESPONSE_KIND)!;
}
function adjEdge(m: Mutation[]): UpsertEdge {
  return m.filter((x): x is UpsertEdge => x.op === 'UpsertEdge').find((e) => e.type === ADJUDICATED_BY)!;
}

describe('CARC group derivation (pure)', () => {
  it('PR anywhere -> member-responsibility', () => {
    expect(deriveMemberLiability(['CO', 'PR'])).toBe('member-responsibility');
  });
  it('groups present without PR -> not-member-responsibility (write-off / payer)', () => {
    expect(deriveMemberLiability(['CO'])).toBe('not-member-responsibility');
    expect(deriveMemberLiability(['PI', 'OA'])).toBe('not-member-responsibility');
  });
  it('E9: no group -> indeterminate, never a defaulted liability', () => {
    expect(deriveMemberLiability([])).toBe('indeterminate');
    expect(deriveMemberLiability(['ZZ'])).toBe('indeterminate'); // unrecognized -> no group
  });
  it('normalizeGroups keeps recognized X12 codes, de-duped in X12 order', () => {
    expect(normalizeGroups(['PR', 'CO', 'PR', 'nonsense'])).toEqual(['CO', 'PR']);
  });
});

describe('CARC group is captured on the adjudication (member liability derivable)', () => {
  it('a CO write-off denial derives not-member-responsibility on node + edge', () => {
    const muts = projectEvent(ev({
      responseRef: 'ClaimResponse/r-1', claimRef: 'Claim/c-1', outcome: 'error', disposition: 'denied',
      carcCodes: ['197'], rarcCodes: ['N130'], carcGroups: ['CO'], created: '2026-04-14',
    }), deps);
    const node = responseNode(muts);
    expect(node.properties.carcGroups).toEqual(['CO']);
    expect(node.properties.memberLiability).toBe('not-member-responsibility');
    expect(adjEdge(muts).properties?.memberLiability).toBe('not-member-responsibility');
  });

  it('a PR denial derives member-responsibility (the member owes)', () => {
    const muts = projectEvent(ev({
      responseRef: 'ClaimResponse/r-2', claimRef: 'Claim/c-2', outcome: 'error',
      carcCodes: ['1'], carcGroups: ['PR'], created: '2026-04-14',
    }), deps);
    expect(responseNode(muts).properties.memberLiability).toBe('member-responsibility');
  });

  it('E9: an adjudication with NO CARC group does not default a liability', () => {
    const muts = projectEvent(ev({
      responseRef: 'ClaimResponse/r-3', claimRef: 'Claim/c-3', outcome: 'error', carcCodes: ['197'], created: '2026-04-14',
    }), deps);
    const node = responseNode(muts);
    expect(node.properties.carcGroups).toEqual([]);
    expect(node.properties.memberLiability).toBe('indeterminate');
  });
});

describe('CARC/RARC route through the stage-4 terminology gate', () => {
  it('each CARC + RARC code is routed through the gate and returns a PHI-safe finding', () => {
    const service = createSeedTerminologyService();
    const findings = routeAdjustmentCodes(['197'], ['N130'], service);
    expect(findings).toHaveLength(2);
    const carc = findings.find((f) => f.category === 'CARC')!;
    expect(carc).toMatchObject({ system: CARC_SYSTEM_URI, code: '197' });
    const rarc = findings.find((f) => f.category === 'RARC')!;
    expect(rarc).toMatchObject({ system: RARC_SYSTEM_URI, code: 'N130' });
    // X12 is not a governed value set yet -> fail-safe 'ungoverned', never fabricated valid.
    expect(carc.status).toBe('ungoverned');
    expect(rarc.status).toBe('ungoverned');
    // PHI-safe: category + system + code + status only.
    expect(Object.keys(carc).sort()).toEqual(['category', 'code', 'status', 'system']);
  });

  it('empty adjustment lists route to no findings', () => {
    expect(routeAdjustmentCodes([], [], createSeedTerminologyService())).toEqual([]);
  });
});
