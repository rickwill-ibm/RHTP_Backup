// Maria Redhawk orchestration scenario — derived from her RHTP whole-person graph.
export const scenario = {
  scenarioId: 'SCENARIO_MARIA_SD_001',
  member: 'MARIA_SD_001',
  complexity: 'HIGH' as const,
  conditions: [
    { id: 1, type: 'BH_PND', label: 'Edinburgh PND follow-up', deadline: '427d open', severity: 'CRITICAL' as const, regulatory: true, description: 'Moderate postpartum depression — 427 days open; BH follow-up gated by 42 CFR Part 2' },
    { id: 2, type: 'SDOH_TRANSPORT', label: 'Transportation barrier', severity: 'HIGH' as const, description: '47 miles to Cedar Bluff Regional — keystone barrier that BLOCKS the HbA1c lab and appointments' },
    { id: 3, type: 'CARE_GAP_HBA1C', label: 'HbA1c lab overdue', deadline: '38d open', severity: 'HIGH' as const, description: 'Pre-diabetic A1C 6.2% rising — lab blocked by transportation + childcare barriers' },
    { id: 4, type: 'FAMILY_BENEFITS', label: 'Family + benefits load', severity: 'MEDIUM' as const, description: 'Sophia well-child overdue + Elena caregiver burden; WIC/childcare/LIHEAP eligible, not enrolled' },
  ],
  domainAssignment: {
    CareAgent: { role: 'PRIMARY', owns: [3], color: '#0C55B8' },
    ProviderAgent: { role: 'CONCURRENT', owns: [2], color: '#8b5cf6' },
    UtilizationAgent: { role: 'SUPPORTING', owns: [4], color: '#f59e0b' },
    AppealsAgent: { role: 'COMPLIANCE', owns: [1], color: '#ef4444' },
  },
  backgroundAutoResolved: 847,
  otherScenarios: [
    { id: 'SCN-002', member: 'PAT-0042', complexity: 'MEDIUM', countdown: '4:32', type: 'CARE_GAP' },
    { id: 'SCN-003', member: 'PAT-0087', complexity: 'MEDIUM', countdown: '7:15', type: 'SDOH' },
    { id: 'SCN-004', member: 'PAT-0156', complexity: 'MEDIUM', countdown: '2:48', type: 'ELIGIBILITY' },
  ],
};

export const resolution = {
  resolutionTime: '47 minutes',
  humanInterventions: 1,
  governanceBoundariesHonored: '4/4',
  threads: [
    { id: 'thread-bh', type: 'BH', status: 'PENDING', detail: 'PND follow-up — warm handoff within 42 CFR Part 2 scope', eta: '4hr', icon: 'shield' },
    { id: 'thread-transport', type: 'Transport', status: 'RESOLVING', detail: 'Home lab kit + ride voucher — eliminates 47-mile trip', icon: 'badge' },
    { id: 'thread-hba1c', type: 'CareGap', status: 'IN_REVIEW', detail: 'HbA1c home kit ordered — pre-diabetic monitoring', remaining: '68h', icon: 'gavel' },
    { id: 'thread-benefits', type: 'Benefits', status: 'ACTIVE', detail: 'WIC / childcare / LIHEAP enrollment outreach scheduled', icon: 'heart' },
  ],
  graphNodeTransitions: [
    { id: 'gnt-bh', node: 'BH', from: 'OVERDUE', to: 'PENDING', color: '#f59e0b' },
    { id: 'gnt-caregap', node: 'CareGap', from: 'BLOCKED', to: 'IN_PROGRESS', color: '#22c55e' },
    { id: 'gnt-transport', node: 'Transport', from: 'BARRIER', to: 'RESOLVING', color: '#8b5cf6' },
    { id: 'gnt-benefits', node: 'Benefits', from: 'UNENROLLED', to: 'OUTREACH', color: '#0C55B8' },
  ],
  metrics: [
    { id: 'metric-bh', label: 'PND follow-up time', before: 427, after: 4, unit: 'd', change: -99, direction: 'down' },
    { id: 'metric-gap', label: 'Care gap closure rate', before: 34, after: 58, unit: '%', change: 71, direction: 'up' },
    { id: 'metric-transport', label: 'Missed appts (transport)', before: 12, after: 5, unit: '/quarter', change: -58, direction: 'down' },
    { id: 'metric-enroll', label: 'Benefits enrolled', before: 2, after: 5, unit: '/5', change: 150, direction: 'up' },
  ],
};
