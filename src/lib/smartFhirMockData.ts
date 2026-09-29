// SMART on FHIR mock data and service utilities

import type {
  SmartLaunchContext,
  CdsCard,
  PatientJourneyPosition,
  MdOrder,
  CareTeamAssignment,
} from './smartFhirTypes';
import { getPatientByFhirId, getPatientById } from './patientRegistry';

// ─── Mock SMART Launch Context ────────────────────────────────────────────────
export const mockSmartLaunchContext: SmartLaunchContext = {
  patientId: 'patient/maria-redhawk-001',
  encounterId: 'enc-20260615-001',
  practitionerId: 'pract-bch-001',
  practitionerName: 'Prairie Health PCP',
  practitionerNpi: '1234567890',
  fhirBaseUrl: 'https://fhir.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
  accessToken: 'mock-access-token-xyz',
  tokenExpiry: Date.now() + 3600000,
  launchTimestamp: new Date().toISOString(),
  cernerOrgId: 'cerner-org-bennett-county',
};

// ─── Mock CDS Cards — Maria Redhawk Standardized ─────────────────────────────
export const mockCdsCards: CdsCard[] = [
  // Critical: Edinburgh PND overdue
  {
    id: 'cds-maria-1',
    hookType: 'patient-view',
    cardType: 'critical',
    summary: 'Edinburgh PND overdue 427 days — postpartum depression untreated',
    detail:
      'Postpartum depression screening shows Edinburgh PND score 11 (Moderate). Patient is 427 days postpartum with untreated moderate depression. BH referral sent May 1, 2026 to Postpartum Support Group — patient not yet enrolled. Immediate follow-up required for maternal mental health.',
    source: 'CDS Hooks / BH Screening Engine',
    indicator: 'critical',
    suggestions: [
      {
        id: 'sug-maria-1a',
        label: 'Follow up on BH referral',
        actions: [
          {
            type: 'create',
            description: 'Create Task: Contact Postpartum Support Group for enrollment status',
          },
        ],
      },
    ],
    timestamp: new Date().toISOString(),
  },
  // Warning: HbA1c gap
  {
    id: 'cds-maria-2',
    hookType: 'patient-view',
    cardType: 'warning',
    summary: 'HbA1c gap 38 days — pre-diabetes monitoring critical',
    detail:
      'Pre-diabetic HbA1c recheck is 38 days overdue. Last HbA1c: 6.2% (Pre-diabetic range). Due date: June 22, 2026. Primary barrier: 47-mile distance to Cedar Bluff Regional Healthcare with no reliable transport. Consider NEMT enrollment and bundle with Well-Child visit.',
    source: 'CDS Hooks / Care Gap Engine',
    indicator: 'warning',
    suggestions: [
      {
        id: 'sug-maria-2a',
        label: 'Order HbA1c lab',
        actions: [
          {
            type: 'create',
            description: 'Create ServiceRequest: HbA1c Lab · LOINC 4548-4',
          },
        ],
      },
    ],
    timestamp: new Date().toISOString(),
  },
  // Warning: Well-Child visit
  {
    id: 'cds-maria-3',
    hookType: 'patient-view',
    cardType: 'warning',
    summary: 'Well-Child 24-month visit — Sophia overdue 21 days',
    detail:
      "Daughter Sophia's 24-month well-child visit is 21 days overdue. Transportation barrier (47 miles) preventing appointment attendance. Bundle with Maria's HbA1c lab to reduce trips. Childcare coordination needed.",
    source: 'CDS Hooks / Pediatric Care Gap Engine',
    indicator: 'warning',
    timestamp: new Date().toISOString(),
  },
  // Info: Multiple benefits not enrolled
  {
    id: 'cds-maria-4',
    hookType: 'patient-view',
    cardType: 'info',
    summary: 'Multiple eligible benefits not enrolled — $807/month total',
    detail:
      'Maria is eligible for multiple benefits not currently enrolled: Childcare Subsidy ($487/mo), WIC Re-enrollment ($320/mo), LIHEAP (utility assistance), and Medicaid Non-Emergency Transport. Total monthly benefit value: $807. Enrollment would significantly improve care access and financial stability.',
    source: 'CDS Hooks / Social Needs Engine',
    indicator: 'info',
    links: [{ label: 'View Social Needs Detail', url: '/patient-detail', type: 'absolute' }],
    timestamp: new Date().toISOString(),
  },
  // Info: HCC Suspects
  {
    id: 'cds-maria-5',
    hookType: 'patient-view',
    cardType: 'info',
    summary: 'RAF opportunity — 3 HCC suspects, $12,400 value',
    detail:
      '3 HCC suspects identified for Maria Redhawk. Estimated RAF delta: +0.12 if all captured. Total revenue at risk: $12,400. Submission deadline: Dec 31, 2026.',
    source: 'CDS Hooks / RAF Engine',
    indicator: 'info',
    timestamp: new Date().toISOString(),
  },
];

