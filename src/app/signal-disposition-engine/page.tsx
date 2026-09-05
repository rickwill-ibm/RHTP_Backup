'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientSync } from '@/lib/services/patientService';
import MemberScopeNotice from '@/components/wpc/MemberScopeNotice';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

const SIGNAL_TYPES = {
  CARE_GAP: 'CARE_GAP',
  BENEFIT_GAP: 'BENEFIT_GAP',
  PHARMACY_INTELLIGENCE: 'PHARMACY_INTELLIGENCE',
  BH_SCREENING_INDICATED: 'BH_SCREENING_INDICATED',
  SDOH_BARRIER: 'SDOH_BARRIER',
  AUTH_EXPIRY: 'AUTH_EXPIRY',
  CAREGIVER_BURDEN: 'CAREGIVER_BURDEN',
  BEHAVIORAL: 'BEHAVIORAL',
} as const;

const SLA_TABLE = [
  { type: 'AUTH_EXPIRY', sla: '< 5 min', reason: 'SD Medicaid claim denial risk' },
  {
    type: 'BH_SCREENING_INDICATED',
    sla: '< 15 min',
    reason: '42 CFR Pt 2 consent gate before dispatch',
  },
  { type: 'PHARMACY_INTELLIGENCE', sla: '< 30 min', reason: 'Caregiver burden cascade detection' },
  { type: 'BEHAVIORAL', sla: '< 1 hr', reason: 'SMS window 3pm–7pm only' },
  { type: 'CARE_GAP', sla: '< 4 hr', reason: 'HEDIS window — 40 days remaining' },
  { type: 'BENEFIT_GAP', sla: '< 4 hr', reason: 'Enrollment window + childcare unblock' },
  { type: 'SDOH_BARRIER', sla: '< 24 hr', reason: 'CBO referral planning cycle' },
  { type: 'CAREGIVER_BURDEN', sla: '< 24 hr', reason: 'Intervention planning' },
];

interface Signal {
  id: string;
  type: string;
  label: string;
  source: string;
  member: string;
  timestamp: string;
  rawScore: number;
  status: 'PENDING' | 'CLASSIFYING' | 'CLASSIFIED' | 'HELD';
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  consentGate?: string;
}

function buildSignals(memberId: string): Signal[] {
  return [
    {
      id: 'sig-1',
      type: 'CARE_GAP',
      label: 'CARE_GAP — HbA1c Deadline',
      source: 'Knowledge Graph Watcher 5',
      member: memberId,
      timestamp: 'T+0:00',
      rawScore: 0.94,
      status: 'CLASSIFYING',
      urgency: 'CRITICAL',
    },
    {
      id: 'sig-2',
      type: 'BENEFIT_GAP',
      label: 'BENEFIT_GAP — Childcare CCAP',
      source: 'SD DSS Benefits Stream 8',
      member: memberId,
      timestamp: 'T+0:23',
      rawScore: 0.89,
      status: 'CLASSIFIED',
      urgency: 'HIGH',
    },
    {
      id: 'sig-3',
      type: 'PHARMACY_INTELLIGENCE',
      label: 'PHARMACY_INTELLIGENCE — Pickup Flag',
      source: 'Martin Pharmacy PMS Stream 4',
      member: memberId,
      timestamp: 'T+0:41',
      rawScore: 0.82,
      status: 'CLASSIFIED',
      urgency: 'HIGH',
    },
    {
      id: 'sig-4',
      type: 'BH_SCREENING_INDICATED',
      label: 'BH_SCREENING — Zarit/Edinburgh',
      source: 'Knowledge Graph Watcher 3',
      member: memberId,
      timestamp: 'T+1:05',
      rawScore: 0.88,
      status: 'PENDING',
      urgency: 'HIGH',
      consentGate: '42 CFR PART 2 CHECK',
    },
    {
      id: 'sig-5',
      type: 'SDOH_BARRIER',
      label: 'SDOH_BARRIER — Transport Unconfirmed',
      source: 'Knowledge Graph Watcher 2',
      member: memberId,
      timestamp: 'T+1:30',
      rawScore: 0.85,
      status: 'CLASSIFIED',
      urgency: 'HIGH',
    },
    {
      id: 'sig-6',
      type: 'BENEFIT_GAP',
      label: 'BENEFIT_GAP — WIC Lapsed',
      source: 'SD WIC Program Stream 9',
      member: memberId,
      timestamp: 'T+2:00',
      rawScore: 0.91,
      status: 'CLASSIFIED',
      urgency: 'MEDIUM',
    },
    {
      id: 'sig-7',
      type: 'CAREGIVER_BURDEN',
      label: 'CAREGIVER_BURDEN — Zarit 48',
      source: 'Martin Pharmacy + Knowledge Graph',
      member: memberId,
      timestamp: 'T+2:45',
      rawScore: 0.78,
      status: 'CLASSIFIED',
      urgency: 'MEDIUM',
    },
    {
      id: 'sig-8',
      type: 'BEHAVIORAL',
      label: 'BEHAVIORAL — SMS Window Signal',
      source: 'Platform Channel Intelligence',
      member: memberId,
      timestamp: 'T+3:12',
      rawScore: 0.71,
      status: 'HELD',
      urgency: 'LOW',
    },
  ];
}

