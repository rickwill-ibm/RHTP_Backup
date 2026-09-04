'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import CaseloadDashboard from './components/CaseloadDashboard';
import ActionQueue from './components/ActionQueue';
import { buildTriageQueue, type TaskInput, type TransitionInput } from '@/lib/careTeam/triage';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import RiskBadge from '@/components/ui/RiskBadge';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';

// ─── ETG Cost Stack ───────────────────────────────────────────────────────────

const ETG_COLORS = {
  Inpatient: '#da1e28',
  Outpatient: '#0043ce',
  Ancillary: '#8a3ffc',
  Pharmacy: '#009d9a',
  Emergency: '#f1c21b',
};

interface CostStack {
  inpatient: number;
  outpatient: number;
  ancillary: number;
  pharmacy: number;
  emergency: number;
}

interface EpisodeTypeInfo {
  typeCode: number;
  label: string;
  description: string;
}

const ETG_EPISODE_TYPES: Record<number, EpisodeTypeInfo> = {
  0: { typeCode: 0, label: 'Type 0', description: 'Complete Episode — clean start & finish' },
  1: { typeCode: 1, label: 'Type 1', description: 'Full Year — clean start, unknown finish' },
  2: { typeCode: 2, label: 'Type 2', description: 'Full Year — unknown start, clean finish' },
  3: { typeCode: 3, label: 'Type 3', description: 'Full Year — unknown start & finish' },
  4: { typeCode: 4, label: 'Type 4', description: 'Incomplete — clean start, <1 year' },
  5: { typeCode: 5, label: 'Type 5', description: 'Incomplete — clean finish, <1 year' },
  6: { typeCode: 6, label: 'Type 6', description: 'Incomplete — no clean start or finish' },
};

// ─── Enhancement 1: Outreach Log ─────────────────────────────────────────────

type OutreachChannel = 'Phone' | 'Portal' | 'In-Person' | 'Mail';
type OutreachOutcome = 'Reached' | 'Left VM' | 'No Answer' | 'Refused' | 'Completed';

interface OutreachEntry {
  id: string;
  patientId: string;
  date: string;
  channel: OutreachChannel;
  outcome: OutreachOutcome;
  notes: string;
  nextFollowUp: string;
  attemptNumber: number;
}

const OUTREACH_LOG: OutreachEntry[] = [
  {
    id: 'ol-1',
    patientId: 'pt-001',
    date: '2026-05-30',
    channel: 'Phone',
    outcome: 'Reached',
    notes: 'Discussed SNF discharge plan. Patient agreeable. Family notified.',
    nextFollowUp: '2026-06-02',
    attemptNumber: 1,
  },
  {
    id: 'ol-2',
    patientId: 'pt-001',
    date: '2026-05-28',
    channel: 'Phone',
    outcome: 'Left VM',
    notes: 'Called re: SNF authorization. Left voicemail.',
    nextFollowUp: '2026-05-30',
    attemptNumber: 2,
  },
  {
    id: 'ol-3',
    patientId: 'pt-002',
    date: '2026-05-31',
    channel: 'Portal',
    outcome: 'Reached',
    notes: 'Sent PT follow-up instructions via portal. Patient confirmed receipt.',
    nextFollowUp: '2026-06-03',
    attemptNumber: 1,
  },
  {
    id: 'ol-4',
    patientId: 'pt-003',
    date: '2026-05-29',
    channel: 'Phone',
    outcome: 'No Answer',
    notes: 'No answer. Will retry tomorrow.',
    nextFollowUp: '2026-05-30',
    attemptNumber: 3,
  },
  {
    id: 'ol-5',
    patientId: 'pt-003',
    date: '2026-05-30',
    channel: 'Phone',
    outcome: 'Reached',
    notes: 'Confirmed inhaler prescription. Pharmacy notified.',
    nextFollowUp: '2026-06-04',
    attemptNumber: 1,
  },
  {
    id: 'ol-6',
    patientId: 'pt-004',
    date: '2026-05-31',
    channel: 'Phone',
    outcome: 'Reached',
    notes: 'Home health agency referral discussed. Patient agreed.',
    nextFollowUp: '2026-06-05',
    attemptNumber: 1,
  },
  {
    id: 'ol-7',
    patientId: 'pt-005',
    date: '2026-05-28',
    channel: 'In-Person',
    outcome: 'Completed',
    notes: 'Office visit. A1C recheck ordered. Diabetes education provided.',
    nextFollowUp: '2026-06-07',
    attemptNumber: 1,
  },
  {
    id: 'ol-8',
    patientId: 'pt-006',
    date: '2026-05-27',
    channel: 'Phone',
    outcome: 'Reached',
    notes: 'Post-episode quality review scheduled.',
    nextFollowUp: '2026-06-10',
    attemptNumber: 1,
  },
];

// ─── Enhancement 2: Transitions of Care ──────────────────────────────────────

type CareSetting = 'Inpatient' | 'SNF' | 'Home Health' | 'Outpatient' | 'ED' | 'Rehab';
type TransitionStatus = 'Active' | 'Pending Discharge' | 'Transitioning' | 'Stable';

interface TransitionInfo {
  patientId: string;
  currentSetting: CareSetting;
  daysInSetting: number;
  expectedDischarge: string | null;
  nextSetting: CareSetting | null;
  status: TransitionStatus;
  admitDate: string;
}

const TRANSITIONS: Record<string, TransitionInfo> = {
  'pt-001': {
    patientId: 'pt-001',
    currentSetting: 'SNF',
    daysInSetting: 12,
    expectedDischarge: '2026-06-05',
    nextSetting: 'Home Health',
    status: 'Pending Discharge',
    admitDate: '2026-05-20',
  },
  'pt-002': {
    patientId: 'pt-002',
    currentSetting: 'Home Health',
    daysInSetting: 8,
    expectedDischarge: '2026-06-10',
    nextSetting: 'Outpatient',
    status: 'Active',
    admitDate: '2026-05-24',
  },
  'pt-003': {
    patientId: 'pt-003',
    currentSetting: 'Outpatient',
    daysInSetting: 14,
    expectedDischarge: null,
    nextSetting: null,
    status: 'Stable',
    admitDate: '2026-05-18',
  },
  'pt-004': {
    patientId: 'pt-004',
    currentSetting: 'Inpatient',
    daysInSetting: 9,
    expectedDischarge: '2026-06-03',
    nextSetting: 'Home Health',
    status: 'Pending Discharge',
    admitDate: '2026-05-23',
  },
  'pt-005': {
    patientId: 'pt-005',
    currentSetting: 'Outpatient',
    daysInSetting: 61,
    expectedDischarge: null,
    nextSetting: null,
    status: 'Stable',
    admitDate: '2026-04-01',
  },
  'pt-006': {
    patientId: 'pt-006',
    currentSetting: 'Outpatient',
    daysInSetting: 30,
    expectedDischarge: null,
    nextSetting: null,
    status: 'Stable',
    admitDate: '2026-05-01',
  },
};

// ─── Enhancement 4: Care Plan Status ─────────────────────────────────────────

type CarePlanStatus = 'On-Track' | 'At-Risk' | 'Overdue';

interface CarePlanInfo {
  patientId: string;
  status: CarePlanStatus;
  tasksCompleted: number;
  tasksTotal: number;
  nextDueAction: string;
  nextDueDate: string;
}

const CARE_PLANS: Record<string, CarePlanInfo> = {
  'pt-001': {
    patientId: 'pt-001',
    status: 'Overdue',
    tasksCompleted: 3,
    tasksTotal: 8,
    nextDueAction: 'SNF discharge authorization',
    nextDueDate: '2026-06-02',
  },
  'pt-002': {
    patientId: 'pt-002',
    status: 'At-Risk',
    tasksCompleted: 5,
    tasksTotal: 9,
    nextDueAction: 'PT evaluation scheduling',
    nextDueDate: '2026-06-03',
  },
  'pt-003': {
    patientId: 'pt-003',
    status: 'On-Track',
    tasksCompleted: 6,
    tasksTotal: 7,
    nextDueAction: 'Medication reconciliation',
    nextDueDate: '2026-06-04',
  },
  'pt-004': {
    patientId: 'pt-004',
    status: 'Overdue',
    tasksCompleted: 2,
    tasksTotal: 6,
    nextDueAction: 'Home health referral',
    nextDueDate: '2026-06-05',
  },
  'pt-005': {
    patientId: 'pt-005',
    status: 'On-Track',
    tasksCompleted: 10,
    tasksTotal: 12,
    nextDueAction: 'A1C recheck',
    nextDueDate: '2026-06-07',
  },
  'pt-006': {
    patientId: 'pt-006',
    status: 'At-Risk',
    tasksCompleted: 7,
    tasksTotal: 10,
    nextDueAction: 'Post-episode quality review',
    nextDueDate: '2026-06-10',
  },
};

