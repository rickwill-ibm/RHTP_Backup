// ─── scenarioRegistry.generators.ts ─────────────────────────────────────────
// Helper functions and generator functions that produce CitizenScenario objects
// from RegistryPatient + CitizenContext. Consumed by scenarioRegistry.ts.

import { getVisiblePatients, type RegistryPatient } from '@/lib/patientRegistry';
import { getFhirMockMode } from '@/lib/services/fhirClient';
import { contextFor, type CitizenContext } from '@/uhg/data/citizenContext';
import { journeyForPatient } from '@/uhg/data/journeys';
import { dispatchAgentsForPatient } from '@/app/uhg-orchestrate/agent-library/coalition';
import type {
  CitizenScenario, ScSourceRecord, ScLogEntry, ScNode, ScEdge,
  ScReasoningLine, ScAgentPanel, ScActivity, ScCondition, ScOtherScenario, ScTrigger,
} from './scenarioRegistry.types';

// ─── Small helpers ──────────────────────────────────────────────────────────────

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function nameParts(name: string) {
  const [first, ...rest] = name.split(' ');
  const last = rest.join(' ') || first;
  return { first, last, initialLast: `${first[0]}. ${last}`, abbrev: `${first} ${last[0]}.`, lastFirst: `${last}, ${first}` };
}
function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}
function mrnTail(p: RegistryPatient) {
  const m = (p.ehrMrn || p.platformId).match(/(\d{3,})/);
  return m ? m[1].slice(-4) : p.platformId.slice(-4);
}
function contractShort(contract: string) {
  return contract.replace(/[^A-Za-z0-9]/g, '-').toUpperCase().slice(0, 10);
}
function topClinicalGap(p: RegistryPatient) {
  return p.careGaps?.find((g) => g.domain === 'Clinical' && g.status !== 'Closed') || p.careGaps?.[0];
}
function gapShort(name: string) {
  return name.replace(/ \(.*\)/, '');
}

// ─── Source-system records ──────────────────────────────────────────────────────

function genSourceRecords(p: RegistryPatient): ScSourceRecord[] {
  const np = nameParts(p.name);
  const tier = (p.riskTier || 'Moderate').toUpperCase();
  const tail = mrnTail(p);
  const cs = contractShort(p.contract);
  const gap = topClinicalGap(p);
  const authLabel = gap ? `AUTH ${gapShort(gap.name)} EXPIRING T-4` : 'AUTH-001 EXPIRING T-4';
  const card = (
    id: string, system: string, color: string,
    memberName: string, memberId: string, dob: string, address: string,
    riskScore: string, consentStatus: string, authStatus: string, conflicts: string[],
  ): ScSourceRecord => ({ id, system, systemColor: color, systemBg: hexA(color, 0.08), memberName, memberId, dob, address, riskScore, consentStatus, authStatus, conflicts });

  return [
    card('claims', `${p.contract} · Claims Engine`, '#3b82f6',
      p.name, `CLM-${tail}-A`, p.dob, p.location,
      `${tier} — ${p.rafScore}`, 'FULL — HIPAA TPO', 'AUTH-001 ACTIVE',
      ['Name mismatch vs EHR', 'Address differs from CRM']),
    card('ehr', `${p.organization} · Clinical EHR`, '#22c55e',
      p.name, `EHR-${tail}`, p.dob, p.location,
      `MODERATE — clinical`, 'RESEARCH EXCLUDED', authLabel,
      ['Name mismatch vs Claims', 'Risk score conflict', 'Consent scope conflict']),
    card('auth', `${p.contract} · Auth System`, '#f59e0b',
      np.abbrev, `AUTH-${p.platformId}`, p.dob, 'NOT ON FILE',
      'NOT SCORED', 'NOT VERIFIED', 'AUTH-001 PENDING RENEWAL',
      ['Name variant', 'Address missing', 'No risk score', 'No consent record']),
    card('care', `${p.organization} · Care Management`, '#a855f7',
      np.abbrev, `CM-${tail}`, 'NOT ON FILE', p.location,
      `HIGH — READMISSION`, 'UNKNOWN', 'NO AUTH RECORD',
      ['Partial name only', 'DOB missing', 'No auth linkage', 'Consent unknown']),
    card('h1ab', 'RHTP Analytics · H1ab Platform', '#06b6d4',
      p.name, `H1AB-MBR-${tail}`, p.dob, p.location,
      `${tier} — CARE MGMT`, 'PARTIAL — TPO ONLY', 'NOT LINKED',
      ['Auth not linked', 'Consent scope partial', 'No risk score sync']),
    card('contract', `${p.contract} · ${cs}`, '#f97316',
      np.abbrev, `EMP-${cs}`, 'NOT ON FILE', 'NOT ON FILE',
      'NOT SCORED', 'WELLNESS ONLY', 'NO AUTH RECORD',
      ['Name variant', 'DOB missing', 'Address missing', 'Wellness scope only']),
  ];
}

