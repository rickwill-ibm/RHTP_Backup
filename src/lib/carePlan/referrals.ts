/**
 * Care Plan referrals — auto-create referrals for open care gaps.
 *
 * Behavior-preserving extraction from carePlanGenerator.helpers.ts.
 *
 * KNOWN DEFECT, PRESERVED (FINDINGS F2 in CYCLE2B_REPORT): this mutates the
 * browser-memory referralStore DURING generation, before any clinician
 * review. The G5 target moves referral initiation to an approval-time
 * effect (draft ServiceRequests in the plan); that is a behavior change
 * out of scope for this extraction pass.
 */
import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { referralStore } from '@/lib/mockData';
import type { CareGap, Patient, Referral } from './types';
import { bonusForProgram } from './templates';

/** Keyword -> specialty routing (frozen legacy keyword behavior). */
const GAP_TO_SPECIALTY: Record<string, string> = {
  HbA1c: 'Endocrinology',
  Diabetes: 'Endocrinology',
  'Eye Exam': 'Ophthalmology',
  Retinal: 'Ophthalmology',
  Colorectal: 'Gastroenterology',
  'Blood Pressure': 'Cardiology',
  Hypertension: 'Cardiology',
  Kidney: 'Nephrology',
  Renal: 'Nephrology',
};

export function specialtyForGap(gap: CareGap): string {
  for (const [keyword, specialty] of Object.entries(GAP_TO_SPECIALTY)) {
    if (gap.measureName.toLowerCase().includes(keyword.toLowerCase())) return specialty;
  }
  return 'Primary Care';
}

/**
 * Create referrals for care gaps automatically.
 * Each care gap gets a referral to the appropriate specialist.
 */
export function createReferralsForCareGaps(
  patient: Patient,
  careGaps: CareGap[],
  _specialtiesNeeded: string[]
): Referral[] {
  const referrals: Referral[] = [];
  let referralCounter = 1;

  careGaps.forEach((gap) => {
    const specialistType = specialtyForGap(gap);
    const gainshareAmount = bonusForProgram(gap.program);

    // Persona-free id (conventions §1.2): slug derived from the member context, never a hardcoded name.
    const memberSlug = String(patient.id || 'member')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const referralId = `ref-${memberSlug}-${clock.now()}-${referralCounter++}`;

    const referral: Referral = {
      referralId,
      serviceRequestId: `sr-${referralId}`,
      patientName: patient.name,
      patientId: patient.id,
      patientDOB: patient.dob,
      referringProvider: patient.primaryCareProvider,
      referringOrganization: readOrganization(patient) ?? patient.primaryCareProvider,
      referralDate: clock.nowIso().split('T')[0],
      urgency: gap.daysOpen > 90 ? 'urgent' : 'routine',
      specialistType,
      clinicalNotes: `Referral for ${gap.measureName}. ${gap.notes}`,
      careGap: {
        measure: gap.measureId,
        description: gap.measureName,
        daysOpen: gap.daysOpen,
        gainshareAmount,
        targetCriteria: gap.closureRequirement,
        currentValue: `Gap open ${gap.daysOpen} days`,
      },
      status: 'pending',
      clinicalContext: {
        primaryDiagnosis: gap.measureName,
        icd10: gap.measureId,
      },
    };

    referrals.push(referral);
    referralStore.addReferral(referral);
  });

  return referrals;
}

/** Legacy read of a non-typed optional field, without an `any` cast. */
function readOrganization(patient: Patient): string | undefined {
  const value = (patient as unknown as Record<string, unknown>)['organization'];
  return typeof value === 'string' ? value : undefined;
}
