/**
 * Clinical Write-Back — multi-resource and round-trip contract tests.
 * Sections 5+6 extracted from clinicalWriteBack.test.ts to stay under the 500-line cap.
 */
import { describe, it, expect, vi } from 'vitest';
import { storeCreate, storeRead, storeSearch } from '@/lib/fhir/store';

const TODAY_ISO = '2026-09-03';
const TODAY_DT = `${TODAY_ISO}T00:00:00.000Z`;

vi.mock('@/lib/clock', () => ({
  now: () => 1000,
  nowIso: () => TODAY_DT,
  nowDate: () => new Date(TODAY_DT),
}));

const PATIENT_ID = 'patient-maria-001';
const PRACTITIONER_ID = 'practitioner-dr-test-001';
const PRACTITIONER_NAME = 'Dr. Richard Williams';

// ─────────────────────────────────────────────────────────────────────────────
// 5. Multiple resources of same type persist independently
// ─────────────────────────────────────────────────────────────────────────────
describe('multiple clinical write-backs in one session', () => {
  it('two Conditions for the same patient are stored as separate resources', () => {
    const make = (code: string, display: string) =>
      storeCreate<{ id: string }>({
        resourceType: 'Condition',
        category: [{ coding: [{ code: 'problem-list-item' }] }],
        code: { coding: [{ code, display }], text: display },
        subject: { reference: `Patient/${PATIENT_ID}` },
        recordedDate: TODAY_ISO,
        recorder: { reference: `Practitioner/${PRACTITIONER_ID}`, display: PRACTITIONER_NAME },
      });

    const c1 = make('I10', 'Essential hypertension');
    const c2 = make('E11.65', 'Type 2 diabetes mellitus');

    expect(c1.id).not.toBe(c2.id);

    const found1 = storeRead('Condition', c1.id);
    const found2 = storeRead('Condition', c2.id);
    expect(found1).toBeDefined();
    expect(found2).toBeDefined();
  });

  it('two AllergyIntolerances for the same patient are both searchable', () => {
    const make = (substance: string) =>
      storeCreate<{ id: string }>({
        resourceType: 'AllergyIntolerance',
        clinicalStatus: { coding: [{ code: 'active' }], text: 'Active' },
        code: { text: substance },
        patient: { reference: `Patient/${PATIENT_ID}` },
        recordedDate: TODAY_ISO,
        recorder: { reference: `Practitioner/${PRACTITIONER_ID}` },
      });

    const a1 = make('Penicillin');
    const a2 = make('Sulfonamides');

    const bundle = storeSearch<{ entry?: Array<{ resource?: { id?: string } }> }>(
      'AllergyIntolerance',
      { patient: PATIENT_ID, 'clinical-status': 'active' }
    );
    const ids = (bundle.entry ?? []).map((e) => e.resource?.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
  });

  it('two MedicationRequests for the same patient both appear in active search', () => {
    const make = (name: string) =>
      storeCreate<{ id: string }>({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: { text: name },
        subject: { reference: `Patient/${PATIENT_ID}` },
        authoredOn: TODAY_DT,
        requester: { reference: `Practitioner/${PRACTITIONER_ID}`, display: PRACTITIONER_NAME },
      });

    const m1 = make('Lisinopril 10 mg');
    const m2 = make('Metformin 500 mg');

    const bundle = storeSearch<{ entry?: Array<{ resource?: { id?: string } }> }>(
      'MedicationRequest',
      { patient: PATIENT_ID, status: 'active' }
    );
    const ids = (bundle.entry ?? []).map((e) => e.resource?.id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FHIR store round-trip contract (R3 stub-legitimacy gate)
// ─────────────────────────────────────────────────────────────────────────────
describe('FHIR store round-trip (R3 stub-legitimacy)', () => {
  it('storeCreate assigns an id if none provided', () => {
    const created = storeCreate<{ id: string }>({
      resourceType: 'Condition',
      code: { text: 'Test condition' },
      subject: { reference: `Patient/${PATIENT_ID}` },
      recordedDate: TODAY_ISO,
    });
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
  });

  it('storeCreate uses provided id when given', () => {
    const created = storeCreate<{ id: string }>({
      resourceType: 'AllergyIntolerance',
      id: 'allergy-fixed-id-001',
      code: { text: 'Latex' },
      patient: { reference: `Patient/${PATIENT_ID}` },
    });
    expect(created.id).toBe('allergy-fixed-id-001');
  });

  it('storeRead returns undefined for a non-existent id', () => {
    const result = storeRead('Condition', 'non-existent-id-xyz-987');
    expect(result).toBeUndefined();
  });

  it('storeSearch returns Bundle resourceType', () => {
    const bundle = storeSearch<{ resourceType: string }>('MedicationRequest', {
      patient: PATIENT_ID,
      status: 'active',
    });
    expect(bundle.resourceType).toBe('Bundle');
  });

  it('storeSearch total reflects entry count', () => {
    const bundle = storeSearch<{ total?: number; entry?: unknown[] }>('Condition', {
      patient: PATIENT_ID,
      category: 'problem-list-item',
    });
    expect(bundle.total).toBe((bundle.entry ?? []).length);
  });
});
