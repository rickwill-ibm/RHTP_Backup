'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useRouter } from 'next/navigation';
import { ACTIVE_CRISES, CRISIS_CONTACTS, SOCIAL_PATIENTS } from '@/lib/socialMockData';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientSync } from '@/lib/services/patientService';

const ACUITY_CONFIG = {
  High: { bg: '#fff1f1', text: '#da1e28', border: '#da1e28' },
  Medium: { bg: '#fdf6dd', text: '#b45309', border: '#f1c21b' },
  Low: { bg: '#defbe6', text: '#0e6027', border: '#24a148' },
};

const TYPE_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  '988': { bg: '#d0e2ff', text: '#0043ce', icon: 'PhoneIcon' },
  CSU: { bg: '#f6f2ff', text: '#6929c4', icon: 'BuildingOffice2Icon' },
  Mobile: { bg: '#d9fbfb', text: '#007d79', icon: 'TruckIcon' },
  ED: { bg: '#fff1f1', text: '#da1e28', icon: 'ExclamationTriangleIcon' },
};

// ─── SDOH Context per Patient ─────────────────────────────────────────────────

interface SDOHContext {
  patientId: string;
  name: string;
  age: number;
  housingStatus: 'Stable' | 'Unstable' | 'Homeless';
  foodSecurity: 'Secure' | 'At Risk' | 'Insecure';
  safetyRisk: 'Low' | 'Moderate' | 'High';
  activeNeeds: string[];
  chwAssigned: string | null;
  cboEnrollments: string[];
  snapStatus: 'Active' | 'Pending' | 'Not Enrolled';
  clinicalComorbidities: string[];
  lastCrisisDate: string | null;
  crisisCount30d: number;
  careManagerNote: string;
}

const SDOH_CONTEXT: Record<string, SDOHContext> = {
  'P-10042': {
    patientId: 'P-10042',
    name: 'Dorothy Simmons',
    age: 75,
    housingStatus: 'Unstable',
    foodSecurity: 'Insecure',
    safetyRisk: 'Moderate',
    activeNeeds: ['Food Insecurity', 'Housing Instability', 'Transportation'],
    chwAssigned: 'Angela Torres (CHW)',
    cboEnrollments: ['SD DSS Bennett County (SNAP)', 'SD Housing Development Authority'],
    snapStatus: 'Active',
    clinicalComorbidities: ['COPD', 'Anxiety', 'T2DM'],
    lastCrisisDate: '2026-04-15',
    crisisCount30d: 1,
    careManagerNote:
      'SNAP enrolled. Housing referral in progress. BH engagement ongoing — Avera Sacred Heart BH, Winner SD.',
  },
  'P-10043': {
    patientId: 'P-10043',
    name: 'Margaret Okonkwo',
    age: 78,
    housingStatus: 'Unstable',
    foodSecurity: 'At Risk',
    safetyRisk: 'High',
    activeNeeds: ['Housing', 'Transportation', 'Caregiver Support'],
    chwAssigned: 'Angela Torres (CHW)',
    cboEnrollments: ['SD Housing Development Authority'],
    snapStatus: 'Not Enrolled',
    clinicalComorbidities: ['CHF', 'CKD Stage 3', 'Major Depression'],
    lastCrisisDate: '2026-05-10',
    crisisCount30d: 2,
    careManagerNote:
      'High-risk patient. CHF + depression comorbidity. SNF discharge pending. 89 miles to Avera Sacred Heart, Winner SD.',
  },
  'P-10044': {
    patientId: 'P-10044',
    name: 'Linda Castillo',
    age: 69,
    housingStatus: 'Stable',
    foodSecurity: 'Insecure',
    safetyRisk: 'Moderate',
    activeNeeds: ['Food Insecurity', 'Utilities'],
    chwAssigned: 'James Okafor (CHW)',
    cboEnrollments: ['Community Action Partnership of the Black Hills (LIHEAP)'],
    snapStatus: 'Pending',
    clinicalComorbidities: ['T2DM', 'Hypertension', 'SUD — Alcohol'],
    lastCrisisDate: null,
    crisisCount30d: 0,
    careManagerNote:
      'SUD treatment initiated at Fall River Health Services. SNAP application pending at SD DSS Bennett County. A1C recheck due.',
  },
};

