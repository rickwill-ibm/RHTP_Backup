'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useDemoStore } from '@/uhg/store/demoStore';
import MemberScopeNotice from '@/components/wpc/MemberScopeNotice';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import { getPatientSync } from '@/lib/services/patientService';
const IDENTITY_STATE = 'UNIFIED';
const CONFIDENCE_SCORE = 94;
const IDENTITY_SOURCES = 4;
const ACTIVE_EPISODES_COUNT = 2;
const OPEN_GAPS_COUNT = 9;
const ACTIVE_AGENTS_COUNT = 3;
const MEMBER_ROLES = ['PATIENT', 'PARENT', 'CAREGIVER', 'WORKER'];

// ─── Clinical Intelligence Constants ─────────────────────────────────────────
const ACTIVE_EPISODES = [
  {
    id: 'ep-1',
    name: 'Pre-Diabetic Trajectory',
    status: 'ACTIVE',
    raf: 0.82,
    trend: 'up',
    note: 'RAF 0.82 · trending up',
  },
  {
    id: 'ep-2',
    name: 'Postpartum Health',
    status: 'UNMANAGED',
    raf: null,
    trend: null,
    note: '427 days · no follow-up',
  },
  {
    id: 'ep-3',
    name: 'Sophia — Pediatric Wellness',
    status: 'ACTIVE',
    raf: null,
    trend: null,
    note: 'Proxy scope',
  },
  {
    id: 'ep-4',
    name: 'Elena — Cardiac/DM',
    status: 'CAREGIVER',
    raf: null,
    trend: null,
    note: 'Informal management',
  },
];

const CARE_GAPS = [
  {
    id: 'cg-1',
    name: 'HbA1c Lab Test',
    daysOpen: 38,
    urgency: 'CRITICAL',
    note: 'HEDIS window: 40d',
  },
  {
    id: 'cg-2',
    name: 'Edinburgh PND Screening',
    daysOpen: 427,
    urgency: 'CRITICAL',
    note: '427 days unmanaged',
  },
  {
    id: 'cg-3',
    name: 'Well-Child 24mo (Sophia)',
    daysOpen: 21,
    urgency: 'MODERATE',
    note: 'Sophia overdue',
  },
  {
    id: 'cg-4',
    name: 'Postpartum Follow-up',
    daysOpen: 427,
    urgency: 'CRITICAL',
    note: 'No BH referral accepted',
  },
  {
    id: 'cg-5',
    name: 'Caregiver Burden Assessment',
    daysOpen: 0,
    urgency: 'MODERATE',
    note: 'Zarit not yet done',
  },
];

const MEDICATIONS = [
  {
    id: 'med-1',
    name: 'Metformin 1000mg',
    for: 'Elena',
    pickup: 'Maria',
    adherence: 94,
    flag: null,
  },
  {
    id: 'med-2',
    name: 'Lisinopril 10mg',
    for: 'Elena',
    pickup: 'Maria',
    adherence: null,
    flag: 'Cardiac',
  },
  {
    id: 'med-3',
    name: 'Amoxicillin 250mg',
    for: 'Sophia',
    pickup: 'Maria',
    adherence: null,
    flag: 'ENT — recurrence x3',
  },
];

const LABS = [
  {
    id: 'lab-1',
    name: 'HbA1c',
    value: '6.2%',
    trend: 'up',
    note: '6mo post-partum · pre-diabetic',
    alert: true,
  },
  {
    id: 'lab-2',
    name: 'Edinburgh PND',
    value: '11',
    trend: null,
    note: 'Moderate — 42 CFR Pt 2 gated',
    alert: true,
  },
  {
    id: 'lab-3',
    name: 'Zarit Burden',
    value: '48',
    trend: null,
    note: 'Moderate-high · not formally scored',
    alert: true,
  },
];

