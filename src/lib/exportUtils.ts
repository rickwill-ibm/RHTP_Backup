import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
// ─── exportUtils.ts ───────────────────────────────────────────────────────────
// CSV download utilities. PDF generation → exportUtils.pdf.ts.

export type { PDFSection, DemoPatientExportRow } from './exportUtils.pdf';
export { generatePDFReport, generateDemoTrackPDF } from './exportUtils.pdf';
import type { DemoPatientExportRow } from './exportUtils.pdf';

// ─── CSV Export ───────────────────────────────────────────────────────────────

export function downloadCSV(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    // Wrap in quotes if contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Panel Cohort CSV ─────────────────────────────────────────────────────────

export interface PanelPatientRow {
  name: string;
  riskTier: string;
  rafScore: number;
  rafScoreDelta: number;
  predictedErRisk: number;
  openHCCSuspects: number;
  openCareGaps: number;
  pmpmCost: number;
  pmpmTarget: number;
  attributionStatus: string;
  lastContactDate: string;
  primaryCareProvider: string;
  payer: string;
}

export function exportPanelCSV(patients: PanelPatientRow[]) {
  const rows = patients.map((p) => ({
    'Patient Name': p.name,
    'Risk Tier': p.riskTier,
    'RAF Score': p.rafScore,
    'RAF Delta': p.rafScoreDelta,
    'ER Risk (%)': Math.round(p.predictedErRisk * 100),
    'HCC Suspects': p.openHCCSuspects,
    'Open Care Gaps': p.openCareGaps,
    'PMPM Cost ($)': p.pmpmCost,
    'PMPM Target ($)': p.pmpmTarget,
    'Attribution': p.attributionStatus,
    'Last Contact': p.lastContactDate,
    'PCP': p.primaryCareProvider,
    'Payer': p.payer,
  }));
  downloadCSV(`panel-cohort-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

// ─── Financial CSV ────────────────────────────────────────────────────────────

export interface FinancialPatientRow {
  name: string;
  riskTier: string;
  pmpmCost: number;
  pmpmTarget: number;
  rafScore: number;
  openHCCSuspects: number;
  hccSuspectValue: number;
  payer: string;
  attributionStatus: string;
}

export function exportFinancialCSV(patients: FinancialPatientRow[]) {
  const rows = patients.map((p) => ({
    'Patient Name': p.name,
    'Risk Tier': p.riskTier,
    'PMPM Cost ($)': p.pmpmCost,
    'PMPM Target ($)': p.pmpmTarget,
    'Variance ($)': p.pmpmCost - p.pmpmTarget,
    'RAF Score': p.rafScore,
    'HCC Suspects': p.openHCCSuspects,
    'HCC Revenue at Risk ($)': p.hccSuspectValue,
    'Payer': p.payer,
    'Attribution': p.attributionStatus,
  }));
  downloadCSV(`financial-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

// ─── Referral CSV ─────────────────────────────────────────────────────────────

export interface ReferralExportRow {
  id: string;
  patientName: string;
  referralDate: string;
  specialty: string;
  urgency: string;
  status: string;
  assignedProvider: string | null;
  providerTier: string | null;
  icdCode: string;
  icdDescription: string;
  submissionChannel: string | null;
  submittedDate: string | null;
  appointmentDate: string | null;
  closedDate: string | null;
  outcome: string | null;
  coordinatorName: string;
  daysOpen: number;
}

export function exportReferralsCSV(referrals: ReferralExportRow[]) {
  const rows = referrals.map((r) => ({
    'Referral ID': r.id,
    'Patient Name': r.patientName,
    'Referral Date': r.referralDate,
    'Specialty': r.specialty,
    'Urgency': r.urgency,
    'Status': r.status,
    'Assigned Provider': r.assignedProvider ?? 'Unassigned',
    'Provider Tier': r.providerTier ?? '',
    'ICD Code': r.icdCode,
    'ICD Description': r.icdDescription,
    'Submission Channel': r.submissionChannel ?? '',
    'Submitted Date': r.submittedDate ?? '',
    'Appointment Date': r.appointmentDate ?? '',
    'Closed Date': r.closedDate ?? '',
    'Outcome': r.outcome ?? 'Pending',
    'Coordinator': r.coordinatorName,
    'Days Open': r.daysOpen,
  }));
  downloadCSV(`referrals-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

// ─── STARS/HEDIS/MIPS CSV ─────────────────────────────────────────────────────

export function exportSTARSCSV(measures: Array<{
  measureId: string; measureName: string; domain: string; contractName: string;
  currentRating: number; targetRating: number; gapCount: number; bonusEstimate: number;
  deadline: string; status: string;
}>) {
  const rows = measures.map((m) => ({
    'Measure ID': m.measureId,
    'Measure Name': m.measureName,
    'Domain': m.domain,
    'Contract': m.contractName,
    'Current Rating': m.currentRating,
    'Target Rating': m.targetRating,
    'Gap Count': m.gapCount,
    'Bonus Estimate ($)': m.bonusEstimate,
    'Deadline': m.deadline,
    'Status': m.status,
  }));
  downloadCSV(`stars-measures-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

export function exportHEDISCSV(measures: Array<{
  measureId: string; measureName: string; domain: string; contractName: string;
  complianceRate: number; targetRate: number; patientsDue: number; patientsCompliant: number;
  dueDate: string; status: string;
}>) {
  const rows = measures.map((m) => ({
    'Measure ID': m.measureId,
    'Measure Name': m.measureName,
    'Domain': m.domain,
    'Contract': m.contractName,
    'Compliance Rate (%)': m.complianceRate,
    'Target Rate (%)': m.targetRate,
    'Patients Due': m.patientsDue,
    'Patients Compliant': m.patientsCompliant,
    'Patients Remaining': m.patientsDue - m.patientsCompliant,
    'Due Date': m.dueDate,
    'Status': m.status,
  }));
  downloadCSV(`hedis-measures-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

export function exportMIPSCSV(adjustments: Array<{
  noticeId: string; performanceYear: string; compositeScore: number;
  adjustmentPct: number; adjustmentAmount: number; qualityScore: number;
  promotingInteropScore: number; improvementActScore: number; costScore: number;
  deadline: string; status: string; appealEligible: boolean;
}>) {
  const rows = adjustments.map((a) => ({
    'Notice ID': a.noticeId,
    'Performance Year': a.performanceYear,
    'Composite Score': a.compositeScore,
    'Adjustment (%)': a.adjustmentPct,
    'Adjustment Amount ($)': a.adjustmentAmount,
    'Quality Score': a.qualityScore,
    'Promoting Interop Score': a.promotingInteropScore,
    'Improvement Activity Score': a.improvementActScore,
    'Cost Score': a.costScore,
    'Deadline': a.deadline,
    'Status': a.status,
    'Appeal Eligible': a.appealEligible ? 'Yes' : 'No',
  }));
  downloadCSV(`mips-adjustments-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

// ─── Demo Track Export ────────────────────────────────────────────────────────

export function exportDemoTrackCSV(patients: DemoPatientExportRow[]) {
  const rows = patients.map((p) => ({
    'Patient Name': p.name,
    'MRN': p.mrn,
    'Age': p.age,
    'Gender': p.gender,
    'Payer': p.payer,
    'Contract': p.contract,
    'Risk Tier': p.riskTier,
    'RAF Score': p.rafScore,
    'RAF Delta (YTD)': p.rafDelta,
    'ER Risk (%)': Math.round(p.predictedErRisk * 100),
    'Open HCC Suspects': p.openHCCSuspects,
    'HCC Revenue at Risk ($)': p.hccSuspectValue,
    'Open Care Gaps (Total)': p.openCareGaps,
    'Clinical Gaps': p.clinicalGaps,
    'BH Gaps': p.bhGaps,
    'Social Gaps': p.socialGaps,
    'PMPM Cost ($)': p.pmpmCost,
    'PMPM Target ($)': p.pmpmTarget,
    'PMPM Variance ($)': p.pmpmCost - p.pmpmTarget,
    'Attribution Status': p.attributionStatus,
    'Primary Care Provider': p.primaryCareProvider,
    'Last Contact Date': p.lastContactDate,
    'PHQ-9 Score': p.phq9Score,
    'AUDIT-C Score': p.auditC,
    'BH Referral Status': p.bhReferralStatus,
    'Transport Status': p.transportStatus,
    'Food Security': p.foodSecurity,
    'Housing Status': p.housingStatus,
    'Cohort Flag': p.cohortFlag,
    'Rural Distance': p.ruralDistance,
    'Disparity Flag': p.disparityFlag,
    'Episode Type': p.episodeType,
    'Episode Status': p.episodeStatus,
    'Care Plan Status': p.carePlanStatus,
    'Pathway Progress': p.pathwayProgress,
    'Gain Share Estimate ($)': p.gainShareEstimate,
    'Exported By': p.exportedBy,
    'Exported At': p.exportedAt,
  }));
  downloadCSV(`demo-track-export-${clock.nowIso().slice(0, 10)}.csv`, rows);
}

