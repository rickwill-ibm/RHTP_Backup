import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  validateOrderCode,
  validateNpi,
  validatePatientId,
  validateClearanceRequest,
  validateEvidenceId,
} from '@/lib/goldenThread/validate';
import { projectThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import { createFileEvidenceStore } from '@/lib/evidence/evidenceStore';
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import { createInMemoryEvidenceStore } from '@/lib/evidence/evidenceStore';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { createEvidenceRecord } from '@/lib/evidence';

/** Hardening — input validation, defensive projection, durable store, PHI-safety. */

describe('Input validators', () => {
  it('accepts valid CPT/HCPCS and rejects junk', () => {
    expect(validateOrderCode('72148').ok).toBe(true);
    expect(validateOrderCode('A9576').ok).toBe(true);
    expect(validateOrderCode('0523T').ok).toBe(true);
    expect(validateOrderCode('').ok).toBe(false);
    expect(validateOrderCode('1234').ok).toBe(false);
    expect(validateOrderCode('drop table').ok).toBe(false);
    expect(validateOrderCode(42).ok).toBe(false);
  });
  it('validates NPI (optional, else 10 digits)', () => {
    expect(validateNpi(undefined).ok).toBe(true); // optional
    expect(validateNpi('1730154782').ok).toBe(true);
    expect(validateNpi('abc').ok).toBe(false);
    expect(validateNpi('123').ok).toBe(false);
    // THE ASSERTION THAT WAS MISSING, and whose absence let a check-digit-invalid NPI sit in 26
    // files under a green test. This validator was `/^\d{10}$/`, so it passed ten of any digits —
    // including '1730154783', the demo reviewer of record, whose real check digit is 2. It now
    // delegates to the one NPPES 80840-Luhn implementation, and this is the case that proves it.
    expect(validateNpi('1730154783').ok).toBe(false); // same digits, wrong check digit
    expect(validateNpi('0000000000').ok).toBe(false); // ten digits, not an NPI
  });
  it('validates patientId characters', () => {
    expect(validatePatientId('MARIA_SD_001').ok).toBe(true);
    expect(validatePatientId('../etc/passwd').ok).toBe(false);
    expect(validatePatientId('a b').ok).toBe(false);
  });
  it('composite request validation returns the first failure', () => {
    expect(validateClearanceRequest({ orderCode: '72148' }).ok).toBe(true);
    expect(validateClearanceRequest({ orderCode: 'bad' }).ok).toBe(false);
    expect(validateClearanceRequest({ providerNpi: 'x' }).ok).toBe(false);
  });
  it('validates evidence ids', () => {
    expect(validateEvidenceId('ev-MARIA_SD_001-72148-123').ok).toBe(true);
    expect(validateEvidenceId('bad id!').ok).toBe(false);
    expect(validateEvidenceId(123).ok).toBe(false);
  });
});

describe('Defensive FHIR projection', () => {
  it('tolerates empty conditions and missing coverage/service request', () => {
    const p = projectThreadInputs({
      memberId: 'P1',
      conditions: [],
      serviceRequest: {
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '72148' }] },
      },
    });
    expect(p.order.code).toBe('72148');
    expect(p.coverage.payer).toBe('Unknown payer');
    expect(p.order.providerNpi).toBe('unknown');
    expect(p.member.diagnoses).toEqual([]);
  });
  it('does not throw on a malformed conditions value', () => {
    expect(() =>
      projectThreadInputs({
        memberId: 'P1',
        // @ts-expect-error deliberately malformed
        conditions: null,
        serviceRequest: {},
      })
    ).not.toThrow();
  });
});

describe('Durable evidence store (file)', () => {
  it('round-trips a record and rejects corrupt/missing', async () => {
    const dir = join(tmpdir(), `ev-test-${process.pid}`);
    const store = createFileEvidenceStore(dir);
    const rec = createEvidenceRecord({
      id: 'ev-x',
      memberId: 'M1',
      order: { code: '72148' },
      createdAt: '2026-07-26T00:00:00.000Z',
    });
    await store.save(rec);
    const got = await store.get('ev-x');
    expect(got?.id).toBe('ev-x');
    expect(await store.get('does-not-exist')).toBeNull();
    expect(await store.list()).toContain('ev-x');
  });
});

describe('PHI-safety of the clearance result', () => {
  it('the returned payload carries no PHI-bearing keys', async () => {
    const r = await runFinancialClearance(
      {
        member: { memberId: 'MARIA_SD_001', diagnoses: [] },
        order: {
          code: '72148',
          codeSystem: 'CPT',
          display: 'MRI',
          providerNpi: '1518998765',
          payer: 'UHC',
        },
        coverage: { status: 'active', payer: 'UHC', plan: 'Texas STAR' },
      },
      {
        library: loadMockLibrary(),
        goldCardSource: mockGoldCardDataSource,
        store: createInMemoryEvidenceStore(),
        ts: '2026-07-26T00:00:00.000Z',
        ids: {
          evidence: 'ev',
          determination: 'd',
          goldCard: 'g',
          propensity: 'p',
          eligibility: 'e',
          estimation: 'x',
        },
      }
    );
    const payload = JSON.stringify({
      eligibility: r.eligibility,
      medicalNecessity: r.medicalNecessity.vm,
      estimate: r.estimate,
      workItem: r.workItem,
    });
    for (const phi of ['"name"', '"birthDate"', '"telecom"', '"address"', '"ssn"']) {
      expect(payload.includes(phi)).toBe(false);
    }
  });
});
