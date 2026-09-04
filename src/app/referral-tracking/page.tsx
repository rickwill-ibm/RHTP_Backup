'use client';
import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ReferralKPIStrip from './components/ReferralKPIStrip';
import ActiveReferralsTable from './components/ActiveReferralsTable';
import ProviderAssignmentPanel from './components/ProviderAssignmentPanel';
import OutcomeMetricsPanel from './components/OutcomeMetricsPanel';
import ReferralAuditLog from './components/ReferralAuditLog';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { mockReferrals } from './components/ActiveReferralsTable';
import { exportReferralsCSV, generatePDFReport } from '@/lib/exportUtils';
import {
  CARE_TEAM_INBOX_TASKS,
  PROGRAM_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '@/lib/fhirCareTeamData';
import type { TaskProgramType, TaskStatus } from '@/lib/fhirCareTeamData';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { initiateReferral } from '@/lib/services/referralService';
import { getFhirClient } from '@/lib/services/fhirClient';

export type ReferralStatus =
  'Pending' | 'Assigned' | 'In Progress' | 'Awaiting EMR' | 'Completed' | 'Cancelled';
export type ReferralUrgency = 'Routine' | 'Urgent' | 'STAT';

export interface ReferralRecord {
  id: string;
  patientName: string;
  patientId: string;
  referralDate: string;
  specialty: string;
  urgency: ReferralUrgency;
  status: ReferralStatus;
  assignedProvider: string | null;
  providerId: string | null;
  providerTier: 'Preferred' | 'In-Network' | 'Out-of-Network' | null;
  icdCode: string;
  icdDescription: string;
  submissionChannel: string | null;
  submittedDate: string | null;
  appointmentDate: string | null;
  closedDate: string | null;
  outcome: 'Pending' | 'Seen' | 'No-Show' | 'Cancelled' | 'Hospitalized' | null;
  coordinatorName: string;
  notes: string;
  daysOpen: number;
}

export interface ReferralFilters {
  search: string;
  status: string;
  specialty: string;
  urgency: string;
  provider: string;
}

// ─── FHIR ServiceRequest → ReferralRecord mapper ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapServiceRequestToReferral(sr: any): ReferralRecord {
  const code = sr.code?.text ?? sr.code?.coding?.[0]?.display ?? 'Unknown';
  const patientRef: string = sr.subject?.reference ?? '';
  const patientId = patientRef.replace('Patient/', '');
  const patientDisplay = sr.subject?.display ?? patientId;
  const urgencyMap: Record<string, ReferralUrgency> = {
    stat: 'STAT',
    urgent: 'Urgent',
    routine: 'Routine',
    asap: 'Urgent',
  };
  const urgency: ReferralUrgency = urgencyMap[sr.priority?.toLowerCase() ?? 'routine'] ?? 'Routine';
  const statusMap: Record<string, ReferralStatus> = {
    active: 'In Progress',
    draft: 'Pending',
    'on-hold': 'Pending',
    completed: 'Completed',
    revoked: 'Cancelled',
    unknown: 'Pending',
  };
  const status: ReferralStatus = statusMap[sr.status ?? 'active'] ?? 'Pending';
  const authored: string = sr.authoredOn
    ? sr.authoredOn.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const daysOpen = Math.floor((Date.now() - new Date(authored).getTime()) / 86_400_000);
  const requester = sr.requester?.display ?? sr.requester?.reference ?? null;
  const note = (sr.note ?? [])[0]?.text ?? '';
  return {
    id: sr.id ?? `sr-${Math.random()}`,
    patientName: patientDisplay,
    patientId,
    referralDate: authored,
    specialty: code,
    urgency,
    status,
    assignedProvider: requester,
    providerId: sr.requester?.reference ?? null,
    providerTier: null,
    icdCode: sr.reasonCode?.[0]?.coding?.[0]?.code ?? sr.code?.coding?.[0]?.code ?? '—',
    icdDescription: sr.reasonCode?.[0]?.text ?? sr.reasonCode?.[0]?.coding?.[0]?.display ?? '',
    submissionChannel: 'FHIR API',
    submittedDate: authored,
    appointmentDate: null,
    closedDate: sr.status === 'completed' ? authored : null,
    outcome: sr.status === 'completed' ? 'Seen' : 'Pending',
    coordinatorName: 'FHIR',
    notes: note,
    daysOpen,
  };
}