// ─── Identity-resolution log ────────────────────────────────────────────────────

function genResolutionLog(p: RegistryPatient, ctx: CitizenContext): ScLogEntry[] {
  const np = nameParts(p.name);
  const gap = topClinicalGap(p);
  const out: ScLogEntry[] = [];
  let d = 200;
  const push = (id: string, text: string, color: string, isSuccess?: boolean) => { out.push({ id, text, color, delay: d, isSuccess }); d += 220; };

  push('l-anon0', 'Incoming: ANONYMOUS SESSION — device fingerprint only', '#6f6f6f');
  push('l-anon1', 'RHTP Care Management portal session detected — no authenticated identity', '#6f6f6f');
  push('l-anon2', `CDP cross-referencing behavioral pattern against ${p.contract} Claims...`, '#6f6f6f');
  push('l-anon3', `Match: ${p.platformId} (87% confidence — RHTP + ${p.contract} Claims cross-reference)`, '#f59e0b');
  push('l-norm0', 'Normalizing 6 source schemas → canonical CDP format...', '#6f6f6f');
  push('l-norm1', `${p.contract} Claims     X12 837 → FHIR ExplanationOfBenefit ✓`, '#3b82f6');
  push('l-norm2', `${p.organization} EHR     HL7 v2.4 → FHIR Patient + Condition ✓`, '#22c55e');
  push('l-norm3', `${p.contract} Auth       Proprietary → FHIR CoverageEligibility ✓`, '#f59e0b');
  push('l-norm4', `${p.organization} Care Mgmt      CSV export → FHIR CarePlan + Task ✓`, '#a855f7');
  push('l-norm5', 'RHTP Analytics H1ab           REST → FHIR Task + CareTeam ✓', '#06b6d4');
  push('l-norm7', '→ Canonical member record ready for identity resolution', '#42be65');
  push('l1', 'Authentication confirmed at login — identity promoted to KNOWN', '#42be65');
  push('l2', `Identity confirmed — ${p.platformId} (97% confidence)`, '#42be65');
  push('l3', 'Consent resolved — FULL (Claims authoritative)', '#42be65');
  if (gap) push('l4', `Care gap ${gapShort(gap.name)} attached — open ${gap.daysOpen} days`, '#f59e0b');
  push('l6', `Episode assembled — ${p.episodeType} (${p.episodeStatus})`, '#8b5cf6');
  push('l7', `Provider ${p.organization} connected — care team linked`, '#0C55B8');
  ctx.household.dependents.slice(0, 2).forEach((dep, i) =>
    push(`l-dep${i}`, `Dependent ${dep.name} identified — PARENT_OF linked`, '#ff7eb6'));
  ctx.household.caregiverFor.slice(0, 1).forEach((cg, i) =>
    push(`l-cg${i}`, `Caregiver-for ${cg.name} identified — CAREGIVER_FOR linked`, '#c084fc'));
  push('l11', `✓ Knowledge Graph complete — ${np.first} is now known`, '#42be65', true);
  return out;
}

// ─── Knowledge-graph subgraph ───────────────────────────────────────────────────

const SAT_POS = [
  { x: 400, y: 80, r: 30 }, { x: 180, y: 160, r: 34 }, { x: 180, y: 370, r: 30 },
  { x: 600, y: 140, r: 34 }, { x: 620, y: 370, r: 30 }, { x: 760, y: 260, r: 36 },
  { x: 280, y: 460, r: 28 }, { x: 520, y: 460, r: 28 },
];

