'use client';

import React, { useState, useEffect, useRef } from 'react';
import ScreenLayout from '@/uhg/components/shared/ScreenLayout';
import PresenterControls from '@/uhg/components/shared/PresenterControls';
import MariaStatusStrip from '@/uhg/components/shared/MariaStatusStrip';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById } from '@/lib/patientRegistry';
import { dispatchAgentsForPatient, type CoalitionAgent } from '@/app/uhg-orchestrate/agent-library/coalition';
import OrchestrationFlowModal from '@/uhg/components/shared/OrchestrationFlowModal';

// ─── Timeline milestones ──────────────────────────────────────────────────────

interface Milestone {
  id: string;
  time: string;
  timeMin: number;
  label: string;
  agent: string;
  agentColor: string;
  detail: string;
  kpiImpact: string;
  kpiColor: string;
}

interface ImpactTokens {
  isMaria: boolean; name: string; firstName: string; lastName: string;
  org: string; topGapName: string; contract: string; careManager: string;
  depName: string; hasDep: boolean; cgFirst: string; cgMed: string; hasCg: boolean; hhId: string;
}

// Each dispatchable domain agent contributes one timeline milestone, so the intervention
// timeline reflects the member's actual coalition (which varies per patient) rather than a
// fixed step list. Detail strings bind to the member's context tokens.
interface AgentStepTpl { label: string; agent: string; color: string; detail: (t: ImpactTokens) => string; kpi: string; kpiColor: string }
const AGENT_STEP: Record<string, AgentStepTpl> = {
  'agent-care':      { label: 'Auth Evidence Assembled',    agent: 'Clinical Care Agent + Eligibility Agent', color: '#0C55B8', detail: (t) => `Clinical evidence package complete — ${t.topGapName} order — ${t.contract} coverage policy`, kpi: 'Auth cycle: 8.2d → 0.3d  ↓ 96%', kpiColor: '#42be65' },
  'agent-util':      { label: 'Eligibility Gap Resolved',   agent: 'Eligibility Agent',                       color: '#f59e0b', detail: (t) => `${t.org} renewal initiated — episode continuity preserved`, kpi: 'Active episode protected', kpiColor: '#f59e0b' },
  'agent-financial': { label: 'Financial Exposure Modeled', agent: 'Financial Intelligence Agent',            color: '#10b981', detail: () => 'OOP liability calculated — specialist referral initiated — cost summary sent to member portal', kpi: 'Financial surprise risk eliminated', kpiColor: '#10b981' },
  'agent-provider':  { label: 'SDOH Barriers Mapped',       agent: 'Social / SDOH Agent',                     color: '#8b5cf6', detail: () => 'Transport + financial barriers mapped — SDOH-modified intervention routed — standard outreach failure averted', kpi: 'Barrier-aware intervention substituted', kpiColor: '#8b5cf6' },
  'agent-caregiver': { label: 'Caregiver Thread Activated', agent: 'Caregiver Intelligence Agent',            color: '#c084fc', detail: (t) => `${t.cgFirst} proxy consent scope validated — ${t.cgMed} interaction flagged — PCP visit bundled T+7d`, kpi: 'Caregiver loop closed — medication risk surfaced', kpiColor: '#c084fc' },
  'agent-appeals':   { label: 'Appeal Held for Review',     agent: 'Behavioral Health Agent + Governance',    color: '#f1c21b', detail: (t) => `${t.contract} APPEAL.AUTO.THRESHOLD.001 — clinical necessity requires human sign-off — ${t.careManager} notified`, kpi: 'Compliance window honored ✓', kpiColor: '#f1c21b' },
};

function buildMilestones(t: ImpactTokens, coalition: CoalitionAgent[]): Milestone[] {
  if (t.isMaria) return MARIA_MILESTONES;
  interface Step { label: string; agent: string; color: string; detail: string; kpi: string; kpiColor: string }
  const steps: Step[] = [
    { label: 'Orchestration Activated', agent: 'Controller', color: '#FF6310', detail: `${coalition.length} agents dispatched concurrently — AUTH + CARE_GAP signals in 30s window`, kpi: `${coalition.length} agents dispatched concurrently`, kpiColor: '#FF6310' },
    { label: 'Signal Disposition Scored', agent: 'Signal Disposition Agent', color: '#06b6d4', detail: 'Active signals triaged — priority scored — escalation threshold crossed', kpi: 'Triage latency: 18min manual → 3min automated  ↓ 83%', kpiColor: '#06b6d4' },
    ...coalition.map((a): Step => {
      const tpl = AGENT_STEP[a.id];
      return tpl
        ? { label: tpl.label, agent: tpl.agent, color: tpl.color, detail: tpl.detail(t), kpi: tpl.kpi, kpiColor: tpl.kpiColor }
        : { label: `${a.name} Dispatched`, agent: a.name, color: a.color, detail: `${a.name} engaged for this member`, kpi: 'Agent action complete', kpiColor: a.color };
    }),
    { label: 'Scenario Resolved', agent: 'All Agents', color: '#42be65', detail: 'All conditions addressed — governance honored — outreach scheduled — monitoring active', kpi: 'Readmission risk: Elevated → Protocol active', kpiColor: '#42be65' },
  ];
  const resolutionMin = 18 + coalition.length * 6; // total orchestration window scales with coalition size
  const N = steps.length;
  return steps.map((s, i) => {
    const tm = Math.round((i * resolutionMin) / (N - 1));
    return { id: `ms-${i}`, time: i === 0 ? 'T+0' : `T+${tm}m`, timeMin: tm, label: s.label, agent: s.agent, agentColor: s.color, detail: s.detail, kpiImpact: s.kpi, kpiColor: s.kpiColor };
  });
}

