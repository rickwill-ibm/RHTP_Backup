'use client';
import React, { useState, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import type { PatientTab, EntryContext } from '@/lib/actionRegistry';
import type { ActionDefinition } from '@/lib/actionRegistry';
import { mockPatients, mockHCCSuspects, mockCareGaps, mockAlerts } from '@/lib/mockData';
import type { HCCSuspect, CareGap, UtilizationAlert } from '@/lib/mockData';
import { generatePDFReport } from '@/lib/exportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveModal =
  | 'surface-hcc'
  | 'acknowledge-alert'
  | 'review-hcc-evidence'
  | 'assign-intervention'
  | 'escalate-hcc'
  | 'escalate-er'
  | 'assign-care-gap'
  | 'dismiss-alert'
  | 'initiate-outreach'
  | 'close-care-gap'
  | 'defer-gap'
  | 'assign-task'
  | null;

interface ContextualActionPanelProps {
  activeTab: PatientTab;
  patientState?: {
    openHCCSuspects: number;
    openCareGaps: number;
    activeAlerts: number;
    attributionStatus?: import('@/lib/mockData').AttributionStatus;
    hccStatuses?: import('@/lib/mockData').HCCStatus[];
    gapStatuses?: import('@/lib/mockData').GapStatus[];
    alertTiers?: import('@/lib/mockData').AlertTier[];
  };
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  subtitle: string;
  accentColor: string;
  iconName: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({
  title,
  subtitle,
  accentColor,
  iconName,
  onClose,
  children,
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-carbon-gray-20 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20"
          style={{ borderTopColor: accentColor, borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              <Icon name={iconName as any} size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">{title}</p>
              <p className="text-2xs text-carbon-gray-50">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Workflow Step Badge ──────────────────────────────────────────────────────

function WorkflowStepBadge({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-[#edf5ff] border-b border-[#97c1ff]">
      <div className="flex items-center gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`w-5 h-1.5 ${i < step ? 'bg-[#0f62fe]' : 'bg-carbon-gray-20'}`} />
        ))}
      </div>
      <span className="text-2xs text-[#0043ce] font-medium">
        Step {step} of {total} — {label}
      </span>
    </div>
  );
}

// ─── HCC Selector ─────────────────────────────────────────────────────────────

function HCCSelectorList({
  suspects,
  selected,
  onSelect,
}: {
  suspects: HCCSuspect[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (suspects.length === 0) {
    return (
      <p className="text-sm text-carbon-gray-50 italic py-2">
        No HCC suspects available for this patient.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {suspects.map((s) => (
        <label
          key={s.id}
          className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
            selected === s.id
              ? 'border-[#0f62fe] bg-[#edf5ff]'
              : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
          }`}
        >
          <input
            type="radio"
            name="hcc-select"
            value={s.id}
            checked={selected === s.id}
            onChange={() => onSelect(s.id)}
            className="mt-0.5 accent-carbon-blue"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-carbon-gray-100">{s.hccCode}</span>
              <span className="text-xs text-carbon-gray-70">{s.hccDescription}</span>
              <span className="text-2xs px-1.5 py-0.5 bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b] font-mono">
                {s.status}
              </span>
            </div>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              {s.icdCode} · RAF Δ +{s.estimatedRafDelta.toFixed(3)} · $
              {s.estimatedRevenueDelta.toLocaleString()} est. revenue
            </p>
            <p className="text-2xs text-carbon-gray-50">
              Confidence: {Math.round(s.suspectConfidence * 100)}% · Source: {s.dataSource} ·
              Deadline: {s.submissionDeadline}
            </p>
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Care Gap Selector ────────────────────────────────────────────────────────

function CareGapSelectorList({
  gaps,
  selected,
  onSelect,
}: {
  gaps: CareGap[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (gaps.length === 0) {
    return (
      <p className="text-sm text-carbon-gray-50 italic py-2">No open care gaps for this patient.</p>
    );
  }
  return (
    <div className="space-y-2">
      {gaps.map((g) => (
        <label
          key={g.id}
          className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
            selected === g.id
              ? 'border-[#0043ce] bg-[#edf5ff]'
              : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
          }`}
        >
          <input
            type="radio"
            name="gap-select"
            value={g.id}
            checked={selected === g.id}
            onChange={() => onSelect(g.id)}
            className="mt-0.5 accent-carbon-blue"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-carbon-gray-100">{g.measureName}</span>
              <span className="text-2xs px-1.5 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] font-mono">
                {g.program}
              </span>
              <span className="text-2xs px-1.5 py-0.5 bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b] font-mono">
                {g.status}
              </span>
            </div>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">
              {g.daysOpen} days open · Due: {g.dueDate} · Assigned: {g.assignedTo || 'Unassigned'}
            </p>
            <p className="text-2xs text-carbon-gray-50">Closure: {g.closureRequirement}</p>
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Alert Selector ───────────────────────────────────────────────────────────

function AlertSelectorList({
  alerts,
  selected,
  onSelect,
}: {
  alerts: UtilizationAlert[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-carbon-gray-50 italic py-2">
        No active utilization alerts for this patient.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <label
          key={a.id}
          className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
            selected === a.id
              ? 'border-[#da1e28] bg-[#fff1f1]'
              : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
          }`}
        >
          <input
            type="radio"
            name="alert-select"
            value={a.id}
            checked={selected === a.id}
            onChange={() => onSelect(a.id)}
            className="mt-0.5 accent-[#da1e28]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-2xs px-1.5 py-0.5 font-semibold border ${
                  a.tier === 'Critical'
                    ? 'bg-[#da1e28] text-white border-[#da1e28]'
                    : a.tier === 'Important'
                      ? 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
                      : 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'
                }`}
              >
                {a.tier}
              </span>
              <span className="text-xs font-semibold text-carbon-gray-100">{a.type}</span>
            </div>
            <p className="text-2xs text-carbon-gray-70 mt-0.5">{a.description}</p>
            <p className="text-2xs text-carbon-gray-50">
              Risk: {Math.round(a.riskScore * 100)}% · Est. cost: $
              {a.estimatedCost.toLocaleString()} · Source: {a.source}
            </p>
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Notes Field ──────────────────────────────────────────────────────────────

function NotesField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
        Notes / Clinical Rationale
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder ?? 'Add clinical context or notes...'}
        className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue resize-none"
      />
    </div>
  );
}

// ─── Assignee + Priority Row ──────────────────────────────────────────────────

const CARE_TEAM = [
  'Sarah Johnson',
  'Dr. James Whitfield',
  'Maria Chen',
  'Robert Kim',
  'Pharmacy Team',
  'Social Work Team',
  'Dr. Sarah Nakamura',
  'Dr. Anil Patel',
];

function AssigneeRow({
  assignedTo,
  priority,
  onAssignedTo,
  onPriority,
}: {
  assignedTo: string;
  priority: string;
  onAssignedTo: (v: string) => void;
  onPriority: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
          Assign To
        </label>
        <select
          value={assignedTo}
          onChange={(e) => onAssignedTo(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
        >
          {CARE_TEAM.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
          Priority
        </label>
        <select
          value={priority}
          onChange={(e) => onPriority(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
        >
          {['Critical', 'High', 'Medium', 'Low'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Modal Footer ─────────────────────────────────────────────────────────────

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmColor,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon-gray-20">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-sm text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-10"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="px-4 py-2 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: confirmColor }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ─── Modal: Surface HCC Suspect ───────────────────────────────────────────────

function SurfaceHCCModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patientId);
  const surfaceable = hccSuspects.filter((h) => h.status === 'Surfaced');
  const [selectedId, setSelectedId] = useState(surfaceable[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    if (!selectedId) return;
    const suspect = hccSuspects.find((h) => h.id === selectedId);
    if (!suspect) return;
    const status = wm.getWorkflowStatus('hcc-confirmation', patientId);
    if (status === 'idle')
      wm.startWorkflow('hcc-confirmation', patientId, userName, 'care_manager');
    toast.success('HCC Suspect Surfaced', {
      description: `${suspect.hccCode} — ${suspect.hccDescription} queued for evidence review.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Surface HCC Suspect"
      subtitle={patientName}
      accentColor="#f1c21b"
      iconName="MagnifyingGlassCircleIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={1} total={5} label="Surface Suspect" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Select an HCC suspect to surface for care manager review. This initiates the HCC
          Confirmation workflow.
        </p>
        <HCCSelectorList suspects={surfaceable} selected={selectedId} onSelect={setSelectedId} />
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Clinical basis for surfacing this suspect..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Surface Suspect"
          confirmColor="#b45309"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Acknowledge Alert ─────────────────────────────────────────────────

function AcknowledgeAlertModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patientId && a.status === 'Active')
    : [];
  const [selectedId, setSelectedId] = useState(alerts[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    if (!selectedId) return;
    const alert = alerts.find((a) => a.id === selectedId);
    if (!alert) return;
    const status = wm.getWorkflowStatus('utilization-escalation', patientId);
    if (status === 'idle')
      wm.startWorkflow('utilization-escalation', patientId, userName, 'care_manager');
    toast.success('Alert Acknowledged', {
      description: `${alert.type} alert for ${patientName} added to care manager queue.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Acknowledge Alert"
      subtitle={patientName}
      accentColor="#da1e28"
      iconName="EyeIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={1} total={4} label="Surface Risk" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Acknowledge a utilization alert to surface the risk to the care team and begin the
          escalation workflow.
        </p>
        <AlertSelectorList alerts={alerts} selected={selectedId} onSelect={setSelectedId} />
        <NotesField value={notes} onChange={setNotes} placeholder="Initial assessment notes..." />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Acknowledge Alert"
          confirmColor="#da1e28"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Review HCC Evidence ───────────────────────────────────────────────

function ReviewHCCEvidenceModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patientId);
  const reviewable = hccSuspects.filter(
    (h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed'
  );
  const [selectedId, setSelectedId] = useState(reviewable[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const suspect = reviewable.find((h) => h.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !suspect) return;
    const status = wm.getWorkflowStatus('hcc-confirmation', patientId);
    if (status === 'idle')
      wm.startWorkflow('hcc-confirmation', patientId, userName, 'care_manager');
    else if (status === 'in-progress')
      wm.advanceStep('hcc-confirmation', patientId, userName, 'care_manager', notes);
    toast.success('HCC Evidence Reviewed', {
      description: `Evidence for ${suspect.hccCode} reviewed. Ready for physician escalation.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Review HCC Evidence"
      subtitle={patientName}
      accentColor="#0f62fe"
      iconName="DocumentMagnifyingGlassIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={2} total={5} label="Review Evidence" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Review supporting evidence sources for the selected HCC suspect before escalating to the
          physician.
        </p>
        <HCCSelectorList suspects={reviewable} selected={selectedId} onSelect={setSelectedId} />
        {suspect && (
          <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3 space-y-1">
            <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
              Evidence Sources
            </p>
            {suspect.evidenceSources.map((src, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon name="DocumentTextIcon" size={12} className="text-[#0f62fe] flex-shrink-0" />
                <span className="text-xs text-carbon-gray-100">{src}</span>
              </div>
            ))}
          </div>
        )}
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Evidence review notes and clinical observations..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Mark Evidence Reviewed"
          confirmColor="#0f62fe"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Assign Intervention ───────────────────────────────────────────────

const INTERVENTION_TYPES = [
  'Care Management Enrollment',
  'Medication Reconciliation',
  'Transitional Care Management',
  'Chronic Disease Management',
  'Behavioral Health Referral',
  'Social Work Consult',
  'Home Health Assessment',
  'Palliative Care Consult',
];

function AssignInterventionModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const [interventionType, setInterventionType] = useState(INTERVENTION_TYPES[0]);
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    const status = wm.getWorkflowStatus('utilization-escalation', patientId);
    if (status === 'in-progress')
      wm.advanceStep('utilization-escalation', patientId, userName, 'care_manager', notes);
    else if (status === 'idle')
      wm.startWorkflow('utilization-escalation', patientId, userName, 'care_manager');
    toast.success('Intervention Assigned', {
      description: `${interventionType} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Intervention"
      subtitle={patientName}
      accentColor="#f1c21b"
      iconName="ClipboardDocumentListIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={2} total={4} label="Assign Intervention" />
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Intervention Protocol
          </label>
          <select
            value={interventionType}
            onChange={(e) => setInterventionType(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {INTERVENTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <AssigneeRow
          assignedTo={assignedTo}
          priority={priority}
          onAssignedTo={setAssignedTo}
          onPriority={setPriority}
        />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Target Completion Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Intervention rationale and care plan notes..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Assign Intervention"
          confirmColor="#b45309"
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Escalate HCC ──────────────────────────────────────────────────────

const PHYSICIANS = ['Dr. James Whitfield', 'Dr. Sarah Nakamura', 'Dr. Anil Patel'];

function EscalateHCCModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patientId);
  const escalatable = hccSuspects.filter(
    (h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed'
  );
  const [selectedId, setSelectedId] = useState(escalatable[0]?.id ?? '');
  const [physician, setPhysician] = useState(PHYSICIANS[0]);
  const [notes, setNotes] = useState('');
  const suspect = escalatable.find((h) => h.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !suspect) return;
    const status = wm.getWorkflowStatus('hcc-confirmation', patientId);
    if (status === 'in-progress')
      wm.advanceStep('hcc-confirmation', patientId, userName, 'care_manager', notes);
    else if (status === 'idle')
      wm.startWorkflow('hcc-confirmation', patientId, userName, 'care_manager');
    toast.success('HCC Escalated to Physician', {
      description: `${suspect.hccCode} routed to ${physician} for clinical review.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Escalate HCC to Physician"
      subtitle={patientName}
      accentColor="#f1c21b"
      iconName="ArrowUpCircleIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={3} total={5} label="Escalate to Physician" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Route the selected HCC suspect to the assigned physician for clinical review and
          confirmation.
        </p>
        <HCCSelectorList suspects={escalatable} selected={selectedId} onSelect={setSelectedId} />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Escalate To (Physician)
          </label>
          <select
            value={physician}
            onChange={(e) => setPhysician(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {PHYSICIANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Clinical context for physician review..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Escalate to Physician"
          confirmColor="#b45309"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Escalate ER Risk ──────────────────────────────────────────────────

const ER_PROTOCOLS = [
  'Transitional Care Management',
  'Emergency Care Coordination',
  'Rapid Response Outreach',
  'Hospitalist Notification',
  'SNF Readmission Prevention',
  'Palliative Care Escalation',
];

function EscalateERRiskModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patientId && a.status === 'Active')
    : [];
  const criticalAlerts = alerts.filter((a) => a.tier === 'Critical' || a.tier === 'Important');
  const displayAlerts = criticalAlerts.length > 0 ? criticalAlerts : alerts;
  const [selectedId, setSelectedId] = useState(displayAlerts[0]?.id ?? '');
  const [protocol, setProtocol] = useState(ER_PROTOCOLS[0]);
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    const status = wm.getWorkflowStatus('utilization-escalation', patientId);
    if (status === 'in-progress')
      wm.advanceStep('utilization-escalation', patientId, userName, 'care_manager', notes);
    else if (status === 'idle')
      wm.startWorkflow('utilization-escalation', patientId, userName, 'care_manager');
    toast.error('ER Risk Escalated', {
      description: `${protocol} protocol initiated for ${patientName}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Escalate ER Risk"
      subtitle={patientName}
      accentColor="#da1e28"
      iconName="ExclamationTriangleIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={3} total={4} label="Document Outcome" />
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-2 p-3 bg-[#fff1f1] border border-[#da1e28]/30">
          <Icon
            name="ExclamationTriangleIcon"
            size={16}
            className="text-[#da1e28] flex-shrink-0 mt-0.5"
          />
          <p className="text-xs text-[#da1e28] font-medium">
            This initiates a critical ER risk intervention protocol. Ensure clinical justification
            is documented.
          </p>
        </div>
        <AlertSelectorList alerts={displayAlerts} selected={selectedId} onSelect={setSelectedId} />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Intervention Protocol
          </label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {ER_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Clinical justification for ER risk escalation..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Escalate ER Risk"
          confirmColor="#da1e28"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Assign Care Gap ───────────────────────────────────────────────────

function AssignCareGapModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patientId && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const gap = careGaps.find((g) => g.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    const status = wm.getWorkflowStatus('care-gap-closure', patientId);
    if (status === 'idle')
      wm.startWorkflow('care-gap-closure', patientId, userName, 'care_manager');
    toast.success('Care Gap Assigned', {
      description: `${gap.measureName} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Care Gap"
      subtitle={patientName}
      accentColor="#0043ce"
      iconName="ClipboardDocumentCheckIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={1} total={3} label="Assign Gap" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Assign an open care gap to a care coordinator or provider to begin the closure workflow.
        </p>
        <CareGapSelectorList gaps={careGaps} selected={selectedId} onSelect={setSelectedId} />
        <AssigneeRow
          assignedTo={assignedTo}
          priority={priority}
          onAssignedTo={setAssignedTo}
          onPriority={setPriority}
        />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Target Closure Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Assignment notes and care coordination context..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Assign Care Gap"
          confirmColor="#0043ce"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Dismiss Alert ─────────────────────────────────────────────────────

const DISMISS_REASONS = [
  'Clinically not applicable',
  'Patient already receiving intervention',
  'Duplicate alert',
  'Patient declined intervention',
  'Resolved prior to review',
  'Outside care scope',
];

function DismissAlertModal({
  patientId,
  patientName,
  onClose,
  userName,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
}) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patientId && a.status === 'Active')
    : [];
  const dismissable = alerts.filter((a) => a.tier === 'Important' || a.tier === 'Informational');
  const displayAlerts = dismissable.length > 0 ? dismissable : alerts;
  const [selectedId, setSelectedId] = useState(displayAlerts[0]?.id ?? '');
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    if (!selectedId) return;
    const alert = displayAlerts.find((a) => a.id === selectedId);
    if (!alert) return;
    toast.info('Alert Dismissed', {
      description: `${alert.type} alert dismissed. Reason: ${reason}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Dismiss Alert"
      subtitle={patientName}
      accentColor="#6f6f6f"
      iconName="XMarkIcon"
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Dismiss a utilization alert with a documented clinical reason. This action is recorded in
          the audit trail.
        </p>
        <AlertSelectorList alerts={displayAlerts} selected={selectedId} onSelect={setSelectedId} />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Dismissal Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {DISMISS_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Additional clinical context for dismissal..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Dismiss Alert"
          confirmColor="#6f6f6f"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Initiate Outreach ─────────────────────────────────────────────────

const OUTREACH_TYPES = [
  'Phone Call — Care Gap Outreach',
  'Phone Call — AWV Reminder',
  'Phone Call — Medication Adherence',
  'Phone Call — Post-Discharge Follow-up',
  'SMS Reminder',
  'Mail — Gap Closure Notice',
  'Social Determinants Screening',
  'Community Health Worker Visit',
];

function InitiateOutreachModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const patient = mockPatients.find((p) => p.id === patientId) ?? mockPatients[0];
  const [outreachType, setOutreachType] = useState(OUTREACH_TYPES[0]);
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    const status = wm.getWorkflowStatus('care-gap-closure', patientId);
    if (status === 'in-progress')
      wm.advanceStep('care-gap-closure', patientId, userName, 'care_manager', notes);
    else if (status === 'idle')
      wm.startWorkflow('care-gap-closure', patientId, userName, 'care_manager');
    toast.success('Outreach Initiated', {
      description: `${outreachType} scheduled for ${patientName}. Assigned to ${assignedTo}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Initiate Patient Outreach"
      subtitle={patientName}
      accentColor="#0f62fe"
      iconName="PhoneIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={2} total={3} label="Initiate Outreach" />
      <div className="p-5 space-y-4">
        <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3 space-y-1">
          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
            Patient Contact
          </p>
          <p className="text-xs text-carbon-gray-100">{patient.name}</p>
          <p className="text-xs text-carbon-gray-70 font-mono">{patient.phone}</p>
          <p className="text-xs text-carbon-gray-50">{patient.address}</p>
        </div>
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Outreach Type
          </label>
          <select
            value={outreachType}
            onChange={(e) => setOutreachType(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {OUTREACH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Assigned To
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
            >
              {CARE_TEAM.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Scheduled Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
            />
          </div>
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Outreach purpose and patient context..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Initiate Outreach"
          confirmColor="#0f62fe"
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Close Care Gap ────────────────────────────────────────────────────

const CLOSURE_METHODS = [
  'Service Rendered — Documented in EHR',
  'Lab Result Received',
  'Attestation by Physician',
  'Claims Data Confirmed',
  'Patient Self-Report with Documentation',
  'Screening Completed',
];

function CloseCareGapModal({
  patientId,
  patientName,
  onClose,
  userName,
  wm,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patientId && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [closureMethod, setClosureMethod] = useState(CLOSURE_METHODS[0]);
  const [closureDate, setClosureDate] = useState('');
  const [notes, setNotes] = useState('');
  const gap = careGaps.find((g) => g.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    const status = wm.getWorkflowStatus('care-gap-closure', patientId);
    if (status === 'in-progress')
      wm.completeWorkflow('care-gap-closure', patientId, userName, 'care_manager', notes);
    else if (status === 'idle') {
      wm.startWorkflow('care-gap-closure', patientId, userName, 'care_manager');
      wm.completeWorkflow('care-gap-closure', patientId, userName, 'care_manager', notes);
    }
    toast.success('Care Gap Closed', {
      description: `${gap.measureName} closed via ${closureMethod}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Close Care Gap"
      subtitle={patientName}
      accentColor="#24a148"
      iconName="CheckCircleIcon"
      onClose={onClose}
    >
      <WorkflowStepBadge step={3} total={3} label="Close Gap" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Document gap closure with attestation or service confirmation. This completes the care gap
          closure workflow.
        </p>
        <CareGapSelectorList gaps={careGaps} selected={selectedId} onSelect={setSelectedId} />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Closure Method
          </label>
          <select
            value={closureMethod}
            onChange={(e) => setClosureMethod(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {CLOSURE_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Closure Date
          </label>
          <input
            type="date"
            value={closureDate}
            onChange={(e) => setClosureDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Closure attestation and supporting documentation..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Close Care Gap"
          confirmColor="#24a148"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Defer Gap ─────────────────────────────────────────────────────────

const DEFER_REASONS = [
  'Patient medically unstable',
  'Patient declined — documented',
  'Awaiting specialist clearance',
  'Insurance authorization pending',
  'Scheduling constraints',
  'Clinical contraindication',
];

function DeferGapModal({
  patientId,
  patientName,
  onClose,
  userName,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  userName: string;
}) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patientId && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [reason, setReason] = useState(DEFER_REASONS[0]);
  const [deferUntil, setDeferUntil] = useState('');
  const [notes, setNotes] = useState('');
  const gap = careGaps.find((g) => g.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    toast.info('Care Gap Deferred', {
      description: `${gap.measureName} deferred. Reason: ${reason}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Defer Care Gap"
      subtitle={patientName}
      accentColor="#6f6f6f"
      iconName="ClockIcon"
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-carbon-gray-70">
          Defer a care gap with a documented clinical reason. Deferred gaps remain in the panel for
          future review.
        </p>
        <CareGapSelectorList gaps={careGaps} selected={selectedId} onSelect={setSelectedId} />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Deferral Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {DEFER_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Defer Until
          </label>
          <input
            type="date"
            value={deferUntil}
            onChange={(e) => setDeferUntil(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <NotesField
          value={notes}
          onChange={setNotes}
          placeholder="Clinical rationale for deferral..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Defer Gap"
          confirmColor="#6f6f6f"
          disabled={!selectedId}
        />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Assign Task ───────────────────────────────────────────────────────

const TASK_TYPES = [
  'HCC Review',
  'Care Gap Closure',
  'Outreach Call',
  'Medication Review',
  'AWV Scheduling',
  'Utilization Review',
  'Care Plan Update',
  'Social Determinants Assessment',
  'Referral Follow-up',
];

function AssignTaskModal({
  patientName,
  onClose,
  userName,
}: {
  patientName: string;
  onClose: () => void;
  userName: string;
}) {
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    toast.success('Task Assigned', {
      description: `${taskType} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Task"
      subtitle={patientName}
      accentColor="#0f62fe"
      iconName="ClipboardDocumentListIcon"
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Task Type
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Task description..."
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <AssigneeRow
          assignedTo={assignedTo}
          priority={priority}
          onAssignedTo={setAssignedTo}
          onPriority={setPriority}
        />
        <div>
          <label className="block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-carbon-gray-10 border border-carbon-gray-20 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <NotesField value={notes} onChange={setNotes} placeholder="Additional context..." />
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Assign Task"
          confirmColor="#0f62fe"
        />
      </div>
    </ModalShell>
  );
}

// ─── Action ID → Modal mapping ────────────────────────────────────────────────

const ACTION_TO_MODAL: Record<string, ActiveModal> = {
  'act-surface-hcc': 'surface-hcc',
  'act-acknowledge-alert': 'acknowledge-alert',
  'act-review-hcc-evidence': 'review-hcc-evidence',
  'act-assign-intervention': 'assign-intervention',
  'act-escalate-hcc': 'escalate-hcc',
  'act-escalate-er': 'escalate-er',
  'act-assign-gap': 'assign-care-gap',
  'act-dismiss-alert': 'dismiss-alert',
  'act-outreach-gap': 'initiate-outreach',
  'act-close-gap': 'close-care-gap',
  'act-defer-gap': 'defer-gap',
  'act-assign-task': 'assign-task',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContextualActionPanel({
  activeTab,
  patientState,
}: ContextualActionPanelProps) {
  const { user, entryContext, setEntryContext, getActions, selectedPatientId } = useAppContext();
  const wm = useWorkflowMachine();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // ── Role/Context switcher state — default to active role, NOT Browse ──────
  const [localRole, setLocalRole] = useState<'cm' | 'md'>('cm');
  const [localContext, setLocalContext] = useState<'active' | 'browse'>('active');

  const patientId = selectedPatientId ?? 'patient-001';
  const patient = mockPatients.find((p) => p.id === patientId) ?? mockPatients[0];
  const patientName = patient?.name ?? 'Patient';

  const defaultPatientState = patientState ?? {
    openHCCSuspects: 3,
    openCareGaps: 5,
    activeAlerts: 2,
    attributionStatus: 'Confirmed' as const,
    hccStatuses: [
      'Surfaced',
      'Evidence Reviewed',
      'Clinician Review',
    ] as import('@/lib/mockData').HCCStatus[],
    gapStatuses: ['Open', 'In Progress'] as import('@/lib/mockData').GapStatus[],
    alertTiers: ['Critical', 'Important'] as import('@/lib/mockData').AlertTier[],
  };

  // Derive effective entry context from local toggle
  const effectiveContext: EntryContext = localContext === 'browse' ? 'browse' : 'cerner-launch';

  // CM actions — always populated when role=CM and context=active
  const CM_ACTIONS_DIRECT: ActionDefinition[] = [
    {
      id: 'act-assign-gap',
      label: 'Assign Care Gap',
      shortLabel: 'Assign Gap',
      description: 'Assign open care gap to care coordinator or provider',
      icon: 'ClipboardDocumentCheckIcon',
      variant: 'primary',
      category: 'care-gap',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 1,
      auditLabel: 'Care Gap Assigned',
    },
    {
      id: 'act-close-gap',
      label: 'Close Care Gap',
      shortLabel: 'Close Gap',
      description: 'Document gap closure with attestation or service confirmation',
      icon: 'CheckCircleIcon',
      variant: 'success',
      category: 'care-gap',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 2,
      auditLabel: 'Care Gap Closed',
    },
    {
      id: 'act-outreach-gap',
      label: 'Schedule Outreach Call',
      shortLabel: 'Outreach Call',
      description: 'Contact patient to schedule required service',
      icon: 'PhoneIcon',
      variant: 'secondary',
      category: 'care-gap',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 3,
      auditLabel: 'Outreach Initiated',
    },
    {
      id: 'act-assign-intervention',
      label: 'Create BH Referral Task',
      shortLabel: 'BH Referral',
      description: 'Assign behavioral health referral task to care team',
      icon: 'HeartIcon',
      variant: 'warning',
      category: 'care-gap',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 4,
      auditLabel: 'BH Referral Task Created',
    },
    {
      id: 'act-escalate-er',
      label: 'Escalate to Crisis',
      shortLabel: 'Escalate Crisis',
      description: 'Initiate crisis escalation protocol',
      icon: 'ExclamationTriangleIcon',
      variant: 'danger',
      category: 'utilization',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 5,
      auditLabel: 'Crisis Escalated',
    },
    {
      id: 'act-assign-task',
      label: 'Add to Priority Queue',
      shortLabel: 'Priority Queue',
      description: 'Add patient to care manager priority queue',
      icon: 'QueueListIcon',
      variant: 'secondary',
      category: 'task',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 6,
      auditLabel: 'Added to Priority Queue',
    },
    {
      id: 'act-acknowledge-alert',
      label: 'Log Contact Attempt',
      shortLabel: 'Log Contact',
      description: 'Log a patient contact attempt in the care record',
      icon: 'DocumentTextIcon',
      variant: 'secondary',
      category: 'task',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 7,
      auditLabel: 'Contact Attempt Logged',
    },
    {
      id: 'act-escalate-hcc',
      label: 'Request Specialist',
      shortLabel: 'Request Specialist',
      description: 'Request specialist consultation for patient',
      icon: 'UserPlusIcon',
      variant: 'secondary',
      category: 'clinical',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 8,
      auditLabel: 'Specialist Requested',
    },
    {
      id: 'act-export-patient',
      label: 'Export Patient Summary',
      shortLabel: 'Export Summary',
      description: 'Export full patient summary as PDF',
      icon: 'ArrowDownTrayIcon',
      variant: 'secondary',
      category: 'export',
      roles: ['care_manager'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 9,
      auditLabel: 'Patient Summary Exported',
    },
  ];

  // MD actions — shown when role=MD
  const MD_ACTIONS_DIRECT: ActionDefinition[] = [
    {
      id: 'act-confirm-hcc',
      label: 'Order Lab',
      shortLabel: 'Order Lab',
      description: 'Order laboratory test for patient',
      icon: 'BeakerIcon',
      variant: 'primary',
      category: 'clinical',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 1,
      auditLabel: 'Lab Ordered',
    },
    {
      id: 'act-escalate-hcc',
      label: 'Create Referral',
      shortLabel: 'Create Referral',
      description: 'Create specialist referral order',
      icon: 'ArrowTopRightOnSquareIcon',
      variant: 'primary',
      category: 'clinical',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 2,
      auditLabel: 'Referral Created',
    },
    {
      id: 'act-review-hcc-evidence',
      label: 'Update Problem List',
      shortLabel: 'Problem List',
      description: 'Update patient problem list in EHR',
      icon: 'ClipboardDocumentListIcon',
      variant: 'secondary',
      category: 'clinical',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 3,
      auditLabel: 'Problem List Updated',
    },
    {
      id: 'act-surface-hcc',
      label: 'Confirm HCC',
      shortLabel: 'Confirm HCC',
      description: 'Confirm HCC suspect for RAF submission',
      icon: 'CheckBadgeIcon',
      variant: 'warning',
      category: 'hcc',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 4,
      auditLabel: 'HCC Confirmed',
    },
    {
      id: 'act-assign-task',
      label: 'Add to Care Plan',
      shortLabel: 'Add to Care Plan',
      description: 'Add new goal or intervention to care plan',
      icon: 'DocumentPlusIcon',
      variant: 'secondary',
      category: 'clinical',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 5,
      auditLabel: 'Care Plan Updated',
    },
    {
      id: 'act-export-patient',
      label: 'Export Patient Summary',
      shortLabel: 'Export Summary',
      description: 'Export full patient summary as PDF',
      icon: 'ArrowDownTrayIcon',
      variant: 'secondary',
      category: 'export',
      roles: ['physician'],
      contexts: ['browse', 'cerner-launch'],
      screens: ['patient-detail'],
      tabs: ['risk', 'clinical', 'actions'],
      priority: 6,
      auditLabel: 'Patient Summary Exported',
    },
  ];

  // Browse actions — read-only
  const BROWSE_ACTIONS_DIRECT: ActionDefinition[] = [
    {
      id: 'act-export-patient',
      label: 'Export Patient Summary',
      shortLabel: 'Export Summary',
      description: 'Export full patient summary as PDF',
      icon: 'ArrowDownTrayIcon',
      variant: 'secondary',
      category: 'export',
      roles: ['care_manager', 'physician'],
      contexts: ['browse'],
      screens: ['patient-detail'],
      priority: 1,
      auditLabel: 'Patient Summary Exported',
    },
  ];

  // Determine which action list to show
  const displayActions: ActionDefinition[] =
    localContext === 'browse'
      ? BROWSE_ACTIONS_DIRECT
      : localRole === 'cm'
        ? CM_ACTIONS_DIRECT
        : MD_ACTIONS_DIRECT;

  const closeModal = useCallback(() => setActiveModal(null), []);

  const handleExportPatient = useCallback(() => {
    const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patientId);
    const careGaps = mockCareGaps.filter((g) => g.patientId === patientId);

    generatePDFReport({
      reportTitle: `Patient Summary — ${patient.name}`,
      subtitle: `MRN: ${patient.mrn} · ${patient.payer}`,
      generatedBy: user.name,
      sections: [
        {
          title: 'Patient Demographics',
          rows: [
            { label: 'Name', value: patient.name },
            { label: 'Date of Birth', value: patient.dob },
            { label: 'Age', value: String(patient.age) },
            { label: 'Gender', value: patient.gender },
            { label: 'MRN', value: patient.mrn },
            { label: 'Phone', value: patient.phone },
            { label: 'Address', value: patient.address },
            { label: 'Insurance ID', value: patient.insuranceId },
            { label: 'Payer', value: patient.payer },
          ],
        },
        {
          title: 'Clinical Risk Profile',
          rows: [
            { label: 'Risk Tier', value: patient.riskTier },
            {
              label: 'RAF Score',
              value: `${patient.rafScore.toFixed(2)} (Δ +${patient.rafScoreDelta.toFixed(2)})`,
            },
            {
              label: 'Predicted ER Risk (30d)',
              value: `${Math.round(patient.predictedErRisk * 100)}%`,
            },
            { label: 'Open HCC Suspects', value: String(patient.openHCCSuspects) },
            { label: 'HCC Revenue at Risk', value: `$${patient.hccSuspectValue.toLocaleString()}` },
            { label: 'Open Care Gaps', value: String(patient.openCareGaps) },
            { label: 'Active Alerts', value: String(patient.activeAlerts) },
          ],
        },
        {
          title: 'Financial & Attribution',
          rows: [
            { label: 'PMPM Cost', value: `$${patient.pmpmCost.toLocaleString()}` },
            { label: 'PMPM Target', value: `$${patient.pmpmTarget.toLocaleString()}` },
            {
              label: 'PMPM Variance',
              value: `$${(patient.pmpmCost - patient.pmpmTarget).toLocaleString()}`,
            },
            { label: 'Attribution Status', value: patient.attributionStatus },
            { label: 'Primary Care Provider', value: patient.primaryCareProvider },
            { label: 'Last Contact Date', value: patient.lastContactDate },
            { label: 'Care Plan Status', value: patient.carePlanStatus },
          ],
        },
      ],
    });
    toast.success('Patient report opened', {
      description: "Use your browser's Print dialog to save as PDF",
    });
  }, [patient, patientId, user.name]);

  const handleAction = useCallback(
    (action: ActionDefinition) => {
      if (action.id === 'act-export-patient') {
        handleExportPatient();
        return;
      }

      const modalType = ACTION_TO_MODAL[action.id];
      if (modalType) {
        setActiveModal(modalType);
        return;
      }

      // Fallback for any unmapped actions
      toast.success(`Action: ${action.label}`, { description: action.description });
    },
    [handleExportPatient]
  );

  const btnClass = (variant: ActionDefinition['variant']) => {
    const base =
      'w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-left transition-colors duration-150 border';
    switch (variant) {
      case 'primary':
        return `${base} bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]`;
      case 'danger':
        return `${base} bg-[#da1e28] text-white border-[#da1e28] hover:bg-[#b81922]`;
      case 'warning':
        return `${base} bg-[#fdf6dd] text-[#b45309] border-[#f1c21b] hover:bg-[#f1c21b]/30`;
      case 'success':
        return `${base} bg-[#defbe6] text-[#0e6027] border-[#24a148] hover:bg-[#24a148]/20`;
      case 'secondary':
        return `${base} bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 hover:text-carbon-gray-100`;
    }
  };

  const modalCommonProps = { patientId, patientName, onClose: closeModal, userName: user.name, wm };

  return (
    <>
      <div className="w-56 flex-shrink-0">
        <div className="bg-white border border-carbon-gray-20 sticky top-0">
          <div className="px-4 py-3 border-b border-carbon-gray-20 bg-carbon-gray-10">
            <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
              Contextual Actions
            </p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">{displayActions.length} available</p>
          </div>
          <div className="p-3 space-y-1.5">
            {displayActions.length === 0 ? (
              <p className="text-2xs text-carbon-gray-50 text-center py-4">
                No actions available for this context.
              </p>
            ) : (
              displayActions.map((action) => (
                <button
                  key={action.id}
                  className={btnClass(action.variant)}
                  title={action.description}
                  onClick={() => handleAction(action)}
                >
                  <Icon name={action.icon as any} size={14} className="flex-shrink-0" />
                  <span>{action.shortLabel ?? action.label}</span>
                  {action.initiatesWorkflow && (
                    <span className="ml-auto text-2xs opacity-60">▶</span>
                  )}
                  {action.workflowStep && (
                    <span className="ml-auto text-2xs opacity-60">S{action.workflowStep.step}</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Role / Context Switcher */}
          <div className="px-4 py-3 border-t border-carbon-gray-20 bg-carbon-gray-10 space-y-2">
            {/* Role toggle */}
            <div>
              <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1">
                Demo Role
              </p>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => {
                    setLocalRole('cm');
                    setLocalContext('active');
                  }}
                  className={`px-2 py-1.5 text-2xs font-semibold border transition-colors ${
                    localRole === 'cm' && localContext !== 'browse'
                      ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  CM
                </button>
                <button
                  onClick={() => {
                    setLocalRole('md');
                    setLocalContext('active');
                  }}
                  className={`px-2 py-1.5 text-2xs font-semibold border transition-colors ${
                    localRole === 'md' && localContext !== 'browse'
                      ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  MD
                </button>
                <button
                  onClick={() => setLocalContext('browse')}
                  className={`px-2 py-1.5 text-2xs font-semibold border transition-colors col-span-1 ${
                    localContext === 'browse'
                      ? 'bg-[#8a3ffc] text-white border-[#8a3ffc]'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  Browse
                </button>
                <button
                  onClick={() => {
                    setLocalRole('cm');
                    setLocalContext('active');
                  }}
                  className={`px-2 py-1.5 text-2xs font-semibold border transition-colors col-span-1 ${
                    localContext === 'active' && localRole === 'cm'
                      ? 'bg-carbon-gray-70 text-white border-carbon-gray-70'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  Cerner
                </button>
              </div>
            </div>

            {/* Status display */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-medium text-carbon-gray-50">Role:</span>
                <span
                  className={`text-2xs font-semibold px-1.5 py-0.5 ${
                    localRole === 'cm'
                      ? 'text-[#0043ce] bg-[#d0e2ff]'
                      : 'text-[#6929c4] bg-[#f6f2ff]'
                  }`}
                >
                  {localRole === 'cm' ? 'Care Manager' : 'Physician'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-medium text-carbon-gray-50">Context:</span>
                <span
                  className={`text-2xs font-semibold px-1.5 py-0.5 ${
                    localContext === 'browse'
                      ? 'text-carbon-gray-70 bg-carbon-gray-20'
                      : 'text-[#0e6027] bg-[#defbe6]'
                  }`}
                >
                  {localContext === 'browse' ? 'Browse' : 'Active'}
                </span>
              </div>
            </div>
            <p className="text-2xs text-carbon-gray-50 leading-relaxed">
              Actions filtered by role, tab, and patient state.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'surface-hcc' && <SurfaceHCCModal {...modalCommonProps} />}
      {activeModal === 'acknowledge-alert' && <AcknowledgeAlertModal {...modalCommonProps} />}
      {activeModal === 'review-hcc-evidence' && <ReviewHCCEvidenceModal {...modalCommonProps} />}
      {activeModal === 'assign-intervention' && <AssignInterventionModal {...modalCommonProps} />}
      {activeModal === 'escalate-hcc' && <EscalateHCCModal {...modalCommonProps} />}
      {activeModal === 'escalate-er' && <EscalateERRiskModal {...modalCommonProps} />}
      {activeModal === 'assign-care-gap' && <AssignCareGapModal {...modalCommonProps} />}
      {activeModal === 'dismiss-alert' && (
        <DismissAlertModal
          patientId={patientId}
          patientName={patientName}
          onClose={closeModal}
          userName={user.name}
        />
      )}
      {activeModal === 'initiate-outreach' && <InitiateOutreachModal {...modalCommonProps} />}
      {activeModal === 'close-care-gap' && <CloseCareGapModal {...modalCommonProps} />}
      {activeModal === 'defer-gap' && (
        <DeferGapModal
          patientId={patientId}
          patientName={patientName}
          onClose={closeModal}
          userName={user.name}
        />
      )}
      {activeModal === 'assign-task' && (
        <AssignTaskModal patientName={patientName} onClose={closeModal} userName={user.name} />
      )}
    </>
  );
}
