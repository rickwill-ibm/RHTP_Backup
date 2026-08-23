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

export function detectSDoHNeeds(
  patient: Patient,
  alerts: UtilizationAlert[],
  careGaps: CareGap[]
): string[] {
  const needs: string[] = [];

  careGaps.forEach((gap) => {
    const isSocialGap =
      gap.measureName.toLowerCase().includes('social') ||
      gap.measureName.toLowerCase().includes('transportation') ||
      gap.measureName.toLowerCase().includes('childcare') ||
      gap.measureName.toLowerCase().includes('food') ||
      gap.measureName.toLowerCase().includes('housing') ||
      gap.measureName.toLowerCase().includes('wic') ||
      gap.measureName.toLowerCase().includes('snap') ||
      gap.measureName.toLowerCase().includes('liheap');
    if (!isSocialGap) return;

    if (
      gap.measureName.toLowerCase().includes('transportation') ||
      gap.measureName.toLowerCase().includes('transport')
    ) {
      needs.push(`Transportation barrier: ${gap.notes || 'documented'}`);
    }
    if (
      gap.measureName.toLowerCase().includes('childcare') ||
      gap.measureName.toLowerCase().includes('child care')
    ) {
      needs.push(`Childcare support: ${gap.notes || 'subsidy enrollment needed'}`);
    }
    if (
      gap.measureName.toLowerCase().includes('wic') ||
      gap.measureName.toLowerCase().includes('food') ||
      gap.measureName.toLowerCase().includes('snap')
    ) {
      needs.push(`Food security: ${gap.notes || 'benefit enrollment needed'}`);
    }
    if (
      gap.measureName.toLowerCase().includes('housing') ||
      gap.measureName.toLowerCase().includes('liheap') ||
      gap.measureName.toLowerCase().includes('utility')
    ) {
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
      urgent.push(`${gap.measureName} overdue by ${gap.daysOpen} days`);
    }
  });

  return urgent;
}
