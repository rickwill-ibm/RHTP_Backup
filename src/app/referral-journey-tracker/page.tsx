'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import type { ReferralRecord } from '@/app/referral-tracking/page';
import {
  CARE_TEAM_INBOX_TASKS,
  PROGRAM_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '@/lib/fhirCareTeamData';
import type { TaskProgramType } from '@/lib/fhirCareTeamData';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { buildLiveJourneyReferrals, mergeReferralsById } from '@/lib/referrals/fromReferralTask';
import { journeyReferrals, deriveJourneyStatus } from '@/lib/referrals/journeyReferralData';
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

export type JourneyStatus = 'pending' | 'accepted' | 'scheduled' | 'completed' | 'cancelled';

export interface ReferralJourneyRecord extends ReferralRecord {
  journeyStatus: JourneyStatus;
  providerResponse: string | null;
  providerResponseDate: string | null;
  scheduledDate: string | null;
  appointmentConfirmedDate: string | null;
  outcomeNotes: string | null;
  outcomeDate: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
}

// ─── Status Timeline Steps ────────────────────────────────────────────────────

const TIMELINE_STEPS: { key: JourneyStatus; label: string; icon: string }[] = [
  { key: 'pending', label: 'Submitted', icon: 'PaperAirplaneIcon' },
  { key: 'accepted', label: 'Accepted', icon: 'CheckCircleIcon' },
  { key: 'scheduled', label: 'Scheduled', icon: 'CalendarDaysIcon' },
  { key: 'completed', label: 'Completed', icon: 'ClipboardDocumentCheckIcon' },
];

const STATUS_ORDER: Record<JourneyStatus, number> = {
  pending: 0,
  accepted: 1,
  scheduled: 2,
  completed: 3,
  cancelled: -1,
};

function getStepState(
  stepKey: JourneyStatus,
  currentStatus: JourneyStatus
): 'done' | 'active' | 'upcoming' {
  if (currentStatus === 'cancelled') return 'upcoming';
  const stepIdx = STATUS_ORDER[stepKey];
  const currentIdx = STATUS_ORDER[currentStatus];
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'upcoming';
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function JourneyStatusBadge({ status }: { status: JourneyStatus }) {
  const map: Record<JourneyStatus, { cls: string; label: string }> = {
    pending: {
      cls: 'bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-30',
      label: 'Pending',
    },
    accepted: { cls: 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]', label: 'Accepted' },
    scheduled: { cls: 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]', label: 'Scheduled' },
    completed: { cls: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]', label: 'Completed' },
    cancelled: { cls: 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]', label: 'Cancelled' },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

function UrgencyChip({ urgency }: { urgency: string }) {
  const map: Record<string, string> = {
    Routine: 'text-carbon-gray-50',
    Urgent: 'text-[#b45309] font-semibold',
    STAT: 'text-[#da1e28] font-bold',
  };
  return <span className={`text-xs ${map[urgency] ?? 'text-carbon-gray-50'}`}>{urgency}</span>;
}

// ─── Status Timeline Component ────────────────────────────────────────────────

function StatusTimeline({ status }: { status: JourneyStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-5 h-5 flex items-center justify-center bg-[#fff1f1] border border-[#ffb3b8]">
          <Icon name="XMarkIcon" size={12} className="text-[#da1e28]" />
        </span>
        <span className="text-xs text-[#da1e28] font-semibold">Referral Cancelled</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0">
      {TIMELINE_STEPS.map((step, idx) => {
        const state = getStepState(step.key, status);
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={`w-6 h-6 flex items-center justify-center border transition-colors
                  ${state === 'done' ? 'bg-[#0043ce] border-[#0043ce]' : ''}
                  ${state === 'active' ? 'bg-[#d0e2ff] border-[#0043ce]' : ''}
                  ${state === 'upcoming' ? 'bg-white border-carbon-gray-30' : ''}
                `}
              >
                <Icon
                  name={step.icon as any}
                  size={12}
                  className={
                    state === 'done'
                      ? 'text-white'
                      : state === 'active'
                        ? 'text-[#0043ce]'
                        : 'text-carbon-gray-30'
                  }
                />
              </div>
              <span
                className={`text-2xs whitespace-nowrap
                  ${state === 'done' ? 'text-[#0043ce] font-medium' : ''}
                  ${state === 'active' ? 'text-[#0043ce] font-semibold' : ''}
                  ${state === 'upcoming' ? 'text-carbon-gray-40' : ''}
                `}
              >
                {step.label}
              </span>
            </div>
            {idx < TIMELINE_STEPS.length - 1 && (
              <div
                className={`h-px w-8 mb-3.5 transition-colors
                  ${STATUS_ORDER[status] > idx ? 'bg-[#0043ce]' : 'bg-carbon-gray-20'}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function ReferralDetailDrawer({
  referral,
  onClose,
}: {
  referral: ReferralJourneyRecord;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white flex flex-col h-full shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <JourneyStatusBadge status={referral.journeyStatus} />
              <UrgencyChip urgency={referral.urgency} />
              <span className="text-2xs font-mono text-carbon-gray-50">
                {referral.id.toUpperCase()}
              </span>
            </div>
            <h2 className="text-base font-semibold text-carbon-gray-100">{referral.patientName}</h2>
            <p className="text-xs text-carbon-gray-50">
              {referral.specialty} · {referral.icdCode} — {referral.icdDescription}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Status Timeline */}
          <section>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-3">
              Referral Journey
            </p>
            <StatusTimeline status={referral.journeyStatus} />
          </section>

          {/* Referral Details */}
          <section className="bg-carbon-gray-10 border border-carbon-gray-20 p-4 space-y-3">
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
              Referral Details
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-carbon-gray-50 block">Submitted</span>
                <span className="font-medium text-carbon-gray-100">{referral.referralDate}</span>
              </div>
              <div>
                <span className="text-carbon-gray-50 block">Channel</span>
                <span className="font-medium text-carbon-gray-100">
                  {referral.submissionChannel ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-carbon-gray-50 block">Coordinator</span>
                <span className="font-medium text-carbon-gray-100">{referral.coordinatorName}</span>
              </div>
              <div>
                <span className="text-carbon-gray-50 block">Days Open</span>
                <span
                  className={`font-mono font-semibold ${referral.daysOpen > 14 ? 'text-[#da1e28]' : referral.daysOpen > 7 ? 'text-[#b45309]' : 'text-carbon-gray-100'}`}
                >
                  {referral.daysOpen}d
                </span>
              </div>
              <div>
                <span className="text-carbon-gray-50 block">Network Tier</span>
                <span
                  className={`font-medium ${referral.providerTier === 'Preferred' ? 'text-[#0e6027]' : referral.providerTier === 'Out-of-Network' ? 'text-[#da1e28]' : 'text-[#0043ce]'}`}
                >
                  {referral.providerTier ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-carbon-gray-50 block">Clinical Note</span>
                <span className="font-medium text-carbon-gray-100">{referral.notes}</span>
              </div>
            </div>
          </section>

          {/* Provider Response */}
          <section>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Provider Response
            </p>
            {referral.assignedProvider ? (
              <div className="border border-carbon-gray-20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#d0e2ff] flex items-center justify-center">
                      <Icon name="UserIcon" size={14} className="text-[#0043ce]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-carbon-gray-100">
                        {referral.assignedProvider}
                      </p>
                      <p className="text-2xs text-carbon-gray-50">{referral.specialty}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/provider-selection')}
                    className="text-2xs text-carbon-blue hover:underline flex items-center gap-1"
                  >
                    View Profile
                    <Icon name="ArrowTopRightOnSquareIcon" size={11} />
                  </button>
                </div>
                {referral.providerResponse && (
                  <div className="bg-[#edf5ff] border border-[#97c1ff] px-3 py-2">
                    <p className="text-xs text-[#0043ce]">{referral.providerResponse}</p>
                    {referral.providerResponseDate && (
                      <p className="text-2xs text-carbon-gray-50 mt-1">
                        Responded: {referral.providerResponseDate}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-dashed border-carbon-gray-30 p-4 text-center">
                <Icon name="UserPlusIcon" size={20} className="text-carbon-gray-30 mx-auto mb-1" />
                <p className="text-xs text-carbon-gray-50">No provider assigned yet</p>
                <button
                  onClick={() => router.push('/provider-selection')}
                  className="mt-2 text-xs text-carbon-blue hover:underline"
                >
                  Assign Provider →
                </button>
              </div>
            )}
          </section>

          {/* Appointment Details */}
          <section>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Appointment Details
            </p>
            {referral.scheduledDate ? (
              <div className="border border-carbon-gray-20 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-carbon-gray-50 block">Scheduled Date</span>
                  <span className="font-semibold text-carbon-gray-100 flex items-center gap-1">
                    <Icon name="CalendarDaysIcon" size={12} className="text-[#0043ce]" />
                    {referral.scheduledDate}
                  </span>
                </div>
                <div>
                  <span className="text-carbon-gray-50 block">Confirmed</span>
                  <span className="font-medium text-carbon-gray-100">
                    {referral.appointmentConfirmedDate ?? '—'}
                  </span>
                </div>
                {referral.closedDate && (
                  <div>
                    <span className="text-carbon-gray-50 block">Closed Date</span>
                    <span className="font-medium text-carbon-gray-100">{referral.closedDate}</span>
                  </div>
                )}
                {referral.outcome && (
                  <div>
                    <span className="text-carbon-gray-50 block">Outcome</span>
                    <span
                      className={`font-semibold ${referral.outcome === 'Seen' ? 'text-[#0e6027]' : referral.outcome === 'No-Show' ? 'text-[#da1e28]' : 'text-carbon-gray-70'}`}
                    >
                      {referral.outcome}
                    </span>
                  </div>
                )}
                {referral.followUpRequired && referral.followUpDate && (
                  <div className="col-span-2 bg-[#fdf6dd] border border-[#f1c21b] px-3 py-2 flex items-center gap-2">
                    <Icon name="ClockIcon" size={13} className="text-[#b45309]" />
                    <span className="text-xs text-[#b45309] font-medium">
                      Follow-up required: {referral.followUpDate}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-dashed border-carbon-gray-30 p-4 text-center">
                <Icon
                  name="CalendarDaysIcon"
                  size={20}
                  className="text-carbon-gray-30 mx-auto mb-1"
                />
                <p className="text-xs text-carbon-gray-50">No appointment scheduled yet</p>
              </div>
            )}
          </section>

          {/* Outcome Notes */}
          <section>
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
              Referral Outcome Notes
            </p>
            {referral.outcomeNotes ? (
              <div className="border border-[#a7f0ba] bg-[#defbe6] p-3">
                <div className="flex items-start gap-2">
                  <Icon
                    name="ClipboardDocumentCheckIcon"
                    size={14}
                    className="text-[#0e6027] mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="text-xs text-[#0e6027] font-medium">{referral.outcomeNotes}</p>
                    {referral.outcomeDate && (
                      <p className="text-2xs text-[#0e6027]/70 mt-1">
                        Recorded: {referral.outcomeDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-carbon-gray-30 p-4 text-center">
                <Icon
                  name="ClipboardDocumentListIcon"
                  size={20}
                  className="text-carbon-gray-30 mx-auto mb-1"
                />
                <p className="text-xs text-carbon-gray-50">
                  Outcome notes will appear after appointment completion
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-carbon-gray-20 px-5 py-3 flex items-center gap-2 flex-shrink-0 bg-white">
          <button
            onClick={() => router.push(`/patient-detail?id=${referral.patientId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            <Icon name="UserIcon" size={13} />
            Patient Detail
          </button>
          <button
            onClick={() => router.push('/referral-tracking')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            <Icon name="ArrowsRightLeftIcon" size={13} />
            Referral Tracking
          </button>
          <button
            onClick={() => router.push('/provider-selection')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors ml-auto"
          >
            <Icon name="BuildingOffice2Icon" size={13} />
            Provider Directory
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function JourneyKPIStrip({ referrals }: { referrals: ReferralJourneyRecord[] }) {
  const total = referrals.length;
  const pending = referrals.filter((r) => r.journeyStatus === 'pending').length;
  const accepted = referrals.filter((r) => r.journeyStatus === 'accepted').length;
  const scheduled = referrals.filter((r) => r.journeyStatus === 'scheduled').length;
  const completed = referrals.filter((r) => r.journeyStatus === 'completed').length;
  const completionRate = Math.round((completed / total) * 100);
  const avgDays = (referrals.reduce((s, r) => s + r.daysOpen, 0) / total).toFixed(1);

  const kpis = [
    {
      label: 'Total Referrals',
      value: String(total),
      sub: 'All submitted',
      color: 'text-carbon-gray-100',
    },
    {
      label: 'Pending',
      value: String(pending),
      sub: 'Awaiting provider',
      color: 'text-carbon-gray-70',
    },
    {
      label: 'Accepted',
      value: String(accepted),
      sub: 'Provider confirmed',
      color: 'text-[#0043ce]',
    },
    {
      label: 'Scheduled',
      value: String(scheduled),
      sub: 'Appt confirmed',
      color: 'text-[#b45309]',
    },
    {
      label: 'Completed',
      value: String(completed),
      sub: `${completionRate}% close rate`,
      color: 'text-[#0e6027]',
    },
    {
      label: 'Avg Days Open',
      value: avgDays,
      sub: 'Across all referrals',
      color: 'text-carbon-gray-100',
    },
  ];

  return (
    <div className="grid grid-cols-3 xl:grid-cols-6 border-b border-carbon-gray-20 bg-white">
      {kpis.map((k, i) => (
        <div
          key={k.label}
          className={`px-5 py-3.5 ${i < kpis.length - 1 ? 'border-r border-carbon-gray-20' : ''}`}
        >
          <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          <p className="text-xs font-semibold text-carbon-gray-70 mt-0.5">{k.label}</p>
          <p className="text-2xs text-carbon-gray-40">{k.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-Program Analytics Panel ───────────────────────────────────────────

function MultiProgramAnalyticsPanel() {
  const [programFilter, setProgramFilter] = useState<TaskProgramType | 'All'>('All');

  const allTasks = CARE_TEAM_INBOX_TASKS;
  const programs = Object.keys(PROGRAM_TYPE_CONFIG) as TaskProgramType[];

  const programStats = programs
    .map((prog) => {
      const tasks = allTasks.filter((t) => t.programType === prog);
      const completed = tasks.filter((t) => t.status === 'completed').length;
      const total = tasks.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      const avgDue = tasks.length > 0 ? tasks[0].dueDate : '—';
      const cfg = PROGRAM_TYPE_CONFIG[prog];
      return { prog, tasks, completed, total, rate, cfg };
    })
    .filter((s) => s.total > 0);

  // Dual-need funnel: patients with both clinical AND social tasks
  const patientTaskMap: Record<string, Set<TaskProgramType>> = {};
  allTasks.forEach((t) => {
    if (!patientTaskMap[t.patientId]) patientTaskMap[t.patientId] = new Set();
    patientTaskMap[t.patientId].add(t.programType);
  });

  const dualNeedPatients = Object.entries(patientTaskMap).filter(([, programs]) => {
    const hasClinical = programs.has('Clinical');
    const hasSocial =
      programs.has('Food Security') ||
      programs.has('Housing') ||
      programs.has('Transportation') ||
      programs.has('Social Isolation') ||
      programs.has('Behavioral Health');
    return hasClinical && hasSocial;
  });

  const filteredTasks =
    programFilter === 'All' ? allTasks : allTasks.filter((t) => t.programType === programFilter);

  return (
    <div className="space-y-4">
      {/* Cross-program completion rates */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-4 flex items-center gap-2">
          <Icon name="ChartBarIcon" size={15} className="text-[#0043ce]" />
          Cross-Program Task Completion Rates
        </h3>
        <div className="space-y-3">
          {programStats.map(({ prog, completed, total, rate, cfg }) => (
            <div key={prog} className="flex items-center gap-3">
              <div
                className={`flex items-center gap-1.5 w-36 flex-shrink-0 px-2 py-1 ${cfg.bg} border ${cfg.border}`}
              >
                <Icon name={cfg.icon as any} size={12} className={cfg.color} />
                <span className={`text-2xs font-semibold ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="flex-1 h-4 bg-carbon-gray-10 border border-carbon-gray-20 relative overflow-hidden">
                <div className="h-full bg-[#0043ce] transition-all" style={{ width: `${rate}%` }} />
              </div>
              <span className="text-xs font-mono font-bold text-carbon-gray-100 w-10 text-right">
                {rate}%
              </span>
              <span className="text-2xs text-carbon-gray-50 w-16 text-right">
                {completed}/{total} tasks
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dual-need funnel */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
          <Icon name="FunnelIcon" size={15} className="text-[#6929c4]" />
          Dual-Need Funnel — Clinical + Social Co-Occurring
        </h3>
        <p className="text-xs text-carbon-gray-50 mb-4">
          Patients with both open clinical Tasks and open social Tasks — the highest-risk cohort.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            {
              label: 'Total Patients',
              value: Object.keys(patientTaskMap).length,
              color: 'text-carbon-gray-100',
              sub: 'with active tasks',
            },
            {
              label: 'Dual-Need Patients',
              value: dualNeedPatients.length,
              color: 'text-[#6929c4]',
              sub: 'clinical + social',
            },
            {
              label: 'Dual-Need Rate',
              value: `${Math.round((dualNeedPatients.length / Math.max(Object.keys(patientTaskMap).length, 1)) * 100)}%`,
              color: 'text-[#da1e28]',
              sub: 'highest risk cohort',
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3 text-center"
            >
              <p className={`text-2xl font-bold font-mono ${k.color}`}>{k.value}</p>
              <p className="text-xs font-semibold text-carbon-gray-70 mt-0.5">{k.label}</p>
              <p className="text-2xs text-carbon-gray-40">{k.sub}</p>
            </div>
          ))}
        </div>
        {/* Dual-need patient list */}
        <div className="space-y-2">
          {dualNeedPatients.map(([patientId, progs]) => {
            const patientTask = allTasks.find((t) => t.patientId === patientId);
            if (!patientTask) return null;
            return (
              <div
                key={patientId}
                className="flex items-center gap-3 px-4 py-3 bg-[#f6f2ff] border border-[#d4bbff]"
              >
                <div className="w-8 h-8 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
                  <Icon name="UserIcon" size={14} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-carbon-gray-100">
                    {patientTask.patientName}
                  </p>
                  <p className="text-xs text-carbon-gray-50 font-mono">
                    {patientId} · {patientTask.patientRiskTier} Risk
                  </p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Array.from(progs).map((p) => {
                    const cfg = PROGRAM_TYPE_CONFIG[p];
                    return (
                      <span
                        key={p}
                        className={`text-2xs font-semibold px-1.5 py-0.5 ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                      >
                        {cfg.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Program filter + task cycle time */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="ClockIcon" size={15} className="text-[#b45309]" />
            Task Cycle Time by Program
          </h3>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setProgramFilter('All')}
              className={`px-2 py-1 text-2xs font-medium border transition-colors ${
                programFilter === 'All'
                  ? 'bg-[#0043ce] text-white border-[#0043ce]'
                  : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
              }`}
            >
              All
            </button>
            {programs.map((prog) => {
              const cfg = PROGRAM_TYPE_CONFIG[prog];
              return (
                <button
                  key={prog}
                  onClick={() => setProgramFilter(prog)}
                  className={`px-2 py-1 text-2xs font-medium border transition-colors ${
                    programFilter === prog
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {['Patient', 'Program', 'Task', 'Status', 'Authored', 'Due', 'Owner'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {filteredTasks.slice(0, 8).map((task) => {
                const progCfg = PROGRAM_TYPE_CONFIG[task.programType];
                const statusCfg = TASK_STATUS_CONFIG[task.status];
                return (
                  <tr key={task.id} className="hover:bg-carbon-gray-10">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-carbon-gray-100">{task.patientName}</p>
                      <p className="font-mono text-carbon-gray-30">{task.patientId}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 ${progCfg.bg} ${progCfg.color} border ${progCfg.border} whitespace-nowrap`}
                      >
                        <Icon name={progCfg.icon as any} size={10} />
                        {task.programType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <p className="text-carbon-gray-100 truncate">{task.description}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-2xs font-semibold px-1.5 py-0.5 ${statusCfg.bg} ${statusCfg.color}`}
                      >
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                      {task.authoredOn.split('T')[0]}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                      {task.dueDate}
                    </td>
                    <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">
                      {task.owner.display}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReferralJourneyTrackerPage() {
  const { useMockData, referralTasks } = useAppContext();
  const { activeCitizenId } = useActiveCitizen();
  const [selectedReferral, setSelectedReferral] = useState<ReferralJourneyRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<JourneyStatus | 'all'>('all');
  const [filterSpecialty, setFilterSpecialty] = useState('All');
  const [filterUrgency, setFilterUrgency] = useState('All');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<'clinical' | 'multi-program'>('clinical');
  const [fhirReferrals, setFhirReferrals] = useState<ReferralJourneyRecord[] | null>(null);
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
        if (srEntries.length === 0) return; // no FHIR referrals yet — keep mock
        // Map Tasks by their focused SR reference
        const taskMap = new Map<string, any>();
        taskEntries.forEach((t: any) => {
          const srRef = t.focus?.reference?.split('/')[1];
          if (srRef) taskMap.set(srRef, t);
        });
        const records = srEntries.map((sr: any) => mapFhirToReferralRecord(sr, taskMap));
        const enriched: ReferralJourneyRecord[] = records.map((r: ReferralRecord) => ({
          ...r,
          journeyStatus: deriveJourneyStatus(r),
          providerResponse: null,
          providerResponseDate: null,
          scheduledDate: r.appointmentDate,
          appointmentConfirmedDate: null,
          outcomeNotes: null,
          outcomeDate: r.closedDate,
          followUpRequired: false,
          followUpDate: null,
        }));
        setFhirReferrals(enriched);
        setFhirSource(true);
      })
      .catch(() => {
        /* non-fatal — fall back to mock */
      });
  }, [activeCitizenId, useMockData]);

  // Live Run-play / manual referrals — deduped + shaped in the referrals lib,
  // merged (by id, live-wins) ahead of the authored journeys.
  const liveJourney = useMemo(() => buildLiveJourneyReferrals(referralTasks), [referralTasks]);
  const sourceReferrals = fhirReferrals ?? mergeReferralsById(liveJourney, journeyReferrals);
  const specialties = [
    'All',
    ...Array.from(new Set(sourceReferrals.map((r) => r.specialty))).sort(),
  ];
  const urgencies = ['All', 'Routine', 'Urgent', 'STAT'];

  const filtered = useMemo(() => {
    return sourceReferrals.filter((r) => {
      if (filterStatus !== 'all' && r.journeyStatus !== filterStatus) return false;
      if (filterSpecialty !== 'All' && r.specialty !== filterSpecialty) return false;
      if (filterUrgency !== 'All' && r.urgency !== filterUrgency) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.patientName.toLowerCase().includes(q) &&
          !r.specialty.toLowerCase().includes(q) &&
          !(r.assignedProvider ?? '').toLowerCase().includes(q) &&
          !r.icdCode.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [sourceReferrals, filterStatus, filterSpecialty, filterUrgency, search]);

  const hasFilters =
    filterStatus !== 'all' || filterSpecialty !== 'All' || filterUrgency !== 'All' || search;

  return (
    <AppLayout
      pageTitle="Referral Journey Tracker — Closed-Loop Outcomes"
      breadcrumbs={[
        { label: 'Contracts', href: '/contract-program-selection' },
        { label: 'Medicare MSSP Track 3', href: '/panel-cohort-view' },
        { label: 'Referral Tracking', href: '/referral-tracking' },
        { label: 'Journey Tracker' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">
            Contract: Medicare MSSP Track 3
          </span>
          <span className="text-xs text-[#0043ce]">
            Tracking {sourceReferrals.length} referral journeys
          </span>
          <span className="text-xs text-[#0043ce]">
            Completion Rate:{' '}
            {Math.round(
              (sourceReferrals.filter((r) => r.journeyStatus === 'completed').length /
                sourceReferrals.length) *
                100
            )}
            %
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/referral-tracking"
              className="text-xs text-[#0043ce] hover:underline flex items-center gap-1"
            >
              <Icon name="ArrowsRightLeftIcon" size={12} />
              Referral Tracking
            </Link>
            <Link
              href="/provider-selection"
              className="text-xs text-[#0043ce] hover:underline flex items-center gap-1"
            >
              <Icon name="BuildingOffice2Icon" size={12} />
              Provider Directory
            </Link>
            <span className="text-xs text-carbon-gray-50">Data as of Apr 15, 2026</span>
          </div>
        </div>
      }
    >
      <JourneyKPIStrip referrals={sourceReferrals} />

      <div className="px-6 pb-4 space-y-4 pt-4">
        {/* View toggle */}
        <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
          {[
            {
              key: 'clinical' as const,
              label: 'Clinical Referral Journeys',
              icon: 'ArrowsRightLeftIcon',
            },
            {
              key: 'multi-program' as const,
              label: 'Multi-Program Analytics',
              icon: 'ChartBarIcon',
            },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeView === v.key
                  ? 'bg-[#0043ce] text-white'
                  : 'text-carbon-gray-70 hover:bg-white'
              }`}
            >
              <Icon name={v.icon as any} size={13} />
              {v.label}
            </button>
          ))}
        </div>

        {activeView === 'multi-program' && <MultiProgramAnalyticsPanel />}

        {activeView === 'clinical' && (
          <>
            {/* Navigation shortcuts */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
                Quick Navigate
              </span>
              <Link
                href="/referral-tracking"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
              >
                <Icon name="ArrowsRightLeftIcon" size={13} />
                Referral Tracking
              </Link>
              <Link
                href="/provider-selection"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
              >
                <Icon name="BuildingOffice2Icon" size={13} />
                Provider Directory
              </Link>
              <Link
                href="/panel-cohort-view"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
              >
                <Icon name="UserGroupIcon" size={13} />
                Panel & Cohort
              </Link>
            </div>

            {/* Filters */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search patient, provider, ICD…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-carbon-gray-30 text-sm px-3 py-1.5 w-56 focus:outline-none focus:border-carbon-blue"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as JourneyStatus | 'all')}
                className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
              >
                {specialties.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={filterUrgency}
                onChange={(e) => setFilterUrgency(e.target.value)}
                className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
              >
                {urgencies.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              {hasFilters && (
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterSpecialty('All');
                    setFilterUrgency('All');
                    setSearch('');
                  }}
                  className="text-xs text-carbon-blue hover:underline"
                >
                  Clear filters
                </button>
              )}
              <span className="ml-auto text-xs text-carbon-gray-50">
                {filtered.length} referral{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Referral Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-3 bg-white border border-carbon-gray-20 py-12 text-center">
                  <Icon
                    name="MagnifyingGlassIcon"
                    size={28}
                    className="text-carbon-gray-30 mx-auto mb-2"
                  />
                  <p className="text-sm text-carbon-gray-50">
                    No referrals match the current filters.
                  </p>
                </div>
              ) : (
                filtered.map((r) => (
                  <ReferralJourneyCard
                    key={r.id}
                    referral={r}
                    onClick={() => setSelectedReferral(r)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedReferral && (
        <ReferralDetailDrawer
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
        />
      )}
    </AppLayout>
  );
}

// ─── Referral Journey Card ────────────────────────────────────────────────────

function ReferralJourneyCard({
  referral,
  onClick,
}: {
  referral: ReferralJourneyRecord;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-carbon-gray-20 hover:border-[#97c1ff] hover:shadow-sm transition-all cursor-pointer group"
    >
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-carbon-gray-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <JourneyStatusBadge status={referral.journeyStatus} />
            <UrgencyChip urgency={referral.urgency} />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100 truncate">
            {referral.patientName}
          </p>
          <p className="text-xs text-carbon-gray-50 truncate">
            {referral.specialty} · {referral.icdCode}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className={`text-sm font-mono font-bold tabular-nums ${referral.daysOpen > 14 ? 'text-[#da1e28]' : referral.daysOpen > 7 ? 'text-[#b45309]' : 'text-carbon-gray-70'}`}
          >
            {referral.daysOpen}d
          </p>
          <p className="text-2xs text-carbon-gray-40">open</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 py-3 border-b border-carbon-gray-10">
        <StatusTimeline status={referral.journeyStatus} />
      </div>

      {/* Provider + Appointment */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Icon name="UserIcon" size={12} className="text-carbon-gray-40 flex-shrink-0" />
          <span className="text-carbon-gray-70 truncate">
            {referral.assignedProvider ?? (
              <span className="italic text-carbon-gray-40">Unassigned</span>
            )}
          </span>
          {referral.providerTier && (
            <span
              className={`ml-auto text-2xs font-medium flex-shrink-0 ${referral.providerTier === 'Preferred' ? 'text-[#0e6027]' : referral.providerTier === 'Out-of-Network' ? 'text-[#da1e28]' : 'text-[#0043ce]'}`}
            >
              {referral.providerTier}
            </span>
          )}
        </div>
        {referral.scheduledDate && (
          <div className="flex items-center gap-2 text-xs">
            <Icon name="CalendarDaysIcon" size={12} className="text-carbon-gray-40 flex-shrink-0" />
            <span className="text-carbon-gray-70">Appt: {referral.scheduledDate}</span>
          </div>
        )}
        {referral.outcomeNotes && (
          <div className="flex items-start gap-2 text-xs bg-[#defbe6] border border-[#a7f0ba] px-2 py-1.5">
            <Icon
              name="ClipboardDocumentCheckIcon"
              size={12}
              className="text-[#0e6027] flex-shrink-0 mt-0.5"
            />
            <span className="text-[#0e6027] line-clamp-2">{referral.outcomeNotes}</span>
          </div>
        )}
        {referral.providerResponse && !referral.outcomeNotes && (
          <div className="flex items-start gap-2 text-xs bg-[#edf5ff] border border-[#97c1ff] px-2 py-1.5">
            <Icon
              name="ChatBubbleLeftEllipsisIcon"
              size={12}
              className="text-[#0043ce] flex-shrink-0 mt-0.5"
            />
            <span className="text-[#0043ce] line-clamp-2">{referral.providerResponse}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-carbon-gray-10 flex items-center justify-between">
        <span className="text-2xs text-carbon-gray-40">
          {referral.referralDate} · {referral.coordinatorName}
        </span>
        <span className="text-2xs text-carbon-blue opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          View details <Icon name="ChevronRightIcon" size={11} />
        </span>
      </div>
    </div>
  );
}
