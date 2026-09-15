'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface STARSMeasure {
  id: string;
  measureId: string;
  measureName: string;
  domain: string;
  currentRating: number; // 1-5 stars
  targetRating: number;
  gapCount: number;
  bonusEstimate: number;
  deadline: string;
  contractName: string;
  status: 'open' | 'in-progress' | 'submitted' | 'closed';
}

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
                      ? 'bg-[#b45309] border-[#b45309] text-white'
                      : isRejected
                        ? 'bg-[#da1e28] border-[#da1e28] text-white'
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
                  className={`text-2xs font-semibold leading-tight ${isActive ? 'text-[#b45309]' : isCompleted ? 'text-[#24a148]' : isRejected ? 'text-[#da1e28]' : 'text-carbon-gray-50'}`}
                >
                  {s.label}
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

// ─── Star Rating Display ──────────────────────────────────────────────────────
function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Icon
          key={i}
          name="StarIcon"
          size={14}
          className={i < rating ? 'text-[#b45309]' : 'text-carbon-gray-20'}
        />
      ))}
      <span className="ml-1 text-xs font-mono font-bold text-[#b45309]">{rating.toFixed(1)}</span>
    </div>
  );
}

// ─── Step 1: Identify Gap ─────────────────────────────────────────────────────
function IdentifyGapPanel({
  measure,
  onAdvance,
}: {
  measure: STARSMeasure;
  onAdvance: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#b45309] flex items-center justify-center flex-shrink-0">
          <Icon name="StarIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Identify STARS Measure Gap</p>
      </div>
      <div className="bg-[#fdf6dd] border border-[#f1c21b] p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-[#b45309]">
                {measure.measureId}
              </span>
              <span className="text-xs font-semibold text-carbon-gray-100">
                {measure.measureName}
              </span>
            </div>
            <p className="text-xs text-carbon-gray-50">{measure.domain}</p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">Contract: {measure.contractName}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xs text-carbon-gray-50 mb-0.5">Bonus Estimate</p>
            <p className="font-mono text-base font-bold text-[#24a148]">
              ${measure.bonusEstimate.toLocaleString()}
            </p>
            <p className="text-2xs text-carbon-gray-50 mt-1">Deadline</p>
            <p className="font-mono text-xs font-semibold text-[#da1e28]">{measure.deadline}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#f1c21b]/50">
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-1">Current Rating</p>
            <StarRating rating={measure.currentRating} />
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-1">Target Rating</p>
            <StarRating rating={measure.targetRating} />
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-0.5">Open Gaps</p>
            <p className="font-mono text-base font-bold text-[#da1e28]">{measure.gapCount}</p>
          </div>
        </div>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Gap Identification Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white resize-none"
          placeholder="Document the gap source, affected patient cohort, and estimated bonus impact..."
        />
      </div>
      <button
        onClick={() => notes.trim() && onAdvance(notes)}
        disabled={!notes.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#b45309] text-white text-xs font-semibold hover:bg-[#8a3e07] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="ArrowRightIcon" size={14} />
        Confirm Gap &amp; Advance to Remediation
      </button>
    </div>
  );
}

// ─── Step 2: Remediate Measure ────────────────────────────────────────────────
function RemediateMeasurePanel({
  measure,
  onAdvance,
}: {
  measure: STARSMeasure;
  onAdvance: (data: string) => void;
}) {
  const [assignee, setAssignee] = useState('');
  const [outreachMethod, setOutreachMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const assignees = [
    'Sarah Johnson (Care Manager)',
    'Dr. James Whitfield (Physician)',
    'Quality Team',
    'Pharmacy Team',
    'Patient Outreach Coordinator',
  ];
  const methods = [
    'Phone call — patient contacted',
    'Secure portal message sent',
    'Letter mailed',
    'In-person at encounter',
    'Referral order placed',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#b45309] flex items-center justify-center flex-shrink-0">
          <Icon name="WrenchScrewdriverIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Remediate STARS Measure</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Assign outreach and document remediation actions to close the measure gap and capture the
        payer bonus.
      </p>
      <div>
        <label className="carbon-label mb-1.5 block">
          Assign To <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
        >
          <option value="">Select assignee...</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Outreach Method <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={outreachMethod}
          onChange={(e) => setOutreachMethod(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
        >
          <option value="">Select method...</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">Service / Follow-up Date</label>
        <input
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
        />
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Remediation Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white resize-none"
          placeholder="Document patient response, barriers, scheduled service, and expected closure date..."
        />
      </div>
      <button
        onClick={() =>
          assignee &&
          outreachMethod &&
          notes.trim() &&
          onAdvance(
            `Assigned: ${assignee} | Method: ${outreachMethod}${scheduledDate ? ` | Date: ${scheduledDate}` : ''} | ${notes}`
          )
        }
        disabled={!assignee || !outreachMethod || !notes.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#b45309] text-white text-xs font-semibold hover:bg-[#8a3e07] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="ArrowRightIcon" size={14} />
        Document Remediation &amp; Advance to Submission
      </button>
    </div>
  );
}

// ─── Step 3: Submit to Payer ──────────────────────────────────────────────────
function SubmitToPayerPanel({
  measure,
  onComplete,
}: {
  measure: STARSMeasure;
  onComplete: (notes: string) => void;
}) {
  const [attestation, setAttestation] = useState(false);
  const [submissionRef, setSubmissionRef] = useState('');
  const [notes, setNotes] = useState('');

  const checklist = [
    'STARS measure gap documentation attached',
    'Patient outreach records included',
    'Service completion attestation signed',
    'ICD/CPT codes verified against measure spec',
    'Bonus calculation worksheet attached',
  ];
  const [checked, setChecked] = useState<boolean[]>(checklist.map(() => false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="PaperAirplaneIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Submit Bonus Claim to Payer</p>
      </div>
      <div className="bg-[#defbe6] border border-[#24a148] p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#0e6027]">
            Estimated Bonus: ${measure.bonusEstimate.toLocaleString()}
          </p>
          <span className="text-2xs font-mono text-[#0e6027] bg-[#a7f0ba] px-2 py-0.5">
            STARS {measure.measureId}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-carbon-gray-70">Submission Checklist</p>
        {checklist.map((item, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) => {
                const n = [...checked];
                n[i] = e.target.checked;
                setChecked(n);
              }}
              className="w-3.5 h-3.5 accent-[#24a148]"
            />
            <span
              className={`text-xs ${checked[i] ? 'text-[#24a148] line-through' : 'text-carbon-gray-70'}`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">
          Payer Submission Reference # <span className="text-[#da1e28]">*</span>
        </label>
        <input
          type="text"
          value={submissionRef}
          onChange={(e) => setSubmissionRef(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white"
          placeholder="e.g. STARS-2024-00847"
        />
      </div>
      <div>
        <label className="carbon-label mb-1.5 block">Submission Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white resize-none"
          placeholder="Final notes for audit trail..."
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={attestation}
          onChange={(e) => setAttestation(e.target.checked)}
          className="w-3.5 h-3.5 mt-0.5 accent-[#24a148]"
        />
        <span className="text-xs text-carbon-gray-70">
          I attest that all documentation is accurate and complete per CMS STARS measure
          specifications.
        </span>
      </label>
      <button
        onClick={() =>
          allChecked &&
          attestation &&
          submissionRef.trim() &&
          onComplete(`Ref: ${submissionRef} | ${notes || 'Bonus claim submitted to payer'}`)
        }
        disabled={!allChecked || !attestation || !submissionRef.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="CheckCircleIcon" size={14} />
        Submit Bonus Claim &amp; Close Workflow
      </button>
    </div>
  );
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────
function AuditTrail({
  workflow,
}: {
  workflow: ReturnType<ReturnType<typeof useWorkflowMachine>['getWorkflow']>;
}) {
  if (!workflow || workflow.stepHistory.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-carbon-gray-20">
      <p className="text-xs font-semibold text-carbon-gray-70 mb-2 flex items-center gap-1.5">
        <Icon name="ClockIcon" size={12} className="text-carbon-gray-50" />
        Audit Trail
      </p>
      <div className="space-y-2">
        {workflow.stepHistory.map((record, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <div className="w-4 h-4 bg-[#24a148] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon name="CheckIcon" size={8} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-carbon-gray-100">{record.label}</p>
              <p className="text-carbon-gray-50 text-2xs">
                {record.completedBy} · {new Date(record.completedAt).toLocaleString()}
              </p>
              {record.notes && <p className="text-carbon-gray-70 mt-0.5 italic">{record.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Journey Panel ───────────────────────────────────────────────────────
interface STARSPayerBonusJourneyProps {
  measure: STARSMeasure;
  onClose: () => void;
}

export default function STARSPayerBonusJourney({ measure, onClose }: STARSPayerBonusJourneyProps) {
  const { user } = useAppContext();
  const {
    getWorkflow,
    getWorkflowStatus,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();
  const wfType = 'stars-payer-bonus' as const;
  const workflow = getWorkflow(wfType, measure.id);
  const status = getWorkflowStatus(wfType, measure.id);
  const def = workflowDefinitions[wfType];

  const handleStart = () => startWorkflow(wfType, measure.id, user.name, user.role);
  const handleAdvance = (notes: string) =>
    advanceStep(wfType, measure.id, user.name, user.role, notes);
  const handleComplete = (notes: string) =>
    completeWorkflow(wfType, measure.id, user.name, user.role, notes);
  const handleReset = () => resetWorkflow(wfType, measure.id);

  return (
    <div className="bg-white border border-carbon-gray-20 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#fdf6dd] border-b border-[#f1c21b]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#b45309] flex items-center justify-center">
            <Icon name="StarIcon" size={12} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#b45309] uppercase tracking-wide">
              STARS Payer Bonus Workflow
            </p>
            <p className="text-2xs text-carbon-gray-50">
              {measure.measureId} — {measure.measureName}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Step indicator */}
        {status !== 'idle' && workflow && (
          <StepIndicator steps={def.steps} currentStep={workflow.currentStep} status={status} />
        )}

        {/* Idle state */}
        {status === 'idle' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#fdf6dd] border border-[#f1c21b] flex items-center justify-center mx-auto mb-3">
              <Icon name="StarIcon" size={24} className="text-[#b45309]" />
            </div>
            <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
              STARS Payer Bonus Workflow
            </p>
            <p className="text-xs text-carbon-gray-50 mb-4 max-w-xs mx-auto">
              Remediate the STARS measure gap and submit a bonus claim to the payer. Estimated
              bonus:{' '}
              <span className="font-bold text-[#24a148]">
                ${measure.bonusEstimate.toLocaleString()}
              </span>
            </p>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#b45309] text-white text-sm font-semibold hover:bg-[#8a3e07] transition-colors mx-auto"
            >
              <Icon name="PlayIcon" size={14} />
              Start Bonus Workflow
            </button>
          </div>
        )}

        {/* Step 1 */}
        {status === 'in-progress' && workflow?.currentStep === 1 && (
          <IdentifyGapPanel measure={measure} onAdvance={handleAdvance} />
        )}

        {/* Step 2 */}
        {status === 'in-progress' && workflow?.currentStep === 2 && (
          <RemediateMeasurePanel measure={measure} onAdvance={handleAdvance} />
        )}

        {/* Step 3 */}
        {(status === 'in-progress' || status === 'awaiting-review') &&
          workflow?.currentStep === 3 && (
            <SubmitToPayerPanel measure={measure} onComplete={handleComplete} />
          )}

        {/* Completed */}
        {status === 'completed' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#defbe6] border border-[#24a148] flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckCircleIcon" size={24} className="text-[#24a148]" />
            </div>
            <p className="text-sm font-bold text-[#0e6027] mb-1">Bonus Claim Submitted</p>
            <p className="text-xs text-carbon-gray-50 mb-3">
              The STARS payer bonus claim has been submitted and the workflow is closed.
            </p>
            <button
              onClick={handleReset}
              className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 underline"
            >
              Reset Workflow
            </button>
          </div>
        )}

        {/* Audit trail */}
        {workflow && <AuditTrail workflow={workflow} />}
      </div>
    </div>
  );
}
