'use client';
import React, { useState } from 'react';
import { mockPatients, mockCareGaps, mockHCCSuspects } from '@/lib/mockData';
import RiskBadge from '@/components/ui/RiskBadge';
import Icon from '@/components/ui/AppIcon';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

interface MdPatientSummaryProps {
  launchContext: SmartLaunchContext;
}

const CHRONIC_CONDITIONS = [
  {
    code: 'T2DM',
    label: 'Type 2 Diabetes',
    icd: 'E11.65',
    hcc: 'HCC 18',
    acuity: 'critical',
    metric: 'A1C 9.2%',
    trend: 'worsening',
  },
  {
    code: 'CKD',
    label: 'CKD Stage 3b',
    icd: 'N18.32',
    hcc: 'HCC 136',
    acuity: 'critical',
    metric: 'eGFR 42',
    trend: 'worsening',
  },
  {
    code: 'HTN',
    label: 'Hypertension',
    icd: 'I10',
    hcc: 'HCC 85',
    acuity: 'high',
    metric: 'BP 158/96',
    trend: 'stable',
  },
  {
    code: 'HF',
    label: 'Heart Failure (HFpEF)',
    icd: 'I50.30',
    hcc: 'HCC 85',
    acuity: 'high',
    metric: 'EF 55%',
    trend: 'stable',
  },
];

const ACUITY_DOT: Record<string, string> = {
  critical: 'bg-[#da1e28]',
  high: 'bg-[#f1c21b]',
  moderate: 'bg-[#0043ce]',
};

const TREND_ICON: Record<string, { icon: string; color: string }> = {
  worsening: { icon: 'ArrowTrendingDownIcon', color: 'text-[#da1e28]' },
  stable: { icon: 'MinusIcon', color: 'text-[#b45309]' },
  improving: { icon: 'ArrowTrendingUpIcon', color: 'text-[#24a148]' },
};

const JOURNEY_PHASES = [
  { key: 'stable-management', label: 'Stable', color: 'bg-[#24a148]' },
  { key: 'gap-in-care', label: 'Gap', color: 'bg-[#f1c21b]' },
  { key: 'deteriorating', label: 'Deteriorating', color: 'bg-[#ff832b]' },
  { key: 'high-risk-transition', label: 'High-Risk', color: 'bg-[#da1e28]' },
  { key: 'post-acute-recovery', label: 'Post-Acute', color: 'bg-[#0043ce]' },
];

