// ─── devStubs.pas.ts ──────────────────────────────────────────────────────────
// PAS (Prior Authorization Support) stubs: $member-match, bulk export,
// work queue items, and ClaimResponse.

import { profileFor } from './devStubs.profiles';

/** A canned $member-match result identifying the seeded demo member. */
export function devMemberMatch(patientId?: string): unknown {
  const pid = patientId ?? 'MARIA_SD_001';
  const p = profileFor(pid);
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'MemberPatient',
        resource: {
          resourceType: 'Patient',
          id: pid,
          name: [{ family: p.name.split(' ').pop(), given: [p.name.split(' ')[0]] }],
          birthDate: p.dob,
          gender: p.gender,
          identifier: [{ system: 'https://rhtp.example/prior-payer-id', value: p.priorMemberId }],
        },
      },
    ],
  };
}

export function devBulkStart(): { jobId: string } {
  return { jobId: 'dev-p2p-job-001' };
}

/**
 * Enriched poll result — completed with full 5-year resource inventory.
 * Patient-aware: each patient gets their own prior-payer history.
 */
export function devBulkStatus(patientId?: string): {
  state: string;
  completedAt: string;
  priorPayer: string;
  memberMatchedId: string;
  coveragePeriod: { start: string; end: string };
  fileUrls: string[];
  resourceCounts: Record<string, number>;
  paHistory: Array<{
    service: string;
    cpt: string;
    decision: string;
    denialReason?: string;
    authNumber?: string;
    date: string;
  }>;
  newConditionsAdded: number;
  coverageGapsResolved: number;
} {
  const p = profileFor(patientId ?? 'MARIA_SD_001');
  return {
    state: 'completed',
    completedAt: new Date(Date.now() - 8000).toISOString(),
    priorPayer: p.priorPayer,
    memberMatchedId: p.priorMemberId,
    coveragePeriod: { start: p.priorCoverageStart, end: p.priorCoverageEnd },
    // USCDI v3 data classes required by CMS-0057-F §422.120(a)(2) — 7 NDJSON files
    fileUrls: [
      '/dev/export/eob.ndjson',
      '/dev/export/coverage.ndjson',
      '/dev/export/pa-history.ndjson',
      '/dev/export/clinical.ndjson',
      '/dev/export/allergies.ndjson',
      '/dev/export/immunizations.ndjson',
      '/dev/export/patient.ndjson',
    ],
    resourceCounts: {
      ExplanationOfBenefit: p.eobCount,
      Coverage: p.coverageCount,
      Claim: p.claimCount,
      ClaimResponse: p.claimResponseCount,
      Condition: p.conditionCount,
      MedicationRequest: p.medicationCount,
      Observation: p.observationCount,
      Procedure: p.procedureCount,
      Encounter: p.encounterCount,
      AllergyIntolerance: Math.round(p.conditionCount * 0.3),
      Immunization: Math.round(p.encounterCount * 0.15),
      Patient: 1,
    },
    paHistory: p.paHistory,
    newConditionsAdded: p.newConditionsAdded,
    coverageGapsResolved: p.coverageGapsResolved,
  };
}

/**
 * Seeded work-queue items for demo — one per key patient scenario.
 *
 * SLA rules per CMS-0057-F §422.122(b)(1):
 *   - Expedited (urgent/life-threatening): 72 hours
 *   - Standard: 7 calendar days = 168 hours
 */
export function devWorkQueueItems(): Array<{
  id: string;
  memberId: string;
  code: string;
  queue: string;
  netOutcome: string;
  requiresPA: boolean;
  propensityScore: number;
  propensityBand: string;
  isExpedited: boolean;
  slaDurationHours: number;
  submittedAt: string;
  slaDueAt: string;
  slaBreached: boolean;
}> {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600000).toISOString();
  return [
    {
      id: 'wq-001',
      memberId: 'MARIA_SD_001',
      code: '72148',
      queue: 'high-risk-review',
      netOutcome: 'requires-review',
      requiresPA: true,
      propensityScore: 0.71,
      propensityBand: 'high',
      isExpedited: true,
      slaDurationHours: 72,
      submittedAt: hoursAgo(4),
      slaDueAt: hoursFromNow(68),
      slaBreached: false,
    },
    {
      id: 'wq-002',
      memberId: 'PAT-0042',
      code: '75561',
      queue: 'more-info',
      netOutcome: 'more-info',
      requiresPA: true,
      propensityScore: 0.48,
      propensityBand: 'medium',
      isExpedited: false,
      slaDurationHours: 168,
      submittedAt: hoursAgo(26),
      slaDueAt: hoursFromNow(142),
      slaBreached: false,
    },
    {
      id: 'wq-003',
      memberId: 'PAT-0087',
      code: '93306',
      queue: 'ready-to-submit',
      netOutcome: 'approved',
      requiresPA: false,
      propensityScore: 0.12,
      propensityBand: 'low',
      isExpedited: false,
      slaDurationHours: 168,
      submittedAt: hoursAgo(2),
      slaDueAt: hoursFromNow(166),
      slaBreached: false,
    },
    {
      id: 'wq-004',
      memberId: 'PAT-0103',
      code: '99243',
      queue: 'auto-cleared',
      netOutcome: 'pa-exempt-gold-card',
      requiresPA: false,
      propensityScore: 0.08,
      propensityBand: 'low',
      isExpedited: false,
      slaDurationHours: 168,
      submittedAt: hoursAgo(1),
      slaDueAt: hoursFromNow(167),
      slaBreached: false,
    },
    {
      id: 'wq-005',
      memberId: 'PAT-0042',
      code: '94010',
      queue: 'denied-appeal',
      netOutcome: 'denied',
      requiresPA: true,
      propensityScore: 0.82,
      propensityBand: 'high',
      isExpedited: true,
      slaDurationHours: 72,
      submittedAt: hoursAgo(78),
      slaDueAt: hoursAgo(6),
      slaBreached: true,
    },
  ];
}

/** A canned approved ClaimResponse for the human-approved PAS submission. */
export function devClaimResponseApproved(approvedBy: string, patientId?: string): unknown {
  const pid = patientId ?? 'MARIA_SD_001';
  const p = profileFor(pid);
  return {
    resourceType: 'ClaimResponse',
    id: `dev-cr-approved-${pid}`,
    status: 'active',
    type: { text: p.paScenario.procedureName },
    use: 'preauthorization',
    patient: { reference: `Patient/${pid}` },
    outcome: 'complete',
    disposition: `Prior authorization approved (dev demo). Reviewed by ${approvedBy}.`,
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-1' } }],
    item: [
      {
        itemSequence: 1,
        adjudication: [
          { category: { text: 'benefit' }, reason: { text: 'Approved — criteria met' } },
        ],
      },
    ],
    addItem: [
      {
        productOrService: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: p.paScenario.cptCode,
              display: p.paScenario.procedureName,
            },
          ],
        },
      },
    ],
  };
}
