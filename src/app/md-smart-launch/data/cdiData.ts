// CDI (Clinical Documentation Improvement) static demo data for MdPatientSummary.
// Extracted to satisfy AI-CODING-CONVENTIONS v2 §2 size ratchet.

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
      'Claims data and LPR confirm active T2DM with CKD Stage 3b. Last documented encounter 2025-11-14. A1C 9.2% and eGFR 42 support combined coding. Both conditions require separate HCC capture for accurate RAF.',
    signals: [
      { label: 'A1C', value: '9.2% (2026-02-10)', source: 'EMR', flagged: true },
      { label: 'eGFR', value: '42 (2026-03-15)', source: 'EMR', flagged: true },
      { label: 'Claims DX', value: 'E11.65 coded 2025-11-14', source: 'Claims', flagged: false },
      { label: 'HIE Record', value: 'Nephrology note 2025-12-01', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use E11.65 (T2DM with hyperglycemia) + N18.32 (CKD Stage 3b). Do NOT use E11.65 alone — dual coding required for HCC 136 capture.',
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
      'Echo confirms EF 55% consistent with HFpEF. BNP 210 pg/mL elevated. Prior year claims coded I50.9 (unspecified) — specificity upgrade to I50.30 required for HCC 85 capture.',
    signals: [
      { label: 'Echo EF', value: '55% (2026-01-15)', source: 'EMR', flagged: false },
      { label: 'BNP', value: '210 pg/mL (2026-03-20)', source: 'EMR', flagged: true },
      { label: 'Prior Claim', value: 'I50.9 coded 2025-09-10', source: 'Claims', flagged: false },
    ],
    icd10Guidance:
      'Upgrade from I50.9 to I50.30 (HFpEF, unspecified). Confirm systolic function preserved on echo documentation.',
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
      { label: 'HIE Note', value: 'Cardiology — AFib confirmed', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use I48.91 (unspecified AFib). If paroxysmal confirmed, use I48.0. Annual recapture required — HCC 96 does not carry forward.',
  },
];

export const JOURNEY_PHASES = [
  { key: 'stable-management', label: 'Stable', color: 'bg-[#24a148]' },
  { key: 'gap-in-care', label: 'Gap', color: 'bg-[#f1c21b]' },
  { key: 'deteriorating', label: 'Deteriorating', color: 'bg-[#ff832b]' },
  { key: 'high-risk-transition', label: 'High-Risk', color: 'bg-[#da1e28]' },
  { key: 'post-acute-recovery', label: 'Post-Acute', color: 'bg-[#0043ce]' },
];

export const ACUITY_DOT: Record<string, string> = {
  critical: 'bg-[#da1e28]',
  high: 'bg-[#f1c21b]',
  moderate: 'bg-[#0043ce]',
};

export const TREND_ICON: Record<string, { icon: string; color: string }> = {
  worsening: { icon: 'ArrowTrendingDownIcon', color: 'text-[#da1e28]' },
  stable: { icon: 'MinusIcon', color: 'text-[#b45309]' },
  improving: { icon: 'ArrowTrendingUpIcon', color: 'text-[#24a148]' },
};

export const SOURCE_BADGE: Record<string, string> = {
  EMR: 'bg-[#d0e2ff] text-[#0043ce]',
  Claims: 'bg-[#fdf6dd] text-[#b45309]',
  HIE: 'bg-[#defbe6] text-[#0e6027]',
  LPR: 'bg-[#f6f2ff] text-[#6929c4]',
};
