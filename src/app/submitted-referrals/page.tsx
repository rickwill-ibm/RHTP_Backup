'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { mockReferrals } from '@/app/referral-tracking/components/ActiveReferralsTable';
import type { ReferralRecord, ReferralStatus, ReferralUrgency } from '@/app/referral-tracking/page';
import { generatePDFReport } from '@/lib/exportUtils';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

// ─── FHIR ServiceRequest → ReferralRecord mapper ──────────────────────────────

function mapFhirToReferralRecord(sr: any, taskMap: Map<string, any>): ReferralRecord {
  const task = taskMap.get(sr.id) ?? null;
  const taskStatus: string = task?.status ?? 'requested';
  const statusMap: Record<string, ReferralRecord['status']> = {
    requested: 'Pending',
    accepted: 'Assigned',
    'in-progress': 'In Progress',
    completed: 'Completed',
    rejected: 'Cancelled',
    cancelled: 'Cancelled',
  };
  return {
    id: sr.id,
    patientName: sr.subject?.display ?? 'Unknown Patient',
    patientId: sr.subject?.reference?.split('/')[1] ?? '',
    referralDate: sr.authoredOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    specialty: sr.code?.text ?? sr.code?.coding?.[0]?.display ?? 'Referral',
    urgency: (sr.priority === 'stat'
      ? 'STAT'
      : sr.priority === 'urgent'
        ? 'Urgent'
        : 'Routine') as ReferralRecord['urgency'],
    status: statusMap[taskStatus] ?? 'Pending',
    assignedProvider: task?.owner?.display ?? null,
    providerId: task?.owner?.reference?.split('/')[1] ?? null,
    providerTier: 'In-Network',
    icdCode: sr.reasonCode?.[0]?.coding?.[0]?.code ?? sr.reasonCode?.[0]?.text ?? '—',
    icdDescription: sr.reasonCode?.[0]?.text ?? sr.note?.[0]?.text ?? '—',
    submissionChannel: 'FHIR',
    submittedDate: sr.authoredOn?.slice(0, 10) ?? null,
    appointmentDate: null,
    closedDate: task?.executionPeriod?.end?.slice(0, 10) ?? null,
    outcome: taskStatus === 'completed' ? 'Seen' : 'Pending',
    coordinatorName: sr.requester?.display ?? 'RHTP Platform',
    notes: sr.note?.[0]?.text ?? '',
    daysOpen: Math.floor(
      (Date.now() - new Date(sr.authoredOn ?? Date.now()).getTime()) / 86_400_000
    ),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TimelineStepKey = 'pending' | 'accepted' | 'scheduled' | 'completed';

interface TimelineStep {
  key: TimelineStepKey;
  label: string;
  icon: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'pending', label: 'Pending', icon: 'ClockIcon' },
  { key: 'accepted', label: 'Accepted', icon: 'CheckCircleIcon' },
  { key: 'scheduled', label: 'Scheduled', icon: 'CalendarDaysIcon' },
  { key: 'completed', label: 'Completed', icon: 'CheckBadgeIcon' },
];

function getTimelineStep(status: ReferralStatus): number {
  if (status === 'Pending') return 0;
  if (status === 'Assigned') return 1;
  if (status === 'In Progress' || status === 'Awaiting EMR') return 2;
  if (status === 'Completed') return 3;
  if (status === 'Cancelled') return -1;
  return 0;
}

function getTimelineDate(ref: ReferralRecord, stepIdx: number): string | null {
  if (stepIdx === 0) return ref.referralDate;
  if (stepIdx === 1) return ref.submittedDate;
  if (stepIdx === 2) return ref.appointmentDate;
  if (stepIdx === 3) return ref.closedDate;
  return null;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReferralStatus }) {
  const map: Record<ReferralStatus, string> = {
    Pending: 'bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-30',
    Assigned: 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]',
    'In Progress': 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
    'Awaiting EMR': 'bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]',
    Completed: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
    Cancelled: 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
  };
  return (
    <span className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${map[status]}`}>
      {status}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: ReferralUrgency }) {
  const map: Record<ReferralUrgency, { cls: string; icon: string }> = {
    Routine: { cls: 'text-carbon-gray-50', icon: 'MinusCircleIcon' },
    Urgent: { cls: 'text-[#b45309] font-semibold', icon: 'ExclamationCircleIcon' },
    STAT: { cls: 'text-[#da1e28] font-bold', icon: 'ExclamationTriangleIcon' },
  };
  const cfg = map[urgency];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.cls}`}>
      <Icon name={cfg.icon as any} size={12} />
      {urgency}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: ReferralRecord['outcome'] }) {
  if (!outcome || outcome === 'Pending')
    return <span className="text-xs text-carbon-gray-40">—</span>;
  const map: Record<string, string> = {
    Seen: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
    'No-Show': 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
    Cancelled: 'bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-30',
    Hospitalized: 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
  };
  return (
    <span
      className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${map[outcome] ?? ''}`}
    >
      {outcome}
    </span>
  );
}

function TierBadge({ tier }: { tier: ReferralRecord['providerTier'] }) {
  if (!tier) return <span className="text-xs text-carbon-gray-40">—</span>;
  const map = {
    Preferred: 'text-[#0e6027]',
    'In-Network': 'text-[#0043ce]',
    'Out-of-Network': 'text-[#da1e28]',
  };
  return <span className={`text-xs font-medium ${map[tier]}`}>{tier}</span>;
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

function ReferralStatusTimeline({ referral }: { referral: ReferralRecord }) {
  const activeStep = getTimelineStep(referral.status);
  const isCancelled = referral.status === 'Cancelled';

  return (
    <div className="flex items-start gap-0 w-full">
      {TIMELINE_STEPS.map((step, idx) => {
        const stepDate = getTimelineDate(referral, idx);
        const isCompleted = !isCancelled && activeStep > idx;
        const isActive = !isCancelled && activeStep === idx;
        const isFuture = isCancelled || activeStep < idx;

        return (
          <div key={step.key} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all
                ${
                  isCompleted
                    ? 'bg-[#24a148] border-[#24a148] text-white'
                    : isActive
                      ? 'bg-[#0f62fe] border-[#0f62fe] text-white'
                      : isCancelled && idx === 0
                        ? 'bg-[#da1e28] border-[#da1e28] text-white'
                        : 'bg-white border-carbon-gray-20 text-carbon-gray-30'
                }`}
              >
                {isCompleted ? (
                  <Icon name="CheckIcon" size={13} />
                ) : (
                  <Icon name={step.icon as any} size={13} />
                )}
              </div>
              {/* Label */}
              <p
                className={`text-2xs font-semibold mt-1.5 text-center leading-tight
                ${isCompleted ? 'text-[#24a148]' : isActive ? 'text-[#0f62fe]' : 'text-carbon-gray-40'}`}
              >
                {step.label}
              </p>
              {/* Date */}
              {stepDate ? (
                <p className="text-2xs text-carbon-gray-40 mt-0.5 text-center leading-tight">
                  {new Date(stepDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              ) : (
                <p className="text-2xs text-carbon-gray-30 mt-0.5 text-center">—</p>
              )}
            </div>
            {/* Connector */}
            {idx < TIMELINE_STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mt-4 mx-1 transition-all
                ${isCompleted ? 'bg-[#24a148]' : isActive ? 'bg-[#d0e2ff]' : 'bg-carbon-gray-20'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Referral Detail Drawer ───────────────────────────────────────────────────

function ReferralDetailDrawer({
  referral,
  onClose,
}: {
  referral: ReferralRecord;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'provider' | 'appointment' | 'notes'>(
    'timeline'
  );

  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'timeline', label: 'Status Timeline', icon: 'ArrowPathIcon' },
    { key: 'provider', label: 'Provider Response', icon: 'BuildingOffice2Icon' },
    { key: 'appointment', label: 'Appointment', icon: 'CalendarDaysIcon' },
    { key: 'notes', label: 'Outcome Notes', icon: 'DocumentTextIcon' },
  ];

  // Mock provider response data
  const providerResponse = {
    responseDate: referral.submittedDate
      ? new Date(new Date(referral.submittedDate).getTime() + 86400000).toISOString().split('T')[0]
      : null,
    responseChannel: referral.submissionChannel ?? 'Pending',
    acceptanceStatus:
      referral.status === 'Pending'
        ? 'Awaiting Response'
        : referral.status === 'Cancelled'
          ? 'Declined'
          : 'Accepted',
    providerNote:
      referral.status === 'Completed'
        ? `Patient seen on ${referral.closedDate}. Clinical summary forwarded to referring provider. Follow-up recommended in 90 days.`
        : referral.status === 'In Progress' || referral.status === 'Assigned'
          ? 'Referral accepted. Appointment scheduled. Patient instructions sent via patient portal.'
          : referral.status === 'Awaiting EMR'
            ? 'Awaiting EMR authorization before scheduling. Expected response within 48 hours.'
            : referral.status === 'Cancelled'
              ? 'Provider unavailable for this referral type. Please reassign to alternate provider.'
              : 'No response received yet.',
    npi: referral.providerId ? `NPI-${referral.providerId.replace('prov-', '1234567')}` : null,
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] bg-white border-l border-carbon-gray-20 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-start justify-between gap-3 bg-[#f4f4f4]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-carbon-gray-50">
              {referral.id.toUpperCase()}
            </span>
            <StatusBadge status={referral.status} />
            <UrgencyBadge urgency={referral.urgency} />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">{referral.patientName}</p>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            {referral.specialty} · {referral.icdCode} — {referral.icdDescription}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => exportSingleReferralPDF(referral)}
            title="Export referral as PDF"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0f62fe] border border-[#0f62fe] hover:bg-[#edf5ff] transition-colors"
          >
            <Icon name="ArrowDownTrayIcon" size={13} />
            PDF
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors ml-1"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-carbon-gray-20 bg-white">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors flex-1 justify-center
              ${
                activeTab === t.key
                  ? 'border-[#0f62fe] text-[#0f62fe] bg-[#edf5ff]'
                  : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'
              }`}
          >
            <Icon name={t.icon as any} size={12} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* ── Timeline Tab ── */}
        {activeTab === 'timeline' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-3">
                Referral Progress
              </p>
              <ReferralStatusTimeline referral={referral} />
            </div>

            {/* Key dates grid */}
            <div className="bg-[#f4f4f4] p-4 space-y-3">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                Key Dates
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Referral Initiated', value: referral.referralDate },
                  { label: 'Submitted to Provider', value: referral.submittedDate },
                  { label: 'Appointment Date', value: referral.appointmentDate },
                  { label: 'Referral Closed', value: referral.closedDate },
                ].map((d) => (
                  <div key={d.label}>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      {d.label}
                    </p>
                    <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                      {d.value ? (
                        new Date(d.value).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      ) : (
                        <span className="text-carbon-gray-30">—</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Submission details */}
            <div className="bg-[#f4f4f4] p-4 space-y-3">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                Submission Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Submission Channel', value: referral.submissionChannel ?? '—' },
                  { label: 'Days Open', value: `${referral.daysOpen} days` },
                  { label: 'Coordinator', value: referral.coordinatorName },
                  { label: 'Outcome', value: referral.outcome ?? 'Pending' },
                ].map((d) => (
                  <div key={d.label}>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      {d.label}
                    </p>
                    <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">{d.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Provider Response Tab ── */}
        {activeTab === 'provider' && (
          <div className="space-y-4">
            {/* Provider card */}
            {referral.assignedProvider ? (
              <div className="bg-[#edf5ff] border border-[#97c1ff] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs">
                      {referral.assignedProvider
                        .split(' ')
                        .filter(Boolean)
                        .slice(-2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-carbon-gray-100">
                      {referral.assignedProvider}
                    </p>
                    <p className="text-xs text-carbon-gray-50 mt-0.5">{referral.specialty}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <TierBadge tier={referral.providerTier} />
                      {providerResponse.npi && (
                        <span className="text-2xs text-carbon-gray-40 font-mono">
                          {providerResponse.npi}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-4 flex items-center gap-3">
                <Icon name="UserIcon" size={20} className="text-carbon-gray-40" />
                <p className="text-sm text-carbon-gray-50">No provider assigned yet</p>
              </div>
            )}

            {/* Response status */}
            <div className="bg-[#f4f4f4] p-4 space-y-3">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                Provider Response
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Acceptance Status
                  </p>
                  <p
                    className={`text-sm font-semibold mt-0.5
                    ${
                      providerResponse.acceptanceStatus === 'Accepted'
                        ? 'text-[#24a148]'
                        : providerResponse.acceptanceStatus === 'Declined'
                          ? 'text-[#da1e28]'
                          : 'text-[#b45309]'
                    }`}
                  >
                    {providerResponse.acceptanceStatus}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Response Date
                  </p>
                  <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                    {providerResponse.responseDate ? (
                      new Date(providerResponse.responseDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    ) : (
                      <span className="text-carbon-gray-30">Awaiting</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Response Channel
                  </p>
                  <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                    {providerResponse.responseChannel}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Network Tier
                  </p>
                  <div className="mt-0.5">
                    <TierBadge tier={referral.providerTier} />
                  </div>
                </div>
              </div>
            </div>

            {/* Provider note */}
            <div className="bg-[#f4f4f4] p-4">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                Provider Note
              </p>
              <p className="text-sm text-carbon-gray-70 leading-relaxed">
                {providerResponse.providerNote}
              </p>
            </div>
          </div>
        )}

        {/* ── Appointment Tab ── */}
        {activeTab === 'appointment' && (
          <div className="space-y-4">
            {referral.appointmentDate ? (
              <>
                {/* Appointment card */}
                <div className="bg-[#defbe6] border border-[#a7f0ba] p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#24a148] flex items-center justify-center flex-shrink-0">
                      <Icon name="CalendarDaysIcon" size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-[#0e6027] font-semibold uppercase tracking-wide">
                        Appointment Scheduled
                      </p>
                      <p className="text-base font-bold text-[#0e6027] mt-0.5">
                        {new Date(referral.appointmentDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Appointment details */}
                <div className="bg-[#f4f4f4] p-4 space-y-3">
                  <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                    Appointment Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Provider', value: referral.assignedProvider ?? '—' },
                      { label: 'Specialty', value: referral.specialty },
                      {
                        label: 'Appointment Date',
                        value: new Date(referral.appointmentDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }),
                      },
                      { label: 'Appointment Time', value: '10:30 AM' },
                      { label: 'Visit Type', value: 'In-Person Consultation' },
                      { label: 'Location', value: 'Main Campus — Suite 400' },
                      {
                        label: 'Confirmation #',
                        value: `APT-${referral.id.replace('ref-', '').padStart(5, '0')}`,
                      },
                      { label: 'Patient Notified', value: 'Yes — Portal + SMS' },
                    ].map((d) => (
                      <div key={d.label}>
                        <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                          {d.label}
                        </p>
                        <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">{d.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ICD / clinical context */}
                <div className="bg-[#f4f4f4] p-4 space-y-2">
                  <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                    Clinical Context
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono bg-carbon-gray-20 text-carbon-gray-70 px-2 py-0.5 flex-shrink-0">
                      {referral.icdCode}
                    </span>
                    <p className="text-sm text-carbon-gray-70">{referral.icdDescription}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Urgency:
                    </span>
                    <UrgencyBadge urgency={referral.urgency} />
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-[#fdf6dd] border border-[#f1c21b] p-5 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-[#f1c21b] flex items-center justify-center">
                  <Icon name="CalendarDaysIcon" size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#b45309]">
                    Appointment Not Yet Scheduled
                  </p>
                  <p className="text-xs text-[#b45309] mt-1">
                    {referral.status === 'Pending'
                      ? 'Awaiting provider assignment before scheduling.'
                      : referral.status === 'Awaiting EMR'
                        ? 'EMR authorization required before appointment can be booked.'
                        : 'Provider will confirm appointment date upon acceptance.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Outcome Notes Tab ── */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Outcome summary */}
            <div className="bg-[#f4f4f4] p-4 space-y-3">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                Referral Outcome
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Outcome</p>
                  <div className="mt-1">
                    <OutcomeBadge outcome={referral.outcome} />
                  </div>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Closed Date
                  </p>
                  <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                    {referral.closedDate ? (
                      new Date(referral.closedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    ) : (
                      <span className="text-carbon-gray-30">Open</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Days Open</p>
                  <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                    {referral.daysOpen} days
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                    Coordinator
                  </p>
                  <p className="text-sm font-medium text-carbon-gray-100 mt-0.5">
                    {referral.coordinatorName}
                  </p>
                </div>
              </div>
            </div>

            {/* Clinical note */}
            <div className="bg-[#f4f4f4] p-4">
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
                Clinical Note
              </p>
              <p className="text-sm text-carbon-gray-70 leading-relaxed">
                {referral.notes || (
                  <span className="text-carbon-gray-30 italic">No clinical notes recorded.</span>
                )}
              </p>
            </div>

            {/* Follow-up / next steps */}
            {referral.status === 'Completed' && referral.outcome === 'Seen' && (
              <div className="bg-[#edf5ff] border border-[#97c1ff] p-4">
                <p className="text-xs font-semibold text-[#0043ce] uppercase tracking-wide mb-2">
                  Follow-Up Actions
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Specialist summary received and filed in EMR',
                    'Care manager notified of visit completion',
                    'Follow-up appointment recommended in 90 days',
                    'Care gap closure status updated',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-[#0043ce]">
                      <Icon
                        name="CheckCircleIcon"
                        size={13}
                        className="flex-shrink-0 mt-0.5 text-[#24a148]"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {referral.outcome === 'No-Show' && (
              <div className="bg-[#fff1f1] border border-[#ffb3b8] p-4">
                <p className="text-xs font-semibold text-[#da1e28] uppercase tracking-wide mb-2">
                  No-Show Actions Required
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Patient outreach needed — reschedule appointment',
                    'Document no-show in care management system',
                    'Assess barriers to care (transportation, cost, etc.)',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-[#da1e28]">
                      <Icon
                        name="ExclamationCircleIcon"
                        size={13}
                        className="flex-shrink-0 mt-0.5"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function SubmittedReferralsKPI() {
  const total = mockReferrals.length;
  const completed = mockReferrals.filter((r) => r.status === 'Completed').length;
  const pending = mockReferrals.filter((r) => r.status === 'Pending').length;
  const inProgress = mockReferrals.filter(
    (r) => r.status === 'In Progress' || r.status === 'Assigned'
  ).length;
  const stat = mockReferrals.filter((r) => r.urgency === 'STAT').length;
  const avgDays = (mockReferrals.reduce((s, r) => s + r.daysOpen, 0) / total).toFixed(1);
  const seenRate = Math.round(
    (mockReferrals.filter((r) => r.outcome === 'Seen').length / total) * 100
  );

  const kpis = [
    {
      label: 'Total Submitted',
      value: String(total),
      sub: 'All referrals',
      color: 'text-carbon-gray-100',
    },
    {
      label: 'Completed',
      value: String(completed),
      sub: `${Math.round((completed / total) * 100)}% completion rate`,
      color: 'text-[#24a148]',
    },
    {
      label: 'In Progress',
      value: String(inProgress),
      sub: 'Assigned or active',
      color: 'text-[#b45309]',
    },
    {
      label: 'Pending Assignment',
      value: String(pending),
      sub: 'Awaiting provider',
      color: 'text-[#da1e28]',
    },
    {
      label: 'STAT Referrals',
      value: String(stat),
      sub: 'Highest urgency',
      color: 'text-[#da1e28]',
    },
    {
      label: 'Avg Days Open',
      value: avgDays,
      sub: 'Across all referrals',
      color: 'text-carbon-gray-100',
    },
    {
      label: 'Seen Rate',
      value: `${seenRate}%`,
      sub: 'Appointments kept',
      color: 'text-[#24a148]',
    },
  ];

  return (
    <div className="bg-white border-b border-carbon-gray-20 px-6 py-3 flex items-stretch gap-0 overflow-x-auto">
      {kpis.map((k, i) => (
        <div
          key={k.label}
          className={`flex flex-col justify-center px-5 min-w-[110px] flex-shrink-0 ${i > 0 ? 'border-l border-carbon-gray-20' : ''}`}
        >
          <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          <p className="text-2xs font-semibold text-carbon-gray-70 mt-0.5">{k.label}</p>
          <p className="text-2xs text-carbon-gray-40 mt-0.5">{k.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Referral Row ─────────────────────────────────────────────────────────────

function ReferralRow({
  referral,
  isSelected,
  onClick,
}: {
  referral: ReferralRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  const activeStep = getTimelineStep(referral.status);
  const isCancelled = referral.status === 'Cancelled';

  return (
    <div
      onClick={onClick}
      className={`border-b border-carbon-gray-20 px-5 py-4 cursor-pointer transition-colors hover:bg-[#edf5ff]
        ${isSelected ? 'bg-[#edf5ff] border-l-2 border-l-[#0f62fe]' : 'bg-white border-l-2 border-l-transparent'}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-carbon-gray-40">
              {referral.id.toUpperCase()}
            </span>
            <StatusBadge status={referral.status} />
            <UrgencyBadge urgency={referral.urgency} />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">{referral.patientName}</p>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            {referral.specialty} · <span className="font-mono">{referral.icdCode}</span> —{' '}
            {referral.icdDescription}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-carbon-gray-50">
            {new Date(referral.referralDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-2xs text-carbon-gray-40 mt-0.5">{referral.daysOpen}d open</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-3">
        <ReferralStatusTimeline referral={referral} />
      </div>

      {/* Bottom row */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-carbon-gray-50">
        {referral.assignedProvider ? (
          <span className="flex items-center gap-1">
            <Icon name="UserIcon" size={11} />
            {referral.assignedProvider}
            {referral.providerTier && (
              <span className="ml-1">
                <TierBadge tier={referral.providerTier} />
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[#da1e28]">
            <Icon name="UserIcon" size={11} />
            Unassigned
          </span>
        )}
        {referral.appointmentDate && (
          <span className="flex items-center gap-1">
            <Icon name="CalendarDaysIcon" size={11} />
            Appt:{' '}
            {new Date(referral.appointmentDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {referral.outcome && referral.outcome !== 'Pending' && (
          <OutcomeBadge outcome={referral.outcome} />
        )}
        <span className="flex items-center gap-1">
          <Icon name="UserCircleIcon" size={11} />
          {referral.coordinatorName}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[#0f62fe]">
          View details
          <Icon name="ChevronRightIcon" size={11} />
        </span>
      </div>
    </div>
  );
}

// ─── PDF Export Helpers ───────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTimelineStepLabel(status: ReferralStatus): string {
  if (status === 'Pending') return 'Pending';
  if (status === 'Assigned') return 'Accepted';
  if (status === 'In Progress' || status === 'Awaiting EMR') return 'Scheduled';
  if (status === 'Completed') return 'Completed';
  if (status === 'Cancelled') return 'Cancelled';
  return status;
}

function getProviderAcceptanceStatus(status: ReferralStatus): string {
  if (status === 'Pending') return 'Awaiting Response';
  if (status === 'Cancelled') return 'Declined';
  return 'Accepted';
}

function getProviderNote(ref: ReferralRecord): string {
  if (ref.status === 'Completed')
    return `Patient seen on ${formatDate(ref.closedDate)}. Clinical summary forwarded to referring provider. Follow-up recommended in 90 days.`;
  if (ref.status === 'In Progress' || ref.status === 'Assigned')
    return 'Referral accepted. Appointment scheduled. Patient instructions sent via patient portal.';
  if (ref.status === 'Awaiting EMR')
    return 'Awaiting EMR authorization before scheduling. Expected response within 48 hours.';
  if (ref.status === 'Cancelled')
    return 'Provider unavailable for this referral type. Please reassign to alternate provider.';
  return 'No response received yet.';
}

function exportSingleReferralPDF(ref: ReferralRecord) {
  const confirmationNum = `APT-${ref.id.replace('ref-', '').padStart(5, '0')}`;
  const responseDate = ref.submittedDate
    ? new Date(new Date(ref.submittedDate).getTime() + 86400000).toISOString().split('T')[0]
    : null;

  generatePDFReport({
    reportTitle: `Referral Report — ${ref.patientName}`,
    subtitle: `${ref.id.toUpperCase()} · ${ref.specialty}`,
    generatedBy: ref.coordinatorName,
    sections: [
      {
        title: 'Referral Status Timeline',
        rows: [
          { label: 'Current Status', value: ref.status },
          { label: 'Timeline Stage', value: getTimelineStepLabel(ref.status) },
          { label: 'Urgency', value: ref.urgency },
          { label: 'Referral Initiated', value: formatDate(ref.referralDate) },
          { label: 'Submitted to Provider', value: formatDate(ref.submittedDate) },
          { label: 'Appointment Date', value: formatDate(ref.appointmentDate) },
          { label: 'Referral Closed', value: formatDate(ref.closedDate) },
          { label: 'Days Open', value: `${ref.daysOpen} days` },
          { label: 'Submission Channel', value: ref.submissionChannel ?? '—' },
          { label: 'Coordinator', value: ref.coordinatorName },
        ],
      },
      {
        title: 'Provider Response',
        rows: [
          { label: 'Assigned Provider', value: ref.assignedProvider ?? 'Unassigned' },
          { label: 'Specialty', value: ref.specialty },
          { label: 'Network Tier', value: ref.providerTier ?? '—' },
          { label: 'Acceptance Status', value: getProviderAcceptanceStatus(ref.status) },
          { label: 'Response Date', value: formatDate(responseDate) },
          { label: 'Response Channel', value: ref.submissionChannel ?? '—' },
          { label: 'Provider Note', value: getProviderNote(ref) },
        ],
      },
      {
        title: 'Appointment Details',
        rows: ref.appointmentDate
          ? [
              { label: 'Appointment Date', value: formatDate(ref.appointmentDate) },
              { label: 'Appointment Time', value: '10:30 AM' },
              { label: 'Visit Type', value: 'In-Person Consultation' },
              { label: 'Location', value: 'Main Campus — Suite 400' },
              { label: 'Confirmation #', value: confirmationNum },
              { label: 'Patient Notified', value: 'Yes — Portal + SMS' },
              { label: 'ICD Code', value: ref.icdCode },
              { label: 'Clinical Indication', value: ref.icdDescription },
            ]
          : [
              { label: 'Appointment Status', value: 'Not Yet Scheduled' },
              { label: 'ICD Code', value: ref.icdCode },
              { label: 'Clinical Indication', value: ref.icdDescription },
              { label: 'Urgency', value: ref.urgency },
            ],
      },
      {
        title: 'Referral Outcome Notes',
        rows: [
          { label: 'Outcome', value: ref.outcome ?? 'Pending' },
          { label: 'Closed Date', value: formatDate(ref.closedDate) },
          { label: 'Clinical Notes', value: ref.notes || 'No clinical notes recorded.' },
        ],
      },
    ],
  });
}

function exportAllReferralsPDF(referrals: ReferralRecord[], subtitle?: string) {
  generatePDFReport({
    reportTitle: 'Submitted Referrals — Status & Outcomes Report',
    subtitle: subtitle ?? `${referrals.length} referrals`,
    generatedBy: 'Care Management Team',
    sections: [
      {
        title: 'Summary',
        rows: [
          { label: 'Total Referrals', value: String(referrals.length) },
          {
            label: 'Completed',
            value: String(referrals.filter((r) => r.status === 'Completed').length),
          },
          {
            label: 'In Progress',
            value: String(
              referrals.filter((r) => r.status === 'In Progress' || r.status === 'Assigned').length
            ),
          },
          {
            label: 'Pending Assignment',
            value: String(referrals.filter((r) => r.status === 'Pending').length),
          },
          {
            label: 'STAT Referrals',
            value: String(referrals.filter((r) => r.urgency === 'STAT').length),
          },
          {
            label: 'Seen Rate',
            value: `${Math.round((referrals.filter((r) => r.outcome === 'Seen').length / referrals.length) * 100)}%`,
          },
          {
            label: 'Avg Days Open',
            value: `${(referrals.reduce((s, r) => s + r.daysOpen, 0) / referrals.length).toFixed(1)} days`,
          },
        ],
      },
    ],
    tableHeaders: [
      'Referral ID',
      'Patient',
      'Specialty',
      'Urgency',
      'Status',
      'Provider',
      'Tier',
      'Appt Date',
      'Outcome',
      'Days Open',
    ],
    tableRows: referrals.map((r) => [
      r.id.toUpperCase(),
      r.patientName,
      r.specialty,
      r.urgency,
      r.status,
      r.assignedProvider ?? 'Unassigned',
      r.providerTier ?? '—',
      formatDate(r.appointmentDate),
      r.outcome ?? 'Pending',
      String(r.daysOpen),
    ]),
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubmittedReferralsPage() {
  const { useMockData } = useAppContext();
  const { activeCitizenId } = useActiveCitizen();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [specialtyFilter, setSpecialtyFilter] = useState('All');
  const [urgencyFilter, setUrgencyFilter] = useState('All');
  const [fhirReferrals, setFhirReferrals] = useState<ReferralRecord[] | null>(null);
  const [fhirSource, setFhirSource] = useState(false);
  const loadedRef = useRef(false);

  // Live FHIR: fetch ServiceRequest + Task for active patient on mount
  useEffect(() => {
    if (useMockData || getFhirMockMode() || loadedRef.current) return;
    loadedRef.current = true;
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activeCitizenId] ?? activeCitizenId;
    if (!fhirId) return;
    Promise.all([
      getFhirClient().search('ServiceRequest', { patient: `Patient/${fhirId}`, _count: 50 }),
      getFhirClient().search('Task', { patient: `Patient/${fhirId}`, _count: 50 }),
    ])
      .then(([srBundle, taskBundle]: [any, any]) => {
        const srEntries = (srBundle?.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'ServiceRequest');
        const taskEntries = (taskBundle?.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'Task');
        if (srEntries.length === 0) return;
        const taskMap = new Map<string, any>();
        taskEntries.forEach((t: any) => {
          const srRef = t.focus?.reference?.split('/')[1];
          if (srRef) taskMap.set(srRef, t);
        });
        const records = srEntries.map((sr: any) => mapFhirToReferralRecord(sr, taskMap));
        setFhirReferrals(records);
        setFhirSource(true);
      })
      .catch(() => {
        /* non-fatal — fall back to mock */
      });
  }, [activeCitizenId, useMockData]);

  const sourceReferrals = fhirReferrals ?? mockReferrals;

  const statuses = [
    'All',
    'Pending',
    'Assigned',
    'In Progress',
    'Awaiting EMR',
    'Completed',
    'Cancelled',
  ];
  const specialties = [
    'All',
    'Cardiology',
    'Endocrinology',
    'Nephrology',
    'Ophthalmology',
    'Pulmonology',
    'Orthopedics',
    'Gastroenterology',
    'Geriatrics',
  ];
  const urgencies = ['All', 'Routine', 'Urgent', 'STAT'];

  const filtered = useMemo(() => {
    return sourceReferrals.filter((r) => {
      const q = search.toLowerCase();
      if (
        q &&
        !r.patientName.toLowerCase().includes(q) &&
        !r.icdCode.toLowerCase().includes(q) &&
        !(r.assignedProvider ?? '').toLowerCase().includes(q) &&
        !r.specialty.toLowerCase().includes(q)
      )
        return false;
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (specialtyFilter !== 'All' && r.specialty !== specialtyFilter) return false;
      if (urgencyFilter !== 'All' && r.urgency !== urgencyFilter) return false;
      return true;
    });
  }, [sourceReferrals, search, statusFilter, specialtyFilter, urgencyFilter]);

  const selectedReferral = selectedId
    ? (sourceReferrals.find((r) => r.id === selectedId) ?? null)
    : null;

  const hasFilters =
    search || statusFilter !== 'All' || specialtyFilter !== 'All' || urgencyFilter !== 'All';

  return (
    <AppLayout
      pageTitle="Submitted Referrals — Status & Outcomes"
      breadcrumbs={[
        { label: 'Contracts', href: '/contract-program-selection' },
        { label: 'Medicare MSSP Track 3', href: '/panel-cohort-view' },
        { label: 'Submitted Referrals' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">
            Contract: Medicare MSSP Track 3
          </span>
          <span className="text-xs text-[#0043ce]">Total Submitted: {sourceReferrals.length}</span>
          <span className="text-xs text-[#0043ce]">
            Completed: {sourceReferrals.filter((r) => r.status === 'Completed').length}
          </span>
          {fhirSource && (
            <span className="ml-1 text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              FHIR R4
            </span>
          )}
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of Apr 15, 2026</span>
        </div>
      }
    >
      <SubmittedReferralsKPI />

      {/* Filter bar */}
      <div className="bg-white border-b border-carbon-gray-20 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-40"
          />
          <input
            type="text"
            placeholder="Search patient, provider, ICD, specialty…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-carbon-gray-30 text-sm pl-8 pr-3 py-1.5 w-64 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
        >
          {specialties.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
        >
          {urgencies.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
              setSpecialtyFilter('All');
              setUrgencyFilter('All');
            }}
            className="text-xs text-carbon-blue hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-carbon-gray-50">
          {filtered.length} referral{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() =>
            exportAllReferralsPDF(
              filtered,
              `${filtered.length} referral${filtered.length !== 1 ? 's' : ''}${statusFilter !== 'All' ? ` · ${statusFilter}` : ''}${specialtyFilter !== 'All' ? ` · ${specialtyFilter}` : ''}`
            )
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0f62fe] border border-[#0f62fe] hover:bg-[#edf5ff] transition-colors"
          title="Export current view as PDF"
        >
          <Icon name="ArrowDownTrayIcon" size={13} />
          Export PDF
        </button>
      </div>

      {/* List + Detail panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Referral list */}
        <div className={`flex-1 overflow-y-auto ${selectedReferral ? 'pr-[520px]' : ''}`}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-carbon-gray-40">
              <Icon name="DocumentMagnifyingGlassIcon" size={36} />
              <p className="mt-3 text-sm font-medium">No referrals match your filters</p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('All');
                  setSpecialtyFilter('All');
                  setUrgencyFilter('All');
                }}
                className="mt-2 text-xs text-carbon-blue hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            filtered.map((r) => (
              <ReferralRow
                key={r.id}
                referral={r}
                isSelected={selectedId === r.id}
                onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
              />
            ))
          )}
        </div>

        {/* Detail drawer */}
        {selectedReferral && (
          <ReferralDetailDrawer referral={selectedReferral} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </AppLayout>
  );
}
