/**
 * consentStatus.test.ts — the "lapsed consent renders as ACTIVE" class cannot recur.
 *
 * The defect: both consent surfaces stored `status` as a hardcoded literal, so four
 * records with expiry dates in 2025 and 2026-03 kept badging ACTIVE on 2026-09-27, and the
 * KPI tile read "Active Consents 4" while zero consents were in force. A care manager
 * reading ACTIVE shares the record and discloses PHI under a grant that lapsed 18 months
 * earlier.
 *
 * These tests pin (a) the derivation, (b) the MILLISECOND boundary — off-by-one at the
 * boundary is how this class survives a fix — and (c) that the tile counts and the table
 * rows come from one traversal and therefore cannot disagree.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  deriveConsentStatus,
  deriveConsentView,
  CONSENT_STATUSES,
  type ConsentLifecycle,
} from '@/lib/consent/consentStatus';
import {
  CONSENT_RECORDS,
  loadConsentView,
  mapFhirConsent,
  UNDATED_REVOCATION,
} from '@/lib/consent/consentRecords';

const NOW = '2026-09-27T00:00:00.000Z';

function lifecycle(over: Partial<ConsentLifecycle>): ConsentLifecycle {
  return { grantedDate: '2024-01-01', expiresDate: '2027-01-01', revokedDate: null, ...over };
}

describe('deriveConsentStatus — expiry boundary (off-by-one guard)', () => {
  it('a consent expiring EXACTLY at now is EXPIRED', () => {
    const at = deriveConsentStatus(
      lifecycle({ grantedDate: '2025-01-01T00:00:00.000Z', expiresDate: NOW }),
      NOW
    );
    expect(at).toBe('EXPIRED');
  });

  it('a consent expiring ONE MILLISECOND after now is ACTIVE', () => {
    const oneMsLater = deriveConsentStatus(
      lifecycle({
        grantedDate: '2025-01-01T00:00:00.000Z',
        expiresDate: '2026-09-27T00:00:00.001Z',
      }),
      NOW
    );
    expect(oneMsLater).toBe('ACTIVE');
  });

  it('a consent expiring ONE MILLISECOND before now is EXPIRED', () => {
    const oneMsEarlier = deriveConsentStatus(
      lifecycle({
        grantedDate: '2025-01-01T00:00:00.000Z',
        expiresDate: '2026-09-26T23:59:59.999Z',
      }),
      NOW
    );
    expect(oneMsEarlier).toBe('EXPIRED');
  });
});

describe('deriveConsentStatus — precedence and fail-closed defaults', () => {
  it('revoked beats an expiry that has NOT yet passed', () => {
    expect(
      deriveConsentStatus(lifecycle({ expiresDate: '2030-01-01', revokedDate: '2025-06-01' }), NOW)
    ).toBe('REVOKED');
  });

  it('an absent grant date is PENDING, never ACTIVE', () => {
    expect(deriveConsentStatus(lifecycle({ grantedDate: null }), NOW)).toBe('PENDING');
  });

  it('an unparseable grant date is PENDING — no ACTIVE without a proven grant', () => {
    expect(deriveConsentStatus(lifecycle({ grantedDate: '—' }), NOW)).toBe('PENDING');
  });

  it('an unparseable expiry is EXPIRED (fail-closed), never ACTIVE', () => {
    expect(deriveConsentStatus(lifecycle({ expiresDate: 'TBD' }), NOW)).toBe('EXPIRED');
    expect(deriveConsentStatus(lifecycle({ expiresDate: '—' }), NOW)).toBe('EXPIRED');
  });

  it('an absent expiry on a granted, unrevoked consent is an open-ended ACTIVE grant', () => {
    expect(deriveConsentStatus(lifecycle({ expiresDate: null }), NOW)).toBe('ACTIVE');
  });

  it('an unreadable clock throws rather than badging everything ACTIVE', () => {
    expect(() => deriveConsentStatus(lifecycle({}), 'not-a-date')).toThrow(/parseable instant/);
  });
});

describe('deriveConsentView — tiles and table cannot disagree', () => {
  it('counts sum to the record count and are tallied from the same derived rows', () => {
    const view = deriveConsentView(CONSENT_RECORDS, NOW);
    const total = CONSENT_STATUSES.reduce((sum, s) => sum + view.counts[s], 0);
    expect(total).toBe(view.records.length);
    for (const status of CONSENT_STATUSES) {
      expect(view.records.filter((r) => r.status === status)).toHaveLength(view.counts[status]);
    }
  });
});

describe('the seven seeded consent records as of 2026-09-27', () => {
  const view = loadConsentView(NOW);
  const byId = new Map(view.records.map((r) => [r.id, r]));

  it('ZERO consents are ACTIVE — every seeded expiry date is in the past', () => {
    expect(view.counts.ACTIVE).toBe(0);
  });

  it.each([
    ['cns-001', 'EXPIRED'], // expiry 2025-03-12 — was badged ACTIVE
    ['cns-002', 'EXPIRED'], // expiry 2026-03-12 — was badged ACTIVE
    ['cns-003', 'REVOKED'],
    ['cns-004', 'EXPIRED'], // expiry 2025-01-08 — was badged ACTIVE
    ['cns-005', 'EXPIRED'],
    ['cns-006', 'EXPIRED'], // expiry 2025-05-20 — was badged ACTIVE
    ['cns-007', 'PENDING'],
  ])('%s derives %s', (id, expected) => {
    expect(byId.get(id)?.status).toBe(expected);
  });

  it('a record still inside its period derives ACTIVE (the derivation is not stuck)', () => {
    const early = loadConsentView('2024-06-01T00:00:00.000Z');
    expect(early.records.find((r) => r.id === 'cns-001')?.status).toBe('ACTIVE');
    expect(early.counts.ACTIVE).toBeGreaterThan(0);
  });
});

describe('neither consent surface stores a status or a second copy of the seed', () => {
  const SURFACES = [
    'src/app/consent-sovereignty-panel/page.tsx',
    'src/app/admin-console/consent-governance/page.tsx',
  ];

  it.each(SURFACES)('%s declares no literal consent status', (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/status:\s*'(ACTIVE|EXPIRED|REVOKED|PENDING)'/);
  });

  it.each(SURFACES)('%s holds no duplicate of the seed records', (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/cns-00\d/);
  });

  it.each(SURFACES)('%s renders no unmasked patient name and no full MRN', (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/Maria Redhawk|Dorothy Simmons|James Whitfield|Rosa Gutierrez/);
    expect(src).not.toMatch(/MRN-\d{4}/);
  });

  it.each(SURFACES)('%s reads the clock through the injected seam, not Date.now()', (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).toMatch(/from '@\/lib\/clock'/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/new Date\(\)/);
  });
});

describe('mapFhirConsent — FHIR status translates to dates, fail-closed', () => {
  it('a rejected Consent with NO readable dates still derives REVOKED', () => {
    const mapped = mapFhirConsent({ id: 'c1', status: 'rejected', patient: { display: 'A B' } });
    expect(mapped.revokedDate).toBe(UNDATED_REVOCATION);
    expect(deriveConsentStatus(mapped, NOW)).toBe('REVOKED');
  });

  it('an inactive Consent with no period end cannot derive ACTIVE', () => {
    const mapped = mapFhirConsent({
      id: 'c2',
      status: 'inactive',
      dateTime: '2026-01-05T00:00:00Z',
      patient: { display: 'A B' },
    });
    expect(deriveConsentStatus(mapped, NOW)).toBe('EXPIRED');
  });

  it('an active Consent inside its period derives ACTIVE', () => {
    const mapped = mapFhirConsent({
      id: 'c3',
      status: 'active',
      dateTime: '2026-01-05T00:00:00Z',
      provision: { period: { start: '2026-01-05', end: '2027-01-05' } },
      patient: { display: 'A B' },
    });
    expect(deriveConsentStatus(mapped, NOW)).toBe('ACTIVE');
  });

  it('an active Consent whose period has ENDED derives EXPIRED', () => {
    const mapped = mapFhirConsent({
      id: 'c4',
      status: 'active',
      dateTime: '2024-01-05T00:00:00Z',
      provision: { period: { start: '2024-01-05', end: '2025-01-05' } },
      patient: { display: 'A B' },
    });
    expect(deriveConsentStatus(mapped, NOW)).toBe('EXPIRED');
  });

  it('a proposed Consent derives PENDING', () => {
    const mapped = mapFhirConsent({ id: 'c5', status: 'proposed', patient: { display: 'A B' } });
    expect(deriveConsentStatus(mapped, NOW)).toBe('PENDING');
  });

  it('projects the patient onto masked identifiers only', () => {
    const mapped = mapFhirConsent({
      id: 'c6',
      status: 'active',
      patient: { display: 'Maria Redhawk', reference: 'Patient/PAT-0006' },
      extension: [{ url: 'x/mrn', valueString: 'MRN-0006' }],
    });
    expect(mapped.patientDisplay).toBe('M. Redhawk');
    expect(mapped.mrnMasked).toBe('…0006');
  });

  it('junk input never throws and never derives ACTIVE', () => {
    const mapped = mapFhirConsent(null);
    expect(deriveConsentStatus(mapped, NOW)).not.toBe('ACTIVE');
  });
});

describe('PHI posture — the seed carries only masked identifiers', () => {
  it('no full patient name and no full MRN is stored in the seed', () => {
    const serialized = JSON.stringify(CONSENT_RECORDS);
    expect(serialized).not.toMatch(/Maria Redhawk|Dorothy Simmons|James Whitfield/);
    expect(serialized).not.toMatch(/MRN-\d{4}/);
  });

  it('every record exposes a masked display name and a masked MRN', () => {
    for (const record of CONSENT_RECORDS) {
      expect(record.patientDisplay).toMatch(/^[A-Z]\. /);
      expect(record.mrnMasked.startsWith('…')).toBe(true);
    }
  });

  it('no stored status field survives on the seed — status is derived only', () => {
    for (const record of CONSENT_RECORDS) {
      expect(record).not.toHaveProperty('status');
    }
  });
});
