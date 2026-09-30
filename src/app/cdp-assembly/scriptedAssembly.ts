// src/app/cdp-assembly/scriptedAssembly.ts — the scripted NARRATIVE walkthrough data.
//
// Extracted verbatim from page.tsx (no behavior change) so the page file has room for the
// real Live Load view and stays under its size baseline. This is the single-member
// ILLUSTRATION: a hand-authored cascade that tells the identity-resolution story for one
// demo member. It is NOT a data load — the Live Load mode drives the real pipeline. Keep
// these two strictly apart: nothing here is fed by, or feeds, the live telemetry.

export const DEVICE_FINGERPRINT = 'dv_SD_8821x';
export const PRE_AUTH_CONFIDENCE = '87%';
export const POST_AUTH_CONFIDENCE = '94%';
export const IDENTITY_METHOD = 'DETERMINISTIC_CONFIRMED';
export const IDENTITY_STATE_BEFORE = 'FRAGMENTED';
export const IDENTITY_STATE_AFTER = 'UNIFIED';
export const PROGRAM = 'Medicaid RHTP Track 3';
export const STATE_AGENCY = 'State HHS Agency';
export const LOG_LINE_DELAY_MS = 80;

export const IDENTITY_SOURCES = [
  { label: 'SD Medicaid MRN', value: 'SD_MBR_MARIA_001' },
  { label: 'CAH EHR MRN', value: 'MRN-SD-001' },
  { label: 'CHIP Guardian ID', value: 'SD_CHIP_GUARDIAN_001' },
  { label: 'Pharmacy Account', value: 'MARTIN_PHARM_MARIA' },
];

export const SURVIVORSHIP_RULES = ['Clinical (EHR) > Claims (Medicaid) > Pharmacy > DSS Benefits'];

export function buildGraphNodes(memberId: string): string[] {
  return [
    `Member identity — ${memberId} · 4 roles confirmed`,
    'Insurance — SD Medicaid ACTIVE · CHIP (Sophia) ACTIVE',
    'Care Gaps — 3 clinical · 2 BH · 4 social (9 total)',
    'Episodes — Pre-Diabetic ACTIVE · Postpartum UNMANAGED',
    'Medications — Metformin · Lisinopril (Elena) · Amoxicillin (Sophia)',
    'Provider — Prairie Health CAH · Sarah Johnson CM',
    'SDOH — Transport HIGH · Childcare HIGH · Food MODERATE',
    'Consent — Layer 1 ACTIVE · Layer 2 ACTIVE · Layer 3 ACTIVE · Layer 4 PENDING',
    'Dependents — Sophia Redhawk (24mo) · Elena Redhawk (58y)',
    'Benefits — WIC LAPSED · Childcare Subsidy ELIGIBLE_NOT_ENROLLED',
    'Pharmacy Intelligence — Martin Pharmacy 2x/month family pickup',
    'Caregiver Burden — Zarit 48 · 18hrs/week · no respite',
  ];
}

export interface SourceSystem {
  id: string;
  name: string;
  owner: string;
  format: string;
  formatType: 'edi' | 'hl7' | 'rest' | 'ncpdp' | 'csv' | 'bh';
  fhir: string;
  records: string;
  stream: number;
  isBH?: boolean;
}

export const SOURCE_SYSTEMS: SourceSystem[] = [
  {
    id: 'src-1',
    name: 'SD Medicaid MMIS',
    owner: STATE_AGENCY,
    format: 'X12 837 EDI',
    formatType: 'edi',
    fhir: 'FHIR ExplanationOfBenefit + CoverageEligibilityResponse',
    records: '847 claims · eligibility active',
    stream: 1,
  },
  {
    id: 'src-2',
    name: 'Prairie Health EHR',
    owner: 'Prairie Health Services',
    format: 'HL7 v2.x',
    formatType: 'hl7',
    fhir: 'FHIR Patient + Condition + Observation',
    records: '12 encounters · 3 active conditions',
    stream: 2,
  },
  {
    id: 'src-3',
    name: 'SD CHIP / Dependent Coverage',
    owner: STATE_AGENCY,
    format: 'X12 837 EDI',
    formatType: 'edi',
    fhir: 'FHIR Patient + Coverage (Sophia)',
    records: '34 claims · CHIP active',
    stream: 3,
  },
  {
    id: 'src-4',
    name: 'Martin Pharmacy PMS',
    owner: 'Martin Pharmacy',
    format: 'NCPDP SCRIPT',
    formatType: 'ncpdp',
    fhir: 'FHIR MedicationDispense',
    records: '18 dispenses · cross-family pattern',
    stream: 4,
  },
  {
    id: 'src-5',
    name: 'State Benefits — Integrated Benefits',
    owner: 'State Benefits Agency',
    format: 'EDI 834 + CSV',
    formatType: 'csv',
    fhir: 'FHIR Coverage + CarePlan + Task',
    records: 'SNAP active · 4 benefit gaps identified',
    stream: 5,
  },
  {
    id: 'src-6',
    name: 'State Division of Behavioral Health',
    owner: 'State HHS Agency BH Division',
    format: 'REST API',
    formatType: 'bh',
    fhir: 'FHIR CarePlan + EpisodeOfCare [42 CFR Pt 2 · SUD segment]',
    records: '1 BH episode · consent verified',
    stream: 6,
    isBH: true,
  },
];

