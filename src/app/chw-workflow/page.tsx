'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { CHW_VISITS, OUTREACH_LOG, CBOS, PROGRAM_DOMAIN_COLORS } from '@/lib/socialMockData';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { effectiveMemberId } from '@/lib/careTeam/identity';
import { getMemberName } from '@/lib/careTeam/members';
import { visitPlanFor } from '@/lib/careTeam/visitPlan';
import ActionQueue from '@/app/care-manager/components/ActionQueue';
import { buildTriageQueue, type TaskInput } from '@/lib/careTeam/triage';
import {
  recommendResources,
  citizenNBAs,
  citizenNeeds,
  type CitizenNeed,
} from '@/lib/careTeam/graph/resources';
import { getVisiblePatients } from '@/lib/patientRegistry';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { initiateReferral } from '@/lib/services/referralService';
import { toast } from 'sonner';

type CBORecord = (typeof CBOS)[number];

const PRIORITY_COLORS: Record<string, string> = {
  High: '#da1e28',
  Medium: '#b45309',
  Low: '#198038',
};
const OUTCOME_COLORS: Record<string, string> = {
  Reached: '#0e6027',
  'Left VM': '#b45309',
  'No Answer': '#6f6f6f',
  Completed: '#0043ce',
};
const CAPACITY_COLORS: Record<string, string> = {
  Accepting: '#0e6027',
  Waitlist: '#b45309',
  Full: '#da1e28',
};

// ─── Clinical Context per Patient ─────────────────────────────────────────────

interface ClinicalContext {
  episodeType: string;
  episodeStatus: 'Active' | 'Stable' | 'Closed';
  daysInEpisode: number;
  careManager: string;
  openCareGaps: { measure: string; status: 'Overdue' | 'Due Soon' | 'Open' }[];
  lastCMContact: string;
  nextCMAction: string;
  comorbidities: string[];
}

const CLINICAL_CONTEXT: Record<string, ClinicalContext> = {
  MARIA_SD_001: {
    episodeType: 'Pre-Diabetic / Postpartum',
    episodeStatus: 'Active',
    daysInEpisode: 427,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'A1C Recheck (Pre-Diabetic)', status: 'Overdue' },
      { measure: 'Postpartum Visit (427d overdue)', status: 'Overdue' },
      { measure: 'Edinburgh PND Screening', status: 'Overdue' },
      { measure: 'Well-Child 24mo — Sophia', status: 'Due Soon' },
    ],
    lastCMContact: '2026-05-28',
    nextCMAction: 'SNAP renewal + WIC enrollment by 6/4',
    comorbidities: [
      'Pre-Diabetes (A1C 6.2%)',
      'Postpartum Depression (unmanaged)',
      'Food Insecurity',
      'Housing Instability',
    ],
  },
  'P-10042': {
    episodeType: 'COPD Exacerbation',
    episodeStatus: 'Active',
    daysInEpisode: 14,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'Spirometry (COPD)', status: 'Overdue' },
      { measure: 'Flu Vaccine', status: 'Due Soon' },
      { measure: 'Medication Reconciliation', status: 'Open' },
    ],
    lastCMContact: '2026-05-28',
    nextCMAction: 'Medication reconciliation by 6/4',
    comorbidities: ['COPD', 'Anxiety', 'Food Insecurity'],
  },
  'P-10043': {
    episodeType: 'CHF Exacerbation',
    episodeStatus: 'Active',
    daysInEpisode: 47,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'SNF Discharge Planning', status: 'Overdue' },
      { measure: 'BNP Lab Panel', status: 'Due Soon' },
    ],
    lastCMContact: '2026-05-30',
    nextCMAction: 'SNF discharge authorization by 6/2',
    comorbidities: ['CHF', 'CKD Stage 3', 'Major Depression', 'Housing Instability'],
  },
  'P-10044': {
    episodeType: 'Diabetes Management',
    episodeStatus: 'Stable',
    daysInEpisode: 61,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'A1C Recheck', status: 'Due Soon' },
      { measure: 'Retinal Exam', status: 'Overdue' },
      { measure: 'Nephropathy Screening', status: 'Open' },
    ],
    lastCMContact: '2026-05-28',
    nextCMAction: 'A1C recheck scheduling by 6/7',
    comorbidities: ['T2DM', 'Hypertension', 'SUD — Alcohol', 'Utilities Need'],
  },
  'P-10045': {
    episodeType: 'Pneumonia',
    episodeStatus: 'Active',
    daysInEpisode: 9,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'Home Health Referral', status: 'Overdue' },
      { measure: 'Pneumococcal Vaccine', status: 'Open' },
    ],
    lastCMContact: '2026-05-31',
    nextCMAction: 'Home health agency contact by 6/5',
    comorbidities: ['Pneumonia', 'Adjustment Disorder'],
  },
  'P-10046': {
    episodeType: 'Hip Replacement',
    episodeStatus: 'Active',
    daysInEpisode: 22,
    careManager: 'Sarah Johnson',
    openCareGaps: [
      { measure: 'PT Evaluation', status: 'Due Soon' },
      { measure: 'Fall Risk Assessment', status: 'Open' },
    ],
    lastCMContact: '2026-05-31',
    nextCMAction: 'PT evaluation scheduling by 6/3',
    comorbidities: ['Osteoarthritis', 'Hypertension'],
  },
};

// ─── Visit Checklist Items per purpose type ───────────────────────────────────
const VISIT_CHECKLIST = [
  { id: 'safety', label: 'Home safety assessment completed' },
  { id: 'meds', label: 'Medication review & reconciliation' },
  { id: 'vitals', label: 'Vital signs recorded (BP, weight, O2)' },
  { id: 'sdoh', label: 'SDOH screening updated (PRAPARE)' },
  { id: 'goals', label: 'Care plan goals reviewed with patient' },
  { id: 'referrals', label: 'Pending referrals / benefits confirmed' },
];

