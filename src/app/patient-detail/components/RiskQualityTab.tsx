'use client';
import React, { useState } from 'react';
import { mockHCCSuspects, mockCareGaps, mockAlerts } from '@/lib/mockData';
import type { HCCSuspect, UtilizationAlert } from '@/lib/mockData';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/AppIcon';
import FreshnessIndicator from '@/components/ui/FreshnessIndicator';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import HCCConfirmationJourney from './HCCConfirmationJourney';
import CareGapClosureJourney from './CareGapClosureJourney';
import UtilizationEscalationJourney from './UtilizationEscalationJourney';

function HCCStatusBadge({ status }: { status: HCCSuspect['status'] }) {
  const map: Record<
    HCCSuspect['status'],
    'warning' | 'info' | 'purple' | 'success' | 'danger' | 'neutral'
  > = {
    Surfaced: 'neutral',
    'Evidence Reviewed': 'info',
    'Clinician Review': 'warning',
    Documented: 'purple',
    Submitted: 'info',
    Confirmed: 'success',
    Rejected: 'danger',
  };
  return <StatusBadge label={status} variant={map[status]} size="sm" />;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? 'bg-[#24a148]' : pct >= 70 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-carbon-gray-20">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums text-carbon-gray-70">{pct}%</span>
    </div>
  );
}

function AlertTierBadge({ tier }: { tier: UtilizationAlert['tier'] }) {
  const map = { Critical: 'danger', Important: 'warning', Informational: 'info' } as const;
  return <StatusBadge label={tier} variant={map[tier]} size="sm" />;
}

// ─── Workflow Status Chip ─────────────────────────────────────────────────────
function WorkflowChip({ suspectId }: { suspectId: string }) {
  const { getWorkflowStatus, getWorkflowProgress } = useWorkflowMachine();
  const status = getWorkflowStatus('hcc-confirmation', suspectId);
  const { current, total } = getWorkflowProgress('hcc-confirmation', suspectId);

  if (status === 'idle') return null;

  const cfg = {
    'in-progress': {
      cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      label: `Step ${current}/${total}`,
      icon: 'PlayIcon',
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Review',
      icon: 'ClockIcon',
    },
    completed: {
      cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
      label: 'Confirmed',
      icon: 'CheckCircleIcon',
    },
    rejected: {
      cls: 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]',
      label: 'Rejected',
      icon: 'XCircleIcon',
    },
    idle: { cls: '', label: '', icon: '' },
  } as const;

  const c = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold border ${c.cls}`}
    >
      <Icon name={c.icon as any} size={10} />
      {c.label}
    </span>
  );
}

// ─── Care Gap Workflow Chip ───────────────────────────────────────────────────
function GapWorkflowChip({ gapId }: { gapId: string }) {
  const { getWorkflowStatus, getWorkflowProgress } = useWorkflowMachine();
  const status = getWorkflowStatus('care-gap-closure', gapId);
  const { current, total } = getWorkflowProgress('care-gap-closure', gapId);

  if (status === 'idle') return null;

  const cfg = {
    'in-progress': {
      cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      label: `Step ${current}/${total}`,
      icon: 'PlayIcon',
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Review',
      icon: 'ClockIcon',
    },
    completed: {
      cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
      label: 'Closed',
      icon: 'CheckCircleIcon',
    },
    rejected: {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Deferred',
      icon: 'ClockIcon',
    },
    idle: { cls: '', label: '', icon: '' },
  } as const;

  const c = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold border ${c.cls}`}
    >
      <Icon name={c.icon as any} size={10} />
      {c.label}
    </span>
  );
}

