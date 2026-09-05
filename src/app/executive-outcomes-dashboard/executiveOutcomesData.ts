// ─── Executive-outcomes data + contract modifiers (extracted per size doctrine) ─
// Base metrics, region/program/period/org modifiers, and the per-CONTRACT modifier
// the top-bar contract selector drives so the dashboard rescales per contract.

export const BASE = {
  // Population
  gapsClosed: 6842,
  gapsOpen: 8241,
  closureRate: 68.4,
  starsRating: 3.8,
  totalLives: 47832,
  // Financial
  gainShare: 1100, // $K
  sharedSavings: 847, // $K
  incentivePayments: 253, // $K
  avoidedLeakage: 412, // $K
  benchmarkPmpm: 892,
  actualPmpm: 847,
  savingsAnnual: 2150, // $K
  // Operational
  referralCompletion: 84,
  specialistResponseDays: 3.2,
  providerParticipation: 94,
  patientEngagement: 71,
};

// Scale factors for regions
export const REGION_SCALE: Record<string, number> = {
  'Oglala Lakota County': 0.24,
  'Bennett County': 0.12,
  'Gregory County': 0.18,
  'Tripp County': 0.14,
  'Todd County': 0.16,
  'Jackson County': 0.1,
};

// Program modifiers — multiply closure rate & gain share
export const PROGRAM_MOD: Record<
  string,
  { closureBoost: number; gainMod: number; operationalMod: number }
> = {
  'RHTP — Medicaid 1115 Waiver': { closureBoost: 0, gainMod: 1.0, operationalMod: 1.0 },
  'RHTP — BH Block Grant (SAMHSA)': { closureBoost: 2.1, gainMod: 0.72, operationalMod: 0.88 },
  'RHTP — CHW Outreach Program': { closureBoost: 5.4, gainMod: 0.61, operationalMod: 1.12 },
  'RHTP — Social Needs Navigation': { closureBoost: 1.8, gainMod: 0.54, operationalMod: 0.94 },
  'RHTP — Value-Based Care': { closureBoost: -1.2, gainMod: 1.18, operationalMod: 1.06 },
};

// Org performance modifiers (closure rate offset, gain share fraction)
export const ORG_DATA: Record<
  string,
  { closure: number; gainShare: number; patients: number; type: string }
> = {
  'Oglala Lakota PCP': { closure: 78, gainShare: 88, patients: 3100, type: 'PCP' },
  'Monument Cardio': { closure: 82, gainShare: 74, patients: 1820, type: 'Specialist' },
  'Bennett Co. Health': { closure: 71, gainShare: 142, patients: 8420, type: 'FQHC' },
  'Gregory Co. Medical': { closure: 73, gainShare: 97, patients: 4200, type: 'PCP' },
  'Winner Regional': { closure: 64, gainShare: 218, patients: 11200, type: 'Hospital' },
  'Fall River Specialists': { closure: 55, gainShare: 61, patients: 2890, type: 'Specialist' },
};

// Period multipliers on YTD values
export const PERIOD_MULT: Record<string, number> = {
  'YTD 2026': 1.0,
  'Q1 2026': 0.3,
  'Q2 2026': 0.28,
  'Q3 2026 (proj)': 0.25,
  'Full Year 2025': 1.62,
};

// Measure performance sets per program
export const BASE_MEASURES = [
  { measure: 'CBP-236', name: 'Hypertension', current: 71, target: 72, program: 'HEDIS' },
  { measure: 'CDC-001', name: 'A1C Control', current: 68, target: 75, program: 'HEDIS' },
  { measure: 'COL-113', name: 'Colorectal Screen', current: 58, target: 65, program: 'HEDIS' },
  { measure: 'SPC-438', name: 'Statin Therapy', current: 77, target: 80, program: 'STARS' },
  { measure: 'EED', name: 'Diabetic Eye Exam', current: 54, target: 60, program: 'HEDIS' },
  { measure: 'MIPS-487', name: 'SDoH Screening', current: 62, target: 70, program: 'MIPS' },
  { measure: 'BH-PHQ', name: 'Depression Screen', current: 59, target: 68, program: 'MIPS' },
  { measure: 'FUH-7', name: 'Follow-Up Hosp BH', current: 47, target: 55, program: 'HEDIS' },
];

export const PROGRAM_MEASURES: Record<string, string[]> = {
  'RHTP — BH Block Grant (SAMHSA)': ['BH-PHQ', 'FUH-7', 'CDC-001'],
  'RHTP — CHW Outreach Program': ['MIPS-487', 'CBP-236', 'COL-113'],
  'RHTP — Social Needs Navigation': ['MIPS-487', 'BH-PHQ', 'CBP-236'],
  'RHTP — Value-Based Care': ['SPC-438', 'CDC-001', 'CBP-236'],
};

// Per-contract modifiers keyed by appContext.selectedContractId (see src/lib/contracts.ts).
export const CONTRACT_MOD: Record<
  string,
  { livesMod: number; gainMod: number; closureBoost: number }
> = {
  'contract-001': { livesMod: 1.0, gainMod: 1.0, closureBoost: 0 },
  'contract-002': { livesMod: 0.62, gainMod: 1.35, closureBoost: 3.5 },
  'contract-003': { livesMod: 0.28, gainMod: 1.5, closureBoost: 1.8 },
  'contract-004': { livesMod: 0.44, gainMod: 0.9, closureBoost: -1.2 },
};