const MARIA_MILESTONES: Milestone[] = [] = [
  {
    id: 'ms-0',
    time: 'T+0',
    timeMin: 0,
    label: 'Orchestration Activated',
    agent: 'Controller',
    agentColor: '#FF6310',
    detail: '3 signals in 30s window — AUTH + CARE_GAP + BEHAVIORAL',
    kpiImpact: '4 agents dispatched concurrently',
    kpiColor: '#FF6310',
  },
  {
    id: 'ms-sig',
    time: 'T+3m',
    timeMin: 3,
    label: 'Signal Disposition Scored',
    agent: 'Signal Disposition Agent',
    agentColor: '#06b6d4',
    detail: 'AUTH_EXPIRY + CARE_GAP_OPEN + BEHAVIORAL_RISK triaged — priority score 94/100 — escalation threshold crossed',
    kpiImpact: 'Triage latency: 18min manual → 3min automated  ↓ 83%',
    kpiColor: '#06b6d4',
  },
  {
    id: 'ms-1',
    time: 'T+8m',
    timeMin: 8,
    label: 'Auth Evidence Assembled',
    agent: 'Clinical Care Agent + Eligibility Agent',
    agentColor: '#0C55B8',
    detail: 'Clinical evidence package complete — HbA1c lab order — SD Medicaid LCD L38779',
    kpiImpact: 'Auth cycle: 8.2d → 0.3d  ↓ 96%',
    kpiColor: '#42be65',
  },
  {
    id: 'ms-fin',
    time: 'T+15m',
    timeMin: 15,
    label: 'Financial Exposure Modeled',
    agent: 'Financial Intelligence Agent',
    agentColor: '#10b981',
    detail: 'OOP liability $340–$480 calculated — referral Dr. Sarah Kim initiated — cost summary sent to member portal',
    kpiImpact: 'Financial surprise risk eliminated — member notified in 15m',
    kpiColor: '#10b981',
  },
  {
    id: 'ms-care',
    time: 'T+19m',
    timeMin: 19,
    label: 'Caregiver Thread Activated',
    agent: 'Caregiver Intelligence Agent',
    agentColor: '#c084fc',
    detail: 'Elena proxy consent scope validated — A1C monitoring order initiated — Lisinopril interaction flagged — PCP visit bundled T+7d',
    kpiImpact: 'Medication risk surfaced — caregiver loop closed in 19m',
    kpiColor: '#c084fc',
  },
  {
    id: 'ms-2',
    time: 'T+22m',
    timeMin: 22,
    label: 'Eligibility Gap Resolved',
    agent: 'Provider Agent',
    agentColor: '#8b5cf6',
    detail: 'Bennett County Health renewal initiated — Bennett County Health — episode continuity preserved',
    kpiImpact: '12 active episodes protected',
    kpiColor: '#8b5cf6',
  },
  {
    id: 'ms-3',
    time: 'T+31m',
    timeMin: 31,
    label: 'Appeal Held for Review',
    agent: 'Behavioral Health Agent + Governance',
    agentColor: '#f1c21b',
    detail: 'SD Medicaid.APPEAL.AUTO.THRESHOLD.001 — clinical necessity requires human sign-off — Dr. K. Patel notified',
    kpiImpact: 'Compliance window: 68h remaining ✓',
    kpiColor: '#f1c21b',
  },
  {
    id: 'ms-4',
    time: 'T+47m',
    timeMin: 47,
    label: 'Scenario Resolved',
    agent: 'All Agents',
    agentColor: '#42be65',
    detail: 'All 4 conditions addressed — governance honored — outreach scheduled — monitoring active',
    kpiImpact: 'Readmission risk: Elevated → Protocol active',
    kpiColor: '#42be65',
  },
  {
    id: 'ms-mtm',
    time: 'T+44m',
    timeMin: 44,
    label: 'Med review Duplicate Therapy Flagged',
    agent: 'Med review Agent + Governance',
    agentColor: '#fa4d56',
    detail: 'Lisinopril + Metformin duplicate therapy identified — CONSENT.DOMAIN.BOUNDARY.002 intercept — prescriber alerts dispatched to Bennett County Health + Bennett County Health — Med review enrolled partial',
    kpiImpact: 'Patient safety risk surfaced — prescribers notified in 44m',
    kpiColor: '#fa4d56',
  },
];;

// ─── Thread Status Rows ───────────────────────────────────────────────────────

interface ThreadRow {
  id: string;
  label: string;
  status: string;
  statusColor: string;
  detail: string;
  agent: string;
  agentColor: string;
  icon: string;
}

function buildThreadRows(t: ImpactTokens): ThreadRow[] {
  if (t.isMaria) return MARIA_THREAD_ROWS;
  const R: ThreadRow[] = [
    { id: 'th-signal', label: 'Signal Disposition', status: 'SCORED', statusColor: '#06b6d4', detail: 'AUTH_EXPIRY + CARE_GAP + BEHAVIORAL triaged — priority 94/100 — escalation triggered at T+3m', agent: 'Signal Disposition Agent', agentColor: '#06b6d4', icon: '◎' },
    { id: 'th-auth', label: 'Authorization', status: 'PENDING', statusColor: '#f59e0b', detail: `Clinical evidence assembled — ${t.topGapName} order — awaiting payer review`, agent: 'Clinical Care Agent + Eligibility Agent', agentColor: '#0C55B8', icon: '◐' },
    { id: 'th-cred', label: 'Eligibility', status: 'RENEWAL', statusColor: '#8b5cf6', detail: `${t.org} renewal initiated — 21d window`, agent: 'Social / SDOH Agent', agentColor: '#8b5cf6', icon: '↻' },
    { id: 'th-appeal', label: 'Appeal', status: 'IN REVIEW', statusColor: '#f1c21b', detail: `Governance intercept — clinical necessity — ${t.careManager} notified — 68h remaining`, agent: 'Behavioral Health Agent + Governance', agentColor: '#f1c21b', icon: '⚑' },
    { id: 'th-readmit', label: 'Readmission', status: 'MONITORING', statusColor: '#78a9ff', detail: '30-day monitoring window open — risk protocol active — discharge follow-up scheduled', agent: 'Clinical Care Agent', agentColor: '#0C55B8', icon: '◉' },
    { id: 'th-financial', label: 'Financial Intelligence', status: 'COMPLETE', statusColor: '#10b981', detail: 'OOP summary $340–$480 generated — specialist referral initiated — cost summary sent to portal at T+15m', agent: 'Financial Intelligence Agent', agentColor: '#10b981', icon: '✓' },
  ];
  if (t.hasDep) R.push({ id: 'th-family', label: `Family · ${t.depName}`, status: 'ACTIVE', statusColor: '#fa4d56', detail: `Pediatrician referral ${t.org} + screenings scheduled — combined outreach sent`, agent: 'Family Thread Agent', agentColor: '#fa4d56', icon: '◉' });
  if (t.hasCg) {
    R.push({ id: 'th-elena', label: `Caregiver · ${t.cgFirst}`, status: 'ACTIVE', statusColor: '#c084fc', detail: `Monitoring order initiated — ${t.cgMed} interaction flagged — medication review bundled into PCP visit T+7d`, agent: 'Caregiver Intelligence Agent', agentColor: '#c084fc', icon: '◉' });
    R.push({ id: 'th-consent', label: 'Proxy Consent', status: 'VERIFIED', statusColor: '#42be65', detail: `Scope validated before every ${t.cgFirst} action — CAREGIVER_FOR boundary enforced — audit logged`, agent: 'Governance · Consent Engine', agentColor: '#42be65', icon: '✓' });
    R.push({ id: 'th-mtm', label: 'Med review — Duplicate Therapy', status: 'ACTIVE', statusColor: '#fa4d56', detail: 'Duplicate therapy — CONSENT.DOMAIN.BOUNDARY.002 intercept — prescriber alerts dispatched — Med review enrolled partial — consent expansion queued', agent: 'Med review Agent + Governance', agentColor: '#fa4d56', icon: '⚠' });
  }
  if (t.hasDep || t.hasCg) R.push({ id: 'th-household', label: `Household · ${t.hhId}`, status: 'COORDINATED', statusColor: '#ff7eb6', detail: `Combined outreach — ${t.careManager} assigned — covers full household${t.hasCg ? ` · ${t.cgFirst} reminder via separate channel` : ''}`, agent: 'Household Coordination', agentColor: '#ff7eb6', icon: '⌂' });
  return R;
}

