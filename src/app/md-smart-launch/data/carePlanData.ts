// Static demo data for CarePlanPanel.
// Extracted to satisfy AI-CODING-CONVENTIONS v2 §2 size ratchet.

export const CHRONIC_CONDITIONS = [
  {
    code: 'T2DM',
    label: 'Type 2 Diabetes Mellitus',
    icd: 'E11.65',
    hcc: 'HCC 18',
    acuity: 'critical',
    goal: 'A1C < 8.0%',
    current: 'A1C 9.2%',
    status: 'Off Target',
    lastReview: '2026-02-10',
    nextReview: '2026-05-10',
  },
  {
    code: 'CKD',
    label: 'Chronic Kidney Disease Stage 3b',
    icd: 'N18.32',
    hcc: 'HCC 136',
    acuity: 'critical',
    goal: 'eGFR stable ≥ 40',
    current: 'eGFR 42',
    status: 'Monitoring',
    lastReview: '2026-03-15',
    nextReview: '2026-06-15',
  },
  {
    code: 'HTN',
    label: 'Hypertension',
    icd: 'I10',
    hcc: 'HCC 85',
    acuity: 'high',
    goal: 'BP < 130/80',
    current: 'BP 158/96',
    status: 'Off Target',
    lastReview: '2026-04-01',
    nextReview: '2026-05-01',
  },
  {
    code: 'HF',
    label: 'Heart Failure (HFpEF)',
    icd: 'I50.30',
    hcc: 'HCC 85',
    acuity: 'high',
    goal: 'EF ≥ 50%, no decompensation',
    current: 'EF 55% — stable',
    status: 'On Target',
    lastReview: '2026-03-20',
    nextReview: '2026-06-20',
  },
  {
    code: 'AFIB',
    label: 'Atrial Fibrillation',
    icd: 'I48.91',
    hcc: 'HCC 96',
    acuity: 'moderate',
    goal: 'Rate controlled, anticoagulated',
    current: 'Rate 72 bpm — stable',
    status: 'On Target',
    lastReview: '2026-01-20',
    nextReview: '2026-07-20',
  },
];

// NOTE: These are DEMO goals for non-Maria patients. For Maria, use generated care plan.
export const CARE_GOALS = [
  {
    id: 'goal-1',
    category: 'Clinical',
    goal: 'Achieve A1C < 8.0% within 6 months',
    owner: 'Primary Care',
    targetDate: '2026-10-16',
    status: 'In Progress',
    priority: 'high',
  },
  {
    id: 'goal-2',
    category: 'Clinical',
    goal: 'Resolve duplicate anticoagulant therapy and maintain safe medication regimen',
    owner: 'Primary Care',
    targetDate: '2026-06-20',
    status: 'In Progress',
    priority: 'critical',
  },
  {
    id: 'goal-3',
    category: 'Clinical',
    goal: 'Route HbA1c testing to Labcorp and confirm result return to PCP workflow',
    owner: 'Labcorp',
    targetDate: '2026-06-18',
    status: 'In Progress',
    priority: 'high',
  },
  {
    id: 'goal-4',
    category: 'SDoH',
    goal: 'Transportation barrier routed to Unite Us and outreach initiated',
    owner: 'Unite Us',
    targetDate: '2026-06-18',
    status: 'In Progress',
    priority: 'high',
  },
  {
    id: 'goal-5',
    category: 'Financial',
    goal: 'Capture gainshare after care gaps close and documentation is returned',
    owner: 'Value-Based Operations',
    targetDate: '2026-06-30',
    status: 'Pending',
    priority: 'moderate',
  },
  {
    id: 'goal-7',
    category: 'Preventive',
    goal: 'Schedule annual wellness visit when due',
    owner: 'Primary Care',
    targetDate: '2026-10-15',
    status: 'Pending',
    priority: 'moderate',
  },
];

export const ACUITY_STYLE: Record<string, { dot: string; badge: string }> = {
  critical: { dot: 'bg-[#da1e28]', badge: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]' },
  high: { dot: 'bg-[#f1c21b]', badge: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
  moderate: { dot: 'bg-[#0043ce]', badge: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]' },
};

export const STATUS_STYLE: Record<string, string> = {
  'Off Target': 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
  'On Target': 'bg-[#defbe6] text-[#24a148] border border-[#a7f0ba]',
  Monitoring: 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
};

export const GOAL_PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  high: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  moderate: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
};

export const GOAL_STATUS_ICON: Record<string, { icon: string; color: string }> = {
  'In Progress': { icon: 'ClockIcon', color: 'text-[#b45309]' },
  Active: { icon: 'BoltIcon', color: 'text-[#da1e28]' },
  Pending: { icon: 'EllipsisHorizontalCircleIcon', color: 'text-carbon-gray-50' },
  Completed: { icon: 'CheckCircleIcon', color: 'text-[#24a148]' },
};