// ─── Log line definitions ─────────────────────────────────────────────────────
export type LogLineType = 'default' | 'amber' | 'lime' | 'red' | 'phase' | 'indent';

export interface LogLine {
  text: string;
  type: LogLineType;
  cardTrigger?: number; // triggers card N to advance status
  phase?: number;
}

export function buildLogLines(
  memberId: string,
  memberRoles: string[],
  completionMessage: string
): LogLine[] {
  const graphNodes = buildGraphNodes(memberId);
  return [
    // Phase 1
    { text: '── PHASE 1: ANONYMOUS SESSION DETECTION ──────────────────', type: 'phase', phase: 1 },
    { text: `> SD RHTP Platform session initiated`, type: 'default' },
    { text: `> Device fingerprint detected: ${DEVICE_FINGERPRINT}`, type: 'default' },
    { text: `> Identity state: ANONYMOUS`, type: 'default' },
    { text: `> Behavioral pattern cross-reference initiated...`, type: 'default' },
    { text: `> SD Medicaid claims history lookup: RUNNING`, type: 'default' },
    // Phase 2
    { text: '── PHASE 2: PROBABILISTIC IDENTITY MATCH ─────────────────', type: 'phase', phase: 2 },
    { text: `> Cross-reference complete`, type: 'default' },
    { text: `> Candidate match: ${memberId}`, type: 'amber' },
    { text: `> Confidence score: ${PRE_AUTH_CONFIDENCE} [████████░░]`, type: 'amber' },
    { text: `> Identity state: CANDIDATE · held pending authentication`, type: 'default' },
    { text: `> 4 source identifiers queued for resolution:`, type: 'default' },
    { text: `    SD Medicaid MRN: SD_MBR_MARIA_001`, type: 'indent' },
    { text: `    CAH EHR MRN: MRN-SD-001`, type: 'indent' },
    { text: `    CHIP Guardian ID: SD_CHIP_GUARDIAN_001`, type: 'indent' },
    { text: `    Pharmacy Account: MARTIN_PHARM_MARIA`, type: 'indent' },
    // Phase 3
    { text: '── PHASE 3: SIX SOURCE STREAM INGESTION ──────────────────', type: 'phase', phase: 3 },
    {
      text: `> [SD Medicaid MMIS]       X12 837 EDI  → FHIR ExplanationOfBenefit ✓`,
      type: 'lime',
      cardTrigger: 1,
    },
    {
      text: `> [Bennett County EHR]     HL7 v2.x     → FHIR Patient + Condition ✓`,
      type: 'lime',
      cardTrigger: 2,
    },
    {
      text: `> [SD CHIP Coverage]       X12 837 EDI  → FHIR Patient + Coverage ✓`,
      type: 'lime',
      cardTrigger: 3,
    },
    {
      text: `> [Martin Pharmacy PMS]    NCPDP SCRIPT → FHIR MedicationDispense ✓`,
      type: 'lime',
      cardTrigger: 4,
    },
    {
      text: `> [State Benefits Line Benefits]        EDI 834+CSV  → FHIR Coverage + Task ✓`,
      type: 'lime',
      cardTrigger: 5,
    },
    {
      text: `> [SD BH Division]         REST API     → FHIR CarePlan ⚠ 42 CFR Pt 2 (SUD)`,
      type: 'red',
    },
    { text: `    > SUD (Part 2) consent verified: ACTIVE`, type: 'indent' },
    { text: `    > SD BH Division stream: FHIR EpisodeOfCare ✓`, type: 'lime', cardTrigger: 6 },
    { text: `> Survivorship rules applied:`, type: 'default' },
    { text: `    Clinical > Claims > Pharmacy > DSS Benefits`, type: 'indent' },
    // Phase 4
    { text: '── PHASE 4: IDENTITY PROMOTION ───────────────────────────', type: 'phase', phase: 4 },
    { text: `> Authentication event received`, type: 'default' },
    { text: `> ANONYMOUS → KNOWN promotion triggered`, type: 'amber' },
    {
      text: `> Confidence score: ${PRE_AUTH_CONFIDENCE} → ${POST_AUTH_CONFIDENCE} [█████████░]`,
      type: 'amber',
    },
    { text: `> Identity method: ${IDENTITY_METHOD}`, type: 'default' },
    { text: `> Golden ID locked: ${memberId}`, type: 'amber' },
    { text: `> Session promoted: anon_sess_SD_8821x → known_sess_${memberId}`, type: 'default' },
    { text: `> Identity roles confirmed: ${memberRoles.join(' · ')}`, type: 'default' },
    { text: `> Identity state: ${IDENTITY_STATE_BEFORE} → ${IDENTITY_STATE_AFTER}`, type: 'amber' },
    // Phase 5
    { text: '── PHASE 5: KNOWLEDGE GRAPH ASSEMBLY ─────────────────────', type: 'phase', phase: 5 },
    { text: `> Graph population agent activated`, type: 'default' },
    { text: `> Writing nodes:`, type: 'default' },
    ...graphNodes.map((n) => ({ text: `    ✦ ${n}`, type: 'indent' as LogLineType })),
    { text: `> 52 nodes written · 67 edges created`, type: 'default' },
    { text: `> Consent enforcement: 4 layers checked`, type: 'default' },
    { text: `    Layer 4 (Elena caregiver): PENDING — household view partial`, type: 'indent' },
    // Completion
    { text: completionMessage, type: 'amber' },
    { text: `    52 nodes · 67 edges · 4 roles · 14 streams · <3 minutes`, type: 'indent' },
  ];
}

