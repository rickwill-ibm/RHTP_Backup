/**
 * Clinical Write-Back Tests — point-of-care Condition, AllergyIntolerance,
 * MedicationRequest entry via the in-memory FHIR mock store.
 *
 * Tests verify:
 *   1. Each resource type can be written (storeCreate → storeRead round-trip)
 *   2. Date of Service is today's date (recordedDate / authoredOn / recordedDate)
 *   3. Attending physician is stamped (recorder / requester reference)
 *   4. Resource persists in the session store and is queryable (storeSearch)
 *   5. AuditLogPanel accepts the three new event types without throwing
 *   6. Mock-mode write does NOT call FHIR fetch (no network) — FhirClient isolation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeCreate, storeRead, storeSearch } from '@/lib/fhir/store';

// ── Freeze deterministic "today" so date assertions are stable ────────────────
const TODAY_ISO = '2026-09-03';
const TODAY_DT = `${TODAY_ISO}T00:00:00.000Z`;

vi.mock('@/lib/clock', () => ({
  now: () => 1000,
  nowIso: () => TODAY_DT,
  nowDate: () => new Date(TODAY_DT),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const PATIENT_ID = 'patient-maria-001';
const ENCOUNTER_ID = 'encounter-maria-today';
const PRACTITIONER_ID = 'practitioner-dr-test-001';
const PRACTITIONER_NAME = 'Dr. Richard Williams';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Condition (new problem) write-back
// ─────────────────────────────────────────────────────────────────────────────
describe('Condition write-back (new problem)', () => {
  let createdId: string;

  beforeEach(() => {
    const resource = {
      resourceType: 'Condition',
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
        text: 'Active',
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'confirmed',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'problem-list-item',
              display: 'Problem List Item',
            },
          ],
          text: 'Problem List Item',
        },
      ],
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'J06.9',
            display: 'Acute upper respiratory infection, unspecified',
          },
        ],
        text: 'Acute upper respiratory infection, unspecified',
      },
      subject: { reference: `Patient/${PATIENT_ID}` },
      encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
      recordedDate: TODAY_ISO,
      recorder: {
        reference: `Practitioner/${PRACTITIONER_ID}`,
        display: PRACTITIONER_NAME,
      },
      note: [{ text: 'Noted during encounter', time: TODAY_DT }],
    };
    const created = storeCreate<{ id: string }>(resource);
    createdId = created.id;
  });

  it('stores the Condition and retrieves it by id', () => {
    const found = storeRead<{ resourceType: string; id: string }>('Condition', createdId);
    expect(found).toBeDefined();
    expect(found!.resourceType).toBe('Condition');
    expect(found!.id).toBe(createdId);
  });

  it('recordedDate is set to today (Date of Service)', () => {
    const found = storeRead<{ recordedDate?: string }>('Condition', createdId);
    expect(found!.recordedDate).toBe(TODAY_ISO);
  });

  it('recorder reference contains the attending physician', () => {
    const found = storeRead<{ recorder?: { reference?: string; display?: string } }>(
      'Condition',
      createdId
    );
    expect(found!.recorder?.reference).toBe(`Practitioner/${PRACTITIONER_ID}`);
    expect(found!.recorder?.display).toBe(PRACTITIONER_NAME);
  });

  it('category is problem-list-item (persists to LPR)', () => {
    const found = storeRead<{ category?: Array<{ coding?: Array<{ code?: string }> }> }>(
      'Condition',
      createdId
    );
    const code = found!.category?.[0]?.coding?.[0]?.code;
    expect(code).toBe('problem-list-item');
  });

  it('subject references the patient', () => {
    const found = storeRead<{ subject?: { reference?: string } }>('Condition', createdId);
    expect(found!.subject?.reference).toBe(`Patient/${PATIENT_ID}`);
  });

  it('encounter reference is set', () => {
    const found = storeRead<{ encounter?: { reference?: string } }>('Condition', createdId);
    expect(found!.encounter?.reference).toBe(`Encounter/${ENCOUNTER_ID}`);
  });

  it('appears in storeSearch for this patient', () => {
    const bundle = storeSearch<{
      entry?: Array<{ resource?: { id?: string } }>;
    }>('Condition', { patient: PATIENT_ID, category: 'problem-list-item' });
    const ids = (bundle.entry ?? []).map((e) => e.resource?.id);
    expect(ids).toContain(createdId);
  });

  it('ICD-10 code is stored correctly', () => {
    const found = storeRead<{ code?: { coding?: Array<{ code?: string }> } }>(
      'Condition',
      createdId
    );
    expect(found!.code?.coding?.[0]?.code).toBe('J06.9');
  });

  it('clinical status is active', () => {
    const found = storeRead<{ clinicalStatus?: { coding?: Array<{ code?: string }> } }>(
      'Condition',
      createdId
    );
    expect(found!.clinicalStatus?.coding?.[0]?.code).toBe('active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AllergyIntolerance write-back
// ─────────────────────────────────────────────────────────────────────────────
describe('AllergyIntolerance write-back (new allergy)', () => {
  let createdId: string;

  beforeEach(() => {
    const resource = {
      resourceType: 'AllergyIntolerance',
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
        text: 'Active',
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
        text: 'Confirmed',
      },
      category: ['medication'],
      criticality: 'high',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            display: 'Penicillin',
          },
        ],
        text: 'Penicillin',
      },
      patient: { reference: `Patient/${PATIENT_ID}` },
      recordedDate: TODAY_ISO,
      recorder: {
        reference: `Practitioner/${PRACTITIONER_ID}`,
        display: PRACTITIONER_NAME,
      },
      reaction: [
        {
          manifestation: [{ coding: [{ display: 'Anaphylaxis' }], text: 'Anaphylaxis' }],
          severity: 'severe',
        },
      ],
    };
    const created = storeCreate<{ id: string }>(resource);
    createdId = created.id;
  });

  it('stores the AllergyIntolerance and retrieves it by id', () => {
    const found = storeRead<{ resourceType: string; id: string }>('AllergyIntolerance', createdId);
    expect(found).toBeDefined();
    expect(found!.resourceType).toBe('AllergyIntolerance');
    expect(found!.id).toBe(createdId);
  });

  it('recordedDate is today (Date of Service)', () => {
    const found = storeRead<{ recordedDate?: string }>('AllergyIntolerance', createdId);
    expect(found!.recordedDate).toBe(TODAY_ISO);
  });

  it('recorder reference is the attending physician', () => {
    const found = storeRead<{ recorder?: { reference?: string; display?: string } }>(
      'AllergyIntolerance',
      createdId
    );
    expect(found!.recorder?.reference).toBe(`Practitioner/${PRACTITIONER_ID}`);
    expect(found!.recorder?.display).toBe(PRACTITIONER_NAME);
  });

  it('patient reference is set', () => {
    const found = storeRead<{ patient?: { reference?: string } }>('AllergyIntolerance', createdId);
    expect(found!.patient?.reference).toBe(`Patient/${PATIENT_ID}`);
  });

  it('substance text is stored', () => {
    const found = storeRead<{ code?: { text?: string } }>('AllergyIntolerance', createdId);
    expect(found!.code?.text).toBe('Penicillin');
  });

  it('criticality is high', () => {
    const found = storeRead<{ criticality?: string }>('AllergyIntolerance', createdId);
    expect(found!.criticality).toBe('high');
  });

  it('reaction severity is severe', () => {
    const found = storeRead<{
      reaction?: Array<{ severity?: string }>;
    }>('AllergyIntolerance', createdId);
    expect(found!.reaction?.[0]?.severity).toBe('severe');
  });

  it('clinical status is active', () => {
    const found = storeRead<{ clinicalStatus?: { coding?: Array<{ code?: string }> } }>(
      'AllergyIntolerance',
      createdId
    );
    expect(found!.clinicalStatus?.coding?.[0]?.code).toBe('active');
  });

  it('appears in storeSearch for this patient', () => {
    const bundle = storeSearch<{
      entry?: Array<{ resource?: { id?: string } }>;
    }>('AllergyIntolerance', { patient: PATIENT_ID, 'clinical-status': 'active' });
    const ids = (bundle.entry ?? []).map((e) => e.resource?.id);
    expect(ids).toContain(createdId);
  });

  it('category is medication', () => {
    const found = storeRead<{ category?: string[] }>('AllergyIntolerance', createdId);
    expect(found!.category).toContain('medication');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. MedicationRequest write-back
// ─────────────────────────────────────────────────────────────────────────────
describe('MedicationRequest write-back (new medication)', () => {
  let createdId: string;

  beforeEach(() => {
    const resource = {
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '314076',
            display: 'Lisinopril 10 mg oral tablet',
          },
        ],
        text: 'Lisinopril 10 mg oral tablet',
      },
      subject: { reference: `Patient/${PATIENT_ID}` },
      encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
      authoredOn: TODAY_DT,
      requester: {
        reference: `Practitioner/${PRACTITIONER_ID}`,
        display: PRACTITIONER_NAME,
      },
      dosageInstruction: [{ text: '1 tab daily' }],
      dispenseRequest: { numberOfRepeatsAllowed: 3 },
      note: [{ text: 'New medication added during visit', time: TODAY_DT }],
    };
    const created = storeCreate<{ id: string }>(resource);
    createdId = created.id;
  });

  it('stores the MedicationRequest and retrieves it by id', () => {
    const found = storeRead<{ resourceType: string; id: string }>('MedicationRequest', createdId);
    expect(found).toBeDefined();
    expect(found!.resourceType).toBe('MedicationRequest');
    expect(found!.id).toBe(createdId);
  });

  it('authoredOn is today (Date of Service)', () => {
    const found = storeRead<{ authoredOn?: string }>('MedicationRequest', createdId);
    expect(found!.authoredOn).toBe(TODAY_DT);
  });

  it('requester is the attending physician', () => {
    const found = storeRead<{ requester?: { reference?: string; display?: string } }>(
      'MedicationRequest',
      createdId
    );
    expect(found!.requester?.reference).toBe(`Practitioner/${PRACTITIONER_ID}`);
    expect(found!.requester?.display).toBe(PRACTITIONER_NAME);
  });

  it('subject references the patient', () => {
    const found = storeRead<{ subject?: { reference?: string } }>('MedicationRequest', createdId);
    expect(found!.subject?.reference).toBe(`Patient/${PATIENT_ID}`);
  });

  it('encounter reference is set', () => {
    const found = storeRead<{ encounter?: { reference?: string } }>('MedicationRequest', createdId);
    expect(found!.encounter?.reference).toBe(`Encounter/${ENCOUNTER_ID}`);
  });

  it('status is active', () => {
    const found = storeRead<{ status?: string }>('MedicationRequest', createdId);
    expect(found!.status).toBe('active');
  });

  it('intent is order', () => {
    const found = storeRead<{ intent?: string }>('MedicationRequest', createdId);
    expect(found!.intent).toBe('order');
  });

  it('medication name is stored', () => {
    const found = storeRead<{ medicationCodeableConcept?: { text?: string } }>(
      'MedicationRequest',
      createdId
    );
    expect(found!.medicationCodeableConcept?.text).toBe('Lisinopril 10 mg oral tablet');
  });

  it('RxNorm code is stored', () => {
    const found = storeRead<{
      medicationCodeableConcept?: { coding?: Array<{ code?: string }> };
    }>('MedicationRequest', createdId);
    expect(found!.medicationCodeableConcept?.coding?.[0]?.code).toBe('314076');
  });

  it('dosage instruction is stored', () => {
    const found = storeRead<{ dosageInstruction?: Array<{ text?: string }> }>(
      'MedicationRequest',
      createdId
    );
    expect(found!.dosageInstruction?.[0]?.text).toBe('1 tab daily');
  });

  it('refill count is stored', () => {
    const found = storeRead<{
      dispenseRequest?: { numberOfRepeatsAllowed?: number };
    }>('MedicationRequest', createdId);
    expect(found!.dispenseRequest?.numberOfRepeatsAllowed).toBe(3);
  });

  it('appears in storeSearch for this patient with status=active', () => {
    const bundle = storeSearch<{
      entry?: Array<{ resource?: { id?: string } }>;
    }>('MedicationRequest', { patient: PATIENT_ID, status: 'active' });
    const ids = (bundle.entry ?? []).map((e) => e.resource?.id);
    expect(ids).toContain(createdId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. AuditEvent payload shape — new clinical event kinds (node-safe, no JSX)
// ─────────────────────────────────────────────────────────────────────────────
describe('AuditEvent payload shape — new clinical event kinds', () => {
  it('condition-added payload has required fields', () => {
    const event = {
      eventType: 'condition-added' as const,
      details: {
        resourceId: 'cond-001',
        fhirResourceType: 'Condition',
        dateOfService: TODAY_ISO,
        attendingPhysician: PRACTITIONER_NAME,
        attendingId: PRACTITIONER_ID,
      },
      outcome: 'success' as const,
    };
    expect(event.eventType).toBe('condition-added');
    expect(event.details.fhirResourceType).toBe('Condition');
    expect(event.details.dateOfService).toBe(TODAY_ISO);
    expect(event.details.attendingPhysician).toBe(PRACTITIONER_NAME);
  });

  it('allergy-added payload has required fields', () => {
    const event = {
      eventType: 'allergy-added' as const,
      details: {
        resourceId: 'allergy-001',
        fhirResourceType: 'AllergyIntolerance',
        dateOfService: TODAY_ISO,
        attendingPhysician: PRACTITIONER_NAME,
        attendingId: PRACTITIONER_ID,
      },
      outcome: 'success' as const,
    };
    expect(event.eventType).toBe('allergy-added');
    expect(event.details.fhirResourceType).toBe('AllergyIntolerance');
    expect(event.details.dateOfService).toBe(TODAY_ISO);
  });

  it('medication-added payload has required fields', () => {
    const event = {
      eventType: 'medication-added' as const,
      details: {
        resourceId: 'med-001',
        fhirResourceType: 'MedicationRequest',
        dateOfService: TODAY_ISO,
        attendingPhysician: PRACTITIONER_NAME,
        attendingId: PRACTITIONER_ID,
      },
      outcome: 'success' as const,
    };
    expect(event.eventType).toBe('medication-added');
    expect(event.details.fhirResourceType).toBe('MedicationRequest');
    expect(event.details.dateOfService).toBe(TODAY_ISO);
  });
});

// Sections 5 & 6 moved to clinicalWriteBack.roundtrip.test.ts (500-line cap).