function SDOHContextPanel({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const ctx = SDOH_CONTEXT[patientId] ?? SDOH_CONTEXT['P-10042'];
  const housingStyle =
    ctx.housingStatus === 'Stable'
      ? 'bg-[#defbe6] text-[#0e6027]'
      : ctx.housingStatus === 'Unstable'
        ? 'bg-[#fdf6dd] text-[#b45309]'
        : 'bg-[#fff1f1] text-[#da1e28]';
  const foodStyle =
    ctx.foodSecurity === 'Secure'
      ? 'bg-[#defbe6] text-[#0e6027]'
      : ctx.foodSecurity === 'At Risk'
        ? 'bg-[#fdf6dd] text-[#b45309]'
        : 'bg-[#fff1f1] text-[#da1e28]';
  const safetyStyle =
    ctx.safetyRisk === 'Low'
      ? 'bg-[#defbe6] text-[#0e6027]'
      : ctx.safetyRisk === 'Moderate'
        ? 'bg-[#fdf6dd] text-[#b45309]'
        : 'bg-[#fff1f1] text-[#da1e28]';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="pointer-events-auto w-[440px] h-full bg-white border-l border-carbon-gray-20 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between bg-[#fdf6dd]">
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">
              SDOH Context — Crisis Dispatch
            </p>
            <p className="text-xs text-[#b45309]">
              {ctx.name} · {ctx.patientId} · Age {ctx.age}
            </p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-70 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* SDOH Risk Summary */}
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              SDOH Risk Factors
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className={`px-3 py-2 text-center ${housingStyle}`}>
                <Icon name="HomeIcon" size={14} className="mx-auto mb-1" />
                <p className="text-2xs font-bold">{ctx.housingStatus}</p>
                <p className="text-2xs opacity-70">Housing</p>
              </div>
              <div className={`px-3 py-2 text-center ${foodStyle}`}>
                <Icon name="ShoppingCartIcon" size={14} className="mx-auto mb-1" />
                <p className="text-2xs font-bold">{ctx.foodSecurity}</p>
                <p className="text-2xs opacity-70">Food Security</p>
              </div>
              <div className={`px-3 py-2 text-center ${safetyStyle}`}>
                <Icon name="ShieldExclamationIcon" size={14} className="mx-auto mb-1" />
                <p className="text-2xs font-bold">{ctx.safetyRisk}</p>
                <p className="text-2xs opacity-70">Safety Risk</p>
              </div>
            </div>
          </div>

          {/* Active Social Needs */}
          {ctx.activeNeeds.length > 0 && (
            <div>
              <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
                Active Social Needs
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ctx.activeNeeds.map((n, i) => (
                  <span
                    key={i}
                    className="text-2xs px-2 py-0.5 bg-[#fdf6dd] border border-[#f1c21b] text-[#b45309] font-medium"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Clinical Comorbidities */}
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Clinical Comorbidities
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ctx.clinicalComorbidities.map((c, i) => (
                <span
                  key={i}
                  className="text-2xs px-2 py-0.5 bg-[#d0e2ff] border border-[#97c1ff] text-[#0043ce] font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* CHW & CBO */}
          <div className="bg-[#d9fbfb] border border-[#009d9a] p-3">
            <p className="text-2xs font-semibold text-[#004144] uppercase tracking-wide mb-2">
              Care Coordination
            </p>
            <div className="space-y-1.5 text-2xs">
              {ctx.chwAssigned && (
                <div className="flex items-center gap-2">
                  <Icon name="UserCircleIcon" size={12} className="text-[#007d79]" />
                  <span className="text-carbon-gray-70">
                    CHW Assigned:{' '}
                    <span className="font-semibold text-carbon-gray-100">{ctx.chwAssigned}</span>
                  </span>
                </div>
              )}
              {ctx.cboEnrollments.map((cbo, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Icon name="BuildingOffice2Icon" size={12} className="text-[#007d79]" />
                  <span className="text-carbon-gray-70">
                    CBO: <span className="font-semibold text-carbon-gray-100">{cbo}</span>
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Icon name="ShoppingCartIcon" size={12} className="text-[#007d79]" />
                <span className="text-carbon-gray-70">
                  SNAP:{' '}
                  <span
                    className={`font-semibold ${ctx.snapStatus === 'Active' ? 'text-[#0e6027]' : ctx.snapStatus === 'Pending' ? 'text-[#b45309]' : 'text-carbon-gray-50'}`}
                  >
                    {ctx.snapStatus}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Crisis History */}
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Crisis History
            </p>
            <div className="grid grid-cols-2 gap-2 text-2xs">
              <div className="bg-carbon-gray-10 p-2">
                <span className="text-carbon-gray-50">Crises (30d)</span>
                <p
                  className={`font-mono font-bold text-lg ${ctx.crisisCount30d >= 2 ? 'text-[#da1e28]' : ctx.crisisCount30d === 1 ? 'text-[#b45309]' : 'text-[#0e6027]'}`}
                >
                  {ctx.crisisCount30d}
                </p>
              </div>
              <div className="bg-carbon-gray-10 p-2">
                <span className="text-carbon-gray-50">Last Crisis</span>
                <p className="font-mono font-semibold text-carbon-gray-100">
                  {ctx.lastCrisisDate ?? 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Care Manager Note */}
          <div className="bg-[#edf5ff] border border-[#97c1ff] p-3">
            <div className="flex items-start gap-2">
              <Icon
                name="ChatBubbleLeftEllipsisIcon"
                size={13}
                className="text-[#0043ce] flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-2xs font-semibold text-[#0043ce] mb-1">Care Manager Note</p>
                <p className="text-2xs text-carbon-gray-70 leading-relaxed">
                  {ctx.careManagerNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-carbon-gray-20 px-5 py-4">
          <p className="text-2xs text-carbon-gray-50 mb-2">
            Use SDOH context to inform dispatch decision and post-crisis care plan.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-[#b45309] text-white text-xs font-semibold py-2 hover:bg-[#92400e] transition-colors"
          >
            Close — Return to Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post-Crisis Care Plan Linkage ────────────────────────────────────────────

interface CarePlanLink {
  patientId: string;
  patientName: string;
  crisisDate: string;
  bhTask: string;
  bhTaskStatus: 'Created' | 'In Progress' | 'Completed';
  cmWorklist: 'Linked' | 'Pending' | 'Not Linked';
  followUpDate: string;
  assignedCM: string;
  nextStep: string;
}

const CARE_PLAN_LINKS: CarePlanLink[] = [
  {
    patientId: 'P-10042',
    patientName: 'Dorothy Simmons',
    crisisDate: '2026-05-15',
    bhTask: 'BH Follow-up — 7-day post-crisis (FUH)',
    bhTaskStatus: 'Completed',
    cmWorklist: 'Linked',
    followUpDate: '2026-05-22',
    assignedCM: 'Sarah Johnson',
    nextStep: 'Quarterly BH check-in scheduled for 6/15 — Avera Sacred Heart BH, Winner SD',
  },
  {
    patientId: 'P-10043',
    patientName: 'Margaret Okonkwo',
    crisisDate: '2026-05-10',
    bhTask: 'BH Follow-up — 7-day post-crisis (FUH)',
    bhTaskStatus: 'In Progress',
    cmWorklist: 'Linked',
    followUpDate: '2026-05-17',
    assignedCM: 'Sarah Johnson',
    nextStep: 'SNF discharge + BH handoff coordination pending — 89 miles to Winner SD',
  },
];

const PATHWAY_STAGES = [
  {
    id: 'stage-1',
    phase: 'Social Screening',
    date: 'Jan 14, 2026',
    icon: 'ClipboardDocumentCheckIcon',
    color: '#b45309',
    bg: '#fdf6dd',
    border: '#f1c21b',
    status: 'completed',
    title: 'PRAPARE Screening — Food Insecurity Identified',
    metrics: [
      { label: 'PRAPARE Score', value: '8/10', flag: 'high' },
      { label: 'Food Insecurity', value: 'Positive', flag: 'high' },
      { label: 'Housing Stability', value: 'At Risk', flag: 'medium' },
    ],
    detail:
      'Dorothy Simmons screened positive for food insecurity and housing instability. A1C at 9.2% — uncontrolled diabetes linked to dietary gaps. Screened at Bennett County Health, Martin SD 57551.',
    outcome: 'Referred to SNAP enrollment + BH intake',
  },
  {
    id: 'stage-2',
    phase: 'CBO Enrollment',
    date: 'Jan 21, 2026',
    icon: 'BuildingOffice2Icon',
    color: '#0043ce',
    bg: '#d0e2ff',
    border: '#0043ce',
    status: 'completed',
    title: 'SNAP Enrollment — SD DSS Bennett County',
    metrics: [
      { label: 'SNAP Status', value: 'Enrolled', flag: 'good' },
      { label: 'Monthly Benefit', value: '$234/mo', flag: 'good' },
      { label: 'CBO Partner', value: 'Bennett County Action CBO', flag: 'neutral' },
    ],
    detail:
      'CHW Angela Torres assisted with SNAP application at SD DSS Bennett County Office, 102 N Van Buren St, Martin SD 57551. Enrollment completed within 7 days of referral.',
    outcome: 'SNAP active · SD DSS Bennett County',
  },
  {
    id: 'stage-3',
    phase: 'CHW Visit',
    date: 'Feb 3 – Apr 28, 2026',
    icon: 'HomeIcon',
    color: '#007d79',
    bg: '#d9fbfb',
    border: '#007d79',
    status: 'completed',
    title: '12-Week BH Engagement + Home Visits',
    metrics: [
      { label: 'Home Visits', value: '8 of 8', flag: 'good' },
      { label: 'BH Sessions', value: '12 completed', flag: 'good' },
      { label: 'Medication Adherence', value: '94%', flag: 'good' },
    ],
    detail:
      'CHW conducted 8 home visits over 12 weeks. BH counselor at Avera Sacred Heart CAH (Winner, SD 57580) completed 12 sessions addressing depression and diabetes self-management. Medication adherence improved from 61% to 94%.',
    outcome: 'Full 12-week BH engagement completed',
  },
  {
    id: 'stage-4',
    phase: 'Clinical Improvement',
    date: 'May 6, 2026',
    icon: 'ArrowTrendingDownIcon',
    color: '#198038',
    bg: '#defbe6',
    border: '#24a148',
    status: 'active',
    title: 'A1C Improvement — 9.2% → 7.1%',
    metrics: [
      { label: 'A1C (Baseline)', value: '9.2%', flag: 'high' },
      { label: 'A1C (Current)', value: '7.1%', flag: 'good' },
      { label: 'Reduction', value: '−2.1 pts', flag: 'good' },
    ],
    detail:
      'A1C dropped from 9.2% to 7.1% over 16 weeks — attributed to SNAP enrollment (dietary improvement), BH engagement (depression treatment), and medication adherence. Patient no longer meets criteria for uncontrolled diabetes.',
    outcome: 'A1C controlled · BH follow-up quarterly',
  },
];

export default function CrisisPathwayPage() {
  const router = useRouter();
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const activePatient = getPatientSync(activePatientId);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<(typeof CRISIS_CONTACTS)[0] | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>('stage-4');
  const [sdohPatient, setSdohPatient] = useState<string | null>(null);
  const [dispatchPatientId, setDispatchPatientId] = useState<string>('P-10042');

  const activeCrisis = ACTIVE_CRISES.find((c) => c.status === 'dispatched');

  return (
    <AppLayout
      pageTitle="Crisis Pathway — BH"
      breadcrumbs={[
        { label: 'Care Management', href: '/care-manager' },
        { label: 'Crisis Pathway' },
      ]}
      contextBanner={
        <div className="bg-[#fff1f1] border-b border-[#da1e28] px-6 py-2 flex items-center gap-4">
          <Icon name="ExclamationTriangleIcon" size={16} style={{ color: '#da1e28' }} />
          <span className="text-xs font-semibold text-[#da1e28]">
            1 Active Crisis — {activeCrisis?.patient} ({activeCrisis?.patientId}) · High Acuity ·
            Crisis team dispatched
          </span>
          <span className="ml-auto text-xs text-[#da1e28]">Last updated: 2026-06-02 09:22</span>
        </div>
      }
    >
      {/* Active Patient Identity Banner */}
      {activePatient && (
        <div className="bg-[#001141] border-b border-[#003a75] px-6 py-2.5 flex items-center gap-4 flex-wrap">
          <div className="w-7 h-7 bg-[#007d79] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xs font-bold">
              {activePatient.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </span>
          </div>
          <button
            onClick={() => router.push('/patient-detail')}
            className="text-xs font-semibold text-[#78a9ff] hover:text-white transition-colors flex items-center gap-1"
          >
            {activePatient.name}
            <Icon name="ArrowTopRightOnSquareIcon" size={11} className="opacity-70" />
          </button>
          <span className="text-2xs font-mono text-[#a8c8e8]">{activePatient.ehrMrn}</span>
          <span className="text-2xs text-[#a8c8e8]">
            {activePatient.age}y {activePatient.gender}
          </span>
          <span
            className="text-2xs font-semibold px-2 py-0.5 border"
            style={{
              background: '#fff1f1',
              color: '#da1e28',
              borderColor: '#da1e28',
            }}
          >
            {activePatient.bhRisk} BH Risk
          </span>
          <span className="text-2xs text-[#a8c8e8] ml-auto">
            {activePatient.openCareGaps} open gaps
          </span>
        </div>
      )}
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'Active Crises',
            value: String(ACTIVE_CRISES.filter((c) => c.status === 'dispatched').length),
            sub: 'High acuity — dispatched',
            color: '#da1e28',
            icon: 'ExclamationTriangleIcon',
          },
          {
            label: 'ED Diversions (30d)',
            value: '4',
            sub: 'Routed to CSU or mobile',
            color: '#0043ce',
            icon: 'ArrowUturnLeftIcon',
          },
          {
            label: '988 Connections (30d)',
            value: '7',
            sub: 'Avg response: 8 min',
            color: '#6929c4',
            icon: 'PhoneIcon',
          },
          {
            label: 'BH Tasks Created',
            value: '12',
            sub: 'Post-crisis follow-up',
            color: '#198038',
            icon: 'ClipboardDocumentListIcon',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0">
              <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="font-mono text-xl font-bold leading-tight" style={{ color: kpi.color }}>
                {kpi.value}
              </p>
              <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
              <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Patient Pathway Panel ─────────────────────────────────────────── */}
      <div className="bg-white border border-carbon-gray-20 mb-4">
        {/* Header */}
        <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-[#defbe6]">
              <Icon name="ArrowTrendingDownIcon" size={16} style={{ color: '#198038' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">
                Patient Pathway — Social → Clinical Improvement
              </p>
              <p className="text-2xs text-carbon-gray-50">
                {activePatient?.name ?? 'Patient'} · {activePatient?.platformId ?? '—'} ·{' '}
                {activePatient?.ehrMrn ?? '—'} · Age {activePatient?.age ?? '—'} ·{' '}
                {activePatient?.contract ?? 'Medicaid RHTP Track 3'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-2xs font-bold bg-[#defbe6] text-[#0e6027]">
              A1C Controlled
            </span>
            <span className="px-2 py-0.5 text-2xs font-bold bg-[#d0e2ff] text-[#0043ce]">
              SNAP Active
            </span>
            <span className="px-2 py-0.5 text-2xs font-bold bg-[#d9fbfb] text-[#007d79]">
              BH Engaged
            </span>
          </div>
        </div>

        {/* Pathway connector row */}
        <div className="px-4 pt-4 pb-2">
          {/* Stage cards with connector arrows */}
          <div className="flex items-stretch gap-0 overflow-x-auto">
            {PATHWAY_STAGES.map((stage, idx) => (
              <React.Fragment key={stage.id}>
                {/* Stage card */}
                <div
                  className="flex-1 min-w-[180px] cursor-pointer transition-all"
                  style={{ borderTop: `3px solid ${stage.border}` }}
                  onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                >
                  <div
                    className="p-3 h-full"
                    style={{ backgroundColor: expandedStage === stage.id ? stage.bg : '#fafafa' }}
                  >
                    {/* Phase label */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <div
                        className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: stage.bg }}
                      >
                        <Icon name={stage.icon as any} size={13} style={{ color: stage.color }} />
                      </div>
                      <span
                        className="text-2xs font-bold uppercase tracking-wide"
                        style={{ color: stage.color }}
                      >
                        {stage.phase}
                      </span>
                      {stage.status === 'completed' && (
                        <Icon name="CheckCircleIcon" size={13} style={{ color: '#198038' }} />
                      )}
                      {stage.status === 'active' && (
                        <span className="w-2 h-2 rounded-full bg-[#24a148] animate-pulse" />
                      )}
                    </div>
                    <p className="text-2xs font-semibold text-carbon-gray-100 leading-snug mb-1">
                      {stage.title}
                    </p>
                    <p className="text-2xs text-carbon-gray-50 font-mono">{stage.date}</p>

                    {/* Metrics chips */}
                    <div className="mt-2 space-y-1">
                      {stage.metrics.map((m) => (
                        <div key={m.label} className="flex items-center justify-between gap-1">
                          <span className="text-2xs text-carbon-gray-70 truncate">{m.label}</span>
                          <span
                            className="text-2xs font-bold font-mono px-1.5 py-0.5 flex-shrink-0"
                            style={{
                              backgroundColor:
                                m.flag === 'high'
                                  ? '#fff1f1'
                                  : m.flag === 'good'
                                    ? '#defbe6'
                                    : m.flag === 'medium'
                                      ? '#fdf6dd'
                                      : '#f4f4f4',
                              color:
                                m.flag === 'high'
                                  ? '#da1e28'
                                  : m.flag === 'good'
                                    ? '#0e6027'
                                    : m.flag === 'medium'
                                      ? '#b45309'
                                      : '#525252',
                            }}
                          >
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Arrow connector between stages */}
                {idx < PATHWAY_STAGES.length - 1 && (
                  <div className="flex items-center justify-center w-8 flex-shrink-0 self-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-5 h-px bg-carbon-gray-30" />
                      <Icon name="ChevronRightIcon" size={14} style={{ color: '#8d8d8d' }} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Expanded detail panel */}
          {expandedStage &&
            (() => {
              const stage = PATHWAY_STAGES.find((s) => s.id === expandedStage);
              if (!stage) return null;
              return (
                <div
                  className="mt-3 p-3 border-t-2"
                  style={{ borderColor: stage.border, backgroundColor: stage.bg }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-xs font-semibold text-carbon-gray-100 mb-1">
                        {stage.title}
                      </p>
                      <p className="text-xs text-carbon-gray-70 leading-relaxed">{stage.detail}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                        Outcome
                      </p>
                      <div
                        className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                        style={{ backgroundColor: stage.color, color: '#fff' }}
                      >
                        <Icon name="CheckCircleIcon" size={13} />
                        {stage.outcome}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Pathway summary footer */}
        <div className="px-4 py-3 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon name="CalendarIcon" size={13} style={{ color: '#525252' }} />
            <span className="text-2xs text-carbon-gray-70">
              Pathway duration: <span className="font-semibold text-carbon-gray-100">16 weeks</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="UserGroupIcon" size={13} style={{ color: '#525252' }} />
            <span className="text-2xs text-carbon-gray-70">
              Care team:{' '}
              <span className="font-semibold text-carbon-gray-100">
                CHW Maria Gonzalez · LCSW Denise Park · Dr. Whitfield
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="CurrencyDollarIcon" size={13} style={{ color: '#525252' }} />
            <span className="text-2xs text-carbon-gray-70">
              Est. cost avoidance:{' '}
              <span className="font-semibold text-[#198038]">$4,200 (avoided 2 ED visits)</span>
            </span>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => router.push('/care-manager')}
              className="px-3 py-1.5 text-2xs font-semibold border border-[#0043ce] text-[#0043ce] hover:bg-[#d0e2ff] transition-colors flex items-center gap-1.5"
            >
              <Icon name="ArrowTopRightOnSquareIcon" size={12} />
              View Full Patient Record
            </button>
          </div>
        </div>
      </div>
      {/* ── End Patient Pathway Panel ─────────────────────────────────────── */}

      {/* ── Post-Crisis Care Plan Linkage ─────────────────────────────────── */}
      <div className="bg-white border border-carbon-gray-20 mb-4">
        <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="LinkIcon" size={16} className="text-[#6929c4]" />
            <p className="text-sm font-semibold text-carbon-gray-100">
              Post-Crisis Care Plan Linkage
            </p>
            <span className="text-2xs text-carbon-gray-50">
              — BH tasks linked back to care manager worklist
            </span>
          </div>
          <button
            onClick={() => router.push('/care-manager')}
            className="text-xs font-semibold text-[#0043ce] hover:underline flex items-center gap-1"
          >
            View Worklist <Icon name="ArrowRightIcon" size={12} />
          </button>
        </div>
        <div className="divide-y divide-carbon-gray-10">
          {CARE_PLAN_LINKS.map((link) => {
            const taskStyle =
              link.bhTaskStatus === 'Completed'
                ? 'bg-[#defbe6] text-[#0e6027]'
                : link.bhTaskStatus === 'In Progress'
                  ? 'bg-[#fdf6dd] text-[#b45309]'
                  : 'bg-[#d0e2ff] text-[#0043ce]';
            const cmStyle =
              link.cmWorklist === 'Linked'
                ? 'bg-[#defbe6] text-[#0e6027]'
                : link.cmWorklist === 'Pending'
                  ? 'bg-[#fdf6dd] text-[#b45309]'
                  : 'bg-carbon-gray-10 text-carbon-gray-50';
            return (
              <div key={link.patientId} className="p-4 flex items-start gap-4">
                <div className="w-8 h-8 flex items-center justify-center bg-[#f6f2ff] flex-shrink-0">
                  <Icon name="LinkIcon" size={16} className="text-[#6929c4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <p className="text-xs font-semibold text-carbon-gray-100">{link.patientName}</p>
                    <span className="font-mono text-2xs text-carbon-gray-50">{link.patientId}</span>
                    <span className="text-2xs text-carbon-gray-50">Crisis: {link.crisisDate}</span>
                  </div>
                  <p className="text-xs text-carbon-gray-70 mb-1.5">{link.bhTask}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-2xs font-bold px-1.5 py-0.5 ${taskStyle}`}>
                      BH Task: {link.bhTaskStatus}
                    </span>
                    <span className={`text-2xs font-bold px-1.5 py-0.5 ${cmStyle}`}>
                      CM Worklist: {link.cmWorklist}
                    </span>
                    <span className="text-2xs text-carbon-gray-50">CM: {link.assignedCM}</span>
                    <span className="text-2xs text-carbon-gray-50">
                      Follow-up: {link.followUpDate}
                    </span>
                  </div>
                  <p className="text-2xs text-carbon-gray-50 mt-1.5 flex items-center gap-1">
                    <Icon name="ArrowRightIcon" size={10} />
                    {link.nextStep}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/care-manager')}
                  className="px-3 py-1.5 text-2xs font-semibold border border-[#6929c4] text-[#6929c4] hover:bg-[#f6f2ff] transition-colors flex-shrink-0"
                >
                  Open in Worklist
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {/* ── End Post-Crisis Care Plan Linkage ─────────────────────────────── */}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Crisis Dispatch Panel */}
        <div className="xl:col-span-2 space-y-4">
          {/* Active Crises */}
          <div className="bg-white border border-carbon-gray-20">
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
              <p className="text-sm font-semibold text-carbon-gray-100">Active Crisis Events</p>
              <button
                onClick={() => setShowDispatchModal(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#da1e28] text-white hover:bg-[#b81922] transition-colors flex items-center gap-1.5"
              >
                <Icon name="ExclamationTriangleIcon" size={13} />
                New Crisis Event
              </button>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {ACTIVE_CRISES.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#defbe6] flex items-center justify-center mb-3">
                    <Icon name="CheckCircleIcon" size={22} className="text-[#24a148]" />
                  </div>
                  <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
                    No Active Crisis Events
                  </p>
                  <p className="text-xs text-carbon-gray-50">
                    All patients are stable. Use the button above to log a new crisis event.
                  </p>
                </div>
              )}
              {ACTIVE_CRISES.map((cr) => {
                const acuity = ACUITY_CONFIG[cr.acuity];
                return (
                  <div
                    key={cr.id}
                    className="p-4"
                    style={{ borderLeft: `4px solid ${acuity.border}` }}
                  >
                    <div className="flex items-start gap-3 flex-wrap mb-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-carbon-gray-100">{cr.patient}</p>
                        <p className="text-2xs font-mono text-carbon-gray-50">
                          {cr.patientId} · {cr.mrn} · Age {cr.age}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 text-2xs font-bold"
                          style={{ backgroundColor: acuity.bg, color: acuity.text }}
                        >
                          {cr.acuity} Acuity
                        </span>
                        <span
                          className={`px-2 py-0.5 text-2xs font-bold ${cr.status === 'dispatched' ? 'bg-[#fdf6dd] text-[#b45309]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {cr.status === 'dispatched' ? 'Dispatched' : 'Stabilized'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-carbon-gray-70 mb-1.5">{cr.trigger}</p>
                    <div className="flex items-center gap-4 text-2xs text-carbon-gray-50 mb-2">
                      <span className="flex items-center gap-1">
                        <Icon name="ClockIcon" size={11} />
                        {cr.timestamp}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="UserIcon" size={11} />
                        {cr.assignedTo}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="ArrowRightIcon" size={11} />
                        Dispatched to:{' '}
                        <span className="font-medium text-carbon-gray-70">{cr.dispatchedTo}</span>
                      </span>
                    </div>
                    <p className="text-2xs text-carbon-gray-70 bg-carbon-gray-10 p-2">{cr.notes}</p>
                    {cr.status === 'dispatched' && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button className="px-3 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors">
                          Update Status
                        </button>
                        <button
                          onClick={() => {
                            setSdohPatient(cr.patientId);
                          }}
                          className="px-3 py-1 text-2xs font-semibold border border-[#b45309] text-[#b45309] hover:bg-[#fdf6dd] transition-colors flex items-center gap-1"
                        >
                          <Icon name="HomeIcon" size={11} />
                          SDOH Context
                        </button>
                        <button
                          onClick={() => setTaskCreated(true)}
                          className="px-3 py-1 text-2xs font-semibold border border-[#6929c4] text-[#6929c4] hover:bg-[#f6f2ff] transition-colors"
                        >
                          {taskCreated ? '✓ BH Task Created' : 'Create BH Follow-up Task'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ED Diversion Tracker */}
          <div className="bg-white border border-carbon-gray-20 p-4">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-3">
              ED Diversion — 30-Day Summary
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Routed to CSU', value: '2', pct: '50%', color: '#6929c4' },
                { label: 'Routed to Mobile Team', value: '2', pct: '50%', color: '#007d79' },
                {
                  label: 'ED Visits Avoided',
                  value: '4',
                  pct: 'Est. $12,400 saved',
                  color: '#198038',
                },
              ].map((item) => (
                <div key={item.label} className="bg-carbon-gray-10 p-3 text-center">
                  <p className="font-mono text-2xl font-bold" style={{ color: item.color }}>
                    {item.value}
                  </p>
                  <p className="text-2xs font-semibold text-carbon-gray-100 mt-0.5">{item.label}</p>
                  <p className="text-2xs text-carbon-gray-50">{item.pct}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Crisis Dispatch Panel — right column */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
            Crisis Dispatch Options
          </p>
          {CRISIS_CONTACTS.map((contact) => {
            const cfg = TYPE_CONFIG[contact.type];
            return (
              <div key={contact.id} className="bg-white border border-carbon-gray-20 p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div
                    className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    <Icon name={cfg.icon as any} size={16} style={{ color: cfg.text }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-carbon-gray-100">{contact.name}</p>
                    <span
                      className="text-2xs font-bold px-1.5 py-0.5"
                      style={{ backgroundColor: cfg.bg, color: cfg.text }}
                    >
                      {contact.type}
                    </span>
                  </div>
                  <div
                    className="w-2 h-2 rounded-full bg-[#24a148] flex-shrink-0 mt-1"
                    title="Available"
                  />
                </div>
                <p className="text-2xs text-carbon-gray-70 mb-2">{contact.description}</p>
                <div className="flex items-center justify-between text-2xs">
                  <span className="font-mono font-bold text-carbon-gray-100">{contact.phone}</span>
                  <span className="text-carbon-gray-50">Response: {contact.responseTime}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedContact(contact);
                    setShowDispatchModal(true);
                  }}
                  className="mt-2 w-full py-1.5 text-2xs font-semibold text-white transition-colors"
                  style={{ backgroundColor: cfg.text }}
                >
                  Dispatch / Connect
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg border border-carbon-gray-20 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20 bg-[#fff1f1]">
              <div className="flex items-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} style={{ color: '#da1e28' }} />
                <p className="text-sm font-semibold text-[#da1e28]">Crisis Dispatch</p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Patient
                </label>
                <select
                  value={dispatchPatientId}
                  onChange={(e) => setDispatchPatientId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-carbon-gray-20 bg-carbon-gray-10 focus:outline-none focus:border-[#0043ce]"
                >
                  {SOCIAL_PATIENTS.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      {p.name} — {p.patientId} · {p.mrn}
                    </option>
                  ))}
                </select>
              </div>

              {/* SDOH Quick View in Modal */}
              {SDOH_CONTEXT[dispatchPatientId] && (
                <div className="bg-[#fdf6dd] border border-[#f1c21b] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="HomeIcon" size={13} className="text-[#b45309]" />
                    <p className="text-2xs font-semibold text-[#b45309] uppercase tracking-wide">
                      SDOH Context — {SDOH_CONTEXT[dispatchPatientId].name}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-2xs">
                    <div>
                      <span className="text-carbon-gray-50">Housing</span>
                      <p className="font-semibold text-carbon-gray-100">
                        {SDOH_CONTEXT[dispatchPatientId].housingStatus}
                      </p>
                    </div>
                    <div>
                      <span className="text-carbon-gray-50">Food Security</span>
                      <p className="font-semibold text-carbon-gray-100">
                        {SDOH_CONTEXT[dispatchPatientId].foodSecurity}
                      </p>
                    </div>
                    <div>
                      <span className="text-carbon-gray-50">Safety Risk</span>
                      <p className="font-semibold text-carbon-gray-100">
                        {SDOH_CONTEXT[dispatchPatientId].safetyRisk}
                      </p>
                    </div>
                  </div>
                  {SDOH_CONTEXT[dispatchPatientId].activeNeeds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {SDOH_CONTEXT[dispatchPatientId].activeNeeds.map((n, i) => (
                        <span
                          key={i}
                          className="text-2xs px-1.5 py-0.5 bg-white border border-[#f1c21b] text-[#b45309]"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowDispatchModal(false);
                      setSdohPatient(dispatchPatientId);
                    }}
                    className="mt-2 text-2xs font-semibold text-[#0043ce] hover:underline flex items-center gap-1"
                  >
                    View full SDOH context <Icon name="ArrowRightIcon" size={10} />
                  </button>
                </div>
              )}

              <div>
                <label className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Crisis Type
                </label>
                <select className="w-full mt-1 px-3 py-2 text-xs border border-carbon-gray-20 bg-carbon-gray-10 focus:outline-none focus:border-[#0043ce]">
                  <option>Suicidal ideation — passive</option>
                  <option>Suicidal ideation — with plan</option>
                  <option>Acute psychosis</option>
                  <option>Substance use crisis</option>
                  <option>Acute anxiety / panic</option>
                  <option>Domestic violence</option>
                </select>
              </div>
              <div>
                <label className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Acuity Level
                </label>
                <div className="flex gap-2 mt-1">
                  {['High', 'Medium', 'Low'].map((a) => (
                    <button
                      key={a}
                      className={`flex-1 py-1.5 text-xs font-semibold border transition-colors ${a === 'High' ? 'bg-[#fff1f1] border-[#da1e28] text-[#da1e28]' : 'bg-carbon-gray-10 border-carbon-gray-20 text-carbon-gray-70'}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                  Dispatch To
                </label>
                <p className="text-xs font-semibold text-carbon-gray-100 mt-1">
                  {selectedContact?.name ?? 'Select from dispatch panel'}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowDispatchModal(false);
                    setTaskCreated(true);
                  }}
                  className="flex-1 py-2 text-xs font-semibold bg-[#da1e28] text-white hover:bg-[#b81922] transition-colors"
                >
                  Dispatch + Create BH Task
                </button>
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SDOH Context Drawer */}
      {sdohPatient && (
        <SDOHContextPanel patientId={sdohPatient} onClose={() => setSdohPatient(null)} />
      )}
    </AppLayout>
  );
}
