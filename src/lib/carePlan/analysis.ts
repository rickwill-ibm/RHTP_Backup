/**
 * Care Plan analysis — derive a PatientAnalysis from the raw plan input.
 *
 * Behavior-preserving extraction of the analysis half of
 * src/lib/services/carePlanGenerator.helpers.ts (Cycle 2 split).
 *
 * KNOWN LIMITATION (kept as-is this pass, see g5-careplan.md section 2 item 4):
 * detection is keyword matching on free-text measure names / descriptions,
 * not coded value sets. The keyword lists below are the frozen behavior.
 */
import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import type {
  Patient,
  HCCSuspect,
  CareGap,
  UtilizationAlert,
  ComprehensivePlanInput,
  PatientAnalysis,
} from './types';

export function analyzePatientData(input: ComprehensivePlanInput): PatientAnalysis {
  const { patient, hccSuspects, careGaps, alerts } = input;

  let overallPriority: 'Critical' | 'High' | 'Moderate' | 'Low' = 'Moderate';
  if (patient.riskTier === 'Critical' || alerts.some((a) => a.tier === 'Critical')) {
    overallPriority = 'Critical';
  } else if (patient.riskTier === 'High' || alerts.some((a) => a.tier === 'Important')) {
    overallPriority = 'High';
  } else if (patient.riskTier === 'Moderate') {
    overallPriority = 'Moderate';
  } else {
    overallPriority = 'Low';
  }

  const primaryConditions = [...new Set(hccSuspects.map((h) => h.hccDescription))];
  const specialtiesNeeded = identifySpecialties(hccSuspects, careGaps, alerts);
  const sdohNeeds = detectSDoHNeeds(patient, alerts, careGaps);
  const medicationIssues = identifyMedicationIssues(patient, alerts);
  const urgentActions = identifyUrgentActions(hccSuspects, careGaps, alerts);
  const totalRafDelta = hccSuspects.reduce((sum, h) => sum + h.estimatedRafDelta, 0);
  const totalRevenueDelta = hccSuspects.reduce((sum, h) => sum + h.estimatedRevenueDelta, 0);

  return {
    overallPriority,
    primaryConditions,
    hccOpportunities: hccSuspects,
    qualityGaps: careGaps,
    utilizationRisks: alerts,
    sdohNeeds,
    medicationIssues,
    specialtiesNeeded,
    urgentActions,
    totalRafDelta,
    totalRevenueDelta,
  };
}

export function identifySpecialties(
  hccSuspects: HCCSuspect[],
  careGaps: CareGap[],
  alerts: UtilizationAlert[]
): string[] {
  const specialties = new Set<string>();

  hccSuspects.forEach((hcc) => {
    if (hcc.hccDescription.toLowerCase().includes('diabetes')) specialties.add('Endocrinology');
    if (
      hcc.hccDescription.toLowerCase().includes('heart') ||
      hcc.hccDescription.toLowerCase().includes('hypertension') ||
      hcc.hccDescription.toLowerCase().includes('cardiac')
    )
      specialties.add('Cardiology');
    if (
      hcc.hccDescription.toLowerCase().includes('kidney') ||
      hcc.hccDescription.toLowerCase().includes('renal')
    )
      specialties.add('Nephrology');
    if (
      hcc.hccDescription.toLowerCase().includes('lung') ||
      hcc.hccDescription.toLowerCase().includes('copd') ||
      hcc.hccDescription.toLowerCase().includes('asthma')
    )
      specialties.add('Pulmonology');
  });

  if (hccSuspects.length > 3 || alerts.length > 2) specialties.add('Care Management');
  if (alerts.some((a) => a.description.toLowerCase().includes('social')))
    specialties.add('Social Work');

  return Array.from(specialties);
}

