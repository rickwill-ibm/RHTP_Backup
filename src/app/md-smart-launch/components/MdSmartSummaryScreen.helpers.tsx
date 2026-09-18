'use client';
// ─── MdSmartSummaryScreen.helpers.tsx ────────────────────────────────────────
// Sub-components: Sparkline, CloseGapModal, ConfirmDocumentModal,
// ReferralTriageMenu, paginate, PanelPager.

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type GapStatusType,
  type CloseGapStep,
  type ConfirmDocStep,
  type ReferralStatus,
  CARE_GAPS_ENHANCED,
  CDI_OPPORTUNITIES,
  ACTIVE_REFERRALS,
  SOURCE_BADGE,
  PAGE_SIZE,
} from './MdSmartSummaryScreen.data';

// Infer element types from the exported arrays
type CareGapItem = (typeof CARE_GAPS_ENHANCED)[number];
type CdiItem = (typeof CDI_OPPORTUNITIES)[number];
type ReferralItem = (typeof ACTIVE_REFERRALS)[number];

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({ values, flag }: { values: number[]; flag: boolean }) {
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

export function CloseGapModal({
  gap,
  onClose,
  onComplete,
}: {
  gap: CareGapItem;
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
            <p className="text-xs font-bold text-[#3e3e3c]">Close Care Gap</p>
            <p className="text-2xs text-[#706e6b] mt-0.5">
              Mrs. Alex Kirby — {gap.name} · {gap.cmsMips}
            </p>
          </div>
          <button onClick={onClose} className="text-[#706e6b] hover:text-[#3e3e3c] p-1">
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
              className={`flex-1 flex items-center gap-2 px-4 py-2.5 text-2xs font-semibold border-b-2 transition-colors ${step === n ? 'border-[#0070d2] text-[#0070d2] bg-[#edf5ff]' : step > n ? 'border-[#24a148] text-[#24a148]' : 'border-transparent text-[#8a8886]'}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${step === n ? 'bg-[#0070d2] text-white' : step > n ? 'bg-[#24a148] text-white' : 'bg-carbon-gray-20 text-[#706e6b]'}`}
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
              <p className="text-xs font-semibold text-[#3e3e3c] mb-3">
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
                    className="accent-[#0070d2]"
                  />
                  <span className="text-xs text-[#3e3e3c]">{m}</span>
                </label>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#3e3e3c] mb-2">Supporting Sources</p>
                <div className="flex gap-2 flex-wrap">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSource(s)}
                      className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${sources.includes(s) ? 'bg-[#0070d2] text-white border-[#0070d2]' : 'bg-white text-[#706e6b] border-carbon-gray-30 hover:border-[#0070d2]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#3e3e3c] mb-2">Clinical Note</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Enter clinical note supporting gap closure..."
                  className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-[#3e3e3c] resize-none focus:outline-none focus:border-[#0070d2]"
                />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-[#f4f6f9] border border-carbon-gray-20 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-[#3e3e3c] mb-2">Closure Summary</p>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Gap</span>
                  <span className="font-medium text-[#3e3e3c]">{gap.name}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Measure</span>
                  <span className="font-medium text-[#3e3e3c]">{gap.cmsMips}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Method</span>
                  <span className="font-medium text-[#3e3e3c]">{method || '—'}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Evidence Sources</span>
                  <span className="font-medium text-[#3e3e3c]">{sources.join(', ') || '—'}</span>
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
                  className="mt-0.5 accent-[#0070d2]"
                />
                <span className="text-2xs text-[#706e6b] leading-relaxed">
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
            className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as CloseGapStep)}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-10 transition-colors"
              >
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as CloseGapStep)}
                disabled={step === 1 && !method}
                className="text-xs px-4 py-1.5 bg-[#0070d2] text-white hover:bg-[#005fb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

export function ConfirmDocumentModal({
  cdi,
  onClose,
  onComplete,
}: {
  cdi: CdiItem;
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
            <p className="text-xs font-bold text-[#3e3e3c]">Confirm Diagnosis & Document</p>
            <p className="text-2xs text-[#706e6b] mt-0.5">Mrs. Alex Kirby — {cdi.condition}</p>
          </div>
          <button onClick={onClose} className="text-[#706e6b] hover:text-[#3e3e3c] p-1">
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
              className={`flex-1 flex items-center gap-2 px-4 py-2.5 text-2xs font-semibold border-b-2 transition-colors ${step === n ? 'border-[#b45309] text-[#b45309] bg-[#fdf6dd]' : step > n ? 'border-[#24a148] text-[#24a148]' : 'border-transparent text-[#8a8886]'}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${step === n ? 'bg-[#b45309] text-white' : step > n ? 'bg-[#24a148] text-white' : 'bg-carbon-gray-20 text-[#706e6b]'}`}
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
                    className={`text-2xs font-semibold px-2 py-0.5 ${SOURCE_BADGE[src] || 'bg-carbon-gray-20 text-[#706e6b]'}`}
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
                    <span className="text-[#706e6b]">{sig.label}:</span>
                    <span
                      className={`font-medium ${sig.flagged ? 'text-[#da1e28]' : 'text-[#3e3e3c]'}`}
                    >
                      {sig.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-carbon-gray-20 px-3 py-2">
                <p className="text-2xs font-semibold text-[#706e6b] mb-1 uppercase tracking-wide">
                  Clinical Justification
                </p>
                <p className="text-2xs text-[#706e6b] leading-relaxed">{cdi.justification}</p>
              </div>
              <div className="flex items-center gap-4 bg-[#f4f6f9] px-3 py-2">
                <div>
                  <p className="text-2xs text-[#706e6b]">Confidence</p>
                  <p className="text-sm font-bold font-mono text-[#24a148]">{cdi.confidence}%</p>
                </div>
                <div>
                  <p className="text-2xs text-[#706e6b]">RAF Delta</p>
                  <p className="text-sm font-bold font-mono text-[#0e6027]">{cdi.rafDelta}</p>
                </div>
                <div>
                  <p className="text-2xs text-[#706e6b]">Revenue at Risk</p>
                  <p className="text-sm font-bold font-mono text-[#b45309]">{cdi.revenueDelta}</p>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="bg-[#f4f6f9] border border-carbon-gray-20 px-3 py-2.5">
                  <p className="text-2xs text-[#706e6b] mb-0.5">Current Code</p>
                  <p className="text-xs font-mono font-semibold text-[#3e3e3c]">
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
                <p className="text-xs font-semibold text-[#3e3e3c] mb-1.5">
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
                    <p className="text-2xs text-[#706e6b]">RAF Delta</p>
                    <p className="text-lg font-bold font-mono text-[#0e6027]">
                      {rafDeltaNum > 0 ? '+' : ''}
                      {rafDeltaNum.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-[#706e6b]">Est. Revenue Impact</p>
                    <p className="text-lg font-bold font-mono text-[#b45309]">
                      ${revenueNum.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-[#706e6b]">Submission Deadline</p>
                    <p className="text-xs font-semibold text-[#3e3e3c]">Dec 31, 2026</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-[#f4f6f9] border border-carbon-gray-20 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-[#3e3e3c] mb-2">Submission Summary</p>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Condition</span>
                  <span className="font-medium text-[#3e3e3c]">{cdi.condition}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">ICD-10 Code</span>
                  <span className="font-mono font-medium text-[#3e3e3c]">{icdOverride}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">RAF Delta</span>
                  <span className="font-mono font-semibold text-[#0e6027]">{cdi.rafDelta}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-[#706e6b]">Revenue Impact</span>
                  <span className="font-mono font-semibold text-[#b45309]">{cdi.revenueDelta}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#3e3e3c] mb-2">Submit To</p>
                <div className="flex gap-2">
                  {(['EMR', 'Payer', 'Both'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSubmitTarget(t)}
                      className={`text-xs font-semibold px-4 py-2 border transition-colors ${submitTarget === t ? 'bg-[#0070d2] text-white border-[#0070d2]' : 'bg-white text-[#706e6b] border-carbon-gray-30 hover:border-[#0070d2]'}`}
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
                  className="mt-0.5 accent-[#0070d2]"
                />
                <span className="text-2xs text-[#706e6b] leading-relaxed">
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
            className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as ConfirmDocStep)}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-10 transition-colors"
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

export function ReferralTriageMenu({
  referral,
  onAction,
}: {
  referral: ReferralItem;
  onAction: (refId: string, action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const actions: Record<ReferralStatus, Array<{ label: string; icon: string; color: string }>> = {
    'Not Sent': [
      { label: 'Approve & Send', icon: 'CheckCircleIcon', color: 'text-[#0e6027]' },
      { label: 'Modify', icon: 'PencilSquareIcon', color: 'text-[#0070d2]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
    ],
    Pending: [
      { label: 'Upgrade Urgency', icon: 'ArrowUpCircleIcon', color: 'text-[#da1e28]' },
      { label: 'Add Clinical Note', icon: 'PencilSquareIcon', color: 'text-[#0070d2]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
      { label: 'Reassign Provider', icon: 'ArrowPathIcon', color: 'text-[#b45309]' },
    ],
    Scheduled: [
      { label: 'Add Note', icon: 'PencilSquareIcon', color: 'text-[#0070d2]' },
      { label: 'View Appointment', icon: 'CalendarIcon', color: 'text-[#0070d2]' },
      { label: 'Cancel', icon: 'XCircleIcon', color: 'text-[#da1e28]' },
    ],
    Completed: [
      { label: 'View Outcome', icon: 'DocumentTextIcon', color: 'text-[#0070d2]' },
      { label: 'Create Follow-up', icon: 'PlusCircleIcon', color: 'text-[#0e6027]' },
    ],
  };
  const menuActions = actions[referral.status];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-2xs font-semibold px-2 py-1 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-10 transition-colors flex items-center gap-1 whitespace-nowrap"
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
              <span className="text-[#3e3e3c]">{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

export function paginate<T>(arr: T[], page: number): T[] {
  return arr.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}

export function PanelPager({
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
    <div className="border-t border-carbon-gray-20 px-3 py-1.5 flex items-center justify-between bg-[#f4f6f9] flex-shrink-0">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="text-2xs font-semibold px-2 py-0.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      <span className="text-2xs text-[#706e6b]">
        {page + 1} / {totalPages}
        <span className="ml-1 text-[#8a8886]">({total} total)</span>
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="text-2xs font-semibold px-2 py-0.5 border border-carbon-gray-30 text-[#706e6b] hover:bg-carbon-gray-20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
