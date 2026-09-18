'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { workflowDefinitions } from '@/lib/actionRegistry';

const tasks = [
  {
    id: 'task-001',
    type: 'HCC Review',
    description: 'Clinician review required: HCC 85 CHF suspect — $7,200 revenue impact',
    priority: 'Critical',
    assignedTo: 'Dr. James Whitfield',
    dueDate: '2026-04-20',
    status: 'Pending',
    createdBy: 'System',
    createdAt: '2026-04-13T08:00:00Z',
  },
  {
    id: 'task-002',
    type: 'Care Gap',
    description: 'Schedule retinal exam for diabetic eye exam measure closure (HEDIS EED)',
    priority: 'High',
    assignedTo: 'Sarah Johnson',
    dueDate: '2026-05-15',
    status: 'In Progress',
    createdBy: 'Sarah Johnson',
    createdAt: '2026-04-10T09:30:00Z',
  },
  {
    id: 'task-003',
    type: 'Utilization',
    description:
      'Initiate home health authorization to reduce readmission risk post-CHF exacerbation',
    priority: 'Critical',
    assignedTo: 'Sarah Johnson',
    dueDate: '2026-04-17',
    status: 'Pending',
    createdBy: 'System (LPR Alert)',
    createdAt: '2026-04-13T10:15:00Z',
  },
  {
    id: 'task-004',
    type: 'Medication',
    description: 'Pharmacist review: Warfarin + Ibuprofen DDI — assess risk and counsel patient',
    priority: 'High',
    assignedTo: 'Pharmacy Team',
    dueDate: '2026-04-22',
    status: 'Pending',
    createdBy: 'CDS Hooks',
    createdAt: '2026-04-14T11:00:00Z',
  },
  {
    id: 'task-005',
    type: 'AWV',
    description: 'Annual Wellness Visit scheduled for 04/28 — confirm patient transportation',
    priority: 'Medium',
    assignedTo: 'Sarah Johnson',
    dueDate: '2026-04-28',
    status: 'In Progress',
    createdBy: 'Sarah Johnson',
    createdAt: '2026-03-01T08:00:00Z',
  },
];

const staticAuditLog = [
  {
    id: 'audit-001',
    action: 'HCC Suspect Surfaced',
    detail: 'HCC 85 CHF suspect auto-surfaced from EMR echocardiogram data',
    user: 'System',
    role: 'Automated',
    timestamp: '2026-04-13T08:00:00Z',
  },
  {
    id: 'audit-002',
    action: 'Utilization Alert Created',
    detail: 'LPR predicted ER risk score 84% — critical alert generated',
    user: 'System (LPR)',
    role: 'Automated',
    timestamp: '2026-04-13T08:05:00Z',
  },
  {
    id: 'audit-003',
    action: 'Alert Escalated',
    detail: 'Predicted ER Risk alert escalated to care manager queue',
    user: 'Sarah Johnson',
    role: 'Care Manager',
    timestamp: '2026-04-13T09:15:00Z',
  },
  {
    id: 'audit-004',
    action: 'Task Created',
    detail: 'Home health authorization task created for CHF readmission prevention',
    user: 'Sarah Johnson',
    role: 'Care Manager',
    timestamp: '2026-04-13T09:20:00Z',
  },
  {
    id: 'audit-005',
    action: 'HCC Suspect Reviewed',
    detail: 'HCC 18 evidence reviewed — sent to Dr. Whitfield for confirmation',
    user: 'Sarah Johnson',
    role: 'Care Manager',
    timestamp: '2026-04-14T10:30:00Z',
  },
  {
    id: 'audit-006',
    action: 'CDS Hook Triggered',
    detail: 'High-cost imaging alert: Cardiac MRI order detected — alternative suggested',
    user: 'System (CDS Hooks)',
    role: 'Automated',
    timestamp: '2026-04-14T11:00:00Z',
  },
];

