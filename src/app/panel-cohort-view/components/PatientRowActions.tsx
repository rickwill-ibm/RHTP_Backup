'use client';
import React, { useState, useCallback } from 'react';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { useGapClosureStore } from '@/lib/patientContext';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import type { Patient, HCCSuspect, CareGap, UtilizationAlert } from '@/lib/mockData';
import { mockHCCSuspects, mockCareGaps, mockAlerts } from '@/lib/mockData';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { generatePDFReport } from '@/lib/exportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionModalType =
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

// ─── Shared Modal Shell ───────────────────────────────────────────────────────

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

// ─── HCC Selector ────────────────────────────────────────────────────────────

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

// ─── Audit Trail Append (in-memory) ──────────────────────────────────────────

const auditLog: Array<{ ts: string; action: string; patient: string; by: string; notes?: string }> =
  [];

function appendAudit(action: string, patient: string, by: string, notes?: string) {
  auditLog.push({ ts: new Date().toISOString(), action, patient, by, notes });
}

// ─── Shared modal props interface ─────────────────────────────────────────────

interface BaseModalProps {
  patient: Patient;
  onClose: () => void;
  userName: string;
  wm: ReturnType<typeof useWorkflowMachine>;
}

// ─── Surface HCC Modal ────────────────────────────────────────────────────────

function SurfaceHCCModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id);
  const surfaceable = hccSuspects.filter((h) => h.status === 'Surfaced');
  const [selectedId, setSelectedId] = useState(surfaceable[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const hccWfStatus = wm.getWorkflowStatus('hcc-confirmation', patient.id);

  const handleConfirm = () => {
    if (!selectedId) return;
    const suspect = hccSuspects.find((h) => h.id === selectedId);
    if (!suspect) return;
    if (hccWfStatus === 'idle')
      wm.startWorkflow('hcc-confirmation', patient.id, userName, 'care_manager');
    appendAudit('HCC Suspect Surfaced', patient.name, userName, notes);
    toast.success('HCC Suspect Surfaced', {
      description: `${suspect.hccCode} — ${suspect.hccDescription} queued for evidence review.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Surface HCC Suspect"
      subtitle={patient.name}
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

// ─── Acknowledge Alert Modal ──────────────────────────────────────────────────

function AcknowledgeAlertModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patient.id && a.status === 'Active')
    : [];
  const [selectedId, setSelectedId] = useState(alerts[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const utilWfStatus = wm.getWorkflowStatus('utilization-escalation', patient.id);

  const handleConfirm = () => {
    if (!selectedId) return;
    const alert = alerts.find((a) => a.id === selectedId);
    if (!alert) return;
    if (utilWfStatus === 'idle')
      wm.startWorkflow('utilization-escalation', patient.id, userName, 'care_manager');
    appendAudit('Utilization Alert Acknowledged', patient.name, userName, notes);
    toast.success('Alert Acknowledged', {
      description: `${alert.type} alert for ${patient.name} added to care manager queue.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Acknowledge Alert"
      subtitle={patient.name}
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

// ─── Review HCC Evidence Modal ────────────────────────────────────────────────

function ReviewHCCEvidenceModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id);
  const reviewable = hccSuspects.filter(
    (h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed'
  );
  const [selectedId, setSelectedId] = useState(reviewable[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const hccWfStatus = wm.getWorkflowStatus('hcc-confirmation', patient.id);
  const suspect = reviewable.find((h) => h.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !suspect) return;
    if (hccWfStatus === 'idle')
      wm.startWorkflow('hcc-confirmation', patient.id, userName, 'care_manager');
    else if (hccWfStatus === 'in-progress')
      wm.advanceStep('hcc-confirmation', patient.id, userName, 'care_manager', notes);
    appendAudit('HCC Evidence Reviewed', patient.name, userName, notes);
    toast.success('HCC Evidence Reviewed', {
      description: `Evidence for ${suspect.hccCode} reviewed. Ready for physician escalation.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Review HCC Evidence"
      subtitle={patient.name}
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

// ─── Assign Intervention Modal ────────────────────────────────────────────────

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

function AssignInterventionModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const [interventionType, setInterventionType] = useState(INTERVENTION_TYPES[0]);
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const utilWfStatus = wm.getWorkflowStatus('utilization-escalation', patient.id);

  const handleConfirm = () => {
    if (utilWfStatus === 'in-progress')
      wm.advanceStep('utilization-escalation', patient.id, userName, 'care_manager', notes);
    else if (utilWfStatus === 'idle')
      wm.startWorkflow('utilization-escalation', patient.id, userName, 'care_manager');
    appendAudit(
      'Intervention Assigned',
      patient.name,
      userName,
      `${interventionType} → ${assignedTo}`
    );
    toast.success('Intervention Assigned', {
      description: `${interventionType} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Intervention"
      subtitle={patient.name}
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

// ─── Escalate HCC Modal ───────────────────────────────────────────────────────

const PHYSICIANS = ['Dr. James Whitfield', 'Dr. Sarah Nakamura', 'Dr. Anil Patel'];

function EscalateHCCModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id);
  const escalatable = hccSuspects.filter(
    (h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed'
  );
  const [selectedId, setSelectedId] = useState(escalatable[0]?.id ?? '');
  const [physician, setPhysician] = useState(PHYSICIANS[0]);
  const [notes, setNotes] = useState('');
  const hccWfStatus = wm.getWorkflowStatus('hcc-confirmation', patient.id);
  const suspect = escalatable.find((h) => h.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !suspect) return;
    if (hccWfStatus === 'in-progress')
      wm.advanceStep('hcc-confirmation', patient.id, userName, 'care_manager', notes);
    else if (hccWfStatus === 'idle')
      wm.startWorkflow('hcc-confirmation', patient.id, userName, 'care_manager');
    appendAudit('HCC Escalated to Physician', patient.name, userName, `Escalated to ${physician}`);
    toast.success('HCC Escalated to Physician', {
      description: `${suspect.hccCode} routed to ${physician} for clinical review.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Escalate HCC to Physician"
      subtitle={patient.name}
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

// ─── Escalate ER Risk Modal ───────────────────────────────────────────────────

const ER_PROTOCOLS = [
  'Transitional Care Management',
  'Emergency Care Coordination',
  'Rapid Response Outreach',
  'Hospitalist Notification',
  'SNF Readmission Prevention',
  'Palliative Care Escalation',
];

function EscalateERRiskModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patient.id && a.status === 'Active')
    : [];
  const criticalAlerts = alerts.filter((a) => a.tier === 'Critical' || a.tier === 'Important');
  const displayAlerts = criticalAlerts.length > 0 ? criticalAlerts : alerts;
  const [selectedId, setSelectedId] = useState(displayAlerts[0]?.id ?? '');
  const [protocol, setProtocol] = useState(ER_PROTOCOLS[0]);
  const [notes, setNotes] = useState('');
  const utilWfStatus = wm.getWorkflowStatus('utilization-escalation', patient.id);

  const handleConfirm = () => {
    if (utilWfStatus === 'in-progress')
      wm.advanceStep('utilization-escalation', patient.id, userName, 'care_manager', notes);
    else if (utilWfStatus === 'idle')
      wm.startWorkflow('utilization-escalation', patient.id, userName, 'care_manager');
    appendAudit('ER Risk Escalated', patient.name, userName, `Protocol: ${protocol}`);
    toast.error('ER Risk Escalated', {
      description: `${protocol} protocol initiated for ${patient.name}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Escalate ER Risk"
      subtitle={patient.name}
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

// ─── Assign Care Gap Modal ────────────────────────────────────────────────────

function AssignCareGapModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patient.id && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const careGapWfStatus = wm.getWorkflowStatus('care-gap-closure', patient.id);
  const gap = careGaps.find((g) => g.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    if (careGapWfStatus === 'idle')
      wm.startWorkflow('care-gap-closure', patient.id, userName, 'care_manager');
    appendAudit('Care Gap Assigned', patient.name, userName, `${gap.measureName} → ${assignedTo}`);

    // ── FHIR Task POST (fire-and-forget) ────────────────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[patient.id] ?? patient.id;
      const taskId = `task-gap-assign-${patient.id}-${selectedId}-${Date.now()}`;
      getFhirClient()
        .create({
          resourceType: 'Task',
          id: taskId,
          status: 'requested',
          intent: 'order',
          priority: priority.toLowerCase() as 'routine' | 'urgent' | 'stat',
          code: {
            coding: [{ system: 'http://loinc.org', code: '18776-5', display: 'Plan of care note' }],
            text: 'Care Gap Assignment',
          },
          description: `Assign care gap: ${gap.measureName}`,
          for: { reference: `Patient/${fhirPatientId}` },
          authoredOn: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          requester: { display: userName },
          owner: { display: assignedTo },
          ...(dueDate ? { restriction: { period: { end: dueDate } } } : {}),
          note: notes ? [{ text: notes }] : undefined,
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id',
              valueString: selectedId,
            },
          ],
        })
        .then(() => console.info(`[Task] Care gap assignment task created for gap ${selectedId}`))
        .catch((err) => console.warn('[Task] AssignCareGap POST failed:', err));
    }

    toast.success('Care Gap Assigned', {
      description: `${gap.measureName} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Care Gap"
      subtitle={patient.name}
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

// ─── Dismiss Alert Modal ──────────────────────────────────────────────────────

const DISMISS_REASONS = [
  'Clinically not applicable',
  'Patient already receiving intervention',
  'Duplicate alert',
  'Patient declined intervention',
  'Resolved prior to review',
  'Outside care scope',
];

function DismissAlertModal({ patient, onClose, userName }: BaseModalProps) {
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patient.id && a.status === 'Active')
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
    appendAudit('Utilization Alert Dismissed', patient.name, userName, `Reason: ${reason}`);
    toast.info('Alert Dismissed', {
      description: `${alert.type} alert dismissed. Reason: ${reason}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Dismiss Alert"
      subtitle={patient.name}
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

// ─── Initiate Outreach Modal ──────────────────────────────────────────────────

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

function InitiateOutreachModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const [outreachType, setOutreachType] = useState(OUTREACH_TYPES[0]);
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const careGapWfStatus = wm.getWorkflowStatus('care-gap-closure', patient.id);

  const handleConfirm = () => {
    if (careGapWfStatus === 'in-progress')
      wm.advanceStep('care-gap-closure', patient.id, userName, 'care_manager', notes);
    else if (careGapWfStatus === 'idle')
      wm.startWorkflow('care-gap-closure', patient.id, userName, 'care_manager');
    appendAudit(
      'Patient Outreach Initiated',
      patient.name,
      userName,
      `${outreachType} → ${assignedTo}`
    );

    // ── FHIR Communication POST (fire-and-forget) ────────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[patient.id] ?? patient.id;
      getFhirClient()
        .create({
          resourceType: 'Communication',
          status: 'in-progress',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                  code: 'notification',
                  display: 'Notification',
                },
              ],
            },
          ],
          subject: { reference: `Patient/${fhirPatientId}` },
          recipient: [{ reference: `Patient/${fhirPatientId}` }],
          sender: { display: userName },
          sent: new Date().toISOString(),
          ...(scheduledDate ? { received: scheduledDate } : {}),
          payload: [{ contentString: `${outreachType}${notes ? ' — ' + notes : ''}` }],
          note: [{ text: `Assigned to: ${assignedTo}. Type: ${outreachType}.` }],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/outreach-type',
              valueString: outreachType,
            },
          ],
        })
        .then(() =>
          console.info(`[Communication] Outreach record created for patient ${fhirPatientId}`)
        )
        .catch((err) => console.warn('[Communication] InitiateOutreach POST failed:', err));
    }

    toast.success('Outreach Initiated', {
      description: `${outreachType} scheduled for ${patient.name}. Assigned to ${assignedTo}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Initiate Patient Outreach"
      subtitle={patient.name}
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

// ─── Close Care Gap Modal ─────────────────────────────────────────────────────

const CLOSURE_METHODS = [
  'Service Rendered — Documented in EHR',
  'Lab Result Received',
  'Attestation by Physician',
  'Claims Data Confirmed',
  'Patient Self-Report with Documentation',
  'Screening Completed',
];

function CloseCareGapModal({ patient, onClose, userName, wm }: BaseModalProps) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patient.id && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [closureMethod, setClosureMethod] = useState(CLOSURE_METHODS[0]);
  const [closureDate, setClosureDate] = useState('');
  const [notes, setNotes] = useState('');
  const careGapWfStatus = wm.getWorkflowStatus('care-gap-closure', patient.id);
  const gap = careGaps.find((g) => g.id === selectedId);
  const gapClosureStore = useGapClosureStore();

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    if (careGapWfStatus === 'in-progress')
      wm.completeWorkflow('care-gap-closure', patient.id, userName, 'care_manager', notes);
    else if (careGapWfStatus === 'idle') {
      wm.startWorkflow('care-gap-closure', patient.id, userName, 'care_manager');
      wm.completeWorkflow('care-gap-closure', patient.id, userName, 'care_manager', notes);
    }
    appendAudit('Care Gap Closed', patient.name, userName, `${gap.measureName} — ${closureMethod}`);

    // ── Submit to GapClosureStore (posts FHIR Observation + Task in live mode) ─
    gapClosureStore.submitClosure({
      gapId: selectedId,
      status: 'CLOSED',
      closedAt: closureDate ? new Date(closureDate).toISOString() : new Date().toISOString(),
      closedFrom: 'PATIENT_DETAIL',
      dateOfService: closureDate || undefined,
      performingProvider: userName,
    });

    // ── FHIR Task PUT → completed (fire-and-forget) ──────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[patient.id] ?? patient.id;
      const taskId = `patient-${fhirPatientId}-task-${selectedId}`;
      getFhirClient()
        .update({
          resourceType: 'Task',
          id: taskId,
          status: 'completed',
          intent: 'order',
          for: { reference: `Patient/${fhirPatientId}` },
          lastModified: new Date().toISOString(),
          note: notes ? [{ text: notes }] : undefined,
          output: [
            {
              type: { text: 'Closure Method' },
              valueString: closureMethod,
            },
          ],
        })
        .then(() => console.info(`[Task] ${taskId} → completed`))
        .catch(() => {
          /* task may not exist yet — silently ignore */
        });
    }

    toast.success('Care Gap Closed', {
      description: `${gap.measureName} closed via ${closureMethod}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Close Care Gap"
      subtitle={patient.name}
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

// ─── Defer Gap Modal ──────────────────────────────────────────────────────────

const DEFER_REASONS = [
  'Patient medically unstable',
  'Patient declined — documented',
  'Awaiting specialist clearance',
  'Insurance authorization pending',
  'Scheduling constraints',
  'Clinical contraindication',
];

function DeferGapModal({ patient, onClose, userName }: BaseModalProps) {
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patient.id && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const [selectedId, setSelectedId] = useState(careGaps[0]?.id ?? '');
  const [reason, setReason] = useState(DEFER_REASONS[0]);
  const [deferUntil, setDeferUntil] = useState('');
  const [notes, setNotes] = useState('');
  const gap = careGaps.find((g) => g.id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || !gap) return;
    appendAudit('Care Gap Deferred', patient.name, userName, `${gap.measureName} — ${reason}`);
    toast.info('Care Gap Deferred', {
      description: `${gap.measureName} deferred. Reason: ${reason}.`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Defer Care Gap"
      subtitle={patient.name}
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

// ─── Assign Task Modal ────────────────────────────────────────────────────────

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

function AssignTaskModal({ patient, onClose, userName }: BaseModalProps) {
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState(CARE_TEAM[0]);
  const [priority, setPriority] = useState('High');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    appendAudit(
      'Task Assigned',
      patient.name,
      userName,
      `${taskType} → ${assignedTo} (${priority})`
    );
    toast.success('Task Assigned', {
      description: `${taskType} assigned to ${assignedTo} (${priority} priority).`,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Assign Task"
      subtitle={patient.name}
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface PatientRowActionsProps {
  patient: Patient;
}

export default function PatientRowActions({ patient }: PatientRowActionsProps) {
  const { user } = useAppContext();
  const wm = useWorkflowMachine();

  const [activeModal, setActiveModal] = useState<ActionModalType>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Per-patient data
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id);
  const careGaps = mockCareGaps
    ? mockCareGaps.filter(
        (g) => g.patientId === patient.id && (g.status === 'Open' || g.status === 'In Progress')
      )
    : [];
  const alerts = mockAlerts
    ? mockAlerts.filter((a) => a.patientId === patient.id && a.status === 'Active')
    : [];

  const openModal = useCallback((type: ActionModalType) => {
    setMenuOpen(false);
    setActiveModal(type);
  }, []);

  const closeModal = useCallback(() => setActiveModal(null), []);

  // Workflow status indicators
  const hccWfStatus = wm.getWorkflowStatus('hcc-confirmation', patient.id);
  const careGapWfStatus = wm.getWorkflowStatus('care-gap-closure', patient.id);
  const utilWfStatus = wm.getWorkflowStatus('utilization-escalation', patient.id);

  // Export patient report
  const handleExportPatientReport = useCallback(() => {
    const hccList = hccSuspects.map((h) => [
      h.hccCode,
      h.hccDescription,
      h.status,
      `+${h.estimatedRafDelta.toFixed(3)}`,
      `$${h.estimatedRevenueDelta.toLocaleString()}`,
      `${Math.round(h.suspectConfidence * 100)}%`,
    ]);

    generatePDFReport({
      reportTitle: `Patient Summary — ${patient.name}`,
      subtitle: `MRN: ${patient.mrn} · ${patient.payer}`,
      generatedBy: user.name,
      sections: [
        {
          title: 'Demographics & Attribution',
          rows: [
            { label: 'Patient Name', value: patient.name },
            { label: 'MRN', value: patient.mrn },
            { label: 'DOB', value: patient.dob },
            { label: 'Age / Gender', value: `${patient.age}y ${patient.gender}` },
            { label: 'Phone', value: patient.phone },
            { label: 'Address', value: patient.address },
            { label: 'Payer', value: patient.payer },
            { label: 'Insurance ID', value: patient.insuranceId },
            { label: 'Attribution Status', value: patient.attributionStatus },
            { label: 'Enrollment Date', value: patient.enrollmentDate },
            { label: 'PCP', value: patient.primaryCareProvider },
          ],
        },
        {
          title: 'Risk & Quality',
          rows: [
            { label: 'Risk Tier', value: patient.riskTier },
            {
              label: 'RAF Score',
              value: `${patient.rafScore.toFixed(2)} (Δ ${patient.rafScoreDelta >= 0 ? '+' : ''}${patient.rafScoreDelta.toFixed(2)})`,
            },
            {
              label: 'Predicted ER Risk (30d)',
              value: `${Math.round(patient.predictedErRisk * 100)}%`,
            },
            {
              label: 'Open HCC Suspects',
              value: `${patient.openHCCSuspects} (est. $${patient.hccSuspectValue.toLocaleString()})`,
            },
            { label: 'Open Care Gaps', value: String(patient.openCareGaps) },
            { label: 'Active Alerts', value: String(patient.activeAlerts) },
            { label: 'Care Plan Status', value: patient.carePlanStatus },
          ],
        },
        {
          title: 'Financial',
          rows: [
            { label: 'PMPM Cost', value: `$${patient.pmpmCost.toLocaleString()}` },
            { label: 'PMPM Target', value: `$${patient.pmpmTarget.toLocaleString()}` },
            {
              label: 'Variance',
              value: `$${(patient.pmpmCost - patient.pmpmTarget).toLocaleString()}`,
            },
            { label: 'Last Contact', value: patient.lastContactDate },
          ],
        },
      ],
      tableHeaders:
        hccList.length > 0
          ? ['HCC Code', 'Description', 'Status', 'RAF Δ', 'Est. Revenue', 'Confidence']
          : undefined,
      tableRows: hccList.length > 0 ? hccList : undefined,
    });

    appendAudit('Patient Report Exported', patient.name, user.name);
    toast.success('Patient Report Generated', {
      description: `PDF summary for ${patient.name} opened in new window.`,
    });
  }, [patient, hccSuspects, user]);

  // Action menu items
  interface ActionItem {
    id: ActionModalType | 'export';
    label: string;
    icon: string;
    color: string;
    disabled?: boolean;
    disabledReason?: string;
    dividerBefore?: boolean;
  }

  const actionItems: ActionItem[] = [
    {
      id: 'surface-hcc',
      label: 'Surface HCC Suspect',
      icon: 'MagnifyingGlassCircleIcon',
      color: '#b45309',
      disabled: hccSuspects.filter((h) => h.status === 'Surfaced').length === 0,
      disabledReason: 'No surfaceable HCC suspects',
    },
    {
      id: 'review-hcc-evidence',
      label: 'Review HCC Evidence',
      icon: 'DocumentMagnifyingGlassIcon',
      color: '#0f62fe',
      disabled:
        hccSuspects.filter((h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed')
          .length === 0,
      disabledReason: 'No HCC suspects in review state',
    },
    {
      id: 'escalate-hcc',
      label: 'Escalate HCC',
      icon: 'ArrowUpCircleIcon',
      color: '#b45309',
      disabled:
        hccSuspects.filter((h) => h.status === 'Surfaced' || h.status === 'Evidence Reviewed')
          .length === 0,
      disabledReason: 'No HCC suspects ready for escalation',
    },
    {
      id: 'acknowledge-alert',
      label: 'Acknowledge Alert',
      icon: 'EyeIcon',
      color: '#da1e28',
      dividerBefore: true,
      disabled: alerts.length === 0,
      disabledReason: 'No active alerts',
    },
    {
      id: 'assign-intervention',
      label: 'Assign Intervention',
      icon: 'ClipboardDocumentListIcon',
      color: '#b45309',
      disabled: alerts.length === 0,
      disabledReason: 'No active alerts',
    },
    {
      id: 'escalate-er',
      label: 'Escalate ER Risk',
      icon: 'ExclamationTriangleIcon',
      color: '#da1e28',
      disabled: alerts.length === 0,
      disabledReason: 'No active alerts',
    },
    {
      id: 'dismiss-alert',
      label: 'Dismiss Alert',
      icon: 'XMarkIcon',
      color: '#6f6f6f',
      disabled: alerts.length === 0,
      disabledReason: 'No active alerts',
    },
    {
      id: 'assign-care-gap',
      label: 'Assign Care Gap',
      icon: 'ClipboardDocumentCheckIcon',
      color: '#0043ce',
      dividerBefore: true,
      disabled: careGaps.length === 0,
      disabledReason: 'No open care gaps',
    },
    {
      id: 'initiate-outreach',
      label: 'Initiate Patient Outreach',
      icon: 'PhoneIcon',
      color: '#0f62fe',
      disabled: false,
    },
    {
      id: 'close-care-gap',
      label: 'Close Care Gap',
      icon: 'CheckCircleIcon',
      color: '#24a148',
      disabled: careGaps.length === 0,
      disabledReason: 'No open care gaps',
    },
    {
      id: 'defer-gap',
      label: 'Defer Gap',
      icon: 'ClockIcon',
      color: '#6f6f6f',
      disabled: careGaps.length === 0,
      disabledReason: 'No open care gaps',
    },
    {
      id: 'assign-task',
      label: 'Assign Task',
      icon: 'ClipboardDocumentListIcon',
      color: '#0f62fe',
      dividerBefore: true,
    },
    { id: 'export', label: 'Export Patient Report', icon: 'ArrowDownTrayIcon', color: '#393939' },
  ];

  const wfIndicators = [
    { type: 'hcc-confirmation' as const, status: hccWfStatus, label: 'HCC', color: '#b45309' },
    { type: 'care-gap-closure' as const, status: careGapWfStatus, label: 'Gap', color: '#0043ce' },
    {
      type: 'utilization-escalation' as const,
      status: utilWfStatus,
      label: 'Alert',
      color: '#da1e28',
    },
  ].filter((w) => w.status !== 'idle');

  const modalProps: BaseModalProps = { patient, onClose: closeModal, userName: user.name, wm };

  return (
    <>
      {/* Action Menu */}
      <div className="relative">
        <div className="flex items-center gap-1">
          {wfIndicators.map((w) => (
            <div
              key={w.type}
              title={`${w.label} workflow: ${w.status}`}
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: w.color }}
            />
          ))}
          <button
            title="Patient actions"
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-blue hover:bg-[#d0e2ff] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <Icon name="EllipsisVerticalIcon" size={14} />
          </button>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-carbon-gray-20 shadow-2xl w-56 py-1">
              <p className="px-3 py-1.5 text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide border-b border-carbon-gray-20">
                {patient.name}
              </p>
              {actionItems.map((item) => (
                <React.Fragment key={item.id}>
                  {item.dividerBefore && <div className="border-t border-carbon-gray-20 my-1" />}
                  <button
                    disabled={item.disabled}
                    title={item.disabled ? item.disabledReason : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
                      item.disabled
                        ? 'text-carbon-gray-30 cursor-not-allowed'
                        : 'text-carbon-gray-100 hover:bg-carbon-gray-10'
                    }`}
                    onClick={() => {
                      if (item.disabled) return;
                      if (item.id === 'export') {
                        setMenuOpen(false);
                        handleExportPatientReport();
                      } else {
                        openModal(item.id as ActionModalType);
                      }
                    }}
                  >
                    <Icon
                      name={item.icon as any}
                      size={13}
                      className="flex-shrink-0"
                      style={{ color: item.disabled ? '#c6c6c6' : item.color }}
                    />
                    <span>{item.label}</span>
                    {item.disabled && (
                      <Icon
                        name="LockClosedIcon"
                        size={10}
                        className="ml-auto text-carbon-gray-30"
                      />
                    )}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals — rendered as stable top-level components */}
      {activeModal === 'surface-hcc' && <SurfaceHCCModal {...modalProps} />}
      {activeModal === 'acknowledge-alert' && <AcknowledgeAlertModal {...modalProps} />}
      {activeModal === 'review-hcc-evidence' && <ReviewHCCEvidenceModal {...modalProps} />}
      {activeModal === 'assign-intervention' && <AssignInterventionModal {...modalProps} />}
      {activeModal === 'escalate-hcc' && <EscalateHCCModal {...modalProps} />}
      {activeModal === 'escalate-er' && <EscalateERRiskModal {...modalProps} />}
      {activeModal === 'assign-care-gap' && <AssignCareGapModal {...modalProps} />}
      {activeModal === 'dismiss-alert' && <DismissAlertModal {...modalProps} />}
      {activeModal === 'initiate-outreach' && <InitiateOutreachModal {...modalProps} />}
      {activeModal === 'close-care-gap' && <CloseCareGapModal {...modalProps} />}
      {activeModal === 'defer-gap' && <DeferGapModal {...modalProps} />}
      {activeModal === 'assign-task' && <AssignTaskModal {...modalProps} />}
    </>
  );
}