interface DispositionRoute {
  signalId: string;
  agent: string;
  agentId: string;
  priority: number;
  consent: 'PASSED' | 'PENDING' | 'BLOCKED';
  activation: string;
  path: string;
  action: string;
  held?: string;
}

const DISPOSITION_ROUTES: DispositionRoute[] = [
  {
    signalId: 'sig-1',
    agent: 'Care Gap Management',
    agentId: 'Agent 6',
    priority: 1,
    consent: 'PASSED',
    activation: 'T+2m',
    path: 'B — CHW Task (SDOH-aware routing)',
    action: 'Childcare subsidy enrollment → unblocks HbA1c appointment',
  },
  {
    signalId: 'sig-2',
    agent: 'Eligibility Intelligence',
    agentId: 'Agent 10',
    priority: 2,
    consent: 'PASSED',
    activation: 'T+4m',
    path: 'C — SMS 3pm–7pm window',
    action: '"Maria, childcare assistance $487/mo available — reply YES"',
  },
  {
    signalId: 'sig-3',
    agent: 'Pharmacy Intelligence',
    agentId: 'Agent 9',
    priority: 3,
    consent: 'PASSED',
    activation: 'T+5m',
    path: 'B — Care Manager Task',
    action: 'Caregiver burden assessment triggered',
  },
  {
    signalId: 'sig-4',
    agent: 'Screening Synthesis',
    agentId: 'Agent 11',
    priority: 4,
    consent: 'PASSED',
    activation: 'T+6m',
    path: 'A — CDS Hook to PCP (Edinburgh PND)',
    action: 'Zarit + Edinburgh instruments queued',
  },
  {
    signalId: 'sig-5',
    agent: 'Care Gap Management',
    agentId: 'Agent 6',
    priority: 5,
    consent: 'PASSED',
    activation: 'T+8m',
    path: 'B — CHW Task (PRAPARE transport domain)',
    action: 'Transport barrier PRAPARE domain update',
  },
  {
    signalId: 'sig-6',
    agent: 'Eligibility Intelligence',
    agentId: 'Agent 10',
    priority: 6,
    consent: 'PASSED',
    activation: 'T+9m',
    path: 'C — SMS bundle with childcare msg',
    action: 'WIC re-enrollment — bundle with childcare outreach',
  },
  {
    signalId: 'sig-7',
    agent: 'Care Coordination',
    agentId: 'Agent 8',
    priority: 7,
    consent: 'PASSED',
    activation: 'T+11m',
    path: 'B — Care Manager Task',
    action: 'Caregiver burden formal assessment scheduled',
  },
  {
    signalId: 'sig-8',
    agent: 'Care Coordination',
    agentId: 'Agent 8',
    priority: 8,
    consent: 'PASSED',
    activation: 'HELD',
    path: 'C — SMS (window check)',
    action: 'Held — outside 3pm–7pm window. Scheduled: next active window',
    held: 'SMS window check: current time outside 3pm–7pm',
  },
];