// ─── SDOH Intelligence Constants ─────────────────────────────────────────────
const SDOH_BARRIERS = [
  {
    id: 'sdoh-1',
    type: 'Transportation',
    severity: 'HIGH',
    impact: 'HbA1c Lab · Well-Child · Edinburgh',
    blocks: 'All daytime appointments',
    note: '47 miles · no vehicle · no public transit · SD winter road closures',
    color: '#F97316',
  },
  {
    id: 'sdoh-2',
    type: 'Childcare',
    severity: 'HIGH',
    impact: 'All daytime appointments',
    blocks: 'HbA1c Lab (resolves immediately if enrolled)',
    note: 'No coverage · ELIGIBLE_NOT_ENROLLED $487/mo',
    color: '#F97316',
    blocksChain: true,
  },
  {
    id: 'sdoh-3',
    type: 'Caregiver Burden',
    severity: 'MODERATE',
    impact: 'Postpartum neglect · Maria own health',
    blocks: 'Drives postpartum gap',
    note: '18hrs/week · no respite · Zarit 48',
    color: '#F59E0B',
  },
  {
    id: 'sdoh-4',
    type: 'Food Insecurity',
    severity: 'MODERATE',
    impact: 'Pre-diabetic trajectory',
    blocks: 'Metabolic management',
    note: 'SNAP active · WIC lapsed ($320/mo available)',
    color: '#F59E0B',
  },
  {
    id: 'sdoh-5',
    type: 'Digital Divide',
    severity: 'HIGH',
    impact: 'Care access · portal · app',
    blocks: 'SMS only · 3pm–7pm window',
    note: 'No broadband · Martin SD 57551',
    color: '#F97316',
  },
  {
    id: 'sdoh-6',
    type: 'Economic Fragility',
    severity: 'HIGH',
    impact: 'All barriers compound',
    blocks: 'Single income · early shift',
    note: 'Frontier Schools food service',
    color: '#F97316',
  },
];

// ─── Administrative Intelligence Constants ────────────────────────────────────
const AUTH_STATUS = {
  status: 'ACTIVE',
  program: 'Medicaid RHTP Track 3',
  renewalDays: 89,
  system: 'SD Medicaid',
};
const COVERAGE = [
  { person: 'Maria', plan: 'SD Medicaid', id: 'SD_MBR_MARIA_001', note: 'Post-ACA expansion' },
  { person: 'Sophia', plan: 'SD CHIP', id: 'SD_CHIP_SOPHIA_001', note: 'Renewal standard' },
  { person: 'Elena', plan: 'SD Medicaid + Medicare', id: 'Dual', note: 'Caregiver managed' },
];
const CONSENT_LAYERS = [
  {
    layer: 'Layer 1',
    name: 'Platform Entry',
    status: 'ACTIVE',
    streams: 'Streams 1,2,7,8,9',
    color: '#22c55e',
  },
  {
    layer: 'Layer 2',
    name: 'Clinical HIPAA',
    status: 'ACTIVE',
    streams: 'Streams 3,4,5',
    color: '#22c55e',
  },
  {
    layer: 'Layer 3',
    name: 'BH 42 CFR Pt 2',
    status: 'ACTIVE',
    streams: 'Streams 10,14',
    color: '#F59E0B',
    note: 'BH data: CM + BH only',
  },
  {
    layer: 'Layer 4',
    name: 'Elena Caregiver',
    status: 'PENDING',
    streams: 'Elena not yet signed',
    color: '#F59E0B',
    note: 'Household view partial',
  },
];
const BENEFITS = [
  { name: 'SNAP', status: 'ACTIVE', note: 'Renewal T+47d ⚠', color: '#22c55e' },
  { name: 'WIC', status: 'LAPSED', note: '$320/mo unclaimed', color: '#EF4444' },
  { name: 'Childcare CCAP', status: 'NOT ENROLLED', note: '$487/mo unclaimed', color: '#EF4444' },
  { name: 'LIHEAP', status: 'NOT APPLIED', note: 'Winter risk HIGH', color: '#F97316' },
  { name: 'Housing', status: 'WAITLIST', note: '#47 · ~18 months', color: '#F59E0B' },
];
const HEDIS_COMPLIANCE = [
  { measure: 'HEDIS CDC HbA1c', status: 'AT RISK', note: '40d window remaining', color: '#F59E0B' },
  { measure: 'HEDIS Postpartum', status: 'MISSED', note: '427d · window closed', color: '#EF4444' },
  { measure: 'GPRA equivalent', status: 'MONITORING', note: '', color: '#F59E0B' },
];

