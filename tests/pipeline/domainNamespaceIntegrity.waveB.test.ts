import { describe, it, expect } from 'vitest';
// Import from the EXACT pinned module paths (L3) — the import itself pins the paths.
// Wave B (referrals + immunizations) namespace pins live here, split out of
// tests/pipeline/domainNamespaceIntegrity.test.ts to keep each pinning file under
// the AI-CODING-CONVENTIONS test size cap while the two waves grow it in parallel.
// Same guarantee as the parent file (F-C1 lesson): every surface — adapter, spec,
// both registries — must agree on the domain id, node kinds, and edge types.
import { referralAdapter } from '@/lib/pipeline/adapters/referral';
import {
  referralSpec,
  REFERRAL_DOMAIN,
  SERVICE_REQUEST_KIND,
  REFERRED_VIA,
  REFERRED_TO,
} from '@/lib/graph/mapping/referral';
import { immunizationAdapter } from '@/lib/pipeline/adapters/immunization';
import {
  immunizationSpec,
  IMMUNIZATION_DOMAIN,
  IMMUNIZATION_KIND,
  IMMUNIZED_WITH,
} from '@/lib/graph/mapping/immunization';
import { claimsFinancialAdapter } from '@/lib/pipeline/adapters/claimsFinancial';
import {
  claimsFinancialSpec,
  CLAIMS_FINANCIAL_DOMAIN,
  CLAIM_KIND,
  CLAIM_RESPONSE_KIND,
  EOB_KIND,
  HAS_CLAIM,
  ADJUDICATED_BY,
  EXPLAINED_BY,
} from '@/lib/graph/mapping/claimsFinancial';
import { priorAuthLifecycleAdapter } from '@/lib/pipeline/adapters/priorAuthLifecycle';
import {
  priorAuthLifecycleSpec,
  PA_LIFECYCLE_DOMAIN,
  PRIOR_AUTH_REQUEST_KIND,
  PA_STATUS_KIND,
  HAS_PA_REQUEST,
  HAS_PA_STATUS,
  PA_FOR_SERVICE,
  PA_FOR_CLAIM,
} from '@/lib/graph/mapping/priorAuthLifecycle';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { batchStep, defaultPipelineDeps, landStage, type PipelineDeps } from '@/lib/pipeline';
import type { C2Event } from '@/lib/outbox';
import referral from './fixtures/referral.json';
import immunization from './fixtures/immunization.json';
import claimsFinancial from './fixtures/claimsFinancial.json';
import priorAuthLifecycle from './fixtures/priorAuthLifecycle.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

// ─── referrals (wave B) ───────────────────────────────────────────────────────
const REFERRAL_PINNED = {
  domain: 'referrals',
  nodeKind: 'ServiceRequest',
  edgeTypes: { referredVia: 'REFERRED_VIA', referredTo: 'REFERRED_TO' },
  eventTypes: ['referral.requested'] as const,
} as const;