// ─── Start Visit Modal ────────────────────────────────────────────────────────
interface VisitData {
  id: string;
  patient: string;
  patientId: string;
  date: string;
  time: string;
  address: string;
  purpose: string;
}

function StartVisitModal({ visit, onClose }: { visit: VisitData; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const plan = visitPlanFor(visit.patientId);
  const planItems = plan.items;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white w-[480px] shadow-2xl flex flex-col items-center p-10 gap-4">
          <div className="w-16 h-16 rounded-full bg-[#defbe6] flex items-center justify-center">
            <Icon name="CheckCircleIcon" size={36} className="text-[#198038]" />
          </div>
          <p className="text-lg font-bold text-carbon-gray-100">Visit Logged</p>
          <p className="text-sm text-carbon-gray-50 text-center">
            Home visit for{' '}
            <span className="font-semibold text-carbon-gray-100">{visit.patient}</span> has been
            recorded.
            {checked.size} of {planItems.length} next-best-actions completed.
          </p>
          {notes && (
            <div className="w-full bg-carbon-gray-10 border border-carbon-gray-20 p-3 text-xs text-carbon-gray-70 leading-relaxed">
              <span className="font-semibold text-carbon-gray-100 block mb-1">Visit Notes:</span>
              {notes}
            </div>
          )}
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 bg-[#198038] text-white text-sm font-semibold hover:bg-[#0e6027] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-[520px] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#defbe6] flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-[#044317]">Start Home Visit</p>
            <p className="text-xs text-[#198038] mt-0.5">
              {visit.patient} · {visit.patientId} · {visit.date} at {visit.time}
            </p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Visit info */}
          <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3 flex items-start gap-3">
            <Icon
              name="MapPinIcon"
              size={14}
              className="text-carbon-gray-50 flex-shrink-0 mt-0.5"
            />
            <div>
              <p className="text-xs font-semibold text-carbon-gray-100">{visit.address}</p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">{visit.purpose}</p>
            </div>
          </div>

          {/* NBA-driven visit plan */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Icon name="SparklesIcon" size={13} className="text-[#0043ce]" />
              <p className="text-xs font-semibold text-carbon-gray-100">
                Next Best Actions — this visit
              </p>
            </div>
            {plan.keystoneNote && (
              <p className="text-2xs text-[#0043ce] bg-[#edf5ff] border border-[#97c1ff] px-2 py-1 mb-2.5">
                {plan.keystoneNote}
              </p>
            )}
            <div className="space-y-2">
              {planItems.map((item) => (
                <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                  <div
                    onClick={() => toggle(item.id)}
                    className={`w-4 h-4 mt-0.5 border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      checked.has(item.id)
                        ? 'bg-[#198038] border-[#198038]'
                        : 'border-carbon-gray-30 group-hover:border-[#198038]'
                    }`}
                  >
                    {checked.has(item.id) && (
                      <Icon name="CheckIcon" size={10} className="text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs transition-colors ${checked.has(item.id) ? 'text-carbon-gray-50 line-through' : 'text-carbon-gray-100'}`}
                      >
                        {item.label}
                      </span>
                      {item.keystone && (
                        <span className="text-2xs font-bold px-1 py-0.5 bg-[#fff1f1] text-[#da1e28]">
                          KEYSTONE
                        </span>
                      )}
                    </div>
                    {item.impact && <p className="text-2xs text-carbon-gray-50">{item.impact}</p>}
                  </div>
                </label>
              ))}
            </div>
            <p className="text-2xs text-carbon-gray-50 mt-2">
              {checked.size} of {planItems.length} completed
            </p>
          </div>

          {/* Visit notes */}
          <div>
            <label className="text-xs font-semibold text-carbon-gray-100 block mb-1.5">
              Visit Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Document observations, patient status, follow-up actions needed..."
              className="w-full border border-carbon-gray-20 p-3 text-xs text-carbon-gray-100 placeholder-carbon-gray-40 resize-none focus:outline-none focus:border-[#198038]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-carbon-gray-20 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setSubmitted(true);
              // Live FHIR: PUT Task for this visit → completed (fire-and-forget)
              if (!getFhirMockMode()) {
                const fhirId = PLATFORM_TO_FHIR_ID_MAP[visit.patientId] ?? visit.patientId;
                getFhirClient()
                  .create({
                    resourceType: 'Task',
                    status: 'completed',
                    intent: 'order',
                    priority: 'routine',
                    description: `CHW home visit — ${visit.purpose}`,
                    for: { reference: `Patient/${fhirId}`, display: visit.patient },
                    owner: { reference: 'Practitioner/practitioner-jon', display: 'CHW — Social' },
                    note:
                      checked.size > 0
                        ? [
                            {
                              text: `${checked.size}/${planItems.length} NBAs completed. ${notes}`.trim(),
                            },
                          ]
                        : undefined,
                    executionPeriod: { end: new Date().toISOString() },
                  })
                  .catch((err) => console.warn('[CHWWorkflow] Task create failed:', err));
              }
            }}
            className="px-5 py-2 text-xs font-semibold bg-[#198038] text-white hover:bg-[#0e6027] transition-colors flex items-center gap-2"
          >
            <Icon name="CheckCircleIcon" size={13} />
            Complete Visit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reschedule Modal ─────────────────────────────────────────────────────────
const RESCHEDULE_REASONS = [
  'Patient request',
  'CHW schedule conflict',
  'Patient not home',
  'Transportation issue',
  'Medical appointment conflict',
  'Weather / safety concern',
  'Other',
];

function RescheduleModal({ visit, onClose }: { visit: VisitData; onClose: () => void }) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = newDate && newTime && reason;

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white w-[440px] shadow-2xl flex flex-col items-center p-10 gap-4">
          <div className="w-16 h-16 rounded-full bg-[#fdf6dd] flex items-center justify-center">
            <Icon name="CalendarIcon" size={36} className="text-[#b45309]" />
          </div>
          <p className="text-lg font-bold text-carbon-gray-100">Visit Rescheduled</p>
          <p className="text-sm text-carbon-gray-50 text-center">
            <span className="font-semibold text-carbon-gray-100">{visit.patient}</span>'s visit has
            been rescheduled to{' '}
            <span className="font-semibold text-carbon-gray-100">
              {newDate} at {newTime}
            </span>
            .
          </p>
          <div className="w-full bg-carbon-gray-10 border border-carbon-gray-20 p-3 text-xs text-carbon-gray-70">
            <span className="font-semibold text-carbon-gray-100">Reason: </span>
            {reason}
          </div>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 bg-[#b45309] text-white text-sm font-semibold hover:bg-[#8a3800] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-[460px] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#fdf6dd] flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-[#4a2000]">Reschedule Visit</p>
            <p className="text-xs text-[#b45309] mt-0.5">
              {visit.patient} · Currently {visit.date} at {visit.time}
            </p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* New date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-carbon-gray-100 block mb-1.5">
                New Date <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-carbon-gray-100 block mb-1.5">
                New Time <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309]"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-carbon-gray-100 block mb-1.5">
              Reason for Reschedule <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-carbon-gray-20 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
            >
              <option value="">Select reason...</option>
              {RESCHEDULE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-carbon-gray-100 block mb-1.5">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional — any context for the reschedule..."
              className="w-full border border-carbon-gray-20 p-3 text-xs text-carbon-gray-100 placeholder-carbon-gray-40 resize-none focus:outline-none focus:border-[#b45309]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-carbon-gray-20 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => setSubmitted(true)}
            className="px-5 py-2 text-xs font-semibold bg-[#b45309] text-white hover:bg-[#8a3800] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Icon name="CalendarIcon" size={13} />
            Confirm Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clinical Context Panel ───────────────────────────────────────────────────
function ClinicalContextPanel({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { assignments } = useAppContext();
  const ctx = CLINICAL_CONTEXT[patientId];
  if (!ctx) return null;

  const resolvedMemberId = effectiveMemberId(patientId, assignments);
  const cmName = resolvedMemberId ? getMemberName(resolvedMemberId) : ctx.careManager;
  const cmOverridden =
    !!assignments[patientId] ||
    (resolvedMemberId ? getMemberName(resolvedMemberId) !== ctx.careManager : false);

  const episodeStatusStyle =
    ctx.episodeStatus === 'Active'
      ? 'bg-[#fdf6dd] text-[#b45309]'
      : ctx.episodeStatus === 'Stable'
        ? 'bg-[#defbe6] text-[#0e6027]'
        : 'bg-carbon-gray-10 text-carbon-gray-50';
  const gapStyle = (s: string) =>
    s === 'Overdue'
      ? 'bg-[#fff1f1] text-[#da1e28]'
      : s === 'Due Soon'
        ? 'bg-[#fdf6dd] text-[#b45309]'
        : 'bg-[#d0e2ff] text-[#0043ce]';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="pointer-events-auto w-[440px] h-full bg-white border-l border-carbon-gray-20 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between bg-[#d0e2ff]">
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">Clinical Context</p>
            <p className="text-xs text-[#0043ce]">
              Patient {patientId} — for CHW visit coordination
            </p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-70 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Episode Status */}
          <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-4">
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Active Episode
            </p>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-carbon-gray-100">{ctx.episodeType}</span>
              <span className={`text-2xs font-bold px-2 py-0.5 ${episodeStatusStyle}`}>
                {ctx.episodeStatus}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-2xs">
              <div>
                <span className="text-carbon-gray-50">Days in Episode</span>
                <p className="font-mono font-bold text-carbon-gray-100">{ctx.daysInEpisode}d</p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Care Manager</span>
                <p className="font-semibold text-carbon-gray-100">
                  {cmName}
                  {cmOverridden && (
                    <span className="ml-1 text-2xs text-[#6929c4] font-semibold">(reassigned)</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Last CM Contact</span>
                <p className="font-mono text-carbon-gray-100">{ctx.lastCMContact}</p>
              </div>
              <div>
                <span className="text-carbon-gray-50">Next CM Action</span>
                <p className="text-carbon-gray-100 leading-tight">{ctx.nextCMAction}</p>
              </div>
            </div>
          </div>

          {/* Open Care Gaps */}
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Open Care Gaps ({ctx.openCareGaps.length})
            </p>
            <div className="space-y-1.5">
              {ctx.openCareGaps.map((gap, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 bg-white border border-carbon-gray-20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name="ExclamationCircleIcon"
                      size={13}
                      className={
                        gap.status === 'Overdue'
                          ? 'text-[#da1e28]'
                          : gap.status === 'Due Soon'
                            ? 'text-[#b45309]'
                            : 'text-[#0043ce]'
                      }
                    />
                    <span className="text-xs text-carbon-gray-100">{gap.measure}</span>
                  </div>
                  <span className={`text-2xs font-bold px-1.5 py-0.5 ${gapStyle(gap.status)}`}>
                    {gap.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Comorbidities */}
          <div>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Comorbidities & Context
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ctx.comorbidities.map((c, i) => (
                <span
                  key={i}
                  className="text-2xs px-2 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-70"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Coordination Note */}
          <div className="bg-[#d9fbfb] border border-[#009d9a] p-3">
            <div className="flex items-start gap-2">
              <Icon
                name="InformationCircleIcon"
                size={14}
                className="text-[#007d79] flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-2xs font-semibold text-[#004144] mb-1">CHW Coordination Note</p>
                <p className="text-2xs text-[#007d79] leading-relaxed">
                  Share visit findings with care manager Sarah Johnson. Flag any changes in clinical
                  status, medication adherence, or new social needs that may affect the open care
                  gaps above.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-carbon-gray-20 px-5 py-4">
          <button className="w-full bg-[#0043ce] text-white text-xs font-semibold py-2 hover:bg-[#0035a8] transition-colors flex items-center justify-center gap-2">
            <Icon name="ArrowTopRightOnSquareIcon" size={13} />
            Send Update to Care Manager
          </button>
        </div>
      </div>
    </div>
  );
}

type CHWView = 'queue' | 'visits' | 'outreach' | 'resources';

const CHW_SOCIAL_TASKS: TaskInput[] = [
  {
    id: 'cs1',
    patient: 'Maria Redhawk',
    task: 'SNAP renewal + WIC re-enrollment',
    due: '2026-06-02',
    priority: 'High',
  },
  {
    id: 'cs2',
    patient: 'Maria Redhawk',
    task: 'Childcare subsidy enrollment ($487/mo)',
    due: '2026-06-04',
    priority: 'High',
  },
  {
    id: 'cs3',
    patient: 'James Wilson',
    task: 'NEMT transport setup for specialist visits',
    due: '2026-06-05',
    priority: 'Medium',
  },
  {
    id: 'cs4',
    patient: 'Dorothy Simmons',
    task: 'Housing stability — rental assistance follow-up',
    due: '2026-06-06',
    priority: 'Medium',
  },
  {
    id: 'cs5',
    patient: 'Lisa Thompson',
    task: 'Food box delivery + SNAP-Ed nutrition referral',
    due: '2026-06-08',
    priority: 'Low',
  },
];

function ReferralApprovalModal({
  cbo,
  need,
  citizenName,
  patientId,
  onClose,
}: {
  cbo: CBORecord;
  need?: CitizenNeed;
  citizenName: string;
  patientId: string;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const consentOk = cbo.capacity !== 'Full';

  const handleConfirm = async () => {
    setConfirmed(true);
    toast.success('Referral approved', { description: `${citizenName} → ${cbo.name}` });
    // Live FHIR: POST ServiceRequest + Task + AuditEvent (fire-and-forget)
    if (!getFhirMockMode()) {
      const fhirId = PLATFORM_TO_FHIR_ID_MAP[patientId] ?? patientId;
      try {
        const result = await initiateReferral({
          patientId: fhirId,
          requesterId: 'practitioner-jon', // CHW submitting the referral
          performerId: `org-${cbo.id}`,
          serviceCode: `${cbo.domain.toLowerCase().replace(/\s+/g, '-')}-referral`,
          serviceDisplay: `${cbo.name} — ${cbo.domain}`,
          reasonCode: `${cbo.domain.toLowerCase().replace(/\s+/g, '-')}-referral`,
          reasonDisplay: need?.label ?? cbo.name,
          priority: 'routine',
          notes: `CHW referral — ${citizenName} → ${cbo.name} · ${cbo.domain}`,
          gainshareEligible: false,
        });
        await getFhirClient()
          .create({
            resourceType: 'AuditEvent',
            type: {
              system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
              code: 'rest',
              display: 'RESTful Operation',
            },
            action: 'C',
            recorded: new Date().toISOString(),
            outcome: '0',
            agent: [
              {
                who: { reference: 'Practitioner/practitioner-jon', display: 'CHW — Social' },
                requestor: true,
              },
            ],
            source: { observer: { display: 'TCOC Platform — CHW Workflow' } },
            entity: [
              {
                what: { reference: `ServiceRequest/${result.serviceRequest.id}` },
                description: `CHW referral — ${cbo.domain}`,
              },
              {
                what: { reference: `Task/${result.task.id}` },
                description: `Referral task for ${citizenName}`,
              },
            ],
          })
          .catch(() => {
            /* AuditEvent failure is non-fatal */
          });
      } catch (err) {
        console.warn('[CHWWorkflow] FHIR referral write failed:', err);
      }
    }
  };

  if (confirmed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white w-[460px] shadow-2xl flex flex-col items-center p-10 gap-3">
          <div className="w-14 h-14 rounded-full bg-[#defbe6] flex items-center justify-center">
            <Icon name="CheckCircleIcon" size={32} className="text-[#198038]" />
          </div>
          <p className="text-base font-bold text-carbon-gray-100">Referral Approved</p>
          <p className="text-xs text-carbon-gray-50 text-center">
            Referral task created for{' '}
            <span className="font-semibold text-carbon-gray-100">{citizenName}</span> &rarr;{' '}
            {cbo.name}. Owner notified &middot; audit logged.
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2 bg-[#198038] text-white text-sm font-semibold hover:bg-[#0e6027]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-carbon-gray-20 bg-[#edf5ff] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="SparklesIcon" size={15} className="text-[#0043ce]" />
            <p className="text-sm font-semibold text-[#0043ce]">Approve Referral</p>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 text-xs">
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Citizen</span>
            <span className="font-semibold text-carbon-gray-100">{citizenName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Need addressed</span>
            <span className="font-medium text-carbon-gray-100">
              {need ? `${need.label} \u00b7 ${need.severity}` : 'General referral'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Resource</span>
            <span className="font-medium text-carbon-gray-100">
              {cbo.name} ({cbo.domain})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Capacity &middot; avg close</span>
            <span className="font-medium text-carbon-gray-100">
              {cbo.capacity} &middot; {cbo.avgDaysToClose}d
            </span>
          </div>
          {need?.keystone && need.blockedGaps?.length ? (
            <div className="bg-[#fff1f1] border border-[#ffb3b8] px-2 py-1.5 text-2xs text-[#da1e28] font-semibold">
              Keystone — unblocks {need.blockedGaps.join(', ')}
            </div>
          ) : null}
          {need?.cypher && (
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-2 py-1.5">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Cypher origin</p>
              <p className="font-mono text-2xs text-[#0e6027] break-all">{need.cypher}</p>
            </div>
          )}
          <div
            className={`flex items-center gap-1.5 text-2xs font-semibold ${consentOk ? 'text-[#0e6027]' : 'text-[#b45309]'}`}
          >
            <Icon name={consentOk ? 'ShieldCheckIcon' : 'ExclamationTriangleIcon'} size={12} />
            {consentOk
              ? 'Consent on file — cross-org share permitted'
              : 'Resource at capacity (Full) — confirm waitlist placement'}
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Owner</span>
            <span className="font-medium text-carbon-gray-100">CHW &middot; Social</span>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 bg-white hover:bg-carbon-gray-10"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0043ce] hover:bg-[#002d9c]"
          >
            <Icon name="CheckIcon" size={12} /> Confirm Referral
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CHWWorkflowPage() {
  const router = useRouter();
  const { assignments, referralTasks } = useAppContext();
  const { activeCitizenId, setActiveCitizen } = useActiveCitizen();
  const activePatientId = activeCitizenId;
  const activePatient = getPatientById(activePatientId);
  const [view, setView] = useState<CHWView>('queue');
  const [referralTarget, setReferralTarget] = useState<{
    cbo: CBORecord;
    need?: CitizenNeed;
  } | null>(null);
  const [fhirTaskCount, setFhirTaskCount] = useState<number | null>(null);
  const fhirLoadedRef = useRef(false);

  // Live FHIR: fetch Tasks assigned to the CHW practitioner on mount
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Task', {
        owner: 'Practitioner/practitioner-jon',
        _count: 50,
        status: 'requested,accepted,in-progress',
      })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? []).filter(
          (e: any) => e?.resource?.resourceType === 'Task'
        ).length;
        if (count > 0) setFhirTaskCount(count);
      })
      .catch(() => {
        /* non-fatal — queue still shows static tasks */
      });
  }, []);
  const recommendedResources = recommendResources(activePatientId, CBOS);
  const nbas = citizenNBAs(activePatientId, CBOS);
  const panelDoNow = buildTriageQueue({ adt: [], tasks: CHW_SOCIAL_TASKS, transitions: [] }).filter(
    (sig) => sig.domain === 'Social' && sig.tier === 'Do Now'
  ).length;
  const citizensWithNeeds = getVisiblePatients(getFhirMockMode()).filter(
    (c) => citizenNeeds(c.platformId).length > 0
  ).length;
  const keystoneUnblocks = nbas.filter((n) => n.keystone).length;
  const [clinicalContextPatient, setClinicalContextPatient] = useState<string | null>(null);
  const [startVisitData, setStartVisitData] = useState<VisitData | null>(null);
  const [rescheduleData, setRescheduleData] = useState<VisitData | null>(null);

  return (
    <AppLayout
      pageTitle="CHW Workflow"
      breadcrumbs={[{ label: 'Care Management', href: '/care-manager' }, { label: 'CHW Workflow' }]}
      contextBanner={
        <div className="bg-[#d9fbfb] border-b border-[#009d9a] px-6 py-2 flex items-center gap-4">
          <Icon name="UserCircleIcon" size={16} style={{ color: '#007d79' }} />
          <span className="text-xs font-semibold text-[#004144]">
            Sarah Johnson — Care Manager · Bennett County, SD
          </span>
          <span className="text-xs text-[#007d79]">
            5 visits scheduled this week · 2 outreach attempts pending
          </span>
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
              background:
                activePatient.episodeStatus === 'Active'
                  ? '#d0e2ff'
                  : activePatient.episodeStatus === 'Escalated'
                    ? '#fff1f1'
                    : '#defbe6',
              color:
                activePatient.episodeStatus === 'Active'
                  ? '#0043ce'
                  : activePatient.episodeStatus === 'Escalated'
                    ? '#da1e28'
                    : '#0e6027',
              borderColor:
                activePatient.episodeStatus === 'Active'
                  ? '#97c1ff'
                  : activePatient.episodeStatus === 'Escalated'
                    ? '#da1e28'
                    : '#24a148',
            }}
          >
            {activePatient.episodeType} · {activePatient.episodeStatus}
          </span>
          <span className="text-2xs text-[#a8c8e8] ml-auto">
            {activePatient.openCareGaps} open gaps
          </span>
        </div>
      )}
      {/* Agentic Next Best Actions — active citizen */}
      <div className="bg-white border border-[#97c1ff] mb-4">
        <div className="px-4 py-2.5 bg-[#edf5ff] border-b border-carbon-gray-20 flex items-center gap-2 flex-wrap">
          <Icon name="SparklesIcon" size={15} className="text-[#0043ce]" />
          <p className="text-sm font-semibold text-[#0043ce]">
            Agentic Next Best Actions — {activePatient?.name ?? 'citizen'}
          </p>
          <span className="text-2xs text-carbon-gray-50">ranked by the agent coalition</span>
        </div>
        <div className="divide-y divide-carbon-gray-20">
          {nbas.slice(0, 3).map((n, i) => (
            <div key={n.id} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs font-bold text-[#0043ce] w-5 flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-carbon-gray-100">{n.action}</span>
                  {n.keystone && (
                    <span className="text-2xs font-bold px-1 py-0.5 bg-[#fff1f1] text-[#da1e28]">
                      KEYSTONE
                    </span>
                  )}
                  <span
                    className={`text-2xs font-semibold px-1.5 py-0.5 ${n.confidence === 'High' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
                  >
                    {n.confidence}
                  </span>
                </div>
                <p className="text-2xs text-carbon-gray-70 mt-0.5">{n.impact}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-2xs text-carbon-gray-50">
                  <span>
                    <span className="font-semibold text-carbon-gray-70">Why now:</span> {n.whyNow}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-[#6929c4]">
                    <Icon name="CpuChipIcon" size={11} /> {n.agent}
                  </span>
                  <span>·</span>
                  <span>
                    {n.cbo.name} ({n.cbo.capacity}, {n.cbo.avgDaysToClose}d)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setReferralTarget({ cbo: n.cbo, need: n.need })}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] whitespace-nowrap flex-shrink-0"
              >
                <Icon name="BoltIcon" size={11} /> Act
              </button>
            </div>
          ))}
          {nbas.length === 0 && (
            <div className="px-4 py-4 text-2xs text-carbon-gray-50">
              No open social needs for {activePatient?.name ?? 'this citizen'} — caseload clear.
            </div>
          )}
        </div>
      </div>

      {/* Insight Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'Do-Now Signals',
            value: String(panelDoNow),
            sub: 'across your caseload',
            color: '#da1e28',
            icon: 'BoltIcon',
          },
          {
            label: 'Next Best Actions',
            value: String(nbas.length),
            sub: activePatient?.name ?? 'active citizen',
            color: '#0043ce',
            icon: 'SparklesIcon',
          },
          {
            label: 'Keystone Unblocks',
            value: String(keystoneUnblocks),
            sub: 'clinical gaps unblocked',
            color: '#6929c4',
            icon: 'LinkIcon',
          },
          {
            label: 'Citizens w/ Needs',
            value: String(citizensWithNeeds),
            sub: 'open social needs',
            color: '#b45309',
            icon: 'UserGroupIcon',
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

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        {(['queue', 'visits', 'outreach', 'resources'] as CHWView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-xs font-semibold border transition-colors ${view === v ? 'bg-[#007d79] text-white border-[#007d79]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
          >
            {v === 'queue'
              ? 'My Social Signals'
              : v === 'visits'
                ? 'Home Visit Schedule'
                : v === 'outreach'
                  ? 'Outreach Log'
                  : 'Resource Navigation'}
          </button>
        ))}
      </div>

      {view === 'queue' && (
        <ActionQueue
          adt={[]}
          tasks={[
            ...CHW_SOCIAL_TASKS,
            ...referralTasks.map((rt) => ({
              id: rt.id,
              patient: rt.citizenName,
              task: rt.action,
              due: 'from screening',
              priority: (rt.keystone ? 'High' : 'Medium') as 'High' | 'Medium' | 'Low',
              patientId: rt.patientId,
            })),
          ]}
          transitions={[]}
          restrictDomain="Social"
          title="My Social Signals — Triaged"
          subtitle="Your Social-domain work, ranked Do Now / This Week / Routine with next best action"
        />
      )}

      {/* Home Visit Schedule */}
      {view === 'visits' && (
        <div className="space-y-3">
          {(() => {
            const scheduled = new Set(CHW_VISITS.map((v) => v.patientId));
            const recs = getVisiblePatients(getFhirMockMode()).filter(
              (c) => !scheduled.has(c.platformId) && citizenNBAs(c.platformId, CBOS).length > 0
            );
            return recs.length > 0 ? (
              <div className="bg-white border border-[#97c1ff]">
                <div className="px-4 py-2.5 bg-[#edf5ff] border-b border-carbon-gray-20 flex items-center gap-2">
                  <Icon name="SparklesIcon" size={14} className="text-[#0043ce]" />
                  <p className="text-xs font-semibold text-[#0043ce]">
                    Recommended visits — who to see next (agent coalition)
                  </p>
                </div>
                <div className="divide-y divide-carbon-gray-20">
                  {recs.map((c) => {
                    const top = citizenNBAs(c.platformId, CBOS)[0];
                    return (
                      <div
                        key={c.platformId}
                        className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
                      >
                        <span className="text-xs font-semibold text-carbon-gray-100">{c.name}</span>
                        {top?.keystone && (
                          <span className="text-2xs font-bold px-1 py-0.5 bg-[#fff1f1] text-[#da1e28]">
                            KEYSTONE
                          </span>
                        )}
                        <span className="text-2xs text-carbon-gray-50">
                          {top ? `${top.action} · ${top.impact}` : ''}
                        </span>
                        <button
                          onClick={() => {
                            setActiveCitizen(c.platformId);
                            toast.success('Visit recommended', {
                              description: `${c.name} — high impact`,
                            });
                          }}
                          className="ml-auto px-2.5 py-1 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c]"
                        >
                          Schedule visit
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}

          {[...CHW_VISITS]
            .sort((a, b) => {
              const ka = citizenNBAs(a.patientId, CBOS).some((n) => n.keystone) ? 1 : 0;
              const kb = citizenNBAs(b.patientId, CBOS).some((n) => n.keystone) ? 1 : 0;
              if (ka !== kb) return kb - ka;
              return b.riskScore - a.riskScore;
            })
            .map((v) => {
              const ctx = CLINICAL_CONTEXT[v.patientId];
              const hasOverdueGap = ctx?.openCareGaps.some((g) => g.status === 'Overdue');
              const nbas = citizenNBAs(v.patientId, CBOS);
              return (
                <div
                  key={v.id}
                  className={`bg-white border border-carbon-gray-20 p-4 ${v.status === 'completed' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                      style={{ backgroundColor: PRIORITY_COLORS[v.priority] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1">
                          <button
                            className="text-left hover:text-[#007d79] transition-colors"
                            onClick={() => {
                              setActiveCitizen(v.patientId);
                              router.push('/patient-detail');
                            }}
                          >
                            <p className="text-xs font-semibold text-carbon-gray-100 hover:text-[#007d79]">
                              {v.patient}
                            </p>
                          </button>
                          <p className="text-2xs font-mono text-carbon-gray-50">
                            {v.patientId} · {v.mrn}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 text-2xs font-bold text-white"
                            style={{ backgroundColor: PRIORITY_COLORS[v.priority] }}
                          >
                            {v.priority}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-2xs font-bold ${v.status === 'completed' ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
                          >
                            {v.status === 'completed' ? 'Completed' : 'Scheduled'}
                          </span>
                          {nbas.some((n) => n.keystone) && (
                            <span className="px-2 py-0.5 text-2xs font-bold bg-[#fff1f1] text-[#da1e28]">
                              KEYSTONE
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-2xs text-carbon-gray-50">
                        <span className="flex items-center gap-1">
                          <Icon name="CalendarIcon" size={11} />
                          {v.date} at {v.time}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="MapPinIcon" size={11} />
                          {v.address}
                        </span>
                      </div>
                      <p className="text-xs text-carbon-gray-70 mt-1.5">{v.purpose}</p>
                      {nbas.length > 0 && v.status !== 'completed' && (
                        <div className="mt-2 bg-[#f4f9ff] border border-[#d0e2ff] px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon name="SparklesIcon" size={11} className="text-[#0043ce]" />
                            <p className="text-2xs font-semibold text-[#0043ce]">
                              Agenda — next best actions this visit
                            </p>
                          </div>
                          <div className="space-y-1">
                            {nbas.slice(0, 3).map((n, i) => (
                              <div
                                key={n.id}
                                className="flex items-center gap-2 text-2xs flex-wrap"
                              >
                                <span className="font-bold text-[#0043ce]">{i + 1}</span>
                                <span className="text-carbon-gray-100 font-medium">{n.action}</span>
                                {n.keystone && (
                                  <span className="text-2xs font-bold px-1 bg-[#fff1f1] text-[#da1e28]">
                                    KEYSTONE
                                  </span>
                                )}
                                <span className="text-carbon-gray-50">· {n.impact}</span>
                                <span className="text-[#6929c4] inline-flex items-center gap-0.5">
                                  <Icon name="CpuChipIcon" size={9} /> {n.agent}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-2xs text-carbon-gray-50">Whole Person Risk:</span>
                        <span
                          className="font-mono font-bold text-xs"
                          style={{
                            color:
                              v.riskScore >= 80
                                ? '#da1e28'
                                : v.riskScore >= 60
                                  ? '#b45309'
                                  : '#198038',
                          }}
                        >
                          {v.riskScore}
                        </span>
                      </div>

                      {/* Clinical Context Inline Summary */}
                      {ctx && (
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-[#edf5ff] border border-[#97c1ff] px-2 py-1">
                            <Icon
                              name="ClipboardDocumentListIcon"
                              size={11}
                              className="text-[#0043ce]"
                            />
                            <span className="text-2xs text-[#0043ce] font-medium">
                              {ctx.episodeType}
                            </span>
                            <span
                              className={`text-2xs font-bold px-1 py-0.5 ${ctx.episodeStatus === 'Active' ? 'bg-[#fdf6dd] text-[#b45309]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                            >
                              {ctx.episodeStatus}
                            </span>
                          </div>
                          {hasOverdueGap && (
                            <div className="flex items-center gap-1 bg-[#fff1f1] border border-[#ffb3b8] px-2 py-1">
                              <Icon
                                name="ExclamationCircleIcon"
                                size={11}
                                className="text-[#da1e28]"
                              />
                              <span className="text-2xs text-[#da1e28] font-medium">
                                {ctx.openCareGaps.filter((g) => g.status === 'Overdue').length}{' '}
                                overdue gap
                                {ctx.openCareGaps.filter((g) => g.status === 'Overdue').length > 1
                                  ? 's'
                                  : ''}
                              </span>
                            </div>
                          )}
                          <span className="text-2xs text-carbon-gray-50">
                            CM:{' '}
                            {getMemberName(effectiveMemberId(v.patientId, assignments) ?? '') ||
                              ctx.careManager}{' '}
                            · Last contact {ctx.lastCMContact}
                          </span>
                        </div>
                      )}
                    </div>
                    {v.status !== 'completed' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() =>
                            setStartVisitData({
                              id: v.id,
                              patient: v.patient,
                              patientId: v.patientId,
                              date: v.date,
                              time: v.time,
                              address: v.address,
                              purpose: v.purpose,
                            })
                          }
                          className="px-3 py-1.5 text-2xs font-semibold bg-[#007d79] text-white hover:bg-[#005d5d] transition-colors flex items-center gap-1"
                        >
                          <Icon name="PlayIcon" size={11} />
                          Start Visit
                        </button>
                        <button
                          onClick={() => setClinicalContextPatient(v.patientId)}
                          className="px-3 py-1.5 text-2xs font-semibold border border-[#0043ce] text-[#0043ce] hover:bg-[#d0e2ff] transition-colors flex items-center gap-1"
                        >
                          <Icon name="ClipboardDocumentListIcon" size={11} />
                          Clinical
                        </button>
                        <button
                          onClick={() => {
                            setActiveCitizen(v.patientId);
                            router.push('/patient-detail');
                          }}
                          className="px-3 py-1.5 text-2xs font-semibold border border-[#007d79] text-[#007d79] hover:bg-[#d9fbfb] transition-colors flex items-center gap-1"
                        >
                          <Icon name="EyeIcon" size={11} />
                          Full Record
                        </button>
                        <button
                          onClick={() =>
                            setRescheduleData({
                              id: v.id,
                              patient: v.patient,
                              patientId: v.patientId,
                              date: v.date,
                              time: v.time,
                              address: v.address,
                              purpose: v.purpose,
                            })
                          }
                          className="px-3 py-1.5 text-2xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors flex items-center gap-1"
                        >
                          <Icon name="CalendarIcon" size={11} />
                          Reschedule
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Outreach Log */}
      {view === 'outreach' && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
            <p className="text-sm font-semibold text-carbon-gray-100">Outreach Attempt Log</p>
            <button className="px-3 py-1.5 text-xs font-semibold bg-[#007d79] text-white hover:bg-[#005d5d] transition-colors">
              + Log Attempt
            </button>
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {OUTREACH_LOG.map((o) => (
              <div key={o.id} className="p-4 flex items-start gap-4">
                <div
                  className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: OUTCOME_COLORS[o.outcome] + '20' }}
                >
                  <Icon
                    name={
                      o.outcome === 'Completed'
                        ? 'CheckCircleIcon'
                        : o.outcome === 'Reached'
                          ? 'PhoneIcon'
                          : 'PhoneXMarkIcon'
                    }
                    size={16}
                    style={{ color: OUTCOME_COLORS[o.outcome] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs font-semibold text-carbon-gray-100">{o.patient}</p>
                    <span className="font-mono text-2xs text-carbon-gray-50">{o.patientId}</span>
                    <span className="text-2xs font-mono text-carbon-gray-50">{o.date}</span>
                    <span className="px-2 py-0.5 text-2xs font-bold bg-carbon-gray-10 text-carbon-gray-70">
                      {o.channel}
                    </span>
                    <span
                      className="px-2 py-0.5 text-2xs font-bold"
                      style={{
                        backgroundColor: OUTCOME_COLORS[o.outcome] + '20',
                        color: OUTCOME_COLORS[o.outcome],
                      }}
                    >
                      {o.outcome}
                    </span>
                  </div>
                  <p className="text-xs text-carbon-gray-70 mt-1.5">{o.notes}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-1">
                    Next action:{' '}
                    <span className="font-medium text-carbon-gray-70">{o.nextAction}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource Navigation */}
      {view === 'resources' && (
        <div className="space-y-4">
          {recommendedResources.length > 0 && (
            <div className="bg-white border border-[#97c1ff]">
              <div className="px-4 py-3 border-b border-carbon-gray-20 bg-[#edf5ff] flex items-center gap-2">
                <Icon name="SparklesIcon" size={15} className="text-[#0043ce]" />
                <p className="text-sm font-semibold text-[#0043ce]">
                  Recommended for {activePatient?.name ?? 'this citizen'}
                </p>
                <span className="text-2xs text-carbon-gray-50">
                  need-matched from the knowledge graph
                </span>
              </div>
              <div className="divide-y divide-carbon-gray-20">
                {recommendedResources.map((rec, i) => {
                  const domainColor = PROGRAM_DOMAIN_COLORS[rec.cbo.domain] ?? '#6f6f6f';
                  const capacityColor = CAPACITY_COLORS[rec.cbo.capacity];
                  return (
                    <div key={`${rec.cbo.id}-${i}`} className="px-4 py-3 flex items-start gap-3">
                      <div
                        className="w-2 h-8 flex-shrink-0"
                        style={{ backgroundColor: domainColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-carbon-gray-100">
                            {rec.cbo.name}
                          </span>
                          <span
                            className="text-2xs font-bold px-1.5 py-0.5 text-white"
                            style={{ backgroundColor: domainColor }}
                          >
                            {rec.cbo.domain}
                          </span>
                          <span
                            className="px-2 py-0.5 text-2xs font-bold"
                            style={{ backgroundColor: capacityColor + '20', color: capacityColor }}
                          >
                            {rec.cbo.capacity}
                          </span>
                          {rec.need.keystone && (
                            <span className="text-2xs font-bold px-1 py-0.5 bg-[#fff1f1] text-[#da1e28]">
                              KEYSTONE
                            </span>
                          )}
                        </div>
                        <p className="text-2xs text-carbon-gray-70 mt-1">{rec.why}</p>
                        <p className="text-2xs text-carbon-gray-50 mt-0.5">
                          Avg close {rec.cbo.avgDaysToClose}d &middot; {rec.cbo.phone}
                        </p>
                      </div>
                      <button
                        onClick={() => setReferralTarget({ cbo: rec.cbo, need: rec.need })}
                        className="px-3 py-1.5 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c] whitespace-nowrap"
                      >
                        Refer &rarr;
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide pt-1">
            Full resource directory
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {CBOS.map((r) => {
              const domainColor = PROGRAM_DOMAIN_COLORS[r.domain] ?? '#6f6f6f';
              const capacityColor = CAPACITY_COLORS[r.capacity];
              return (
                <div key={r.id} className="bg-white border border-carbon-gray-20 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-2 h-8 flex-shrink-0"
                      style={{ backgroundColor: domainColor }}
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-carbon-gray-100">{r.name}</p>
                      <span
                        className="text-2xs font-bold px-2 py-0.5 text-white"
                        style={{ backgroundColor: domainColor }}
                      >
                        {r.domain}
                      </span>
                    </div>
                    <span
                      className="px-2 py-0.5 text-2xs font-bold"
                      style={{ backgroundColor: capacityColor + '20', color: capacityColor }}
                    >
                      {r.capacity}
                    </span>
                  </div>
                  <div className="space-y-1 text-2xs text-carbon-gray-70 ml-5">
                    <p className="flex items-center gap-1.5">
                      <Icon name="PhoneIcon" size={11} />
                      {r.phone}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Icon name="MapPinIcon" size={11} />
                      {r.address}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Icon name="ClockIcon" size={11} />
                      Avg close: <span className="font-medium">{r.avgDaysToClose}d</span>
                    </p>
                    {r.linkedPatients.length > 0 && (
                      <p className="flex items-center gap-1.5 mt-1">
                        <Icon name="UserGroupIcon" size={11} />
                        <span className="text-carbon-gray-50">Active patients: </span>
                        <span className="font-medium text-[#0043ce]">
                          {r.linkedPatients.join(', ')}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setReferralTarget({ cbo: r })}
                    className="mt-3 ml-5 px-3 py-1.5 text-2xs font-semibold bg-[#007d79] text-white hover:bg-[#005d5d] transition-colors"
                  >
                    Create Referral Task
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Clinical Context Drawer */}
      {clinicalContextPatient && (
        <ClinicalContextPanel
          patientId={clinicalContextPatient}
          onClose={() => setClinicalContextPatient(null)}
        />
      )}

      {/* Start Visit Modal */}
      {startVisitData && (
        <StartVisitModal visit={startVisitData} onClose={() => setStartVisitData(null)} />
      )}

      {/* Reschedule Modal */}
      {rescheduleData && (
        <RescheduleModal visit={rescheduleData} onClose={() => setRescheduleData(null)} />
      )}

      {referralTarget && (
        <ReferralApprovalModal
          cbo={referralTarget.cbo}
          need={referralTarget.need}
          citizenName={activePatient?.name ?? 'Citizen'}
          patientId={activePatientId}
          onClose={() => setReferralTarget(null)}
        />
      )}
    </AppLayout>
  );
}
