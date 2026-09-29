// ─── scenarioRegistry.ts ─────────────────────────────────────────────────────
// Per-citizen scenario layer for the RHTP-Orchestrate screens.
// Types live in scenarioRegistry.types.ts.
// Generator functions live in scenarioRegistry.generators.ts.
// This file holds the authored Maria Redhawk narrative + the public API.
import { getPatientById } from '@/lib/patientRegistry';
import { DEFAULT_CITIZEN } from '@/uhg/data/citizenContext';
import { generate } from './scenarioRegistry.generators';

export type {
  ScSourceRecord, ScLogEntry, ScNode, ScEdge, ScReasoningLine, ScActivity,
  ScAgentPanel, ScCondition, ScOtherScenario, ScTriggerSignal, ScTrigger,
  CitizenScenario,
} from './scenarioRegistry.types';

import type { CitizenScenario } from './scenarioRegistry.types';

// ─── Authored override: Maria Redhawk (flagship demo — verbatim) ─────────────────

const MARIA_AUTHORED: Partial<CitizenScenario> = {
  identityConfidence: 97,
  dataProductsLine: '14 data products that matter for Maria.',
  backgroundAutoResolved: 847,
  intakeLine: 'SCENARIO INTAKE → MARIA_SD_001 — complexity HIGH — 4 conditions detected',
  memberContext: 'Maria Redhawk — Day 34 of 90-day post-acute postpartum episode',
  sourceRecords: [
    { id: 'claims', system: 'SD Medicaid · Claims Engine', systemColor: '#3b82f6', systemBg: 'rgba(59,130,246,0.08)', memberName: 'Maria Redhawk', memberId: 'CLM-8821-A', dob: '1992-06-15', address: 'Rural Route 1, Martin SD 57551', riskScore: 'HIGH — 7.8', consentStatus: 'FULL — HIPAA TPO', authStatus: 'AUTH-001 ACTIVE', conflicts: ['Name mismatch vs EHR', 'Address differs from CRM'] },
    { id: 'ehr', system: 'Bennett County Health · Clinical EHR', systemColor: '#22c55e', systemBg: 'rgba(34,197,94,0.08)', memberName: 'Maria Redhawk', memberId: 'EHR-44821', dob: '1992-06-15', address: 'Rural Route 1, Martin SD 57551', riskScore: 'MODERATE — 5.2', consentStatus: 'RESEARCH EXCLUDED', authStatus: 'AUTH-001 EXPIRING T-4', conflicts: ['Name mismatch vs Claims', 'Risk score conflict', 'Consent scope conflict'] },
    { id: 'auth', system: 'SD Medicaid · Auth System', systemColor: '#f59e0b', systemBg: 'rgba(245,158,11,0.08)', memberName: 'M. Redhawk', memberId: 'AUTH-MARIA_SD_001', dob: '1992-06-15', address: 'NOT ON FILE', riskScore: 'NOT SCORED', consentStatus: 'NOT VERIFIED', authStatus: 'AUTH-001 PENDING RENEWAL', conflicts: ['Name variant', 'Address missing', 'No risk score', 'No consent record'] },
    { id: 'care', system: 'Bennett County Health · Care Management', systemColor: '#a855f7', systemBg: 'rgba(168,85,247,0.08)', memberName: 'Maria R.', memberId: 'CM-2024-8821', dob: 'NOT ON FILE', address: 'Rural Route 1, Martin SD 57551', riskScore: 'HIGH — READMISSION', consentStatus: 'UNKNOWN', authStatus: 'NO AUTH RECORD', conflicts: ['Partial name only', 'DOB missing', 'No auth linkage', 'Consent unknown'] },
    { id: 'h1ab', system: 'RHTP Analytics · H1ab Platform', systemColor: '#06b6d4', systemBg: 'rgba(6,182,212,0.08)', memberName: 'Maria Redhawk', memberId: 'H1AB-MBR-8821', dob: '1992-06-15', address: 'Rural Route 1, Martin SD 57551', riskScore: 'HIGH — CARE MGMT', consentStatus: 'PARTIAL — TPO ONLY', authStatus: 'NOT LINKED', conflicts: ['Auth not linked', 'Consent scope partial', 'No risk score sync'] },
    { id: 'contract', system: 'SD Medicaid · SD-MCD', systemColor: '#f97316', systemBg: 'rgba(249,115,22,0.08)', memberName: 'M. Redhawk', memberId: 'EMP-SD-MCD', dob: 'NOT ON FILE', address: 'NOT ON FILE', riskScore: 'NOT SCORED', consentStatus: 'WELLNESS ONLY', authStatus: 'NO AUTH RECORD', conflicts: ['Name variant', 'DOB missing', 'Address missing', 'Wellness scope only'] },
  ],
  resolutionLog: [
    { id: 'l-anon0', text: 'Incoming: ANONYMOUS SESSION — device fingerprint only', color: '#6f6f6f', delay: 200 },
    { id: 'l-anon1', text: 'RHTP Care Management portal session detected — no authenticated identity', color: '#6f6f6f', delay: 400 },
    { id: 'l-anon2', text: 'CDP cross-referencing behavioral pattern against SD Medicaid Claims...', color: '#6f6f6f', delay: 600 },
    { id: 'l-anon3', text: 'Match: MARIA_SD_001 (87% confidence — RHTP + SD Medicaid Claims cross-reference)', color: '#f59e0b', delay: 800 },
    { id: 'l-norm0', text: 'Normalizing 6 source schemas → canonical CDP format...', color: '#6f6f6f', delay: 1000 },
    { id: 'l-norm1', text: 'SD Medicaid Claims     X12 837 → FHIR ExplanationOfBenefit ✓', color: '#3b82f6', delay: 1100 },
    { id: 'l-norm2', text: 'Bennett County Health EHR            HL7 v2.4 → FHIR Patient + Condition ✓', color: '#22c55e', delay: 1200 },
    { id: 'l-norm3', text: 'SD Medicaid Auth       Proprietary → FHIR CoverageEligibility ✓', color: '#f59e0b', delay: 1300 },
    { id: 'l-norm4', text: 'Bennett County Health Care Mgmt      CSV export → FHIR CarePlan + Task ✓', color: '#a855f7', delay: 1400 },
    { id: 'l-norm5', text: 'RHTP Analytics H1ab           REST → FHIR Task + CareTeam ✓', color: '#06b6d4', delay: 1500 },
    { id: 'l-norm6', text: 'CBO / Social Services           EDI 834 → FHIR Coverage ✓', color: '#f97316', delay: 1600 },
    { id: 'l-norm7', text: '→ Canonical member record ready for identity resolution', color: '#42be65', delay: 1700 },
    { id: 'l0', text: 'Ingesting 6 source streams...', color: '#6f6f6f', delay: 1900 },
    { id: 'l1', text: 'Authentication confirmed at login — identity promoted to KNOWN', color: '#42be65', delay: 2100 },
    { id: 'l-anon4', text: '→ Anonymous-to-known resolution: complete (RHTP Care Management portal signal)', color: '#42be65', delay: 2300 },
    { id: 'l2', text: 'Identity confirmed — MARIA_SD_001 (97% confidence)', color: '#42be65', delay: 2600 },
    { id: 'l3', text: 'Consent resolved — FULL (Claims authoritative)', color: '#42be65', delay: 3100 },
    { id: 'l4', text: 'Authorization CAREGAP_HBA1C attached — expiring T-4 days', color: '#f59e0b', delay: 3600 },
    { id: 'l5', text: 'Care gap CAREGAP_001 linked — HbA1c open 45 days', color: '#fa4d56', delay: 4100 },
    { id: 'l6', text: 'Episodes assembled — Postpartum, Diabetes active', color: '#8b5cf6', delay: 4600 },
    { id: 'l7', text: 'Provider Bennett County Health connected — NPI 1234567890', color: '#0C55B8', delay: 5100 },
    { id: 'l8', text: 'Dependent Sophia identified — PARENT_OF linked', color: '#ff7eb6', delay: 5600 },
    { id: 'l9', text: 'Caregiver Elena identified — CAREGIVER_FOR linked', color: '#c084fc', delay: 6100 },
    { id: 'l10', text: 'Proxy consent scope loaded — scoped active', color: '#c084fc', delay: 6600 },
    { id: 'l11', text: '✓ Knowledge Graph complete — Maria is now known', color: '#42be65', delay: 7100, isSuccess: true },
  ],
  kgNodes: [
    { id: 'center', x: 400, y: 260, r: 52, label: 'Maria Redhawk', color: '#fa4d56', delay: 800, isCenter: true },
    { id: 'consent', x: 400, y: 80, r: 30, label: 'Consent FULL', color: '#42be65', delay: 1200 },
    { id: 'auth', x: 180, y: 160, r: 34, label: 'CAREGAP_HBA1C ⚠ T-4', color: '#f59e0b', delay: 1700 },
    { id: 'caregap', x: 180, y: 370, r: 30, label: 'HbA1c Gap 45d', color: '#fa4d56', delay: 2200 },
    { id: 'cardiac', x: 600, y: 140, r: 34, label: 'Postpartum Episode', color: '#8b5cf6', delay: 2700 },
    { id: 'diabetes', x: 620, y: 370, r: 30, label: 'Pre-diabetic', color: '#8b5cf6', delay: 2900 },
    { id: 'chen', x: 760, y: 260, r: 36, label: 'Bennett County Health', color: '#0C55B8', delay: 3300 },
    { id: 'sofia', x: 280, y: 460, r: 28, label: 'Sophia · Dependent', color: '#ff7eb6', delay: 3800 },
    { id: 'elena', x: 520, y: 460, r: 28, label: 'Elena · Caregiver', color: '#c084fc', delay: 4300 },
  ],
  kgEdges: [
    { id: 'e-consent', from: 'center', to: 'consent', color: '#42be65', label: 'HAS_CONSENT', delay: 1300 },
    { id: 'e-auth', from: 'center', to: 'auth', color: '#f59e0b', label: 'HAS_AUTHORIZATION', delay: 1800 },
    { id: 'e-caregap', from: 'center', to: 'caregap', color: '#fa4d56', label: 'HAS_CARE_GAP', delay: 2300 },
    { id: 'e-cardiac', from: 'center', to: 'cardiac', color: '#8b5cf6', label: 'HAS_EPISODE', delay: 2800 },
    { id: 'e-diabetes', from: 'center', to: 'diabetes', color: '#8b5cf6', label: 'HAS_EPISODE', delay: 3000 },
    { id: 'e-chen', from: 'cardiac', to: 'chen', color: '#0C55B8', label: 'ATTENDED_BY', delay: 3400 },
    { id: 'e-sofia', from: 'center', to: 'sofia', color: '#ff7eb6', label: 'PARENT_OF', delay: 3900 },
    { id: 'e-elena', from: 'center', to: 'elena', color: '#c084fc', label: 'CAREGIVER_FOR', delay: 4400 },
  ],
  reasoningLines: [
    { id: 'rl-01', text: 'SCENARIO INTAKE → MARIA_SD_001 — complexity HIGH — 4 conditions detected', delay: 0 },
    { id: 'rl-02', text: 'DECOMPOSING → building constraint hierarchy...', delay: 700 },
    { id: 'rl-03', text: '  constraint hierarchy: appeal deadline HARD STOP | eligibility BLOCKS auth renewal | follow-up TIME-BOUND 30d', delay: 1400 },
    { id: 'rl-04', text: 'DOMAIN OWNERSHIP ASSIGNED:', delay: 2100 },
    { id: 'rl-05', text: '  Clinical Care Agent PRIMARY — owns conditions 1+4 | Social / SDOH Agent CONCURRENT — owns condition 2', delay: 2800 },
    { id: 'rl-06', text: '  Eligibility Agent SUPPORTING — owns condition 1 | Behavioral Health Agent COMPLIANCE — owns condition 3', delay: 3200 },
    { id: 'rl-07', text: 'GOVERNANCE active monitoring — policy boundary enforcement ON — audit trail initialized', delay: 3800 },
    { id: 'rl-08', text: 'DISPATCHING → all domain agents activating concurrently at T+0.0s ──────────────────────────────────', delay: 4600 },
  ],
  conditions: [
    { id: 1, type: 'BH_PND', label: 'Edinburgh PND follow-up', deadline: '427d open', severity: 'CRITICAL', regulatory: true, description: 'Moderate postpartum depression — 427 days open; BH follow-up gated by 42 CFR Part 2' },
    { id: 2, type: 'SDOH_TRANSPORT', label: 'Transportation barrier', severity: 'HIGH', description: '47 miles to Cedar Bluff Regional — keystone barrier that BLOCKS the HbA1c lab and appointments' },
    { id: 3, type: 'CARE_GAP_HBA1C', label: 'HbA1c lab overdue', deadline: '38d open', severity: 'HIGH', description: 'Pre-diabetic A1C 6.2% rising — lab blocked by transportation + childcare barriers' },
    { id: 4, type: 'FAMILY_BENEFITS', label: 'Family + benefits load', severity: 'MEDIUM', description: 'Sophia well-child overdue + Elena caregiver burden; WIC/childcare/LIHEAP eligible, not enrolled' },
  ],
  otherScenarios: [
    { id: 'SCN-002', member: 'PAT-0042', complexity: 'MEDIUM', countdown: '4:32', type: 'CARE_GAP' },
    { id: 'SCN-003', member: 'PAT-0087', complexity: 'MEDIUM', countdown: '7:15', type: 'SDOH' },
    { id: 'SCN-004', member: 'PAT-0156', complexity: 'MEDIUM', countdown: '2:48', type: 'ELIGIBILITY' },
  ],
  trigger: {
    signals: [
      { sig: 'AUTH_EXPIRY', detail: 'CAREGAP_HBA1C expiring T-4 days — HbA1c lab order contested', color: '#f1c21b', ts: '14:31:18' },
      { sig: 'CARE_GAP', detail: 'HbA1c gap CAREGAP_001 open 45 days — diabetes episode active', color: '#fa4d56', ts: '14:31:19' },
      { sig: 'BEHAVIORAL', detail: 'Portal engagement 2x/week — high receptivity window detected', color: '#42be65', ts: '14:31:20' },
    ],
    sdohProfile: 'Graph query returned: Financial ELEVATED · Transport PROBABLE · Caregiver Burden HIGH',
    familyContext: 'Sophia — 6 active care gaps · Elena — Lisinopril ⚠ INR overdue',
    journeyPosition: 'Day 34 postpartum episode · Q4 SD Medicaid quality window critical · CAREGAP_HBA1C T-4',
  },
  agentPanels: [
    {
      id: 'agent-care', name: 'Clinical Care Agent', role: 'PRIMARY', roleColor: '#0C55B8', owns: [1, 4],
      color: 'rgba(12,85,184,0.1)', borderColor: 'rgba(12,85,184,0.35)',
      activities: [
        { id: 'ca-01', text: 'Assess → Auth CAREGAP_HBA1C renewal workflow initiated — HbA1c lab order', type: 'info', timestamp: 'T+0.0s' },
        { id: 'ca-02', text: 'Review → Clinical evidence package assembling — 3 records queued', type: 'info', timestamp: 'T+0.8s' },
        { id: 'ca-03', text: 'Approve → Care gap CAREGAP_001 closure protocol activated — HbA1c order placed', type: 'success', timestamp: 'T+1.4s' },
        { id: 'ca-04', text: 'Monitor → SDOH risk protocol ACTIVE — 30d monitoring window open', type: 'warning', timestamp: 'T+2.1s' },
        { id: 'ca-05', text: 'Notify → Outreach scheduled 10am — PORTAL channel — combined auth+gap message', type: 'success', timestamp: 'T+2.8s' },
      ],
    },
    {
      id: 'agent-provider', name: 'Social / SDOH Agent', role: 'CONCURRENT', roleColor: '#8b5cf6', owns: [2],
      color: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.3)',
      activities: [
        { id: 'pa-01', text: 'Inform → Auth status notification queued → Bennett County Health EHR system', type: 'info', timestamp: 'T+0.0s' },
        { id: 'pa-02', text: 'Assess → Eligibility gap PROVIDER_001 flagged — 21 days remaining', type: 'warning', timestamp: 'T+0.6s' },
        { id: 'pa-03', text: 'Assist → Eligibility renewal initiated — Bennett County Health', type: 'info', timestamp: 'T+1.2s' },
        { id: 'pa-04', text: 'Resolve → Episode continuity alert issued — postpartum episode continuity PRESERVED', type: 'success', timestamp: 'T+1.9s' },
        { id: 'pa-05', text: 'Escalate → Provider enablement contact initiated — NPI 1234567890 notified', type: 'info', timestamp: 'T+2.5s' },
      ],
    },
    {
      id: 'agent-util', name: 'Eligibility Agent', role: 'SUPPORTING', roleColor: '#f59e0b', owns: [1],
      color: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.28)',
      activities: [
        { id: 'ua-01', text: 'Detect → Supporting Clinical Care Agent on condition 1 — auth contested review', type: 'info', timestamp: 'T+0.0s' },
        { id: 'ua-02', text: 'Investigate → Clinical necessity criteria pulled — SD Medicaid coverage policy', type: 'info', timestamp: 'T+0.9s' },
        { id: 'ua-03', text: 'Prevent → Clinical criteria met — supporting documentation assembled', type: 'success', timestamp: 'T+1.7s' },
        { id: 'ua-04', text: 'Recover → Eligibility review submitted — integrity check passed — expected response 4hr', type: 'info', timestamp: 'T+2.3s' },
      ],
    },
    {
      id: 'agent-appeals', name: 'Behavioral Health Agent', role: 'COMPLIANCE', roleColor: '#ef4444', owns: [3],
      color: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.28)',
      activities: [
        { id: 'aa-01', text: 'Assess → Appeal condition 3 — CRITICAL regulatory deadline T-72h', type: 'critical', timestamp: 'T+0.0s' },
        { id: 'aa-02', text: 'Review → SD Medicaid review requirements verified — clinical necessity determination required', type: 'warning', timestamp: 'T+0.7s' },
        { id: 'aa-03', text: 'Prepare → Appeal response draft assembling — 3 supporting records attached', type: 'info', timestamp: 'T+1.5s' },
        { id: 'aa-04', text: 'HOLD → ACTION READY: Automated appeal response — GOVERNANCE INTERCEPT REQUIRED', type: 'critical', timestamp: 'T+2.2s' },
      ],
    },
  ],
};

const AUTHORED: Record<string, Partial<CitizenScenario>> = {
  MARIA_SD_001: MARIA_AUTHORED,
};

// ─── Public API ─────────────────────────────────────────────────────────────────

export function scenarioFor(citizenId?: string): CitizenScenario {
  const p = getPatientById(citizenId || DEFAULT_CITIZEN) || getPatientById(DEFAULT_CITIZEN)!;
  const base = generate(p);
  const authored = AUTHORED[p.platformId];
  return authored ? { ...base, ...authored } : base;
}