function genGraph(p: RegistryPatient, ctx: CitizenContext): { nodes: ScNode[]; edges: ScEdge[] } {
  const gap = topClinicalGap(p);
  const sats: { id: string; label: string; color: string; rel: string }[] = [];
  sats.push({ id: 'consent', label: 'Consent FULL', color: '#42be65', rel: 'HAS_CONSENT' });
  if (gap) sats.push({ id: 'caregap', label: `${gapShort(gap.name)} ${gap.daysOpen}d`, color: '#fa4d56', rel: 'HAS_CARE_GAP' });
  sats.push({ id: 'episode', label: p.episodeType, color: '#8b5cf6', rel: 'HAS_EPISODE' });
  if (p.bhScreeningLabel) sats.push({ id: 'bh', label: p.bhScreeningLabel, color: '#f59e0b', rel: 'HAS_BH_SCREEN' });
  sats.push({ id: 'provider', label: p.organization.replace(/ \(.*\)/, ''), color: '#0C55B8', rel: 'ATTENDED_BY' });
  ctx.household.dependents.slice(0, 2).forEach((dep, i) =>
    sats.push({ id: `dep${i}`, label: `${dep.name} · Dependent`, color: '#ff7eb6', rel: 'PARENT_OF' }));
  ctx.household.caregiverFor.slice(0, 1).forEach((cg, i) =>
    sats.push({ id: `cg${i}`, label: `${cg.name} · Caregiver`, color: '#c084fc', rel: 'CAREGIVER_FOR' }));

  const nodes: ScNode[] = [{ id: 'center', x: 400, y: 260, r: 52, label: p.name, color: '#fa4d56', delay: 800, isCenter: true }];
  const edges: ScEdge[] = [];
  sats.slice(0, SAT_POS.length).forEach((s, i) => {
    const pos = SAT_POS[i];
    const delay = 1200 + i * 480;
    nodes.push({ id: s.id, x: pos.x, y: pos.y, r: pos.r, label: s.label, color: s.color, delay });
    edges.push({ id: `e-${s.id}`, from: 'center', to: s.id, color: s.color, label: s.rel, delay: delay + 100 });
  });
  return { nodes, edges };
}

// ─── Controller reasoning trace + agent panels ──────────────────────────────────

function genReasoning(p: RegistryPatient, conditions: number): ScReasoningLine[] {
  const coalition = dispatchAgentsForPatient(p);
  const ownerships = coalition.map((a, i) => `${a.name} ${a.role} — owns condition ${i + 1}`);
  const half = Math.ceil(ownerships.length / 2);
  return [
    { id: 'rl-01', text: `SCENARIO INTAKE → ${p.platformId} — complexity ${conditions >= 4 ? 'HIGH' : conditions >= 2 ? 'MODERATE' : 'LOW'} — ${conditions} conditions detected`, delay: 0 },
    { id: 'rl-02', text: 'DECOMPOSING → building constraint hierarchy...', delay: 700 },
    { id: 'rl-03', text: '  constraint hierarchy: regulatory deadline HARD STOP | eligibility BLOCKS auth renewal | follow-up TIME-BOUND 30d', delay: 1400 },
    { id: 'rl-04', text: `DOMAIN OWNERSHIP ASSIGNED — ${coalition.length} agents dispatched from marketplace:`, delay: 2100 },
    { id: 'rl-05', text: `  ${ownerships.slice(0, half).join(' | ')}`, delay: 2800 },
    { id: 'rl-06', text: `  ${ownerships.slice(half).join(' | ')}`, delay: 3200 },
    { id: 'rl-07', text: 'GOVERNANCE active monitoring — policy boundary enforcement ON — audit trail initialized', delay: 3800 },
    { id: 'rl-08', text: `DISPATCHING → all ${coalition.length} domain agents activating concurrently at T+0.0s ──────────────────────────────────`, delay: 4600 },
  ];
}

