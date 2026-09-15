'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MIPSAdjustment {
  id: string;
  noticeId: string;
  performanceYear: string;
  compositeScore: number; // 0-100
  adjustmentPct: number; // negative = penalty, positive = bonus
  adjustmentAmount: number;
  qualityScore: number;
  promotingInteropScore: number;
  improvementActScore: number;
  costScore: number;
  deadline: string;
  status: 'open' | 'in-review' | 'appealed' | 'closed';
  appealEligible: boolean;
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
                      ? 'bg-[#6929c4] border-[#6929c4] text-white'
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
                  className={`text-2xs font-semibold leading-tight ${isActive ? 'text-[#6929c4]' : isCompleted ? 'text-[#24a148]' : isRejected ? 'text-[#da1e28]' : 'text-carbon-gray-50'}`}
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

// ─── Score Breakdown ──────────────────────────────────────────────────────────
function ScoreBreakdown({ adj }: { adj: MIPSAdjustment }) {
  const categories = [
    { label: 'Quality', score: adj.qualityScore, weight: 30, color: '#0043ce' },
    { label: 'Promoting Interop', score: adj.promotingInteropScore, weight: 25, color: '#6929c4' },
    {
      label: 'Improvement Activities',
      score: adj.improvementActScore,
      weight: 15,
      color: '#b45309',
    },
    { label: 'Cost', score: adj.costScore, weight: 30, color: '#da1e28' },
  ];
  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div key={cat.label}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-2xs text-carbon-gray-70">
              {cat.label} <span className="text-carbon-gray-30">({cat.weight}%)</span>
            </span>
            <span className="font-mono text-xs font-bold" style={{ color: cat.color }}>
              {cat.score}/100
            </span>
          </div>
          <div className="w-full h-1.5 bg-carbon-gray-20">
            <div
              className="h-full transition-all"
              style={{ width: `${cat.score}%`, backgroundColor: cat.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Review Adjustment ────────────────────────────────────────────────
function ReviewAdjustmentPanel({
  adj,
  onAdvance,
}: {
  adj: MIPSAdjustment;
  onAdvance: (notes: string) => void;
}) {
  const [reviewNotes, setReviewNotes] = useState('');
  const isPenalty = adj.adjustmentPct < 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
          <Icon name="DocumentMagnifyingGlassIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Review CMS Payment Adjustment</p>
      </div>
      <div
        className={`border p-4 space-y-3 ${isPenalty ? 'bg-[#fff1f1] border-[#da1e28]' : 'bg-[#defbe6] border-[#24a148]'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-carbon-gray-70">
                {adj.noticeId}
              </span>
              <span
                className={`text-2xs font-semibold px-2 py-0.5 ${isPenalty ? 'bg-[#ffd7d9] text-[#da1e28]' : 'bg-[#a7f0ba] text-[#0e6027]'}`}
              >
                {isPenalty ? 'PENALTY' : 'BONUS'}
              </span>
            </div>
            <p className="text-xs text-carbon-gray-50">Performance Year: {adj.performanceYear}</p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              Appeal Deadline: <span className="font-semibold text-[#da1e28]">{adj.deadline}</span>
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xs text-carbon-gray-50">Composite Score</p>
            <p className="font-mono text-xl font-bold text-carbon-gray-100">{adj.compositeScore}</p>
            <p className="text-2xs text-carbon-gray-50 mt-1">Adjustment</p>
            <p
              className={`font-mono text-base font-bold ${isPenalty ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
            >
              {isPenalty ? '' : '+'}
              {adj.adjustmentPct}% (${Math.abs(adj.adjustmentAmount).toLocaleString()})
            </p>
          </div>
        </div>
        <div className="pt-2 border-t border-carbon-gray-20">
          <p className="text-2xs font-semibold text-carbon-gray-70 mb-2">Score Breakdown</p>
          <ScoreBreakdown adj={adj} />
        </div>
      </div>
      {adj.appealEligible && (
        <div className="flex items-start gap-2 bg-[#f6f2ff] border border-[#d4bbff] p-3">
          <Icon
            name="InformationCircleIcon"
            size={14}
            className="text-[#6929c4] flex-shrink-0 mt-0.5"
          />
          <p className="text-xs text-[#6929c4]">
            This adjustment is eligible for appeal. You may initiate an appeal in the next step.
          </p>
        </div>
      )}
      <div>
        <label className="carbon-label mb-1.5 block">
          Review Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-white resize-none"
          placeholder="Document your review findings — score discrepancies, data quality issues, missing submissions..."
        />
      </div>
      <button
        onClick={() => reviewNotes.trim() && onAdvance(reviewNotes)}
        disabled={!reviewNotes.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="ArrowRightIcon" size={14} />
        Complete Review &amp; Advance to Response
      </button>
    </div>
  );
}

// ─── Step 2: Respond / Appeal ─────────────────────────────────────────────────
function RespondAppealPanel({
  adj,
  onAdvance,
}: {
  adj: MIPSAdjustment;
  onAdvance: (notes: string) => void;
}) {
  const [action, setAction] = useState<'accept' | 'appeal' | null>(null);
  const [appealBasis, setAppealBasis] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  const appealBases = [
    'Data submission error — incorrect measure data submitted',
    'Eligibility error — patient excluded from measure denominator',
    'Reporting period discrepancy — service dates misaligned',
    'EHR data extraction failure — technical issue',
    'Hardship exception — qualifying event during performance year',
    'New practice exception — first year of MIPS participation',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
          <Icon name="ScaleIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Respond to Adjustment</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Choose to accept the adjustment or initiate a formal appeal with supporting evidence.
      </p>

      {action === null && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setAction('accept')}
            className="flex flex-col items-center gap-2 p-4 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
          >
            <Icon name="CheckCircleIcon" size={20} className="text-[#24a148]" />
            <span className="text-xs font-semibold text-carbon-gray-100">Accept Adjustment</span>
            <span className="text-2xs text-carbon-gray-50 text-center">
              Acknowledge and close without appeal
            </span>
          </button>
          <button
            onClick={() => setAction('appeal')}
            disabled={!adj.appealEligible}
            className="flex flex-col items-center gap-2 p-4 border border-[#6929c4] hover:bg-[#f6f2ff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="MegaphoneIcon" size={20} className="text-[#6929c4]" />
            <span className="text-xs font-semibold text-[#6929c4]">Initiate Appeal</span>
            <span className="text-2xs text-carbon-gray-50 text-center">
              {adj.appealEligible ? 'Submit formal appeal to CMS' : 'Not eligible for appeal'}
            </span>
          </button>
        </div>
      )}

      {action === 'accept' && (
        <div className="space-y-3 border border-[#24a148] bg-[#defbe6]/30 p-4">
          <div className="flex items-center gap-2">
            <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
            <p className="text-sm font-semibold text-[#0e6027]">Accept Adjustment</p>
          </div>
          <div>
            <label className="carbon-label mb-1.5 block">
              Acceptance Notes <span className="text-[#da1e28]">*</span>
            </label>
            <textarea
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              rows={2}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#24a148] bg-white resize-none"
              placeholder="Document rationale for accepting the adjustment..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => evidenceNotes.trim() && onAdvance(`Action: Accept | ${evidenceNotes}`)}
              disabled={!evidenceNotes.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="CheckIcon" size={14} />
              Confirm Acceptance
            </button>
            <button
              onClick={() => setAction(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {action === 'appeal' && (
        <div className="space-y-3 border border-[#6929c4] bg-[#f6f2ff]/30 p-4">
          <div className="flex items-center gap-2">
            <Icon name="MegaphoneIcon" size={16} className="text-[#6929c4]" />
            <p className="text-sm font-semibold text-[#6929c4]">Initiate Formal Appeal</p>
          </div>
          <div>
            <label className="carbon-label mb-1.5 block">
              Appeal Basis <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={appealBasis}
              onChange={(e) => setAppealBasis(e.target.value)}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-white"
            >
              <option value="">Select appeal basis...</option>
              {appealBases.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="carbon-label mb-1.5 block">
              Supporting Evidence <span className="text-[#da1e28]">*</span>
            </label>
            <textarea
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              rows={3}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-white resize-none"
              placeholder="Describe supporting evidence — EHR data, submission logs, corrected measure data, hardship documentation..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                appealBasis &&
                evidenceNotes.trim() &&
                onAdvance(`Action: Appeal | Basis: ${appealBasis} | ${evidenceNotes}`)
              }
              disabled={!appealBasis || !evidenceNotes.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="ArrowRightIcon" size={14} />
              Submit Appeal &amp; Advance
            </button>
            <button
              onClick={() => setAction(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Audit & Close ────────────────────────────────────────────────────
function AuditClosePanel({
  adj,
  onComplete,
}: {
  adj: MIPSAdjustment;
  onComplete: (notes: string) => void;
}) {
  const [attestation, setAttestation] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');

  const auditChecklist = [
    'CMS notice reviewed and acknowledged',
    'Score breakdown verified against submitted data',
    'Response action documented (accept or appeal)',
    'Supporting evidence attached to record',
    'Improvement plan initiated for next performance year',
  ];
  const [checked, setChecked] = useState<boolean[]>(auditChecklist.map(() => false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 bg-[#24a148] flex items-center justify-center flex-shrink-0">
          <Icon name="ClipboardDocumentCheckIcon" size={12} className="text-white" />
        </div>
        <p className="text-sm font-semibold text-carbon-gray-100">Audit &amp; Close Review</p>
      </div>
      <p className="text-xs text-carbon-gray-50">
        Finalize the audit trail and close the MIPS payment adjustment review. Physician sign-off
        required.
      </p>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-carbon-gray-70">Closure Checklist</p>
        {auditChecklist.map((item, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) => {
                const n = [...checked];
                n[i] = e.target.checked;
                setChecked(n);
              }}
              className="w-3.5 h-3.5 accent-[#6929c4]"
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
        <label className="carbon-label mb-1.5 block">Closure Notes</label>
        <textarea
          value={closeNotes}
          onChange={(e) => setCloseNotes(e.target.value)}
          rows={2}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-white resize-none"
          placeholder="Final notes for the audit record — improvement actions planned, lessons learned..."
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={attestation}
          onChange={(e) => setAttestation(e.target.checked)}
          className="w-3.5 h-3.5 mt-0.5 accent-[#6929c4]"
        />
        <span className="text-xs text-carbon-gray-70">
          I confirm that the MIPS payment adjustment review is complete and all required actions
          have been documented.
        </span>
      </label>
      <button
        onClick={() =>
          allChecked &&
          attestation &&
          onComplete(`MIPS ${adj.noticeId} review closed${closeNotes ? ` | ${closeNotes}` : ''}`)
        }
        disabled={!allChecked || !attestation}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="CheckCircleIcon" size={14} />
        Close Review Workflow
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
interface MIPSPaymentAdjJourneyProps {
  adjustment: MIPSAdjustment;
  onClose: () => void;
}

export default function MIPSPaymentAdjJourney({ adjustment, onClose }: MIPSPaymentAdjJourneyProps) {
  const { user } = useAppContext();
  const {
    getWorkflow,
    getWorkflowStatus,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();
  const wfType = 'mips-payment-adj' as const;
  const workflow = getWorkflow(wfType, adjustment.id);
  const status = getWorkflowStatus(wfType, adjustment.id);
  const def = workflowDefinitions[wfType];

  const handleStart = () => startWorkflow(wfType, adjustment.id, user.name, user.role);
  const handleAdvance = (notes: string) =>
    advanceStep(wfType, adjustment.id, user.name, user.role, notes);
  const handleComplete = (notes: string) =>
    completeWorkflow(wfType, adjustment.id, user.name, user.role, notes);
  const handleReset = () => resetWorkflow(wfType, adjustment.id);

  return (
    <div className="bg-white border border-carbon-gray-20 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f6f2ff] border-b border-[#d4bbff]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#6929c4] flex items-center justify-center">
            <Icon name="ScaleIcon" size={12} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#6929c4] uppercase tracking-wide">
              MIPS Payment Adjustment Review
            </p>
            <p className="text-2xs text-carbon-gray-50">
              {adjustment.noticeId} — PY {adjustment.performanceYear}
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
        {status !== 'idle' && workflow && (
          <StepIndicator steps={def.steps} currentStep={workflow.currentStep} status={status} />
        )}

        {status === 'idle' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#f6f2ff] border border-[#d4bbff] flex items-center justify-center mx-auto mb-3">
              <Icon name="ScaleIcon" size={24} className="text-[#6929c4]" />
            </div>
            <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
              MIPS Payment Adjustment Review
            </p>
            <p className="text-xs text-carbon-gray-50 mb-1 max-w-xs mx-auto">
              Review CMS notice{' '}
              <span className="font-bold text-[#6929c4]">{adjustment.noticeId}</span> for PY{' '}
              {adjustment.performanceYear}.
            </p>
            <p
              className={`text-sm font-bold mb-4 ${adjustment.adjustmentPct < 0 ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
            >
              {adjustment.adjustmentPct < 0 ? '' : '+'}
              {adjustment.adjustmentPct}% (${Math.abs(adjustment.adjustmentAmount).toLocaleString()}
              )
            </p>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#6929c4] text-white text-sm font-semibold hover:bg-[#491d8b] transition-colors mx-auto"
            >
              <Icon name="PlayIcon" size={14} />
              Start Review Workflow
            </button>
          </div>
        )}

        {status === 'in-progress' && workflow?.currentStep === 1 && (
          <ReviewAdjustmentPanel adj={adjustment} onAdvance={handleAdvance} />
        )}
        {status === 'in-progress' && workflow?.currentStep === 2 && (
          <RespondAppealPanel adj={adjustment} onAdvance={handleAdvance} />
        )}
        {(status === 'in-progress' || status === 'awaiting-review') &&
          workflow?.currentStep === 3 && (
            <AuditClosePanel adj={adjustment} onComplete={handleComplete} />
          )}

        {status === 'completed' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-[#defbe6] border border-[#24a148] flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckCircleIcon" size={24} className="text-[#24a148]" />
            </div>
            <p className="text-sm font-bold text-[#0e6027] mb-1">Review Closed</p>
            <p className="text-xs text-carbon-gray-50 mb-3">
              MIPS adjustment review {adjustment.noticeId} has been closed and the audit trail is
              complete.
            </p>
            <button
              onClick={handleReset}
              className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 underline"
            >
              Reset Workflow
            </button>
          </div>
        )}

        {workflow && <AuditTrail workflow={workflow} />}
      </div>
    </div>
  );
}