// ─── Mock Patient Journey — Maria Redhawk Standardized ───────────────────────
export const mockPatientJourney: PatientJourneyPosition = {
  phase: 'high-risk-transition',
  phaseLabel: 'High-Risk Transition',
  phaseDescription:
    'Patient is 427 days postpartum with moderate depression (Edinburgh PND 11), pre-diabetes (HbA1c 6.2%), and significant social barriers. Transportation (47 miles) and childcare gaps blocking all clinical care access. Single parent with 2 young children.',
  riskTrajectory: 'worsening',
  daysInPhase: 427,
  nextMilestone: 'HbA1c lab due June 22, 2026 (38 days overdue)',
  urgencyScore: 82,
  signals: [
    {
      source: 'EMR',
      label: 'Edinburgh PND',
      value: 'Score 11 (Moderate) — 427d untreated',
      flagged: true,
    },
    { source: 'EMR', label: 'Last HbA1c', value: '6.2% (Pre-diabetic)', flagged: true },
    { source: 'HIE', label: 'Transportation', value: '47 miles — no vehicle', flagged: true },
    {
      source: 'HIE',
      label: 'Childcare',
      value: 'No support — 2 children (24mo, infant)',
      flagged: true,
    },
    { source: 'HIE', label: 'WIC Status', value: 'Expired May 1, 2025 — 5mo gap', flagged: true },
    { source: 'Claims', label: 'PMPM Cost', value: '$1,240 vs $780 target (+59%)', flagged: true },
    { source: 'EMR', label: 'Well-Child Visit', value: 'Sophia 24mo — 21d overdue', flagged: true },
    { source: 'HIE', label: 'Housing', value: 'Rental waitlist #47', flagged: false },
  ],
};

// ─── Mock Orders ──────────────────────────────────────────────────────────────
export const mockOrderCatalog: Array<{
  code: string;
  display: string;
  category: MdOrder['category'];
}> = [
  // Labs
  { code: 'HBA1C', display: 'Hemoglobin A1c', category: 'lab' },
  { code: 'BMP', display: 'Basic Metabolic Panel', category: 'lab' },
  { code: 'CMP', display: 'Comprehensive Metabolic Panel', category: 'lab' },
  { code: 'LIPID', display: 'Lipid Panel', category: 'lab' },
  { code: 'UACR', display: 'Urine Albumin-to-Creatinine Ratio', category: 'lab' },
  { code: 'EGFR', display: 'eGFR / Creatinine', category: 'lab' },
  // Medications
  { code: 'MET-ER-500', display: 'Metformin ER 500mg QD', category: 'medication' },
  { code: 'LIS-10', display: 'Lisinopril 10mg QD', category: 'medication' },
  { code: 'ATOR-40', display: 'Atorvastatin 40mg QHS', category: 'medication' },
  { code: 'EMPA-10', display: 'Empagliflozin 10mg QD', category: 'medication' },
  // Referrals
  { code: 'REF-NEPH', display: 'Nephrology Referral', category: 'referral' },
  { code: 'REF-CARD', display: 'Cardiology Referral', category: 'referral' },
  { code: 'REF-ENDO', display: 'Endocrinology Referral', category: 'referral' },
  { code: 'REF-OPTH', display: 'Ophthalmology — Diabetic Eye Exam', category: 'referral' },
  // Procedures
  { code: 'AWV', display: 'Annual Wellness Visit', category: 'procedure' },
  { code: 'FOOT-EXAM', display: 'Diabetic Foot Exam', category: 'procedure' },
  { code: 'CARE-COORD', display: 'Care Coordination Follow-up', category: 'procedure' },
  // Imaging
  { code: 'ECHO', display: 'Echocardiogram', category: 'imaging' },
  { code: 'RENAL-US', display: 'Renal Ultrasound', category: 'imaging' },
];

/** CPT/internal codes that trigger a synthetic PA-required CDS card from `invokeOrderSignHook`
 *  in mock mode (@/lib/fhir/cdsHooks) — a demo set, not a real payer PA rule list, so the
 *  CRD → DTR → PAS flow is exercisable without a live CDS backend. Advanced imaging is a
 *  standard, uncontroversial PA-trigger category, so the two imaging codes in the mock order
 *  catalog above are used. */
export const PA_REQUIRED_CODES: ReadonlySet<string> = new Set(['ECHO', 'RENAL-US']);

