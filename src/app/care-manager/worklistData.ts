// ─── Care-manager worklist data + scope filter (extracted per size doctrine) ──
// The caseload worklist and its whose-book scope filter. Ownership diversified so
// the top-bar caseload selector (My / My team / Unassigned / All) visibly filters.

import type { CaseloadScope } from '@/lib/appContext';

export interface CostStack {
  inpatient: number;
  outpatient: number;
  ancillary: number;
  pharmacy: number;
  emergency: number;
}

export interface WorklistPatient {
  id: string;
  name: string;
  mrn: string;
  age: number;
  gender: string;
  riskTier: 'Critical' | 'High' | 'Moderate' | 'Low';
  episodeType: string;
  episodeStatus: 'Active' | 'Closed';
  daysInEpisode: number;
  totalCost: number;
  targetCost: number;
  variancePct: number;
  nextActionDue: string;
  nextAction: string;
  careManager: string;
  alert?: string;
  costStack: CostStack;
  etgTypeCode: number;
}

export const WORKLIST: WorklistPatient[] = [
  {
    id: 'pt-maria',
    name: 'Maria Redhawk',
    mrn: 'MRN-SD-001',
    age: 34,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Pre-Diabetic / Postpartum',
    episodeStatus: 'Active',
    daysInEpisode: 427,
    totalCost: 8240,
    targetCost: 10680,
    variancePct: -22.8,
    nextActionDue: '2026-06-02',
    nextAction: 'SNAP renewal + WIC enrollment',
    careManager: 'Sarah Johnson',
    alert: 'Edinburgh PND 427d unmanaged · SNAP expired T+47d',
    costStack: { inpatient: 0, outpatient: 42.0, ancillary: 18.0, pharmacy: 28.0, emergency: 12.0 },
    etgTypeCode: 4,
  },
  {
    id: 'pt-001',
    name: 'James Wilson',
    mrn: 'MRN-0087',
    age: 58,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'Diabetes · CHF',
    episodeStatus: 'Active',
    daysInEpisode: 47,
    totalCost: 32650,
    targetCost: 28000,
    variancePct: 16.6,
    nextActionDue: '2026-06-02',
    nextAction: 'SNF discharge planning',
    careManager: 'Sarah Johnson',
    alert: 'Cost threshold exceeded',
    costStack: { inpatient: 56.7, outpatient: 1.4, ancillary: 9.5, pharmacy: 5.0, emergency: 7.4 },
    etgTypeCode: 0,
  },
  {
    id: 'pt-002',
    name: 'Robert Chen',
    mrn: 'MRN-0103',
    age: 62,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'Hypertension · CKD',
    episodeStatus: 'Active',
    daysInEpisode: 22,
    totalCost: 28450,
    targetCost: 25000,
    variancePct: 13.8,
    nextActionDue: '2026-06-03',
    nextAction: 'PT follow-up coordination',
    careManager: 'Sarah Johnson',
    alert: 'Readmission risk flag',
    costStack: {
      inpatient: 62.0,
      outpatient: 12.0,
      ancillary: 14.0,
      pharmacy: 8.0,
      emergency: 4.0,
    },
    etgTypeCode: 4,
  },
  {
    id: 'pt-003',
    name: 'Dorothy Simmons',
    mrn: 'MRN-211044',
    age: 65,
    gender: 'F',
    riskTier: 'High',
    episodeType: 'COPD Exacerbation',
    episodeStatus: 'Active',
    daysInEpisode: 14,
    totalCost: 12400,
    targetCost: 22000,
    variancePct: -43.6,
    nextActionDue: '2026-06-04',
    nextAction: 'Medication reconciliation',
    careManager: 'Sarah Johnson',
    costStack: {
      inpatient: 20.0,
      outpatient: 28.0,
      ancillary: 15.0,
      pharmacy: 32.0,
      emergency: 5.0,
    },
    etgTypeCode: 4,
  },
  {
    id: 'pt-004',
    name: 'Lisa Thompson',
    mrn: 'MRN-0156',
    age: 41,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Asthma · Obesity',
    episodeStatus: 'Active',
    daysInEpisode: 9,
    totalCost: 8200,
    targetCost: 20000,
    variancePct: -59.0,
    nextActionDue: '2026-06-05',
    nextAction: 'Home health referral',
    careManager: 'Rachel Bordeaux',
    costStack: {
      inpatient: 45.0,
      outpatient: 20.0,
      ancillary: 18.0,
      pharmacy: 10.0,
      emergency: 7.0,
    },
    etgTypeCode: 5,
  },
  {
    id: 'pt-005',
    name: 'Linda Castillo',
    mrn: 'MRN-203318',
    age: 69,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Diabetes Management',
    episodeStatus: 'Active',
    daysInEpisode: 61,
    totalCost: 8450,
    targetCost: 12000,
    variancePct: -29.6,
    nextActionDue: '2026-06-07',
    nextAction: 'A1C recheck scheduling',
    careManager: 'Rachel Bordeaux',
    costStack: { inpatient: 0, outpatient: 38.0, ancillary: 22.0, pharmacy: 38.0, emergency: 2.0 },
    etgTypeCode: 1,
  },
  {
    id: 'pt-006',
    name: 'Thomas Brandt',
    mrn: 'MRN-195774',
    age: 74,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'CHF Exacerbation',
    episodeStatus: 'Closed',
    daysInEpisode: 90,
    totalCost: 31200,
    targetCost: 28000,
    variancePct: 11.4,
    nextActionDue: '2026-06-10',
    nextAction: 'Post-episode quality review',
    careManager: '',
    costStack: {
      inpatient: 50.0,
      outpatient: 8.0,
      ancillary: 12.0,
      pharmacy: 6.0,
      emergency: 14.0,
    },
    etgTypeCode: 0,
  },
];

/**
 * Filter the worklist by whose-book scope. 'mine' = the current user's patients;
 * 'team' = any assigned care manager (the pod); 'unassigned' = no owner; 'all' = everything.
 */
export function scopedWorklist(
  list: WorklistPatient[],
  scope: CaseloadScope,
  currentName: string
): WorklistPatient[] {
  if (scope === 'mine') return list.filter((p) => p.careManager === currentName);
  if (scope === 'unassigned') return list.filter((p) => !p.careManager);
  if (scope === 'team') return list.filter((p) => !!p.careManager);
  return list;
}