// ─── HCC Workflow Audit Section ───────────────────────────────────────────────
const HCC_SUSPECT_IDS = ['hcc-001', 'hcc-002', 'hcc-003'];
const HCC_SUSPECT_LABELS: Record<string, string> = {
  'hcc-001': 'HCC 85 — CHF',
  'hcc-002': 'HCC 18 — Diabetes',
  'hcc-003': 'HCC 111 — COPD',
};

// ─── Care Gap Workflow Audit Section ─────────────────────────────────────────
const CARE_GAP_IDS = ['gap-001', 'gap-002', 'gap-003', 'gap-004', 'gap-005', 'gap-006'];
const CARE_GAP_LABELS: Record<string, string> = {
  'gap-001': 'HbA1c Poor Control — HEDIS',
  'gap-002': 'Annual Wellness Visit — STARS',
  'gap-003': 'Eye Exam for Diabetics — HEDIS',
  'gap-004': 'Colorectal Cancer Screening — MIPS',
  'gap-005': 'Medication Adherence Diabetes — STARS',
  'gap-006': 'Controlling Blood Pressure — HEDIS',
};

function CareGapWorkflowAuditSection() {
  const { getWorkflow } = useWorkflowMachine();
  const wfDef = workflowDefinitions['care-gap-closure'];

  const activeWorkflows = CARE_GAP_IDS.map((id) => ({
    id,
    wf: getWorkflow('care-gap-closure', id),
  })).filter(({ wf }) => wf !== undefined);

  if (activeWorkflows.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={14} />
        No active care gap closure workflows. Open the Risk &amp; Quality tab and click &quot;Close
        Gap&quot; to initiate a journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map(({ id, wf }) => {
        if (!wf) return null;
        const statusCfg = {
          'in-progress': {
            cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
            label: `In Progress — Step ${wf.currentStep}/${wf.totalSteps}`,
          },
          'awaiting-review': {
            cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
            label: 'Awaiting Closure Documentation',
          },
          completed: { cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]', label: 'Gap Closed' },
          rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Deferred' },
          idle: { cls: '', label: '' },
        } as const;
        const sc = statusCfg[wf.status];

        return (
          <div key={id} className="border border-carbon-gray-20 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-3 bg-carbon-gray-10 border-b border-carbon-gray-20">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center">
                  <Icon name="ClipboardDocumentCheckIcon" size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">
                    {wfDef.label} — {CARE_GAP_LABELS[id] ?? id}
                  </p>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    Started{' '}
                    {new Date(wf.startedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    by {wf.startedBy}
                  </p>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>
                {sc.label}
              </span>
            </div>

            {/* Step progress bar */}
            <div className="px-4 py-3 border-b border-carbon-gray-20">
              <div className="flex items-center gap-1">
                {wfDef.steps.map((step) => {
                  const isDone = wf.status === 'completed' || step.step < wf.currentStep;
                  const isActive =
                    step.step === wf.currentStep &&
                    wf.status !== 'completed' &&
                    wf.status !== 'rejected';
                  const isRejected = wf.status === 'rejected' && step.step === wf.currentStep;
                  return (
                    <React.Fragment key={step.step}>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center text-2xs font-bold flex-shrink-0
                          ${
                            isDone
                              ? 'bg-[#24a148] text-white'
                              : isActive
                                ? 'bg-[#0043ce] text-white'
                                : isRejected
                                  ? 'bg-[#b45309] text-white'
                                  : 'bg-carbon-gray-20 text-carbon-gray-50'
                          }`}
                        >
                          {isDone ? (
                            <Icon name="CheckIcon" size={9} />
                          ) : isRejected ? (
                            <Icon name="ClockIcon" size={9} />
                          ) : (
                            step.step
                          )}
                        </div>
                        <p
                          className={`text-2xs mt-1 text-center leading-tight hidden sm:block
                          ${isActive ? 'text-[#0043ce] font-semibold' : isDone ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {step.step < wfDef.steps.length && (
                        <div
                          className={`h-0.5 flex-1 mb-3 ${isDone ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step history */}
            {wf.stepHistory.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {wf.stepHistory.map((record, i) => (
                    <tr key={`gap-step-${i}`} className="hover:bg-carbon-gray-10">
                      <td className="px-4 py-2.5">
                        <div
                          className={`w-5 h-5 flex items-center justify-center ${wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? 'bg-[#b45309]' : 'bg-[#24a148]'}`}
                        >
                          {wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? (
                            <Icon name="ClockIcon" size={9} className="text-white" />
                          ) : (
                            <Icon name="CheckIcon" size={9} className="text-white" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                        {record.label}
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                        {record.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                        {new Date(record.completedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs text-carbon-gray-50">No steps completed yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HCCWorkflowAuditSection() {
  const { getWorkflow } = useWorkflowMachine();
  const wfDef = workflowDefinitions['hcc-confirmation'];

  const activeWorkflows = HCC_SUSPECT_IDS.map((id) => ({
    id,
    wf: getWorkflow('hcc-confirmation', id),
  })).filter(({ wf }) => wf !== undefined);

  if (activeWorkflows.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={14} />
        No active HCC confirmation workflows. Open the Risk &amp; Quality tab to initiate a journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map(({ id, wf }) => {
        if (!wf) return null;
        const statusCfg = {
          'in-progress': {
            cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
            label: `In Progress — Step ${wf.currentStep}/${wf.totalSteps}`,
          },
          'awaiting-review': {
            cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
            label: 'Awaiting Physician Review',
          },
          completed: {
            cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
            label: 'Completed & Submitted',
          },
          rejected: { cls: 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]', label: 'Rejected' },
          idle: { cls: '', label: '' },
        } as const;
        const sc = statusCfg[wf.status];

        return (
          <div key={id} className="border border-carbon-gray-20 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-3 bg-carbon-gray-10 border-b border-carbon-gray-20">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#0f62fe] flex items-center justify-center">
                  <Icon name="ArrowPathIcon" size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">
                    {wfDef.label} — {HCC_SUSPECT_LABELS[id] ?? id}
                  </p>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    Started{' '}
                    {new Date(wf.startedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    by {wf.startedBy}
                  </p>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>
                {sc.label}
              </span>
            </div>

            {/* Step progress bar */}
            <div className="px-4 py-3 border-b border-carbon-gray-20">
              <div className="flex items-center gap-1">
                {wfDef.steps.map((step) => {
                  const isDone = wf.status === 'completed' || step.step < wf.currentStep;
                  const isActive =
                    step.step === wf.currentStep &&
                    wf.status !== 'completed' &&
                    wf.status !== 'rejected';
                  const isRejected = wf.status === 'rejected' && step.step === wf.currentStep;
                  return (
                    <React.Fragment key={step.step}>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center text-2xs font-bold flex-shrink-0
                          ${
                            isDone
                              ? 'bg-[#24a148] text-white'
                              : isActive
                                ? 'bg-[#0f62fe] text-white'
                                : isRejected
                                  ? 'bg-[#da1e28] text-white'
                                  : 'bg-carbon-gray-20 text-carbon-gray-50'
                          }`}
                        >
                          {isDone ? (
                            <Icon name="CheckIcon" size={9} />
                          ) : isRejected ? (
                            <Icon name="XMarkIcon" size={9} />
                          ) : (
                            step.step
                          )}
                        </div>
                        <p
                          className={`text-2xs mt-1 text-center leading-tight hidden sm:block
                          ${isActive ? 'text-[#0f62fe] font-semibold' : isDone ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {step.step < wfDef.steps.length && (
                        <div
                          className={`h-0.5 flex-1 mb-3 ${isDone ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step history */}
            {wf.stepHistory.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {wf.stepHistory.map((record, i) => (
                    <tr key={`step-${i}`} className="hover:bg-carbon-gray-10">
                      <td className="px-4 py-2.5">
                        <div className="w-5 h-5 bg-[#24a148] flex items-center justify-center">
                          <Icon name="CheckIcon" size={9} className="text-white" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                        {record.label}
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                        {record.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                        {new Date(record.completedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs text-carbon-gray-50">No steps completed yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Utilization Alert Workflow Audit Section ─────────────────────────────────
const ALERT_IDS = ['alert-001', 'alert-002', 'alert-003', 'alert-004'];
const ALERT_LABELS: Record<string, string> = {
  'alert-001': 'Predicted ER Risk — 84%',
  'alert-002': 'Poly-Pharmacy — DDI Risk',
  'alert-003': 'High-Cost Imaging — Cardiac MRI',
  'alert-004': 'Avoidable Admission — CHF',
};

function UtilizationWorkflowAuditSection() {
  const { getWorkflow } = useWorkflowMachine();
  const wfDef = workflowDefinitions['utilization-escalation'];

  const activeWorkflows = ALERT_IDS.map((id) => ({
    id,
    wf: getWorkflow('utilization-escalation', id),
  })).filter(({ wf }) => wf !== undefined);

  if (activeWorkflows.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={14} />
        No active utilization escalation workflows. Open the Risk &amp; Quality tab and click
        &quot;Escalate&quot; on an alert to initiate a journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map(({ id, wf }) => {
        if (!wf) return null;
        const statusCfg = {
          'in-progress': {
            cls: 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]/40',
            label: `In Progress — Step ${wf.currentStep}/${wf.totalSteps}`,
          },
          'awaiting-review': {
            cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
            label: 'Awaiting Closure Documentation',
          },
          completed: {
            cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
            label: 'Escalation Closed',
          },
          rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Dismissed' },
          idle: { cls: '', label: '' },
        } as const;
        const sc = statusCfg[wf.status];

        return (
          <div key={id} className="border border-carbon-gray-20 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#fff8f8] border-b border-carbon-gray-20">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#da1e28] flex items-center justify-center">
                  <Icon name="BellAlertIcon" size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">
                    {wfDef.label} — {ALERT_LABELS[id] ?? id}
                  </p>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    Started{' '}
                    {new Date(wf.startedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    by {wf.startedBy}
                  </p>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>
                {sc.label}
              </span>
            </div>

            {/* Step progress bar */}
            <div className="px-4 py-3 border-b border-carbon-gray-20">
              <div className="flex items-center gap-1">
                {wfDef.steps.map((step) => {
                  const isDone = wf.status === 'completed' || step.step < wf.currentStep;
                  const isActive =
                    step.step === wf.currentStep &&
                    wf.status !== 'completed' &&
                    wf.status !== 'rejected';
                  const isRejected = wf.status === 'rejected' && step.step === wf.currentStep;
                  return (
                    <React.Fragment key={step.step}>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center text-2xs font-bold flex-shrink-0
                          ${
                            isDone
                              ? 'bg-[#24a148] text-white'
                              : isActive
                                ? 'bg-[#da1e28] text-white'
                                : isRejected
                                  ? 'bg-[#b45309] text-white'
                                  : 'bg-carbon-gray-20 text-carbon-gray-50'
                          }`}
                        >
                          {isDone ? (
                            <Icon name="CheckIcon" size={9} />
                          ) : isRejected ? (
                            <Icon name="ClockIcon" size={9} />
                          ) : (
                            step.step
                          )}
                        </div>
                        <p
                          className={`text-2xs mt-1 text-center leading-tight hidden sm:block
                          ${isActive ? 'text-[#da1e28] font-semibold' : isDone ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {step.step < wfDef.steps.length && (
                        <div
                          className={`h-0.5 flex-1 mb-3 ${isDone ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step history */}
            {wf.stepHistory.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                      <th
                        key={`uh-${h}`}
                        className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {wf.stepHistory.map((record, i) => (
                    <tr key={`util-step-${i}`} className="hover:bg-carbon-gray-10">
                      <td className="px-4 py-2.5">
                        <div
                          className={`w-5 h-5 flex items-center justify-center ${wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? 'bg-[#b45309]' : 'bg-[#24a148]'}`}
                        >
                          {wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? (
                            <Icon name="ClockIcon" size={9} className="text-white" />
                          ) : (
                            <Icon name="CheckIcon" size={9} className="text-white" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                        {record.label}
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                        {record.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                        {new Date(record.completedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs text-carbon-gray-50">No steps completed yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Attribution Dispute Workflow Audit Section ───────────────────────────────
const DISPUTE_IDS = ['attr-disp-001', 'attr-disp-002'];
const DISPUTE_LABELS: Record<string, string> = {
  'attr-disp-001': 'BlueCross BlueShield ACO — Wrong PCP',
  'attr-disp-002': 'Aetna Medicare Advantage — Disenrolled',
};

function AttributionDisputeAuditSection() {
  const { getWorkflow } = useWorkflowMachine();
  const wfDef = workflowDefinitions['attribution-dispute'];

  const activeWorkflows = DISPUTE_IDS.map((id) => ({
    id,
    wf: getWorkflow('attribution-dispute', id),
  })).filter(({ wf }) => wf !== undefined);

  if (activeWorkflows.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={14} />
        No active attribution dispute workflows. Open the Attribution tab and click &quot;Dispute
        Attribution&quot; to initiate a journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map(({ id, wf }) => {
        if (!wf) return null;
        const statusCfg = {
          'in-progress': {
            cls: 'bg-[#e8daff] text-[#6929c4] border-[#d4bbff]',
            label: `In Progress — Step ${wf.currentStep}/${wf.totalSteps}`,
          },
          'awaiting-review': {
            cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
            label: 'Awaiting Payer Submission',
          },
          completed: {
            cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
            label: 'Submitted to Payer',
          },
          rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Withdrawn' },
          idle: { cls: '', label: '' },
        } as const;
        const sc = statusCfg[wf.status];

        return (
          <div key={id} className="border border-carbon-gray-20 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#f6f2ff] border-b border-carbon-gray-20">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#6929c4] flex items-center justify-center">
                  <Icon name="ScaleIcon" size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">
                    {wfDef.label} — {DISPUTE_LABELS[id] ?? id}
                  </p>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    Started{' '}
                    {new Date(wf.startedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    by {wf.startedBy}
                  </p>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>
                {sc.label}
              </span>
            </div>

            {/* Step progress bar */}
            <div className="px-4 py-3 border-b border-carbon-gray-20">
              <div className="flex items-center gap-1">
                {wfDef.steps.map((step) => {
                  const isDone = wf.status === 'completed' || step.step < wf.currentStep;
                  const isActive =
                    step.step === wf.currentStep &&
                    wf.status !== 'completed' &&
                    wf.status !== 'rejected';
                  const isRejected = wf.status === 'rejected' && step.step === wf.currentStep;
                  return (
                    <React.Fragment key={step.step}>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center text-2xs font-bold flex-shrink-0
                          ${
                            isDone
                              ? 'bg-[#24a148] text-white'
                              : isActive
                                ? 'bg-[#6929c4] text-white'
                                : isRejected
                                  ? 'bg-[#b45309] text-white'
                                  : 'bg-carbon-gray-20 text-carbon-gray-50'
                          }`}
                        >
                          {isDone ? (
                            <Icon name="CheckIcon" size={9} />
                          ) : isRejected ? (
                            <Icon name="XMarkIcon" size={9} />
                          ) : (
                            step.step
                          )}
                        </div>
                        <p
                          className={`text-2xs mt-1 text-center leading-tight hidden sm:block
                          ${isActive ? 'text-[#6929c4] font-semibold' : isDone ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {step.step < wfDef.steps.length && (
                        <div
                          className={`h-0.5 flex-1 mb-3 ${isDone ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step history */}
            {wf.stepHistory.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                      <th
                        key={`dh-${h}`}
                        className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {wf.stepHistory.map((record, i) => (
                    <tr key={`disp-step-${i}`} className="hover:bg-carbon-gray-10">
                      <td className="px-4 py-2.5">
                        <div
                          className={`w-5 h-5 flex items-center justify-center ${wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? 'bg-[#b45309]' : 'bg-[#24a148]'}`}
                        >
                          {wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? (
                            <Icon name="XMarkIcon" size={9} className="text-white" />
                          ) : (
                            <Icon name="CheckIcon" size={9} className="text-white" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                        {record.label}
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                        {record.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                        {new Date(record.completedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs text-carbon-gray-50">No steps completed yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Referral Workflow Audit Section ───────────────────────────────────────────
const REFERRAL_IDS = [
  'ref-prov-001',
  'ref-prov-002',
  'ref-prov-003',
  'ref-prov-004',
  'ref-prov-005',
  'ref-prov-006',
  'ref-prov-007',
  'ref-prov-008',
  'ref-prov-009',
  'ref-prov-010',
];
const REFERRAL_LABELS: Record<string, string> = {
  'ref-prov-001': 'Dr. Amara Osei — Cardiology',
  'ref-prov-002': 'Dr. Sofia Reinholt — Endocrinology',
  'ref-prov-003': 'Dr. Marcus Weatherington — Pulmonology',
  'ref-prov-004': 'Dr. Priya Venkataraman — Nephrology',
  'ref-prov-005': 'Dr. Jerome Blackwood — Orthopedics',
  'ref-prov-006': 'Dr. Fatima Al-Rashidi — Ophthalmology',
  'ref-prov-007': 'Dr. Thomas Kaczmarek — Gastroenterology',
  'ref-prov-008': 'Dr. Nkechi Eze-Williams — Endocrinology',
  'ref-prov-009': 'Dr. Carlos Mendez-Ruiz — Cardiology',
  'ref-prov-010': 'Dr. Linda Kowalczyk — Geriatrics',
};

function ReferralWorkflowAuditSection() {
  const { getWorkflow } = useWorkflowMachine();
  const wfDef = workflowDefinitions['provider-referral'];

  const activeWorkflows = REFERRAL_IDS.map((id) => ({
    id,
    wf: getWorkflow('provider-referral', id),
  })).filter(({ wf }) => wf !== undefined);

  if (activeWorkflows.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={14} />
        No active provider referral workflows. Open the Provider tab and click &quot;Referral&quot;
        to initiate a journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeWorkflows.map(({ id, wf }) => {
        if (!wf) return null;
        const statusCfg = {
          'in-progress': {
            cls: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
            label: `In Progress — Step ${wf.currentStep}/${wf.totalSteps}`,
          },
          'awaiting-review': {
            cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
            label: 'Awaiting Closure Documentation',
          },
          completed: {
            cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]',
            label: 'Referral Closed',
          },
          rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Deferred' },
          idle: { cls: '', label: '' },
        } as const;
        const sc = statusCfg[wf.status];

        return (
          <div key={id} className="border border-carbon-gray-20 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-3 bg-carbon-gray-10 border-b border-carbon-gray-20">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#0043ce] flex items-center justify-center">
                  <Icon name="ClipboardDocumentCheckIcon" size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">
                    {wfDef.label} — {REFERRAL_LABELS[id] ?? id}
                  </p>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    Started{' '}
                    {new Date(wf.startedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    by {wf.startedBy}
                  </p>
                </div>
              </div>
              <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>
                {sc.label}
              </span>
            </div>

            {/* Step progress bar */}
            <div className="px-4 py-3 border-b border-carbon-gray-20">
              <div className="flex items-center gap-1">
                {wfDef.steps.map((step) => {
                  const isDone = wf.status === 'completed' || step.step < wf.currentStep;
                  const isActive =
                    step.step === wf.currentStep &&
                    wf.status !== 'completed' &&
                    wf.status !== 'rejected';
                  const isRejected = wf.status === 'rejected' && step.step === wf.currentStep;
                  return (
                    <React.Fragment key={step.step}>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 flex items-center justify-center text-2xs font-bold flex-shrink-0
                          ${
                            isDone
                              ? 'bg-[#24a148] text-white'
                              : isActive
                                ? 'bg-[#0043ce] text-white'
                                : isRejected
                                  ? 'bg-[#b45309] text-white'
                                  : 'bg-carbon-gray-20 text-carbon-gray-50'
                          }`}
                        >
                          {isDone ? (
                            <Icon name="CheckIcon" size={9} />
                          ) : isRejected ? (
                            <Icon name="ClockIcon" size={9} />
                          ) : (
                            step.step
                          )}
                        </div>
                        <p
                          className={`text-2xs mt-1 text-center leading-tight hidden sm:block
                          ${isActive ? 'text-[#0043ce] font-semibold' : isDone ? 'text-[#24a148]' : 'text-carbon-gray-30'}`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {step.step < wfDef.steps.length && (
                        <div
                          className={`h-0.5 flex-1 mb-3 ${isDone ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step history */}
            {wf.stepHistory.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                  <tr>
                    {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-gray-20">
                  {wf.stepHistory.map((record, i) => (
                    <tr key={`ref-step-${i}`} className="hover:bg-carbon-gray-10">
                      <td className="px-4 py-2.5">
                        <div
                          className={`w-5 h-5 flex items-center justify-center ${wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? 'bg-[#b45309]' : 'bg-[#24a148]'}`}
                        >
                          {wf.status === 'rejected' && i === wf.stepHistory.length - 1 ? (
                            <Icon name="ClockIcon" size={9} className="text-white" />
                          ) : (
                            <Icon name="CheckIcon" size={9} className="text-white" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                        {record.label}
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                        >
                          {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                        {record.notes ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                        {new Date(record.completedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-xs text-carbon-gray-50">No steps completed yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ActionsTasksTab() {
  const [activeSection, setActiveSection] = useState<
    | 'tasks'
    | 'audit'
    | 'hcc-trail'
    | 'gap-trail'
    | 'util-trail'
    | 'dispute-trail'
    | 'referral-trail'
  >('tasks');
  const { getWorkflow } = useWorkflowMachine();
  const activeHccCount = HCC_SUSPECT_IDS.filter(
    (id) => getWorkflow('hcc-confirmation', id) !== undefined
  ).length;
  const activeGapCount = CARE_GAP_IDS.filter(
    (id) => getWorkflow('care-gap-closure', id) !== undefined
  ).length;
  const activeUtilCount = ALERT_IDS.filter(
    (id) => getWorkflow('utilization-escalation', id) !== undefined
  ).length;
  const activeDisputeCount = DISPUTE_IDS.filter(
    (id) => getWorkflow('attribution-dispute', id) !== undefined
  ).length;
  const activeReferralCount = REFERRAL_IDS.filter(
    (id) => getWorkflow('provider-referral', id) !== undefined
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-0 border-b border-carbon-gray-20 pb-0 overflow-x-auto">
        {[
          { key: 'tasks' as const, label: `Active Tasks`, count: tasks.length },
          { key: 'audit' as const, label: 'System Audit Trail', count: staticAuditLog.length },
          { key: 'hcc-trail' as const, label: 'HCC Workflow Trail', count: activeHccCount },
          { key: 'gap-trail' as const, label: 'Gap Closure Trail', count: activeGapCount },
          {
            key: 'util-trail' as const,
            label: 'Utilization Escalation Trail',
            count: activeUtilCount,
          },
          {
            key: 'dispute-trail' as const,
            label: 'Attribution Dispute Trail',
            count: activeDisputeCount,
          },
          { key: 'referral-trail' as const, label: 'Referral Trail', count: activeReferralCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${activeSection === tab.key ? 'border-b-[#0f62fe] text-[#0f62fe]' : 'border-b-transparent text-carbon-gray-50 hover:text-carbon-gray-100'}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`text-2xs font-bold px-1.5 py-0.5 min-w-[18px] text-center ${activeSection === tab.key ? 'bg-[#0f62fe] text-white' : 'bg-carbon-gray-20 text-carbon-gray-70'}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <button className="ml-auto carbon-btn-primary text-xs py-1.5 mb-1">
          <Icon name="PlusIcon" size={14} />
          Create Task
        </button>
      </div>

      {activeSection === 'tasks' && (
        <div className="space-y-2">
          {tasks?.map((task) => (
            <div
              key={task?.id}
              className={`border p-4 ${task?.priority === 'Critical' ? 'border-l-4 border-l-[#da1e28] bg-[#fff8f8]' : task?.priority === 'High' ? 'border-l-4 border-l-[#f1c21b] bg-[#fdf6dd]/50' : 'border-carbon-gray-20 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-2xs font-semibold px-2 py-0.5 ${
                        task?.type === 'HCC Review'
                          ? 'bg-[#fdf6dd] text-[#b45309]'
                          : task?.type === 'Care Gap'
                            ? 'bg-[#d0e2ff] text-[#0043ce]'
                            : task?.type === 'Utilization'
                              ? 'bg-[#fff1f1] text-[#da1e28]'
                              : task?.type === 'Medication'
                                ? 'bg-[#f6f2ff] text-[#6929c4]'
                                : 'bg-carbon-gray-10 text-carbon-gray-70'
                      }`}
                    >
                      {task?.type}
                    </span>
                    <StatusBadge
                      label={task?.priority}
                      variant={
                        task?.priority === 'Critical'
                          ? 'danger'
                          : task?.priority === 'High'
                            ? 'warning'
                            : 'neutral'
                      }
                      size="sm"
                    />
                    <StatusBadge
                      label={task?.status}
                      variant={
                        task?.status === 'Completed'
                          ? 'success'
                          : task?.status === 'In Progress'
                            ? 'info'
                            : 'neutral'
                      }
                      size="sm"
                    />
                  </div>
                  <p className="text-xs text-carbon-gray-100 font-medium">{task?.description}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-2xs text-carbon-gray-50">
                    <span>
                      Assigned: <span className="text-carbon-gray-70">{task?.assignedTo}</span>
                    </span>
                    <span>
                      Due: <span className="font-mono text-carbon-gray-70">{task?.dueDate}</span>
                    </span>
                    <span>By: {task?.createdBy}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    className="p-1.5 text-carbon-gray-50 hover:text-[#24a148] hover:bg-[#defbe6] transition-colors"
                    title="Mark complete"
                  >
                    <Icon name="CheckIcon" size={14} />
                  </button>
                  <button
                    className="p-1.5 text-carbon-gray-50 hover:text-carbon-blue hover:bg-[#d0e2ff] transition-colors"
                    title="Edit task"
                  >
                    <Icon name="PencilIcon" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'audit' && (
        <div className="border border-carbon-gray-20 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {['Timestamp', 'Action', 'Detail', 'User', 'Role']?.map((h) => (
                  <th
                    key={`ah-${h}`}
                    className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {staticAuditLog?.map((entry) => (
                <tr key={entry?.id} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                    {new Date(entry.timestamp)?.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                    {entry?.action}
                  </td>
                  <td className="px-4 py-2.5 text-carbon-gray-70 max-w-xs">{entry?.detail}</td>
                  <td className="px-4 py-2.5 text-carbon-gray-70">{entry?.user}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-2xs px-1.5 py-0.5 font-medium ${entry?.role === 'Automated' ? 'bg-carbon-gray-10 text-carbon-gray-50' : entry?.role === 'Care Manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                    >
                      {entry?.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'hcc-trail' && <HCCWorkflowAuditSection />}
      {activeSection === 'gap-trail' && <CareGapWorkflowAuditSection />}
      {activeSection === 'util-trail' && <UtilizationWorkflowAuditSection />}
      {activeSection === 'dispute-trail' && <AttributionDisputeAuditSection />}
      {activeSection === 'referral-trail' && <ReferralWorkflowAuditSection />}
    </div>
  );
}