export default function ReferralTrackingPage() {
  const { activePhysician, useMockData } = useAppContext();
  const { activeCitizenId } = useActiveCitizen();
  const [filters, setFilters] = useState<ReferralFilters>({
    search: '',
    status: 'All',
    specialty: 'All',
    urgency: 'All',
    provider: 'All',
  });
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);
  const [fhirReferrals, setFhirReferrals] = useState<ReferralRecord[] | null>(null);
  const [fhirLoading, setFhirLoading] = useState(false);

  // Fetch live ServiceRequests from FHIR when in live mode
  useEffect(() => {
    if (useMockData) {
      setFhirReferrals(null);
      return;
    }
    setFhirLoading(true);
    getFhirClient()
      .search('ServiceRequest', { _count: '100', _sort: '-authored' })
      .then((bundle: any) => {
        const records: ReferralRecord[] = (bundle?.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.resourceType === 'ServiceRequest')
          .map(mapServiceRequestToReferral);
        setFhirReferrals(records);
      })
      .catch(() => setFhirReferrals(null))
      .finally(() => setFhirLoading(false));
  }, [useMockData]);
  const [programFilter, setProgramFilter] = useState<TaskProgramType | 'All'>('All');
  const [activeView, setActiveView] = useState<'referrals' | 'tasks'>('referrals');

  const filteredTasks = useMemo(() => {
    return CARE_TEAM_INBOX_TASKS.filter(
      (t) => programFilter === 'All' || t.programType === programFilter
    );
  }, [programFilter]);

  const taskPipelineCounts = useMemo(() => {
    const counts: Partial<Record<TaskStatus, number>> = {};
    CARE_TEAM_INBOX_TASKS.forEach((t) => {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    });
    return counts;
  }, []);

  const handleExportCSV = () => {
    exportReferralsCSV(mockReferrals);
    toast.success('Referrals CSV downloaded', {
      description: `${mockReferrals.length} referrals exported`,
    });
  };

  // Step 3 — send referral to FHIR as ServiceRequest + Task
  const handleSendReferral = async (
    patientFhirId: string,
    specialty: string,
    icdCode: string,
    notes: string,
    urgency: 'routine' | 'urgent' | 'asap' | 'stat' = 'routine'
  ) => {
    if (useMockData) {
      toast.success(`Referral sent (mock) — ${specialty}`, {
        description: `Patient: ${patientFhirId}`,
      });
      return;
    }
    try {
      const result = await initiateReferral({
        patientId: patientFhirId,
        requesterId: activePhysician.fhirId, // Dr. Rick
        performerId: 'practitioner-jon', // Dr. Jon always receives
        serviceCode: icdCode || 'referral',
        serviceDisplay: specialty,
        reasonCode: icdCode,
        reasonDisplay: notes,
        priority: urgency,
        notes: `Referral from ${activePhysician.displayName} to Dr. Jon — ${specialty}`,
        gainshareEligible: true,
      });
      toast.success(`Referral sent to Dr. Jon — ${specialty}`, {
        description: `ServiceRequest: ${result.serviceRequest.id} · Task: ${result.task.id}`,
      });
      // AuditEvent: record the referral initiation in FHIR
      try {
        await getFhirClient().create({
          resourceType: 'AuditEvent',
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
            code: 'rest',
            display: 'RESTful Operation',
          },
          subtype: [
            {
              system: 'http://hl7.org/fhir/restful-interaction',
              code: 'create',
              display: 'create',
            },
          ],
          action: 'C',
          recorded: new Date().toISOString(),
          outcome: '0',
          agent: [
            {
              who: {
                reference: `Practitioner/${activePhysician.fhirId}`,
                display: activePhysician.displayName,
              },
              requestor: true,
            },
          ],
          source: { observer: { display: 'TCOC Platform — Referral Tracking' } },
          entity: [
            {
              what: { reference: `ServiceRequest/${result.serviceRequest.id}` },
              description: `Referral — ${specialty}`,
            },
            {
              what: { reference: `Task/${result.task.id}` },
              description: `Referral task for patient ${patientFhirId}`,
            },
          ],
        });
      } catch {
        // AuditEvent failure is non-fatal — referral already succeeded
      }
    } catch (err) {
      toast.error('Referral failed', { description: String(err) });
    }
  };

  const handleReferralReport = () => {
    const referrals = mockReferrals;
    const completed = referrals.filter((r) => r.status === 'Completed').length;
    const pending = referrals.filter((r) => r.status === 'Pending').length;
    const inProgress = referrals.filter((r) => r.status === 'In Progress').length;
    const stat = referrals.filter((r) => r.urgency === 'STAT').length;
    const avgDays = (referrals.reduce((s, r) => s + r.daysOpen, 0) / referrals.length).toFixed(1);
    const specialties = [...new Set(referrals.map((r) => r.specialty))];

    generatePDFReport({
      reportTitle: 'Referral Tracking Report — Medicare MSSP Track 3',
      subtitle: `${referrals.length} total referrals`,
      sections: [
        {
          title: 'Referral Summary',
          rows: [
            { label: 'Total Referrals', value: String(referrals.length) },
            {
              label: 'Completed',
              value: `${completed} (${Math.round((completed / referrals.length) * 100)}%)`,
            },
            { label: 'In Progress', value: String(inProgress) },
            { label: 'Pending Assignment', value: String(pending) },
            { label: 'STAT Referrals', value: String(stat) },
            { label: 'Avg Days Open', value: avgDays },
            { label: 'Specialties Active', value: specialties.join(', ') },
            {
              label: 'Report Date',
              value: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            },
          ],
        },
        {
          title: 'Status Breakdown',
          rows: [
            {
              label: 'Pending',
              value: String(referrals.filter((r) => r.status === 'Pending').length),
            },
            {
              label: 'Assigned',
              value: String(referrals.filter((r) => r.status === 'Assigned').length),
            },
            {
              label: 'In Progress',
              value: String(referrals.filter((r) => r.status === 'In Progress').length),
            },
            {
              label: 'Awaiting EMR',
              value: String(referrals.filter((r) => r.status === 'Awaiting EMR').length),
            },
            {
              label: 'Completed',
              value: String(referrals.filter((r) => r.status === 'Completed').length),
            },
            {
              label: 'Cancelled',
              value: String(referrals.filter((r) => r.status === 'Cancelled').length),
            },
          ],
        },
      ],
      tableHeaders: [
        'Patient',
        'Date',
        'Specialty',
        'Urgency',
        'Status',
        'Assigned Provider',
        'Days Open',
        'Outcome',
      ],
      tableRows: referrals.map((r) => [
        r.patientName,
        r.referralDate,
        r.specialty,
        r.urgency,
        r.status,
        r.assignedProvider ?? 'Unassigned',
        String(r.daysOpen),
        r.outcome ?? 'Pending',
      ]),
    });
    toast.success('Referral report opened', {
      description: "Use your browser's Print dialog to save as PDF",
    });
  };

  return (
    <AppLayout
      pageTitle="Referral Tracking — Provider Assignment & Outcomes"
      breadcrumbs={[
        { label: 'Contracts', href: '/contract-program-selection' },
        { label: 'Medicare MSSP Track 3', href: '/panel-cohort-view' },
        { label: 'Referral Tracking' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">
            Contract: Medicare MSSP Track 3
          </span>
          <span className="text-xs text-[#0043ce]">Active Referrals: 24</span>
          <span className="text-xs text-[#0043ce]">Avg Days to Assignment: 3.2</span>
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of Apr 15, 2026</span>
        </div>
      }
    >
      <ReferralKPIStrip />
      <div className="px-6 pb-4 space-y-4">
        {/* Send Referral to Dr. Jon — Step 3 */}
        <div
          className="bg-white border border-[#97c1ff] px-4 py-3 flex items-center gap-4 flex-wrap"
          style={{ borderLeftWidth: 4, borderLeftColor: activePhysician.color }}
        >
          <div className="flex items-center gap-2">
            <Icon name="ArrowsRightLeftIcon" size={14} className="text-[#0043ce]" />
            <span className="text-xs font-semibold" style={{ color: activePhysician.color }}>
              {activePhysician.displayName} ({activePhysician.role}) — Send Referral to Dr. Jon
            </span>
          </div>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button
              onClick={() =>
                handleSendReferral(
                  'patient-maria-001',
                  'Cardiology Evaluation',
                  'I10',
                  'Uncontrolled hypertension — BP 158/96',
                  'urgent'
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors"
            >
              <Icon name="UserPlusIcon" size={12} />
              Refer Maria → Cardiology {useMockData ? '(mock)' : '→ FHIR'}
            </button>
            <button
              onClick={() =>
                handleSendReferral(
                  'patient-dorothy-042',
                  'Pulmonology Follow-up',
                  'J44.1',
                  'COPD exacerbation — spirometry overdue',
                  'stat'
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#0043ce] text-[#0043ce] hover:bg-[#d0e2ff] transition-colors"
            >
              <Icon name="UserPlusIcon" size={12} />
              Refer Dorothy → Pulmonology {useMockData ? '(mock)' : '→ FHIR'}
            </button>
          </div>
        </div>
        {/* View toggle */}
        <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
          {[
            { key: 'referrals' as const, label: 'Clinical Referrals', icon: 'ArrowsRightLeftIcon' },
            {
              key: 'tasks' as const,
              label: 'Multi-Program Task Pipeline',
              icon: 'ClipboardDocumentListIcon',
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

        {activeView === 'referrals' && (
          <>
            {/* Action Bar */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
                Referral Actions
              </span>
              <button
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
                onClick={handleReferralReport}
              >
                <Icon name="DocumentChartBarIcon" size={13} />
                Referral Report
              </button>
              <button
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
                onClick={handleExportCSV}
              >
                <Icon name="ArrowDownTrayIcon" size={13} />
                Export CSV
              </button>
              <Link
                href="/referral-journey-tracker"
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors ml-auto"
              >
                <Icon name="MapIcon" size={13} />
                Journey Tracker
              </Link>
            </div>
            {/* Filters */}
            <ReferralFilterBar filters={filters} onFiltersChange={setFilters} />
            {/* Main table */}
            <ActiveReferralsTable
              filters={filters}
              selectedReferralId={selectedReferralId}
              onSelectReferral={setSelectedReferralId}
              referrals={fhirReferrals ?? undefined}
              loading={fhirLoading}
            />
            {/* Two-column: provider assignment + outcome metrics */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ProviderAssignmentPanel />
              <OutcomeMetricsPanel />
            </div>
            {/* Audit log */}
            <ReferralAuditLog selectedReferralId={selectedReferralId} />
          </>
        )}

        {activeView === 'tasks' && (
          <>
            {/* Program type filter */}
            <div className="bg-white border border-carbon-gray-20 px-4 py-3">
              <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
                Filter by Program
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setProgramFilter('All')}
                  className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                    programFilter === 'All'
                      ? 'bg-[#0043ce] text-white border-[#0043ce]'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  All Programs
                </button>
                {Object.entries(PROGRAM_TYPE_CONFIG).map(([prog, cfg]) => (
                  <button
                    key={prog}
                    onClick={() => setProgramFilter(prog as TaskProgramType)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
                      programFilter === prog
                        ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    <Icon name={cfg.icon as any} size={12} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task status pipeline */}
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
                <Icon name="ArrowsRightLeftIcon" size={15} className="text-[#0043ce]" />
                Task Status Pipeline — Closed-Loop View
              </h3>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {(
                  ['requested', 'accepted', 'in-progress', 'completed', 'rejected'] as TaskStatus[]
                ).map((status, idx) => {
                  const count = taskPipelineCounts[status] ?? 0;
                  const cfg = TASK_STATUS_CONFIG[status];
                  return (
                    <React.Fragment key={status}>
                      <div className={`p-4 border text-center ${cfg.bg}`}>
                        <p className={`text-2xl font-bold font-mono ${cfg.color}`}>{count}</p>
                        <p className={`text-xs font-medium mt-1 ${cfg.color}`}>{cfg.label}</p>
                      </div>
                      {idx < 4 && <div className="hidden" />}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Pipeline arrow */}
              <div className="flex items-center gap-1 text-2xs text-carbon-gray-30 mb-4">
                {['Requested', 'Accepted', 'In Progress', 'Completed'].map((s, i) => (
                  <React.Fragment key={s}>
                    <span className="px-2 py-1 bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-50">
                      {s}
                    </span>
                    {i < 3 && <Icon name="ArrowRightIcon" size={12} />}
                  </React.Fragment>
                ))}
                <span className="ml-2 text-carbon-gray-30">
                  → Evidence attached → Loop closed → EDW updated
                </span>
              </div>
            </div>

            {/* Task table */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-carbon-gray-100">
                  {programFilter === 'All' ? 'All Program Tasks' : `${programFilter} Tasks`}
                  <span className="ml-2 text-xs font-normal text-carbon-gray-50">
                    ({filteredTasks.length})
                  </span>
                </h3>
                <Link
                  href="/care-team-inbox"
                  className="text-xs text-[#0043ce] hover:underline flex items-center gap-1"
                >
                  <Icon name="InboxIcon" size={12} />
                  Open Care Team Inbox →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                    <tr>
                      {[
                        'Program',
                        'Patient',
                        'Task',
                        'Requester',
                        'Owner',
                        'Priority',
                        'Due',
                        'Status',
                        'Evidence',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-gray-20">
                    {filteredTasks.map((task) => {
                      const progCfg = PROGRAM_TYPE_CONFIG[task.programType];
                      const statusCfg = TASK_STATUS_CONFIG[task.status];
                      return (
                        <tr key={task.id} className="hover:bg-carbon-gray-10">
                          <td className="px-4 py-3">
                            <span
                              className={`flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 ${progCfg.bg} ${progCfg.color} border ${progCfg.border}`}
                            >
                              <Icon name={progCfg.icon as any} size={10} />
                              {task.programType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-carbon-gray-100">{task.patientName}</p>
                            <p className="font-mono text-carbon-gray-30">{task.patientId}</p>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-carbon-gray-100 truncate">{task.description}</p>
                            {task.reasonCode && (
                              <p className="font-mono text-carbon-gray-30">{task.reasonCode}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-carbon-gray-70 whitespace-nowrap">
                            {task.requester.display}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-carbon-gray-100">{task.owner.display}</p>
                            <p className="text-carbon-gray-30 truncate max-w-[120px]">
                              {task.owner.organization}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-2xs font-semibold uppercase ${
                                task.priority === 'stat' || task.priority === 'asap'
                                  ? 'text-[#da1e28]'
                                  : task.priority === 'urgent'
                                    ? 'text-[#b45309]'
                                    : 'text-carbon-gray-50'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-carbon-gray-50">
                            {task.dueDate}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 ${statusCfg.bg} ${statusCfg.color}`}
                            >
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {task.output ? (
                              <span className="flex items-center gap-1 text-2xs text-[#24a148] font-semibold">
                                <Icon name="CheckCircleIcon" size={12} />
                                Attached
                              </span>
                            ) : (
                              <span className="text-2xs text-carbon-gray-30">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Closed-loop evidence panel */}
            <div className="bg-white border border-carbon-gray-20 px-5 py-4">
              <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
                <Icon name="ShieldCheckIcon" size={15} className="text-[#6929c4]" />
                Closed-Loop Evidence — Completed Tasks
              </h3>
              <div className="space-y-2">
                {CARE_TEAM_INBOX_TASKS.filter((t) => t.status === 'completed' && t.output).map(
                  (task) => {
                    const progCfg = PROGRAM_TYPE_CONFIG[task.programType];
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-4 px-4 py-3 bg-[#defbe6] border border-[#a7f0ba]"
                      >
                        <div className="w-8 h-8 bg-[#24a148] flex items-center justify-center flex-shrink-0">
                          <Icon name="CheckIcon" size={14} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 ${progCfg.bg} ${progCfg.color} border ${progCfg.border}`}
                            >
                              {task.programType}
                            </span>
                            <span className="text-xs font-semibold text-carbon-gray-100">
                              {task.patientName}
                            </span>
                            <span className="text-xs text-carbon-gray-50">
                              · {task.description.substring(0, 50)}…
                            </span>
                          </div>
                          <p className="text-xs text-[#0e6027] font-medium">
                            {task.output?.description}
                          </p>
                          <p className="text-2xs font-mono text-[#0e6027] mt-0.5">
                            {task.output?.type}/{task.output?.valueReference} · {task.output?.date}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-2xs text-[#0e6027] font-semibold">Loop Closed</p>
                          <p className="text-2xs font-mono text-[#0e6027]">{task.output?.date}</p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Inline Filter Bar ────────────────────────────────────────────────────────
function ReferralFilterBar({
  filters,
  onFiltersChange,
}: {
  filters: ReferralFilters;
  onFiltersChange: (f: ReferralFilters) => void;
}) {
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
  const statuses = [
    'All',
    'Pending',
    'Assigned',
    'In Progress',
    'Awaiting EMR',
    'Completed',
    'Cancelled',
  ];
  const urgencies = ['All', 'Routine', 'Urgent', 'STAT'];

  return (
    <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Search patient, provider, ICD…"
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
        className="border border-carbon-gray-30 text-sm px-3 py-1.5 w-56 focus:outline-none focus:border-carbon-blue"
      />
      <select
        value={filters.status}
        onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
      >
        {statuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        value={filters.specialty}
        onChange={(e) => onFiltersChange({ ...filters, specialty: e.target.value })}
        className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
      >
        {specialties.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        value={filters.urgency}
        onChange={(e) => onFiltersChange({ ...filters, urgency: e.target.value })}
        className="border border-carbon-gray-30 text-sm px-3 py-1.5 focus:outline-none focus:border-carbon-blue bg-white"
      >
        {urgencies.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      {(filters.search ||
        filters.status !== 'All' ||
        filters.specialty !== 'All' ||
        filters.urgency !== 'All') && (
        <button
          onClick={() =>
            onFiltersChange({
              search: '',
              status: 'All',
              specialty: 'All',
              urgency: 'All',
              provider: 'All',
            })
          }
          className="text-xs text-carbon-blue hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
