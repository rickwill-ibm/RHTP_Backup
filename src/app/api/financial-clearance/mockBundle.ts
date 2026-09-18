/**
 * Mock FHIR bundle builders for the Financial Clearance route (dev-mock mode).
 *
 * Extracted from `route.ts` (AI-CODING-CONVENTIONS §2/§3 — keep the route module
 * under the size cap). Pure helpers, no request/session state: in devMock mode the
 * route builds per-patient conditions/coverage/order from the patient registry so
 * every patient runs against their own clinical context (not Maria's seed bundle).
 */
import { getPatientById } from '@/lib/patientRegistry';

export interface BundleEntry {
  resource: { resourceType: string; id?: string; [k: string]: unknown };
}

// Inline PA scenario map — mirrors PATIENT_PA_SCENARIOS in api-explorer/page.tsx
// and devStubs.ts so mock mode is consistent across all three.
function mockScenarios(): {
  PATIENT_PA_SCENARIOS: Record<string, { cptCode: string; procedureName: string }>;
} {
  return {
    PATIENT_PA_SCENARIOS: {
      MARIA_SD_001: { cptCode: '72148', procedureName: 'MRI Lumbar Spine w/o Contrast' },
      'PAT-0042': { cptCode: '75561', procedureName: 'Cardiac MRI w/ and w/o contrast' },
      'PAT-0087': { cptCode: '93306', procedureName: 'Echocardiogram (complete transthoracic)' },
      'PAT-0103': { cptCode: '99243', procedureName: 'Nephrology office consultation' },
      'PAT-0156': { cptCode: '99244', procedureName: 'Pulmonology office consultation' },
    },
  };
}

/**
 * Build mock FHIR bundle entries from the patient registry for a given patient.
 * Used in devMock mode so every patient gets their own conditions/coverage,
 * not Maria's seed bundle every time.
 */
export function mockEntriesForPatient(patientId: string): BundleEntry[] {
  const p = getPatientById(patientId);
  if (!p) return [];
  const entries: BundleEntry[] = [];

  // Conditions
  for (const c of p.conditions ?? []) {
    entries.push({
      resource: {
        resourceType: 'Condition',
        id: c.key,
        subject: { reference: `Patient/${patientId}` },
        code: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: c.code, display: c.name }],
          text: c.name,
        },
        clinicalStatus: { coding: [{ code: c.status.toLowerCase().replace(' ', '-') }] },
        onsetDateTime: c.onset,
      },
    });
  }

  // ServiceRequest — use the patient's primary PA scenario CPT code
  const { PATIENT_PA_SCENARIOS } = mockScenarios();
  const scenario = PATIENT_PA_SCENARIOS[patientId] ?? PATIENT_PA_SCENARIOS['MARIA_SD_001'];
  entries.push({
    resource: {
      resourceType: 'ServiceRequest',
      id: `sr-${patientId}`,
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${patientId}` },
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: scenario.cptCode,
            display: scenario.procedureName,
          },
        ],
        text: scenario.procedureName,
      },
      requester: { display: p.pcp },
    },
  });

  // Coverage
  entries.push({
    resource: {
      resourceType: 'Coverage',
      id: `cov-${patientId}`,
      status: 'active',
      beneficiary: { reference: `Patient/${patientId}` },
      payor: [{ display: p.contract }],
    },
  });

  return entries;
}
