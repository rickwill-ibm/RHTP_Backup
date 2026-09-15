'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';
import type { UtilizationAlert } from '@/lib/mockData';

// ─── Step Indicator ───────────────────────────────────────────────────────────
interface StepIndicatorProps {
  steps: { step: number; label: string; description: string; requiredRole: string }[];
  currentStep: number;
  status: string;
}

function StepIndicator({ steps, currentStep, status }: StepIndicatorProps) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-1">
      {steps.map((s, idx) => {
        const isCompleted =
          status === 'completed' || (status !== 'rejected' && s.step < currentStep);
        const isActive = s.step === currentStep && status !== 'completed' && status !== 'rejected';
        const isRejected = status === 'rejected' && s.step === currentStep;

        return (
          <div key={s.step} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-all
                ${
                  isCompleted
                    ? 'bg-[#24a148] border-[#24a148] text-white'
                    : isActive
                      ? 'bg-[#da1e28] border-[#da1e28] text-white'
                      : isRejected
                        ? 'bg-[#b45309] border-[#b45309] text-white'
                        : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                }`}
              >
                {isCompleted ? (
                  <Icon name="CheckIcon" size={12} />
                ) : isRejected ? (
                  <Icon name="XMarkIcon" size={12} />
                ) : (
                  s.step
                )}
              </div>
              <div className="mt-1.5 text-center px-1">
                <p
                  className={`text-2xs font-semibold leading-tight ${
                    isActive
                      ? 'text-[#da1e28]'
                      : isCompleted
                        ? 'text-[#24a148]'
                        : isRejected
                          ? 'text-[#b45309]'
                          : 'text-carbon-gray-50'
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-2xs text-carbon-gray-30 mt-0.5 hidden sm:block leading-tight">
                  {s.requiredRole === 'care_manager' ? 'Care Mgr' : 'Physician'}
                </p>
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mt-3.5 mx-1 transition-all ${isCompleted ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Alert Summary Card ───────────────────────────────────────────────────────
function AlertSummaryCard({ alert }: { alert: UtilizationAlert }) {
  const tierColors: Record<string, string> = {
    Critical: 'bg-[#fff1f1] border-[#da1e28] text-[#da1e28]',
    Important: 'bg-[#fdf6dd] border-[#f1c21b] text-[#b45309]',
    Informational: 'bg-[#d0e2ff] border-[#97c1ff] text-[#0043ce]',
  };
  const riskPct = Math.round(alert.riskScore * 100);
  return (
    <div className={`border p-4 ${tierColors[alert.tier] ?? 'border-carbon-gray-20 bg-white'}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-2xs font-semibold px-2 py-0.5 border ${tierColors[alert.tier]}`}>
              {alert.tier}
            </span>
            <span className="text-2xs font-mono text-carbon-gray-50">{alert.source}</span>
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">{alert.type}</p>
          <p className="text-xs text-carbon-gray-70 mt-0.5">{alert.description}</p>
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <div>
            <p className="text-2xs text-carbon-gray-50">Risk Score</p>
            <p
              className={`font-mono text-base font-bold ${riskPct >= 70 ? 'text-[#da1e28]' : riskPct >= 40 ? 'text-[#b45309]' : 'text-[#24a148]'}`}
            >
              {riskPct > 0 ? `${riskPct}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50">Est. Cost</p>
            <p className="font-mono text-sm font-bold text-[#da1e28]">
              ${alert.estimatedCost.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-2xs text-carbon-gray-50">
        <span>
          Created: <span className="font-mono text-carbon-gray-70">{alert.createdDate}</span>
        </span>
        <span>
          Status:{' '}
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
        </span>
      </div>
    </div>
  );
}

// ─── Intervention Options ─────────────────────────────────────────────────────
const INTERVENTION_PROTOCOLS = [
  {
    id: 'int-home-health',
    label: 'Home Health Authorization',
    description: 'Authorize post-discharge home health visits to prevent readmission',
  },
  {
    id: 'int-care-mgr-call',
    label: 'Care Manager Outreach Call',
    description: 'Schedule urgent care manager call within 24 hours',
  },
  {
    id: 'int-med-reconcile',
    label: 'Medication Reconciliation',
    description: 'Pharmacist-led medication review and reconciliation',
  },
  {
    id: 'int-pcp-visit',
    label: 'Urgent PCP Visit',
    description: 'Schedule urgent primary care visit within 48–72 hours',
  },
  {
    id: 'int-er-diversion',
    label: 'ER Diversion Protocol',
    description: 'Activate ER diversion — direct patient to urgent care or telehealth',
  },
  {
    id: 'int-snf-coord',
    label: 'SNF Coordination',
    description: 'Coordinate skilled nursing facility placement to avoid acute admission',
  },
];

const OUTCOME_OPTIONS = [
  {
    id: 'out-resolved',
    label: 'Risk Resolved',
    description: 'Intervention successful — risk mitigated, no ER/admission occurred',
  },
  {
    id: 'out-partial',
    label: 'Partially Resolved',
    description: 'Risk reduced but ongoing monitoring required',
  },
  {
    id: 'out-escalated',
    label: 'Escalated to Physician',
    description: 'Clinical complexity requires physician review and order',
  },
  {
    id: 'out-admitted',
    label: 'Patient Admitted',
    description: 'Patient was admitted — document for readmission review',
  },
  {
    id: 'out-er-visit',
    label: 'ER Visit Occurred',
    description: 'ER visit occurred — document for avoidable admission analysis',
  },
  {
    id: 'out-refused',
    label: 'Patient Declined',
    description: 'Patient declined intervention — document refusal and reason',
  },
];

// ─── Step 1: Surface Risk ─────────────────────────────────────────────────────
interface Step1Props {
  alert: UtilizationAlert;
  onAcknowledge: (notes: string) => void;
}

function Step1SurfaceRisk({ alert, onAcknowledge }: Step1Props) {
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'immediate' | '24h' | '48h'>('immediate');

  const riskPct = Math.round(alert.riskScore * 100);
  const riskFactors = [
    riskPct >= 70 && 'High predicted ER risk score',
    alert.tier === 'Critical' && 'Critical alert tier — immediate action required',
    alert.type === 'Avoidable Admission' && 'Active admission — readmission risk elevated',
    alert.type === 'Predicted ER Risk' && 'Predictive model flagged within 30-day window',
    alert.estimatedCost > 5000 &&
      `High estimated cost impact: $${alert.estimatedCost.toLocaleString()}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="bg-[#fff8f8] border border-[#da1e28]/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-[#da1e28] flex items-center justify-center flex-shrink-0">
            <Icon name="BellAlertIcon" size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">
              Risk Surfaced — Action Required
            </p>
            <p className="text-xs text-carbon-gray-70 mt-0.5">
              This alert has been surfaced to the care management queue. Acknowledge to begin the
              escalation workflow.
            </p>
          </div>
        </div>
      </div>

      {riskFactors.length > 0 && (
        <div>
          <p className="carbon-label mb-2">Risk Factors Identified</p>
          <ul className="space-y-1.5">
            {riskFactors.map((factor, i) => (
              <li key={`rf-${i}`} className="flex items-start gap-2 text-xs text-carbon-gray-70">
                <Icon
                  name="ExclamationTriangleIcon"
                  size={12}
                  className="text-[#da1e28] mt-0.5 flex-shrink-0"
                />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="carbon-label mb-2">Response Priority</p>
        <div className="flex gap-2">
          {(
            [
              {
                id: 'immediate',
                label: 'Immediate (< 4h)',
                color: 'border-[#da1e28] bg-[#fff1f1] text-[#da1e28]',
              },
              {
                id: '24h',
                label: 'Urgent (24h)',
                color: 'border-[#f1c21b] bg-[#fdf6dd] text-[#b45309]',
              },
              {
                id: '48h',
                label: 'Routine (48h)',
                color: 'border-carbon-gray-30 bg-white text-carbon-gray-70',
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPriority(opt.id)}
              className={`flex-1 py-2 px-3 text-xs font-semibold border-2 transition-colors
                ${priority === opt.id ? opt.color : 'border-carbon-gray-20 bg-white text-carbon-gray-50 hover:border-carbon-gray-30'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Acknowledgement Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Document initial assessment, relevant clinical context, or care team communication..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      <button
        onClick={() =>
          onAcknowledge(
            `Priority: ${priority === 'immediate' ? 'Immediate (<4h)' : priority === '24h' ? 'Urgent (24h)' : 'Routine (48h)'}. ${notes}`
          )
        }
        className="carbon-btn-primary w-full justify-center py-2.5 text-sm"
      >
        <Icon name="CheckCircleIcon" size={16} />
        Acknowledge Alert &amp; Surface Risk
      </button>
    </div>
  );
}

// ─── Step 2: Assign Intervention ──────────────────────────────────────────────
interface Step2Props {
  onAssign: (notes: string) => void;
}

function Step2AssignIntervention({ onAssign }: Step2Props) {
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState('Sarah Johnson');
  const [dueDate, setDueDate] = useState('2026-04-17');
  const [notes, setNotes] = useState('');

  const canProceed = selectedProtocol && assignedTo;

  return (
    <div className="space-y-4">
      <div>
        <p className="carbon-label mb-2">Select Intervention Protocol</p>
        <div className="space-y-2">
          {INTERVENTION_PROTOCOLS.map((protocol) => (
            <button
              key={protocol.id}
              onClick={() => setSelectedProtocol(protocol.id)}
              className={`w-full text-left p-3 border transition-colors
                ${
                  selectedProtocol === protocol.id
                    ? 'border-[#0f62fe] bg-[#edf5ff]'
                    : 'border-carbon-gray-20 bg-white hover:border-carbon-gray-30 hover:bg-carbon-gray-10'
                }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center
                  ${selectedProtocol === protocol.id ? 'border-[#0f62fe] bg-[#0f62fe]' : 'border-carbon-gray-30'}`}
                >
                  {selectedProtocol === protocol.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">{protocol.label}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">{protocol.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="carbon-label mb-1.5 block">Assign To</label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
          />
        </div>
        <div>
          <label className="carbon-label mb-1.5 block">Target Completion</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
          />
        </div>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Intervention Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Document intervention rationale, care team coordination, or patient-specific considerations..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      <button
        onClick={() => {
          const protocol = INTERVENTION_PROTOCOLS.find((p) => p.id === selectedProtocol);
          onAssign(
            `Protocol: ${protocol?.label ?? selectedProtocol}. Assigned to: ${assignedTo}. Due: ${dueDate}. ${notes}`
          );
        }}
        disabled={!canProceed}
        className="carbon-btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="UserPlusIcon" size={16} />
        Assign Intervention Protocol
      </button>
    </div>
  );
}

// ─── Step 3: Document Outcome ─────────────────────────────────────────────────
interface Step3Props {
  onDocument: (notes: string) => void;
}

function Step3DocumentOutcome({ onDocument }: Step3Props) {
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [contactDate, setContactDate] = useState('2026-04-16');
  const [contactMethod, setContactMethod] = useState<
    'phone' | 'in-person' | 'telehealth' | 'portal'
  >('phone');
  const [patientResponse, setPatientResponse] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const canProceed = selectedOutcome && patientResponse;

  return (
    <div className="space-y-4">
      <div>
        <p className="carbon-label mb-2">Intervention Outcome</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OUTCOME_OPTIONS.map((outcome) => (
            <button
              key={outcome.id}
              onClick={() => setSelectedOutcome(outcome.id)}
              className={`text-left p-3 border transition-colors
                ${
                  selectedOutcome === outcome.id
                    ? 'border-[#0f62fe] bg-[#edf5ff]'
                    : 'border-carbon-gray-20 bg-white hover:border-carbon-gray-30 hover:bg-carbon-gray-10'
                }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center
                  ${selectedOutcome === outcome.id ? 'border-[#0f62fe] bg-[#0f62fe]' : 'border-carbon-gray-30'}`}
                >
                  {selectedOutcome === outcome.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-carbon-gray-100">{outcome.label}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5 leading-tight">
                    {outcome.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="carbon-label mb-1.5 block">Contact Date</label>
          <input
            type="date"
            value={contactDate}
            onChange={(e) => setContactDate(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
          />
        </div>
        <div>
          <label className="carbon-label mb-1.5 block">Contact Method</label>
          <select
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value as typeof contactMethod)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white"
          >
            <option value="phone">Phone Call</option>
            <option value="in-person">In-Person Visit</option>
            <option value="telehealth">Telehealth</option>
            <option value="portal">Patient Portal</option>
          </select>
        </div>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Patient Response / Engagement</label>
        <textarea
          value={patientResponse}
          onChange={(e) => setPatientResponse(e.target.value)}
          rows={2}
          placeholder="Describe patient's response to intervention, engagement level, barriers identified..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Clinical Documentation Notes</label>
        <textarea
          value={clinicalNotes}
          onChange={(e) => setClinicalNotes(e.target.value)}
          rows={3}
          placeholder="Document clinical observations, follow-up plan, care coordination actions taken..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      <button
        onClick={() => {
          const outcome = OUTCOME_OPTIONS.find((o) => o.id === selectedOutcome);
          onDocument(
            `Outcome: ${outcome?.label ?? selectedOutcome}. Contact: ${contactMethod} on ${contactDate}. Patient response: ${patientResponse}. ${clinicalNotes}`
          );
        }}
        disabled={!canProceed}
        className="carbon-btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="DocumentCheckIcon" size={16} />
        Document Outcome &amp; Advance
      </button>
    </div>
  );
}

// ─── Step 4: Audit Trail & Close ──────────────────────────────────────────────
interface Step4Props {
  alert: UtilizationAlert;
  stepHistory: {
    step: number;
    label: string;
    completedAt: string;
    completedBy: string;
    completedByRole: string;
    notes?: string;
  }[];
  onClose: (notes: string) => void;
}

function Step4AuditClose({ alert, stepHistory, onClose }: Step4Props) {
  const [closureNotes, setClosureNotes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('2026-04-30');

  return (
    <div className="space-y-4">
      <div className="bg-[#defbe6] border border-[#24a148]/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-[#24a148] flex items-center justify-center flex-shrink-0">
            <Icon name="ClipboardDocumentListIcon" size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">Audit Trail Review</p>
            <p className="text-xs text-carbon-gray-70 mt-0.5">
              Review the complete escalation workflow record before closing. All steps are immutably
              logged.
            </p>
          </div>
        </div>
      </div>

      {/* Audit trail table */}
      <div className="border border-carbon-gray-20 overflow-hidden">
        <div className="px-4 py-2.5 bg-carbon-gray-10 border-b border-carbon-gray-20 flex items-center gap-2">
          <Icon name="ShieldCheckIcon" size={14} className="text-[#24a148]" />
          <p className="text-xs font-semibold text-carbon-gray-100">
            Escalation Audit Record — {alert.type}
          </p>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                <th
                  key={`ah-${h}`}
                  className="px-3 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {/* System-generated alert row */}
            <tr className="bg-carbon-gray-10/50">
              <td className="px-3 py-2.5">
                <div className="w-5 h-5 bg-carbon-gray-50 flex items-center justify-center">
                  <Icon name="BoltIcon" size={9} className="text-white" />
                </div>
              </td>
              <td className="px-3 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                Alert Generated
              </td>
              <td className="px-3 py-2.5 text-carbon-gray-70">System ({alert.source})</td>
              <td className="px-3 py-2.5">
                <span className="text-2xs px-1.5 py-0.5 font-medium bg-carbon-gray-10 text-carbon-gray-50">
                  Automated
                </span>
              </td>
              <td className="px-3 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                {alert.description.substring(0, 60)}...
              </td>
              <td className="px-3 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
                {alert.createdDate}
              </td>
            </tr>
            {stepHistory.map((record, i) => (
              <tr key={`audit-step-${i}`} className="hover:bg-carbon-gray-10">
                <td className="px-3 py-2.5">
                  <div className="w-5 h-5 bg-[#24a148] flex items-center justify-center">
                    <Icon name="CheckIcon" size={9} className="text-white" />
                  </div>
                </td>
                <td className="px-3 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                  {record.label}
                </td>
                <td className="px-3 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`text-2xs px-1.5 py-0.5 font-medium ${record.completedByRole === 'care_manager' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {record.completedByRole === 'care_manager' ? 'Care Manager' : 'Physician'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-carbon-gray-50 max-w-xs truncate">
                  {record.notes ?? '—'}
                </td>
                <td className="px-3 py-2.5 font-mono text-carbon-gray-50 whitespace-nowrap">
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
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="followup-check"
          checked={followUpRequired}
          onChange={(e) => setFollowUpRequired(e.target.checked)}
          className="accent-carbon-blue"
        />
        <label htmlFor="followup-check" className="text-xs text-carbon-gray-70 cursor-pointer">
          Schedule follow-up monitoring
        </label>
        {followUpRequired && (
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
          />
        )}
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Closure Notes</label>
        <textarea
          value={closureNotes}
          onChange={(e) => setClosureNotes(e.target.value)}
          rows={2}
          placeholder="Final closure notes, lessons learned, or recommendations for future similar alerts..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      <button
        onClick={() =>
          onClose(
            `Escalation closed. ${followUpRequired ? `Follow-up scheduled: ${followUpDate}. ` : ''}${closureNotes}`
          )
        }
        className="carbon-btn-primary w-full justify-center py-2.5 text-sm bg-[#24a148] hover:bg-[#1a7a38] border-[#24a148] hover:border-[#1a7a38]"
      >
        <Icon name="ShieldCheckIcon" size={16} />
        Close Escalation &amp; Finalize Audit Trail
      </button>
    </div>
  );
}

// ─── Completed View ───────────────────────────────────────────────────────────
function CompletedView({
  alert,
  stepHistory,
}: {
  alert: UtilizationAlert;
  stepHistory: {
    step: number;
    label: string;
    completedAt: string;
    completedBy: string;
    completedByRole: string;
    notes?: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      <div className="bg-[#defbe6] border border-[#24a148] p-4 flex items-start gap-3">
        <div className="w-8 h-8 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="CheckCircleIcon" size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#0e6027]">Escalation Workflow Completed</p>
          <p className="text-xs text-[#0e6027]/80 mt-0.5">
            All 4 steps completed. Audit trail finalized and immutably recorded.
          </p>
        </div>
      </div>
      <div className="border border-carbon-gray-20 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {['Step', 'Action', 'Completed By', 'Notes', 'Timestamp'].map((h) => (
                <th
                  key={`ch-${h}`}
                  className="px-4 py-2 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {stepHistory.map((record, i) => (
              <tr key={`cstep-${i}`} className="hover:bg-carbon-gray-10">
                <td className="px-4 py-2.5">
                  <div className="w-5 h-5 bg-[#24a148] flex items-center justify-center">
                    <Icon name="CheckIcon" size={9} className="text-white" />
                  </div>
                </td>
                <td className="px-4 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                  {record.label}
                </td>
                <td className="px-4 py-2.5 text-carbon-gray-70">{record.completedBy}</td>
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
      </div>
    </div>
  );
}

// ─── Main Journey Component ───────────────────────────────────────────────────
interface UtilizationEscalationJourneyProps {
  alert: UtilizationAlert;
  onClose: () => void;
}

export default function UtilizationEscalationJourney({
  alert,
  onClose,
}: UtilizationEscalationJourneyProps) {
  const { user } = useAppContext();
  const { getWorkflow, getWorkflowStatus, startWorkflow, advanceStep, completeWorkflow } =
    useWorkflowMachine();

  const wfDef = workflowDefinitions['utilization-escalation'];
  const wf = getWorkflow('utilization-escalation', alert.id);
  const status = getWorkflowStatus('utilization-escalation', alert.id);

  const currentStep = wf?.currentStep ?? 1;
  const stepHistory = wf?.stepHistory ?? [];

  const userName = user?.name ?? 'Sarah Johnson';
  const userRole = user?.role ?? 'care_manager';

  const handleStart = (notes: string) => {
    if (status === 'idle') {
      startWorkflow('utilization-escalation', alert.id, userName, userRole);
    }
    advanceStep('utilization-escalation', alert.id, userName, userRole, notes);
  };

  const handleAdvance = (notes: string) => {
    advanceStep('utilization-escalation', alert.id, userName, userRole, notes);
  };

  const handleComplete = (notes: string) => {
    completeWorkflow('utilization-escalation', alert.id, userName, userRole, notes);
  };

  const statusCfg = {
    idle: {
      cls: 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20',
      label: 'Not Started',
    },
    'in-progress': {
      cls: 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]/30',
      label: `In Progress — Step ${currentStep}/${wfDef.steps.length}`,
    },
    'awaiting-review': {
      cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
      label: 'Awaiting Documentation',
    },
    completed: { cls: 'bg-[#defbe6] text-[#0e6027] border-[#24a148]', label: 'Escalation Closed' },
    rejected: { cls: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]', label: 'Dismissed' },
  } as const;

  const sc = statusCfg[status] ?? statusCfg['idle'];

  return (
    <div className="border border-[#da1e28]/40 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#fff8f8] border-b border-[#da1e28]/20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#da1e28] flex items-center justify-center flex-shrink-0">
            <Icon name="BellAlertIcon" size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">
              Utilization Escalation — {alert.type}
            </p>
            <p className="text-2xs text-carbon-gray-50 font-mono">{wfDef.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-2xs font-semibold px-2.5 py-1 border ${sc.cls}`}>{sc.label}</span>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Alert summary */}
        <AlertSummaryCard alert={alert} />

        {/* Step indicator */}
        <div>
          <p className="carbon-label mb-2">Workflow Progress</p>
          <StepIndicator
            steps={wfDef.steps}
            currentStep={status === 'idle' ? 1 : currentStep}
            status={status === 'idle' ? 'not-started' : status}
          />
        </div>

        {/* Step content */}
        <div className="border-t border-carbon-gray-20 pt-5">
          {status === 'completed' ? (
            <CompletedView alert={alert} stepHistory={stepHistory} />
          ) : (
            <>
              {/* Step header */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-[#da1e28] flex items-center justify-center flex-shrink-0">
                  <span className="text-2xs font-bold text-white">
                    {status === 'idle' ? 1 : currentStep}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-carbon-gray-100">
                    {wfDef.steps[status === 'idle' ? 0 : currentStep - 1]?.label}
                  </p>
                  <p className="text-xs text-carbon-gray-50">
                    {wfDef.steps[status === 'idle' ? 0 : currentStep - 1]?.description}
                  </p>
                </div>
              </div>

              {(status === 'idle' || currentStep === 1) && (
                <Step1SurfaceRisk alert={alert} onAcknowledge={handleStart} />
              )}
              {status !== 'idle' && currentStep === 2 && (
                <Step2AssignIntervention onAssign={handleAdvance} />
              )}
              {status !== 'idle' && currentStep === 3 && (
                <Step3DocumentOutcome onDocument={handleAdvance} />
              )}
              {status !== 'idle' && (currentStep === 4 || status === 'awaiting-review') && (
                <Step4AuditClose alert={alert} stepHistory={stepHistory} onClose={handleComplete} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