const MARIA_THREAD_ROWS: ThreadRow[] = [] = [
  {
    id: 'th-signal',
    label: 'Signal Disposition',
    status: 'SCORED',
    statusColor: '#06b6d4',
    detail: 'AUTH_EXPIRY + CARE_GAP + BEHAVIORAL triaged — priority 94/100 — escalation triggered at T+3m',
    agent: 'Signal Disposition Agent',
    agentColor: '#06b6d4',
    icon: '◎',
  },
  {
    id: 'th-auth',
    label: 'Authorization',
    status: 'PENDING',
    statusColor: '#f59e0b',
    detail: 'Clinical evidence assembled — HbA1c lab order — awaiting payer review',
    agent: 'Clinical Care Agent + Eligibility Agent',
    agentColor: '#0C55B8',
    icon: '◐',
  },
  {
    id: 'th-cred',
    label: 'Eligibility',
    status: 'RENEWAL',
    statusColor: '#8b5cf6',
    detail: 'Bennett County Health renewal initiated — Bennett County Health — 21d window',
    agent: 'Social / SDOH Agent',
    agentColor: '#8b5cf6',
    icon: '↻',
  },
  {
    id: 'th-appeal',
    label: 'Appeal',
    status: 'IN REVIEW',
    statusColor: '#f1c21b',
    detail: 'Governance intercept — clinical necessity — Dr. K. Patel notified — 68h remaining',
    agent: 'Behavioral Health Agent + Governance',
    agentColor: '#f1c21b',
    icon: '⚑',
  },
  {
    id: 'th-readmit',
    label: 'Readmission',
    status: 'MONITORING',
    statusColor: '#78a9ff',
    detail: '30-day monitoring window open — risk protocol active — discharge follow-up scheduled',
    agent: 'Clinical Care Agent',
    agentColor: '#0C55B8',
    icon: '◉',
  },
  {
    id: 'th-financial',
    label: 'Financial Intelligence',
    status: 'COMPLETE',
    statusColor: '#10b981',
    detail: 'OOP summary $340–$480 generated — referral Dr. Sarah Kim initiated — cost summary sent to portal at T+15m',
    agent: 'Financial Intelligence Agent',
    agentColor: '#10b981',
    icon: '✓',
  },
  {
    id: 'th-family',
    label: 'Family · Sophia',
    status: 'ACTIVE',
    statusColor: '#fa4d56',
    detail: 'Pediatrician referral Bennett County Health + 4 screenings scheduled — combined outreach sent',
    agent: 'Family Thread Agent',
    agentColor: '#fa4d56',
    icon: '◉',
  },
  {
    id: 'th-elena',
    label: 'Caregiver · Elena',
    status: 'ACTIVE',
    statusColor: '#c084fc',
    detail: 'A1C monitoring order initiated — Lisinopril interaction flagged — medication review bundled into PCP visit T+7d',
    agent: 'Caregiver Intelligence Agent',
    agentColor: '#c084fc',
    icon: '◉',
  },
  {
    id: 'th-consent',
    label: 'Proxy Consent',
    status: 'VERIFIED',
    statusColor: '#42be65',
    detail: 'Scope validated before every Elena action — CAREGIVER_FOR boundary enforced — audit logged',
    agent: 'Governance · Consent Engine',
    agentColor: '#42be65',
    icon: '✓',
  },
  {
    id: 'th-household',
    label: 'Household · REDHAWK_HH-001',
    status: 'COORDINATED',
    statusColor: '#ff7eb6',
    detail: 'Combined outreach: 1 message — Maria postpartum + Sophia pediatric · Household load: 1/3 weekly cap · Elena A1C reminder via separate channel · Sarah Johnson assigned — covers full household · Sophia well-visit bundled Q4 SD Medicaid quality',
    agent: 'Household Coordination',
    agentColor: '#ff7eb6',
    icon: '⌂',
  },
  {
    id: 'th-mtm',
    label: 'Med review — Duplicate Therapy',
    status: 'ACTIVE',
    statusColor: '#fa4d56',
    detail: 'Lisinopril (Bennett County Health · CVS) + Metformin (Bennett County Health · Walgreens) — same molecule — CONSENT.DOMAIN.BOUNDARY.002 intercept — prescriber alerts dispatched — Med review enrolled partial — consent expansion queued',
    agent: 'Med review Agent + Governance',
    agentColor: '#fa4d56',
    icon: '⚠',
  },
];;

// ─── Channel attribution per thread ──────────────────────────────────────────

interface ChannelBadge {
  channel: string;
  color: string;
  note?: string;
}

