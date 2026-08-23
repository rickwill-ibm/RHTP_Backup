import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { projectEvent, type Mutation, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { SUBMITTED_BY, PROVIDER_IDENTITY_KIND } from '@/lib/graph/mapping/claimsFinancial';
import { PRESCRIBED_BY, DISPENSED_BY } from '@/lib/graph/mapping/medication';
import { HAS_CARE_TEAM, MEMBER_OF_CARE_TEAM } from '@/lib/graph/mapping/careteam';
import { providerNodeKey } from '@/lib/identity/provider';

/**
 * F5-b: claims / medication / care-team performer + prescriber refs RESOLVE to an
 * NPI-anchored ProviderIdentity node via the shared provider resolver. A ref with no
 * valid NPI stays raw + flagged deferred-I8A (E9: never invent an NPI). These tests
 * feed the projector directly (the mapping layer this wave owns).
 */
const deps = { now: () => 1_700_000_000_000 };

// A real, check-digit-valid NPI (NPPES 80840-prefixed Luhn) for the resolved cases.
const VALID_NPI = '1234567893';
// A 10-digit run whose check digit is WRONG -> not a valid NPI -> stays raw.
const INVALID_NPI = '1234567890';

function ev(eventType: string, source: { system: string; feed: string }, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-01T00:00:00Z', recordedAt: '2026-05-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { ...source, tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
function nodes(m: Mutation[]): UpsertNode[] { return m.filter((x): x is UpsertNode => x.op === 'UpsertNode'); }
function edges(m: Mutation[]): UpsertEdge[] { return m.filter((x): x is UpsertEdge => x.op === 'UpsertEdge'); }

const claimSrc = { system: 'claims-hub', feed: 'claims-financial-fhir' };
const medSrc = { system: 'rx-hub', feed: 'medication-fhir' };
const ctSrc = { system: 'care-hub', feed: 'care-team-fhir' };

describe('F5-b: claims billing provider resolves via the NPI resolver', () => {
  it('a valid NPI on the claim anchors a ProviderIdentity node + SUBMITTED_BY resolved edge', () => {
    const muts = projectEvent(ev('claim.submitted', claimSrc, {
      claimRef: 'Claim/c-1', claimType: 'professional', total: 250, created: '2026-04-01',
      providerRef: `Practitioner/prac-1`, providerNpi: VALID_NPI, providerName: 'Dr Rivera',
    }), deps);
    const pid = nodes(muts).find((n) => n.kind === PROVIDER_IDENTITY_KIND)!;
    expect(pid.key).toBe(providerNodeKey(VALID_NPI));
    expect(pid.properties.npi).toBe(VALID_NPI);
    expect(pid.properties.providerResolution).toBe('resolved');
    const edge = edges(muts).find((e) => e.type === SUBMITTED_BY)!;
    expect(edge.from).toEqual({ kind: 'Claim', key: 'Claim/c-1' });
    expect(edge.to).toEqual({ kind: PROVIDER_IDENTITY_KIND, key: providerNodeKey(VALID_NPI) });
    expect(edge.properties?.providerResolution).toBe('resolved');
  });

  it('an INVALID NPI keeps the provider raw + flagged deferred-I8A (E9: never invents an NPI)', () => {
    const muts = projectEvent(ev('claim.submitted', claimSrc, {
      claimRef: 'Claim/c-2', total: 100, created: '2026-04-02',
      providerRef: 'Practitioner/prac-2', providerNpi: INVALID_NPI,
    }), deps);
    expect(nodes(muts).some((n) => n.kind === PROVIDER_IDENTITY_KIND)).toBe(false);
    const raw = nodes(muts).find((n) => n.kind === 'Practitioner')!;
    expect(raw.key).toBe('Practitioner/prac-2');
    expect(raw.properties.providerResolution).toBe('deferred-I8A');
    const edge = edges(muts).find((e) => e.type === SUBMITTED_BY)!;
    expect(edge.to).toEqual({ kind: 'Practitioner', key: 'Practitioner/prac-2' });
    expect(edge.properties?.providerResolution).toBe('deferred-I8A');
    // The made-up NPI is NEVER used as a node key.
    expect(nodes(muts).some((n) => n.key === providerNodeKey(INVALID_NPI))).toBe(false);
  });

  it('no provider named on the claim emits no SUBMITTED_BY edge', () => {
    const muts = projectEvent(ev('claim.submitted', claimSrc, { claimRef: 'Claim/c-3', total: 5, created: '2026-04-03' }), deps);
    expect(edges(muts).some((e) => e.type === SUBMITTED_BY)).toBe(false);
  });
});

describe('F5-b: medication prescriber + dispenser resolve via the NPI resolver', () => {
  it('a valid prescriber NPI anchors a ProviderIdentity + PRESCRIBED_BY resolved edge', () => {
    const muts = projectEvent(ev('medication.prescribed', medSrc, {
      medicationRef: 'Medication/mr-1', rxNorm: { system: 'rxnorm', code: '310798' }, authoredOn: '2026-05-01',
      prescriberRef: 'Practitioner/pr-1', prescriberNpi: VALID_NPI,
    }), deps);
    const edge = edges(muts).find((e) => e.type === PRESCRIBED_BY)!;
    expect(edge.from).toEqual({ kind: 'Medication', key: 'Medication/mr-1' });
    expect(edge.to).toEqual({ kind: PROVIDER_IDENTITY_KIND, key: providerNodeKey(VALID_NPI) });
    expect(edge.properties?.providerResolution).toBe('resolved');
  });

  it('a dispenser ref carrying an embedded valid NPI resolves DISPENSED_BY (extracted from the ref)', () => {
    const muts = projectEvent(ev('medication.dispensed', medSrc, {
      dispenseRef: 'MedicationDispense/md-1', prescriptionRef: 'Medication/mr-1',
      rxNorm: { system: 'rxnorm', code: '310798' }, whenHandedOver: '2026-05-02',
      performerRef: `Organization/${VALID_NPI}`,
    }), deps);
    const edge = edges(muts).find((e) => e.type === DISPENSED_BY)!;
    expect(edge.to).toEqual({ kind: PROVIDER_IDENTITY_KIND, key: providerNodeKey(VALID_NPI) });
    expect(edge.properties?.providerResolution).toBe('resolved');
  });

  it('a prescriber ref with no NPI stays raw + flagged (deferred-I8A)', () => {
    const muts = projectEvent(ev('medication.prescribed', medSrc, {
      medicationRef: 'Medication/mr-2', rxNorm: { system: 'rxnorm', code: '310798' }, authoredOn: '2026-05-01',
      prescriberRef: 'Practitioner/no-npi',
    }), deps);
    expect(nodes(muts).some((n) => n.kind === PROVIDER_IDENTITY_KIND)).toBe(false);
    const edge = edges(muts).find((e) => e.type === PRESCRIBED_BY)!;
    expect(edge.properties?.providerResolution).toBe('deferred-I8A');
  });
});

describe('F5-b: care-team participants resolve via the NPI resolver', () => {
  it('a participant carrying a valid NPI resolves to a ProviderIdentity roster node', () => {
    const muts = projectEvent(ev('care-team.formed', ctSrc, {
      careTeamRef: 'CareTeam/ct-1', status: 'active', periodStart: '2026-03-01',
      participants: [
        { participantRef: 'Practitioner/pcp', kind: 'Practitioner', role: 'pcp', npi: VALID_NPI },
        { participantRef: 'CareManager/cm', kind: 'CareTeamMember', role: 'care-manager' },
      ],
    }), deps);
    const key = providerNodeKey(VALID_NPI);
    // The NPI participant is a ProviderIdentity node; the roster edges point to it.
    expect(nodes(muts).some((n) => n.kind === PROVIDER_IDENTITY_KIND && n.key === key)).toBe(true);
    const memberOf = edges(muts).filter((e) => e.type === MEMBER_OF_CARE_TEAM);
    expect(memberOf.some((e) => e.from.kind === PROVIDER_IDENTITY_KIND && e.from.key === key)).toBe(true);
    const hasTeam = edges(muts).filter((e) => e.type === HAS_CARE_TEAM);
    expect(hasTeam.some((e) => e.to.kind === PROVIDER_IDENTITY_KIND && e.to.key === key)).toBe(true);
    // The non-NPI participant stays a raw CareTeamMember (E9: unresolved stays raw).
    expect(hasTeam.some((e) => e.to.key === 'CareManager/cm')).toBe(true);
  });

  it('a participant with no valid NPI keeps its raw roster node kind (no ProviderIdentity)', () => {
    const muts = projectEvent(ev('care-team.formed', ctSrc, {
      careTeamRef: 'CareTeam/ct-2', status: 'active', periodStart: '2026-03-01',
      participants: [{ participantRef: 'Practitioner/pcp', kind: 'Practitioner', role: 'pcp' }],
    }), deps);
    expect(nodes(muts).some((n) => n.kind === PROVIDER_IDENTITY_KIND)).toBe(false);
    expect(nodes(muts).some((n) => n.kind === 'Practitioner' && n.key === 'Practitioner/pcp')).toBe(true);
  });
});