const AGENT_TILES = [
  { id: 'Agent 6', name: 'Care Gap Mgmt', activeSignals: 2, queue: 2, color: '#3B82F6' },
  { id: 'Agent 8', name: 'Care Coordination', activeSignals: 2, queue: 2, color: '#8B5CF6' },
  { id: 'Agent 9', name: 'Pharmacy Intel', activeSignals: 1, queue: 1, color: '#14B8A6' },
  { id: 'Agent 10', name: 'Eligibility Intel', activeSignals: 2, queue: 2, color: '#F59E0B' },
  { id: 'Agent 11', name: 'Screening Synth', activeSignals: 1, queue: 1, color: '#84CC16' },
];

const OUTREACH_ROWS = [
  {
    team: 'Clinical team',
    detail: 'Credentialing check in progress',
    status1: 'ACTIVE',
    status1Color: '#3B82F6',
    status2: 'PORTAL',
    status2Color: '#475569',
    nextTime: null,
  },
  {
    team: 'Employer / Wellness (SAP-44621)',
    detail: 'Wellness survey queued — Credentialed for route',
    status1: 'SUPPRESSED',
    status1Color: '#EF4444',
    status2: 'EMAIL',
    status2Color: '#475569',
    nextTime: 'NEXT TIME T+4h',
  },
  {
    team: 'Service team',
    detail: 'CBO referral survey queued',
    status1: 'SUPPRESSED',
    status1Color: '#EF4444',
    status2: 'CBO',
    status2Color: '#475569',
    nextTime: 'NEXT TIME T+4h',
  },
  {
    team: 'Growth team',
    detail: 'Renewal notice queued',
    status1: 'RELEASE IN 2HRS',
    status1Color: '#F59E0B',
    status2: 'PORTAL',
    status2Color: '#475569',
    nextTime: 'NEXT TIME T+2h',
  },
  {
    team: 'Care manager (Sarah Chen)',
    detail: 'Task coordination — 4 open interventions',
    status1: 'APPROVED',
    status1Color: '#84CC16',
    status2: 'PORTAL',
    status2Color: '#3B82F6',
    nextTime: 'NEXT TIME T+15m',
  },
  {
    team: 'Optum/Rx MTM outreach',
    detail: 'MTM enrollment outreach queued',
    status1: 'SUPPRESSED',
    status1Color: '#EF4444',
    status2: 'PORTAL',
    status2Color: '#475569',
    nextTime: 'NEXT TIME T+4h',
  },
];