function genAgentPanels(p: RegistryPatient, ctx: CitizenContext): ScAgentPanel[] {
  const gap = topClinicalGap(p);
  const gapName = gap ? gapShort(gap.name) : 'open care gap';
  const keystone = ctx.barriers.find((b) => b.keystone) || ctx.barriers[0];
  const barrierLabel = keystone ? keystone.label : 'SDOH barrier';
  const bh = p.bhScoreLabel || p.bhScreeningLabel || 'BH screen';
  const cgFirst = ctx.household.caregiverFor[0]?.name.split(' ')[0] || 'caregiver';
  const cgMed = p.household?.caregiverFor?.[0]?.meds?.[0]?.name || 'medication';

  const acts = (id: string): ScActivity[] => {
    switch (id) {
      case 'agent-care':
        return [
          { id: 'ca-01', text: `Assess → ${gapName} renewal workflow initiated — order queued`, type: 'info', timestamp: 'T+0.0s' },
          { id: 'ca-02', text: 'Review → Clinical evidence package assembling — 3 records queued', type: 'info', timestamp: 'T+0.8s' },
          { id: 'ca-03', text: `Approve → Care gap ${gapName} closure protocol activated`, type: 'success', timestamp: 'T+1.4s' },
          { id: 'ca-04', text: 'Monitor → SDOH risk protocol ACTIVE — 30d monitoring window open', type: 'warning', timestamp: 'T+2.1s' },
          { id: 'ca-05', text: `Notify → Outreach scheduled — ${ctx.channel.primary} channel — combined message`, type: 'success', timestamp: 'T+2.8s' },
        ];
      case 'agent-provider':
        return [
          { id: 'pa-01', text: `Inform → Status notification queued → ${p.organization} EHR system`, type: 'info', timestamp: 'T+0.0s' },
          { id: 'pa-02', text: `Assess → ${barrierLabel} flagged — keystone barrier`, type: 'warning', timestamp: 'T+0.6s' },
          { id: 'pa-03', text: `Assist → SDOH-aware sequencing initiated — ${p.organization}`, type: 'info', timestamp: 'T+1.2s' },
          { id: 'pa-04', text: `Resolve → Episode continuity alert issued — ${p.episodeType} continuity PRESERVED`, type: 'success', timestamp: 'T+1.9s' },
          { id: 'pa-05', text: 'Escalate → Provider enablement contact initiated — care team notified', type: 'info', timestamp: 'T+2.5s' },
        ];
      case 'agent-util':
        return [
          { id: 'ua-01', text: 'Detect → Supporting Clinical Care Agent — auth contested review', type: 'info', timestamp: 'T+0.0s' },
          { id: 'ua-02', text: `Investigate → Clinical necessity criteria pulled — ${p.contract} coverage policy`, type: 'info', timestamp: 'T+0.9s' },
          { id: 'ua-03', text: 'Prevent → Clinical criteria met — supporting documentation assembled', type: 'success', timestamp: 'T+1.7s' },
          { id: 'ua-04', text: 'Recover → Eligibility review submitted — integrity check passed — expected response 4hr', type: 'info', timestamp: 'T+2.3s' },
        ];
      case 'agent-appeals':
        return [
          { id: 'aa-01', text: `Assess → ${bh} — regulatory deadline T-72h`, type: 'critical', timestamp: 'T+0.0s' },
          { id: 'aa-02', text: `Review → ${p.contract} review requirements verified — clinical necessity determination required`, type: 'warning', timestamp: 'T+0.7s' },
          { id: 'aa-03', text: 'Prepare → Response draft assembling — 3 supporting records attached', type: 'info', timestamp: 'T+1.5s' },
          { id: 'aa-04', text: 'HOLD → ACTION READY: Automated response — GOVERNANCE INTERCEPT REQUIRED', type: 'critical', timestamp: 'T+2.2s' },
        ];
      case 'agent-caregiver':
        return [
          { id: 'cg-01', text: `Validate → ${cgFirst} proxy consent scope confirmed — CAREGIVER_FOR boundary enforced`, type: 'info', timestamp: 'T+0.0s' },
          { id: 'cg-02', text: `Assess → ${cgMed} interaction flagged — caregiver-managed regimen reviewed`, type: 'warning', timestamp: 'T+0.8s' },
          { id: 'cg-03', text: 'Coordinate → Medication review bundled into PCP visit — refill sync initiated', type: 'success', timestamp: 'T+1.6s' },
          { id: 'cg-04', text: `Notify → ${cgFirst} caregiver loop closed — combined outreach scheduled`, type: 'info', timestamp: 'T+2.3s' },
        ];
      case 'agent-financial':
        return [
          { id: 'fi-01', text: 'Estimate → OOP liability modeled — $340–$480 calculated pre-action', type: 'info', timestamp: 'T+0.0s' },
          { id: 'fi-02', text: 'Assess → Cost exposure flagged — member financial-strain signal active', type: 'warning', timestamp: 'T+0.7s' },
          { id: 'fi-03', text: 'Resolve → Generic substitution + manufacturer copay program identified', type: 'success', timestamp: 'T+1.5s' },
          { id: 'fi-04', text: 'Notify → Cost summary dispatched to member portal — surprise-bill risk eliminated', type: 'info', timestamp: 'T+2.2s' },
        ];
      default:
        return [{ id: `${id}-01`, text: 'Assess → workflow initiated', type: 'info', timestamp: 'T+0.0s' }];
    }
  };

  return dispatchAgentsForPatient(p).map((a, i) => ({
    id: a.id, name: a.name, role: a.role, roleColor: a.color, owns: [i + 1],
    color: hexA(a.color, 0.1), borderColor: hexA(a.color, 0.3),
    activities: acts(a.id),
  }));
}

