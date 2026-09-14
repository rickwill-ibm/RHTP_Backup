// useSummaryIdentity — resolved patient identity for MdPatientSummary.
// Extracted to satisfy AI-CODING-CONVENTIONS v2 §2 size ratchet.
import { mockPatients, mockCareGaps, mockHCCSuspects } from '@/lib/mockData';
import type { RiskTier } from '@/lib/mockData';
import {
  usePatient,
  useActiveMedications,
  useLabs,
  useVitals,
  useProblemList,
} from '@/lib/fhir/hooks';
import { bannerName } from '@/lib/fhir/types';
import { DEMO_PATIENT_ID } from '@/lib/fhir/store';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

export interface SummaryIdentity {
  isMockPatient: boolean;
  mockPatient: (typeof mockPatients)[number];
  careGaps: ReturnType<typeof mockCareGaps.filter>;
  hccSuspects: (typeof mockHCCSuspects)[number][];
  fhirMeds: ReturnType<typeof useActiveMedications>;
  fhirLabs: ReturnType<typeof useLabs>;
  fhirVitals: ReturnType<typeof useVitals>;
  fhirProblems: ReturnType<typeof useProblemList>;
  patientName: string;
  patientDob: string;
  patientGender: string;
  patientMrn: string;
  patientPayer: string;
  patientInsId: string;
  patientRafScore: number;
  patientRafDelta: number;
  patientErRisk: number;
  patientOpenGaps: number;
  patientHccSuspects: number;
  patientHccValue: number;
  patientRiskTier: RiskTier;
  patientInitials: string;
}

export function useSummaryIdentity(
  patientId: string,
  launchContext: SmartLaunchContext
): SummaryIdentity {
  const isMockPatient = patientId === DEMO_PATIENT_ID;
  const mockPatient = mockPatients.find((p) => p.id === launchContext.patientId) || mockPatients[0];
  const careGaps = mockCareGaps
    .filter(
      (g) =>
        g.patientId === mockPatient.id &&
        g.status === 'Open' &&
        (g.program === 'HEDIS' || g.program === 'MIPS')
    )
    .slice(0, 5);
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === mockPatient.id).slice(0, 3);
  const fhirPatient = usePatient(patientId);
  const fhirMeds = useActiveMedications(patientId);
  const fhirLabs = useLabs(patientId);
  const fhirVitals = useVitals(patientId);
  const fhirProblems = useProblemList(patientId);
  const patientName = fhirPatient.data
    ? bannerName(fhirPatient.data.name)
    : isMockPatient
      ? mockPatient.name
      : 'Unknown Patient';
  const patientDob = fhirPatient.data?.birthDate ?? (isMockPatient ? mockPatient.dob : '—');
  const patientGender = fhirPatient.data?.gender ?? (isMockPatient ? mockPatient.gender : '—');
  const patientMrn =
    fhirPatient.data?.identifier?.find((i) => i.type?.text === 'MRN' || i.system?.includes('mrn'))
      ?.value ?? (isMockPatient ? mockPatient.mrn : '—');
  const patientInitials = patientName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2);
  const patientRiskTier: RiskTier = (isMockPatient ? mockPatient.riskTier : 'Moderate') as RiskTier;
  return {
    isMockPatient,
    mockPatient,
    careGaps,
    hccSuspects,
    fhirMeds,
    fhirLabs,
    fhirVitals,
    fhirProblems,
    patientName,
    patientDob,
    patientGender,
    patientMrn,
    patientInitials,
    patientRiskTier,
    patientPayer: isMockPatient ? mockPatient.payer : '—',
    patientInsId: isMockPatient ? mockPatient.insuranceId : '—',
    patientRafScore: isMockPatient ? mockPatient.rafScore : 0,
    patientRafDelta: isMockPatient ? mockPatient.rafScoreDelta : 0,
    patientErRisk: isMockPatient ? mockPatient.predictedErRisk : 0,
    patientOpenGaps: isMockPatient ? mockPatient.openCareGaps : fhirProblems.data.length,
    patientHccSuspects: isMockPatient ? mockPatient.openHCCSuspects : 0,
    patientHccValue: isMockPatient ? mockPatient.hccSuspectValue : 0,
  };
}
