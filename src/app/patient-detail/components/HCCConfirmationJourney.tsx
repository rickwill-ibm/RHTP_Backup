'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

import FreshnessIndicator from '@/components/ui/FreshnessIndicator';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';
import type { HCCSuspect } from '@/lib/mockData';

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
        const isPending = s.step > currentStep && status !== 'completed';

        return (
          <div key={s.step} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              {/* Step circle */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-all
                ${
                  isCompleted
                    ? 'bg-[#24a148] border-[#24a148] text-white'
                    : isActive
                      ? 'bg-[#0f62fe] border-[#0f62fe] text-white'
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
              {/* Step label */}
              <div className="mt-1.5 text-center px-1">
                <p
                  className={`text-2xs font-semibold leading-tight ${isActive ? 'text-[#0f62fe]' : isCompleted ? 'text-[#24a148]' : isRejected ? 'text-[#da1e28]' : 'text-carbon-gray-50'}`}
                >
                  {s.label}
                </p>
                <p className="text-2xs text-carbon-gray-30 mt-0.5 hidden sm:block leading-tight">
                  {s.requiredRole === 'care_manager' ? 'Care Mgr' : 'Physician'}
                </p>
              </div>
            </div>
            {/* Connector line */}
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

// ─── Evidence Source Row ──────────────────────────────────────────────────────
function EvidenceSourceRow({ source, index }: { source: string; index: number }) {
  const icons: Record<string, string> = {
    EMR: 'ComputerDesktopIcon',
    Claims: 'DocumentTextIcon',
    HIE: 'ArrowPathIcon',
    LPR: 'MagnifyingGlassCircleIcon',
  };
  const sourceType =
    source.includes('EMR') || source.includes('echocardiogram') || source.includes('encounter')
      ? 'EMR'
      : source.includes('Claim') || source.includes('claim')
        ? 'Claims'
        : source.includes('HIE')
          ? 'HIE'
          : 'LPR';

  return (
    <div className="flex items-start gap-3 p-3 bg-carbon-gray-10 border border-carbon-gray-20 hover:bg-white transition-colors">
      <div className="w-6 h-6 flex items-center justify-center bg-[#d0e2ff] flex-shrink-0 mt-0.5">
        <Icon name={icons[sourceType] as any} size={12} className="text-[#0043ce]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-carbon-gray-100">{source}</p>
        <span className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-20 px-1.5 py-0.5 mt-1 inline-block">
          {sourceType}
        </span>
      </div>
      <Icon name="CheckCircleIcon" size={14} className="text-[#24a148] flex-shrink-0 mt-0.5" />
    </div>
  );
}

// ─── Physician Confirmation Panel ─────────────────────────────────────────────
interface PhysicianConfirmPanelProps {
  suspect: HCCSuspect;
  onConfirm: (notes: string) => void;
  onReject: (reason: string) => void;
}

function PhysicianConfirmPanel({ suspect, onConfirm, onReject }: PhysicianConfirmPanelProps) {
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [mode, setMode] = useState<'confirm' | 'reject' | null>(null);
  const [icdOverride, setIcdOverride] = useState(suspect.icdCode);

  return (
    <div className="space-y-4">
      {/* Clinical summary */}
      <div className="bg-[#edf5ff] border border-[#97c1ff] p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-[#0043ce]">{suspect.hccCode}</span>
              <span className="text-sm font-semibold text-carbon-gray-100">
                {suspect.hccDescription}
              </span>
            </div>
            <p className="text-xs text-carbon-gray-70 font-mono">
              {suspect.icdCode} — {suspect.icdDescription}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xs text-carbon-gray-50">Est. RAF Delta</p>
            <p className="font-mono text-base font-bold text-[#b45309]">
              +{suspect.estimatedRafDelta.toFixed(3)}
            </p>
            <p className="text-2xs text-carbon-gray-50 mt-0.5">Revenue Impact</p>
            <p className="font-mono text-sm font-bold text-[#da1e28]">
              ${suspect.estimatedRevenueDelta.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-0.5">Confidence Score</p>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-white border border-carbon-gray-20">
                <div
                  className="h-full bg-[#24a148]"
                  style={{ width: `${Math.round(suspect.suspectConfidence * 100)}%` }}
                />
              </div>
              <span className="font-mono font-semibold text-[#24a148]">
                {Math.round(suspect.suspectConfidence * 100)}%
              </span>
            </div>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-0.5">Last Encounter</p>
            <p className="font-mono text-carbon-gray-70">{suspect.lastEncounterDate}</p>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50 mb-0.5">Submission Deadline</p>
            <p className="font-mono font-semibold text-[#da1e28]">{suspect.submissionDeadline}</p>
          </div>
        </div>
      </div>

      {/* ICD code override */}
      <div>
        <label className="carbon-label mb-1.5 block">ICD-10 Code (override if needed)</label>
        <input
          type="text"
          value={icdOverride}
          onChange={(e) => setIcdOverride(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white"
          placeholder="e.g. I50.32"
        />
      </div>

      {/* Action selection */}
      {mode === null && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('confirm')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0f62fe] text-white text-sm font-semibold hover:bg-[#0353e9] transition-colors"
          >
            <Icon name="CheckCircleIcon" size={16} />
            Confirm HCC Diagnosis
          </button>
          <button
            onClick={() => setMode('reject')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#da1e28] text-[#da1e28] text-sm font-semibold hover:bg-[#fff1f1] transition-colors"
          >
            <Icon name="XCircleIcon" size={16} />
            Reject Suspect
          </button>
        </div>
      )}

      {/* Confirm flow */}
      {mode === 'confirm' && (
        <div className="space-y-3 border border-[#24a148] bg-[#defbe6]/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
            <p className="text-sm font-semibold text-[#0e6027]">Confirm HCC Diagnosis</p>
          </div>
          <div>
            <label className="carbon-label mb-1.5 block">
              Clinical Documentation Notes <span className="text-[#da1e28]">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white resize-none"
              placeholder="Document clinical basis for confirmation — encounter findings, supporting evidence, clinical rationale..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => notes.trim() && onConfirm(notes)}
              disabled={!notes.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="CheckIcon" size={14} />
              Submit Confirmation
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 hover:text-carbon-gray-100 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject flow */}
      {mode === 'reject' && (
        <div className="space-y-3 border border-[#da1e28] bg-[#fff1f1]/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="XCircleIcon" size={16} className="text-[#da1e28]" />
            <p className="text-sm font-semibold text-[#da1e28]">Reject HCC Suspect</p>
          </div>
          <div>
            <label className="carbon-label mb-1.5 block">
              Rejection Reason <span className="text-[#da1e28]">*</span>
            </label>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white mb-2"
            >
              <option value="">Select reason...</option>
              <option value="Insufficient clinical evidence">Insufficient clinical evidence</option>
              <option value="Condition not present during encounter">
                Condition not present during encounter
              </option>
              <option value="Duplicate — already documented under different code">
                Duplicate — already documented under different code
              </option>
              <option value="Patient declined documentation">Patient declined documentation</option>
              <option value="Condition resolved — no longer active">
                Condition resolved — no longer active
              </option>
              <option value="Coding error — incorrect HCC mapping">
                Coding error — incorrect HCC mapping
              </option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => rejectReason && onReject(rejectReason)}
              disabled={!rejectReason}
              className="flex items-center gap-2 px-4 py-2 bg-[#da1e28] text-white text-xs font-semibold hover:bg-[#b81922] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="XMarkIcon" size={14} />
              Submit Rejection
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-4 py-2 text-xs text-carbon-gray-70 hover:text-carbon-gray-100 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Evidence Submission Panel ────────────────────────────────────────────────
interface EvidenceSubmissionPanelProps {
  suspect: HCCSuspect;
  onSubmit: (notes: string) => void;
}

function EvidenceSubmissionPanel({ suspect, onSubmit }: EvidenceSubmissionPanelProps) {
  const [notes, setNotes] = useState('');
  const [additionalSources, setAdditionalSources] = useState<string[]>([]);
  const [newSource, setNewSource] = useState('');

  const addSource = () => {
    if (newSource.trim()) {
      setAdditionalSources((prev) => [...prev, newSource.trim()]);
      setNewSource('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="carbon-label mb-2">Existing Evidence Sources</p>
        <div className="space-y-1.5">
          {suspect.evidenceSources.map((src, i) => (
            <EvidenceSourceRow key={`src-${i}`} source={src} index={i} />
          ))}
        </div>
      </div>

      {/* Add additional evidence */}
      <div>
        <p className="carbon-label mb-2">Add Supporting Evidence</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSource()}
            className="flex-1 border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white"
            placeholder="e.g. 2026-03-15 encounter note — CHF exacerbation documented"
          />
          <button
            onClick={addSource}
            className="px-3 py-2 bg-carbon-gray-10 border border-carbon-gray-30 text-xs text-carbon-gray-70 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="PlusIcon" size={14} />
          </button>
        </div>
        {additionalSources.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {additionalSources.map((src, i) => (
              <div
                key={`add-${i}`}
                className="flex items-center gap-2 p-2 bg-[#defbe6] border border-[#24a148]"
              >
                <Icon name="PlusCircleIcon" size={12} className="text-[#24a148]" />
                <span className="text-xs text-carbon-gray-100 flex-1">{src}</span>
                <button
                  onClick={() => setAdditionalSources((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-carbon-gray-30 hover:text-[#da1e28]"
                >
                  <Icon name="XMarkIcon" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review notes */}
      <div>
        <label className="carbon-label mb-1.5 block">Evidence Review Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white resize-none"
          placeholder="Summarize evidence quality, gaps, and readiness for physician review..."
        />
      </div>

      <button
        onClick={() => onSubmit(notes || 'Evidence reviewed — ready for physician confirmation')}
        className="flex items-center gap-2 px-4 py-2 bg-[#0f62fe] text-white text-xs font-semibold hover:bg-[#0353e9] transition-colors"
      >
        <Icon name="PaperAirplaneIcon" size={14} />
        Mark Evidence Reviewed & Escalate to Physician
      </button>
    </div>
  );
}

// ─── Submission Panel ─────────────────────────────────────────────────────────
interface SubmissionPanelProps {
  suspect: HCCSuspect;
  onSubmit: (notes: string) => void;
}

function SubmissionPanel({ suspect, onSubmit }: SubmissionPanelProps) {
  const [notes, setNotes] = useState('');
  const [payerTarget, setPayerTarget] = useState('CMS RAF Submission — MSSP ACO');

  return (
    <div className="space-y-4">
      <div className="bg-[#defbe6] border border-[#24a148] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
          <p className="text-sm font-semibold text-[#0e6027]">
            HCC Confirmed — Ready for Payer Submission
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-2xs text-carbon-gray-50">HCC Code</p>
            <p className="font-mono font-semibold text-carbon-gray-100">{suspect.hccCode}</p>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50">RAF Delta</p>
            <p className="font-mono font-semibold text-[#b45309]">
              +{suspect.estimatedRafDelta.toFixed(3)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50">Revenue Captured</p>
            <p className="font-mono font-semibold text-[#24a148]">
              ${suspect.estimatedRevenueDelta.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-2xs text-carbon-gray-50">Submission Deadline</p>
            <p className="font-mono font-semibold text-[#da1e28]">{suspect.submissionDeadline}</p>
          </div>
        </div>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Payer / Submission Target</label>
        <select
          value={payerTarget}
          onChange={(e) => setPayerTarget(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white"
        >
          <option>CMS RAF Submission — MSSP ACO</option>
          <option>CMS RAF Submission — ACO REACH</option>
          <option>Commercial VBC — Aetna</option>
          <option>Medicaid MCO — State Submission</option>
        </select>
      </div>

      <div>
        <label className="carbon-label mb-1.5 block">Submission Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white resize-none"
          placeholder="Optional submission notes for payer record..."
        />
      </div>

      <button
        onClick={() => onSubmit(`Submitted to ${payerTarget}${notes ? ` — ${notes}` : ''}`)}
        className="flex items-center gap-2 px-4 py-2 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors"
      >
        <Icon name="CloudArrowUpIcon" size={14} />
        Submit to Payer for RAF Capture
      </button>
    </div>
  );
}

// ─── Main Journey Component ───────────────────────────────────────────────────
interface HCCConfirmationJourneyProps {
  suspect: HCCSuspect;
  onClose: () => void;
}

export default function HCCConfirmationJourney({ suspect, onClose }: HCCConfirmationJourneyProps) {
  const { user } = useAppContext();
  const {
    getWorkflow,
    getWorkflowStatus,
    getWorkflowProgress,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    rejectWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();

  const wfDef = workflowDefinitions['hcc-confirmation'];
  const wf = getWorkflow('hcc-confirmation', suspect.id);
  const status = getWorkflowStatus('hcc-confirmation', suspect.id);
  const { current, total } = getWorkflowProgress('hcc-confirmation', suspect.id);

  const currentStepDef = wfDef.steps.find((s) => s.step === (wf?.currentStep ?? 0));
  const isPhysician = user.role === 'physician';
  const isCareManager = user.role === 'care_manager';

  // ── Step handlers ──────────────────────────────────────────────────────────
  const handleStart = () => {
    startWorkflow('hcc-confirmation', suspect.id, user.name, user.role);
  };

  const handleEvidenceReviewed = (notes: string) => {
    advanceStep('hcc-confirmation', suspect.id, user.name, user.role, notes);
  };

  const handleEscalateToPhysician = () => {
    advanceStep(
      'hcc-confirmation',
      suspect.id,
      user.name,
      user.role,
      `Escalated to ${suspect.assignedPhysician} for clinical review`
    );
  };

  const handlePhysicianConfirm = (notes: string) => {
    advanceStep('hcc-confirmation', suspect.id, user.name, user.role, notes);
  };

  const handlePhysicianReject = (reason: string) => {
    rejectWorkflow('hcc-confirmation', suspect.id, user.name, user.role, reason);
  };

  const handleSubmitToPayer = (notes: string) => {
    completeWorkflow('hcc-confirmation', suspect.id, user.name, user.role, notes);
  };

  const handleReset = () => {
    resetWorkflow('hcc-confirmation', suspect.id);
  };

  // ── Render active step content ─────────────────────────────────────────────
  const renderStepContent = () => {
    if (status === 'idle' || !wf) {
      return (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-[#d0e2ff] flex items-center justify-center mx-auto mb-3">
            <Icon name="PlayCircleIcon" size={24} className="text-[#0043ce]" />
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100 mb-1">
            Start HCC Confirmation Workflow
          </p>
          <p className="text-xs text-carbon-gray-50 mb-4 max-w-xs mx-auto">
            This will initiate the 5-step confirmation journey for{' '}
            <span className="font-semibold text-carbon-gray-70">{suspect.hccDescription}</span>
          </p>
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0f62fe] text-white text-sm font-semibold hover:bg-[#0353e9] transition-colors mx-auto"
          >
            <Icon name="PlayIcon" size={14} />
            Initiate Workflow
          </button>
        </div>
      );
    }

    if (status === 'completed') {
      return (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-[#defbe6] flex items-center justify-center mx-auto mb-3">
            <Icon name="CheckBadgeIcon" size={24} className="text-[#24a148]" />
          </div>
          <p className="text-sm font-semibold text-[#0e6027] mb-1">HCC Confirmed & Submitted</p>
          <p className="text-xs text-carbon-gray-50 mb-1">
            RAF delta{' '}
            <span className="font-mono font-semibold text-[#b45309]">
              +{suspect.estimatedRafDelta.toFixed(3)}
            </span>{' '}
            captured
          </p>
          <p className="text-xs text-carbon-gray-50 mb-4">
            Revenue impact{' '}
            <span className="font-mono font-semibold text-[#24a148]">
              ${suspect.estimatedRevenueDelta.toLocaleString()}
            </span>{' '}
            submitted to payer
          </p>
          <button
            onClick={handleReset}
            className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 underline"
          >
            Reset workflow (for demo)
          </button>
        </div>
      );
    }

    if (status === 'rejected') {
      const rejectionNote = wf.stepHistory[wf.stepHistory.length - 1]?.notes;
      return (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-[#fff1f1] flex items-center justify-center mx-auto mb-3">
            <Icon name="XCircleIcon" size={24} className="text-[#da1e28]" />
          </div>
          <p className="text-sm font-semibold text-[#da1e28] mb-1">HCC Suspect Rejected</p>
          {rejectionNote && (
            <p className="text-xs text-carbon-gray-70 mb-1 max-w-xs mx-auto">
              Reason: <span className="font-medium">{rejectionNote}</span>
            </p>
          )}
          <p className="text-xs text-carbon-gray-50 mb-4">
            Rejected by {wf.stepHistory[wf.stepHistory.length - 1]?.completedBy}
          </p>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-carbon-gray-10 border border-carbon-gray-30 text-xs text-carbon-gray-70 hover:bg-carbon-gray-20 transition-colors mx-auto"
          >
            <Icon name="ArrowPathIcon" size={14} />
            Restart Workflow
          </button>
        </div>
      );
    }

    // Active step rendering
    const step = wf.currentStep;

    // Step 1: Surface Suspect (auto-completed on start, advance to step 2)
    if (step === 1 && isCareManager) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-[#d0e2ff] border border-[#97c1ff]">
            <Icon name="InformationCircleIcon" size={14} className="text-[#0043ce]" />
            <p className="text-xs text-[#0043ce]">
              Suspect surfaced from {suspect.dataSource} data. Review and proceed to evidence
              collection.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-carbon-gray-10 border border-carbon-gray-20">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Data Source</p>
              <p className="font-semibold text-carbon-gray-100">{suspect.dataSource}</p>
            </div>
            <div className="p-3 bg-carbon-gray-10 border border-carbon-gray-20">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Confidence</p>
              <p className="font-semibold text-[#24a148]">
                {Math.round(suspect.suspectConfidence * 100)}%
              </p>
            </div>
            <div className="p-3 bg-carbon-gray-10 border border-carbon-gray-20">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Evidence Sources</p>
              <p className="font-semibold text-carbon-gray-100">
                {suspect.evidenceSources.length} sources
              </p>
            </div>
            <div className="p-3 bg-carbon-gray-10 border border-carbon-gray-20">
              <p className="text-2xs text-carbon-gray-50 mb-0.5">Freshness</p>
              <FreshnessIndicator source={suspect.dataSource} date={suspect.freshnessDate} />
            </div>
          </div>
          <button
            onClick={() =>
              advanceStep(
                'hcc-confirmation',
                suspect.id,
                user.name,
                user.role,
                'Suspect reviewed and confirmed for evidence collection'
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-[#0f62fe] text-white text-xs font-semibold hover:bg-[#0353e9] transition-colors"
          >
            <Icon name="ArrowRightIcon" size={14} />
            Proceed to Evidence Review
          </button>
        </div>
      );
    }

    // Step 2: Review Evidence
    if (step === 2 && isCareManager) {
      return <EvidenceSubmissionPanel suspect={suspect} onSubmit={handleEvidenceReviewed} />;
    }

    // Step 3: Escalate to Physician
    if (step === 3 && isCareManager) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-[#fdf6dd] border border-[#f1c21b]">
            <Icon name="ArrowUpCircleIcon" size={14} className="text-[#b45309]" />
            <p className="text-xs text-[#b45309]">
              Evidence reviewed. Route to <strong>{suspect.assignedPhysician}</strong> for clinical
              confirmation.
            </p>
          </div>
          <div className="p-4 bg-carbon-gray-10 border border-carbon-gray-20">
            <p className="carbon-label mb-2">Assigned Physician</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center text-white text-xs font-bold">
                {suspect.assignedPhysician
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-semibold text-carbon-gray-100">
                  {suspect.assignedPhysician}
                </p>
                <p className="text-2xs text-carbon-gray-50">Primary Care Physician</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleEscalateToPhysician}
            className="flex items-center gap-2 px-4 py-2 bg-[#f1c21b] text-[#1a1a1a] text-xs font-semibold hover:bg-[#d4a017] transition-colors"
          >
            <Icon name="PaperAirplaneIcon" size={14} />
            Send to {suspect.assignedPhysician} for Review
          </button>
        </div>
      );
    }

    // Step 4: Physician Confirmation
    if (step === 4) {
      if (isPhysician) {
        return (
          <PhysicianConfirmPanel
            suspect={suspect}
            onConfirm={handlePhysicianConfirm}
            onReject={handlePhysicianReject}
          />
        );
      }
      return (
        <div className="flex items-center gap-3 p-4 bg-[#fdf6dd] border border-[#f1c21b]">
          <Icon name="ClockIcon" size={16} className="text-[#b45309]" />
          <div>
            <p className="text-sm font-semibold text-[#b45309]">Awaiting Physician Review</p>
            <p className="text-xs text-carbon-gray-70 mt-0.5">
              Pending confirmation from <strong>{suspect.assignedPhysician}</strong>
            </p>
          </div>
        </div>
      );
    }

    // Step 5: Document & Submit
    if (step === 5) {
      if (isPhysician) {
        return <SubmissionPanel suspect={suspect} onSubmit={handleSubmitToPayer} />;
      }
      return (
        <div className="flex items-center gap-3 p-4 bg-[#d0e2ff] border border-[#97c1ff]">
          <Icon name="ClockIcon" size={16} className="text-[#0043ce]" />
          <div>
            <p className="text-sm font-semibold text-[#0043ce]">Awaiting Payer Submission</p>
            <p className="text-xs text-carbon-gray-70 mt-0.5">
              Physician confirmed — pending final submission by {suspect.assignedPhysician}
            </p>
          </div>
        </div>
      );
    }

    // Role mismatch
    return (
      <div className="flex items-center gap-3 p-4 bg-carbon-gray-10 border border-carbon-gray-20">
        <Icon name="LockClosedIcon" size={16} className="text-carbon-gray-50" />
        <div>
          <p className="text-sm font-semibold text-carbon-gray-70">
            Step requires{' '}
            {currentStepDef?.requiredRole === 'physician' ? 'Physician' : 'Care Manager'} role
          </p>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            Switch role context to proceed with this step
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="border border-carbon-gray-20 bg-white">
      {/* Journey header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-carbon-gray-20 bg-carbon-gray-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#0f62fe] flex items-center justify-center">
            <Icon name="ArrowPathIcon" size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">HCC Confirmation Journey</p>
            <p className="text-2xs text-carbon-gray-50 font-mono">
              {suspect.hccCode} — {suspect.hccDescription}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status !== 'idle' && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold border
              ${
                status === 'completed'
                  ? 'bg-[#defbe6] text-[#0e6027] border-[#24a148]'
                  : status === 'rejected'
                    ? 'bg-[#fff1f1] text-[#da1e28] border-[#da1e28]'
                    : status === 'awaiting-review'
                      ? 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
                      : 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]'
              }`}
            >
              {status === 'in-progress' && (
                <>
                  <Icon name="PlayIcon" size={10} />
                  Step {current}/{total}
                </>
              )}
              {status === 'awaiting-review' && (
                <>
                  <Icon name="ClockIcon" size={10} />
                  Awaiting Review
                </>
              )}
              {status === 'completed' && (
                <>
                  <Icon name="CheckCircleIcon" size={10} />
                  Completed
                </>
              )}
              {status === 'rejected' && (
                <>
                  <Icon name="XCircleIcon" size={10} />
                  Rejected
                </>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Step progress */}
      {status !== 'idle' && (
        <div className="px-5 py-4 border-b border-carbon-gray-20 bg-white">
          <StepIndicator steps={wfDef.steps} currentStep={wf?.currentStep ?? 1} status={status} />
        </div>
      )}

      {/* Step history */}
      {wf && wf.stepHistory.length > 0 && (
        <div className="px-5 py-3 border-b border-carbon-gray-20 bg-carbon-gray-10">
          <p className="carbon-label mb-2">Step History</p>
          <div className="space-y-1.5">
            {wf.stepHistory.map((record, i) => (
              <div key={`hist-${i}`} className="flex items-center gap-3 text-2xs">
                <div className="w-4 h-4 bg-[#24a148] flex items-center justify-center flex-shrink-0">
                  <Icon name="CheckIcon" size={9} className="text-white" />
                </div>
                <span className="font-semibold text-carbon-gray-70 w-28 flex-shrink-0">
                  {record.label}
                </span>
                <span className="text-carbon-gray-50">{record.completedBy}</span>
                <span className="text-carbon-gray-30 font-mono ml-auto">
                  {new Date(record.completedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active step content */}
      <div className="px-5 py-5">
        {status !== 'idle' && status !== 'completed' && status !== 'rejected' && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 bg-[#0f62fe] flex items-center justify-center text-white text-2xs font-bold flex-shrink-0">
              {wf?.currentStep}
            </div>
            <div>
              <p className="text-xs font-semibold text-carbon-gray-100">{currentStepDef?.label}</p>
              <p className="text-2xs text-carbon-gray-50">{currentStepDef?.description}</p>
            </div>
          </div>
        )}
        {renderStepContent()}
      </div>
    </div>
  );
}