export type CardStatus = 'PENDING' | 'INGESTING' | 'NORMALISING' | 'COMPLETE' | 'CONSENT_CHECK';

export const FORMAT_BADGE: Record<string, { bg: string; text: string }> = {
  edi: { bg: '#1e3a5f', text: '#60a5fa' },
  hl7: { bg: '#1a3a2a', text: '#4ade80' },
  rest: { bg: '#2d1b4e', text: '#c084fc' },
  ncpdp: { bg: '#3b1f00', text: '#fb923c' },
  csv: { bg: '#2a2000', text: '#fbbf24' },
  bh: { bg: '#3b0a0a', text: '#f87171' },
};

export const COMPLETION_STATS = [
  { label: '52 NODES', icon: '◈' },
  { label: '67 EDGES', icon: '⟷' },
  { label: '4 ROLES', icon: '◉' },
  { label: '14 STREAMS', icon: '⇶' },
  { label: '<3 MIN', icon: '◷' },
];

export function getLineColor(type: LogLineType): string {
  switch (type) {
    case 'amber':
      return '#F59E0B';
    case 'lime':
      return '#84CC16';
    case 'red':
      return '#EF4444';
    case 'phase':
      return '#F59E0B';
    case 'indent':
      return '#94a3b8';
    default:
      return '#e2e8f0';
  }
}

export function getLineFontWeight(type: LogLineType): string {
  return type === 'phase' || type === 'amber' ? '700' : '400';
}

export function getCardStatusConfig(status: CardStatus): {
  label: string;
  color: string;
  bg: string;
  dot: string;
} {
  switch (status) {
    case 'PENDING':
      return { label: 'PENDING', color: '#64748b', bg: '#1e293b', dot: '#475569' };
    case 'INGESTING':
      return { label: 'INGESTING...', color: '#60a5fa', bg: '#1e3a5f', dot: '#3b82f6' };
    case 'NORMALISING':
      return { label: 'NORMALISING', color: '#fbbf24', bg: '#2a1f00', dot: '#f59e0b' };
    case 'COMPLETE':
      return { label: 'COMPLETE ✓', color: '#84CC16', bg: '#1a2e0a', dot: '#84CC16' };
    case 'CONSENT_CHECK':
      return { label: '⚠ CONSENT CHECK', color: '#f87171', bg: '#3b0a0a', dot: '#ef4444' };
  }
}