// ─── Enhancement 3: Smart Priority Queue ─────────────────────────────────────

type PriorityBucket = 'Today' | 'This Week' | 'Routine';

interface PriorityScore {
  patientId: string;
  score: number;
  bucket: PriorityBucket;
  factors: string[];
}

function computePriority(p: WorklistPatient): PriorityScore {
  let score = 0;
  const factors: string[] = [];

  // Risk tier
  if (p.riskTier === 'Critical') {
    score += 40;
    factors.push('Critical risk tier');
  } else if (p.riskTier === 'High') {
    score += 25;
    factors.push('High risk tier');
  } else if (p.riskTier === 'Moderate') {
    score += 10;
  }

  // Cost variance
  if (p.variancePct > 15) {
    score += 20;
    factors.push(`Cost ${p.variancePct.toFixed(0)}% over target`);
  } else if (p.variancePct > 5) {
    score += 10;
  }

  // Transition status
  const t = TRANSITIONS[p.id];
  if (t?.status === 'Pending Discharge') {
    score += 25;
    factors.push('Pending discharge');
  } else if (t?.status === 'Transitioning') {
    score += 20;
    factors.push('Mid-transition');
  } else if (t?.currentSetting === 'Inpatient') {
    score += 15;
    factors.push('Inpatient');
  }

  // Care plan status
  const cp = CARE_PLANS[p.id];
  if (cp?.status === 'Overdue') {
    score += 20;
    factors.push('Care plan overdue');
  } else if (cp?.status === 'At-Risk') {
    score += 10;
    factors.push('Care plan at-risk');
  }

  // Days since last outreach
  const lastContact = OUTREACH_LOG.filter((o) => o.patientId === p.id).sort((a, b) =>
    b.date.localeCompare(a.date)
  )[0];
  if (!lastContact) {
    score += 15;
    factors.push('No recent contact');
  } else {
    const daysSince = Math.floor(
      (new Date('2026-06-01').getTime() - new Date(lastContact.date).getTime()) / 86400000
    );
    if (daysSince > 7) {
      score += 15;
      factors.push(`${daysSince}d since last contact`);
    } else if (daysSince > 3) {
      score += 5;
    }
  }

  // Alert present
  if (p.alert) {
    score += 10;
    factors.push('Active alert');
  }

  let bucket: PriorityBucket = 'Routine';
  if (score >= 60) bucket = 'Today';
  else if (score >= 35) bucket = 'This Week';

  return { patientId: p.id, score, bucket, factors };
}

// ─── Enhancement 5: ADT Alert Feed ───────────────────────────────────────────

type ADTEventType = 'Admission' | 'Discharge' | 'Transfer';

interface ADTAlert {
  id: string;
  patientId: string;
  patientName: string;
  eventType: ADTEventType;
  fromSetting?: string;
  toSetting: string;
  facility: string;
  timestamp: string;
  isNew: boolean;
  actionRequired: string;
}

const ADT_ALERTS: ADTAlert[] = [
  {
    id: 'adt-1',
    patientId: 'pt-004',
    patientName: 'Lisa Thompson',
    eventType: 'Admission',
    toSetting: 'Inpatient',
    facility: 'Memorial General Hospital',
    timestamp: '2026-05-23T08:14:00',
    isNew: true,
    actionRequired: 'Initiate post-admission care plan review',
  },
  {
    id: 'adt-2',
    patientId: 'pt-001',
    patientName: 'James Wilson',
    eventType: 'Transfer',
    fromSetting: 'Inpatient',
    toSetting: 'SNF',
    facility: 'Sunrise Skilled Nursing Facility',
    timestamp: '2026-05-20T14:30:00',
    isNew: true,
    actionRequired: 'Confirm SNF care plan handoff within 48h',
  },
  {
    id: 'adt-3',
    patientId: 'pt-002',
    patientName: 'Robert Chen',
    eventType: 'Discharge',
    toSetting: 'Home Health',
    facility: 'Regional Medical Center',
    timestamp: '2026-05-24T11:00:00',
    isNew: false,
    actionRequired: 'Schedule 72h post-discharge follow-up call',
  },
  {
    id: 'adt-4',
    patientId: 'pt-006',
    patientName: 'Thomas Brandt',
    eventType: 'Discharge',
    toSetting: 'Outpatient',
    facility: 'Community Health Center',
    timestamp: '2026-05-01T09:45:00',
    isNew: false,
    actionRequired: 'Post-episode quality review due',
  },
];

// ─── Main Data ────────────────────────────────────────────────────────────────

interface WorklistPatient {
  id: string;
  name: string;
  mrn: string;
  age: number;
  gender: string;
  riskTier: 'Critical' | 'High' | 'Moderate' | 'Low';
  episodeType: string;
  episodeStatus: 'Active' | 'Closed';
  daysInEpisode: number;
  totalCost: number;
  targetCost: number;
  variancePct: number;
  nextActionDue: string;
  nextAction: string;
  careManager: string;
  alert?: string;
  costStack: CostStack;
  etgTypeCode: number;
}