// ─── Condition decomposition + live scenario queue ──────────────────────────────

function genConditions(p: RegistryPatient, ctx: CitizenContext): ScCondition[] {
  const clinicalGap = topClinicalGap(p);
  const keystone = ctx.barriers.find((b) => b.keystone) || ctx.barriers[0];
  const social = (p.careGaps || []).filter((g) => g.domain === 'Social');
  const bhSeverity: ScCondition['severity'] = p.bhRisk === 'Crisis' || p.bhRisk === 'High' ? 'CRITICAL' : 'HIGH';
  const dep = ctx.household.dependents[0];
  return [
    {
      id: 1, type: 'BH', label: `${p.bhScreeningLabel} follow-up`,
      deadline: `${p.episodeDaysActive}d open`, severity: bhSeverity, regulatory: true,
      description: `${p.bhScoreLabel} — ${p.episodeDaysActive} days open; BH follow-up gated by 42 CFR Part 2`,
    },
    {
      id: 2, type: 'SDOH', label: keystone ? keystone.label : 'SDOH barrier', severity: 'HIGH',
      description: keystone
        ? `${keystone.label} — keystone barrier that BLOCKS ${(keystone.blocks[0] || 'clinical care gaps')}`
        : `${p.transportStatus} — access barrier affecting appointments`,
    },
    {
      id: 3, type: 'CARE_GAP', label: clinicalGap ? `${gapShort(clinicalGap.name)} overdue` : 'Care gap overdue',
      deadline: clinicalGap ? `${clinicalGap.daysOpen}d open` : undefined, severity: 'HIGH',
      description: clinicalGap
        ? `${gapShort(clinicalGap.name)} — ${clinicalGap.daysOpen} days open; blocked by SDOH barriers`
        : 'Clinical care gap blocked by SDOH barriers',
    },
    {
      id: 4, type: 'FAMILY_BENEFITS', label: dep ? 'Family + benefits load' : 'Benefits load', severity: 'MEDIUM',
      description: `${dep ? dep.name + ' ' + dep.detail.toLowerCase() + '; ' : ''}${social.length} social gaps · ${p.snapStatus}`,
    },
  ];
}

function genOtherScenarios(activeId: string): ScOtherScenario[] {
  const typeFor = (p: RegistryPatient) => {
    const s = (p.careGaps || []).find((g) => g.status !== 'Closed');
    return s ? (s.domain === 'Social' ? 'SDOH' : s.domain === 'BH' ? 'BEHAVIORAL' : 'CARE_GAP') : 'ELIGIBILITY';
  };
  const counts = ['4:32', '7:15', '2:48', '5:09', '3:21'];
  return getVisiblePatients(getFhirMockMode())
    .filter((p) => p.platformId !== activeId)
    .slice(0, 3)
    .map((p, i) => ({
      id: `SCN-00${i + 2}`, member: p.platformId,
      complexity: (p.riskTier || 'Moderate').toUpperCase() === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      countdown: counts[i % counts.length], type: typeFor(p),
    }));
}

// ─── Trigger modal ("Why Orchestration Activated") ──────────────────────────────