function buildThreadChannels(t: ImpactTokens): Record<string, ChannelBadge[]> {
  if (t.isMaria) return MARIA_THREAD_CHANNELS;
  return {
    'th-signal': [{ channel: 'SYSTEM', color: '#06b6d4' }],
    'th-auth': [{ channel: 'PORTAL', color: '#42be65', note: `${t.firstName} via portal` }, { channel: 'EHR', color: '#0C55B8', note: `${t.org} via EHR` }],
    'th-cred': [{ channel: 'EHR', color: '#0C55B8', note: 'Provider notification' }],
    'th-appeal': [{ channel: 'CARE MGR', color: '#f1c21b', note: `${t.careManager} notified` }],
    'th-readmit': [{ channel: 'PORTAL', color: '#42be65', note: `${t.firstName} monitoring` }],
    'th-financial': [{ channel: 'PORTAL', color: '#42be65', note: 'Cost summary sent' }],
    'th-family': [{ channel: 'PORTAL', color: '#42be65', note: `${t.firstName}${t.depName ? ' + ' + t.depName : ''} combined` }],
    'th-elena': [{ channel: 'PHONE', color: '#f59e0b', note: `${t.cgFirst} via phone` }, { channel: 'PORTAL', color: '#42be65', note: `${t.firstName} via portal` }],
    'th-consent': [{ channel: 'PORTAL', color: '#42be65', note: 'Consent verified' }],
    'th-household': [{ channel: 'PORTAL', color: '#42be65', note: t.firstName }, { channel: 'PHONE', color: '#f59e0b', note: `${t.cgFirst} — no overlap` }],
    'th-mtm': [{ channel: 'EHR', color: '#0C55B8', note: 'Prescriber alerts' }, { channel: 'PORTAL', color: '#42be65', note: `${t.firstName} notified` }],
  };
}

const MARIA_THREAD_CHANNELS: Record<string, ChannelBadge[]> = {
  'th-signal':    [{ channel: 'SYSTEM', color: '#06b6d4' }],
  'th-auth':      [{ channel: 'PORTAL', color: '#42be65', note: 'Maria via portal' }, { channel: 'EHR', color: '#0C55B8', note: 'Bennett County Health via EHR' }],
  'th-cred':      [{ channel: 'EHR', color: '#0C55B8', note: 'Provider notification' }],
  'th-appeal':    [{ channel: 'CARE MGR', color: '#f1c21b', note: 'Dr. K. Patel notified' }],
  'th-readmit':   [{ channel: 'PORTAL', color: '#42be65', note: 'Maria monitoring' }],
  'th-financial': [{ channel: 'PORTAL', color: '#42be65', note: 'Cost summary sent' }],
  'th-family':    [{ channel: 'PORTAL', color: '#42be65', note: 'Maria + Sophia combined' }],
  'th-elena':     [{ channel: 'PHONE', color: '#f59e0b', note: 'Elena via phone' }, { channel: 'PORTAL', color: '#42be65', note: 'Maria via portal' }],
  'th-consent':   [{ channel: 'PORTAL', color: '#42be65', note: 'Consent verified' }],
  'th-household': [{ channel: 'PORTAL', color: '#42be65', note: 'Maria' }, { channel: 'PHONE', color: '#f59e0b', note: 'Elena — no overlap' }],
  'th-mtm':       [{ channel: 'EHR', color: '#0C55B8', note: 'Prescriber alerts' }, { channel: 'PORTAL', color: '#42be65', note: 'Maria notified' }],
};;

// ─── KPI cards ────────────────────────────────────────────────────────────────

interface KpiCard {
  id: string;
  label: string;
  before: string;
  after: string;
  delta: string;
  deltaColor: string;
  subtext: string;
  color: string;
}

interface KpiSignals { gapDays: number; readmitPct: number; elevated: boolean; }
function buildKpiCards(t: ImpactTokens, sig: KpiSignals): KpiCard[] { return [
  {
    id: 'kpi-auth',
    label: 'Auth Cycle Time',
    before: '8.2 days',
    after: '0.3 days',
    delta: '↓ 96%',
    deltaColor: '#42be65',
    subtext: 'Clinical evidence assembled autonomously',
    color: '#0C55B8',
  },
  {
    id: 'kpi-gap',
    label: 'Care Gap Days',
    before: t.isMaria ? '45 days open' : `${sig.gapDays} days open`,
    after: 'Active tracking',
    delta: '↓ Closure initiated',
    deltaColor: '#42be65',
    subtext: t.isMaria ? 'HbA1c order placed — outreach scheduled' : `${t.topGapName} — outreach scheduled`,
    color: '#42be65',
  },
  {
    id: 'kpi-readmit',
    label: 'Readmission Risk',
    before: t.isMaria || sig.elevated ? 'Elevated — unmonitored' : 'Moderate — unmonitored',
    after: 'Protocol active',
    delta: t.isMaria ? '↓ 48% projected' : `↓ ${sig.readmitPct}% projected`,
    deltaColor: '#42be65',
    subtext: '30-day monitoring window open',
    color: '#f59e0b',
  },
  {
    id: 'kpi-appeal',
    label: 'Appeal Compliance',
    before: '72h window — untracked',
    after: '68h remaining',
    delta: '✓ On track',
    deltaColor: '#42be65',
    subtext: 'Reviewer notified — draft pre-assembled',
    color: '#8b5cf6',
  },
]; }

// ─── Simulation tiers ─────────────────────────────────────────────────────────

type SimTier = 'today' | 'week' | 'month';

interface SimData {
  label: string;
  scenarios: string;
  authDays: string;
  readmissions: string;
  tcocImpact: string;
}

// Population projection for the South Dakota Medicaid book (124,847 members, in line with
// real SD Medicaid enrollment). Baseline figures sit at the average managed acuity (RAF 2.18);
// the simulation then scales per member by clinical acuity. Grounding for the 124,847 book:
//   • Complex / high-acuity managed pool ≈ 15% ≈ 18,700 members → ~18.7k orchestrations/mo.
//   • Throughput ~847/day, ~5,929/week, ~25,410/month of complex multi-condition resolutions.
//   • 30-day readmissions prevented ≈ 23/mo; TCOC impact ≈ −$2.1M/mo (~8% on the complex segment).
const SIM_BASE: Record<SimTier, { label: string; scenarios: number; authDays: number; readmissions: number; tcocK: number }> = {
  today: { label: 'Today',      scenarios: 847,   authDays: 224,  readmissions: 1,  tcocK: 68 },
  week:  { label: 'This Week',  scenarios: 5929,  authDays: 1568, readmissions: 6,  tcocK: 476 },
  month: { label: 'This Month', scenarios: 25410, authDays: 6942, readmissions: 23, tcocK: 2100 },
};
const __fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const __fmtTcoc = (kAbs: number) =>
  kAbs >= 1000 ? `-$${(kAbs / 1000).toFixed(1).replace(/\.0$/, '')}M` : `-$${Math.round(kAbs)}K`;
function buildSimData(acuity: number): Record<SimTier, SimData> {
  const out = {} as Record<SimTier, SimData>;
  (['today', 'week', 'month'] as SimTier[]).forEach((tier) => {
    const b = SIM_BASE[tier];
    out[tier] = {
      label: b.label,
      scenarios: __fmtN(b.scenarios * acuity),
      authDays: __fmtN(b.authDays * acuity),
      readmissions: `~${Math.max(1, Math.round(b.readmissions * acuity))}`,
      tcocImpact: __fmtTcoc(b.tcocK * acuity),
    };
  });
  return out;
}