const WORKLIST: WorklistPatient[] = [
  {
    id: 'pt-maria',
    name: 'Maria Redhawk',
    mrn: 'MRN-SD-001',
    age: 34,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Pre-Diabetic / Postpartum',
    episodeStatus: 'Active',
    daysInEpisode: 427,
    totalCost: 8240,
    targetCost: 10680,
    variancePct: -22.8,
    nextActionDue: '2026-06-02',
    nextAction: 'SNAP renewal + WIC enrollment',
    careManager: 'Sarah Johnson',
    alert: 'Edinburgh PND 427d unmanaged · SNAP expired T+47d',
    costStack: { inpatient: 0, outpatient: 42.0, ancillary: 18.0, pharmacy: 28.0, emergency: 12.0 },
    etgTypeCode: 4,
  },
  {
    id: 'pt-001',
    name: 'James Wilson',
    mrn: 'MRN-0087',
    age: 58,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'Diabetes · CHF',
    episodeStatus: 'Active',
    daysInEpisode: 47,
    totalCost: 32650,
    targetCost: 28000,
    variancePct: 16.6,
    nextActionDue: '2026-06-02',
    nextAction: 'SNF discharge planning',
    careManager: 'Sarah Johnson',
    alert: 'Cost threshold exceeded',
    costStack: { inpatient: 56.7, outpatient: 1.4, ancillary: 9.5, pharmacy: 5.0, emergency: 7.4 },
    etgTypeCode: 0,
  },
  {
    id: 'pt-002',
    name: 'Robert Chen',
    mrn: 'MRN-0103',
    age: 62,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'Hypertension · CKD',
    episodeStatus: 'Active',
    daysInEpisode: 22,
    totalCost: 28450,
    targetCost: 25000,
    variancePct: 13.8,
    nextActionDue: '2026-06-03',
    nextAction: 'PT follow-up coordination',
    careManager: 'Sarah Johnson',
    alert: 'Readmission risk flag',
    costStack: {
      inpatient: 62.0,
      outpatient: 12.0,
      ancillary: 14.0,
      pharmacy: 8.0,
      emergency: 4.0,
    },
    etgTypeCode: 4,
  },
  {
    id: 'pt-003',
    name: 'Dorothy Simmons',
    mrn: 'MRN-211044',
    age: 65,
    gender: 'F',
    riskTier: 'High',
    episodeType: 'COPD Exacerbation',
    episodeStatus: 'Active',
    daysInEpisode: 14,
    totalCost: 12400,
    targetCost: 22000,
    variancePct: -43.6,
    nextActionDue: '2026-06-04',
    nextAction: 'Medication reconciliation',
    careManager: 'Sarah Johnson',
    costStack: {
      inpatient: 20.0,
      outpatient: 28.0,
      ancillary: 15.0,
      pharmacy: 32.0,
      emergency: 5.0,
    },
    etgTypeCode: 4,
  },
  {
    id: 'pt-004',
    name: 'Lisa Thompson',
    mrn: 'MRN-0156',
    age: 41,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Asthma · Obesity',
    episodeStatus: 'Active',
    daysInEpisode: 9,
    totalCost: 8200,
    targetCost: 20000,
    variancePct: -59.0,
    nextActionDue: '2026-06-05',
    nextAction: 'Home health referral',
    careManager: 'Sarah Johnson',
    costStack: {
      inpatient: 45.0,
      outpatient: 20.0,
      ancillary: 18.0,
      pharmacy: 10.0,
      emergency: 7.0,
    },
    etgTypeCode: 5,
  },
  {
    id: 'pt-005',
    name: 'Linda Castillo',
    mrn: 'MRN-203318',
    age: 69,
    gender: 'F',
    riskTier: 'Moderate',
    episodeType: 'Diabetes Management',
    episodeStatus: 'Active',
    daysInEpisode: 61,
    totalCost: 8450,
    targetCost: 12000,
    variancePct: -29.6,
    nextActionDue: '2026-06-07',
    nextAction: 'A1C recheck scheduling',
    careManager: 'Sarah Johnson',
    costStack: { inpatient: 0, outpatient: 38.0, ancillary: 22.0, pharmacy: 38.0, emergency: 2.0 },
    etgTypeCode: 1,
  },
  {
    id: 'pt-006',
    name: 'Thomas Brandt',
    mrn: 'MRN-195774',
    age: 74,
    gender: 'M',
    riskTier: 'High',
    episodeType: 'CHF Exacerbation',
    episodeStatus: 'Closed',
    daysInEpisode: 90,
    totalCost: 31200,
    targetCost: 28000,
    variancePct: 11.4,
    nextActionDue: '2026-06-10',
    nextAction: 'Post-episode quality review',
    careManager: 'Sarah Johnson',
    costStack: {
      inpatient: 50.0,
      outpatient: 8.0,
      ancillary: 12.0,
      pharmacy: 6.0,
      emergency: 14.0,
    },
    etgTypeCode: 0,
  },
];

