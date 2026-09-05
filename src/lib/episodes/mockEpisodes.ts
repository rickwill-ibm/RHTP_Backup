// mockEpisodes.ts — AUTHORED episode-analytics demo data (moved verbatim from the page).
// GOVERNING DOCTRINE (mirrors src/lib/measures): this platform does NOT compute episode
// grouping (ETG) or measures — an EXTERNAL grouper/measure system does, emitting FHIR
// EpisodeOfCare / MeasureReport. mock/seeded returns THIS authored demo preserved EXACTLY
// (screen parity); production ingests the external feed (see etgIngest.ts / index.ts).
/* eslint-disable */

export const EPISODE_TYPES = [
  {
    type: 'CHF Exacerbation',
    count: 1,
    avgCost: 32650,
    target: 28000,
    variancePct: 16.6,
    p25: 18000,
    median: 18000,
    p75: 18000,
    p90: 18000,
    histogram: [
      { range: '$0-10k', count: 0, status: 'below' },
      { range: '$10-20k', count: 0, status: 'below' },
      { range: '$20-30k', count: 0, status: 'at' },
      { range: '$30-40k', count: 1, status: 'above' },
      { range: '$40-50k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 29000 },
      { month: 'Feb', cost: 30500 },
      { month: 'Mar', cost: 31200 },
      { month: 'Apr', cost: 32000 },
      { month: 'May', cost: 32650 },
    ],
  },
  {
    type: 'Hip Replacement',
    count: 1,
    avgCost: 28450,
    target: 25000,
    variancePct: 13.8,
    p25: 22000,
    median: 24000,
    p75: 26000,
    p90: 30000,
    histogram: [
      { range: '$0-10k', count: 0, status: 'below' },
      { range: '$10-20k', count: 0, status: 'below' },
      { range: '$20-30k', count: 1, status: 'above' },
      { range: '$30-40k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 24000 },
      { month: 'Feb', cost: 25500 },
      { month: 'Mar', cost: 26800 },
      { month: 'Apr', cost: 27500 },
      { month: 'May', cost: 28450 },
    ],
  },
  {
    type: 'Pneumonia',
    count: 1,
    avgCost: 18200,
    target: 20000,
    variancePct: -9.0,
    p25: 18000,
    median: 18000,
    p75: 18000,
    p90: 18000,
    histogram: [
      { range: '$15-20k', count: 1, status: 'at' },
      { range: '$20-25k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 19500 },
      { month: 'Feb', cost: 19200 },
      { month: 'Mar', cost: 18800 },
      { month: 'Apr', cost: 18500 },
      { month: 'May', cost: 18200 },
    ],
  },
  {
    type: 'Diabetes Management',
    count: 1,
    avgCost: 8450,
    target: 12000,
    variancePct: -29.6,
    p25: 7000,
    median: 8000,
    p75: 10000,
    p90: 11000,
    histogram: [
      { range: '$5-10k', count: 1, status: 'below' },
      { range: '$10-15k', count: 0, status: 'at' },
    ],
    trend: [
      { month: 'Jan', cost: 9200 },
      { month: 'Feb', cost: 9000 },
      { month: 'Mar', cost: 8800 },
      { month: 'Apr', cost: 8600 },
      { month: 'May', cost: 8450 },
    ],
  },
  {
    type: 'COPD Exacerbation',
    count: 1,
    avgCost: 24800,
    target: 22000,
    variancePct: 12.7,
    p25: 18000,
    median: 20000,
    p75: 23000,
    p90: 26000,
    histogram: [
      { range: '$20-25k', count: 1, status: 'above' },
      { range: '$25-30k', count: 0, status: 'above' },
    ],
    trend: [
      { month: 'Jan', cost: 22000 },
      { month: 'Feb', cost: 22800 },
      { month: 'Mar', cost: 23500 },
      { month: 'Apr', cost: 24200 },
      { month: 'May', cost: 24800 },
    ],
  },
];

export const OUTCOMES_DATA = [
  {
    metric: 'Readmission Rate (30d)',
    value: '8.3%',
    benchmark: '12.0%',
    status: 'good',
    detail: '1 of 12 episodes',
  },
  {
    metric: 'Complication Rate',
    value: '0%',
    benchmark: '5.2%',
    status: 'good',
    detail: '0 of 12 episodes',
  },
  {
    metric: 'Avg Patient Satisfaction',
    value: '4.3/5.0',
    benchmark: '4.1/5.0',
    status: 'good',
    detail: 'Above benchmark',
  },
  {
    metric: 'Avg Care Plan Adherence',
    value: '82%',
    benchmark: '75%',
    status: 'good',
    detail: 'Above target',
  },
  {
    metric: 'SNF Utilization Rate',
    value: '33%',
    benchmark: '28%',
    status: 'warning',
    detail: '4 of 12 episodes',
  },
  {
    metric: 'ER Utilization Rate',
    value: '58%',
    benchmark: '45%',
    status: 'warning',
    detail: '7 of 12 episodes',
  },
];

export const TREND_DATA = [
  { month: 'Jan', chf: 29000, hip: 24000, pneumonia: 19500, diabetes: 9200, copd: 22000 },
  { month: 'Feb', chf: 30500, hip: 25500, pneumonia: 19200, diabetes: 9000, copd: 22800 },
  { month: 'Mar', chf: 31200, hip: 26800, pneumonia: 18800, diabetes: 8800, copd: 23500 },
  { month: 'Apr', chf: 32000, hip: 27500, pneumonia: 18500, diabetes: 8600, copd: 24200 },
  { month: 'May', chf: 32650, hip: 28450, pneumonia: 18200, diabetes: 8450, copd: 24800 },
];

export const TREND_LINES = [
  { key: 'chf', name: 'CHF Exacerbation', color: '#da1e28' },
  { key: 'hip', name: 'Hip Replacement', color: '#6929c4' },
  { key: 'pneumonia', name: 'Pneumonia', color: '#0043ce' },
  { key: 'diabetes', name: 'Diabetes Mgmt', color: '#24a148' },
  { key: 'copd', name: 'COPD Exacerbation', color: '#b45309' },
];

export const MEMBER_RISK_SCORES = [
  {
    memberId: 'M-00412',
    name: 'Dorothy Hale',
    age: 72,
    episodeType: 'CHF Exacerbation',
    rafScore: 2.84,
    hccCount: 7,
    riskTier: 'Very High',
    riskColor: '#da1e28',
    predictedCost: 38200,
    actualCost: 32650,
    costIndex: 0.85,
    chronicConditions: ['CHF', 'CKD Stage 3', 'T2DM', 'Hypertension'],
    riskTrend: 'increasing',
  },
  {
    memberId: 'M-00287',
    name: 'James Whitfield',
    age: 68,
    episodeType: 'Hip Replacement',
    rafScore: 1.62,
    hccCount: 4,
    riskTier: 'High',
    riskColor: '#b45309',
    predictedCost: 31000,
    actualCost: 28450,
    costIndex: 0.92,
    chronicConditions: ['Osteoarthritis', 'Hypertension', 'Obesity'],
    riskTrend: 'stable',
  },
  {
    memberId: 'M-00519',
    name: 'Loretta Simmons',
    age: 64,
    episodeType: 'Pneumonia',
    rafScore: 1.21,
    hccCount: 3,
    riskTier: 'Moderate',
    riskColor: '#0043ce',
    predictedCost: 22000,
    actualCost: 18200,
    costIndex: 0.83,
    chronicConditions: ['COPD', 'Asthma', 'Smoking Hx'],
    riskTrend: 'decreasing',
  },
  {
    memberId: 'M-00334',
    name: 'Robert Chen',
    age: 59,
    episodeType: 'Diabetes Management',
    rafScore: 1.45,
    hccCount: 5,
    riskTier: 'High',
    riskColor: '#b45309',
    predictedCost: 14500,
    actualCost: 8450,
    costIndex: 0.58,
    chronicConditions: ['T2DM', 'Peripheral Neuropathy', 'Hypertension', 'Obesity'],
    riskTrend: 'decreasing',
  },
  {
    memberId: 'M-00601',
    name: 'Ruth Caldwell',
    age: 77,
    episodeType: 'COPD Exacerbation',
    rafScore: 2.31,
    hccCount: 6,
    riskTier: 'Very High',
    riskColor: '#da1e28',
    predictedCost: 29000,
    actualCost: 24800,
    costIndex: 0.86,
    chronicConditions: ['COPD', 'CHF', 'CKD Stage 2', 'Anemia'],
    riskTrend: 'increasing',
  },
];

// ─── ETG Provider Analysis Data ───────────────────────────────────────────────

export interface ProviderRanking {
  rank: number;
  providerId: string;
  name: string;
  specialty: string;
  episodeType: string;
  episodeCount: number;
  avgCost: number;
  peerAvgCost: number;
  costRatio: number;
  performanceScore: number;
  outlierFlag: 'High' | 'Low' | 'Normal';
  costStack: {
    inpatient: number;
    outpatient: number;
    ancillary: number;
    pharmacy: number;
    emergency: number;
  };
  peerStack: {
    inpatient: number;
    outpatient: number;
    ancillary: number;
    pharmacy: number;
    emergency: number;
  };
}

export interface ProcedureFrequency {
  procedure: string;
  providerRate: number;
  peerRate: number;
  flag: boolean;
}

export interface ReferralPattern {
  referredTo: string;
  specialty: string;
  count: number;
  pct: number;
  avgCostImpact: number;
  concentration: 'High' | 'Medium' | 'Low';
}

export const PROVIDER_RANKINGS: ProviderRanking[] = [
  {
    rank: 1,
    providerId: 'PRV-001',
    name: 'Dr. Sarah Okonkwo',
    specialty: 'Cardiology',
    episodeType: 'CHF Exacerbation',
    episodeCount: 14,
    avgCost: 34200,
    peerAvgCost: 28000,
    costRatio: 1.22,
    performanceScore: 58,
    outlierFlag: 'High',
    costStack: { inpatient: 58, outpatient: 4, ancillary: 12, pharmacy: 8, emergency: 18 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 2,
    providerId: 'PRV-002',
    name: 'Dr. Marcus Chen',
    specialty: 'Internal Medicine',
    episodeType: 'CHF Exacerbation',
    episodeCount: 9,
    avgCost: 29800,
    peerAvgCost: 28000,
    costRatio: 1.06,
    performanceScore: 74,
    outlierFlag: 'Normal',
    costStack: { inpatient: 50, outpatient: 10, ancillary: 14, pharmacy: 12, emergency: 14 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 3,
    providerId: 'PRV-003',
    name: 'Dr. Linda Park',
    specialty: 'Cardiology',
    episodeType: 'CHF Exacerbation',
    episodeCount: 11,
    avgCost: 24100,
    peerAvgCost: 28000,
    costRatio: 0.86,
    performanceScore: 91,
    outlierFlag: 'Low',
    costStack: { inpatient: 42, outpatient: 16, ancillary: 16, pharmacy: 14, emergency: 12 },
    peerStack: { inpatient: 48, outpatient: 12, ancillary: 14, pharmacy: 10, emergency: 16 },
  },
  {
    rank: 4,
    providerId: 'PRV-004',
    name: 'Dr. James Whitmore',
    specialty: 'Orthopedics',
    episodeType: 'Hip Replacement',
    episodeCount: 22,
    avgCost: 31500,
    peerAvgCost: 25000,
    costRatio: 1.26,
    performanceScore: 52,
    outlierFlag: 'High',
    costStack: { inpatient: 65, outpatient: 10, ancillary: 16, pharmacy: 6, emergency: 3 },
    peerStack: { inpatient: 55, outpatient: 14, ancillary: 18, pharmacy: 8, emergency: 5 },
  },
  {
    rank: 5,
    providerId: 'PRV-005',
    name: 'Dr. Sarah Johnson',
    specialty: 'Pulmonology',
    episodeType: 'COPD Exacerbation',
    episodeCount: 8,
    avgCost: 21400,
    peerAvgCost: 22000,
    costRatio: 0.97,
    performanceScore: 83,
    outlierFlag: 'Normal',
    costStack: { inpatient: 22, outpatient: 28, ancillary: 16, pharmacy: 30, emergency: 4 },
    peerStack: { inpatient: 25, outpatient: 25, ancillary: 15, pharmacy: 28, emergency: 7 },
  },
];

export const PROCEDURE_FREQUENCIES: ProcedureFrequency[] = [
  { procedure: 'Echocardiogram', providerRate: 94, peerRate: 72, flag: true },
  { procedure: 'BNP Lab Panel', providerRate: 88, peerRate: 85, flag: false },
  { procedure: 'Cardiac Catheterization', providerRate: 42, peerRate: 18, flag: true },
  { procedure: 'Chest X-Ray', providerRate: 100, peerRate: 98, flag: false },
  { procedure: 'SNF Placement', providerRate: 71, peerRate: 45, flag: true },
  { procedure: 'Home Health Referral', providerRate: 55, peerRate: 62, flag: false },
];

export const REFERRAL_PATTERNS: ReferralPattern[] = [
  {
    referredTo: 'Riverside SNF',
    specialty: 'Skilled Nursing',
    count: 9,
    pct: 64,
    avgCostImpact: 8200,
    concentration: 'High',
  },
  {
    referredTo: 'County Hospital Cardiology',
    specialty: 'Cardiology Consult',
    count: 7,
    pct: 50,
    avgCostImpact: 3400,
    concentration: 'High',
  },
  {
    referredTo: 'Rural Home Health',
    specialty: 'Home Health',
    count: 5,
    pct: 36,
    avgCostImpact: 3100,
    concentration: 'Medium',
  },
  {
    referredTo: 'Valley Imaging Center',
    specialty: 'Radiology',
    count: 12,
    pct: 86,
    avgCostImpact: 1200,
    concentration: 'High',
  },
  {
    referredTo: 'FQHC Clinic',
    specialty: 'Primary Care Follow-up',
    count: 11,
    pct: 79,
    avgCostImpact: 450,
    concentration: 'Medium',
  },
];

// ─── BH Episodes Tab Data ─────────────────────────────────────────────────────

export const BH_EPISODE_TYPES = [
  {
    type: 'FUH — Follow-Up After Hospitalization',
    count: 3,
    rate: '78%',
    target: '85%',
    variancePct: -8.2,
    trend: 'decreasing',
    color: '#6929c4',
  },
  {
    type: 'FUM — Follow-Up After ED Visit',
    count: 2,
    rate: '65%',
    target: '80%',
    variancePct: -18.8,
    trend: 'decreasing',
    color: '#da1e28',
  },
  {
    type: 'AMM — Antidepressant Medication Mgmt',
    count: 4,
    rate: '82%',
    target: '75%',
    variancePct: 9.3,
    trend: 'increasing',
    color: '#24a148',
  },
  {
    type: 'IET — Initiation of SUD Treatment',
    count: 2,
    rate: '55%',
    target: '70%',
    variancePct: -21.4,
    trend: 'stable',
    color: '#b45309',
  },
  {
    type: 'CDF — Cardiovascular Monitoring for SUD',
    count: 1,
    rate: '90%',
    target: '85%',
    variancePct: 5.9,
    trend: 'increasing',
    color: '#007d79',
  },
];

export const BH_OUTCOMES = [
  {
    metric: 'BH Follow-Up Rate (7d post-discharge)',
    value: '78%',
    benchmark: '85%',
    status: 'warning',
    detail: '7 of 9 BH episodes',
  },
  {
    metric: 'SUD Treatment Initiation Rate',
    value: '55%',
    benchmark: '70%',
    status: 'warning',
    detail: '2 of 4 SUD episodes',
  },
  {
    metric: 'Antidepressant Adherence (6-month)',
    value: '82%',
    benchmark: '75%',
    status: 'good',
    detail: 'Above benchmark',
  },
  {
    metric: 'BH-Related ED Visits (30d)',
    value: '2',
    benchmark: '1.5 avg',
    status: 'warning',
    detail: 'Slightly above avg',
  },
  {
    metric: 'Crisis Diversions (30d)',
    value: '4',
    benchmark: '—',
    status: 'good',
    detail: 'ED diversions via CSU/Mobile',
  },
  {
    metric: 'BH Care Plan Completion',
    value: '71%',
    benchmark: '68%',
    status: 'good',
    detail: 'Above benchmark',
  },
];

export const BH_PROVIDER_DATA = [
  {
    name: 'LCSW Denise Park',
    role: 'BH Counselor',
    bhAccessRate: '88%',
    fuhRate: '82%',
    fumRate: '70%',
    patients: 4,
    trend: 'increasing',
  },
  {
    name: 'PsyD Robert Chen',
    role: 'Psychologist',
    bhAccessRate: '75%',
    fuhRate: '78%',
    fumRate: '65%',
    patients: 3,
    trend: 'stable',
  },
  {
    name: 'LMFT Sandra Osei',
    role: 'BH Counselor',
    bhAccessRate: '91%',
    fuhRate: '90%',
    fumRate: '80%',
    patients: 2,
    trend: 'increasing',
  },
];

// ─── Social Program Outcomes Tab Data ────────────────────────────────────────

export const SOCIAL_PROGRAM_OUTCOMES = [
  {
    program: 'SNAP Enrollment',
    domain: 'Food Security',
    enrolled: 3,
    completed: 3,
    completionRate: '100%',
    avgDaysToEnroll: 7,
    costImpact: '$702/mo benefit',
    outcome: 'A1C improvement in 2 of 3 patients',
    trend: 'increasing',
    color: '#007d79',
  },
  {
    program: 'Housing Navigation',
    domain: 'Housing',
    enrolled: 2,
    completed: 1,
    completionRate: '50%',
    avgDaysToEnroll: 21,
    costImpact: 'Avoided 1 ED visit',
    outcome: '1 patient stably housed',
    trend: 'stable',
    color: '#0043ce',
  },
  {
    program: 'LIHEAP Utilities',
    domain: 'Utilities',
    enrolled: 1,
    completed: 1,
    completionRate: '100%',
    avgDaysToEnroll: 14,
    costImpact: '$180/mo benefit',
    outcome: 'Medication adherence improved',
    trend: 'stable',
    color: '#6929c4',
  },
  {
    program: 'CHW Home Visit Program',
    domain: 'Care Coordination',
    enrolled: 5,
    completed: 4,
    completionRate: '80%',
    avgDaysToEnroll: 3,
    costImpact: 'Est. $4,200 cost avoidance',
    outcome: '4 of 5 patients met care plan goals',
    trend: 'increasing',
    color: '#198038',
  },
  {
    program: 'BH Engagement (12-week)',
    domain: 'Behavioral Health',
    enrolled: 3,
    completed: 2,
    completionRate: '67%',
    avgDaysToEnroll: 10,
    costImpact: 'Reduced BH ED visits by 50%',
    outcome: 'Depression scores improved in 2 patients',
    trend: 'increasing',
    color: '#b45309',
  },
];

export const SDOH_COST_IMPACT = [
  { month: 'Jan', withSdoh: 18200, withoutSdoh: 22400 },
  { month: 'Feb', withSdoh: 17800, withoutSdoh: 22100 },
  { month: 'Mar', withSdoh: 17200, withoutSdoh: 21800 },
  { month: 'Apr', withSdoh: 16500, withoutSdoh: 21500 },
  { month: 'May', withSdoh: 15900, withoutSdoh: 21200 },
];
