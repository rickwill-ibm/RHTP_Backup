'use client';
import React, { useState, useCallback } from 'react';
import { mockPatients, mockHCCSuspects } from '@/lib/mockData';
import Icon from '@/components/ui/AppIcon';
import type { SmartLaunchContext, CdsCard } from '@/lib/smartFhirTypes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MdSmartSummaryScreenProps {
  launchContext: SmartLaunchContext;
  cdsCards: CdsCard[];
  onAuditEntry?: (action: string, details: Record<string, string>) => void;
  onOpenOrderEntry?: () => void;
}

type GapStatusType = 'In Process' | 'Not Started' | 'Waiting on Patient';
type SummaryComplexity = 'Concise' | 'Moderate-Detail' | 'High-Detail';
type CloseGapStep = 1 | 2 | 3;
type ConfirmDocStep = 1 | 2 | 3;
type ReferralStatus = 'Not Sent' | 'Pending' | 'Scheduled' | 'Completed';

// ─── Static Data ──────────────────────────────────────────────────────────────
const JOURNEY_PHASES = [
  {
    key: 'stable-management',
    label: 'Stable',
    color: 'bg-[#24a148]',
    textColor: 'text-[#24a148]',
    borderColor: 'border-[#24a148]',
    bgLight: 'bg-[#defbe6]',
  },
  {
    key: 'gap-in-care',
    label: 'Gap in Care',
    color: 'bg-[#f1c21b]',
    textColor: 'text-[#b45309]',
    borderColor: 'border-[#f1c21b]',
    bgLight: 'bg-[#fdf6dd]',
  },
  {
    key: 'deteriorating',
    label: 'Deteriorating',
    color: 'bg-[#ff832b]',
    textColor: 'text-[#ff832b]',
    borderColor: 'border-[#ff832b]',
    bgLight: 'bg-[#fff2e8]',
  },
  {
    key: 'high-risk-transition',
    label: 'High-Risk Transition',
    color: 'bg-[#da1e28]',
    textColor: 'text-[#da1e28]',
    borderColor: 'border-[#da1e28]',
    bgLight: 'bg-[#fff1f1]',
  },
  {
    key: 'post-acute-recovery',
    label: 'Post-Acute',
    color: 'bg-[#0043ce]',
    textColor: 'text-[#0043ce]',
    borderColor: 'border-[#0043ce]',
    bgLight: 'bg-[#edf5ff]',
  },
];

const CURRENT_PHASE_KEY = 'high-risk-transition';

const SDOH_BADGES = [
  { label: 'Social Risk', value: '53→', color: 'bg-[#ffe0e0] text-[#da1e28] border-[#ffb3b8]' },
  { label: 'Food Risk', value: 'High', color: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
  { label: 'Housing', value: 'Unstable', color: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
];

const CARE_GAPS_ENHANCED = [
  {
    id: 'cg-001',
    name: 'A1C Control — Diabetes',
    program: 'HEDIS',
    cmsMips: 'CDC-001',
    priority: 'High',
    status: 'In Process' as GapStatusType,
    daysOpen: 112,
  },
  {
    id: 'cg-002',
    name: 'SDoH Screening',
    program: 'MIPS',
    cmsMips: 'MIPS-487',
    priority: 'Medium',
    status: 'In Process' as GapStatusType,
    daysOpen: 67,
  },
  {
    id: 'cg-003',
    name: 'Mental/Behavioral Health',
    program: 'MIPS',
    cmsMips: 'MIPS-134',
    priority: 'Medium',
    status: 'Not Started' as GapStatusType,
    daysOpen: 45,
  },
  {
    id: 'cg-004',
    name: 'Statin Therapy — CVD',
    program: 'HEDIS',
    cmsMips: 'SPC-438',
    priority: 'High',
    status: 'Waiting on Patient' as GapStatusType,
    daysOpen: 89,
  },
  {
    id: 'cg-005',
    name: 'Controlling Hypertension',
    program: 'HEDIS',
    cmsMips: 'CBP-236',
    priority: 'High',
    status: 'Waiting on Patient' as GapStatusType,
    daysOpen: 134,
  },
  {
    id: 'cg-006',
    name: 'Colorectal Cancer Screening',
    program: 'HEDIS',
    cmsMips: 'COL-113',
    priority: 'Medium',
    status: 'Not Started' as GapStatusType,
    daysOpen: 22,
  },
];

const MEDS_DATA = [
  { name: 'Lisinopril 10mg', freq: 'QD', adherence: 78, flag: false },
  { name: 'Metformin 500mg', freq: 'BID', adherence: 61, flag: true },
  { name: 'Atorvastatin 400', freq: 'QHS', adherence: 84, flag: false },
  { name: 'Furosemide 200', freq: 'QD', adherence: 72, flag: false },
  { name: 'Potassium Chloride 200', freq: 'QD', adherence: 55, flag: true },
];

const LABS_DATA = [
  { name: 'A1C', value: '9.2%', date: '2026-02-10', flag: true, ref: '<7.0%' },
  { name: 'eGFR', value: '42', date: '2026-03-15', flag: true, ref: '>60' },
  { name: 'K+', value: '5.1 mEq/L', date: '2026-04-01', flag: true, ref: '3.5–5.0' },
  { name: 'LDL', value: '118 mg/dL', date: '2026-02-10', flag: false, ref: '<100' },
  { name: 'BNP', value: '210 pg/mL', date: '2026-03-20', flag: true, ref: '<100' },
  { name: 'BP', value: '158/96', date: '2026-04-01', flag: true, ref: '<130/80' },
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
      'Claims data and LPR confirm active T2DM with CKD Stage 3b. A1C 9.2% and eGFR 42 support combined coding. Both conditions require separate HCC capture for accurate RAF.',
    signals: [
      { label: 'A1C', value: '9.2% (2026-02-10)', source: 'EMR', flagged: true },
      { label: 'eGFR', value: '42 (2026-03-15)', source: 'EMR', flagged: true },
      { label: 'Claims DX', value: 'E11.65 coded 2025-11-14', source: 'Claims', flagged: false },
      { label: 'HIE Record', value: 'Nephrology note 2025-12-01', source: 'HIE', flagged: false },
    ],
    icd10Guidance:
      'Use E11.65 (T2DM with hyperglycemia) + N18.32 (CKD Stage 3b). Dual coding required for HCC 136 capture.',
    currentCode: 'E11 (Type 2 Diabetes)',
    suggestedCode: 'E11.65 (T2D with hyperglycemia + CKD)',
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
      'Echo confirms EF 55% consistent with HFpEF. BNP 210 pg/mL elevated. Prior year claims coded I50.9 (unspecified) — specificity upgrade required for HCC 85 capture.',
    signals: [
      { label: 'Echo EF', value: '55% (2026-01-15)', source: 'EMR', flagged: false },
      { label: 'BNP', value: '210 pg/mL (2026-03-20)', source: 'EMR', flagged: true },
      { label: 'Prior Claim', value: 'I50.9 coded 2025-09-10', source: 'Claims', flagged: false },
    ],
    icd10Guidance:
      'Upgrade from I50.9 to I50.30 (HFpEF, unspecified). Confirm systolic function preserved on echo documentation.',
    currentCode: 'I50.9 (Heart Failure, unspecified)',
    suggestedCode: 'I50.30 (HFpEF, unspecified)',
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
    ],
    icd10Guidance:
      'Use I48.91 (unspecified AFib). Annual recapture required — HCC 96 does not carry forward.',
    currentCode: 'Not coded this encounter',
    suggestedCode: 'I48.91 (Unspecified AFib)',
  },
];

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

