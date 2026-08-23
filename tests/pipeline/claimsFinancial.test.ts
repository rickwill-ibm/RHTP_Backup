import { describe, it, expect } from 'vitest';
import {
  batchStep,
  claimsFinancialAdapter,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import claims from './fixtures/claimsFinancial.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/**
 * No PHI VALUE may appear in a quarantine record. Structured field PATHS
 * (e.g. `patient.reference`) are schema metadata and PHI-safe; what must never leak
 * is a member-identifier value or a resolved subject reference.
 */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['CLM-MEM', 'Patient/']) {
    expect(s).not.toContain(bad);
  }
}

describe('claims-financial FHIR-JSON BATCH adapter (Claim + ClaimResponse + EOB chain)', () => {
  it('normalizes the financial chain at T1 and quarantines the subject-less claim', () => {
    const landed = land({ source: claimsFinancialAdapter.source, format: 'fhir-json', payload: claims.payload });
    const out = batchStep(claimsFinancialAdapter)(landed, deps);

    // 7 in (2 chains of 3 + 1 malformed Claim) -> 6 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 7, loaded: 6, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-subject');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // Claim c-1: submitted, provider-authored, anchored member, dated from created.
    const claim = out.normalized.find((r) => r.fhirResourceId === 'Claim/c-1')!;
    expect(claim).toMatchObject({
      domain: 'claims-financial', resourceType: 'Claim', eventType: 'claim.submitted',
      tier: 'T1', provenance: 'provider-submitted',
    });
    expect(claim.memberId).toMatch(/^mem-/); // anchored, never the raw CLM-MEM-01
    expect(claim.idempotencyKey).toBe('claim:c-1');
    expect(claim.payload).toMatchObject({ claimRef: 'Claim/c-1', total: 250, use: 'claim' });
    expect(JSON.stringify(claim.payload)).not.toContain('CLM-MEM'); // no PHI in payload

    // ClaimResponse cr-1: adjudicates Claim/c-1, paid, no adjustment codes.
    const paid = out.normalized.find((r) => r.fhirResourceId === 'ClaimResponse/cr-1')!;
    expect(paid).toMatchObject({ resourceType: 'ClaimResponse', eventType: 'claim.adjudicated', provenance: 'payer-adjudication' });
    expect(paid.payload).toMatchObject({ claimRef: 'Claim/c-1', outcome: 'complete', carcCodes: [], rarcCodes: [] });

    // EOB eob-1: explains ClaimResponse/cr-1.
    const eob = out.normalized.find((r) => r.fhirResourceId === 'ExplanationOfBenefit/eob-1')!;
    expect(eob).toMatchObject({ resourceType: 'ExplanationOfBenefit', eventType: 'claim.explained', provenance: 'payer-eob' });
    expect(eob.payload).toMatchObject({ responseRef: 'ClaimResponse/cr-1', claimRef: 'Claim/c-1' });
  });

  it('a DENIAL ClaimResponse captures CARC + RARC adjustment codes (PHI-safe code lists)', () => {
    const landed = land({ source: claimsFinancialAdapter.source, format: 'fhir-json', payload: claims.payload });
    const out = batchStep(claimsFinancialAdapter)(landed, deps);
    const denied = out.normalized.find((r) => r.fhirResourceId === 'ClaimResponse/cr-2')!;
    expect(denied.payload).toMatchObject({ outcome: 'error', claimRef: 'Claim/c-2' });
    expect(denied.payload.carcCodes).toContain('197'); // CARC: prior-auth absent
    expect(denied.payload.rarcCodes).toContain('N130'); // RARC: consult plan benefits
  });

  it('every normalized claims-financial record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: claimsFinancialAdapter.source, format: 'fhir-json', payload: claims.payload });
    const out = batchStep(claimsFinancialAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(6);
    for (const r of out.normalized) expect(r.tier).toBe('T1');
  });
});

describe('end-to-end claims-financial pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a chain event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      claimsFinancialAdapter,
      { source: claimsFinancialAdapter.source, format: 'fhir-json', payload: claims.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 6, loaded: 6, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the subject-less claim
    expect(result.affectedMembers).toHaveLength(2); // two members, two chains
    expect(odeps.publisher.events).toHaveLength(6);
    const types = new Set(odeps.publisher.events.map((e) => e.eventType));
    expect(types).toEqual(new Set(['claim.submitted', 'claim.adjudicated', 'claim.explained']));
    for (const e of odeps.publisher.events) {
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