// ─── Utilization Workflow Chip ────────────────────────────────────────────────
function AlertWorkflowChip({ alertId }: { alertId: string }) {
  const { getWorkflowStatus, getWorkflowProgress } = useWorkflowMachine();
  const status = getWorkflowStatus('utilization-escalation', alertId);
  const { current, total } = getWorkflowProgress('utilization-escalation', alertId);

  if (status === 'idle') return null;

  const cfg = {
    'in-progress': {
      cls: 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]/40',
      label: `Step ${current}/${total}`,
      icon: 'PlayIcon',
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Closure',
      icon: 'ClockIcon',
    },
    completed: {
      cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
      label: 'Closed',
      icon: 'CheckCircleIcon',
    },
    rejected: {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Dismissed',
      icon: 'ClockIcon',
    },
    idle: { cls: '', label: '', icon: '' },
  } as const;

  const c = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold border ${c.cls}`}
    >
      <Icon name={c.icon as any} size={10} />
      {c.label}
    </span>
  );
}

export default function RiskQualityTab() {
  const suspects = mockHCCSuspects.filter((h) => h.patientId === 'patient-001');
  const gaps = mockCareGaps.filter((g) => g.patientId === 'patient-001');
  const alerts = mockAlerts.filter((a) => a.patientId === 'patient-001');
  const [expandedHcc, setExpandedHcc] = useState<string | null>('hcc-001');
  const [journeyOpen, setJourneyOpen] = useState<string | null>(null);
  const [gapJourneyOpen, setGapJourneyOpen] = useState<string | null>(null);
  const [alertJourneyOpen, setAlertJourneyOpen] = useState<string | null>(null);
  const { user } = useAppContext();

  const totalRafDelta = suspects.reduce((a, s) => a + s.estimatedRafDelta, 0);
  const totalRevDelta = suspects.reduce((a, s) => a + s.estimatedRevenueDelta, 0);

  const activeSuspect = suspects.find((s) => s.id === journeyOpen);

  return (
    <div className="space-y-6">
      {/* HCC Suspects */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
              <Icon name="ExclamationTriangleIcon" size={16} className="text-[#b45309]" />
              HCC Suspects & RAF Scoring
            </h3>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              {suspects.length} suspects · Est. RAF delta{' '}
              <span className="font-mono font-semibold text-[#b45309]">
                +{totalRafDelta.toFixed(3)}
              </span>{' '}
              · Revenue at risk{' '}
              <span className="font-mono font-semibold text-[#da1e28]">
                ${totalRevDelta.toLocaleString()}
              </span>
            </p>
          </div>
          <button className="carbon-btn-secondary text-xs py-1.5">
            <Icon name="ArrowDownTrayIcon" size={14} />
            Export HCC Report
          </button>
        </div>

        {/* Active journey panel */}
        {journeyOpen && activeSuspect && (
          <div className="mb-4">
            <HCCConfirmationJourney suspect={activeSuspect} onClose={() => setJourneyOpen(null)} />
          </div>
        )}

        <div className="space-y-2">
          {suspects.map((suspect) => (
            <div
              key={suspect.id}
              className={`border bg-carbon-gray-10 transition-all ${journeyOpen === suspect.id ? 'border-[#0f62fe] ring-1 ring-[#0f62fe]/20' : 'border-carbon-gray-20'}`}
            >
              <button
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white transition-colors text-left"
                onClick={() => setExpandedHcc(expandedHcc === suspect.id ? null : suspect.id)}
              >
                <Icon
                  name={expandedHcc === suspect.id ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                  size={14}
                  className="text-carbon-gray-50 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-carbon-gray-70">
                      {suspect.hccCode}
                    </span>
                    <span className="text-sm font-medium text-carbon-gray-100">
                      {suspect.hccDescription}
                    </span>
                    <HCCStatusBadge status={suspect.status} />
                    <WorkflowChip suspectId={suspect.id} />
                    <FreshnessIndicator source={suspect.dataSource} date={suspect.freshnessDate} />
                  </div>
                  <p className="text-xs text-carbon-gray-50 mt-0.5 font-mono">
                    {suspect.icdCode} — {suspect.icdDescription}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-2xs text-carbon-gray-50">RAF Delta</p>
                    <p className="font-mono text-sm font-semibold text-[#b45309]">
                      +{suspect.estimatedRafDelta.toFixed(3)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-carbon-gray-50">Revenue</p>
                    <p className="font-mono text-sm font-semibold text-[#da1e28]">
                      ${suspect.estimatedRevenueDelta.toLocaleString()}
                    </p>
                  </div>
                  <ConfidenceBar score={suspect.suspectConfidence} />
                </div>
              </button>

              {expandedHcc === suspect.id && (
                <div className="bg-white border-t border-carbon-gray-20 px-4 py-4 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="carbon-label mb-2">Clinical Evidence</p>
                      <ul className="space-y-1">
                        {suspect.evidenceSources.map((e, i) => (
                          <li
                            key={`ev-${suspect.id}-${i}`}
                            className="flex items-start gap-2 text-xs text-carbon-gray-70"
                          >
                            <Icon
                              name="DocumentMagnifyingGlassIcon"
                              size={12}
                              className="text-carbon-blue mt-0.5 flex-shrink-0"
                            />
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="carbon-label mb-2">Workflow Context</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-carbon-gray-50">Assigned Physician</span>
                          <span className="font-medium text-carbon-gray-100">
                            {suspect.assignedPhysician}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-carbon-gray-50">Last Encounter</span>
                          <span className="font-mono text-carbon-gray-70">
                            {suspect.lastEncounterDate}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-carbon-gray-50">Submission Deadline</span>
                          <span className="font-mono font-semibold text-[#da1e28]">
                            {suspect.submissionDeadline}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="carbon-label mb-2">Confirmation Journey</p>
                      <div className="flex flex-col gap-2">
                        <button
                          className={`flex items-center gap-2 text-xs py-2 px-3 font-semibold transition-colors w-full justify-center
                            ${
                              journeyOpen === suspect.id
                                ? 'bg-[#0353e9] text-white'
                                : 'bg-[#0f62fe] text-white hover:bg-[#0353e9]'
                            }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setJourneyOpen(journeyOpen === suspect.id ? null : suspect.id);
                          }}
                        >
                          <Icon
                            name={journeyOpen === suspect.id ? 'ChevronUpIcon' : 'ArrowPathIcon'}
                            size={14}
                          />
                          {journeyOpen === suspect.id
                            ? 'Close Journey'
                            : 'Open Confirmation Journey'}
                        </button>
                        <button
                          className="carbon-btn-ghost text-xs py-1.5 w-full justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Icon name="PencilSquareIcon" size={14} />
                          Add Clinical Note
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Care Gaps */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="ClipboardDocumentCheckIcon" size={16} className="text-[#0043ce]" />
            Care Gaps — HEDIS / STARS / MIPS
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-carbon-gray-50">
              {gaps.filter((g) => g.status === 'Closed').length}/{gaps.length} closed
            </span>
            <button className="carbon-btn-secondary text-xs py-1.5">
              <Icon name="PlusIcon" size={14} />
              Add Manual Closure
            </button>
          </div>
        </div>

        {/* Active gap journey panel */}
        {gapJourneyOpen &&
          (() => {
            const activeGap = gaps.find((g) => g.id === gapJourneyOpen);
            return activeGap ? (
              <div className="mb-4">
                <CareGapClosureJourney gap={activeGap} onClose={() => setGapJourneyOpen(null)} />
              </div>
            ) : null;
          })()}

        <div className="border border-carbon-gray-20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {[
                  'Measure',
                  'Program',
                  'Status',
                  'Days Open',
                  'Due Date',
                  'Assigned To',
                  'Action',
                ].map((h) => (
                  <th
                    key={`gh-${h}`}
                    className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {gaps.map((gap) => (
                <React.Fragment key={gap.id}>
                  <tr
                    className={`hover:bg-carbon-gray-10 group ${gapJourneyOpen === gap.id ? 'bg-[#f0f4ff]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-carbon-gray-100">{gap.measureName}</p>
                      <p className="text-2xs text-carbon-gray-50 font-mono">{gap.measureId}</p>
                      <GapWorkflowChip gapId={gap.id} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 ${
                          gap.program === 'HEDIS'
                            ? 'bg-[#d0e2ff] text-[#0043ce]'
                            : gap.program === 'STARS'
                              ? 'bg-[#fdf6dd] text-[#b45309]'
                              : 'bg-[#f6f2ff] text-[#6929c4]'
                        }`}
                      >
                        {gap.program}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={gap.status}
                        variant={
                          gap.status === 'Closed'
                            ? 'success'
                            : gap.status === 'In Progress'
                              ? 'info'
                              : gap.status === 'Expired'
                                ? 'danger'
                                : 'warning'
                        }
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {gap.status !== 'Closed' ? (
                        <span
                          className={`font-mono text-xs tabular-nums ${gap.daysOpen > 120 ? 'text-[#da1e28] font-semibold' : gap.daysOpen > 60 ? 'text-[#b45309]' : 'text-carbon-gray-70'}`}
                        >
                          {gap.daysOpen}d
                        </span>
                      ) : (
                        <span className="text-2xs text-[#24a148]">Closed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-carbon-gray-70 whitespace-nowrap">
                      {gap.dueDate}
                    </td>
                    <td className="px-4 py-3 text-xs text-carbon-gray-70">{gap.assignedTo}</td>
                    <td className="px-4 py-3">
                      {gap.status !== 'Closed' && (
                        <button
                          onClick={() =>
                            setGapJourneyOpen(gapJourneyOpen === gap.id ? null : gap.id)
                          }
                          className={`flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1.5 transition-colors whitespace-nowrap
                            ${
                              gapJourneyOpen === gap.id
                                ? 'bg-[#0043ce] text-white'
                                : 'bg-[#d0e2ff] text-[#0043ce] hover:bg-[#0043ce] hover:text-white'
                            }`}
                        >
                          <Icon
                            name={
                              gapJourneyOpen === gap.id
                                ? 'ChevronUpIcon'
                                : 'ClipboardDocumentCheckIcon'
                            }
                            size={11}
                          />
                          {gapJourneyOpen === gap.id ? 'Close Journey' : 'Close Gap'}
                        </button>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Utilization Alerts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="BellAlertIcon" size={16} className="text-[#da1e28]" />
            Utilization Alerts
          </h3>
          <span className="text-xs text-carbon-gray-50">
            {alerts.filter((a) => a.status === 'Active').length} active
          </span>
        </div>

        {/* Active escalation journey panel */}
        {alertJourneyOpen &&
          (() => {
            const activeAlert = alerts.find((a) => a.id === alertJourneyOpen);
            return activeAlert ? (
              <div className="mb-4">
                <UtilizationEscalationJourney
                  alert={activeAlert}
                  onClose={() => setAlertJourneyOpen(null)}
                />
              </div>
            ) : null;
          })()}

        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border ${alertJourneyOpen === alert.id ? 'border-[#da1e28]/40 ring-1 ring-[#da1e28]/10' : alert.tier === 'Critical' ? 'border-l-4 border-l-[#da1e28] border-carbon-gray-20' : alert.tier === 'Important' ? 'border-l-4 border-l-[#f1c21b] border-carbon-gray-20' : 'border-carbon-gray-20'} ${alert.tier === 'Critical' ? 'bg-[#fff8f8]' : alert.tier === 'Important' ? 'bg-[#fdf6dd]/40' : 'bg-white'}`}
            >
              <div className="flex items-start gap-4 p-4">
                <AlertTierBadge tier={alert.tier} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-xs font-semibold text-carbon-gray-100">{alert.type}</p>
                    <FreshnessIndicator source={alert.source} date={alert.freshnessDate} />
                    <AlertWorkflowChip alertId={alert.id} />
                  </div>
                  <p className="text-xs text-carbon-gray-70">{alert.description}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-2xs text-carbon-gray-50">
                    <span>
                      Risk Score:{' '}
                      <span className="font-mono font-semibold text-carbon-gray-70">
                        {Math.round(alert.riskScore * 100)}%
                      </span>
                    </span>
                    <span>
                      Est. Cost:{' '}
                      <span className="font-mono font-semibold text-[#da1e28]">
                        ${alert.estimatedCost.toLocaleString()}
                      </span>
                    </span>
                    <span className="font-mono">{alert.createdDate}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge
                    label={alert.status}
                    variant={
                      alert.status === 'Active'
                        ? 'danger'
                        : alert.status === 'Escalated'
                          ? 'warning'
                          : alert.status === 'Resolved'
                            ? 'success'
                            : 'info'
                    }
                    size="sm"
                  />
                  <button
                    onClick={() =>
                      setAlertJourneyOpen(alertJourneyOpen === alert.id ? null : alert.id)
                    }
                    className={`flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1.5 transition-colors whitespace-nowrap
                      ${
                        alertJourneyOpen === alert.id
                          ? 'bg-[#da1e28] text-white'
                          : 'bg-[#fff1f1] text-[#da1e28] border border-[#da1e28]/30 hover:bg-[#da1e28] hover:text-white'
                      }`}
                  >
                    <Icon
                      name={alertJourneyOpen === alert.id ? 'ChevronUpIcon' : 'BellAlertIcon'}
                      size={11}
                    />
                    {alertJourneyOpen === alert.id ? 'Close Journey' : 'Escalate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