const RECENT_ACTIVITY = [
  { date: '04/01/2026', type: 'Lab', desc: 'BMP + A1C drawn', flag: true },
  { date: '03/29/2026', type: 'ER', desc: 'ER visit — chest pain', flag: true },
  { date: '03/19/2026', type: 'Visit', desc: 'Diabetes F/U — Dr. Whitfield', flag: false },
  { date: '03/17/2026', type: 'BP', desc: 'BP Check 158/96', flag: true },
  { date: '02/18/2026', type: 'ER', desc: 'ER visit — dyspnea', flag: true },
];

const VITALS_TREND = [
  {
    label: 'BP Systolic',
    unit: 'mmHg',
    values: [142, 148, 155, 158],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
  {
    label: 'A1C',
    unit: '%',
    values: [8.1, 8.6, 9.0, 9.2],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
  {
    label: 'eGFR',
    unit: 'mL/min',
    values: [51, 48, 44, 42],
    dates: ['Q3 25', 'Q4 25', 'Q1 26', 'Apr 26'],
    flag: true,
  },
];

const ACTIVE_REFERRALS = [
  {
    id: 'ref-001',
    specialty: 'Cardiology',
    provider: 'Dr. Patel',
    tier: 'Tier 1',
    status: 'Pending' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-03-28',
    reason: 'HFpEF follow-up, BNP elevation',
  },
  {
    id: 'ref-002',
    specialty: 'Nephrology',
    provider: 'Unassigned',
    tier: '—',
    status: 'Not Sent' as ReferralStatus,
    urgency: 'Urgent',
    date: '2026-04-01',
    reason: 'CKD Stage 3b progression, eGFR 42',
  },
  {
    id: 'ref-003',
    specialty: 'Ophthalmology',
    provider: 'Dr. Chen',
    tier: 'Tier 2',
    status: 'Scheduled' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-04-15',
    reason: 'Annual diabetic eye exam',
  },
  {
    id: 'ref-004',
    specialty: 'Endocrinology',
    provider: 'Dr. Reyes',
    tier: 'Tier 1',
    status: 'Completed' as ReferralStatus,
    urgency: 'Routine',
    date: '2026-02-20',
    reason: 'T2DM management — A1C 9.2%',
  },
];

const SOURCE_BADGE: Record<string, string> = {
  EMR: 'bg-[#d0e2ff] text-[#0043ce]',
  Claims: 'bg-[#fdf6dd] text-[#b45309]',
  HIE: 'bg-[#defbe6] text-[#0e6027]',
  LPR: 'bg-[#f6f2ff] text-[#6929c4]',
};

const GAP_STATUS_STYLE: Record<GapStatusType, { dot: string; badge: string; label: string }> = {
  'In Process': { dot: 'bg-[#0043ce]', badge: 'bg-[#d0e2ff] text-[#0043ce]', label: 'In Process' },
  'Not Started': {
    dot: 'bg-carbon-gray-40',
    badge: 'bg-carbon-gray-20 text-carbon-gray-70',
    label: 'Not Started',
  },
  'Waiting on Patient': {
    dot: 'bg-[#f1c21b]',
    badge: 'bg-[#fdf6dd] text-[#b45309]',
    label: 'Waiting on Patient',
  },
};

const REFERRAL_STATUS_STYLE: Record<ReferralStatus, { dot: string; badge: string }> = {
  'Not Sent': { dot: 'bg-carbon-gray-40', badge: 'bg-carbon-gray-20 text-carbon-gray-70' },
  Pending: { dot: 'bg-[#f1c21b]', badge: 'bg-[#fdf6dd] text-[#b45309]' },
  Scheduled: { dot: 'bg-[#0043ce]', badge: 'bg-[#d0e2ff] text-[#0043ce]' },
  Completed: { dot: 'bg-[#24a148]', badge: 'bg-[#defbe6] text-[#0e6027]' },
};

const ENCOUNTER_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'results', label: 'Results' },
  { key: 'orders', label: 'Orders' },
  { key: 'plan', label: 'Plan' },
  { key: 'return', label: 'Γå⌐ Return to Cerner' },
];

// ─── Sparkline Component ──────────────────────────────────────────────────────
function Sparkline({ values, flag }: { values: number[]; flag: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 90;
  const h = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  });
  const color = flag ? '#da1e28' : '#24a148';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 6) - 3;
        return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
      })}
    </svg>
  );
}

