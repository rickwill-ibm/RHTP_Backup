/**
 * DTR service — Documentation Templates & Rules.
 * Calls /api/dtr/evaluate (RHTP BFF) which wraps the Policy Engine in live
 * mode, or returns Maria-specific mock data in dev mode.
 */
import { postJson } from '@/lib/client/bff';
import type { DtrMatchResult } from '@/lib/pa/pa-types';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

export async function runDtrMatch(
  patientId: string,
  cptCode: string,
  procedureName: string
): Promise<DtrMatchResult> {
  const r = await postJson<DtrMatchResult>('/api/dtr/evaluate', { patientId, cptCode, procedureName });

  if (r.ok && r.data) {
    return r.data;
  }

  // Fallback to demo mock (BFF not reachable or policy engine offline)
  return getMockDtrResult(patientId, cptCode, procedureName);
}

// ── Maria Redhawk demo mock (CPT 72148 — Lumbar MRI) ─────────────────────────

function getMockDtrResult(
  patientId: string,
  cptCode: string,
  procedureName: string
): DtrMatchResult {
  const isMaria = patientId === DEMO_MEMBER_ID || cptCode === '72148';

  if (isMaria) {
    return {
      policyTitle: 'MRI Lumbar Spine — Medical Necessity Policy (CPT 72148)',
      cptCode: '72148',
      groups: [
        {
          id: 1,
          title: '≥ 6 Weeks Conservative Therapy',
          status: 'met',
          required: true,
          description:
            'Patient must have completed at least 6 weeks of conservative therapy (physical therapy, chiropractic, or analgesic medication management) without adequate relief prior to advanced imaging.',
          fhirQuery: {
            resourceType: 'Procedure',
            searchParam: 'code',
            system: 'http://snomed.info/sct',
            codes: ['229070002', '229070003'],
            valueComparison: '>= 6 weeks documented',
          },
          sourceExcerpt:
            'Coverage is available for lumbar MRI when the member has completed a minimum 6-week trial of conservative therapy without satisfactory improvement.',
          leaf: {
            code: 'SNOMED 229070002',
            label: 'Physical therapy — lumbar region',
            evidence: 'PT sessions documented 02/10/2026 – 03/28/2026 (7 weeks)',
            source: 'emr',
            recordedDate: '2026-03-28',
            performerName: 'Dr. James Whitfield MD',
          },
        },
        {
          id: 2,
          title: 'Neurological Deficit or Red Flag Symptom',
          status: 'gap',
          required: true,
          description:
            'Documentation must include at least one qualifying neurological deficit (radiculopathy, motor weakness, numbness/tingling in lower extremity) or a recognized red flag (bowel/bladder dysfunction, unexplained weight loss, fever).',
          fhirQuery: {
            resourceType: 'Condition',
            searchParam: 'code',
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            codes: ['M54.4', 'M54.3', 'G55', 'M47.816'],
          },
          sourceExcerpt:
            'Advanced imaging is appropriate when neurological deficit, radiculopathy, or a red flag symptom is documented in the clinical record.',
          candidateCodes: [
            { code: 'M54.4', system: 'http://hl7.org/fhir/sid/icd-10-cm', label: 'Lumbago with sciatica — right side' },
            { code: 'M54.3', system: 'http://hl7.org/fhir/sid/icd-10-cm', label: 'Sciatica' },
            { code: 'G55',   system: 'http://hl7.org/fhir/sid/icd-10-cm', label: 'Nerve root and plexus compressions in diseases classified elsewhere' },
            { code: 'M47.816', system: 'http://hl7.org/fhir/sid/icd-10-cm', label: 'Spondylosis with radiculopathy — lumbar region' },
          ],
        },
        {
          id: 3,
          title: 'Ordering Provider Specialty Appropriate',
          status: 'met',
          required: false,
          description:
            'Ordering provider must be a primary care physician, orthopedic surgeon, neurologist, or physiatrist. Orders from non-qualifying specialties require peer-to-peer review.',
          fhirQuery: {
            resourceType: 'PractitionerRole',
            searchParam: 'specialty',
            codes: ['394814009', '408461007'],
          },
          sourceExcerpt:
            'Requests from out-of-specialty providers are subject to additional review. PCP ordering is standard.',
          leaf: {
            code: 'NPI 1234567890',
            label: 'Dr. James Whitfield MD — Family Medicine / FQHC',
            evidence: 'PCP ordering — specialty confirmed in-network',
            source: 'emr',
          },
        },
      ],
      allMet: false,
    };
  }

  // Generic fallback for non-Maria CPT codes
  return {
    policyTitle: `${procedureName} — Medical Necessity Policy (CPT ${cptCode})`,
    cptCode,
    groups: [
      {
        id: 1,
        title: 'Clinical Indication Documented',
        status: 'met',
        leaf: {
          code: 'ICD-10 documented',
          label: 'Appropriate clinical indication on file',
          evidence: 'Diagnosis and clinical notes on file',
          source: 'emr',
        },
      },
      {
        id: 2,
        title: 'Conservative Treatment Attempted',
        status: 'gap',
        candidateCodes: [],
      },
    ],
    allMet: false,
  };
}
