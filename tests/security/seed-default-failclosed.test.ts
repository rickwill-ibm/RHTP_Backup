/**
 * SECURITY — the dev-stub member resolver fails CLOSED for an unknown id.
 *
 * Root-cause coverage for the "default-to-seed-member" class: `profileFor` used to `?? MARIA_SD_001`,
 * so ANY well-formed but UNREGISTERED id resolved to the seed member's real demographics / prior-payer
 * id / PA history — a cross-member PHI mis-attribution surfaced by devMemberMatch, devBulkStatus,
 * devClaimResponseApproved AND the /api/fhir ClaimResponse branch (which reads devBulkStatus(pid).paHistory).
 * These assert the negative AT THE SOURCE, so a new ungated call site can't silently reintroduce it.
 */
import { describe, it, expect } from 'vitest';
import { profileFor, isKnownProfile } from '@/lib/server/devStubs.profiles';
import { devMemberMatch, devBulkStatus, devClaimResponseApproved } from '@/lib/server/devStubs';

// Real seed values that must NEVER surface under an unknown id.
const MARIA_FAMILY = 'Redhawk';
const MARIA_PRIOR_MEMBER_ID = 'AETNA-MBR-00182734';
const MARIA_PRIOR_PAYER = 'Aetna Medicaid SD';
const UNKNOWN = 'ZZZZ-UNKNOWN-9';

describe('profileFor / isKnownProfile — fail closed for an unknown id', () => {
  it('isKnownProfile is true for a seeded member, false for unknown/undefined', () => {
    expect(isKnownProfile('MARIA_SD_001')).toBe(true);
    expect(isKnownProfile(UNKNOWN)).toBe(false);
    expect(isKnownProfile(undefined)).toBe(false);
  });

  it('profileFor(unknown) returns the neutral placeholder, NOT the seed member', () => {
    const p = profileFor(UNKNOWN);
    expect(p.name).toBe('Unknown Member');
    expect(p.priorMemberId).not.toBe(MARIA_PRIOR_MEMBER_ID);
    expect(p.priorPayer).not.toBe(MARIA_PRIOR_PAYER);
    expect(p.paHistory).toEqual([]);
    expect(p.eobCount).toBe(0);
  });
});

describe('dev stubs never disclose the seed member under an unknown id', () => {
  it('devMemberMatch(unknown) does not return the seed member’s name or prior-payer id', () => {
    const r = devMemberMatch(UNKNOWN) as {
      parameter: { resource: { name: { family: string }[]; identifier: { value: string }[] } }[];
    };
    const res = r.parameter[0].resource;
    expect(res.name[0].family).not.toBe(MARIA_FAMILY);
    expect(res.identifier[0].value).not.toBe(MARIA_PRIOR_MEMBER_ID);
  });

  it('devBulkStatus(unknown) discloses NO PA history and zero resource counts (no seed export)', () => {
    const s = devBulkStatus(UNKNOWN);
    expect(s.paHistory).toEqual([]);
    expect(s.resourceCounts.ExplanationOfBenefit).toBe(0);
    expect(s.priorPayer).not.toBe(MARIA_PRIOR_PAYER);
  });

  it('devClaimResponseApproved(unknown) carries no seed member PA scenario', () => {
    const cr = devClaimResponseApproved('reviewer:1', UNKNOWN) as {
      type: { text: string };
      addItem: { productOrService: { coding: { code: string }[] } }[];
    };
    expect(cr.type.text).toBe('Unknown');
    expect(cr.addItem[0].productOrService.coding[0].code).toBe('');
  });

  it('a KNOWN member still resolves to real seeded data (fix does not blank real members)', () => {
    expect(devBulkStatus('MARIA_SD_001').paHistory.length).toBeGreaterThan(0);
    expect(devBulkStatus('MARIA_SD_001').priorPayer).toBe(MARIA_PRIOR_PAYER);
  });
});