const CDI_OPPORTUNITIES = [
  {
    id: 'cdi-001',
    condition: 'T2DM with CKD Stage 3',
    icd: 'E11.65 + N18.32',
    hcc: 'HCC 18 + HCC 136',
    confidence: 91,
    rafDelta: '+0.42',
    revenueDelta: '$3,200',
    evidenceSources: ['EMR', 'Claims', 'HIE'],
    justification:
      'Claims data and LPR confirm active T2DM with CKD Stage 3b. Last documented encounter 2025-11-14. A1C 9.2% and eGFR 42 support combined coding. Both conditions require separate HCC capture for accurate RAF.',
    signals: [
      { label: 'A1C', value: '9.2% (2026-02-10)', source: 'EMR', flagged: true },
      { label: 'eGFR', value: '42 (2026-03-15)', source: 'EMR', flagged: true },
      { label: 'Claims DX', value: 'E11.65 coded 2025-11-14', source: 'Claims', flagged: false },
      { label: 'HIE Record', value: 'Nephrology note 2025-12-01', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use E11.65 (T2DM with hyperglycemia) + N18.32 (CKD Stage 3b). Do NOT use E11.65 alone — dual coding required for HCC 136 capture.',
  },
  {
    id: 'cdi-002',
    condition: 'Heart Failure — HFpEF',
    icd: 'I50.30',
    hcc: 'HCC 85',
    confidence: 87,
    rafDelta: '+0.28',
    revenueDelta: '$2,100',
    evidenceSources: ['EMR', 'Claims'],
    justification:
      'Echo confirms EF 55% consistent with HFpEF. BNP 210 pg/mL elevated. Prior year claims coded I50.9 (unspecified) — specificity upgrade to I50.30 required for HCC 85 capture.',
    signals: [
      { label: 'Echo EF', value: '55% (2026-01-15)', source: 'EMR', flagged: false },
      { label: 'BNP', value: '210 pg/mL (2026-03-20)', source: 'EMR', flagged: true },
      { label: 'Prior Claim', value: 'I50.9 coded 2025-09-10', source: 'Claims', flagged: false },
    ],
    icd10Guidance:
      'Upgrade from I50.9 to I50.30 (HFpEF, unspecified). Confirm systolic function preserved on echo documentation.',
  },
  {
    id: 'cdi-003',
    condition: 'Atrial Fibrillation',
    icd: 'I48.91',
    hcc: 'HCC 96',
    confidence: 79,
    rafDelta: '+0.19',
    revenueDelta: '$1,450',
    evidenceSources: ['EMR', 'HIE'],
    justification:
      'ECG on 2026-01-20 confirms persistent AFib. Not coded in current encounter. HCC 96 requires annual recapture — last coded 2025-08-12.',
    signals: [
      { label: 'ECG', value: 'Persistent AFib (2026-01-20)', source: 'EMR', flagged: true },
      { label: 'Last Coded', value: 'I48.91 — 2025-08-12', source: 'Claims', flagged: false },
      { label: 'HIE Note', value: 'Cardiology — AFib confirmed', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use I48.91 (unspecified AFib). If paroxysmal confirmed, use I48.0. Annual recapture required — HCC 96 does not carry forward.',
  },
];

const SOURCE_BADGE: Record<string, string> = {
  EMR: 'bg-[#d0e2ff] text-[#0043ce]',
  Claims: 'bg-[#fdf6dd] text-[#b45309]',
  HIE: 'bg-[#defbe6] text-[#0e6027]',
  LPR: 'bg-[#f6f2ff] text-[#6929c4]',
};

export default function MdPatientSummary({ launchContext }: MdPatientSummaryProps) {
  const patient = mockPatients.find((p) => p.id === launchContext.patientId) || mockPatients[0];

  // Filter care gaps to HEDIS and MIPS only (no STARS)
  const careGaps = mockCareGaps
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.status === 'Open' &&
        (g.program === 'HEDIS' || g.program === 'MIPS')
    )
    .slice(0, 5);

  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id).slice(0, 3);

  // State
  const [journeyExpanded, setJourneyExpanded] = useState(false);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [expandedCdi, setExpandedCdi] = useState<string | null>(null);

  const MEDS = [
    { name: 'Lisinopril 10mg', freq: 'QD', adherence: 78, flag: false },
    { name: 'Metformin 500mg', freq: 'BID', adherence: 61, flag: true },
    { name: 'Atorvastatin 400', freq: 'QHS', adherence: 84, flag: false },
    { name: 'Furosemide 200', freq: 'QD', adherence: 72, flag: false },
    { name: 'Potassium Chloride 200', freq: 'QD', adherence: 55, flag: true },
  ];

  const LABS = [
    { name: 'A1C', value: '9.2%', date: '2026-02-10', flag: true },
    { name: 'eGFR', value: '42', date: '2026-03-15', flag: true },
    { name: 'K+', value: '5.1 mEq/L', date: '2026-04-01', flag: true },
    { name: 'LDL', value: '118 mg/dL', date: '2026-02-10', flag: false },
    { name: 'BNP', value: '210 pg/mL', date: '2026-03-20', flag: false },
    { name: 'BP', value: '158/96', date: '2026-04-01', flag: true },
  ];

  const currentPhaseIdx = JOURNEY_PHASES.findIndex((p) => p.key === 'high-risk-transition');

  const totalRafAtRisk = CDI_OPPORTUNITIES.reduce((s, c) => s + parseFloat(c.rafDelta), 0);
  const totalRevenueAtRisk = CDI_OPPORTUNITIES.reduce(
    (s, c) => s + parseInt(c.revenueDelta.replace(/[$,]/g, '')),
    0
  );

  return (
    <div className="space-y-3">
      {/* ── 4-QUADRANT GRID ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* ╔══════════════════════════════╗
            ║  TOP LEFT — Patient Header   ║
            ╚══════════════════════════════╝ */}
        <div className="bg-white border border-carbon-gray-20 flex flex-col">
          {/* Identity row */}
          <div className="px-4 py-3 flex items-start gap-3 border-b border-carbon-gray-20">
            <div className="w-10 h-10 bg-carbon-gray-90 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">
                {patient.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h2 className="text-sm font-semibold text-carbon-gray-100">{patient.name}</h2>
                <RiskBadge tier={patient.riskTier} />
                <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
                  ⚡ Cerner
                </span>
              </div>
              <div className="flex items-center gap-3 text-2xs text-carbon-gray-50 flex-wrap">
                <span>DOB: {patient.dob}</span>
                <span>Age: {patient.age}</span>
                <span>{patient.gender}</span>
                <span className="font-mono">{patient.mrn}</span>
                <span>
                  Enc:{' '}
                  <span className="font-mono text-carbon-gray-70">{launchContext.encounterId}</span>
                </span>
              </div>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                {patient.payer} · ID: <span className="font-mono">{patient.insuranceId}</span>
              </p>
            </div>
          </div>

          {/* KPI strip — High Risk pill LEFT of RAF */}
          <div className="flex items-stretch border-b border-carbon-gray-20">
            {/* High Risk Transition pill — accordion trigger */}
            <button
              onClick={() => setJourneyExpanded(!journeyExpanded)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-[#fff1f1] border-r border-[#ffb3b8] hover:bg-[#ffe0e0] transition-colors flex-shrink-0"
              title="Click to expand journey detail"
            >
              <Icon name="ExclamationTriangleIcon" size={12} className="text-[#da1e28]" />
              <div className="text-left">
                <p className="text-2xs font-bold text-[#da1e28] leading-tight whitespace-nowrap">
                  High-Risk
                </p>
                <p className="text-2xs text-[#da1e28] leading-tight whitespace-nowrap">
                  Transition
                </p>
              </div>
              <Icon
                name={journeyExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                size={10}
                className="text-[#da1e28] ml-0.5"
              />
            </button>

            {/* RAF Score */}
            <div className="px-3 py-2.5 border-r border-carbon-gray-20 text-center min-w-[70px]">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                RAF Score
              </p>
              <p className="text-lg font-bold tabular-nums font-mono text-carbon-gray-100">
                {patient.rafScore.toFixed(2)}
              </p>
              <p className="text-2xs text-[#24a148]">+{patient.rafScoreDelta.toFixed(2)} delta</p>
            </div>

            {/* ER Risk */}
            <div className="px-3 py-2.5 border-r border-carbon-gray-20 text-center min-w-[65px]">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                ER Risk 30d
              </p>
              <p className="text-lg font-bold tabular-nums font-mono text-[#da1e28]">
                {Math.round(patient.predictedErRisk * 100)}%
              </p>
              <p className="text-2xs text-[#da1e28]">2 visits/60d</p>
            </div>

            {/* Care Gaps */}
            <div className="px-3 py-2.5 border-r border-carbon-gray-20 text-center min-w-[65px]">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Care Gaps
              </p>
              <p className="text-lg font-bold tabular-nums font-mono text-[#0043ce]">
                {patient.openCareGaps}
              </p>
              <p className="text-2xs text-[#da1e28]">2 overdue</p>
            </div>

            {/* HCC Suspects */}
            <div className="px-3 py-2.5 text-center min-w-[65px]">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                HCC Suspects
              </p>
              <p className="text-lg font-bold tabular-nums font-mono text-[#b45309]">
                {patient.openHCCSuspects}
              </p>
              <p className="text-2xs text-[#b45309]">
                ${(patient.hccSuspectValue / 1000).toFixed(1)}K risk
              </p>
            </div>
          </div>

          {/* Journey accordion — expands inline */}
          {journeyExpanded && (
            <div className="border-b border-carbon-gray-20 bg-[#fff8f8] px-4 py-3">
              {/* Compact phase strip */}
              <div className="flex items-center gap-0 mb-3">
                {JOURNEY_PHASES.map((phase, idx) => {
                  const isActive = phase.key === 'high-risk-transition';
                  const isPast = idx < currentPhaseIdx;
                  return (
                    <React.Fragment key={phase.key}>
                      <div
                        className={`flex flex-col items-center ${isActive ? 'opacity-100' : isPast ? 'opacity-50' : 'opacity-25'}`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${isActive ? phase.color : isPast ? 'bg-carbon-gray-40' : 'bg-carbon-gray-20'}`}
                        />
                        <span
                          className={`text-2xs mt-1 whitespace-nowrap font-medium ${isActive ? 'text-[#da1e28]' : 'text-carbon-gray-50'}`}
                        >
                          {phase.label}
                        </span>
                      </div>
                      {idx < JOURNEY_PHASES.length - 1 && (
                        <div
                          className={`flex-1 h-px mx-1 ${idx < currentPhaseIdx ? 'bg-carbon-gray-40' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Phase detail */}
              <div className="bg-[#fff1f1] border border-[#ffb3b8] px-3 py-2 mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#da1e28] mb-0.5">
                      High-Risk Transition · 47 days in phase
                    </p>
                    <p className="text-2xs text-carbon-gray-70 leading-relaxed">
                      Recent ER utilization, deteriorating chronic condition control, and multiple
                      open care gaps indicate elevated near-term risk.
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xs text-carbon-gray-50">Urgency</p>
                    <p className="text-xl font-bold font-mono text-[#da1e28]">82</p>
                    <p className="text-2xs text-carbon-gray-50">/100</p>
                  </div>
                </div>
                <p className="text-2xs text-carbon-gray-70 mt-1.5 pt-1.5 border-t border-[#ffb3b8]">
                  <span className="font-medium">Next milestone:</span> Post-acute follow-up due
                  within 7 days
                </p>
              </div>
              {/* Signals compact */}
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'A1C', value: '9.2% (2026-02-10)', flagged: true },
                  { label: 'ER Visits (90d)', value: '2 visits — $11,000', flagged: true },
                  { label: 'BP Control', value: '158/96 (2026-04-01)', flagged: true },
                  { label: 'Med Adherence', value: '61% PDC', flagged: true },
                ].map((sig, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-1.5 px-2 py-1 border text-2xs ${sig.flagged ? 'bg-[#fff8f8] border-[#ffb3b8]' : 'bg-white border-carbon-gray-20'}`}
                  >
                    <div
                      className={`w-1 h-1 rounded-full flex-shrink-0 ${sig.flagged ? 'bg-[#da1e28]' : 'bg-carbon-gray-40'}`}
                    />
                    <span className="text-carbon-gray-50 truncate">{sig.label}:</span>
                    <span
                      className={`font-medium truncate ${sig.flagged ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                    >
                      {sig.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compact 4 Chronic Conditions */}
          <div className="flex-1">
            <div className="px-4 py-2 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="HeartIcon" size={12} className="text-[#da1e28]" />
              <span className="text-2xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
                Chronic Conditions
              </span>
              <span className="ml-auto text-2xs text-carbon-gray-50">4 active</span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {CHRONIC_CONDITIONS.map((cond) => {
                const tr = TREND_ICON[cond.trend];
                return (
                  <div key={cond.code} className="px-4 py-2 flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ACUITY_DOT[cond.acuity]}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium text-carbon-gray-100 truncate">
                          {cond.label}
                        </p>
                        <Icon name={tr.icon as any} size={10} className={tr.color} />
                      </div>
                      <p className="text-2xs text-carbon-gray-50">
                        {cond.icd} · {cond.hcc}
                      </p>
                    </div>
                    <span className="text-2xs font-mono text-carbon-gray-70 flex-shrink-0">
                      {cond.metric}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SMART context strip */}
          <div className="bg-[#f6f2ff] border-t border-[#d4bbff] px-4 py-1.5 flex items-center gap-3 flex-wrap">
            <Icon name="BoltIcon" size={11} className="text-[#6929c4]" />
            <span className="text-2xs text-[#6929c4] font-semibold">SMART on FHIR · Cerner</span>
            <span className="text-2xs text-carbon-gray-50">{launchContext.practitionerName}</span>
            <span className="text-2xs text-carbon-gray-50 ml-auto">
              NPI: {launchContext.practitionerNpi}
            </span>
          </div>
        </div>

        {/* ╔══════════════════════════════╗
            ║  TOP RIGHT — Care Gaps       ║
            ║  HEDIS + MIPS only, no STARS ║
            ╚══════════════════════════════╝ */}
        <div className="bg-white border border-carbon-gray-20 flex flex-col">
          <div className="px-4 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2">
            <Icon name="ClipboardDocumentListIcon" size={14} className="text-[#0043ce]" />
            <span className="text-xs font-semibold text-carbon-gray-100">Open Care Gaps</span>
            <span className="bg-[#da1e28] text-white text-2xs font-bold px-1.5 py-0.5 min-w-[18px] text-center">
              {careGaps.length}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-2xs px-1.5 py-0.5 bg-[#d0e2ff] text-[#0043ce] font-semibold">
                HEDIS
              </span>
              <span className="text-2xs px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] font-semibold">
                MIPS
              </span>
              <span className="text-2xs text-carbon-gray-40 italic">STARS excluded</span>
            </div>
          </div>

          {careGaps.length > 0 ? (
            <div className="divide-y divide-carbon-gray-10 flex-1">
              {careGaps.map((gap) => {
                const isOverdue = gap.daysOpen > 90;
                const programColor =
                  gap.program === 'HEDIS'
                    ? 'bg-[#d0e2ff] text-[#0043ce]'
                    : 'bg-[#defbe6] text-[#0e6027]';
                return (
                  <div key={gap.id} className={`px-4 py-3 ${isOverdue ? 'bg-[#fff8f8]' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`text-2xs font-semibold px-1.5 py-0.5 flex-shrink-0 ${programColor}`}
                          >
                            {gap.program}
                          </span>
                          <p className="text-xs font-medium text-carbon-gray-100 truncate">
                            {gap.measureName}
                          </p>
                        </div>
                        <p className="text-2xs text-carbon-gray-50">
                          Due: {gap.dueDate} · {gap.closureRequirement}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-2xs font-semibold px-2 py-0.5 ${isOverdue ? 'bg-[#ffe0e0] text-[#da1e28]' : 'bg-[#fdf6dd] text-[#b45309]'}`}
                        >
                          {gap.daysOpen}d open
                        </span>
                        <button className="text-2xs px-2 py-0.5 bg-[#0043ce] text-white hover:bg-[#0035b3] transition-colors">
                          Close Gap
                        </button>
                        <button className="text-2xs px-2 py-0.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                          Defer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <Icon name="CheckCircleIcon" size={24} className="text-[#24a148] mx-auto mb-2" />
                <p className="text-xs text-carbon-gray-70">No open HEDIS or MIPS gaps</p>
              </div>
            </div>
          )}

          {/* MIPS points summary */}
          <div className="border-t border-carbon-gray-20 px-4 py-2 bg-[#f4f4f4] flex items-center gap-3">
            <Icon name="TrophyIcon" size={12} className="text-[#0e6027]" />
            <span className="text-2xs text-carbon-gray-70">MIPS Quality Score Impact</span>
            <span className="ml-auto text-2xs font-mono font-semibold text-[#0043ce]">
              Est. +12 pts if closed
            </span>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════╗
            ║  BOTTOM LEFT — Meds, Labs, CDI           ║
            ╚══════════════════════════════════════════╝ */}
        <div className="bg-white border border-carbon-gray-20 flex flex-col">
          {/* Medications */}
          <div className="border-b border-carbon-gray-20">
            <div className="px-4 py-2 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="PlusCircleIcon" size={12} className="text-[#0e6027]" />
              <span className="text-2xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
                Medications
              </span>
              <span className="ml-auto text-2xs text-carbon-gray-50">{MEDS.length} active</span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {MEDS.map((med, idx) => (
                <div key={`med-${idx}`} className={`px-4 py-2 ${med.flag ? 'bg-[#fff8f8]' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {med.flag && (
                      <Icon
                        name="ExclamationCircleIcon"
                        size={11}
                        className="text-[#da1e28] flex-shrink-0"
                      />
                    )}
                    <p className="text-xs font-medium text-carbon-gray-100 flex-1 truncate">
                      {med.name}
                    </p>
                    <span className="text-2xs text-carbon-gray-50 flex-shrink-0">{med.freq}</span>
                    <span
                      className={`text-2xs font-mono font-semibold flex-shrink-0 ${med.adherence >= 80 ? 'text-[#24a148]' : med.adherence >= 65 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                    >
                      {med.adherence}%
                    </span>
                  </div>
                  <div className="h-1 bg-carbon-gray-20">
                    <div
                      className={`h-full transition-all ${med.adherence >= 80 ? 'bg-[#24a148]' : med.adherence >= 65 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                      style={{ width: `${med.adherence}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Labs & Vitals */}
          <div className="border-b border-carbon-gray-20">
            <div className="px-4 py-2 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="BeakerIcon" size={12} className="text-[#0043ce]" />
              <span className="text-2xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
                Recent Labs & Vitals
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-carbon-gray-10">
              {LABS.map((lab, idx) => (
                <div key={`lab-${idx}`} className={`px-3 py-2 ${lab.flag ? 'bg-[#fff8f8]' : ''}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    {lab.flag && (
                      <Icon name="ExclamationCircleIcon" size={10} className="text-[#da1e28]" />
                    )}
                    <p className="text-2xs text-carbon-gray-50">{lab.name}</p>
                  </div>
                  <p
                    className={`text-sm font-mono font-bold tabular-nums ${lab.flag ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                  >
                    {lab.value}
                  </p>
                  <p className="text-2xs text-carbon-gray-40">{lab.date}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CDI — Clinical Documentation Opportunities */}
          <div className="flex-1">
            <div className="px-4 py-2 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="DocumentMagnifyingGlassIcon" size={12} className="text-[#b45309]" />
              <span className="text-2xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
                Clinical Documentation Opportunities
              </span>
              <span className="bg-[#b45309] text-white text-2xs font-bold px-1.5 py-0.5 ml-1">
                {CDI_OPPORTUNITIES.length}
              </span>
              <span className="ml-auto text-2xs font-mono font-semibold text-[#b45309]">
                ${(totalRevenueAtRisk / 1000).toFixed(1)}K at risk
              </span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {CDI_OPPORTUNITIES.map((cdi) => {
                const isExpanded = expandedCdi === cdi.id;
                return (
                  <div key={cdi.id}>
                    {/* CDI row */}
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-carbon-gray-100 truncate">
                          {cdi.condition}
                        </p>
                        <p className="text-2xs text-carbon-gray-50">
                          {cdi.icd} · {cdi.hcc}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Confidence bar */}
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1.5 bg-carbon-gray-20">
                            <div
                              className={`h-full ${cdi.confidence >= 85 ? 'bg-[#24a148]' : cdi.confidence >= 70 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                              style={{ width: `${cdi.confidence}%` }}
                            />
                          </div>
                          <span className="text-2xs font-mono text-carbon-gray-70">
                            {cdi.confidence}%
                          </span>
                        </div>
                        <span className="text-2xs font-mono font-semibold text-[#0e6027]">
                          {cdi.rafDelta} RAF
                        </span>
                        <span className="text-2xs font-mono font-semibold text-[#b45309]">
                          {cdi.revenueDelta}
                        </span>
                        {/* DX Evidence button */}
                        <button
                          onClick={() => setExpandedCdi(isExpanded ? null : cdi.id)}
                          className={`text-2xs font-semibold px-2.5 py-1 border transition-colors flex items-center gap-1 ${
                            isExpanded
                              ? 'bg-[#b45309] text-white border-[#b45309]'
                              : 'bg-white text-[#b45309] border-[#b45309] hover:bg-[#fdf6dd]'
                          }`}
                        >
                          <Icon name="DocumentMagnifyingGlassIcon" size={10} />
                          DX Evidence
                          <Icon name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={9} />
                        </button>
                      </div>
                    </div>

                    {/* DX Evidence accordion */}
                    {isExpanded && (
                      <div className="bg-[#fdf6dd] border-t border-[#f1c21b] px-4 py-3 space-y-3">
                        {/* Evidence sources */}
                        <div>
                          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1.5">
                            Evidence Sources
                          </p>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {cdi.evidenceSources.map((src) => (
                              <span
                                key={src}
                                className={`text-2xs font-semibold px-2 py-0.5 ${SOURCE_BADGE[src] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
                              >
                                {src}
                              </span>
                            ))}
                          </div>
                          <div className="space-y-1">
                            {cdi.signals.map((sig, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-2 px-2 py-1 text-2xs border ${sig.flagged ? 'bg-[#fff8f8] border-[#ffb3b8]' : 'bg-white border-carbon-gray-20'}`}
                              >
                                <span
                                  className={`font-semibold px-1.5 py-0.5 text-2xs ${SOURCE_BADGE[sig.source] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
                                >
                                  {sig.source}
                                </span>
                                <span className="text-carbon-gray-70">{sig.label}:</span>
                                <span
                                  className={`font-medium ${sig.flagged ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                                >
                                  {sig.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Clinical justification */}
                        <div>
                          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                            Clinical Justification
                          </p>
                          <p className="text-2xs text-carbon-gray-70 leading-relaxed bg-white border border-carbon-gray-20 px-3 py-2">
                            {cdi.justification}
                          </p>
                        </div>

                        {/* Confidence breakdown */}
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                              Confidence
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-carbon-gray-20">
                                <div
                                  className={`h-full ${cdi.confidence >= 85 ? 'bg-[#24a148]' : cdi.confidence >= 70 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                                  style={{ width: `${cdi.confidence}%` }}
                                />
                              </div>
                              <span
                                className={`text-sm font-bold font-mono ${cdi.confidence >= 85 ? 'text-[#24a148]' : cdi.confidence >= 70 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                              >
                                {cdi.confidence}%
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                              RAF Delta
                            </p>
                            <p className="text-sm font-bold font-mono text-[#0e6027]">
                              {cdi.rafDelta}
                            </p>
                          </div>
                          <div>
                            <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                              Revenue at Risk
                            </p>
                            <p className="text-sm font-bold font-mono text-[#b45309]">
                              {cdi.revenueDelta}
                            </p>
                          </div>
                        </div>

                        {/* ICD-10 guidance */}
                        <div>
                          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                            ICD-10 Specificity Guidance
                          </p>
                          <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2 flex items-start gap-2">
                            <Icon
                              name="InformationCircleIcon"
                              size={12}
                              className="text-[#0043ce] flex-shrink-0 mt-0.5"
                            />
                            <p className="text-2xs text-[#0043ce] leading-relaxed">
                              {cdi.icd10Guidance}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button className="text-xs font-semibold px-3 py-1.5 bg-[#0e6027] text-white hover:bg-[#0a4d1e] transition-colors flex items-center gap-1.5">
                            <Icon name="CheckIcon" size={12} />
                            Confirm & Document
                          </button>
                          <button className="text-xs font-semibold px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
                            Defer
                          </button>
                          <span className="text-2xs text-carbon-gray-50 ml-auto">
                            Submission deadline: Dec 31, 2026
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════╗
            ║  BOTTOM RIGHT — Financials               ║
            ║  Role-based toggle, VBP disclaimer       ║
            ╚══════════════════════════════════════════╝ */}
        <div className="bg-white border border-carbon-gray-20 flex flex-col">
          {/* Header with toggle switch */}
          <div className="px-4 py-2.5 border-b border-carbon-gray-20 flex items-center gap-3">
            <Icon name="CurrencyDollarIcon" size={14} className="text-[#0e6027]" />
            <span className="text-xs font-semibold text-carbon-gray-100">Financial Signals</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-2xs text-carbon-gray-50">
                {canViewFinancials ? 'VBP View: On' : 'VBP View: Off'}
              </span>
              {/* Toggle switch */}
              <button
                onClick={() => setCanViewFinancials(!canViewFinancials)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  canViewFinancials ? 'bg-[#0e6027]' : 'bg-carbon-gray-30'
                }`}
                role="switch"
                aria-checked={canViewFinancials}
                title={
                  canViewFinancials
                    ? 'Disable financial view'
                    : 'Enable financial view (VBP authorized)'
                }
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    canViewFinancials ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Financial content — gated by toggle */}
          {!canViewFinancials ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-xs border border-[#d0e2ff] bg-[#edf5ff] px-5 py-4 text-center">
                <Icon name="LockClosedIcon" size={20} className="text-[#0043ce] mx-auto mb-2" />
                <p className="text-xs font-semibold text-[#0043ce] mb-1">Financial View Disabled</p>
                <p className="text-2xs text-carbon-gray-70 leading-relaxed">
                  Toggle the switch above to enable VBP financial signals for authorized providers.
                </p>
                <div className="mt-3 pt-3 border-t border-[#97c1ff]">
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    can_view_financials ={' '}
                    <span className="text-[#da1e28] font-semibold">false</span>
                  </p>
                  <p className="text-2xs text-carbon-gray-50 mt-1">
                    Cost, PMPM, and HCC revenue figures hidden per Provider Access rule.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Financial metrics grid */}
              <div className="grid grid-cols-2 divide-x divide-y divide-carbon-gray-20 border-b border-carbon-gray-20">
                {/* RAF Revenue at Risk */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name="ExclamationTriangleIcon" size={11} className="text-[#b45309]" />
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      RAF Revenue at Risk
                    </p>
                  </div>
                  <p className="text-xl font-bold font-mono text-[#b45309]">
                    ${(totalRevenueAtRisk / 1000).toFixed(1)}K
                  </p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    {CDI_OPPORTUNITIES.length} HCC suspects · RAF +{totalRafAtRisk.toFixed(2)}
                  </p>
                </div>

                {/* Projected Savings */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name="ArrowTrendingDownIcon" size={11} className="text-[#0e6027]" />
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Projected Savings
                    </p>
                  </div>
                  <p className="text-xl font-bold font-mono text-[#0e6027]">$4,200</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    Est. gap closure — 5 HEDIS/MIPS measures
                  </p>
                </div>

                {/* Prior Auth Cost Signals */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name="DocumentCheckIcon" size={11} className="text-[#0043ce]" />
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Prior Auth Signals
                    </p>
                  </div>
                  <p className="text-xl font-bold font-mono text-[#0043ce]">2 pending</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    Nephrology referral · Renal ultrasound
                  </p>
                </div>

                {/* Network Cost Tier */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name="BuildingOfficeIcon" size={11} className="text-[#6929c4]" />
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Network Cost Tier
                    </p>
                  </div>
                  <p className="text-xl font-bold font-mono text-[#6929c4]">Preferred</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">
                    Dr. Priya Mehta — Nephrology
                  </p>
                </div>
              </div>

              {/* HCC suspects revenue detail */}
              {hccSuspects.length > 0 && (
                <div className="border-b border-carbon-gray-20">
                  <div className="px-4 py-2 bg-[#fdf6dd] flex items-center gap-2">
                    <Icon name="DocumentMagnifyingGlassIcon" size={11} className="text-[#b45309]" />
                    <span className="text-2xs font-semibold text-[#b45309] uppercase tracking-wide">
                      HCC Revenue Detail
                    </span>
                  </div>
                  <div className="divide-y divide-carbon-gray-10">
                    {hccSuspects.map((hcc) => (
                      <div key={hcc.id} className="px-4 py-2 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-carbon-gray-100 truncate">
                            {hcc.hccDescription}
                          </p>
                          <p className="text-2xs text-carbon-gray-50">
                            {hcc.icdCode} · {hcc.hccCode}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-mono font-semibold text-[#b45309]">
                            +${hcc.estimatedRevenueDelta.toLocaleString()}
                          </p>
                          <p className="text-2xs text-carbon-gray-50">
                            {Math.round(hcc.suspectConfidence * 100)}% conf.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VBP Disclaimer — ALWAYS VISIBLE */}
          <div className="border-t border-[#d4bbff] bg-[#f6f2ff] px-4 py-2.5">
            <div className="flex items-start gap-2">
              <Icon
                name="ShieldCheckIcon"
                size={12}
                className="text-[#6929c4] flex-shrink-0 mt-0.5"
              />
              <p className="text-2xs text-[#6929c4] leading-relaxed">
                Incentives shown per your 2026 VBP contract with Humana MA-PD. Subject to CMS AKS
                Value-Based Enterprise safe harbor and Stark VBE exception. Quality-based only — not
                tied to referral volume.
              </p>
            </div>
          </div>

          {/* CMS-0057-F Exclusion Footnote — ALWAYS VISIBLE */}
          <div className="border-t border-carbon-gray-20 bg-[#f4f4f4] px-4 py-2">
            <div className="flex items-start gap-1.5">
              <Icon
                name="InformationCircleIcon"
                size={11}
                className="text-carbon-gray-50 flex-shrink-0 mt-0.5"
              />
              <p className="text-2xs text-carbon-gray-50 leading-relaxed">
                Provider remittances and patient cost-sharing excluded per CMS-0057-F Provider
                Access API rule. Financial signals limited to RAF scoring, prior auth, and
                Transparency in Coverage data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