/**
 * The gap's human label, read DEFENSIVELY.
 *
 * The care-plan domain names it `measureName`; the patient registry names the same field
 * `name` (`CareGapEntry`). `/care-plan-monitor/[patientId]` used to hand registry-shaped
 * objects straight in behind an `as any`, and every keyword read below threw
 * `Cannot read properties of undefined (reading 'toLowerCase')`, taking the whole route down.
 * The cast is now gone (see `registryGaps.ts`), but this read stays: a label arriving under
 * either name, from a registry, a FHIR projection or a fixture, must never crash the engine.
 *
 * It is NOT a fail-open default: the label is descriptive text used for keyword detection,
 * not a status, consent, date or authority value. An unreadable label yields no detections,
 * which is the same outcome as a gap whose label matches nothing.
 *
 * EXPORTED because the SAME unguarded read exists at five more sites in this domain —
 * templates.ts:82 (`categorizeGap`), builder.ts:264 and :271 (`calculateImpact`),
 * holistic.ts:154 and :157, and referrals.ts:32. Those files are outside this change's
 * ownership, so they are reported rather than swept; each is reachable only by a caller that
 * bypasses `fromRegistryGaps`, and each should read the label through this function.
 */
export function gapLabel(gap: { measureName?: unknown; name?: unknown }): string {
  if (typeof gap.measureName === 'string' && gap.measureName !== '') return gap.measureName;
  if (typeof gap.name === 'string') return gap.name;
  return '';
}

export function detectSDoHNeeds(
  patient: Patient,
  alerts: UtilizationAlert[],
  careGaps: CareGap[]
): string[] {
  const needs: string[] = [];

  careGaps.forEach((gap) => {
    const label = gapLabel(gap).toLowerCase();
    const isSocialGap =
      label.includes('social') ||
      label.includes('transportation') ||
      label.includes('childcare') ||
      label.includes('food') ||
      label.includes('housing') ||
      label.includes('wic') ||
      label.includes('snap') ||
      label.includes('liheap');
    if (!isSocialGap) return;

    if (label.includes('transportation') || label.includes('transport')) {
      needs.push(`Transportation barrier: ${gap.notes || 'documented'}`);
    }
    if (label.includes('childcare') || label.includes('child care')) {
      needs.push(`Childcare support: ${gap.notes || 'subsidy enrollment needed'}`);
    }
    if (label.includes('wic') || label.includes('food') || label.includes('snap')) {
      needs.push(`Food security: ${gap.notes || 'benefit enrollment needed'}`);
    }
    if (label.includes('housing') || label.includes('liheap') || label.includes('utility')) {
      needs.push(`Housing/utility support: ${gap.notes || 'assistance needed'}`);
    }
  });

  alerts.forEach((alert) => {
    if (alert.description.toLowerCase().includes('readmission')) {
      needs.push('Post-discharge support needed');
    }
    if (
      alert.description.toLowerCase().includes('housing') &&
      !needs.some((n) => n.includes('Housing'))
    ) {
      needs.push('Housing stability support needed');
    }
  });

  return needs;
}

export function identifyMedicationIssues(patient: Patient, alerts: UtilizationAlert[]): string[] {
  const issues: string[] = [];
  const polyPharmacyAlert = alerts.find((a) => a.type === 'Poly-Pharmacy');
  if (polyPharmacyAlert) issues.push('Medication reconciliation needed - poly-pharmacy risk');
  if (patient.openHCCSuspects > 2)
    issues.push('Review medication adherence for chronic conditions');
  return issues;
}

export function identifyUrgentActions(
  hccSuspects: HCCSuspect[],
  careGaps: CareGap[],
  alerts: UtilizationAlert[]
): string[] {
  const urgent: string[] = [];

  hccSuspects.forEach((hcc) => {
    const daysUntilDeadline = Math.floor(
      (new Date(hcc.submissionDeadline).getTime() - clock.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDeadline < 30) {
      urgent.push(`HCC ${hcc.hccCode} documentation due in ${daysUntilDeadline} days`);
    }
  });

  alerts.forEach((alert) => {
    if (alert.tier === 'Critical') urgent.push(alert.description);
  });

  careGaps.forEach((gap) => {
    if (gap.status === 'Open' && gap.daysOpen > 60) {
      urgent.push(`${gapLabel(gap)} overdue by ${gap.daysOpen} days`);
    }
  });

  return urgent;
}