const OPEN_TASKS = [
  {
    id: 't0',
    patient: 'Maria Redhawk',
    task: 'SNAP renewal + WIC enrollment initiation',
    due: '2026-06-02',
    priority: 'High',
  },
  {
    id: 't1',
    patient: 'James Wilson',
    task: 'Submit SNF authorization',
    due: '2026-06-02',
    priority: 'High',
  },
  {
    id: 't2',
    patient: 'Robert Chen',
    task: 'Schedule PT evaluation',
    due: '2026-06-03',
    priority: 'High',
  },
  {
    id: 't3',
    patient: 'Dorothy Simmons',
    task: 'Confirm inhaler prescription',
    due: '2026-06-04',
    priority: 'Medium',
  },
  {
    id: 't4',
    patient: 'Lisa Thompson',
    task: 'Home health agency contact',
    due: '2026-06-05',
    priority: 'Medium',
  },
  {
    id: 't5',
    patient: 'Linda Castillo',
    task: 'Lab order for A1C',
    due: '2026-06-07',
    priority: 'Low',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
}

function formatDateTime(ts: string) {
  const dt = new Date(ts);
  return (
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}

function VariancePill({ pct }: { pct: number }) {
  const over = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-mono font-semibold px-1.5 py-0.5 ${over ? 'bg-[#fff1f1] text-[#da1e28]' : 'bg-[#defbe6] text-[#0e6027]'}`}
    >
      {over ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function CostStackMiniBar({
  stack,
  totalCost,
  etgTypeCode,
}: {
  stack: CostStack;
  totalCost: number;
  etgTypeCode: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const etgInfo = ETG_EPISODE_TYPES[etgTypeCode] || ETG_EPISODE_TYPES[0];
  const segments = [
    {
      key: 'Inpatient',
      pct: stack.inpatient,
      color: ETG_COLORS.Inpatient,
      amt: Math.round((totalCost * stack.inpatient) / 100),
    },
    {
      key: 'Outpatient',
      pct: stack.outpatient,
      color: ETG_COLORS.Outpatient,
      amt: Math.round((totalCost * stack.outpatient) / 100),
    },
    {
      key: 'Ancillary',
      pct: stack.ancillary,
      color: ETG_COLORS.Ancillary,
      amt: Math.round((totalCost * stack.ancillary) / 100),
    },
    {
      key: 'Pharmacy',
      pct: stack.pharmacy,
      color: ETG_COLORS.Pharmacy,
      amt: Math.round((totalCost * stack.pharmacy) / 100),
    },
    {
      key: 'Emergency',
      pct: stack.emergency,
      color: ETG_COLORS.Emergency,
      amt: Math.round((totalCost * stack.emergency) / 100),
    },
  ].filter((s) => s.pct > 0);
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex h-4 w-28 overflow-hidden rounded-sm cursor-default">
        {segments.map((seg) => (
          <div key={seg.key} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
        ))}
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-6 w-56 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-carbon-gray-70">
            <span className="bg-[#8a3ffc] text-white text-2xs font-bold px-1.5 py-0.5 rounded-sm">
              {etgInfo.label}
            </span>
            <span className="text-carbon-gray-30 text-2xs leading-tight">
              {etgInfo.description}
            </span>
          </div>
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">
            Cost by Setting
          </p>
          <div className="space-y-1">
            {segments.map((seg) => (
              <div key={seg.key} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-carbon-gray-10">{seg.key}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-white">${seg.amt.toLocaleString()}</span>
                  <span className="text-carbon-gray-50 font-mono">{seg.pct.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Enhancement 4: Care Plan Badge ──────────────────────────────────────────

function CarePlanBadge({ info }: { info: CarePlanInfo }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = Math.round((info.tasksCompleted / info.tasksTotal) * 100);
  const styles = {
    'On-Track': { bg: 'bg-[#defbe6]', text: 'text-[#0e6027]', bar: '#24a148', dot: 'bg-[#24a148]' },
    'At-Risk': { bg: 'bg-[#fdf6dd]', text: 'text-[#b45309]', bar: '#f1c21b', dot: 'bg-[#f1c21b]' },
    Overdue: { bg: 'bg-[#fff1f1]', text: 'text-[#da1e28]', bar: '#da1e28', dot: 'bg-[#da1e28]' },
  }[info.status];
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`inline-flex flex-col gap-0.5 px-2 py-1 ${styles.bg} cursor-default min-w-[80px]`}
      >
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} />
          <span className={`text-2xs font-semibold ${styles.text}`}>{info.status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-carbon-gray-20 rounded-full overflow-hidden w-12">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: styles.bar }}
            />
          </div>
          <span className="text-2xs font-mono text-carbon-gray-70">{pct}%</span>
        </div>
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-10 w-52 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">
            Care Plan Status
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Tasks</span>
              <span className="font-mono">
                {info.tasksCompleted}/{info.tasksTotal} completed
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Next Action</span>
              <span className="text-right max-w-[120px] leading-tight">{info.nextDueAction}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Due</span>
              <span className="font-mono">{formatDate(info.nextDueDate)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Enhancement 2: Transition Badge ─────────────────────────────────────────

function TransitionBadge({ info }: { info: TransitionInfo }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const settingColors: Record<CareSetting, string> = {
    Inpatient: 'bg-[#fff1f1] text-[#da1e28]',
    SNF: 'bg-[#fdf6dd] text-[#b45309]',
    'Home Health': 'bg-[#d0e2ff] text-[#0043ce]',
    Outpatient: 'bg-[#defbe6] text-[#0e6027]',
    ED: 'bg-[#fff1f1] text-[#da1e28]',
    Rehab: 'bg-[#f6f2ff] text-[#6929c4]',
  };
  const isPendingDischarge = info.status === 'Pending Discharge';
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 cursor-default ${settingColors[info.currentSetting]}`}
      >
        {isPendingDischarge && (
          <Icon name="ArrowRightCircleIcon" size={11} className="flex-shrink-0" />
        )}
        <span className="text-2xs font-semibold whitespace-nowrap">{info.currentSetting}</span>
        <span className="text-2xs font-mono opacity-70">·{info.daysInSetting}d</span>
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-7 w-52 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">
            Transition of Care
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Current</span>
              <span>{info.currentSetting}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Days in Setting</span>
              <span className="font-mono">{info.daysInSetting}d</span>
            </div>
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Admit Date</span>
              <span className="font-mono">{formatDate(info.admitDate)}</span>
            </div>
            {info.expectedDischarge && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">Exp. Discharge</span>
                <span className="font-mono">{formatDate(info.expectedDischarge)}</span>
              </div>
            )}
            {info.nextSetting && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">Next Setting</span>
                <span className="text-[#97c1ff]">{info.nextSetting}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Status</span>
              <span className={isPendingDischarge ? 'text-[#f1c21b]' : 'text-[#42be65]'}>
                {info.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Enhancement 3: Priority Bucket Label ────────────────────────────────────

function PriorityBucketLabel({
  bucket,
  score,
  factors,
}: {
  bucket: PriorityBucket;
  score: number;
  factors: string[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const styles = {
    Today: { bg: 'bg-[#da1e28]', text: 'text-white', icon: 'BoltIcon' },
    'This Week': { bg: 'bg-[#f1c21b]', text: 'text-carbon-gray-100', icon: 'ClockIcon' },
    Routine: { bg: 'bg-[#defbe6]', text: 'text-[#0e6027]', icon: 'CheckCircleIcon' },
  }[bucket];
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 cursor-default ${styles.bg}`}>
        <Icon name={styles.icon as any} size={10} className={styles.text} />
        <span className={`text-2xs font-bold ${styles.text}`}>{bucket}</span>
        <span className={`text-2xs font-mono opacity-80 ${styles.text}`}>{score}</span>
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-7 w-52 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">
            Priority Score: {score}
          </p>
          <div className="space-y-1">
            {factors.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-[#97c1ff] flex-shrink-0" />
                <span className="text-carbon-gray-10">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Enhancement 1: Outreach Log Panel ───────────────────────────────────────

function OutreachLogPanel({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [newChannel, setNewChannel] = useState<OutreachChannel>('Phone');
  const [newOutcome, setNewOutcome] = useState<OutreachOutcome>('Reached');
  const [newNotes, setNewNotes] = useState('');
  const [newFollowUp, setNewFollowUp] = useState('');
  const entries = OUTREACH_LOG.filter((o) => o.patientId === patientId).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const channelIcon: Record<OutreachChannel, string> = {
    Phone: 'PhoneIcon',
    Portal: 'ComputerDesktopIcon',
    'In-Person': 'UserIcon',
    Mail: 'EnvelopeIcon',
  };
  const outcomeStyle: Record<OutreachOutcome, string> = {
    Reached: 'bg-[#defbe6] text-[#0e6027]',
    Completed: 'bg-[#defbe6] text-[#0e6027]',
    'Left VM': 'bg-[#d0e2ff] text-[#0043ce]',
    'No Answer': 'bg-[#fdf6dd] text-[#b45309]',
    Refused: 'bg-[#fff1f1] text-[#da1e28]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="pointer-events-auto w-[480px] h-full bg-white border-l border-carbon-gray-20 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between bg-[#d0e2ff]">
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">Outreach Log</p>
            <p className="text-xs text-[#0043ce]">{patientName}</p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-70 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto divide-y divide-carbon-gray-20">
          {entries.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-carbon-gray-50">
              No outreach history yet.
            </div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <Icon
                    name={channelIcon[entry.channel] as any}
                    size={14}
                    className="text-carbon-gray-50 flex-shrink-0"
                  />
                  <span className="text-xs font-semibold text-carbon-gray-100">
                    {entry.channel}
                  </span>
                  <span
                    className={`text-2xs font-semibold px-1.5 py-0.5 ${outcomeStyle[entry.outcome]}`}
                  >
                    {entry.outcome}
                  </span>
                  <span className="text-2xs text-carbon-gray-50">
                    Attempt #{entry.attemptNumber}
                  </span>
                </div>
                <span className="text-2xs font-mono text-carbon-gray-50 whitespace-nowrap">
                  {formatDate(entry.date)}
                </span>
              </div>
              <p className="text-xs text-carbon-gray-70 leading-relaxed">{entry.notes}</p>
              {entry.nextFollowUp && (
                <div className="mt-1.5 flex items-center gap-1 text-2xs text-[#0043ce]">
                  <Icon name="CalendarIcon" size={11} />
                  Next follow-up: {formatDate(entry.nextFollowUp)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Log new contact */}
        <div className="border-t border-carbon-gray-20 px-5 py-4 bg-carbon-gray-10 space-y-3">
          <p className="text-xs font-semibold text-carbon-gray-100">Log New Contact</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs text-carbon-gray-70 mb-0.5 block">Channel</label>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as OutreachChannel)}
                className="w-full text-xs border border-carbon-gray-30 px-2 py-1.5 bg-white text-carbon-gray-100 focus:outline-none focus:border-[#0043ce]"
              >
                {(['Phone', 'Portal', 'In-Person', 'Mail'] as OutreachChannel[]).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-2xs text-carbon-gray-70 mb-0.5 block">Outcome</label>
              <select
                value={newOutcome}
                onChange={(e) => setNewOutcome(e.target.value as OutreachOutcome)}
                className="w-full text-xs border border-carbon-gray-30 px-2 py-1.5 bg-white text-carbon-gray-100 focus:outline-none focus:border-[#0043ce]"
              >
                {(
                  ['Reached', 'Left VM', 'No Answer', 'Refused', 'Completed'] as OutreachOutcome[]
                ).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 mb-0.5 block">Notes</label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              placeholder="Contact notes..."
              className="w-full text-xs border border-carbon-gray-30 px-2 py-1.5 bg-white text-carbon-gray-100 focus:outline-none focus:border-[#0043ce] resize-none"
            />
          </div>
          <div>
            <label className="text-2xs text-carbon-gray-70 mb-0.5 block">Next Follow-Up Date</label>
            <input
              type="date"
              value={newFollowUp}
              onChange={(e) => setNewFollowUp(e.target.value)}
              className="w-full text-xs border border-carbon-gray-30 px-2 py-1.5 bg-white text-carbon-gray-100 focus:outline-none focus:border-[#0043ce]"
            />
          </div>
          <button
            onClick={() => {
              setNewNotes('');
              setNewFollowUp('');
            }}
            className="w-full bg-[#0043ce] text-white text-xs font-semibold py-2 hover:bg-[#0035a8] transition-colors"
          >
            Save Contact Log
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enhancement 5: ADT Alert Feed ───────────────────────────────────────────

function ADTAlertFeed({
  alerts,
  onDismiss,
}: {
  alerts: ADTAlert[];
  onDismiss: (id: string) => void;
}) {
  const eventStyles: Record<
    ADTEventType,
    { bg: string; border: string; badge: string; icon: string; iconColor: string }
  > = {
    Admission: {
      bg: 'bg-[#fff1f1]',
      border: 'border-[#ffb3b8]',
      badge: 'bg-[#da1e28] text-white',
      icon: 'ArrowDownCircleIcon',
      iconColor: 'text-[#da1e28]',
    },
    Discharge: {
      bg: 'bg-[#defbe6]',
      border: 'border-[#a7f0ba]',
      badge: 'bg-[#24a148] text-white',
      icon: 'ArrowUpCircleIcon',
      iconColor: 'text-[#24a148]',
    },
    Transfer: {
      bg: 'bg-[#fdf6dd]',
      border: 'border-[#f1c21b]',
      badge: 'bg-[#b45309] text-white',
      icon: 'ArrowsRightLeftIcon',
      iconColor: 'text-[#b45309]',
    },
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const s = eventStyles[alert.eventType];
        return (
          <div
            key={alert.id}
            className={`${s.bg} border ${s.border} px-4 py-3 flex items-start gap-3`}
          >
            <Icon
              name={s.icon as any}
              size={18}
              className={`${s.iconColor} flex-shrink-0 mt-0.5`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className={`text-2xs font-bold px-1.5 py-0.5 ${s.badge}`}>
                  {alert.eventType}
                </span>
                <span className="text-sm font-semibold text-carbon-gray-100">
                  {alert.patientName}
                </span>
                {alert.isNew && (
                  <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#0043ce] text-white animate-pulse">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-xs text-carbon-gray-70">
                {alert.fromSetting ? `${alert.fromSetting} → ` : ''}
                {alert.toSetting} · {alert.facility}
              </p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                {formatDateTime(alert.timestamp)}
              </p>
              <div className="mt-1.5 flex items-center gap-1 text-2xs text-[#0043ce]">
                <Icon name="BoltIcon" size={10} />
                <span className="font-medium">Action: {alert.actionRequired}</span>
              </div>
            </div>
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-2xs font-semibold text-carbon-gray-50 hover:text-carbon-gray-100 whitespace-nowrap flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        );
      })}
      {alerts.length === 0 && (
        <div className="bg-[#defbe6] border border-[#a7f0ba] px-5 py-6 text-center">
          <Icon name="CheckCircleIcon" size={24} className="text-[#24a148] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#0e6027]">No active ADT alerts</p>
          <p className="text-xs text-[#24a148] mt-0.5">
            All admission, discharge, and transfer events have been reviewed
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Enhancement 2: Transitions Panel ────────────────────────────────────────

function TransitionsPanel({ transitions }: { transitions: TransitionInfo[] }) {
  const settingOrder: CareSetting[] = [
    'Inpatient',
    'ED',
    'SNF',
    'Rehab',
    'Home Health',
    'Outpatient',
  ];
  const settingColors: Record<CareSetting, { bg: string; text: string; dot: string }> = {
    Inpatient: { bg: 'bg-[#fff1f1]', text: 'text-[#da1e28]', dot: 'bg-[#da1e28]' },
    SNF: { bg: 'bg-[#fdf6dd]', text: 'text-[#b45309]', dot: 'bg-[#f1c21b]' },
    'Home Health': { bg: 'bg-[#d0e2ff]', text: 'text-[#0043ce]', dot: 'bg-[#0043ce]' },
    Outpatient: { bg: 'bg-[#defbe6]', text: 'text-[#0e6027]', dot: 'bg-[#24a148]' },
    ED: { bg: 'bg-[#fff1f1]', text: 'text-[#da1e28]', dot: 'bg-[#da1e28]' },
    Rehab: { bg: 'bg-[#f6f2ff]', text: 'text-[#6929c4]', dot: 'bg-[#8a3ffc]' },
  };

  const grouped = settingOrder.reduce<Record<string, TransitionInfo[]>>((acc, s) => {
    const pts = transitions.filter((t) => t.currentSetting === s);
    if (pts.length > 0) acc[s] = pts;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Pending Discharge',
            count: transitions.filter((t) => t.status === 'Pending Discharge').length,
            color: 'text-[#b45309]',
            bg: 'bg-[#fdf6dd]',
            icon: 'ArrowRightCircleIcon',
          },
          {
            label: 'Inpatient / ED',
            count: transitions.filter(
              (t) => t.currentSetting === 'Inpatient' || t.currentSetting === 'ED'
            ).length,
            color: 'text-[#da1e28]',
            bg: 'bg-[#fff1f1]',
            icon: 'BuildingOffice2Icon',
          },
          {
            label: 'Post-Acute Care',
            count: transitions.filter(
              (t) =>
                t.currentSetting === 'SNF' ||
                t.currentSetting === 'Home Health' ||
                t.currentSetting === 'Rehab'
            ).length,
            color: 'text-[#0043ce]',
            bg: 'bg-[#d0e2ff]',
            icon: 'HomeIcon',
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} px-4 py-3 flex items-center gap-3`}>
            <Icon name={s.icon as any} size={20} className={s.color} />
            <div>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</p>
              <p className="text-2xs text-carbon-gray-70">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grouped by setting */}
      {Object.entries(grouped).map(([setting, pts]) => {
        const sc = settingColors[setting as CareSetting];
        return (
          <div key={setting} className="bg-white border border-carbon-gray-20">
            <div
              className={`px-4 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 ${sc.bg}`}
            >
              <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
              <span className={`text-xs font-semibold ${sc.text}`}>{setting}</span>
              <span className="text-2xs text-carbon-gray-50 ml-auto">
                {pts.length} patient{pts.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="divide-y divide-carbon-gray-20">
              {pts.map((t) => {
                const patient = WORKLIST.find((p) => p.id === t.patientId);
                return (
                  <div key={t.patientId} className="px-4 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-carbon-gray-100">{patient?.name}</p>
                      <p className="text-2xs text-carbon-gray-50 font-mono">{patient?.mrn}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold font-mono text-carbon-gray-100">
                        {t.daysInSetting}
                      </p>
                      <p className="text-2xs text-carbon-gray-50">days</p>
                    </div>
                    {t.expectedDischarge && (
                      <div className="text-right">
                        <p className="text-2xs text-carbon-gray-50">Exp. Discharge</p>
                        <p className="text-xs font-mono font-semibold text-carbon-gray-100">
                          {formatDate(t.expectedDischarge)}
                        </p>
                      </div>
                    )}
                    {t.nextSetting && (
                      <div className="flex items-center gap-1">
                        <Icon name="ArrowRightIcon" size={12} className="text-carbon-gray-50" />
                        <span
                          className={`text-2xs font-semibold px-1.5 py-0.5 ${settingColors[t.nextSetting].bg} ${settingColors[t.nextSetting].text}`}
                        >
                          {t.nextSetting}
                        </span>
                      </div>
                    )}
                    <span
                      className={`text-2xs font-semibold px-1.5 py-0.5 ${t.status === 'Pending Discharge' ? 'bg-[#fdf6dd] text-[#b45309]' : t.status === 'Active' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                    >
                      {t.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── BH + Social Enhancements ─────────────────────────────────────────────────

type ProgramType = 'All' | 'Clinical' | 'BH' | 'Social';

interface BHRiskInfo {
  flag: boolean;
  level: 'High' | 'Moderate' | 'Low' | null;
  condition: string | null;
  lastBHContact: string | null;
  fuhFumStatus: 'Met' | 'Pending' | 'Overdue' | null;
}

interface SocialNeedsInfo {
  screeningStatus: 'Positive' | 'Negative' | 'Not Screened';
  activeNeeds: string[];
  chwAssigned: string | null;
  cboEnrollment: string | null;
  snapStatus: 'Active' | 'Pending' | 'Not Enrolled';
}

const BH_RISK: Record<string, BHRiskInfo> = {
  'pt-001': {
    flag: true,
    level: 'High',
    condition: 'Major Depression',
    lastBHContact: '2026-05-15',
    fuhFumStatus: 'Overdue',
  },
  'pt-002': { flag: false, level: null, condition: null, lastBHContact: null, fuhFumStatus: null },
  'pt-003': {
    flag: true,
    level: 'Moderate',
    condition: 'Anxiety + Depression',
    lastBHContact: '2026-05-28',
    fuhFumStatus: 'Met',
  },
  'pt-004': {
    flag: false,
    level: 'Low',
    condition: 'Adjustment Disorder',
    lastBHContact: '2026-05-10',
    fuhFumStatus: 'Pending',
  },
  'pt-005': {
    flag: true,
    level: 'High',
    condition: 'SUD — Alcohol',
    lastBHContact: '2026-04-30',
    fuhFumStatus: 'Overdue',
  },
  'pt-006': { flag: false, level: null, condition: null, lastBHContact: null, fuhFumStatus: null },
};

const SOCIAL_NEEDS: Record<string, SocialNeedsInfo> = {
  'pt-001': {
    screeningStatus: 'Positive',
    activeNeeds: ['Housing', 'Transportation'],
    chwAssigned: 'Maria Gonzalez',
    cboEnrollment: 'KC Housing Nav',
    snapStatus: 'Not Enrolled',
  },
  'pt-002': {
    screeningStatus: 'Negative',
    activeNeeds: [],
    chwAssigned: null,
    cboEnrollment: null,
    snapStatus: 'Not Enrolled',
  },
  'pt-003': {
    screeningStatus: 'Positive',
    activeNeeds: ['Food Insecurity'],
    chwAssigned: 'Maria Gonzalez',
    cboEnrollment: 'Tri-County Food Bank',
    snapStatus: 'Active',
  },
  'pt-004': {
    screeningStatus: 'Not Screened',
    activeNeeds: [],
    chwAssigned: null,
    cboEnrollment: null,
    snapStatus: 'Not Enrolled',
  },
  'pt-005': {
    screeningStatus: 'Positive',
    activeNeeds: ['Food Insecurity', 'Utilities'],
    chwAssigned: 'James Okafor',
    cboEnrollment: 'LIHEAP Program',
    snapStatus: 'Pending',
  },
  'pt-006': {
    screeningStatus: 'Negative',
    activeNeeds: [],
    chwAssigned: null,
    cboEnrollment: null,
    snapStatus: 'Not Enrolled',
  },
};

// Program type assignment per patient (determines which filter shows them)
const PATIENT_PROGRAM: Record<string, ProgramType[]> = {
  'pt-001': ['Clinical', 'BH', 'Social'],
  'pt-002': ['Clinical'],
  'pt-003': ['Clinical', 'BH', 'Social'],
  'pt-004': ['Clinical'],
  'pt-005': ['Clinical', 'BH', 'Social'],
  'pt-006': ['Clinical'],
};

function BHRiskBadge({ info }: { info: BHRiskInfo }) {
  const [showTooltip, setShowTooltip] = useState(false);
  if (!info.flag && !info.condition) {
    return <span className="text-2xs text-carbon-gray-30 font-mono">—</span>;
  }
  const levelStyle =
    info.level === 'High'
      ? 'bg-[#fff1f1] text-[#da1e28]'
      : info.level === 'Moderate'
        ? 'bg-[#fdf6dd] text-[#b45309]'
        : 'bg-[#f6f2ff] text-[#6929c4]';
  const fuhStyle =
    info.fuhFumStatus === 'Overdue'
      ? 'text-[#da1e28]'
      : info.fuhFumStatus === 'Pending'
        ? 'text-[#b45309]'
        : 'text-[#0e6027]';
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 cursor-default ${levelStyle}`}>
        {info.flag && <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
        <span className="text-2xs font-semibold">{info.level ?? 'Low'}</span>
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-7 w-52 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">BH Risk</p>
          <div className="space-y-1.5">
            {info.condition && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">Condition</span>
                <span className="text-right">{info.condition}</span>
              </div>
            )}
            {info.lastBHContact && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">Last BH Contact</span>
                <span className="font-mono">{info.lastBHContact}</span>
              </div>
            )}
            {info.fuhFumStatus && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">FUH/FUM</span>
                <span className={fuhStyle}>{info.fuhFumStatus}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SocialNeedsBadge({ info }: { info: SocialNeedsInfo }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const screenStyle =
    info.screeningStatus === 'Positive'
      ? 'bg-[#fdf6dd] text-[#b45309]'
      : info.screeningStatus === 'Negative'
        ? 'bg-[#defbe6] text-[#0e6027]'
        : 'bg-carbon-gray-10 text-carbon-gray-50';
  const snapStyle =
    info.snapStatus === 'Active'
      ? 'text-[#0e6027]'
      : info.snapStatus === 'Pending'
        ? 'text-[#b45309]'
        : 'text-carbon-gray-50';
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`inline-flex flex-col gap-0.5 px-1.5 py-1 cursor-default ${screenStyle}`}>
        <span className="text-2xs font-semibold">{info.screeningStatus}</span>
        {info.chwAssigned && (
          <span className="text-2xs opacity-80 truncate max-w-[90px]">
            CHW: {info.chwAssigned.split(' ')[0]}
          </span>
        )}
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-0 top-10 w-56 bg-carbon-gray-100 text-white text-xs shadow-lg p-3 rounded-sm pointer-events-none">
          <p className="text-2xs text-carbon-gray-30 uppercase tracking-wide mb-1.5">
            Social Needs
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">Screening</span>
              <span>{info.screeningStatus}</span>
            </div>
            {info.activeNeeds.length > 0 && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">Active Needs</span>
                <span className="text-right">{info.activeNeeds.join(', ')}</span>
              </div>
            )}
            {info.chwAssigned && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">CHW</span>
                <span>{info.chwAssigned}</span>
              </div>
            )}
            {info.cboEnrollment && (
              <div className="flex justify-between">
                <span className="text-carbon-gray-30">CBO</span>
                <span className="text-right">{info.cboEnrollment}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-carbon-gray-30">SNAP</span>
              <span className={snapStyle}>{info.snapStatus}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Patient ID mapping for registry ─────────────────────────────────────────
// Maps worklist patient IDs to platform registry IDs
const WORKLIST_TO_PLATFORM_ID: Record<string, string> = {
  'pt-maria': 'MARIA_SD_001',
  'pt-003': 'PAT-0042', // Dorothy Simmons
  'pt-001': 'PAT-0087', // Margaret Okonkwo → James Wilson slot
  'pt-002': 'PAT-0103', // Robert Hensley → Robert Chen slot
  'pt-004': 'PAT-0156', // James Whitfield → Lisa Thompson slot
};

// ─── Main ─────────────────────────────────────────────────────────────────────

function CareManagerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cohorts, setActiveCohortId, user } = useAppContext();
  const { setActiveCitizen } = useActiveCitizen();
  const initialTab =
    searchParams.get('tab') === 'dashboard' || cohorts.length > 0 ? 'dashboard' : 'caseload';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'caseload' | 'queue'>(initialTab);

  // Honor ?cohortId from the cohort-creation flow.
  useEffect(() => {
    const cid = searchParams.get('cohortId');
    if (cid) {
      setActiveCohortId(cid);
      setActiveTab('dashboard');
    }
  }, [searchParams, setActiveCohortId]);
  const [outreachPatient, setOutreachPatient] = useState<{ id: string; name: string } | null>(null);
  const [adtAlerts, setAdtAlerts] = useState<ADTAlert[]>(ADT_ALERTS);
  const [priorityFilter, setPriorityFilter] = useState<PriorityBucket | 'All'>('All');
  const [programFilter, setProgramFilter] = useState<ProgramType>('All');
  const [focusCitizenId, setFocusCitizenId] = useState<string | null>(null);

  // Action Queue ⇄ Caseload connection
  const viewCitizenSignals = (pid: string) => {
    setFocusCitizenId(pid);
    setActiveTab('queue');
  };
  // "View citizen" → Citizen Detail
  const openCitizenDetail = (pid: string) => {
    const platformId = WORKLIST_TO_PLATFORM_ID[pid];
    if (!platformId) {
      toast.info('No citizen record for this caseload entry');
      return;
    }
    setActiveCitizen(platformId);
    router.push('/patient-detail');
  };
  // Demographics for Action Queue cards
  const citizenMetaFor = (pid: string) => {
    const p = WORKLIST.find((w) => w.id === pid);
    return p ? { age: p.age, gender: p.gender, mrn: p.mrn } : undefined;
  };

  // Compute priority scores for all patients
  const priorityMap = Object.fromEntries(WORKLIST.map((p) => [p.id, computePriority(p)]));

  // Sort worklist by priority score desc, then filter by bucket and program type
  const sortedWorklist = [...WORKLIST].sort(
    (a, b) => priorityMap[b.id].score - priorityMap[a.id].score
  );
  const programFiltered =
    programFilter === 'All'
      ? sortedWorklist
      : sortedWorklist.filter((p) => PATIENT_PROGRAM[p.id]?.includes(programFilter));
  const filteredWorklist =
    priorityFilter === 'All'
      ? programFiltered
      : programFiltered.filter((p) => priorityMap[p.id].bucket === priorityFilter);

  const activeEpisodes = WORKLIST.filter((p) => p.episodeStatus === 'Active').length;
  const overTarget = WORKLIST.filter((p) => p.variancePct > 0).length;
  const openTasks = OPEN_TASKS.length;
  const newAdtCount = adtAlerts.filter((a) => a.isNew).length;
  const pendingDischarge = Object.values(TRANSITIONS).filter(
    (t) => t.status === 'Pending Discharge'
  ).length;

  const kpis = [
    {
      label: 'Assigned Patients',
      value: WORKLIST.length,
      icon: 'UserGroupIcon',
      color: 'text-[#0043ce]',
      bg: 'bg-[#d0e2ff]',
    },
    {
      label: 'Active Episodes',
      value: activeEpisodes,
      icon: 'BoltIcon',
      color: 'text-[#b45309]',
      bg: 'bg-[#fdf6dd]',
    },
    {
      label: 'Over Cost Target',
      value: overTarget,
      icon: 'ExclamationTriangleIcon',
      color: 'text-[#da1e28]',
      bg: 'bg-[#fff1f1]',
    },
    {
      label: 'Open Tasks',
      value: openTasks,
      icon: 'ClipboardDocumentListIcon',
      color: 'text-[#6929c4]',
      bg: 'bg-[#f6f2ff]',
    },
    {
      label: 'Pending Discharge',
      value: pendingDischarge,
      icon: 'ArrowRightCircleIcon',
      color: 'text-[#b45309]',
      bg: 'bg-[#fdf6dd]',
    },
    {
      label: 'ADT Alerts',
      value: newAdtCount,
      icon: 'BellAlertIcon',
      color: 'text-[#da1e28]',
      bg: 'bg-[#fff1f1]',
    },
  ];

  const bucketCounts = {
    Today: sortedWorklist.filter((p) => priorityMap[p.id].bucket === 'Today').length,
    'This Week': sortedWorklist.filter((p) => priorityMap[p.id].bucket === 'This Week').length,
    Routine: sortedWorklist.filter((p) => priorityMap[p.id].bucket === 'Routine').length,
  };

  const programCounts: Record<ProgramType, number> = {
    All: WORKLIST.length,
    Clinical: WORKLIST.filter((p) => PATIENT_PROGRAM[p.id]?.includes('Clinical')).length,
    BH: WORKLIST.filter((p) => PATIENT_PROGRAM[p.id]?.includes('BH')).length,
    Social: WORKLIST.filter((p) => PATIENT_PROGRAM[p.id]?.includes('Social')).length,
  };

  // ── Unified Action Queue inputs (all alert types → triaged signals) ──────────
  const ptName = (pid: string) => WORKLIST.find((p) => p.id === pid)?.name ?? pid;
  const nameToId = (name: string) => WORKLIST.find((p) => p.name === name)?.id;
  const queueTasks: TaskInput[] = OPEN_TASKS.map((t) => ({
    ...t,
    priority: t.priority as 'High' | 'Medium' | 'Low',
    patientId: nameToId(t.patient),
  }));
  const queueTransitions: TransitionInput[] = Object.values(TRANSITIONS).map((t) => ({
    ...t,
    patientName: ptName(t.patientId),
  }));
  const queueItems = buildTriageQueue({
    adt: adtAlerts,
    tasks: queueTasks,
    transitions: queueTransitions,
  });
  const queueCount = queueItems.length;
  const signalCountFor = (pid: string) => queueItems.filter((i) => i.patientId === pid).length;
  const TIER_RANK: Record<string, number> = { 'Do Now': 0, 'This Week': 1, Routine: 2 };
  const topNbaFor = (pid: string) =>
    queueItems
      .filter((i) => i.patientId === pid)
      .sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9))[0];

  return (
    <AppLayout
      pageTitle="Care Manager Dashboard"
      breadcrumbs={[{ label: 'Care Manager' }]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-medium text-[#0043ce]">Care Manager: {user.name}</span>
          <span className="text-xs text-[#0043ce]">Contract: Medicaid RHTP Track 3</span>
          <span className="text-xs text-[#0043ce]">Period: Jan 2025 – Dec 2025</span>
          <button
            onClick={() => router.push('/episodic-management-analytics')}
            className="ml-auto text-xs font-semibold text-[#0043ce] hover:underline flex items-center gap-1"
          >
            Episodic Management Analytics <Icon name="ArrowRightIcon" size={12} />
          </button>
        </div>
      }
    >
      {/* Active-patient identity banner intentionally omitted — this is a panel-level
          cockpit, not a patient-scoped screen. Patient identity appears on drill-down. */}
      {/* KPI Strip */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-6 divide-x divide-carbon-gray-20">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-4 py-4 flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center flex-shrink-0 ${kpi.bg}`}>
              <Icon name={kpi.icon as any} size={18} className={kpi.color} />
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-carbon-gray-20">
          {(
            [
              {
                key: 'dashboard',
                label: `Dashboard${cohorts.length > 0 ? ` (${cohorts.length})` : ''}`,
                icon: 'Squares2X2Icon',
              },
              { key: 'caseload', label: 'Caseload', icon: 'UserGroupIcon' },
              { key: 'queue', label: `Action Queue (${queueCount})`, icon: 'BoltIcon' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-[#0043ce] text-[#0043ce]'
                  : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100'
              }`}
            >
              <Icon name={tab.icon as any} size={14} />
              {tab.label}
              {tab.key === 'queue' && newAdtCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#da1e28] animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ── Caseload Dashboard tab ── */}
        {activeTab === 'dashboard' && <CaseloadDashboard />}

        {/* ── Caseload tab (priority-ranked citizens) ── */}
        {activeTab === 'caseload' && (
          <div className="space-y-3">
            {/* Program Type Filter Bar */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Icon name="FunnelIcon" size={14} className="text-[#6929c4]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Program Type</span>
              </div>
              <div className="flex items-center gap-2">
                {(['All', 'Clinical', 'BH', 'Social'] as ProgramType[]).map((pt) => {
                  const active = programFilter === pt;
                  const ptStyle =
                    pt === 'Clinical'
                      ? {
                          active: 'bg-[#0043ce] text-white border-[#0043ce]',
                          count: 'bg-[#d0e2ff] text-[#0043ce]',
                        }
                      : pt === 'BH'
                        ? {
                            active: 'bg-[#6929c4] text-white border-[#6929c4]',
                            count: 'bg-[#f6f2ff] text-[#6929c4]',
                          }
                        : pt === 'Social'
                          ? {
                              active: 'bg-[#007d79] text-white border-[#007d79]',
                              count: 'bg-[#d9fbfb] text-[#007d79]',
                            }
                          : {
                              active: 'bg-carbon-gray-100 text-white border-carbon-gray-100',
                              count: 'bg-carbon-gray-10 text-carbon-gray-70',
                            };
                  return (
                    <button
                      key={pt}
                      onClick={() => setProgramFilter(pt)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors ${
                        active
                          ? ptStyle.active
                          : 'border-carbon-gray-20 text-carbon-gray-70 hover:border-carbon-gray-50 bg-white'
                      }`}
                    >
                      {pt}
                      <span
                        className={`text-2xs px-1.5 py-0.5 font-bold rounded-sm ${active ? 'bg-white/20 text-white' : ptStyle.count}`}
                      >
                        {programCounts[pt]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {programFilter !== 'All' && (
                <div className="ml-2 flex items-center gap-1.5 text-2xs text-carbon-gray-50">
                  <Icon name="InformationCircleIcon" size={12} />
                  {programFilter === 'Clinical' && 'Showing patients with active clinical episodes'}
                  {programFilter === 'BH' &&
                    'Showing patients with BH risk flags or active BH engagement'}
                  {programFilter === 'Social' &&
                    'Showing patients with positive SDOH screening or CHW assignment'}
                </div>
              )}
            </div>

            {/* Smart Priority Queue controls */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Icon name="BoltIcon" size={14} className="text-[#0043ce]" />
                <span className="text-xs font-semibold text-carbon-gray-100">
                  Smart Priority Queue
                </span>
                <span className="text-2xs text-carbon-gray-50">
                  — auto-ranked by composite score
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {(['All', 'Today', 'This Week', 'Routine'] as const).map((b) => {
                  const count = b === 'All' ? WORKLIST.length : bucketCounts[b];
                  const active = priorityFilter === b;
                  const bucketStyle =
                    b === 'Today'
                      ? 'bg-[#da1e28] text-white'
                      : b === 'This Week'
                        ? 'bg-[#f1c21b] text-carbon-gray-100'
                        : b === 'Routine'
                          ? 'bg-[#defbe6] text-[#0e6027]'
                          : '';
                  return (
                    <button
                      key={b}
                      onClick={() => setPriorityFilter(b)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors ${
                        active
                          ? 'border-[#0043ce] bg-[#d0e2ff] text-[#0043ce]'
                          : 'border-carbon-gray-20 text-carbon-gray-70 hover:border-carbon-gray-50'
                      }`}
                    >
                      {b !== 'All' && (
                        <span className={`text-2xs px-1 py-0.5 font-bold ${bucketStyle}`}>
                          {count}
                        </span>
                      )}
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-carbon-gray-20 overflow-x-auto">
              <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
                <p className="text-sm font-semibold text-carbon-gray-100">
                  {filteredWorklist.length} Patient{filteredWorklist.length !== 1 ? 's' : ''}
                  {programFilter !== 'All' && (
                    <span className="ml-1.5 text-2xs font-normal text-carbon-gray-50">
                      · {programFilter} Program
                    </span>
                  )}
                  {priorityFilter !== 'All' && (
                    <span className="ml-1.5 text-2xs font-normal text-carbon-gray-50">
                      · {priorityFilter}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {Object.entries(ETG_COLORS).map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1">
                      <div
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-2xs text-carbon-gray-50">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm min-w-[1600px]">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {[
                      'Priority',
                      'Patient',
                      'Risk',
                      'Episode Type',
                      'Status',
                      'Days',
                      'Total Cost',
                      'Variance',
                      'ETG Cost Stack',
                      'Transition',
                      'Care Plan',
                      'BH Risk',
                      'Social Needs',
                      'Next Action',
                      'Due',
                      '',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {filteredWorklist.map((p) => {
                    const priority = priorityMap[p.id];
                    const transition = TRANSITIONS[p.id];
                    const carePlan = CARE_PLANS[p.id];
                    const bhRisk = BH_RISK[p.id];
                    const socialNeeds = SOCIAL_NEEDS[p.id];
                    const lastOutreach = OUTREACH_LOG.filter((o) => o.patientId === p.id).sort(
                      (a, b) => b.date.localeCompare(a.date)
                    )[0];
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-[#edf5ff] transition-colors cursor-pointer group ${focusCitizenId === p.id ? 'bg-[#edf5ff] ring-1 ring-[#0043ce]' : ''}`}
                        onClick={() => {
                          const platformId = WORKLIST_TO_PLATFORM_ID[p.id];
                          if (!platformId) {
                            toast.info('No citizen record for this caseload entry');
                            return;
                          }
                          setActiveCitizen(platformId);
                          router.push('/patient-detail');
                        }}
                      >
                        {/* Priority */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <PriorityBucketLabel
                            bucket={priority.bucket}
                            score={priority.score}
                            factors={priority.factors}
                          />
                        </td>
                        {/* Patient */}
                        <td className="px-3 py-3">
                          <div>
                            <p className="font-medium text-carbon-gray-100 group-hover:text-[#0043ce] whitespace-nowrap">
                              {p.name}
                            </p>
                            <p className="text-2xs text-carbon-gray-50 font-mono">
                              {p.mrn} · {p.age}y {p.gender}
                            </p>
                            {p.alert && (
                              <span className="inline-flex items-center gap-0.5 text-2xs text-[#da1e28] font-medium mt-0.5">
                                <Icon name="ExclamationCircleIcon" size={10} /> {p.alert}
                              </span>
                            )}
                            {lastOutreach && (
                              <span className="inline-flex items-center gap-0.5 text-2xs text-carbon-gray-50 mt-0.5">
                                <Icon name="PhoneIcon" size={9} /> Last:{' '}
                                {formatDate(lastOutreach.date)} · {lastOutreach.outcome}
                              </span>
                            )}
                            {signalCountFor(p.id) > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  viewCitizenSignals(p.id);
                                }}
                                className="inline-flex items-center gap-1 text-2xs font-semibold text-[#0043ce] bg-[#edf5ff] border border-[#97c1ff] px-1.5 py-0.5 mt-1 hover:bg-[#d0e2ff]"
                              >
                                <Icon name="BoltIcon" size={9} /> {signalCountFor(p.id)} signal
                                {signalCountFor(p.id) !== 1 ? 's' : ''}
                              </button>
                            )}
                            {topNbaFor(p.id) && (
                              <p className="text-2xs text-carbon-gray-50 mt-1 flex items-start gap-1 max-w-[260px]">
                                <Icon
                                  name="SparklesIcon"
                                  size={9}
                                  className="text-[#0043ce] mt-0.5 flex-shrink-0"
                                />
                                <span>
                                  <span className="font-semibold text-carbon-gray-70">Next:</span>{' '}
                                  {topNbaFor(p.id)!.nextAction}
                                  <span className="text-carbon-gray-30">
                                    {' '}
                                    · {topNbaFor(p.id)!.producedBy}
                                  </span>
                                </span>
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <RiskBadge tier={p.riskTier} size="sm" />
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-carbon-gray-100 whitespace-nowrap">
                            {p.episodeType}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge
                            label={p.episodeStatus}
                            variant={p.episodeStatus === 'Active' ? 'warning' : 'success'}
                            size="sm"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-sm tabular-nums text-carbon-gray-100">
                            {p.daysInEpisode}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`font-mono text-sm tabular-nums font-semibold ${p.variancePct > 0 ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                          >
                            ${p.totalCost.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <VariancePill pct={p.variancePct} />
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <CostStackMiniBar
                            stack={p.costStack}
                            totalCost={p.totalCost}
                            etgTypeCode={p.etgTypeCode}
                          />
                        </td>
                        {/* Transition of Care */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {transition && <TransitionBadge info={transition} />}
                        </td>
                        {/* Care Plan Status */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {carePlan && <CarePlanBadge info={carePlan} />}
                        </td>
                        {/* BH Risk */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {bhRisk && <BHRiskBadge info={bhRisk} />}
                        </td>
                        {/* Social Needs */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {socialNeeds && <SocialNeedsBadge info={socialNeeds} />}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-carbon-gray-70 whitespace-nowrap">
                            {p.nextAction}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-carbon-gray-70 whitespace-nowrap">
                            {formatDate(p.nextActionDue)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOutreachPatient({ id: p.id, name: p.name });
                              }}
                              className="text-2xs font-semibold text-[#6929c4] hover:underline flex items-center gap-1 whitespace-nowrap"
                              title="Open Outreach Log"
                            >
                              <Icon name="PhoneIcon" size={11} /> Log
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                  `/patient-episode-summary?patientId=${p.id}&patientName=${encodeURIComponent(p.name)}&mrn=${p.mrn}`
                                );
                              }}
                              className="text-2xs font-semibold text-[#0043ce] hover:underline flex items-center gap-1"
                            >
                              Episodes <Icon name="ArrowRightIcon" size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Action Queue tab (Open Tasks + Transitions + ADT + BH/Social/Admin, triaged) ── */}
        {activeTab === 'queue' && (
          <ActionQueue
            adt={adtAlerts}
            tasks={queueTasks}
            transitions={queueTransitions}
            focusCitizenId={focusCitizenId}
            focusCitizenName={focusCitizenId ? ptName(focusCitizenId) : undefined}
            onViewCitizen={openCitizenDetail}
            citizenMeta={citizenMetaFor}
            onClearFocus={() => setFocusCitizenId(null)}
          />
        )}
      </div>

      {/* Outreach Log Drawer */}
      {outreachPatient && (
        <OutreachLogPanel
          patientId={outreachPatient.id}
          patientName={outreachPatient.name}
          onClose={() => setOutreachPatient(null)}
        />
      )}
    </AppLayout>
  );
}

export default function CareManagerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading worklist...
        </div>
      }
    >
      <CareManagerContent />
    </Suspense>
  );
}
