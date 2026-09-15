// ─── MdSmartSummaryScreen.data.ts ────────────────────────────────────────────
// Static data constants and style maps for MdSmartSummaryScreen.

export type GapStatusType = 'In Process' | 'Not Started' | 'Waiting on Patient';
export type SummaryComplexity = 'Concise' | 'Moderate-Detail' | 'High-Detail';
export type CloseGapStep = 1 | 2 | 3;
export type ConfirmDocStep = 1 | 2 | 3;
export type ReferralStatus = 'Not Sent' | 'Pending' | 'Scheduled' | 'Completed';

export interface FhirRef {
  resourceType: string;
  resourceId: string;
  label: string;
}

export const VISIT_REASONS = [
  {
    id: 'vr-diabetes',
    label: 'Diabetes Follow-Up',
    badge: 'Primary reason',
    badgeColor: 'text-[#706e6b]',
    leftBorder: 'border-l-4 border-[#0070d2]',
    clinicalNotes:
      'T2DM (E11.65) — A1C 9.2% as of 2026-02-10 (Labcorp). Target <8%, previous 8.8% (2025-08), trend worsening. Metformin 500 mg BID PDC 61% — intervention recommended. CKD co-management with Nephrology referral pending. Furosemide 20 mg QD for volume management.',
    fhir: {
      resourceType: 'Condition',
      resourceId: 'condition-t2dm-maria',
      label: 'Condition: T2DM (E11.65)',
    } as FhirRef,
  },
  {
    id: 'vr-transition',
    label: 'High Risk Transition',
    badge: 'Needs review',
    badgeColor: 'text-[#c87400]',
    leftBorder: 'border-l-4 border-[#c87400]',
    clinicalNotes:
      '47-day high-risk transition phase. 2 ER visits in 60 days (last: 03/29/2026 — acute HF exacerbation). Post-acute follow-up overdue by 7 days. Urgency score 82/100. Social risk 53↑, housing unstable, food insecurity. Consider intensive outreach and transitional care protocol.',
    fhir: {
      resourceType: 'Flag',
      resourceId: 'flag-high-risk-maria',
      label: 'Flag: High-Risk Transition',
    } as FhirRef,
  },
  {
    id: 'vr-ckd',
    label: 'CKD Worsening',
    badge: 'Monitor closely',
    badgeColor: 'text-[#c87400]',
    leftBorder: 'border-l-4 border-[#c87400]',
    clinicalNotes:
      'CKD Stage 3b (N18.32) — eGFR 42 mL/min/1.73m² (2026-03-15, declining from 48 in 2025-12). K+ 5.1 mEq/L — hyperkalemia risk. Potassium Chloride adherence 55% PDC. Nephrology consult recommended. Avoid NSAIDs and nephrotoxic agents. Annual urine microalbumin due.',
    fhir: {
      resourceType: 'Condition',
      resourceId: 'condition-ckd-maria',
      label: 'Condition: CKD Stage 3b (N18.32)',
    } as FhirRef,
  },
  {
    id: 'vr-a1c',
    label: 'A1C 9.2%',
    badge: 'Out of range',
    badgeColor: 'text-[#c23934]',
    leftBorder: 'border-l-4 border-[#c23934]',
    clinicalNotes:
      'HbA1c 9.2% drawn 2026-02-10 at Labcorp (LOINC 4548-4). Target <8.0%. Previous results: 8.8% (2025-08), 8.5% (2025-02). Trend: worsening over 18 months. Metformin adherence 61% PDC. Consider Ozempic titration or specialist endocrinology referral. HEDIS CDC-001 gap open 112 days.',
    fhir: {
      resourceType: 'Observation',
      resourceId: 'obs-a1c-maria-20260210',
      label: 'Observation: HbA1c 9.2% (LOINC 4548-4)',
    } as FhirRef,
  },
];

export const JOURNEY_PHASES = [
  {
    key: 'stable-management',
    label: 'Stable',
    color: 'bg-[#24a148]',
    textColor: 'text-[#24a148]',
    borderColor: 'border-[#24a148]',
    bgLight: 'bg-[#defbe6]',
  },
  {
    key: 'gap-in-care',
    label: 'Gap in Care',
    color: 'bg-[#f1c21b]',
    textColor: 'text-[#b45309]',
    borderColor: 'border-[#f1c21b]',
    bgLight: 'bg-[#fdf6dd]',
  },
  {
    key: 'deteriorating',
    label: 'Deteriorating',
    color: 'bg-[#ff832b]',
    textColor: 'text-[#ff832b]',
    borderColor: 'border-[#ff832b]',
    bgLight: 'bg-[#fff2e8]',
  },
  {
    key: 'high-risk-transition',
    label: 'High-Risk Transition',
    color: 'bg-[#da1e28]',
    textColor: 'text-[#da1e28]',
    borderColor: 'border-[#da1e28]',
    bgLight: 'bg-[#fce9e9]',
  },
  {
    key: 'post-acute-recovery',
    label: 'Post-Acute',
    color: 'bg-[#0070d2]',
    textColor: 'text-[#0070d2]',
    borderColor: 'border-[#0070d2]',
    bgLight: 'bg-[#edf5ff]',
  },
];