function buildRoiBenchmarks(readmitPct: number, monthTcoc: string, todayScenarios: string, isMaria: boolean) {
  return [
    { id: 'b1', metric: 'Auth cycle −96%', source: 'AHIP 2024 Prior Auth Benchmark: avg 8.2d manual → 0.3d automated', color: '#42be65' },
    { id: 'b2', metric: `Readmission −${isMaria ? 48 : readmitPct}%`, source: 'SD Medicaid HRRP: coordinated post-discharge protocols reduce 30-day readmit 40–55%', color: '#f59e0b' },
    { id: 'b3', metric: `TCOC ${isMaria ? '−$2.1M' : monthTcoc}/mo`, source: `124,847-citizen plan · $47K avg episode · ${isMaria ? '847' : todayScenarios} daily scenarios · AHIP benchmark`, color: '#fa4d56' },
    { id: 'b4', metric: 'Care gap +71%', source: 'NCQA SD Medicaid quality 2024: automated outreach improves closure rates 65–78%', color: '#78a9ff' },
  ];
}

// ─── Main Component ───────────────────────────────────────────────────────────

function AgentImpactDashboardInner() {
  const setScreen = useDemoStore((s) => s.setScreen);
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const __reg = getPatientById(activeCitizenId) || getPatientById('MARIA_SD_001')!;
  const __nameParts = __reg.name.split(' ');
  const __lastName = __nameParts.slice(1).join(' ') || __nameParts[0];
  const __tg = (__reg.careGaps || []).find((g) => g.domain === 'Clinical' && g.status !== 'Closed') || __reg.careGaps?.[0];
  const __dep = __reg.household?.dependents?.[0];
  const __cg = __reg.household?.caregiverFor?.[0];
  const __tok: ImpactTokens = {
    isMaria: __reg.platformId === 'MARIA_SD_001',
    name: __reg.name, firstName: __nameParts[0], lastName: __lastName,
    org: __reg.organization.replace(/ \(.*\)/, ''),
    topGapName: __tg ? __tg.name.replace(/ \(.*\)/, '') : 'Care gap',
    contract: __reg.contract, careManager: __reg.careManager,
    depName: __dep ? __dep.name.split(' ')[0] : '', hasDep: !!__dep,
    cgFirst: __cg ? __cg.name.split(' ')[0] : '', cgMed: __cg?.meds?.[0]?.name || 'medication', hasCg: !!__cg,
    hhId: `${__lastName.replace(/\s+/g, '').toUpperCase()}_HH-001`,
  };
  const __coalition = dispatchAgentsForPatient(__reg);
  const MILESTONES = buildMilestones(__tok, __coalition);
  const THREAD_ROWS = buildThreadRows(__tok);
  const THREAD_CHANNELS = buildThreadChannels(__tok);
  // Per-patient KPI signals: actual open-gap age, risk-scaled readmission reduction (HRRP 40–55% band), risk-tier severity.
  const __gapDays = __tg?.daysOpen ?? 45;
  const __readmitPct = Math.round(40 + ((__reg.erRiskPct ?? 42) / 100) * 15);
  const __elevated = /crit|high/i.test(__reg.riskTier || '');
  const KPI_CARDS = buildKpiCards(__tok, { gapDays: __gapDays, readmitPct: __readmitPct, elevated: __elevated });
  // Population value simulation scales with member acuity (RAF vs Maria baseline 2.18).
  const __acuity = (__reg.rafScore ?? 2.18) / 2.18;
  const SIM_DATA = buildSimData(__acuity);
  const ROI_BENCHMARKS = buildRoiBenchmarks(__readmitPct, SIM_DATA.month.tcocImpact, SIM_DATA.today.scenarios, __tok.isMaria);
  const __coalitionCount = __coalition.length;
  // Coordinated = dispatched domain coalition + 3 always-on infra agents (orchestrator, governance, audit).
  // Maria stays byte-identical to the authored walkthrough (8 coordinated / 9 in the flow modal).
  const __agentsCoord = __tok.isMaria ? '8' : String(__coalitionCount + 3);
  const __flowAgents = __tok.isMaria ? '9' : String(__coalitionCount + 3);

  // Beat 1: timeline + threads visible on entry
  const [activeMilestone, setActiveMilestone] = useState<string | null>(null);
  const [visibleMilestones, setVisibleMilestones] = useState<string[]>([]);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [threadsVisible, setThreadsVisible] = useState(false);

  // Beat 2: KPIs + simulation — revealed on ↓ arrow
  const [beat, setBeat] = useState<1 | 2>(1);
  const [kpisVisible, setKpisVisible] = useState(false);
  const [simVisible, setSimVisible] = useState(false);
  const [simTier, setSimTier] = useState<SimTier>('today');
  const [simAnimating, setSimAnimating] = useState(false);
  const [benchmarksVisible, setBenchmarksVisible] = useState(false);

  const [orchModalOpen, setOrchModalOpen] = useState(false);

  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setScreen('agent-impact');

    // Animate timeline progress bar
    const t0 = setTimeout(() => {
      let pct = 0;
      const interval = setInterval(() => {
        pct += 2;
        setTimelineProgress(pct);
        if (pct >= 100) clearInterval(interval);
      }, 20);
    }, 300);
    timerRefs.current.push(t0);

    // Reveal milestones sequentially
    MILESTONES.forEach((ms, i) => {
      const t = setTimeout(() => {
        setVisibleMilestones((prev) => [...prev, ms.id]);
        setActiveMilestone(ms.id);
      }, 400 + i * 500);
      timerRefs.current.push(t);
    });

    // Show threads after milestones
    const tThreads = setTimeout(() => setThreadsVisible(true), 400 + MILESTONES.length * 500 + 300);
    timerRefs.current.push(tThreads);

    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [setScreen]);

  // Intercept keyboard for beat transition
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        if (beat === 1) {
          e.stopImmediatePropagation();
          e.preventDefault();
          setBeat(2);
          setTimeout(() => setKpisVisible(true), 100);
          setTimeout(() => setSimVisible(true), 400);
          setTimeout(() => setBenchmarksVisible(true), 800);
        }
      } else if (e.key === 'ArrowUp') {
        if (beat === 2) {
          e.stopImmediatePropagation();
          e.preventDefault();
          setBeat(1);
          setKpisVisible(false);
          setSimVisible(false);
          setBenchmarksVisible(false);
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [beat]);

  const handleSimTier = (tier: SimTier) => {
    if (tier === simTier || simAnimating) return;
    setSimAnimating(true);
    setTimeout(() => {
      setSimTier(tier);
      setSimAnimating(false);
    }, 300);
  };

  const currentSim = SIM_DATA[simTier];

  return (
    <ScreenLayout
      screenId="agent-impact"
      showPhaseArc
      phaseArcState={{ foundation: true, orchestration: true, autonomous: true }}
      showMiniProfile
    >
      <PresenterControls currentScreenId="agent-impact" />

      {/* Main layout */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: '100%', background: '#161616', position: 'relative' }}
      >
        <MariaStatusStrip
          state="resolved"
          authStatus="✓ Submitted"
          careGapStatus="✓ In Progress"
          episodeStatus="Postpartum Health"
          visible
        />

        {/* Header bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid rgba(57,57,57,0.6)', background: '#1c1c1c' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded px-3 py-1.5 flex items-center gap-2"
              style={{ background: 'rgba(66,190,101,0.15)', border: '1px solid rgba(66,190,101,0.4)' }}
            >
              <div className="rounded-full" style={{ width: 7, height: 7, background: '#42be65' }} />
              <span className="font-mono font-semibold" style={{ fontSize: '11px', color: '#42be65', letterSpacing: '0.1em' }}>
                RESOLVED — 47 MIN
              </span>
            </div>
            <span className="text-white font-semibold" style={{ fontSize: '20px' }}>
              Agent Impact Dashboard
            </span>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: 'Agents Coordinated', value: __agentsCoord, color: '#78a9ff' },
                            { label: 'Threads Active', value: String(THREAD_ROWS.length), color: '#fa4d56' },
              { label: 'Decisions Logged', value: '74', color: '#8b5cf6' },
              { label: 'Governance Honored', value: '9/9', color: '#42be65' },
              { label: 'Human Interventions', value: '1', color: '#f1c21b' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-end gap-0.5">
                <span className="font-mono font-bold" style={{ fontSize: '18px', color: s.color, lineHeight: 1 }}>
                  {s.value}
                </span>
                <span style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.06em' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BEAT 1: Timeline + Threads ── */}
        {beat === 1 && (
          <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
            {/* Left: Timeline */}
            <div
              className="flex flex-col overflow-hidden"
              style={{ width: '40%', borderRight: '1px solid rgba(57,57,57,0.5)', background: '#1c1c1c' }}
            >
              <div className="flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase tracking-wider" style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}>
                    INTERVENTION TIMELINE — {__tok.name.toUpperCase()}
                  </span>
                  <span className="font-mono" style={{ fontSize: '11px', color: '#8d8d8d' }}>T+0 → T+{MILESTONES[MILESTONES.length - 1].timeMin}min</span>
                </div>
              </div>

              {/* Timeline track */}
              <div className="flex-shrink-0 px-5 pt-4 pb-2">
                <div className="relative" style={{ height: 6 }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(57,57,57,0.6)' }} />
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-full"
                    style={{
                      width: `${timelineProgress}%`,
                      background: 'linear-gradient(90deg, #0C55B8, #42be65)',
                      transition: 'width 40ms linear',
                    }}
                  />
                  {MILESTONES.map((ms) => {
                    let pct = (ms.timeMin / 47) * 100;
                    const isVisible = visibleMilestones.includes(ms.id);
                    return (
                      <div
                        key={`dot-${ms.id}`}
                        className="absolute top-1/2 -translate-y-1/2 rounded-full cursor-pointer"
                        style={{
                          left: `${pct}%`,
                          width: activeMilestone === ms.id ? 14 : 10,
                          height: activeMilestone === ms.id ? 14 : 10,
                          marginLeft: activeMilestone === ms.id ? -7 : -5,
                          background: isVisible ? ms.agentColor : '#393939',
                          boxShadow: activeMilestone === ms.id ? `0 0 12px ${ms.agentColor}` : 'none',
                          border: `2px solid ${isVisible ? ms.agentColor : '#393939'}`,
                          transition: 'all 0.3s ease',
                          zIndex: 2,
                        }}
                        onClick={() => setActiveMilestone(ms.id)}
                      />
                    );
                  })}
                </div>
                <div className="relative mt-2" style={{ height: 14 }}>
                  {MILESTONES.map((ms) => {
                    let pct = (ms.timeMin / 47) * 100;
                    return (
                      <span
                        key={`lbl-${ms.id}`}
                        className="font-mono absolute"
                        style={{
                          fontSize: '9px',
                          color: activeMilestone === ms.id ? ms.agentColor : '#4b5563',
                          letterSpacing: '0.04em',
                          transition: 'color 0.3s',
                          left: `${pct}%`,
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ms.time}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Milestone list */}
              <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2 min-h-0">
                {MILESTONES.map((ms) => {
                  const isVisible = visibleMilestones.includes(ms.id);
                  const isActive = activeMilestone === ms.id;
                  return (
                    <div
                      key={ms.id}
                      className="rounded p-3 cursor-pointer"
                      style={{
                        background: isActive ? `${ms.agentColor}12` : isVisible ? 'rgba(38,38,38,0.8)' : 'rgba(28,28,28,0.5)',
                        border: `1px solid ${isActive ? ms.agentColor + '55' : isVisible ? 'rgba(57,57,57,0.6)' : 'rgba(57,57,57,0.3)'}`,
                        opacity: isVisible ? 1 : 0.3,
                        transform: isVisible ? 'translateX(0)' : 'translateX(-8px)',
                        transition: 'all 0.4s ease',
                      }}
                      onClick={() => isVisible && setActiveMilestone(ms.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="rounded-full flex-shrink-0"
                          style={{ width: 8, height: 8, background: isVisible ? ms.agentColor : '#393939', marginTop: 5 }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-white" style={{ fontSize: '13px' }}>{ms.label}</span>
                            <span className="font-mono flex-shrink-0" style={{ fontSize: '10px', color: ms.agentColor, letterSpacing: '0.06em' }}>{ms.time}</span>
                          </div>
                          <span style={{ fontSize: '11px', color: ms.agentColor, letterSpacing: '0.04em' }}>{ms.agent}</span>
                          {isActive && (
                            <div className="mt-2 flex flex-col gap-1.5">
                              <p style={{ fontSize: '12px', color: '#8d8d8d', lineHeight: 1.5 }}>{ms.detail}</p>
                              <div
                                className="rounded px-2 py-1 flex items-center gap-2"
                                style={{ background: `${ms.kpiColor}12`, border: `1px solid ${ms.kpiColor}35` }}
                              >
                                <div className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, background: ms.kpiColor }} />
                                <span style={{ fontSize: '12px', color: ms.kpiColor }}>{ms.kpiImpact}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: 8 Thread Statuses */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#161616' }}>
              <div className="flex-shrink-0 px-5 py-3" style={{ borderBottom: '1px solid rgba(57,57,57,0.5)' }}>
                <span className="font-mono uppercase tracking-wider" style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}>
                  THREAD STATUS — {THREAD_ROWS.length} ACTIVE
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5 min-h-0">
                {THREAD_ROWS.map((thread, i) => (
                  <div
                    key={thread.id}
                    className="rounded px-4 py-3 flex items-center gap-3"
                    style={{
                      background: `${thread.statusColor}06`,
                      border: `1px solid ${thread.statusColor}25`,
                      opacity: threadsVisible ? 1 : 0,
                      transform: threadsVisible ? 'translateX(0)' : 'translateX(12px)',
                      transition: `opacity 0.4s ease ${i * 80}ms, transform 0.4s ease ${i * 80}ms`,
                    }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ width: 24, height: 24, background: `${thread.statusColor}15`, border: `1px solid ${thread.statusColor}40` }}
                    >
                      <span style={{ fontSize: '11px', color: thread.statusColor }}>{thread.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold" style={{ fontSize: '13px', color: '#f4f4f4' }}>{thread.label}</span>
                        <div
                          className="rounded px-1.5 py-0.5"
                          style={{ background: `${thread.statusColor}15`, border: `1px solid ${thread.statusColor}40` }}
                        >
                          <span className="font-mono" style={{ fontSize: '9px', color: thread.statusColor, letterSpacing: '0.08em' }}>
                            {thread.status}
                          </span>
                        </div>
                        {/* Channel attribution badges */}
                        {THREAD_CHANNELS[thread.id]?.map((ch, ci) => (
                          <div
                            key={ci}
                            className="rounded px-1.5 py-0.5 flex items-center gap-1"
                            style={{ background: `${ch.color}12`, border: `1px solid ${ch.color}35` }}
                            title={ch.note}
                          >
                            <div className="rounded-full" style={{ width: 4, height: 4, background: ch.color, flexShrink: 0 }} />
                            <span className="font-mono" style={{ fontSize: '8px', color: ch.color, letterSpacing: '0.06em' }}>{ch.channel}</span>
                          </div>
                        ))}
                      </div>
                      <span style={{ fontSize: '11px', color: '#6f6f6f', lineHeight: 1.3 }}>{thread.detail}</span>
                      {/* Household cross-channel coordination note */}
                      {thread.id === 'th-household' && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span style={{ fontSize: '9px', color: '#ff7eb6', fontStyle: 'italic' }}>{__tok.firstName} via PORTAL · {__tok.cgFirst || __tok.depName || 'caregiver'} via PHONE — coordinated, no overlap</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '10px', color: thread.agentColor, flexShrink: 0, textAlign: 'right', maxWidth: 140 }}>{thread.agent}</span>
                  </div>
                ))}
              </div>

              {/* Beat 1 hint */}
              <div
                className="flex-shrink-0 flex items-center justify-center gap-2 py-3"
                style={{ borderTop: '1px solid rgba(57,57,57,0.4)' }}
              >
                <span style={{ fontSize: '11px', color: '#4b5563' }}>↓</span>
                <span className="font-mono" style={{ fontSize: '10px', color: '#4b5563', letterSpacing: '0.1em' }}>
                  PRESS ↓ TO SEE KPI IMPACT &amp; VALUE SIMULATION
                </span>
                <span style={{ fontSize: '11px', color: '#4b5563' }}>↓</span>
              </div>
            </div>
          </div>
        )}

        {/* ── BEAT 2: KPI Impact + Simulation ── */}
        {beat === 2 && (
          <div className="flex-1 flex flex-col overflow-hidden px-6 py-4 gap-4 min-h-0">
            {/* KPI Impact Cards */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono uppercase tracking-wider" style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}>
                  KPI IMPACT — THIS SCENARIO
                </span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                {KPI_CARDS.map((kpi, i) => (
                  <div
                    key={kpi.id}
                    className="rounded p-4 flex flex-col gap-2"
                    style={{
                      background: `${kpi.color}08`,
                      border: `1px solid ${kpi.color}30`,
                      opacity: kpisVisible ? 1 : 0,
                      transform: kpisVisible ? 'translateY(0)' : 'translateY(12px)',
                      transition: `opacity 0.4s ease ${i * 100}ms, transform 0.4s ease ${i * 100}ms`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: '11px', color: '#8d8d8d', letterSpacing: '0.04em' }}>{kpi.label}</span>
                      <span className="font-mono font-bold" style={{ fontSize: '14px', color: kpi.deltaColor }}>
                        {kpi.delta}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'line-through' }}>{kpi.before}</span>
                      <span style={{ fontSize: '12px', color: '#4b5563' }}>→</span>
                      <span className="font-mono font-semibold" style={{ fontSize: '13px', color: kpi.deltaColor }}>{kpi.after}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#6f6f6f', lineHeight: 1.4 }}>{kpi.subtext}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cumulative Value Simulation */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono uppercase tracking-wider" style={{ fontSize: '10px', color: '#6f6f6f', letterSpacing: '0.12em' }}>
                    CUMULATIVE VALUE SIMULATION — POPULATION
                  </span>
                  <div
                    className="rounded px-2 py-0.5"
                    style={{ background: 'rgba(120,169,255,0.12)', border: '1px solid rgba(120,169,255,0.3)' }}
                  >
                    <span className="font-mono" style={{ fontSize: '9px', color: '#78a9ff' }}>PROJECTED</span>
                  </div>
                </div>
                {/* Tier switcher */}
                <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(57,57,57,0.7)' }}>
                  {(['today', 'week', 'month'] as SimTier[]).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => handleSimTier(tier)}
                      className="px-5 py-2 transition-all duration-200"
                      style={{
                        background: simTier === tier ? 'rgba(12,85,184,0.3)' : 'rgba(28,28,28,0.8)',
                        borderRight: tier !== 'month' ? '1px solid rgba(57,57,57,0.7)' : 'none',
                        color: simTier === tier ? '#78a9ff' : '#6f6f6f',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        cursor: 'pointer',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {SIM_DATA[tier].label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation values */}
              <div
                className="grid gap-3 flex-shrink-0"
                style={{
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  opacity: simVisible ? (simAnimating ? 0 : 1) : 0,
                  transform: simVisible ? 'translateY(0)' : 'translateY(16px)',
                  transition: 'opacity 0.35s ease, transform 0.35s ease',
                }}
              >
                {[
                  {
                    id: 'sim-scenarios',
                    label: `Scenarios like ${__tok.firstName}'s`,
                    value: currentSim.scenarios,
                    unit: simTier === 'today' ? 'today' : simTier === 'week' ? 'this week' : 'this month',
                    color: '#78a9ff',
                    subtext: 'Complex multi-condition members resolved autonomously',
                  },
                  {
                    id: 'sim-auth',
                    label: 'Auth Days Saved',
                    value: currentSim.authDays,
                    unit: 'days',
                    color: '#42be65',
                    subtext: 'AHIP 2024: 8.2d manual avg → 0.3d automated',
                  },
                  {
                    id: 'sim-readmit',
                    label: 'Readmissions Prevented',
                    value: currentSim.readmissions,
                    unit: simTier === 'today' ? 'today' : simTier === 'week' ? 'this week' : 'this month',
                    color: '#f59e0b',
                    subtext: 'SD Medicaid HRRP: coordinated protocols reduce 30-day readmit 40–55%',
                  },
                  {
                   id: 'sim-tcoc',
                   label: 'TCOC Impact',
                   value: currentSim.tcocImpact,
                    unit: simTier === 'month' ? 'projected this quarter' : 'projected',
                    color: '#fa4d56',
                    subtext: '124,847-member plan · $47K avg episode · AHIP benchmark',
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="rounded p-4 flex flex-col gap-1.5"
                    style={{ background: `${item.color}08`, border: `1px solid ${item.color}25` }}
                  >
                    <span style={{ fontSize: '11px', color: '#8d8d8d' }}>{item.label}</span>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono font-bold"
                        style={{ fontSize: '28px', color: item.color, lineHeight: 1, letterSpacing: '-0.02em' }}
                      >
                        {item.value}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{item.unit}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#4b5563', lineHeight: 1.4 }}>{item.subtext}</span>
                  </div>
                ))}
              </div>

              {/* ROI Benchmarks */}
              {benchmarksVisible && (
                <div
                  className="flex-shrink-0 mt-3 rounded p-3"
                  style={{
                    background: 'rgba(38,38,38,0.8)',
                    border: '1px solid rgba(57,57,57,0.7)',
                    opacity: 1,
                    transition: 'opacity 0.4s ease',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono uppercase" style={{ fontSize: '9px', color: '#4b5563', letterSpacing: '0.1em' }}>ROI SOURCES</span>
                  </div>
                  <div className="grid gap-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {ROI_BENCHMARKS.map((b) => (
                      <div key={b.id} className="flex items-start gap-2">
                        <div className="rounded-full flex-shrink-0 mt-1" style={{ width: 5, height: 5, background: b.color }} />
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          <span className="font-mono flex-shrink-0" style={{ fontSize: '10px', color: b.color, letterSpacing: '0.04em' }}>{b.metric}</span>
                          <span style={{ fontSize: '10px', color: '#4b5563', lineHeight: 1.4 }}>— {b.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orchestration Flow Trigger */}
              {benchmarksVisible && (
                <div className="flex-shrink-0 mt-3 flex justify-center">
                  <button
                    onClick={() => setOrchModalOpen(true)}
                    className="flex items-center gap-3 rounded px-6 py-3 transition-all duration-200"
                    style={{
                      background: 'rgba(120,169,255,0.08)',
                      border: '1px solid rgba(120,169,255,0.35)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(120,169,255,0.15)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(120,169,255,0.6)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(120,169,255,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(120,169,255,0.08)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(120,169,255,0.35)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className="rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            background: ['#78a9ff', '#0C55B8', '#42be65', '#10b981', '#c084fc', '#8b5cf6', '#f1c21b'][i],
                            opacity: 0.8,
                          }}
                        />
                      ))}
                    </div>
                    <span className="font-mono font-semibold" style={{ fontSize: '12px', color: '#78a9ff', letterSpacing: '0.1em' }}>
                      VIEW AGENT ORCHESTRATION FLOW
                    </span>
                    <span style={{ fontSize: '14px', color: '#78a9ff' }}>→</span>
                    <div
                      className="rounded px-2 py-0.5"
                      style={{ background: 'rgba(120,169,255,0.12)', border: '1px solid rgba(120,169,255,0.3)' }}
                    >
                      <span className="font-mono" style={{ fontSize: '9px', color: '#78a9ff', letterSpacing: '0.08em' }}>
                        {__flowAgents} AGENTS · 3 LANES · JSON PAYLOADS
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Beat 2 hint */}
            <div
              className="flex-shrink-0 flex items-center justify-center gap-2 py-1"
              style={{ borderTop: '1px solid rgba(57,57,57,0.4)' }}
            >
              <span style={{ fontSize: '11px', color: '#4b5563' }}>↑</span>
              <span className="font-mono" style={{ fontSize: '10px', color: '#4b5563', letterSpacing: '0.1em' }}>
                ↑ TIMELINE &nbsp;·&nbsp; ↓ ADVANCE
              </span>
              <span style={{ fontSize: '11px', color: '#4b5563' }}>↓</span>
            </div>
          </div>
        )}

        {/* Screen indicator + beat dots */}
        <div
          className="absolute bottom-4 right-6 z-10 font-mono flex items-center gap-3"
          style={{ color: '#6f6f6f', fontSize: '12px' }}
        >
          <div className="flex gap-1.5">
            <div className="rounded-full" style={{ width: 6, height: 6, background: beat === 1 ? '#78a9ff' : '#393939', transition: 'background 0.3s' }} />
            <div className="rounded-full" style={{ width: 6, height: 6, background: beat === 2 ? '#78a9ff' : '#393939', transition: 'background 0.3s' }} />
          </div>
          <span>16 / 19</span>
        </div>
      </div>

      {/* Orchestration Flow Modal */}
      {orchModalOpen && (
        <OrchestrationFlowModal onClose={() => setOrchModalOpen(false)} />
      )}
    </ScreenLayout>
  );
}

// Re-mount per active citizen so the timeline + KPIs re-animate for the selected member.
export default function AgentImpactDashboard() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  return <AgentImpactDashboardInner key={activeCitizenId} />;
}