const SEQUENCING_STEPS = [
  {
    id: 'seq-1',
    label: 'Credentialing verification',
    detail: 'Auth critical: One delay before action with Dr. Chen',
    color: '#3B82F6',
    status: 'active',
  },
  {
    id: 'seq-2',
    label: 'Auth evidence assembly',
    detail: 'Clinical package built while credentialing confirms',
    color: '#F59E0B',
    status: 'pending',
  },
  {
    id: 'seq-3',
    label: 'SDOH-modified outreach',
    detail: 'Nutrition + financial need + CHW caregiver-sensitive message',
    color: '#F97316',
    status: 'pending',
  },
  {
    id: 'seq-4',
    label: 'Food resource referral',
    detail: 'SNAP-eligible programs flagged — HbA1c gap partially food-driven',
    color: '#84CC16',
    status: 'pending',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function urgencyColor(urgency: string) {
  switch (urgency) {
    case 'CRITICAL':
      return '#EF4444';
    case 'HIGH':
      return '#F59E0B';
    case 'MEDIUM':
      return '#3B82F6';
    default:
      return '#475569';
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'CLASSIFIED':
      return '#84CC16';
    case 'CLASSIFYING':
      return '#F59E0B';
    case 'PENDING':
      return '#F59E0B';
    case 'HELD':
      return '#475569';
    default:
      return '#475569';
  }
}

function signalTypeShort(type: string) {
  const map: Record<string, string> = {
    CARE_GAP: 'CARE_GAP',
    BENEFIT_GAP: 'BENEFIT_GAP',
    PHARMACY_INTELLIGENCE: 'PHARMACY',
    BH_SCREENING_INDICATED: 'BH_SCREEN',
    SDOH_BARRIER: 'SDOH',
    AUTH_EXPIRY: 'AUTH_EXPIRY',
    CAREGIVER_BURDEN: 'CAREGIVER',
    BEHAVIORAL: 'BEHAVIORAL',
  };
  return map[type] || type;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SignalCard({
  signal,
  isActive,
  onClick,
}: {
  signal: Signal;
  isActive: boolean;
  onClick: () => void;
}) {
  const uc = urgencyColor(signal.urgency);
  const sc = statusColor(signal.status);
  const isPulsing = signal.urgency === 'CRITICAL' || signal.urgency === 'HIGH';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded border transition-all duration-150 hover:border-slate-500"
      style={{
        background: isActive ? 'rgba(245,158,11,0.08)' : '#0f172a',
        borderColor: isActive ? '#F59E0B' : '#1e293b',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span
          className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${uc}22`, color: uc }}
        >
          {signalTypeShort(signal.type)}
        </span>
        <span className="flex items-center gap-1">
          {isPulsing && (
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: uc }} />
          )}
          <span className="text-xs font-mono" style={{ color: sc }}>
            {signal.status}
          </span>
        </span>
      </div>
      <p className="text-xs text-slate-300 font-medium mb-1 leading-tight">{signal.label}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">{signal.timestamp}</span>
        <span className="text-xs font-mono" style={{ color: uc }}>
          {signal.urgency}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-600 truncate max-w-[140px]">{signal.source}</span>
        <span className="text-xs font-mono text-slate-400">
          {(signal.rawScore * 100).toFixed(0)}%
        </span>
      </div>
      {signal.consentGate && (
        <div className="mt-1.5 flex items-center gap-1">
          <Icon name="LockClosedIcon" size={10} />
          <span className="text-xs text-amber-400 font-mono">{signal.consentGate}</span>
        </div>
      )}
    </button>
  );
}

function ClassificationEngine({ signal }: { signal: Signal }) {
  const [countdown, setCountdown] = useState(227); // 3h 47m in minutes
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(signal.rawScore * 100), 300);
    return () => clearTimeout(timer);
  }, [signal]);

  const uc = urgencyColor(signal.urgency);
  const hours = Math.floor(countdown / 60);
  const mins = countdown % 60;

  const rationale: Record<string, { text: string; cypher?: string; consentNote?: string }> = {
    'sig-1': {
      text: 'HbA1c lab gap open 38 days — HEDIS window 40 days remaining. Transportation barrier confirmed BLOCKING. Childcare subsidy ($487/mo) eligible-not-enrolled — resolving enrollment unblocks appointment. HEDIS CDC value at risk: $8,100.',
      cypher:
        "MATCH (m:Member {id:'MARIA_SD_001'})-[:HAS_CARE_GAP]->(g:CareGap) WHERE g.hedisWindow < 30 AND g.status = 'OPEN' RETURN g",
    },
    'sig-2': {
      text: 'Childcare CCAP benefit gap confirmed. Maria eligible-not-enrolled at $487/mo. Enrollment directly unblocks HbA1c appointment scheduling. SD DSS stream confirms eligibility window open. Priority: HIGH — enrollment window time-sensitive.',
    },
    'sig-3': {
      text: 'Martin Pharmacy pickup pattern flagged: Maria collecting Elena medications (Metformin + Lisinopril) on irregular cadence. Zarit burden score 48 — caregiver burden cascade risk. Formal assessment not yet initiated.',
    },
    'sig-4': {
      text: 'CaregiverBurdenRisk severity MODERATE-HIGH. Zarit threshold crossed (48). BH screening not yet initiated. 42 CFR Pt 2 consent verified active before dispatch.',
      consentNote:
        '42 CFR PART 2 — Maria BH consent: ACTIVE ✓ · Disclosure log updated · Gate: PASSED',
    },
    'sig-5': {
      text: 'Transportation barrier HIGH — 47 miles to Bennett County Health, no vehicle, no public transit. SD winter road closures compound seasonal risk. PRAPARE transport domain not yet updated post-CHW visit.',
    },
    'sig-6': {
      text: 'WIC lapsed — $320/mo unclaimed. Maria previously enrolled, lapsed at postpartum transition. Re-enrollment straightforward. Bundle with childcare CCAP outreach to reduce SMS fatigue (single touchpoint).',
    },
    'sig-7': {
      text: 'Caregiver burden Zarit 48 — moderate-high threshold. 18hrs/week informal caregiving for Elena. No respite services. Maria deprioritizing own health. Formal Zarit assessment not yet scored.',
    },
    'sig-8': {
      text: 'SMS engagement window signal detected. Maria active window 3pm–7pm weekdays. Current time outside window — signal HELD. Behavioral signal is a multiplier, not independent action. Scheduled for next active window.',
    },
  };

  const r = rationale[signal.id] || { text: 'Classification rationale loading...' };

  return (
    <div className="space-y-4">
      {/* Active signal header */}
      <div
        className="rounded border p-4"
        style={{ background: 'rgba(245,158,11,0.06)', borderColor: '#F59E0B' }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <span
              className="text-xs font-mono font-bold px-2 py-1 rounded"
              style={{ background: `${uc}22`, color: uc }}
            >
              {signal.type}
            </span>
            <p className="text-sm font-semibold text-white mt-2">{signal.label}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {signal.member} · {signal.source}
            </p>
          </div>
          <div className="text-right">
            <span
              className="text-xs font-mono font-bold px-2 py-1 rounded animate-pulse"
              style={{ background: `${uc}22`, color: uc }}
            >
              {signal.urgency}
            </span>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Confidence Score</span>
            <span className="text-sm font-mono font-bold text-amber-400">
              {(signal.rawScore * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${uc}88, ${uc})`,
              }}
            />
          </div>
        </div>

        {/* SLA countdown */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs text-slate-500">SLA</span>
            <p className="text-xs font-mono text-slate-300">
              {SLA_TABLE.find((s) => s.type === signal.type)?.sla || '< 4 hr'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">Latency Remaining</span>
            <p className="text-sm font-mono font-bold text-amber-400">
              {hours}h {mins}m
            </p>
          </div>
        </div>

        {/* Consent gate */}
        {signal.consentGate && (
          <div className="mb-3 p-2 rounded border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="LockClosedIcon" size={12} />
              <span className="text-xs font-mono text-amber-400 font-bold">
                {signal.consentGate}
              </span>
            </div>
            {r.consentNote && (
              <p className="text-xs text-amber-300/80 font-mono">{r.consentNote}</p>
            )}
          </div>
        )}

        {/* Rationale */}
        <div className="p-2 rounded bg-slate-900/60">
          <p className="text-xs text-slate-500 mb-1 font-mono uppercase tracking-wider">
            Classification Rationale
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">{r.text}</p>
          {r.cypher && (
            <div className="mt-2 p-2 rounded bg-slate-950 border border-slate-800">
              <p className="text-xs text-slate-500 font-mono mb-1">Cypher origin:</p>
              <p className="text-xs font-mono text-lime-400/80 break-all">{r.cypher}</p>
            </div>
          )}
        </div>
      </div>

      {/* SLA Latency Table */}
      <div>
        <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
          SLA Latency Requirements
        </p>
        <div className="rounded border border-slate-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900">
                <th className="text-left px-3 py-2 text-slate-500 font-mono font-medium">
                  Signal Type
                </th>
                <th className="text-left px-3 py-2 text-slate-500 font-mono font-medium">SLA</th>
                <th className="text-left px-3 py-2 text-slate-500 font-mono font-medium hidden lg:table-cell">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {SLA_TABLE.map((row, i) => (
                <tr
                  key={row.type}
                  className="border-t border-slate-800/50"
                  style={{
                    background:
                      row.type === signal.type
                        ? 'rgba(245,158,11,0.06)'
                        : i % 2 === 0
                          ? '#0f172a'
                          : 'transparent',
                  }}
                >
                  <td className="px-3 py-1.5 font-mono text-slate-300">{row.type}</td>
                  <td className="px-3 py-1.5 font-mono text-amber-400 font-bold">{row.sla}</td>
                  <td className="px-3 py-1.5 text-slate-500 hidden lg:table-cell">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DispositionCard({ route, signal }: { route: DispositionRoute; signal: Signal }) {
  const uc = urgencyColor(signal.urgency);
  const consentColor =
    route.consent === 'PASSED' ? '#84CC16' : route.consent === 'BLOCKED' ? '#EF4444' : '#F59E0B';

  return (
    <div
      className="p-3 rounded border mb-2"
      style={{
        background: route.held ? '#0f172a' : 'rgba(15,23,42,0.8)',
        borderColor: route.held ? '#334155' : '#1e293b',
        opacity: route.held ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-mono text-slate-500">#{route.priority}</span>
          <p className="text-xs font-semibold text-white">
            {route.agentId}: {route.agent}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: `${uc}22`, color: uc }}
          >
            {signal.urgency}
          </span>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Consent:</span>
          <span className="text-xs font-mono font-bold" style={{ color: consentColor }}>
            {route.consent === 'PASSED'
              ? '✓ PASSED'
              : route.consent === 'BLOCKED'
                ? '✗ BLOCKED'
                : '⚠ PENDING'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Activation:</span>
          <span className="text-xs font-mono text-slate-300">{route.activation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Path:</span>
          <span className="text-xs font-mono text-slate-400">{route.path}</span>
        </div>
      </div>
      <div className="mt-2 p-2 rounded bg-slate-900/60">
        <p className="text-xs text-slate-300 leading-relaxed">{route.action}</p>
      </div>
      {route.held && (
        <div className="mt-2 flex items-center gap-1.5">
          <Icon name="ClockIcon" size={12} />
          <span className="text-xs text-amber-400 font-mono">{route.held}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SignalDispositionEnginePage() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const patient = getPatientSync(activeCitizenId);
  const MEMBER_NAME = patient?.name ?? 'Member';
  const MEMBER_ID = patient?.platformId ?? activeCitizenId;
  const MEMBER_RISK = `${patient?.riskTier?.toUpperCase() ?? '—'} ${patient?.rafScore?.toFixed(1) ?? '—'}`;
  const MEMBER_AUTH = 'AUTH T-4 days';
  const MEMBER_CARE_GAP = patient?.careGaps?.[0]?.name
    ? `${patient.careGaps[0].name.split(' ')[0]} Gap ${patient.careGaps[0].daysOpen}d`
    : '—';
  const MEMBER_EPISODE = patient?.episodeType ?? '—';
  const MEMBER_SDOH = patient ? `${patient.openCareGaps} Barriers` : '—';
  const SIGNALS = buildSignals(MEMBER_ID);

  const [activeSignalId, setActiveSignalId] = useState('sig-1');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  // P0 scope-guard: fail closed for non-golden members (screen not yet member-derived).
  const isGoldenMember = activeCitizenId === DEMO_MEMBER_ID;
  if (!isGoldenMember) {
    return (
      <AppLayout
        pageTitle="Signal Disposition Engine"
        breadcrumbs={[
          { label: 'CDP & Agentic Automation' },
          { label: 'Signal Disposition Engine' },
        ]}
      >
        <MemberScopeNotice name={MEMBER_NAME} id={MEMBER_ID} view="Signal Disposition Engine" />
      </AppLayout>
    );
  }

  const activeSignal = SIGNALS.find((s) => s.id === activeSignalId) || SIGNALS[0];
  const activeRoute = DISPOSITION_ROUTES.find((r) => r.signalId === activeSignalId);

  return (
    <AppLayout
      pageTitle="Signal Disposition Engine"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'Signal Disposition Engine' }]}
    >
      <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
        {/* Member context bar */}
        <div
          className="px-4 py-2 border-b flex items-center gap-4 flex-wrap"
          style={{ background: '#060c18', borderColor: '#1e293b' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
              <span className="text-xs font-bold text-black">
                {MEMBER_NAME.split(' ')
                  .map((w: string) => w[0])
                  .join('')
                  .slice(0, 2)}
              </span>
            </div>
            <span className="text-sm font-semibold text-white font-mono">{MEMBER_NAME}</span>
            <span className="text-xs text-slate-500 font-mono">{MEMBER_ID}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">RISK</span>
            <span className="text-xs font-mono font-bold text-red-400">{MEMBER_RISK}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">AUTH</span>
            <span className="text-xs font-mono text-amber-400">{MEMBER_AUTH}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">CARE GAP</span>
            <span className="text-xs font-mono text-red-400">{MEMBER_CARE_GAP}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">EPISODE</span>
            <span className="text-xs font-mono text-slate-300">{MEMBER_EPISODE}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded text-amber-400 border border-amber-500/30 bg-amber-500/10">
              {MEMBER_SDOH}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded text-lime-400 border border-lime-500/30 bg-lime-500/10 animate-pulse">
              ● DISPOSITION COMPLETE
            </span>
            <span className="text-xs text-slate-500 font-mono">14:31:30</span>
          </div>
        </div>

        {/* Page header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white font-mono tracking-tight">
              SIGNAL DISPOSITION ENGINE
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Loading journey context for {MEMBER_ID} · {SIGNALS.length} signals ·{' '}
              {SIGNALS.filter((s) => s.status === 'CLASSIFIED').length} classified ·{' '}
              {SIGNALS.filter((s) => s.status === 'PENDING' || s.status === 'HELD').length} pending
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 font-mono">SIGNAL DISPOSITION ENGINE — 14:31:30</p>
            <div className="flex items-center gap-2 mt-1">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((u) => {
                const count = SIGNALS.filter((s) => s.urgency === u).length;
                return (
                  <span
                    key={u}
                    className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: `${urgencyColor(u)}22`, color: urgencyColor(u) }}
                  >
                    {u} {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Three-column layout */}
        <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT — Incoming Signals Queue */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Incoming Signals Queue
              </p>
              <span className="text-xs font-mono text-lime-400 animate-pulse">● LIVE</span>
            </div>
            <div className="space-y-2">
              {SIGNALS.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  isActive={signal.id === activeSignalId}
                  onClick={() => setActiveSignalId(signal.id)}
                />
              ))}
            </div>
          </div>

          {/* CENTER — Classification Engine */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Active Classification Engine
              </p>
              <span className="text-xs font-mono text-amber-400">PROCESSING</span>
            </div>
            <ClassificationEngine signal={activeSignal} key={activeSignalId} />
          </div>

          {/* RIGHT — Disposition Routing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Disposition Routing
              </p>
              <span className="text-xs font-mono text-slate-500">→ Agent Tiles</span>
            </div>

            {/* Active signal route */}
            {activeRoute && <DispositionCard route={activeRoute} signal={activeSignal} />}

            {/* All routes summary */}
            <div className="mt-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                All Disposition Routes
              </p>
              <div className="space-y-1.5">
                {DISPOSITION_ROUTES.filter((r) => r.signalId !== activeSignalId).map((route) => {
                  const sig = SIGNALS.find((s) => s.id === route.signalId)!;
                  const uc = urgencyColor(sig.urgency);
                  return (
                    <button
                      key={route.signalId}
                      onClick={() => setActiveSignalId(route.signalId)}
                      className="w-full text-left p-2 rounded border border-slate-800 hover:border-slate-600 transition-colors"
                      style={{ background: '#0f172a' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">
                            #{route.priority}
                          </span>
                          <span className="text-xs font-mono text-slate-300">{route.agentId}</span>
                          <span className="text-xs text-slate-500">→</span>
                          <span className="text-xs font-mono" style={{ color: uc }}>
                            {signalTypeShort(sig.type)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-mono"
                            style={{ color: route.consent === 'PASSED' ? '#84CC16' : '#F59E0B' }}
                          >
                            {route.consent === 'PASSED' ? '✓' : '⚠'}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            {route.activation}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Agent tile strip */}
            <div className="mt-4">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                Agent Tile Strip
              </p>
              <div className="grid grid-cols-2 gap-2">
                {AGENT_TILES.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-2 rounded border"
                    style={{ background: '#0f172a', borderColor: `${agent.color}44` }}
                  >
                    <p className="text-xs font-mono font-bold" style={{ color: agent.color }}>
                      {agent.id}
                    </p>
                    <p className="text-xs text-slate-400 leading-tight">{agent.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-slate-500">
                        {agent.activeSignals} signals
                      </span>
                      <span className="text-xs font-mono text-slate-600">Q:{agent.queue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Enterprise Outreach Coordination Check Panel */}
        <div className="px-4 pb-4">
          <div
            className="rounded border p-4"
            style={{ background: '#0a0f1e', borderColor: '#1e293b' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <p className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Enterprise Outreach Coordination Check — {MEMBER_ID}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-500">
                  5 approved · 3 suppressed · 1 delayed — single coordinated touchpoint
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left pb-2 text-slate-500 font-mono font-medium w-40">
                      Team
                    </th>
                    <th className="text-left pb-2 text-slate-500 font-mono font-medium">Detail</th>
                    <th className="text-right pb-2 text-slate-500 font-mono font-medium w-32">
                      Status
                    </th>
                    <th className="text-right pb-2 text-slate-500 font-mono font-medium w-28">
                      Channel
                    </th>
                    <th className="text-right pb-2 text-slate-500 font-mono font-medium w-28">
                      Next Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {OUTREACH_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800/30"
                      style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.4)' : 'transparent' }}
                    >
                      <td className="py-2 pr-3 font-mono text-slate-300 text-xs">{row.team}</td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">{row.detail}</td>
                      <td className="py-2 text-right">
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{
                            background: `${row.status1Color}22`,
                            color: row.status1Color,
                          }}
                        >
                          {row.status1}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ background: '#1e293b', color: '#94a3b8' }}
                        >
                          {row.status2}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {row.nextTime ? (
                          <span className="text-xs font-mono text-slate-500">{row.nextTime}</span>
                        ) : (
                          <span className="text-xs font-mono text-slate-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Outreach decision note */}
            <div className="mt-3 p-2 rounded bg-slate-900/60 border border-slate-800">
              <p className="text-xs text-slate-500 font-mono">
                Outreach decision: Credentialing verification required by Dr. Chen — all outreach
                suspended until credentialing confirms. SDOH-informed: home lab kit + generic
                substitution + food resource referral queued post-credentialing.
              </p>
            </div>
          </div>
        </div>

        {/* Sequencing Decision Flow */}
        <div className="px-4 pb-4">
          <div
            className="rounded border p-4"
            style={{ background: '#0a0f1e', borderColor: '#1e293b' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <p className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Sequencing Decision
              </p>
            </div>

            <div className="mb-3">
              <p className="text-xs text-slate-500 font-mono mb-1">CONTEXT RESOLVED:</p>
              <p className="text-xs text-slate-400">
                Credentialing verification → Auth evidence assembly → SDOH-modified outreach → Food
                resource referral
              </p>
            </div>

            {/* Step flow */}
            <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
              {SEQUENCING_STEPS.map((step, i) => (
                <React.Fragment key={step.id}>
                  <div
                    className="flex-1 min-w-[160px] p-3 rounded"
                    style={{
                      background: step.status === 'active' ? `${step.color}15` : '#0f172a',
                      border: `1px solid ${step.status === 'active' ? step.color : '#1e293b'}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: step.color, color: '#000' }}
                      >
                        {i + 1}
                      </div>
                      {step.status === 'active' && (
                        <span className="text-xs font-mono text-lime-400 animate-pulse">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-white mb-1">{step.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{step.detail}</p>
                  </div>
                  {i < SEQUENCING_STEPS.length - 1 && (
                    <div className="flex items-center px-1 flex-shrink-0">
                      <Icon name="ChevronRightIcon" size={16} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Sub-flow note */}
            <div className="mt-3 p-2 rounded bg-slate-900/60 border border-slate-800">
              <p className="text-xs text-slate-500 font-mono">
                Sub-flow: Auth → Consent → Credentialing → would create continuity risk if
                credentialing lapses mid-sequence
              </p>
            </div>

            {/* Disposition complete banner */}
            <div
              className="mt-3 p-3 rounded border flex items-center justify-between"
              style={{ background: 'rgba(132,204,22,0.06)', borderColor: '#84CC16' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                <p className="text-xs font-mono font-bold text-lime-400 uppercase tracking-wider">
                  Disposition Complete — SDOH-Informed
                </p>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Routing to Orchestration Complete — 5 signals processed · 2 suppressed · 1 delayed —
                single coordinated touchpoint · MTM provider alerts dispatched
              </p>
              <span className="text-xs font-mono text-slate-500">14:31:30</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