// ─── Mock Care Team Candidates ────────────────────────────────────────────────
export const mockCareTeamCandidates: CareTeamAssignment[] = [
  {
    id: 'cta-001',
    patientId: 'patient-001',
    encounterId: 'enc-20260416-001',
    providerId: 'prov-neph-001',
    providerName: 'Dr. Priya Mehta',
    providerNpi: '9876543210',
    specialty: 'Nephrology',
    role: 'Specialist',
    networkTier: 'Preferred',
    qualityScore: 94,
    waitDays: 8,
    distance: 2.4,
    autoSelected: true,
    selectionReason:
      'Preferred network, highest quality score, accepting new patients, closest to patient address',
    status: 'proposed',
    confirmedAt: undefined,
  },
  {
    id: 'cta-002',
    patientId: 'patient-001',
    encounterId: 'enc-20260416-001',
    providerId: 'prov-neph-002',
    providerName: 'Dr. Robert Chen',
    providerNpi: '8765432109',
    specialty: 'Nephrology',
    role: 'Specialist',
    networkTier: 'In-Network',
    qualityScore: 88,
    waitDays: 14,
    distance: 4.1,
    autoSelected: false,
    selectionReason: 'In-network, good quality score, moderate wait time',
    status: 'proposed',
  },
  {
    id: 'cta-003',
    patientId: 'patient-001',
    encounterId: 'enc-20260416-001',
    providerId: 'prov-endo-001',
    providerName: 'Dr. Sandra Williams',
    providerNpi: '7654321098',
    specialty: 'Endocrinology',
    role: 'Specialist',
    networkTier: 'Preferred',
    qualityScore: 91,
    waitDays: 12,
    distance: 3.2,
    autoSelected: true,
    selectionReason: 'Preferred network, high quality, T2DM specialist with CKD experience',
    status: 'proposed',
  },
];

// ─── Member-specific CDS cards (MD SMART fix ③) ──────────────────────────────
// Maria keeps her hand-authored golden-demo cards (mockCdsCards) byte-identical.
// Every other member gets cards derived from their own registry data (care gaps,
// behavioral health, RAF) so the CDS panel is never Maria's content under another
// member's name.
export function buildCdsCardsForMember(idOrFhir: string): CdsCard[] {
  const p = getPatientByFhirId(idOrFhir) ?? getPatientById(idOrFhir);
  if (p && p.platformId === 'MARIA_SD_001') return mockCdsCards;
  if (!p) return []; // unknown member: empty CDS, never Maria's cards
  const now = new Date().toISOString();
  const cards: CdsCard[] = [];
  const openGaps = (p.careGaps ?? []).filter((g) => g.status !== 'Closed');
  openGaps.slice(0, 4).forEach((g, i) => {
    const critical = g.daysOpen >= 90;
    cards.push({
      id: `cds-${p.platformId}-gap-${i}`,
      hookType: 'patient-view',
      cardType: critical ? 'critical' : 'warning',
      summary: `${g.name} — ${g.daysOpen} days open`,
      detail: `${g.domain} care gap for ${p.name}. Open ${g.daysOpen} days; owner ${g.assignedTo}. Address to close the gap.`,
      source: 'CDS Hooks / Care Gap Engine',
      indicator: critical ? 'critical' : 'warning',
      suggestions: [],
      timestamp: now,
    });
  });
  if (p.bhScoreLabel && p.bhScoreLabel !== '—') {
    cards.push({
      id: `cds-${p.platformId}-bh`,
      hookType: 'patient-view',
      cardType: 'warning',
      summary: `Behavioral health — ${p.bhScoreLabel}`,
      detail: `BH risk ${p.bhRisk}. Referral status: ${p.bhReferralStatus ?? 'n/a'}.`,
      source: 'CDS Hooks / BH Screening Engine',
      indicator: 'warning',
      suggestions: [],
      timestamp: now,
    });
  }
  if (p.hccSuspects) {
    const val = (p.hccValue ?? 0).toLocaleString();
    cards.push({
      id: `cds-${p.platformId}-raf`,
      hookType: 'patient-view',
      cardType: 'info',
      summary: `RAF opportunity — ${p.hccSuspects} HCC suspects, $${val} value`,
      detail: `Risk-adjustment coding opportunity for ${p.name}: ${p.hccSuspects} suspected HCC(s), estimated $${val}.`,
      source: 'CDS Hooks / RAF Engine',
      indicator: 'info',
      suggestions: [],
      timestamp: now,
    });
  }
  return cards; // may be [] for a member with no derivable signals — never Maria's cards
}