function genTrigger(p: RegistryPatient, ctx: CitizenContext): ScTrigger {
  const gap = topClinicalGap(p);
  const gapName = gap ? gapShort(gap.name) : 'Care gap';
  const gapDays = gap ? gap.daysOpen : 0;
  const gapId = gap ? `CAREGAP_${gapName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}` : 'CAREGAP_001';
  const journey = journeyForPatient(p);

  const sdohBits: string[] = [];
  if (p.household?.caregiverFor?.length) sdohBits.push('Caregiver Burden HIGH');
  if (/mile|barrier|high/i.test(p.transportStatus || '')) sdohBits.push('Transport PROBABLE');
  else if (/active|unite|referral/i.test(p.transportStatus || '')) sdohBits.push('Transport MANAGED');
  if (/not enrolled|expired|lapsed/i.test(p.snapStatus || '') || /low income/i.test(p.disparityFlag || '')) sdohBits.push('Financial ELEVATED');
  if (/insecur|desert/i.test(p.foodSecurity || '')) sdohBits.push('Food MODERATE');
  if (p.bhRisk !== 'Low') sdohBits.push(`Behavioral ${p.bhRisk === 'High' || p.bhRisk === 'Crisis' ? 'ELEVATED' : 'MODERATE'}`);
  const sdohProfile = `Graph query returned: ${sdohBits.slice(0, 3).join(' · ') || 'Low SDOH burden'}`;

  const fam: string[] = [];
  (p.household?.dependents || []).forEach((d) => fam.push(`${d.name.split(' ')[0]} — ${d.gaps.length} active care gap${d.gaps.length !== 1 ? 's' : ''}`));
  (p.household?.caregiverFor || []).forEach((c) => fam.push(`${c.name.split(' ')[0]} — ${c.meds[0]?.name || 'meds'} · ${c.clinicalMetric}`));
  const familyContext = fam.slice(0, 2).join(' · ') || 'No dependents or caregiver relationships on file';

  const journeyPosition = `Day ${journey.currentDay} ${p.episodeType} episode · ${p.contract} quality window · ${gapName} T-4`;

  return {
    signals: [
      { sig: 'AUTH_EXPIRY', detail: `${gapId} expiring T-4 days — ${gapName} order contested`, color: '#f1c21b', ts: '14:31:18' },
      { sig: 'CARE_GAP', detail: `${gapName} gap ${gapId} open ${gapDays} days — ${p.episodeType} episode active`, color: '#fa4d56', ts: '14:31:19' },
      { sig: 'BEHAVIORAL', detail: 'Portal engagement 2x/week — high receptivity window detected', color: '#42be65', ts: '14:31:20' },
    ],
    sdohProfile,
    familyContext,
    journeyPosition,
  };
}

// ─── Top-level generator ─────────────────────────────────────────────────────────

export function generate(p: RegistryPatient): CitizenScenario {
  const ctx = contextFor(p.platformId);
  const np = nameParts(p.name);
  const conditions = (p.careGaps || []).filter((g) => g.status !== 'Closed').length || 4;
  const dataProducts = Math.min(20, Math.max(8, conditions + 5));
  const { nodes, edges } = genGraph(p, ctx);
  return {
    id: p.platformId, name: p.name, firstName: np.first, lastName: np.last, age: p.age, initials: initials(p.name),
    identityConfidence: 97,
    dataProductsLine: `${dataProducts} data products that matter for ${np.first}.`,
    sourceRecords: genSourceRecords(p),
    resolutionLog: genResolutionLog(p, ctx),
    kgNodes: nodes, kgEdges: edges,
    intakeLine: `SCENARIO INTAKE → ${p.platformId} — complexity ${conditions >= 4 ? 'HIGH' : 'MODERATE'} — ${conditions} conditions detected`,
    memberContext: `${p.name} — Day ${p.episodeDaysActive} of ${p.episodeType} episode`,
    reasoningLines: genReasoning(p, conditions),
    agentPanels: genAgentPanels(p, ctx),
    conditions: genConditions(p, ctx),
    backgroundAutoResolved: 720 + (p.erRiskPct || 40) * 3,
    otherScenarios: genOtherScenarios(p.platformId),
    trigger: genTrigger(p, ctx),
  };
}
