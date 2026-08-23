/**
 * F5 provider identity — NPI validation + NPPES-seam resolution + graph node.
 *
 * Proves:
 *  - a valid NPI passes the NPPES 80840-prefixed Luhn check;
 *  - an NPI with a bad check digit (and mis-shaped input) is REJECTED;
 *  - a provider ref carrying a valid NPI resolves to an NPI-anchored
 *    ProviderIdentity, enriched from the seeded directory;
 *  - production with no NPPES client wired fails closed (NppesNotConfiguredError);
 *  - E9: an invalid NPI never resolves to a fabricated identity;
 *  - a referral performer with a valid NPI now projects a ProviderIdentity node
 *    (not a raw string), while one with no NPI stays raw + deferred-I8A.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import {
  isValidNpi,
  isNpiShaped,
  assertValidNpi,
  extractNpi,
  InvalidNpiError,
  resolveProvider,
  anchorProviderRef,
  getProviderDirectory,
  setProductionProviderDirectory,
  seededProviderDirectory,
  NppesNotConfiguredError,
  PROVIDER_IDENTITY_KIND,
  providerNodeKey,
  type ProviderDirectory,
} from '@/lib/identity/provider';
import { projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { c2, fixedNow } from '../graph/helpers';

const deps = { now: fixedNow };

// Check-digit-valid NPIs (verified against the NPPES 80840 Luhn algorithm).
const VALID_NPI = '1234567893'; // seeded: Prairie Internal Medicine Clinic
const VALID_NPI_UNSEEDED = '1740077445'; // valid but NOT in the seed directory
const BAD_CHECK_DIGIT = '1234567894'; // last digit bumped -> check fails

afterEach(() => {
  clearSessionDataModes();
  setProductionProviderDirectory(null);
});

describe('NPI validation — NPPES 80840-prefixed Luhn', () => {
  it('accepts a valid NPI', () => {
    expect(isValidNpi(VALID_NPI)).toBe(true);
    expect(isValidNpi('1987654328')).toBe(true);
    expect(assertValidNpi(VALID_NPI)).toBe(VALID_NPI);
  });

  it('rejects an NPI with a bad check digit', () => {
    expect(isValidNpi(BAD_CHECK_DIGIT)).toBe(false);
    expect(() => assertValidNpi(BAD_CHECK_DIGIT)).toThrow(InvalidNpiError);
  });

  it('rejects mis-shaped input (not 10 digits, non-numeric)', () => {
    expect(isNpiShaped('123')).toBe(false);
    expect(isValidNpi('123456789')).toBe(false); // 9 digits
    expect(isValidNpi('12345678901')).toBe(false); // 11 digits
    expect(isValidNpi('12345abcde')).toBe(false);
    expect(() => assertValidNpi('123')).toThrow(InvalidNpiError);
  });

  it('extractNpi returns a valid NPI from a typed ref, null otherwise', () => {
    expect(extractNpi(`Practitioner/${VALID_NPI}`)).toBe(VALID_NPI);
    expect(extractNpi(`npi:${VALID_NPI}`)).toBe(VALID_NPI);
    expect(extractNpi('Organization/org-1')).toBeNull();
    // A 10-digit run that fails the check digit is NOT extracted (E9).
    expect(extractNpi(`Practitioner/${BAD_CHECK_DIGIT}`)).toBeNull();
  });
});

describe('provider resolution — seam-gated NPPES directory', () => {
  it('a ref carrying a valid, seeded NPI resolves to an enriched ProviderIdentity', async () => {
    setSessionDataMode('providerIdentity', 'seeded');
    const resolved = await resolveProvider({ rawRef: `Practitioner/${VALID_NPI}` });
    expect(resolved).not.toBeNull();
    expect(resolved).toMatchObject({
      npi: VALID_NPI,
      name: 'Prairie Internal Medicine Clinic',
      taxonomy: '207R00000X',
      source: 'nppes-seed',
    });
  });

  it('a valid but unseeded NPI resolves to the real anchor only (never a fabricated record)', async () => {
    setSessionDataMode('providerIdentity', 'mock');
    const resolved = await resolveProvider({ npi: VALID_NPI_UNSEEDED });
    expect(resolved).toEqual({ npi: VALID_NPI_UNSEEDED, source: 'inline' });
  });

  it('an explicit invalid NPI throws (E9: never anchored to a made-up NPI)', async () => {
    setSessionDataMode('providerIdentity', 'seeded');
    await expect(resolveProvider({ npi: BAD_CHECK_DIGIT })).rejects.toThrow(InvalidNpiError);
  });

  it('a rawRef with no valid NPI resolves to null (kept raw upstream, not invented)', async () => {
    setSessionDataMode('providerIdentity', 'seeded');
    expect(await resolveProvider({ rawRef: 'Organization/org-1' })).toBeNull();
    expect(anchorProviderRef({ rawRef: 'Organization/org-1' })).toBeNull();
  });

  it('production without a wired NPPES client fails closed', () => {
    setSessionDataMode('providerIdentity', 'production');
    setProductionProviderDirectory(null);
    expect(() => getProviderDirectory()).toThrow(NppesNotConfiguredError);
  });

  it('production WITH a registered client uses it, never the seed', async () => {
    setSessionDataMode('providerIdentity', 'production');
    const live: ProviderDirectory = {
      id: 'fake-nppes',
      lookup: (npi) => ({ npi, name: 'Live NPPES Provider', source: 'nppes' }),
    };
    setProductionProviderDirectory(live);
    expect(getProviderDirectory()).toBe(live);
    const resolved = await resolveProvider({ npi: VALID_NPI });
    expect(resolved).toMatchObject({ name: 'Live NPPES Provider', source: 'nppes' });
  });

  it('mock/seeded return the seeded synthetic directory', () => {
    setSessionDataMode('providerIdentity', 'seeded');
    expect(getProviderDirectory()).toBe(seededProviderDirectory);
    setSessionDataMode('providerIdentity', 'mock');
    expect(getProviderDirectory()).toBe(seededProviderDirectory);
  });
});

describe('referral mapping — performer resolves to a ProviderIdentity node (F5)', () => {
  function referralEvent(payload: Record<string, unknown>) {
    return c2({ eventId: 'rf-npi', eventType: 'referral.requested', memberId: 'M1',
      occurredAt: '2026-06-01T00:00:00Z', payload });
  }

  it('a performer with a valid NPI projects a ProviderIdentity node, not a raw string', () => {
    const muts = projectEvent(
      referralEvent({
        referralRef: 'ServiceRequest/M1-s1', serviceCode: { code: '103696004' },
        authoredOn: '2026-06-01', performerRef: `Practitioner/${VALID_NPI}`,
        provenance: 'referring-provider',
      }),
      deps,
    );
    const node = muts.find(
      (m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === PROVIDER_IDENTITY_KIND,
    );
    expect(node).toBeDefined();
    expect(node!.key).toBe(providerNodeKey(VALID_NPI));
    // The projector anchors by validated NPI synchronously (source 'inline'); it
    // never calls the fail-closed NPPES seam, so no directory name is attached here.
    expect(node!.properties).toMatchObject({
      npi: VALID_NPI, providerResolution: 'resolved', resolutionSource: 'inline',
    });
    // No raw Practitioner node, and REFERRED_TO points at the resolved node.
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Practitioner')).toBe(false);
    const referredTo = muts.find(
      (m): m is UpsertEdge => m.op === 'UpsertEdge' && m.type === 'REFERRED_TO',
    );
    expect(referredTo!.to).toEqual({ kind: PROVIDER_IDENTITY_KIND, key: providerNodeKey(VALID_NPI) });
  });

  it('an explicit performerNpi resolves even when the ref is opaque; inline attrs carry', () => {
    const muts = projectEvent(
      referralEvent({
        referralRef: 'ServiceRequest/M1-s2', serviceCode: { code: '99242' },
        authoredOn: '2026-06-02', performerRef: 'Organization/org-9',
        performerNpi: '1555666779', performerName: 'Cardiology Group',
        performerOrganization: 'Plains Specialty Group', provenance: 'referring-provider',
      }),
      deps,
    );
    const node = muts.find(
      (m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === PROVIDER_IDENTITY_KIND,
    );
    // NPI-anchored key (not the opaque org ref); the projector anchors by validated
    // NPI + inline attrs synchronously (it never calls the fail-closed NPPES seam).
    expect(node!.key).toBe(providerNodeKey('1555666779'));
    expect(node!.properties).toMatchObject({
      npi: '1555666779', providerResolution: 'resolved',
      name: 'Cardiology Group', organization: 'Plains Specialty Group', resolutionSource: 'inline',
    });
  });

  it('a performer with NO valid NPI stays a raw + deferred-I8A ref (E9, unchanged)', () => {
    const muts = projectEvent(
      referralEvent({
        referralRef: 'ServiceRequest/M1-s3', serviceCode: { code: '99242' },
        authoredOn: '2026-06-03', performerRef: 'Organization/org-1',
        provenance: 'referring-provider',
      }),
      deps,
    );
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === PROVIDER_IDENTITY_KIND)).toBe(false);
    const raw = muts.find((m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === 'Organization');
    expect(raw!.properties).toMatchObject({
      rawRef: 'Organization/org-1', providerResolution: 'deferred-I8A',
    });
  });

  it('a performer whose NPI fails the check digit is NOT resolved (kept raw)', () => {
    const muts = projectEvent(
      referralEvent({
        referralRef: 'ServiceRequest/M1-s4', serviceCode: { code: '99242' },
        authoredOn: '2026-06-04', performerRef: 'Organization/org-2',
        performerNpi: BAD_CHECK_DIGIT, provenance: 'referring-provider',
      }),
      deps,
    );
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === PROVIDER_IDENTITY_KIND)).toBe(false);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Organization')).toBe(true);
  });
});
