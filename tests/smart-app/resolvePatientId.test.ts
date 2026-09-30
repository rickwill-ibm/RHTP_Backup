/**
 * resolvePatientId.test.ts — resolver chain: all ID forms × all patients.
 *
 * CONTRACT: resolvePatientId must:
 *   - Return the correct canonical FHIR ID for every ID form it advertises.
 *   - Return null (never demo patient) for unrecognised IDs.
 *   - Never call fetch in mock mode (pure static map lookups only).
 *
 * SEAM: patient-id-resolution — tests run against the same map data the
 * resolver uses in production so adding a patient requires updating both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies the resolver imports ─────────────────────────────────
// storeRead must return truthy for FHIR slugs that exist in the fixture store.
vi.mock('@/lib/fhir/store', () => ({
  DEMO_PATIENT_ID: 'patient-maria-001',
  storeRead: (rt: string, id: string) => {
    if (rt !== 'Patient') return undefined;
    const known = new Set([
      'patient-maria-001',
      'patient-dorothy-042',
      'patient-james-087',
      'patient-robert-103',
      'patient-lisa-156',
      'patient-alex-kirby',
      'patient-denise-fontaine',
    ]);
    return known.has(id) ? { resourceType: 'Patient', id } : undefined;
  },
}));

vi.mock('@/lib/patientRegistry', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/patientRegistry')>();
  return real;
});

// fetch must NOT be called in mock mode — guard it
const fetchSpy = vi.fn();
global.fetch = fetchSpy;

import { resolvePatientId } from '@/app/md-smart-launch/lib/resolvePatientId';

// ── Test data ────────────────────────────────────────────────────────────────
const PATIENTS = [
  {
    name: 'Maria Redhawk',
    fhirId: 'patient-maria-001',
    platformId: 'MARIA_SD_001',
    mrn: 'SD-448291',
    uuid: null, // no Connect360 UUID for Maria in seed
  },
  {
    name: 'Dorothy Simmons',
    fhirId: 'patient-dorothy-042',
    platformId: 'PAT-0042',
    mrn: 'MRN-0042',
    uuid: '5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb',
  },
  {
    name: 'James Wilson',
    fhirId: 'patient-james-087',
    platformId: 'PAT-0087',
    mrn: 'MRN-0087',
    uuid: '9c075c8e-9ed6-44ec-a059-80a5d5aaac68',
  },
  {
    name: 'Robert Chen',
    fhirId: 'patient-robert-103',
    platformId: 'PAT-0103',
    mrn: 'MRN-0103',
    uuid: '95fa3e42-7027-47f3-95a7-6c254bfe62a9',
  },
  {
    name: 'Lisa Thompson',
    fhirId: 'patient-lisa-156',
    platformId: 'PAT-0156',
    mrn: 'MRN-0156',
    uuid: '64b13566-9345-48b2-8da8-4011d9547721',
  },
  {
    // Added for full-roster coverage (UAT-2026-09): Alex Kirby (PAT-0200) is in
    // both the Cerner and Connect360 seed bundles and in every static ID map
    // (patientRegistry.data1/data4.ts, patientRegistry.idMaps.ts) but was
    // missing from this fixture list, so platform-id and uuid-static resolution
    // for her ran with zero test coverage. She has no MRN in her seed bundle
    // (patientRegistry.idMaps.ts comment: "Alex Kirby — no MRN in seed bundle"),
    // hence mrn: null and the mrn-static loop below filtering her out.
    name: 'Alex Kirby',
    fhirId: 'patient-alex-kirby',
    platformId: 'PAT-0200',
    mrn: null,
    uuid: '6a5fdc1a-d700-4d69-9ddd-3569543bda5b',
  },
  {
    name: 'Denise Fontaine',
    fhirId: 'patient-denise-fontaine',
    platformId: 'DENISE_NY_001',
    mrn: 'NY-882104',
    uuid: null,
  },
];

describe('resolvePatientId — mock mode', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  // ── Demo alias ─────────────────────────────────────────────────────────────
  it('returns demo patient for empty string', async () => {
    const r = await resolvePatientId('', true);
    expect(r?.canonicalFhirId).toBe('patient-maria-001');
    expect(r?.identifierSource).toBe('demo-alias');
  });

  it('returns demo patient for maria-redhawk-001 alias', async () => {
    const r = await resolvePatientId('maria-redhawk-001', true);
    expect(r?.identifierSource).toBe('demo-alias');
  });

  // ── FHIR slug passthrough ──────────────────────────────────────────────────
  for (const p of PATIENTS) {
    it(`fhir-slug passthrough: ${p.name}`, async () => {
      const r = await resolvePatientId(p.fhirId, true);
      expect(r?.canonicalFhirId).toBe(p.fhirId);
      expect(r?.identifierSource).toBe('fhir-slug');
    });
  }

  // ── Platform ID ────────────────────────────────────────────────────────────
  for (const p of PATIENTS) {
    it(`platform-id: ${p.name} (${p.platformId})`, async () => {
      const r = await resolvePatientId(p.platformId, true);
      expect(r?.canonicalFhirId).toBe(p.fhirId);
      expect(r?.identifierSource).toBe('platform-id');
    });
  }

  // ── MRN static map ─────────────────────────────────────────────────────────
  // Filtered like the UUID loop below: Alex Kirby has no MRN in her seed bundle.
  for (const p of PATIENTS.filter((x) => x.mrn)) {
    it(`mrn-static: ${p.name} (${p.mrn})`, async () => {
      const r = await resolvePatientId(p.mrn, true);
      expect(r?.canonicalFhirId).toBe(p.fhirId);
      expect(r?.identifierSource).toBe('mrn-static');
    });
  }

  // ── UUID static map ────────────────────────────────────────────────────────
  for (const p of PATIENTS.filter((x) => x.uuid)) {
    it(`uuid-static: ${p.name} (${p.uuid})`, async () => {
      const r = await resolvePatientId(p.uuid!, true);
      expect(r?.canonicalFhirId).toBe(p.fhirId);
      expect(r?.identifierSource).toBe('uuid-static');
    });
  }

  // ── UUID case-insensitive ──────────────────────────────────────────────────
  it('uuid-static: case-insensitive UUID match', async () => {
    const r = await resolvePatientId('5BC9FE31-5FFE-4C6B-A896-8EF63E4A4ACB', true);
    expect(r?.canonicalFhirId).toBe('patient-dorothy-042');
  });

  // ── patient/ prefix stripping ──────────────────────────────────────────────
  it('strips patient/ prefix before resolving', async () => {
    const r = await resolvePatientId('patient/PAT-0042', true);
    expect(r?.canonicalFhirId).toBe('patient-dorothy-042');
  });

  // ── Unknown IDs return null — never a wrong patient ───────────────────────
  it('returns null for a completely unknown ID', async () => {
    const r = await resolvePatientId('UNKNOWN-ID-99999', true);
    expect(r).toBeNull();
  });

  it('returns null for a random UUID not in the static map', async () => {
    const r = await resolvePatientId('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', true);
    expect(r).toBeNull();
  });

  // ── fetch is NEVER called in mock mode ────────────────────────────────────
  it('never calls fetch in mock mode for any ID form', async () => {
    await resolvePatientId('MRN-0042', true);
    await resolvePatientId('5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb', true);
    await resolvePatientId('PAT-0042', true);
    await resolvePatientId('patient-dorothy-042', true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('resolvePatientId — live mode (UUID/MRN not in static map)', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('calls /api/fhir/Patient?_id= for unknown UUID in live mode', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entry: [{ resource: { resourceType: 'Patient', id: 'live-patient-uuid-result' } }],
      }),
    });
    const r = await resolvePatientId('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', false);
    expect(r?.canonicalFhirId).toBe('live-patient-uuid-result');
    expect(r?.identifierSource).toBe('uuid-live');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('returns null when live UUID search finds nothing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ entry: [] }),
    });
    const r = await resolvePatientId('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', false);
    expect(r).toBeNull();
  });

  // ── EMPI PIXm path — MRN → UUID → FHIR GET ────────────────────────────────
  it('mrn-empi: EMPI returns UUID → resolves via static UUID map', async () => {
    // /api/empi/mrn-to-uuid returns a UUID that is in the static map
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uuid: '5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb' }),
    });
    const r = await resolvePatientId('MRN-UNKNOWN-EMPI', false);
    expect(r?.canonicalFhirId).toBe('patient-dorothy-042');
    expect(r?.identifierSource).toBe('mrn-empi');
    // Only the EMPI call was made — static UUID map resolved without a FHIR GET
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/empi/mrn-to-uuid');
  });

  it('mrn-empi: EMPI returns UUID not in static map → FHIR GET /Patient/{uuid}', async () => {
    // /api/empi/mrn-to-uuid returns an unknown UUID
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uuid: 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa' }),
    });
    // /api/fhir/Patient?_id=<uuid> returns the live patient
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entry: [{ resource: { resourceType: 'Patient', id: 'live-empi-resolved-patient' } }],
      }),
    });
    const r = await resolvePatientId('MRN-LIVE-EMPI', false);
    expect(r?.canonicalFhirId).toBe('live-empi-resolved-patient');
    expect(r?.identifierSource).toBe('mrn-empi');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/empi/mrn-to-uuid');
    expect(fetchSpy.mock.calls[1][0]).toContain('/api/fhir/');
  });

  it('mrn-live fallback: EMPI 404 → falls back to FHIR identifier search', async () => {
    // EMPI not configured → 404
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    // FHIR identifier search succeeds
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entry: [{ resource: { resourceType: 'Patient', id: 'live-patient-mrn-result' } }],
      }),
    });
    const r = await resolvePatientId('MRN-UNKNOWN', false);
    expect(r?.canonicalFhirId).toBe('live-patient-mrn-result');
    expect(r?.identifierSource).toBe('mrn-live');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null when both EMPI and FHIR identifier search find nothing', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ entry: [] }) });
    const r = await resolvePatientId('MRN-COMPLETELY-UNKNOWN', false);
    expect(r).toBeNull();
  });
});