// ─── Relationship Intelligence Constants ──────────────────────────────────────
const RELATIONSHIPS = [
  {
    id: 'rel-1',
    name: 'Sophia Redhawk',
    type: 'Child — PARENT_OF',
    age: '24 months',
    consent: 'PROXY ACTIVE',
    consentStatus: 'active',
    channel: 'In-person / Maria proxy',
    flags: ['ENT referral pending', 'Well-child overdue'],
    care: 'Prairie Health Pediatric',
    color: '#14B8A6',
  },
  {
    id: 'rel-2',
    name: 'Elena Redhawk',
    type: 'Mother — INFORMAL_CAREGIVER_FOR',
    age: '58',
    consent: 'CAREGIVER SCOPE PENDING',
    consentStatus: 'pending',
    channel: 'SMS via Maria (clinical summary only)',
    flags: ['BH data blocked', 'Financial blocked', 'Advance directives blocked'],
    care: 'DM + Cardiac · Cedar Bluff Regional 47 miles',
    color: '#14B8A6',
  },
  {
    id: 'rel-3',
    name: 'Prairie Health PCP',
    type: 'Primary Care Physician',
    age: null,
    consent: 'CDS Hook (SMART on FHIR)',
    consentStatus: 'active',
    channel: 'CDS Hook · SMART on FHIR',
    flags: ['Last contact: 4 months ago', 'Sophia present in room'],
    care: 'Prairie Health CAH · Bi-annual visit',
    color: '#14B8A6',
  },
  {
    id: 'rel-4',
    name: 'Sarah Johnson',
    type: 'Care Manager',
    age: null,
    consent: 'FULL SCOPE',
    consentStatus: 'active',
    channel: 'Platform tasks + SMS coordination',
    flags: ['4 open interventions'],
    care: 'Medicaid RHTP Track 3',
    color: '#14B8A6',
  },
  {
    id: 'rel-5',
    name: "Elena's CHW",
    type: 'Community Health Worker',
    age: null,
    consent: 'FULL SCOPE',
    consentStatus: 'active',
    channel: 'In-person + platform task entry',
    flags: ['PRAPARE completed', 'Transport coordination active'],
    care: 'Last visit: Day 28 · 412 Prairie Main St Martin SD',
    color: '#14B8A6',
  },
];

// ─── Whole Person Score Constants ─────────────────────────────────────────────
const WHOLE_PERSON_SCORE = 34;
const SCORE_LABEL = 'MODERATE RISK';
const SCORE_NOTE = 'Whole Person Score powered by 52-node Knowledge Graph · Lower = more complex';
const SCORE_COMPONENTS = [
  {
    name: 'Clinical Complexity',
    score: 42,
    color: '#3B82F6',
    note: '2 active episodes · 5 open gaps',
  },
  { name: 'SDOH Burden', score: 18, color: '#F97316', note: '7 confirmed unmet domains' },
  {
    name: 'Administrative Risk',
    score: 58,
    color: '#F59E0B',
    note: 'Consents partial · benefits lapsed',
  },
  {
    name: 'Engagement Score',
    score: 62,
    color: '#14B8A6',
    note: 'SMS responsive · 3pm–7pm window',
  },
];

// ─── Helper Components ────────────────────────────────────────────────────────
function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/40',
    MODERATE: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    LOW: 'bg-green-500/20 text-green-400 border border-green-500/40',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${map[urgency] ?? map['LOW']}`}>
      {urgency}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    HIGH: 'bg-red-500/20 text-red-400 border border-red-500/40',
    MODERATE: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    LOW: 'bg-green-500/20 text-green-400 border border-green-500/40',
  };
  const key = severity.split('-')[0];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${map[key] ?? map['LOW']}`}>
      {severity}
    </span>
  );
}

function EpisodeStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',
    UNMANAGED: 'bg-red-500/20 text-red-400 border border-red-500/40',
    CAREGIVER: 'bg-teal-500/20 text-teal-400 border border-teal-500/40',
  };
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${map[status] ?? 'bg-slate-500/20 text-slate-400'}`}
    >
      {status}
    </span>
  );
}

function ConsentBadge({ status }: { status: string }) {
  if (status === 'active')
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/40">
        ACTIVE
      </span>
    );
  if (status === 'pending')
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
        PENDING
      </span>
    );
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">
      UNKNOWN
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WholePersonIntelligencePage() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const patient = getPatientSync(activeCitizenId);
  const MEMBER_NAME = patient?.name ?? 'Member';
  const MEMBER_ID = patient?.platformId ?? activeCitizenId;
  const MEMBER_AGE_SEX = patient ? `${patient.age}y ${patient.gender}` : '—';
  const MEMBER_LOCATION = patient?.location ?? '—';
  const MEMBER_PROGRAM = patient?.contract ?? '—';

  const [expandedSdoh, setExpandedSdoh] = useState<string | null>(null);

  // P0 scope-guard: this screen is not yet wired to per-member data. For any
  // non-golden member, fail closed with an identity-only notice so Maria's
  // hardcoded clinical/family detail can never leak onto another member.
  const isGoldenMember = activeCitizenId === DEMO_MEMBER_ID;
  if (!isGoldenMember) {
    return (
      <AppLayout
        pageTitle="Whole Person Care Intelligence"
        breadcrumbs={[
          { label: 'CDP & Agentic Automation' },
          { label: 'Whole Person Intelligence' },
        ]}
      >
        <MemberScopeNotice
          name={MEMBER_NAME}
          id={MEMBER_ID}
          ageSex={MEMBER_AGE_SEX}
          location={MEMBER_LOCATION}
          program={MEMBER_PROGRAM}
          view="Whole Person Care Intelligence"
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      pageTitle="Whole Person Care Intelligence"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'Whole Person Intelligence' }]}
    >
      <div className="min-h-screen bg-[#0a0f1e] text-white p-4 space-y-4 font-sans">
        {/* ── Identity Bar ──────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-amber-500/30 bg-[#0f172a] px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Golden ID */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono text-amber-400 font-bold text-sm tracking-widest">
              {MEMBER_ID}
            </span>
          </div>
          {/* Name + demo */}
          <div>
            <span className="text-white font-semibold text-base">{MEMBER_NAME}</span>
            <span className="text-slate-400 text-xs ml-2">
              {MEMBER_AGE_SEX} · {MEMBER_LOCATION}
            </span>
          </div>
          {/* Roles */}
          <div className="flex gap-1.5 flex-wrap">
            {MEMBER_ROLES.map((r) => (
              <span
                key={r}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/40"
              >
                {r}
              </span>
            ))}
          </div>
          {/* Identity state */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/40">
              {IDENTITY_STATE}
            </span>
            <span className="text-slate-400 text-xs">
              {IDENTITY_SOURCES} sources · {CONFIDENCE_SCORE}% confidence
            </span>
          </div>
          {/* Episode / gap / agent counts */}
          <div className="flex gap-4 text-xs">
            <span className="text-blue-400 font-semibold">{ACTIVE_EPISODES_COUNT} Episodes</span>
            <span className="text-red-400 font-semibold">{OPEN_GAPS_COUNT} Open Gaps</span>
            <span className="text-teal-400 font-semibold">{ACTIVE_AGENTS_COUNT} Active Agents</span>
          </div>
          {/* Program */}
          <span className="text-slate-500 text-xs">{MEMBER_PROGRAM}</span>
        </div>

        {/* ── 2×2 Intelligence Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* ── Q1: Clinical Intelligence ──────────────────────────────────── */}
          <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] overflow-hidden">
            <div className="border-l-4 border-blue-500 px-4 py-3 bg-blue-500/5 flex items-center gap-2">
              <Icon name="BeakerIcon" className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 font-bold text-sm tracking-wide uppercase">
                Clinical Intelligence
              </span>
            </div>
            <div className="p-4 space-y-4">
              {/* Active Episodes */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Active Episodes
                </p>
                <div className="space-y-1.5">
                  {ACTIVE_EPISODES.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <EpisodeStatusBadge status={ep.status} />
                        <span className="text-white text-xs font-medium">{ep.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ep.raf && (
                          <span className="text-slate-400 text-[10px] font-mono">RAF {ep.raf}</span>
                        )}
                        {ep.trend === 'up' && <span className="text-red-400 text-xs">↑</span>}
                        <span className="text-slate-500 text-[10px]">{ep.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Care Gaps */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Open Care Gaps
                </p>
                <div className="space-y-1.5">
                  {CARE_GAPS.map((gap) => (
                    <div
                      key={gap.id}
                      className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <UrgencyBadge urgency={gap.urgency} />
                        <span className="text-white text-xs">{gap.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {gap.daysOpen > 0 && (
                          <span
                            className={`font-mono text-[11px] font-bold ${gap.daysOpen > 100 ? 'text-red-400' : gap.urgency === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`}
                          >
                            {gap.daysOpen}d
                          </span>
                        )}
                        <span className="text-slate-500 text-[10px]">{gap.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medications */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Current Medications
                </p>
                <div className="space-y-1.5">
                  {MEDICATIONS.map((med) => (
                    <div
                      key={med.id}
                      className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2"
                    >
                      <div>
                        <span className="text-white text-xs font-medium">{med.name}</span>
                        <span className="text-slate-400 text-[10px] ml-2">
                          For: {med.for} · Pickup: {med.pickup}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {med.adherence && (
                          <span className="text-green-400 text-[10px] font-mono">
                            {med.adherence}% adherence
                          </span>
                        )}
                        {med.flag && (
                          <span className="text-amber-400 text-[10px]">⚠ {med.flag}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Labs */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Recent Labs
                </p>
                <div className="flex flex-wrap gap-2">
                  {LABS.map((lab) => (
                    <div
                      key={lab.id}
                      className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2 flex items-center gap-2"
                    >
                      <span className="text-slate-400 text-[10px]">{lab.name}</span>
                      <span className="text-white font-mono font-bold text-sm">{lab.value}</span>
                      {lab.trend === 'up' && <span className="text-red-400 text-xs">↑</span>}
                      <span className="text-slate-500 text-[10px]">{lab.note}</span>
                      {lab.alert && <span className="text-amber-400 text-[10px]">🔒</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Q2: SDOH Intelligence ──────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] overflow-hidden">
            <div className="border-l-4 border-orange-500 px-4 py-3 bg-orange-500/5 flex items-center gap-2">
              <Icon name="HomeIcon" className="w-4 h-4 text-orange-400" />
              <span className="text-orange-400 font-bold text-sm tracking-wide uppercase">
                Social Determinants Intelligence
              </span>
            </div>
            <div className="p-4 space-y-3">
              {SDOH_BARRIERS.map((barrier) => (
                <div
                  key={barrier.id}
                  className={`rounded-lg border bg-slate-800/40 overflow-hidden cursor-pointer transition-all duration-200 ${
                    expandedSdoh === barrier.id
                      ? 'border-orange-500/50'
                      : 'border-slate-700/40 hover:border-orange-500/30'
                  }`}
                  onClick={() => setExpandedSdoh(expandedSdoh === barrier.id ? null : barrier.id)}
                >
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={barrier.severity} />
                      <span className="text-white text-xs font-semibold">{barrier.type}</span>
                      {barrier.blocksChain && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                          BLOCKS CHAIN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400/70 text-[10px]">→ {barrier.impact}</span>
                      <Icon
                        name={expandedSdoh === barrier.id ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                        className="w-3 h-3 text-slate-500"
                      />
                    </div>
                  </div>
                  {expandedSdoh === barrier.id && (
                    <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40 pt-2">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide w-16 shrink-0">
                          BLOCKS
                        </span>
                        <span className="text-red-400 text-[11px]">{barrier.blocks}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide w-16 shrink-0">
                          NOTE
                        </span>
                        <span className="text-slate-300 text-[11px]">{barrier.note}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* BLOCKS chain callout */}
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5">
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide mb-1">
                  BLOCKS Chain — Critical Path
                </p>
                <div className="flex items-center gap-1 flex-wrap text-[10px]">
                  <span className="text-amber-400 font-mono">
                    Childcare Subsidy (ELIGIBLE_NOT_ENROLLED)
                  </span>
                  <span className="text-slate-500">→ resolves</span>
                  <span className="text-orange-400">ChildcareBarrier</span>
                  <span className="text-slate-500">→ unblocks</span>
                  <span className="text-red-400">HbA1c CareGap</span>
                  <span className="text-slate-500">→ HEDIS at risk ·</span>
                  <span className="text-green-400 font-bold">$8,100 value</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Q3: Administrative Intelligence ───────────────────────────── */}
          <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] overflow-hidden">
            <div className="border-l-4 border-amber-500 px-4 py-3 bg-amber-500/5 flex items-center gap-2">
              <Icon name="ShieldCheckIcon" className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-bold text-sm tracking-wide uppercase">
                Administrative Intelligence
              </span>
            </div>
            <div className="p-4 space-y-4">
              {/* Authorization */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Authorization Status
                </p>
                <div className="bg-slate-800/40 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/40 mr-2">
                      {AUTH_STATUS.status}
                    </span>
                    <span className="text-white text-xs">{AUTH_STATUS.program}</span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono text-sm font-bold ${AUTH_STATUS.renewalDays < 30 ? 'text-red-400' : AUTH_STATUS.renewalDays < 60 ? 'text-amber-400' : 'text-green-400'}`}
                    >
                      T+{AUTH_STATUS.renewalDays}d
                    </span>
                    <p className="text-slate-500 text-[10px]">renewal · {AUTH_STATUS.system}</p>
                  </div>
                </div>
              </div>

              {/* Coverage */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Coverage
                </p>
                <div className="space-y-1.5">
                  {COVERAGE.map((c) => (
                    <div
                      key={c.person}
                      className="bg-slate-800/40 rounded-lg px-3 py-2 flex items-center justify-between"
                    >
                      <span className="text-white text-xs font-medium w-14">{c.person}</span>
                      <span className="text-amber-300 text-xs">{c.plan}</span>
                      <span className="text-slate-500 text-[10px] font-mono">{c.id}</span>
                      <span className="text-slate-400 text-[10px]">{c.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consent Scope */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Consent Scope
                </p>
                <div className="space-y-1.5">
                  {CONSENT_LAYERS.map((cl) => (
                    <div
                      key={cl.layer}
                      className="bg-slate-800/40 rounded-lg px-3 py-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px] w-14">{cl.layer}</span>
                        <span className="text-white text-xs">{cl.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cl.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'}`}
                        >
                          {cl.status}
                        </span>
                        <span className="text-slate-500 text-[10px]">{cl.streams}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  Benefit Compliance
                </p>
                <div className="flex flex-wrap gap-2">
                  {BENEFITS.map((b) => (
                    <div
                      key={b.name}
                      className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5"
                    >
                      <p className="text-white text-[11px] font-semibold">{b.name}</p>
                      <p className="text-[10px]" style={{ color: b.color }}>
                        {b.status}
                      </p>
                      <p className="text-slate-500 text-[10px]">{b.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* HEDIS Compliance */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                  HEDIS / Compliance
                </p>
                <div className="space-y-1.5">
                  {HEDIS_COMPLIANCE.map((h) => (
                    <div
                      key={h.measure}
                      className="bg-slate-800/40 rounded-lg px-3 py-2 flex items-center justify-between"
                    >
                      <span className="text-white text-xs">{h.measure}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border`}
                          style={{
                            color: h.color,
                            borderColor: h.color + '40',
                            backgroundColor: h.color + '20',
                          }}
                        >
                          {h.status}
                        </span>
                        {h.note && <span className="text-slate-500 text-[10px]">{h.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Q4: Relationship Intelligence ─────────────────────────────── */}
          <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] overflow-hidden">
            <div className="border-l-4 border-teal-500 px-4 py-3 bg-teal-500/5 flex items-center gap-2">
              <Icon name="UserGroupIcon" className="w-4 h-4 text-teal-400" />
              <span className="text-teal-400 font-bold text-sm tracking-wide uppercase">
                Relationship Intelligence
              </span>
            </div>
            <div className="p-4 space-y-3">
              {RELATIONSHIPS.map((rel) => (
                <div
                  key={rel.id}
                  className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-3 hover:border-teal-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white text-xs font-semibold">{rel.name}</p>
                      <p className="text-teal-400/70 text-[10px]">{rel.type}</p>
                      {rel.age && <p className="text-slate-500 text-[10px]">Age: {rel.age}</p>}
                    </div>
                    <ConsentBadge status={rel.consentStatus} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        name="ChatBubbleLeftRightIcon"
                        className="w-3 h-3 text-slate-500 shrink-0"
                      />
                      <span className="text-slate-400 text-[10px]">{rel.channel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon
                        name="BuildingOffice2Icon"
                        className="w-3 h-3 text-slate-500 shrink-0"
                      />
                      <span className="text-slate-400 text-[10px]">{rel.care}</span>
                    </div>
                    {rel.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {rel.flags.map((f) => (
                          <span
                            key={f}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-slate-600/40"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Whole Person Score ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest">
                  Whole Person Score
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-4xl font-bold font-mono text-white">
                    {WHOLE_PERSON_SCORE}
                  </span>
                  <span className="text-slate-500 text-sm">/100</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    {SCORE_LABEL}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-[10px] max-w-xs text-right">{SCORE_NOTE}</p>
            </div>
          </div>

          {/* Composite bar */}
          <div className="space-y-3">
            <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
              {SCORE_COMPONENTS.map((c) => (
                <div
                  key={c.name}
                  className="h-full flex items-center justify-center text-[9px] font-bold text-white/80 transition-all duration-500"
                  style={{ width: `${c.score}%`, backgroundColor: c.color }}
                  title={`${c.name}: ${c.score}/100`}
                >
                  {c.score}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {SCORE_COMPONENTS.map((c) => (
                <div key={c.name} className="flex items-start gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <div>
                    <p className="text-white text-[11px] font-semibold">{c.name}</p>
                    <p className="font-mono text-xs font-bold" style={{ color: c.color }}>
                      {c.score}/100
                    </p>
                    <p className="text-slate-500 text-[10px]">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