// ─── Close Gap Modal ──────────────────────────────────────────────────────────
function CloseGapModal({
  gap,
  onClose,
  onComplete,
}: {
  gap: (typeof CARE_GAPS_ENHANCED)[0];
  onClose: () => void;
  onComplete: (gapId: string) => void;
}) {
  const [step, setStep] = useState<CloseGapStep>(1);
  const [method, setMethod] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [attested, setAttested] = useState(false);
  const METHODS = [
    'Performed in this encounter',
    'Performed previously — date picker',
    'Patient declined — reason required',
    'Medically excluded — exclusion code required',
  ];
  const SOURCES = ['EMR', 'HIE', 'CLAIMS', 'Patient Report'];
  const toggleSource = (s: string) =>
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-carbon-gray-100">Close Care Gap</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              Mrs. Alex Kirby — {gap.name} · {gap.cmsMips}
            </p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100 p-1">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div className="flex border-b border-carbon-gray-20">
          {[
            { n: 1, label: 'Closure Method' },
            { n: 2, label: 'Evidence & Documentation' },
            { n: 3, label: 'Confirm & Sign' },
          ].map(({ n, label }) => (
            <div
              key={n}
              className={`flex-1 flex items-center gap-2 px-4 py-2.5 text-2xs font-semibold border-b-2 transition-colors ${step === n ? 'border-[#0043ce] text-[#0043ce] bg-[#edf5ff]' : step > n ? 'border-[#24a148] text-[#24a148]' : 'border-transparent text-carbon-gray-40'}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${step === n ? 'bg-[#0043ce] text-white' : step > n ? 'bg-[#24a148] text-white' : 'bg-carbon-gray-20 text-carbon-gray-50'}`}
              >
                {step > n ? 'OK' : n}
              </span>
              {label}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-carbon-gray-100 mb-3">
                How was this gap addressed?
              </p>
              {METHODS.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-3 px-3 py-2.5 border border-carbon-gray-20 cursor-pointer hover:bg-carbon-gray-10 transition-colors"
                >
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="accent-[#0043ce]"
                  />
                  <span className="text-xs text-carbon-gray-100">{m}</span>
                </label>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100 mb-2">
                  Supporting Sources
                </p>
                <div className="flex gap-2 flex-wrap">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSource(s)}
                      className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${sources.includes(s) ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-30 hover:border-[#0043ce]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100 mb-2">Clinical Note</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Enter clinical note supporting gap closure..."
                  className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 resize-none focus:outline-none focus:border-[#0043ce]"
                />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-[#f4f4f4] border border-carbon-gray-20 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-carbon-gray-100 mb-2">Closure Summary</p>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Gap</span>
                  <span className="font-medium text-carbon-gray-100">{gap.name}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Measure</span>
                  <span className="font-medium text-carbon-gray-100">{gap.cmsMips}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Method</span>
                  <span className="font-medium text-carbon-gray-100">{method || '—'}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Evidence Sources</span>
                  <span className="font-medium text-carbon-gray-100">
                    {sources.join(', ') || '—'}
                  </span>
                </div>
              </div>
              <div className="bg-[#defbe6] border border-[#a7f0ba] px-3 py-2 flex items-center gap-2">
                <Icon name="TrophyIcon" size={12} className="text-[#0e6027]" />
                <p className="text-2xs text-[#0e6027] font-semibold">
                  MIPS Quality Score Impact: Est. +4 pts upon closure
                </p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-0.5 accent-[#0043ce]"
                />
                <span className="text-2xs text-carbon-gray-70 leading-relaxed">
                  I attest that the information provided is accurate and complete to the best of my
                  clinical knowledge. This documentation will be submitted to the payer for quality
                  measure credit.
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-carbon-gray-20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as CloseGapStep)}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
              >
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as CloseGapStep)}
                disabled={step === 1 && !method}
                className="text-xs px-4 py-1.5 bg-[#0043ce] text-white hover:bg-[#0035b3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => {
                  onComplete(gap.id);
                  onClose();
                }}
                disabled={!attested}
                className="text-xs px-4 py-1.5 bg-[#0e6027] text-white hover:bg-[#0a4d1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm & Close Gap
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm & Document Modal ─────────────────────────────────────────────────
function ConfirmDocumentModal({
  cdi,
  onClose,
  onComplete,
}: {
  cdi: (typeof CDI_OPPORTUNITIES)[0];
  onClose: () => void;
  onComplete: (cdiId: string) => void;
}) {
  const [step, setStep] = useState<ConfirmDocStep>(1);
  const [icdOverride, setIcdOverride] = useState(cdi.suggestedCode);
  const [submitTarget, setSubmitTarget] = useState<'EMR' | 'Payer' | 'Both'>('Both');
  const [attested, setAttested] = useState(false);
  const rafDeltaNum = parseFloat(cdi.rafDelta);
  const revenueNum = parseInt(cdi.revenueDelta.replace(/[$,]/g, ''));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-carbon-gray-100">Confirm Diagnosis & Document</p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">Mrs. Alex Kirby — {cdi.condition}</p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100 p-1">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div className="flex border-b border-carbon-gray-20">
          {[
            { n: 1, label: 'Evidence Review' },
            { n: 2, label: 'ICD-10 Confirmation' },
            { n: 3, label: 'Sign & Submit' },
          ].map(({ n, label }) => (
            <div
              key={n}
              className={`flex-1 flex items-center gap-2 px-4 py-2.5 text-2xs font-semibold border-b-2 transition-colors ${step === n ? 'border-[#b45309] text-[#b45309] bg-[#fdf6dd]' : step > n ? 'border-[#24a148] text-[#24a148]' : 'border-transparent text-carbon-gray-40'}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${step === n ? 'bg-[#b45309] text-white' : step > n ? 'bg-[#24a148] text-white' : 'bg-carbon-gray-20 text-carbon-gray-50'}`}
              >
                {step > n ? 'OK' : n}
              </span>
              {label}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap mb-3">
                {cdi.evidenceSources.map((src) => (
                  <span
                    key={src}
                    className={`text-2xs font-semibold px-2 py-0.5 ${SOURCE_BADGE[src] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
                  >
                    {src}
                  </span>
                ))}
              </div>
              <div className="space-y-1.5">
                {cdi.signals.map((sig, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 text-2xs border ${sig.flagged ? 'bg-[#fff8f8] border-[#ffb3b8]' : 'bg-white border-carbon-gray-20'}`}
                  >
                    <span
                      className={`font-semibold px-1.5 py-0.5 text-2xs ${SOURCE_BADGE[sig.source] || ''}`}
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
              <div className="bg-white border border-carbon-gray-20 px-3 py-2">
                <p className="text-2xs font-semibold text-carbon-gray-70 mb-1 uppercase tracking-wide">
                  Clinical Justification
                </p>
                <p className="text-2xs text-carbon-gray-70 leading-relaxed">{cdi.justification}</p>
              </div>
              <div className="flex items-center gap-4 bg-[#f4f4f4] px-3 py-2">
                <div>
                  <p className="text-2xs text-carbon-gray-50">Confidence</p>
                  <p className="text-sm font-bold font-mono text-[#24a148]">{cdi.confidence}%</p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50">RAF Delta</p>
                  <p className="text-sm font-bold font-mono text-[#0e6027]">{cdi.rafDelta}</p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50">Revenue at Risk</p>
                  <p className="text-sm font-bold font-mono text-[#b45309]">{cdi.revenueDelta}</p>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="bg-[#f4f4f4] border border-carbon-gray-20 px-3 py-2.5">
                  <p className="text-2xs text-carbon-gray-50 mb-0.5">Current Code</p>
                  <p className="text-xs font-mono font-semibold text-carbon-gray-100">
                    {cdi.currentCode}
                  </p>
                </div>
                <div className="bg-[#defbe6] border border-[#a7f0ba] px-3 py-2.5">
                  <p className="text-2xs text-[#0e6027] mb-0.5">Suggested Specificity Upgrade</p>
                  <p className="text-xs font-mono font-semibold text-[#0e6027]">
                    {cdi.suggestedCode}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100 mb-1.5">
                  Override / Modify ICD-10
                </p>
                <input
                  type="text"
                  value={icdOverride}
                  onChange={(e) => setIcdOverride(e.target.value)}
                  className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#b45309]"
                />
              </div>
              <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3">
                <p className="text-2xs font-semibold text-[#b45309] mb-2">RAF Impact Estimate</p>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-2xs text-carbon-gray-50">RAF Delta</p>
                    <p className="text-lg font-bold font-mono text-[#0e6027]">
                      {rafDeltaNum > 0 ? '+' : ''}
                      {rafDeltaNum.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-carbon-gray-50">Est. Revenue Impact</p>
                    <p className="text-lg font-bold font-mono text-[#b45309]">
                      ${revenueNum.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-carbon-gray-50">Submission Deadline</p>
                    <p className="text-xs font-semibold text-carbon-gray-100">Dec 31, 2026</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-[#f4f4f4] border border-carbon-gray-20 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-carbon-gray-100 mb-2">
                  Submission Summary
                </p>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Condition</span>
                  <span className="font-medium text-carbon-gray-100">{cdi.condition}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">ICD-10 Code</span>
                  <span className="font-mono font-medium text-carbon-gray-100">{icdOverride}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">RAF Delta</span>
                  <span className="font-mono font-semibold text-[#0e6027]">{cdi.rafDelta}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-50">Revenue Impact</span>
                  <span className="font-mono font-semibold text-[#b45309]">{cdi.revenueDelta}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100 mb-2">Submit To</p>
                <div className="flex gap-2">
                  {(['EMR', 'Payer', 'Both'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSubmitTarget(t)}
                      className={`text-xs font-semibold px-4 py-2 border transition-colors ${submitTarget === t ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-30 hover:border-[#0043ce]'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-0.5 accent-[#0043ce]"
                />
                <span className="text-2xs text-carbon-gray-70 leading-relaxed">
                  I attest that this diagnosis is supported by clinical evidence documented in the
                  medical record and meets the criteria for the specified ICD-10 code.
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-carbon-gray-20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as ConfirmDocStep)}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
              >
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as ConfirmDocStep)}
                className="text-xs px-4 py-1.5 bg-[#b45309] text-white hover:bg-[#8a3d07] transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => {
                  onComplete(cdi.id);
                  onClose();
                }}
                disabled={!attested}
                className="text-xs px-4 py-1.5 bg-[#0e6027] text-white hover:bg-[#0a4d1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign & Submit to {submitTarget}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Referral Triage Actions ──────────────────────────────────────────────────
function ReferralTriageMenu({
  referral,
  onAction,
}: {
  referral: (typeof ACTIVE_REFERRALS)[0];
  onAction: (refId: string, action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const actions: Record<ReferralStatus, Array<{ label: string; icon: string; color: string }>> = {
    'Not Sent': [
      { label: 'Approve & Send', icon: 'CheckCircleIcon', color: 'text-[#0e6027]' },
      { label: 'Modify', icon: 'PencilSquareIcon', color: 'text-[#0043ce]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
    ],
    Pending: [
      { label: 'Upgrade Urgency', icon: 'ArrowUpCircleIcon', color: 'text-[#da1e28]' },
      { label: 'Add Clinical Note', icon: 'PencilSquareIcon', color: 'text-[#0043ce]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
      { label: 'Reassign Provider', icon: 'ArrowPathIcon', color: 'text-[#b45309]' },
    ],
    Scheduled: [
      { label: 'Add Note', icon: 'PencilSquareIcon', color: 'text-[#0043ce]' },
      { label: 'View Appointment', icon: 'CalendarIcon', color: 'text-[#0043ce]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
    ],
    Completed: [
      { label: 'View Outcome', icon: 'DocumentTextIcon', color: 'text-[#0043ce]' },
      { label: 'Create Follow-up', icon: 'PlusCircleIcon', color: 'text-[#0e6027]' },
    ],
  };
  const menuActions = actions[referral.status];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-2xs font-semibold px-2 py-1 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors flex items-center gap-1 whitespace-nowrap"
      >
        Actions <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 z-20 bg-white border border-carbon-gray-20 shadow-lg min-w-[160px]">
          {menuActions.map((act) => (
            <button
              key={act.label}
              onClick={() => {
                onAction(referral.id, act.label);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-2xs hover:bg-carbon-gray-10 transition-colors text-left"
            >
              <Icon name={act.icon as any} size={11} className={act.color} />
              <span className="text-carbon-gray-100">{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pagination helpers (module-level) ───────────────────────────────────────
const PAGE_SIZE = 5;

function paginate<T>(arr: T[], page: number): T[] {
  return arr.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}

function PanelPager({
  total,
  page,
  onPage,
}: {
  total: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="border-t border-carbon-gray-20 px-3 py-1.5 flex items-center justify-between bg-[#f4f4f4] flex-shrink-0">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="text-2xs font-semibold px-2 py-0.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      <span className="text-2xs text-carbon-gray-50">
        {page + 1} / {totalPages}
        <span className="ml-1 text-carbon-gray-40">({total} total)</span>
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="text-2xs font-semibold px-2 py-0.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MdSmartSummaryScreen({
  launchContext,
  onAuditEntry,
  onOpenOrderEntry,
}: MdSmartSummaryScreenProps) {
  const patient = mockPatients.find((p) => p.id === launchContext.patientId) || mockPatients[0];
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id).slice(0, 3);

  const [activeEncounterTab, setActiveEncounterTab] = useState('summary');
  const [journeyExpanded, setJourneyExpanded] = useState(false);
  const [complexity, setComplexity] = useState<SummaryComplexity>('Moderate-Detail');
  const [showCdi, setShowCdi] = useState(false);
  const [expandedCdi, setExpandedCdi] = useState<string | null>(null);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [closeGapTarget, setCloseGapTarget] = useState<(typeof CARE_GAPS_ENHANCED)[0] | null>(null);
  const [confirmDocTarget, setConfirmDocTarget] = useState<(typeof CDI_OPPORTUNITIES)[0] | null>(
    null
  );
  const [closedGaps, setClosedGaps] = useState<string[]>([]);
  const [confirmedCdis, setConfirmedCdis] = useState<string[]>([]);

  // ── Pagination state (5 rows per page) ──────────────────────────────────
  const [chronicPage, setChronicPage] = useState(0);
  const [medsPage, setMedsPage] = useState(0);
  const [gapsPage, setGapsPage] = useState(0);
  const [labsPage, setLabsPage] = useState(0);
  const [cdiPage, setCdiPage] = useState(0);
  const [vitalsPage, setVitalsPage] = useState(0);
  const [referralsPage, setReferralsPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);

  const currentPhaseIdx = JOURNEY_PHASES.findIndex((p) => p.key === CURRENT_PHASE_KEY);
  const currentPhase = JOURNEY_PHASES[currentPhaseIdx];
  const totalRafAtRisk = CDI_OPPORTUNITIES.reduce((s, c) => s + parseFloat(c.rafDelta), 0);
  const totalRevenueAtRisk = CDI_OPPORTUNITIES.reduce(
    (s, c) => s + parseInt(c.revenueDelta.replace(/[$,]/g, '')),
    0
  );

  const handleGapClose = useCallback(
    (gapId: string) => {
      setClosedGaps((prev) => [...prev, gapId]);
      onAuditEntry?.('care-gap-closed', { gapId, action: 'Close Gap modal completed' });
    },
    [onAuditEntry]
  );

  const handleCdiConfirm = useCallback(
    (cdiId: string) => {
      setConfirmedCdis((prev) => [...prev, cdiId]);
      onAuditEntry?.('dx-confirmed', { cdiId, action: 'Confirm & Document modal completed' });
    },
    [onAuditEntry]
  );

  const handleReferralAction = useCallback(
    (refId: string, action: string) => {
      onAuditEntry?.('referral-triage', { refId, action });
    },
    [onAuditEntry]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f4f4f4]">
      {/* ── ER/Admission Alert Banner ─────────────────────────────────────── */}
      <div className="bg-[#da1e28] text-white px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Icon name="ExclamationTriangleIcon" size={14} />
        <span className="text-xs font-bold">
          ⚠ Patient seen in ER (03/29/2026) — High utilization risk · 2 ER visits in 60 days
        </span>
        <button className="ml-auto text-xs font-semibold px-3 py-1 bg-white text-[#da1e28] hover:bg-[#ffe0e0] transition-colors flex-shrink-0">
          Escalate Now
        </button>
      </div>

      {/* ── Encounter-phase top tabs + Complexity selector ────────────────── */}
      <div className="bg-white border-b border-carbon-gray-20 flex items-center flex-shrink-0">
        {ENCOUNTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveEncounterTab(tab.key);
              if (tab.key === 'orders') onOpenOrderEntry?.();
            }}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeEncounterTab === tab.key ? 'border-[#6929c4] text-[#6929c4] bg-[#f6f2ff]' : 'border-transparent text-carbon-gray-70 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'}`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 px-3">
          <span className="text-2xs text-carbon-gray-50 mr-1">Summary:</span>
          {(['Concise', 'Moderate-Detail', 'High-Detail'] as SummaryComplexity[]).map((c) => (
            <button
              key={c}
              onClick={() => setComplexity(c)}
              className={`text-2xs font-semibold px-2 py-1 transition-colors ${complexity === c ? 'bg-[#6929c4] text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-3">
          {/* ── PATIENT HEADER ─────────────────────────────────────────────── */}
          <div className="bg-white border border-carbon-gray-20">
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
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-sm font-bold text-carbon-gray-100">{patient.name}</h2>
                  <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#ffe0e0] text-[#da1e28] border border-[#ffb3b8]">
                    Critical Risk
                  </span>
                  <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
                    ΓÜí Cerner
                  </span>
                </div>
                <div className="flex items-center gap-3 text-2xs text-carbon-gray-50 flex-wrap mb-2">
                  <span>DOB: {patient.dob}</span>
                  <span>Age: {patient.age}</span>
                  <span>{patient.gender}</span>
                  <span className="font-mono">{patient.mrn}</span>
                  <span>
                    Enc:{' '}
                    <span className="font-mono text-carbon-gray-70">
                      {launchContext.encounterId}
                    </span>
                  </span>
                </div>
                {/* SDoH Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SDOH_BADGES.map((b) => (
                    <span
                      key={b.label}
                      className={`text-2xs font-semibold px-2 py-0.5 border ${b.color}`}
                    >
                      {b.label}: {b.value}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xs text-carbon-gray-50">{patient.payer}</p>
                <p className="text-2xs font-mono text-carbon-gray-70">ID: {patient.insuranceId}</p>
                <p className="text-2xs text-carbon-gray-40 mt-1">
                  {launchContext.practitionerName}
                </p>
              </div>
            </div>

            {/* ── PROMINENT JOURNEY STRIP ──────────────────────────────────── */}
            <div className="px-4 py-4 border-b border-carbon-gray-20 bg-[#fafafa]">
              <div className="flex items-center gap-0 mb-3">
                {JOURNEY_PHASES.map((phase, idx) => {
                  const isActive = phase.key === CURRENT_PHASE_KEY;
                  const isPast = idx < currentPhaseIdx;
                  return (
                    <React.Fragment key={phase.key}>
                      <div
                        className={`flex flex-col items-center cursor-pointer transition-opacity ${isActive ? 'opacity-100' : isPast ? 'opacity-70' : 'opacity-35'}`}
                        onClick={() => isActive && setJourneyExpanded(!journeyExpanded)}
                      >
                        <div
                          className={`relative flex items-center justify-center ${isActive ? 'w-7 h-7' : 'w-5 h-5'} rounded-full border-2 transition-all ${isActive ? `${phase.color} border-transparent shadow-lg` : isPast ? 'bg-carbon-gray-50 border-carbon-gray-50' : 'bg-white border-carbon-gray-30'}`}
                        >
                          {isActive && (
                            <Icon name="ExclamationTriangleIcon" size={12} className="text-white" />
                          )}
                          {isPast && <Icon name="CheckIcon" size={9} className="text-white" />}
                          {isActive && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#da1e28] animate-pulse" />
                          )}
                        </div>
                        <span
                          className={`mt-1.5 whitespace-nowrap font-semibold transition-all ${isActive ? `text-xs ${phase.textColor}` : isPast ? 'text-carbon-gray-50 text-2xs' : 'text-carbon-gray-40 text-2xs'}`}
                        >
                          {phase.label}
                        </span>
                        {isActive && (
                          <span className="text-2xs text-[#da1e28] font-bold mt-0.5">47d Γû╝</span>
                        )}
                      </div>
                      {idx < JOURNEY_PHASES.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${idx < currentPhaseIdx ? 'bg-carbon-gray-50' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Journey accordion */}
              {journeyExpanded && (
                <div className={`${currentPhase.bgLight} border border-[#ffb3b8] px-4 py-3 mb-3`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[#da1e28] mb-1">
                        High-Risk Transition · 47 days in phase
                      </p>
                      <p className="text-2xs text-carbon-gray-70 leading-relaxed mb-2">
                        Recent ER utilization, deteriorating chronic condition control, and multiple
                        open care gaps indicate elevated near-term risk. Trajectory:{' '}
                        <span className="font-semibold text-[#da1e28]">Worsening Γåô</span>
                      </p>
                      <p className="text-2xs text-carbon-gray-50">
                        <span className="font-medium">Next milestone:</span> Post-acute follow-up
                        due within 7 days
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xs text-carbon-gray-50">Urgency Score</p>
                      <p className="text-2xl font-bold font-mono text-[#da1e28]">82</p>
                      <p className="text-2xs text-carbon-gray-50">/100</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {[
                      { label: 'A1C', value: '9.2% (2026-02-10)', flagged: true },
                      { label: 'ER Visits (90d)', value: '2 visits — $11,000', flagged: true },
                      { label: 'BP Control', value: '158/96 (2026-04-01)', flagged: true },
                      { label: 'Med Adherence', value: '61% PDC', flagged: true },
                    ].map((sig, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2 py-1 border bg-white border-[#ffb3b8] text-2xs"
                      >
                        <div className="w-1 h-1 rounded-full bg-[#da1e28] flex-shrink-0" />
                        <span className="text-carbon-gray-50 truncate">{sig.label}:</span>
                        <span className="font-medium text-[#da1e28] truncate">{sig.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI pills row */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setJourneyExpanded(!journeyExpanded)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fff1f1] border border-[#ffb3b8] hover:bg-[#ffe0e0] transition-colors"
                >
                  <Icon name="ExclamationTriangleIcon" size={11} className="text-[#da1e28]" />
                  <span className="text-xs font-bold text-[#da1e28] whitespace-nowrap">
                    High-Risk Transition
                  </span>
                  <span className="text-xs text-[#da1e28]">· 47d</span>
                  <Icon
                    name={journeyExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                    size={10}
                    className="text-[#da1e28]"
                  />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-carbon-gray-10 border border-carbon-gray-20">
                  <span className="text-xs text-carbon-gray-50">RAF</span>
                  <span className="text-base font-bold font-mono text-carbon-gray-100">
                    {patient.rafScore.toFixed(2)}
                  </span>
                  <span className="text-xs text-[#24a148]">
                    +{patient.rafScoreDelta.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fdf6dd] border border-[#f1c21b]">
                  <span className="text-xs text-carbon-gray-50">ER 30d</span>
                  <span className="text-base font-bold font-mono text-[#da1e28]">
                    {Math.round(patient.predictedErRisk * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#edf5ff] border border-[#97c1ff]">
                  <span className="text-xs text-carbon-gray-50">Open Gaps</span>
                  <span className="text-base font-bold font-mono text-[#0043ce]">
                    {patient.openCareGaps}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fdf6dd] border border-[#f1c21b]">
                  <span className="text-xs text-carbon-gray-50">HCC Suspects</span>
                  <span className="text-base font-bold font-mono text-[#b45309]">
                    {patient.openHCCSuspects}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ROW 1: 4 columns — Chronic Conditions | Medications | Open Care Gaps | Labs & Vitals ── */}
          <div className="grid grid-cols-4 gap-3">
            {/* CHRONIC CONDITIONS */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="HeartIcon" size={13} className="text-[#da1e28]" />
                <span className="text-xs font-semibold text-carbon-gray-100">
                  Chronic Conditions
                </span>
                <span className="ml-auto text-2xs font-bold bg-[#ffe0e0] text-[#da1e28] px-1.5 py-0.5">
                  {CHRONIC_CONDITIONS.length}
                </span>
              </div>
              <div className="divide-y divide-carbon-gray-10 flex-1">
                {paginate(CHRONIC_CONDITIONS, chronicPage).map((cond) => (
                  <div key={cond.code} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${cond.acuity === 'critical' ? 'bg-[#da1e28]' : 'bg-[#f1c21b]'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-carbon-gray-100 leading-tight">
                          {cond.label}
                        </p>
                        <p className="text-2xs text-carbon-gray-50 mt-0.5">
                          {cond.icd} · <span className="font-mono">{cond.hcc}</span>
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`text-2xs font-mono font-bold ${cond.acuity === 'critical' ? 'text-[#da1e28]' : 'text-[#b45309]'}`}
                          >
                            {cond.metric}
                          </span>
                          <span
                            className={`text-2xs px-1 py-0.5 font-semibold ${cond.trend === 'worsening' ? 'bg-[#ffe0e0] text-[#da1e28]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                          >
                            {cond.trend === 'worsening' ? 'Γåô Worsening' : '→ Stable'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <PanelPager
                total={CHRONIC_CONDITIONS.length}
                page={chronicPage}
                onPage={setChronicPage}
              />
            </div>

            {/* MEDICATIONS */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="PlusCircleIcon" size={13} className="text-[#0e6027]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Medications</span>
                <span className="ml-auto text-2xs text-carbon-gray-50">
                  {MEDS_DATA.length} active
                </span>
              </div>
              <div className="divide-y divide-carbon-gray-10 flex-1">
                {paginate(MEDS_DATA, medsPage).map((med, idx) => (
                  <div key={idx} className={`px-3 py-2.5 ${med.flag ? 'bg-[#fff8f8]' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {med.flag && (
                        <Icon
                          name="ExclamationCircleIcon"
                          size={10}
                          className="text-[#da1e28] flex-shrink-0"
                        />
                      )}
                      <p className="text-2xs font-medium text-carbon-gray-100 flex-1 truncate">
                        {med.name}
                      </p>
                      <span className="text-2xs text-carbon-gray-50 flex-shrink-0">{med.freq}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-carbon-gray-20">
                        <div
                          className={`h-full ${med.adherence >= 80 ? 'bg-[#24a148]' : med.adherence >= 65 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                          style={{ width: `${med.adherence}%` }}
                        />
                      </div>
                      <span
                        className={`text-2xs font-mono font-bold flex-shrink-0 ${med.adherence >= 80 ? 'text-[#24a148]' : med.adherence >= 65 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                      >
                        {med.adherence}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <PanelPager total={MEDS_DATA.length} page={medsPage} onPage={setMedsPage} />
            </div>

            {/* OPEN CARE GAPS */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="ClipboardDocumentListIcon" size={13} className="text-[#0043ce]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Open Care Gaps</span>
                <span className="ml-auto bg-[#da1e28] text-white text-2xs font-bold px-1.5 py-0.5">
                  {CARE_GAPS_ENHANCED.filter((g) => !closedGaps.includes(g.id)).length}
                </span>
              </div>
              {/* Sub-header */}
              <div className="px-3 py-1.5 bg-carbon-gray-10 border-b border-carbon-gray-20 flex items-center gap-1 flex-shrink-0">
                <span className="text-2xs px-1 py-0.5 bg-[#d0e2ff] text-[#0043ce] font-semibold">
                  HEDIS
                </span>
                <span className="text-2xs px-1 py-0.5 bg-[#defbe6] text-[#0e6027] font-semibold">
                  MIPS
                </span>
                <span className="text-2xs text-carbon-gray-40 italic ml-1">STARS excluded</span>
              </div>
              <div className="flex-1 divide-y divide-carbon-gray-10">
                {paginate(CARE_GAPS_ENHANCED, gapsPage).map((gap) => {
                  const isClosed = closedGaps.includes(gap.id);
                  const statusStyle = GAP_STATUS_STYLE[gap.status];
                  const programColor =
                    gap.program === 'HEDIS'
                      ? 'bg-[#d0e2ff] text-[#0043ce]'
                      : 'bg-[#defbe6] text-[#0e6027]';
                  return (
                    <div
                      key={gap.id}
                      className={`px-3 py-2 ${isClosed ? 'opacity-50 bg-[#defbe6]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={`text-2xs font-semibold px-1 py-0.5 flex-shrink-0 ${programColor}`}
                          >
                            {gap.program}
                          </span>
                          <p className="text-2xs font-medium text-carbon-gray-100 truncate">
                            {gap.name}
                          </p>
                        </div>
                        <span className="text-2xs font-mono text-carbon-gray-50 flex-shrink-0">
                          {gap.cmsMips}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <div
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusStyle.dot}`}
                          />
                          <span
                            className={`text-2xs font-semibold px-1 py-0.5 ${statusStyle.badge}`}
                          >
                            {isClosed ? 'Closed OK' : statusStyle.label}
                          </span>
                        </div>
                        {!isClosed &&
                          (gap.status === 'Not Started' ? (
                            <button
                              onClick={() => setCloseGapTarget(gap)}
                              className="text-2xs font-semibold px-2 py-0.5 bg-[#0043ce] text-white hover:bg-[#0035b3] transition-colors"
                            >
                              Close Gap
                            </button>
                          ) : gap.status === 'Waiting on Patient' ? (
                            <button className="text-2xs font-semibold px-2 py-0.5 bg-[#f1c21b] text-[#b45309] hover:bg-[#e8b800] transition-colors">
                              Remind
                            </button>
                          ) : (
                            <button className="text-2xs font-semibold px-2 py-0.5 border border-[#0043ce] text-[#0043ce] hover:bg-[#edf5ff] transition-colors">
                              View
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-carbon-gray-20 px-3 py-1.5 bg-[#f4f4f4] flex items-center gap-1.5 flex-shrink-0">
                <Icon name="TrophyIcon" size={10} className="text-[#0e6027]" />
                <span className="text-2xs text-carbon-gray-70">
                  MIPS Impact:{' '}
                  <span className="font-mono font-semibold text-[#0043ce]">Est. +12 pts</span>
                </span>
              </div>
              <PanelPager total={CARE_GAPS_ENHANCED.length} page={gapsPage} onPage={setGapsPage} />
            </div>

            {/* LABS & VITALS */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="BeakerIcon" size={13} className="text-[#0043ce]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Labs & Vitals</span>
                <span className="ml-auto text-2xs text-[#da1e28] font-semibold">
                  {LABS_DATA.filter((l) => l.flag).length} flagged
                </span>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 divide-x divide-y divide-carbon-gray-10">
                  {paginate(LABS_DATA, labsPage).map((lab, idx) => (
                    <div key={idx} className={`px-3 py-2.5 ${lab.flag ? 'bg-[#fff8f8]' : ''}`}>
                      <div className="flex items-center gap-1 mb-0.5">
                        {lab.flag && (
                          <Icon name="ExclamationCircleIcon" size={9} className="text-[#da1e28]" />
                        )}
                        <p className="text-2xs text-carbon-gray-50 truncate">{lab.name}</p>
                      </div>
                      <p
                        className={`text-sm font-mono font-bold ${lab.flag ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
                      >
                        {lab.value}
                      </p>
                      <p className="text-2xs text-carbon-gray-40">Ref: {lab.ref}</p>
                      <p className="text-2xs text-carbon-gray-30">{lab.date}</p>
                    </div>
                  ))}
                </div>
              </div>
              <PanelPager total={LABS_DATA.length} page={labsPage} onPage={setLabsPage} />
            </div>
          </div>

          {/* ── ROW 2: 4 columns — Potential Undiagnosed | Vitals Trend | Recent Clinical Activity | Active Referrals ── */}
          {/* NOTE: Recent Clinical Activity is col 3, Active Referrals is col 4 (swapped per request) */}
          <div className="grid grid-cols-4 gap-3">
            {/* POTENTIAL UNDIAGNOSED CONDITIONS */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="DocumentMagnifyingGlassIcon" size={13} className="text-[#b45309]" />
                <span className="text-xs font-semibold text-carbon-gray-100">
                  Potential Undiagnosed
                </span>
                <button
                  onClick={() => setShowCdi(!showCdi)}
                  className={`ml-auto relative inline-flex h-4 w-8 items-center rounded-full transition-colors flex-shrink-0 ${showCdi ? 'bg-[#b45309]' : 'bg-carbon-gray-30'}`}
                  role="switch"
                  aria-checked={showCdi}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${showCdi ? 'translate-x-4' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
              {!showCdi ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                  <Icon
                    name="DocumentMagnifyingGlassIcon"
                    size={24}
                    className="text-carbon-gray-30 mx-auto mb-2"
                  />
                  <p className="text-2xs text-carbon-gray-50 mb-1">
                    Toggle to reveal CDI opportunities
                  </p>
                  <p className="text-xs font-bold text-[#b45309]">
                    {CDI_OPPORTUNITIES.length} suspects
                  </p>
                  <p className="text-xs font-bold text-[#b45309]">
                    ${(totalRevenueAtRisk / 1000).toFixed(1)}K at risk
                  </p>
                  <p className="text-2xs text-carbon-gray-40 mt-1">
                    RAF +{totalRafAtRisk.toFixed(2)}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex-1 divide-y divide-carbon-gray-10">
                    {paginate(CDI_OPPORTUNITIES, cdiPage).map((cdi) => {
                      const isExpanded = expandedCdi === cdi.id;
                      const isConfirmed = confirmedCdis.includes(cdi.id);
                      return (
                        <div key={cdi.id} className={isConfirmed ? 'opacity-50' : ''}>
                          <div className="px-3 py-2">
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <div className="min-w-0">
                                <p className="text-2xs font-semibold text-carbon-gray-100 leading-tight">
                                  {cdi.condition}
                                </p>
                                <p className="text-2xs text-carbon-gray-50">
                                  {cdi.icd} · {cdi.hcc}
                                </p>
                              </div>
                              <span className="text-2xs font-mono font-bold text-[#0e6027] flex-shrink-0">
                                {cdi.rafDelta}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-carbon-gray-20">
                                <div
                                  className={`h-full ${cdi.confidence >= 85 ? 'bg-[#24a148]' : 'bg-[#f1c21b]'}`}
                                  style={{ width: `${cdi.confidence}%` }}
                                />
                              </div>
                              <span className="text-2xs font-mono text-carbon-gray-70">
                                {cdi.confidence}%
                              </span>
                              <button
                                onClick={() => setExpandedCdi(isExpanded ? null : cdi.id)}
                                className={`text-2xs font-semibold px-1.5 py-0.5 border transition-colors flex items-center gap-0.5 ${isExpanded ? 'bg-[#b45309] text-white border-[#b45309]' : 'bg-white text-[#b45309] border-[#b45309] hover:bg-[#fdf6dd]'}`}
                              >
                                DX Evidence{' '}
                                <Icon
                                  name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                                  size={8}
                                />
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="bg-[#fdf6dd] border-t border-[#f1c21b] px-3 py-2.5 space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {cdi.evidenceSources.map((src) => (
                                  <span
                                    key={src}
                                    className={`text-2xs font-semibold px-1.5 py-0.5 ${SOURCE_BADGE[src] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
                                  >
                                    {src}
                                  </span>
                                ))}
                              </div>
                              <div className="space-y-1">
                                {cdi.signals.map((sig, i) => (
                                  <div
                                    key={i}
                                    className={`flex items-center gap-1.5 px-2 py-1 text-2xs border ${sig.flagged ? 'bg-[#fff8f8] border-[#ffb3b8]' : 'bg-white border-carbon-gray-20'}`}
                                  >
                                    <span
                                      className={`font-semibold px-1 py-0.5 text-2xs ${SOURCE_BADGE[sig.source] || ''}`}
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
                              <p className="text-2xs text-carbon-gray-70 bg-white border border-carbon-gray-20 px-2 py-1.5 leading-relaxed">
                                {cdi.justification}
                              </p>
                              <div className="bg-[#d0e2ff] border border-[#97c1ff] px-2 py-1.5 flex items-start gap-1.5">
                                <Icon
                                  name="InformationCircleIcon"
                                  size={10}
                                  className="text-[#0043ce] flex-shrink-0 mt-0.5"
                                />
                                <p className="text-2xs text-[#0043ce]">{cdi.icd10Guidance}</p>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                {isConfirmed ? (
                                  <span className="text-2xs font-semibold text-[#24a148] flex items-center gap-1">
                                    <Icon name="CheckCircleIcon" size={11} /> Confirmed
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDocTarget(cdi)}
                                    className="text-2xs font-semibold px-2.5 py-1.5 bg-[#0e6027] text-white hover:bg-[#0a4d1e] transition-colors flex items-center gap-1"
                                  >
                                    <Icon name="CheckIcon" size={10} /> Confirm & Document →
                                  </button>
                                )}
                                <button
                                  onClick={() => setExpandedCdi(null)}
                                  className="text-2xs px-2 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                                >
                                  Defer
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <PanelPager total={CDI_OPPORTUNITIES.length} page={cdiPage} onPage={setCdiPage} />
                </>
              )}
            </div>

            {/* VITALS TREND SPARKLINES */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="ArrowTrendingUpIcon" size={13} className="text-[#da1e28]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Vitals Trend</span>
                <span className="ml-auto text-2xs text-carbon-gray-50">4 quarters</span>
              </div>
              <div className="flex-1 divide-y divide-carbon-gray-10">
                {paginate(VITALS_TREND, vitalsPage).map((vt, idx) => (
                  <div key={idx} className="px-3 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-carbon-gray-100">{vt.label}</p>
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold font-mono ${vt.flag ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                        >
                          {vt.values[vt.values.length - 1]}
                        </span>
                        <span className="text-2xs text-carbon-gray-50 ml-1">{vt.unit}</span>
                        {vt.flag && (
                          <span className="ml-1 text-2xs font-bold text-[#da1e28]">→</span>
                        )}
                      </div>
                    </div>
                    <Sparkline values={vt.values} flag={vt.flag} />
                    <div className="flex justify-between mt-1">
                      <span className="text-2xs text-carbon-gray-40">{vt.dates[0]}</span>
                      <span className="text-2xs text-carbon-gray-40">
                        {vt.dates[vt.dates.length - 1]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <PanelPager total={VITALS_TREND.length} page={vitalsPage} onPage={setVitalsPage} />
            </div>

            {/* RECENT CLINICAL ACTIVITY — moved to col 3 (one left) */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="ClockIcon" size={13} className="text-[#0043ce]" />
                <span className="text-xs font-semibold text-carbon-gray-100">
                  Recent Clinical Activity
                </span>
              </div>
              <div className="flex-1 divide-y divide-carbon-gray-10">
                {paginate(RECENT_ACTIVITY, activityPage).map((act, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-3 flex items-start gap-2.5 ${act.flag ? 'bg-[#fff8f8]' : ''}`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${act.flag ? 'bg-[#da1e28]' : 'bg-carbon-gray-40'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`text-2xs font-bold px-1.5 py-0.5 flex-shrink-0 ${act.type === 'ER' ? 'bg-[#ffe0e0] text-[#da1e28]' : act.type === 'Lab' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-carbon-gray-10 text-carbon-gray-70'}`}
                        >
                          {act.type}
                        </span>
                        <p className="text-xs font-medium text-carbon-gray-100 truncate">
                          {act.desc}
                        </p>
                      </div>
                      <p className="text-2xs text-carbon-gray-40">{act.date}</p>
                    </div>
                    {act.flag && (
                      <Icon
                        name="ExclamationCircleIcon"
                        size={12}
                        className="text-[#da1e28] flex-shrink-0 mt-0.5"
                      />
                    )}
                  </div>
                ))}
              </div>
              <PanelPager
                total={RECENT_ACTIVITY.length}
                page={activityPage}
                onPage={setActivityPage}
              />
            </div>

            {/* ACTIVE REFERRALS + MD TRIAGE — moved to col 4 (one right) */}
            <div className="bg-white border border-carbon-gray-20 flex flex-col">
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0">
                <Icon name="ArrowTopRightOnSquareIcon" size={13} className="text-[#6929c4]" />
                <span className="text-xs font-semibold text-carbon-gray-100">Active Referrals</span>
                <span className="ml-auto bg-[#6929c4] text-white text-2xs font-bold px-1.5 py-0.5">
                  {ACTIVE_REFERRALS.filter((r) => r.status !== 'Completed').length}
                </span>
              </div>
              <div className="flex-1 divide-y divide-carbon-gray-10">
                {paginate(ACTIVE_REFERRALS, referralsPage).map((ref) => {
                  const statusStyle = REFERRAL_STATUS_STYLE[ref.status];
                  return (
                    <div key={ref.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="text-2xs font-semibold text-carbon-gray-100">
                            {ref.specialty}
                          </p>
                          <p className="text-2xs text-carbon-gray-50 truncate">
                            {ref.provider}
                            {ref.tier !== '—' ? ` · ${ref.tier}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          <span
                            className={`text-2xs font-semibold px-1.5 py-0.5 ${statusStyle.badge}`}
                          >
                            {ref.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-2xs text-carbon-gray-50 mb-2 leading-tight">
                        {ref.reason}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-2xs font-semibold px-1.5 py-0.5 ${ref.urgency === 'Urgent' ? 'bg-[#ffe0e0] text-[#da1e28]' : 'bg-carbon-gray-10 text-carbon-gray-70'}`}
                          >
                            {ref.urgency}
                          </span>
                          <span className="text-2xs text-carbon-gray-40">{ref.date}</span>
                        </div>
                        <ReferralTriageMenu referral={ref} onAction={handleReferralAction} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <PanelPager
                total={ACTIVE_REFERRALS.length}
                page={referralsPage}
                onPage={setReferralsPage}
              />
            </div>
          </div>

          {/* ── ROW 3: Full-width Financials Toggle Panel ─────────────────── */}
          <div className="bg-white border border-carbon-gray-20">
            {/* Header with toggle */}
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-3">
              <Icon name="CurrencyDollarIcon" size={15} className="text-[#0e6027]" />
              <span className="text-sm font-bold text-carbon-gray-100">
                Value-Based Performance & Financials
              </span>
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setCanViewFinancials(!canViewFinancials)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${canViewFinancials ? 'bg-[#0e6027]' : 'bg-carbon-gray-30'}`}
                  role="switch"
                  aria-checked={canViewFinancials}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${canViewFinancials ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </button>
                <span className="text-xs text-carbon-gray-50">
                  {canViewFinancials
                    ? 'Financial signals visible'
                    : 'Toggle to enable VBP financial signals'}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-2xs text-carbon-gray-50">Contract:</span>
                <span className="text-2xs font-semibold text-carbon-gray-100">
                  Humana MA-PD 2026 VBP
                </span>
              </div>
            </div>

            {canViewFinancials ? (
              <div className="px-4 py-4">
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {/* RAF Revenue at Risk */}
                  <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3">
                    <p className="text-2xs text-carbon-gray-50 mb-1">RAF Revenue at Risk</p>
                    <p className="text-2xl font-bold font-mono text-[#b45309]">
                      ${(totalRevenueAtRisk / 1000).toFixed(1)}K
                    </p>
                    <p className="text-2xs text-carbon-gray-50 mt-1">
                      {CDI_OPPORTUNITIES.length} HCC suspects · RAF +{totalRafAtRisk.toFixed(2)}
                    </p>
                  </div>
                  {/* VBP Projected Savings */}
                  <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3">
                    <p className="text-2xs text-carbon-gray-50 mb-1">VBP Projected Savings</p>
                    <p className="text-2xl font-bold font-mono text-[#0e6027]">$4,200</p>
                    <p className="text-2xs text-carbon-gray-50 mt-1">Gap closure — 5 measures</p>
                  </div>
                  {/* Prior Auth Signals */}
                  <div className="bg-[#edf5ff] border border-[#97c1ff] px-4 py-3">
                    <p className="text-2xs text-carbon-gray-50 mb-1">Prior Auth Signals</p>
                    <p className="text-2xl font-bold font-mono text-[#0043ce]">2 pending</p>
                    <p className="text-2xs text-carbon-gray-50 mt-1">Nephrology · Renal US</p>
                  </div>
                  {/* MIPS Quality Impact */}
                  <div className="bg-[#f6f2ff] border border-[#d4bbff] px-4 py-3">
                    <p className="text-2xs text-carbon-gray-50 mb-1">MIPS Quality Impact</p>
                    <p className="text-2xl font-bold font-mono text-[#6929c4]">+12 pts</p>
                    <p className="text-2xs text-carbon-gray-50 mt-1">If all open gaps closed</p>
                  </div>
                </div>
                {/* HCC suspect revenue breakdown */}
                {hccSuspects.length > 0 && (
                  <div className="border border-carbon-gray-20 divide-y divide-carbon-gray-10">
                    <div className="px-3 py-1.5 bg-carbon-gray-10 flex items-center gap-2">
                      <span className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                        HCC Suspect Revenue Breakdown
                      </span>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-carbon-gray-10">
                      {hccSuspects.map((hcc) => (
                        <div key={hcc.id} className="px-4 py-2.5">
                          <p className="text-2xs font-medium text-carbon-gray-100">
                            {hcc.hccDescription}
                          </p>
                          <p className="text-sm font-bold font-mono text-[#b45309] mt-0.5">
                            +${hcc.estimatedRevenueDelta.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-6 flex items-center justify-center gap-3">
                <Icon name="LockClosedIcon" size={20} className="text-carbon-gray-30" />
                <div>
                  <p className="text-sm font-semibold text-carbon-gray-70">
                    Financial signals hidden
                  </p>
                  <p className="text-2xs text-carbon-gray-50">
                    Enable the toggle above to view VBP performance data, RAF revenue at risk, and
                    prior auth signals
                  </p>
                </div>
              </div>
            )}

            {/* VBP Disclaimer — ALWAYS VISIBLE */}
            <div className="border-t border-[#d4bbff] bg-[#f6f2ff] px-4 py-2.5 flex items-start gap-2">
              <Icon
                name="ShieldCheckIcon"
                size={12}
                className="text-[#6929c4] flex-shrink-0 mt-0.5"
              />
              <p className="text-2xs text-[#6929c4] leading-relaxed">
                <span className="font-semibold">VBP Disclaimer:</span> Incentives per 2026 VBP
                contract with Humana MA-PD. Subject to CMS AKS VBE safe harbor and Stark VBE
                exception. Quality-based only — not tied to referral volume or patient steering.
                Financial signals are for care coordination purposes only.
              </p>
            </div>

            {/* CMS-0057-F Note — ALWAYS VISIBLE */}
            <div className="border-t border-carbon-gray-20 bg-[#f4f4f4] px-4 py-2 flex items-start gap-2">
              <Icon
                name="InformationCircleIcon"
                size={11}
                className="text-carbon-gray-40 flex-shrink-0 mt-0.5"
              />
              <p className="text-2xs text-carbon-gray-50 leading-relaxed">
                <span className="font-semibold">CMS-0057-F:</span> Provider remittances and
                payer-to-provider financial data excluded per CMS Provider Access API rule
                (CMS-0057-F). This display is compliant with applicable information blocking and
                interoperability regulations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {closeGapTarget && (
        <CloseGapModal
          gap={closeGapTarget}
          onClose={() => setCloseGapTarget(null)}
          onComplete={handleGapClose}
        />
      )}
      {confirmDocTarget && (
        <ConfirmDocumentModal
          cdi={confirmDocTarget}
          onClose={() => setConfirmDocTarget(null)}
          onComplete={handleCdiConfirm}
        />
      )}
    </div>
  );
}