export const CURRENT_PHASE_KEY = 'high-risk-transition';

export const SDOH_BADGES = [
  { label: 'Social Risk', value: '53→', color: 'bg-[#ffe0e0] text-[#da1e28] border-[#ffb3b8]' },
  { label: 'Food Risk', value: 'High', color: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
  { label: 'Housing', value: 'Unstable', color: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
];

export const CARE_GAPS_ENHANCED = [
  {
    id: 'cg-001',
    name: 'A1C Control — Diabetes',
    program: 'HEDIS',
    cmsMips: 'CDC-001',
    priority: 'High',
    status: 'In Process' as GapStatusType,
    daysOpen: 112,
  },
  {
    id: 'cg-002',
    name: 'SDoH Screening',
    program: 'MIPS',
    cmsMips: 'MIPS-487',
    priority: 'Medium',
    status: 'In Process' as GapStatusType,
    daysOpen: 67,
  },
  {
    id: 'cg-003',
    name: 'Mental/Behavioral Health',
    program: 'MIPS',
    cmsMips: 'MIPS-134',
    priority: 'Medium',
    status: 'Not Started' as GapStatusType,
    daysOpen: 45,
  },
  {
    id: 'cg-004',
    name: 'Statin Therapy — CVD',
    program: 'HEDIS',
    cmsMips: 'SPC-438',
    priority: 'High',
    status: 'Waiting on Patient' as GapStatusType,
    daysOpen: 89,
  },
  {
    id: 'cg-005',
    name: 'Controlling Hypertension',
    program: 'HEDIS',
    cmsMips: 'CBP-236',
    priority: 'High',
    status: 'Waiting on Patient' as GapStatusType,
    daysOpen: 134,
  },
  {
    id: 'cg-006',
    name: 'Colorectal Cancer Screening',
    program: 'HEDIS',
    cmsMips: 'COL-113',
    priority: 'Medium',
    status: 'Not Started' as GapStatusType,
    daysOpen: 22,
  },
];

export const MEDS_DATA = [
  {
    name: 'Lisinopril 10mg',
    freq: 'QD',
    adherence: 78,
    flag: false,
    ndc: '68180-0513-01',
    prescriber: 'Dr. Sarah Chen, MD',
    datePrescribed: '2024-08-15',
    dosage: '10mg',
    quantity: '90 tablets',
    refills: '3 remaining',
  },
  {
    name: 'Metformin 500mg',
    freq: 'BID',
    adherence: 61,
    flag: true,
    ndc: '00093-7214-01',
    prescriber: 'Dr. Michael Rodriguez, MD',
    datePrescribed: '2024-06-20',
    dosage: '500mg',
    quantity: '180 tablets',
    refills: '2 remaining',
  },
  {
    name: 'Atorvastatin 40mg',
    freq: 'QHS',
    adherence: 84,
    flag: false,
    ndc: '00071-0156-23',
    prescriber: 'Dr. Sarah Chen, MD',
    datePrescribed: '2024-09-10',
    dosage: '40mg',
    quantity: '90 tablets',
    refills: '5 remaining',
  },
  {
    name: 'Furosemide 20mg',
    freq: 'QD',
    adherence: 72,
    flag: false,
    ndc: '00054-3280-25',
    prescriber: 'Dr. James Wilson, MD',
    datePrescribed: '2024-07-05',
    dosage: '20mg',
    quantity: '90 tablets',
    refills: '4 remaining',
  },
  {
    name: 'Potassium Chloride 20mEq',
    freq: 'QD',
    adherence: 55,
    flag: true,
    ndc: '00054-4109-25',
    prescriber: 'Dr. James Wilson, MD',
    datePrescribed: '2024-07-05',
    dosage: '20mEq',
    quantity: '90 tablets',
    refills: '1 remaining',
  },
];

export const LABS_DATA = [
  { name: 'A1C', value: '9.2%', date: '2026-02-10', flag: true, ref: '<7.0%' },
  { name: 'eGFR', value: '42', date: '2026-03-15', flag: true, ref: '>60' },
  { name: 'K+', value: '5.1 mEq/L', date: '2026-04-01', flag: true, ref: '3.5–5.0' },
  { name: 'LDL', value: '118 mg/dL', date: '2026-02-10', flag: false, ref: '<100' },
  { name: 'BNP', value: '210 pg/mL', date: '2026-03-20', flag: true, ref: '<100' },
  { name: 'BP', value: '158/96', date: '2026-04-01', flag: true, ref: '<130/80' },
];

export const CDI_OPPORTUNITIES = [
  {
    id: 'cdi-001',
    condition: 'T2DM with CKD Stage 3',
    icd: 'E11.65 + N18.32',
    hcc: 'HCC 18 + HCC 136',
    confidence: 91,
    rafDelta: '+0.42',
    revenueDelta: '$3,200',
    evidenceSources: ['EMR', 'Claims', 'HIE'],
    justification:
      'Claims data and LPR confirm active T2DM with CKD Stage 3b. A1C 9.2% and eGFR 42 support combined coding. Both conditions require separate HCC capture for accurate RAF.',
    signals: [
      { label: 'A1C', value: '9.2% (2026-02-10)', source: 'EMR', flagged: true },
      { label: 'eGFR', value: '42 (2026-03-15)', source: 'EMR', flagged: true },
      { label: 'Claims DX', value: 'E11.65 coded 2025-11-14', source: 'Claims', flagged: false },
      { label: 'HIE Record', value: 'Nephrology note 2025-12-01', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use E11.65 (T2DM with hyperglycemia) + N18.32 (CKD Stage 3b). Dual coding required for HCC 136 capture.',
    currentCode: 'E11 (Type 2 Diabetes)',
    suggestedCode: 'E11.65 (T2D with hyperglycemia + CKD)',
  },
  {
    id: 'cdi-002',
    condition: 'Heart Failure — HFpEF',
    icd: 'I50.30',
    hcc: 'HCC 85',
    confidence: 87,
    rafDelta: '+0.28',
    revenueDelta: '$2,100',
    evidenceSources: ['EMR', 'Claims'],
    justification:
      'Echo confirms EF 55% consistent with HFpEF. BNP 210 pg/mL elevated. Prior year claims coded I50.9 (unspecified) — specificity upgrade required for HCC 85 capture.',
    signals: [
      { label: 'Echo EF', value: '55% (2026-01-15)', source: 'EMR', flagged: false },
      { label: 'BNP', value: '210 pg/mL (2026-03-20)', source: 'EMR', flagged: true },
      { label: 'Prior Claim', value: 'I50.9 coded 2025-09-10', source: 'Claims', flagged: false },
    ],
    icd10Guidance:
      'Upgrade from I50.9 to I50.30 (HFpEF, unspecified). Confirm systolic function preserved on echo documentation.',
    currentCode: 'I50.9 (Heart Failure, unspecified)',
    suggestedCode: 'I50.30 (HFpEF, unspecified)',
  },
  {
    id: 'cdi-003',
    condition: 'Atrial Fibrillation',
    icd: 'I48.91',
    hcc: 'HCC 96',
    confidence: 79,
    rafDelta: '+0.19',
    revenueDelta: '$1,450',
    evidenceSources: ['EMR', 'HIE'],
    justification:
      'ECG on 2026-01-20 confirms persistent AFib. Not coded in current encounter. HCC 96 requires annual recapture — last coded 2025-08-12.',
    signals: [
      { label: 'ECG', value: 'Persistent AFib (2026-01-20)', source: 'EMR', flagged: true },
      { label: 'Last Coded', value: 'I48.91 — 2025-08-12', source: 'Claims', flagged: false },
    ],
    icd10Guidance:
      'Use I48.91 (unspecified AFib). Annual recapture required — HCC 96 does not carry forward.',
    currentCode: 'Not coded this encounter',
    suggestedCode: 'I48.91 (Unspecified AFib)',
  },
];

export const CHRONIC_CONDITIONS = [
  {
    code: 'T2DM',
    label: 'Type 2 Diabetes',
    icd: 'E11.65',
    hcc: 'HCC 18',
    acuity: 'critical',
    metric: 'A1C 9.2%',
    trend: 'worsening',
  },
  {
    code: 'CKD',
    label: 'CKD Stage 3b',
    icd: 'N18.32',
    hcc: 'HCC 136',
    acuity: 'critical',
    metric: 'eGFR 42',
    trend: 'worsening',
  },
  {
    code: 'HTN',
    label: 'Hypertension',
    icd: 'I10',
    hcc: 'HCC 85',
    acuity: 'high',
    metric: 'BP 158/96',
    trend: 'stable',
  },
  {
    code: 'HF',
    label: 'Heart Failure (HFpEF)',
    icd: 'I50.30',
    hcc: 'HCC 85',
    acuity: 'high',
    metric: 'EF 55%',
    trend: 'stable',
  },
];

export const RECENT_ACTIVITY = [
  { date: '04/01/2026', type: 'Lab', desc: 'BMP + A1C drawn', flag: true },
  { date: '03/29/2026', type: 'ER', desc: 'ER visit — chest pain', flag: true },
  { date: '03/19/2026', type: 'Visit', desc: 'Diabetes F/U — Dr. Whitfield', flag: false },
  { date: '03/17/2026', type: 'BP', desc: 'BP Check 158/96', flag: true },
  { date: '02/18/2026', type: 'ER', desc: 'ER visit — dyspnea', flag: true },
];

export const VITALS_TREND = [
  {
    label: 'BP Systolic',
    unit: 'mmHg',
    values: [142, 148, 155, 158],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
  {
    label: 'A1C',
    unit: '%',
    values: [8.1, 8.6, 9.0, 9.2],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
  {
    label: 'eGFR',
    unit: 'mL/min',
    values: [51, 48, 44, 42],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
];

export const ACTIVE_REFERRALS = [
  {
    id: 'ref-001',
    specialty: 'Cardiology',
    provider: 'Dr. Patel',
    tier: 'Tier 1',
    status: 'Pending' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-03-28',
    reason: 'HFpEF follow-up, BNP elevation',
  },
  {
    id: 'ref-002',
    specialty: 'Nephrology',
    provider: 'Unassigned',
    tier: '—',
    status: 'Not Sent' as ReferralStatus,
    urgency: 'Urgent',
    date: '2026-04-01',
    reason: 'CKD Stage 3b progression, eGFR 42',
  },
  {
    id: 'ref-003',
    specialty: 'Ophthalmology',
    provider: 'Dr. Chen',
    tier: 'Tier 2',
    status: 'Scheduled' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-04-15',
    reason: 'Annual diabetic eye exam',
  },
  {
    id: 'ref-004',
    specialty: 'Endocrinology',
    provider: 'Dr. Reyes',
    tier: 'Tier 1',
    status: 'Completed' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-02-20',
    reason: 'T2DM management — A1C 9.2%',
  },
];

export const SOURCE_BADGE: Record<string, string> = {
  EMR: 'bg-[#d0e2ff] text-[#0070d2]',
  Claims: 'bg-[#fdf6dd] text-[#b45309]',
  HIE: 'bg-[#defbe6] text-[#0e6027]',
  LPR: 'bg-[#f6f2ff] text-[#6929c4]',
};

export const GAP_STATUS_STYLE: Record<
  GapStatusType,
  { dot: string; badge: string; label: string }
> = {
  'In Process': { dot: 'bg-[#0070d2]', badge: 'bg-[#d0e2ff] text-[#0070d2]', label: 'In Process' },
  'Not Started': {
    dot: 'bg-carbon-gray-40',
    badge: 'bg-carbon-gray-20 text-[#706e6b]',
    label: 'Not Started',
  },
  'Waiting on Patient': {
    dot: 'bg-[#f1c21b]',
    badge: 'bg-[#fdf6dd] text-[#b45309]',
    label: 'Waiting on Patient',
  },
};

export const REFERRAL_STATUS_STYLE: Record<ReferralStatus, { dot: string; badge: string }> = {
  'Not Sent': { dot: 'bg-carbon-gray-40', badge: 'bg-carbon-gray-20 text-[#706e6b]' },
  Pending: { dot: 'bg-[#f1c21b]', badge: 'bg-[#fdf6dd] text-[#b45309]' },
  Scheduled: { dot: 'bg-[#0070d2]', badge: 'bg-[#d0e2ff] text-[#0070d2]' },
  Completed: { dot: 'bg-[#24a148]', badge: 'bg-[#defbe6] text-[#0e6027]' },
};

export const ENCOUNTER_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'results', label: 'Results' },
  { key: 'orders', label: 'Orders' },
  { key: 'plan', label: 'Plan' },
  { key: 'return', label: 'Γå⌐ Return to Cerner' },
];

export const PAGE_SIZE = 5;