describe('domain namespace integrity — referrals', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(REFERRAL_DOMAIN).toBe(REFERRAL_PINNED.domain);
    expect(SERVICE_REQUEST_KIND).toBe(REFERRAL_PINNED.nodeKind);
    expect(REFERRED_VIA).toBe(REFERRAL_PINNED.edgeTypes.referredVia);
    expect(REFERRED_TO).toBe(REFERRAL_PINNED.edgeTypes.referredTo);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(referralAdapter.domain).toBe(REFERRAL_PINNED.domain);
    expect(referralSpec.domain).toBe(REFERRAL_PINNED.domain);
    expect(referralSpec.domain).toBe(REFERRAL_DOMAIN);
  });

  it('both registries carry the referrals surfaces', () => {
    expect(MAPPING_SPECS).toContain(referralSpec);
    for (const et of REFERRAL_PINNED.eventTypes) expect(specFor(et)).toBe(referralSpec);
    expect(referralAdapter.format).toBe('fhir-json');
    expect(referralAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the referrals spec', () => {
    const landed = landStage.run(
      { source: referralAdapter.source, format: 'fhir-json', payload: referral.payload },
      deps,
    );
    const records = batchStep(referralAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(REFERRAL_PINNED.domain);
      expect(specFor(r.eventType)).toBe(referralSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...REFERRAL_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kind + associative REFERRED_VIA (+ REFERRED_TO when a performer is referenced)', () => {
    const withPerformer = ev('referral.requested', {
      referralRef: 'ServiceRequest/s-1', serviceCode: { code: '103696004' },
      authoredOn: '2026-06-01', performerRef: 'Organization/org-1', provenance: 'referring-provider',
    });
    const nodeKinds = projectEvent(withPerformer, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(withPerformer, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    const referredVia = projectEvent(withPerformer, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === REFERRED_VIA)!;
    expect(nodeKinds).toContain(SERVICE_REQUEST_KIND);
    expect(edgeTypes).toEqual([REFERRED_VIA, REFERRED_TO]);
    expect(referredVia.semantics.kind).toBe('associative');

    // A referral with no performer emits only REFERRED_VIA (the performer ref, whose
    // real NPI/NPPES resolution is deferred to I8A, is simply absent).
    const noPerformer = ev('referral.requested', {
      referralRef: 'ServiceRequest/s-2', serviceCode: { code: '99242' },
      authoredOn: '2026-06-05', performerRef: '', provenance: 'referring-provider',
    });
    const soloEdges = projectEvent(noPerformer, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(soloEdges).toEqual([REFERRED_VIA]);
  });
});

// ─── immunizations (wave B) ───────────────────────────────────────────────────
const IMMUNIZATION_PINNED = {
  domain: 'immunizations',
  nodeKind: 'Immunization',
  edgeType: 'IMMUNIZED_WITH',
  eventTypes: ['immunization.administered'] as const,
} as const;

describe('domain namespace integrity — immunizations', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(IMMUNIZATION_DOMAIN).toBe(IMMUNIZATION_PINNED.domain);
    expect(IMMUNIZATION_KIND).toBe(IMMUNIZATION_PINNED.nodeKind);
    expect(IMMUNIZED_WITH).toBe(IMMUNIZATION_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(immunizationAdapter.domain).toBe(IMMUNIZATION_PINNED.domain);
    expect(immunizationSpec.domain).toBe(IMMUNIZATION_PINNED.domain);
    expect(immunizationSpec.domain).toBe(IMMUNIZATION_DOMAIN);
  });

  it('both registries carry the immunizations surfaces', () => {
    expect(MAPPING_SPECS).toContain(immunizationSpec);
    for (const et of IMMUNIZATION_PINNED.eventTypes) expect(specFor(et)).toBe(immunizationSpec);
    expect(immunizationAdapter.format).toBe('fhir-json');
    expect(immunizationAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the immunizations spec', () => {
    const landed = landStage.run(
      { source: immunizationAdapter.source, format: 'fhir-json', payload: immunization.payload },
      deps,
    );
    const records = batchStep(immunizationAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(IMMUNIZATION_PINNED.domain);
      expect(specFor(r.eventType)).toBe(immunizationSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...IMMUNIZATION_PINNED.eventTypes].sort());
  });

  it('the mapping projects exactly the pinned node kind + associative edge type', () => {
    const administered = ev('immunization.administered', {
      immunizationRef: 'Immunization/v-1', cvx: { code: '208' },
      occurrenceDateTime: '2026-03-01', provenance: 'immunization-registry',
    });
    const nodeKinds = projectEvent(administered, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(administered, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(nodeKinds).toContain(IMMUNIZATION_KIND);
    expect(edgeTypes).toEqual([IMMUNIZED_WITH]);
  });
});

// ─── claims-financial (wave B, iteration 7) ───────────────────────────────────
const CLAIMS_PINNED = {
  domain: 'claims-financial',
  nodeKinds: { claim: 'Claim', response: 'ClaimResponse', eob: 'ExplanationOfBenefit' },
  edgeTypes: { hasClaim: 'HAS_CLAIM', adjudicatedBy: 'ADJUDICATED_BY', explainedBy: 'EXPLAINED_BY' },
  eventTypes: ['claim.adjudicated', 'claim.explained', 'claim.submitted'] as const,
} as const;

describe('domain namespace integrity — claims-financial', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(CLAIMS_FINANCIAL_DOMAIN).toBe(CLAIMS_PINNED.domain);
    expect(CLAIM_KIND).toBe(CLAIMS_PINNED.nodeKinds.claim);
    expect(CLAIM_RESPONSE_KIND).toBe(CLAIMS_PINNED.nodeKinds.response);
    expect(EOB_KIND).toBe(CLAIMS_PINNED.nodeKinds.eob);
    expect(HAS_CLAIM).toBe(CLAIMS_PINNED.edgeTypes.hasClaim);
    expect(ADJUDICATED_BY).toBe(CLAIMS_PINNED.edgeTypes.adjudicatedBy);
    expect(EXPLAINED_BY).toBe(CLAIMS_PINNED.edgeTypes.explainedBy);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(claimsFinancialAdapter.domain).toBe(CLAIMS_PINNED.domain);
    expect(claimsFinancialSpec.domain).toBe(CLAIMS_PINNED.domain);
    expect(claimsFinancialSpec.domain).toBe(CLAIMS_FINANCIAL_DOMAIN);
  });

  it('both registries carry the claims-financial surfaces', () => {
    expect(MAPPING_SPECS).toContain(claimsFinancialSpec);
    for (const et of CLAIMS_PINNED.eventTypes) expect(specFor(et)).toBe(claimsFinancialSpec);
    expect(claimsFinancialAdapter.format).toBe('fhir-json');
    expect(claimsFinancialAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the claims-financial spec', () => {
    const landed = landStage.run(
      { source: claimsFinancialAdapter.source, format: 'fhir-json', payload: claimsFinancial.payload },
      deps,
    );
    const records = batchStep(claimsFinancialAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(CLAIMS_PINNED.domain);
      expect(specFor(r.eventType)).toBe(claimsFinancialSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...CLAIMS_PINNED.eventTypes].sort());
  });

  it('the mapping projects the chain node kinds + a CAUSAL ADJUDICATED_BY edge', () => {
    const adjudicated = ev('claim.adjudicated', {
      responseRef: 'ClaimResponse/cr-1', claimRef: 'Claim/c-1', outcome: 'complete',
      carcCodes: [], rarcCodes: [], created: '2026-04-05', provenance: 'payer-adjudication',
    });
    const kinds = projectEvent(adjudicated, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const adjudicatedBy = projectEvent(adjudicated, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === ADJUDICATED_BY)!;
    expect(kinds).toContain(CLAIM_RESPONSE_KIND);
    expect(adjudicatedBy.semantics.kind).toBe('causal');
  });
});

// ─── pa-lifecycle (wave B, iteration 7) ───────────────────────────────────────
const PA_LIFECYCLE_PINNED = {
  domain: 'pa-lifecycle',
  nodeKinds: { request: 'PriorAuthRequest', status: 'PaStatusEvent' },
  edgeTypes: { hasRequest: 'HAS_PA_REQUEST', hasStatus: 'HAS_PA_STATUS', forService: 'PA_FOR_SERVICE', forClaim: 'PA_FOR_CLAIM' },
  eventTypes: ['pa-lifecycle.captured'] as const,
} as const;

describe('domain namespace integrity — pa-lifecycle', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(PA_LIFECYCLE_DOMAIN).toBe(PA_LIFECYCLE_PINNED.domain);
    expect(PRIOR_AUTH_REQUEST_KIND).toBe(PA_LIFECYCLE_PINNED.nodeKinds.request);
    expect(PA_STATUS_KIND).toBe(PA_LIFECYCLE_PINNED.nodeKinds.status);
    expect(HAS_PA_REQUEST).toBe(PA_LIFECYCLE_PINNED.edgeTypes.hasRequest);
    expect(HAS_PA_STATUS).toBe(PA_LIFECYCLE_PINNED.edgeTypes.hasStatus);
    expect(PA_FOR_SERVICE).toBe(PA_LIFECYCLE_PINNED.edgeTypes.forService);
    expect(PA_FOR_CLAIM).toBe(PA_LIFECYCLE_PINNED.edgeTypes.forClaim);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(priorAuthLifecycleAdapter.domain).toBe(PA_LIFECYCLE_PINNED.domain);
    expect(priorAuthLifecycleSpec.domain).toBe(PA_LIFECYCLE_PINNED.domain);
    expect(priorAuthLifecycleSpec.domain).toBe(PA_LIFECYCLE_DOMAIN);
  });

  it('both registries carry the pa-lifecycle surfaces', () => {
    expect(MAPPING_SPECS).toContain(priorAuthLifecycleSpec);
    for (const et of PA_LIFECYCLE_PINNED.eventTypes) expect(specFor(et)).toBe(priorAuthLifecycleSpec);
    expect(priorAuthLifecycleAdapter.format).toBe('fhir-json');
    expect(priorAuthLifecycleAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the pa-lifecycle spec', () => {
    const landed = landStage.run(
      { source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: priorAuthLifecycle.payload },
      deps,
    );
    const records = batchStep(priorAuthLifecycleAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(PA_LIFECYCLE_PINNED.domain);
      expect(specFor(r.eventType)).toBe(priorAuthLifecycleSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...PA_LIFECYCLE_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kinds + a non-authoritative PriorAuthRequest', () => {
    const captured = ev('pa-lifecycle.captured', {
      paRef: 'PriorAuthRequest/pa-1', serviceRequestRef: 'ServiceRequest/sr-100', claimRef: 'Claim/c-1',
      currentStatus: 'approved', submittedAt: '2026-05-01', decisionAt: '2026-05-05',
      statusHistory: [
        { status: 'submitted', at: '2026-05-01', seq: 0 },
        { status: 'pending', at: '2026-05-02', seq: 1 },
        { status: 'approved', at: '2026-05-05', seq: 2 },
      ],
      provenance: 'pa-lifecycle-capture',
    });
    const upserts = projectEvent(captured, deps).filter((m): m is UpsertNode => m.op === 'UpsertNode');
    const kinds = upserts.map((m) => m.kind);
    const edgeTypes = projectEvent(captured, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(kinds).toContain(PRIOR_AUTH_REQUEST_KIND);
    expect(kinds).toContain(PA_STATUS_KIND);
    expect(edgeTypes).toContain(HAS_PA_REQUEST);
    expect(edgeTypes).toContain(HAS_PA_STATUS);
    // CAPTURE, not authority: the PriorAuthRequest node is non-authoritative.
    const paNode = upserts.find((m) => m.kind === PRIOR_AUTH_REQUEST_KIND)!;
    expect(paNode.properties.authoritative).toBe(false);
  });
});

/** Minimal C2 event for the projector-surface pinning assertions. */
function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-01T00:00:00Z', recordedAt: '2026-05-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'referral-hub', feed: 'referrals-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
