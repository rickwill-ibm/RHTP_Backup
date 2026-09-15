'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AttributionRecord {
  id: string;
  patientName: string;
  payer: string;
  attributedPCP: string;
  attributionMethod: string;
  attributionDate: string;
  discrepancyType: string;
  discrepancyDetail: string;
  contractImpact: string;
  rafImpact: string;
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

// ─── Attribution Summary Card ─────────────────────────────────────────────────
function AttributionSummaryCard({ record }: { record: AttributionRecord }) {
  return (
    <div className="bg-[#f6f2ff] border border-[#d4bbff] p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xs font-semibold px-2 py-0.5 bg-[#e8daff] text-[#6929c4]">
              ATTRIBUTION DISPUTE
            </span>
            <span className="font-mono text-xs font-bold text-carbon-gray-70">{record.id}</span>
          </div>
          <p className="text-sm font-semibold text-carbon-gray-100">{record.patientName}</p>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            {record.payer} · Attributed PCP: {record.attributedPCP}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xs text-carbon-gray-50">RAF Impact</p>
          <p className="font-mono text-base font-bold text-[#da1e28]">{record.rafImpact}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        {[
          { label: 'Attribution Method', value: record.attributionMethod },
          { label: 'Attribution Date', value: record.attributionDate },
          { label: 'Contract Impact', value: record.contractImpact },
          { label: 'Discrepancy Type', value: record.discrepancyType },
          { label: 'Discrepancy Detail', value: record.discrepancyDetail, span: true },
        ].map((f) => (
          <div key={f.label} className={f.span ? 'col-span-2 md:col-span-3' : ''}>
            <p className="carbon-label">{f.label}</p>
            <p className="font-medium text-carbon-gray-100 mt-0.5">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Surface Discrepancy ──────────────────────────────────────────────
interface Step1Props {
  record: AttributionRecord;
  onAdvance: (notes: string) => void;
  onWithdraw: (reason: string) => void;
}

const DISCREPANCY_TYPES = [
  'Wrong PCP attributed — patient primarily sees different provider',
  'Plurality rule misapplied — claims data incomplete',
  'Patient disenrolled — still showing as attributed',
  'Duplicate attribution — patient attributed to two PCPs',
  'Retroactive attribution — no prospective relationship',
  'Out-of-network provider attributed — should be in-network',
];

function Step1SurfaceDiscrepancy({ record, onAdvance, onWithdraw }: Step1Props) {
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState(record.discrepancyType);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="ExclamationTriangleIcon" size={15} className="text-[#da1e28]" />
          Attribution Discrepancy Detected
        </h4>
        <p className="text-xs text-carbon-gray-50">
          Review the attribution record and confirm the type of discrepancy before proceeding to
          evidence collection.
        </p>
      </div>

      {/* Discrepancy type selection */}
      <div>
        <p className="carbon-label mb-2">
          Discrepancy Type <span className="text-[#da1e28]">*</span>
        </p>
        <div className="space-y-1.5">
          {DISCREPANCY_TYPES.map((type) => (
            <label
              key={type}
              className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors
              ${selectedDiscrepancy === type ? 'border-[#6929c4] bg-[#f6f2ff]' : 'border-carbon-gray-20 hover:border-carbon-gray-30 bg-white'}`}
            >
              <input
                type="radio"
                name="discrepancy-type"
                value={type}
                checked={selectedDiscrepancy === type}
                onChange={() => setSelectedDiscrepancy(type)}
                className="mt-0.5 accent-[#6929c4]"
              />
              <span className="text-xs text-carbon-gray-100">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Supporting notes */}
      <div>
        <label className="carbon-label mb-1 block">
          Clinical Basis for Dispute <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={discrepancyNotes}
          onChange={(e) => setDiscrepancyNotes(e.target.value)}
          rows={3}
          placeholder="Describe the clinical or administrative basis for this attribution discrepancy..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] resize-none"
        />
      </div>

      {/* Payer attribution rule reference */}
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3">
        <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
          Payer Attribution Rules Reference
        </p>
        <div className="space-y-1 text-xs text-carbon-gray-50">
          <p>
            • <span className="font-medium text-carbon-gray-70">Plurality Rule:</span> Patient
            attributed to PCP with most E&amp;M visits in prior 12 months
          </p>
          <p>
            • <span className="font-medium text-carbon-gray-70">Prospective Attribution:</span>{' '}
            Requires active PCP relationship at start of performance period
          </p>
          <p>
            • <span className="font-medium text-carbon-gray-70">Dispute Window:</span> 90 days from
            attribution roster publication date
          </p>
          <p>
            • <span className="font-medium text-carbon-gray-70">Required Evidence:</span> Claims
            data, visit history, enrollment records, or clinical attestation
          </p>
        </div>
      </div>

      {/* Withdraw option */}
      {showWithdraw ? (
        <div className="border border-carbon-gray-20 p-3 space-y-2">
          <p className="text-xs font-semibold text-carbon-gray-70">
            Reason for withdrawing dispute flag
          </p>
          <textarea
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            rows={2}
            placeholder="Explain why this attribution discrepancy does not warrant a dispute..."
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-carbon-gray-50 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onWithdraw(withdrawReason)}
              disabled={!withdrawReason.trim()}
              className="carbon-btn-secondary text-xs py-1.5 disabled:opacity-40"
            >
              Confirm Withdraw
            </button>
            <button
              onClick={() => setShowWithdraw(false)}
              className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2 border-t border-carbon-gray-20">
        <button
          onClick={() => setShowWithdraw(true)}
          className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 flex items-center gap-1.5"
        >
          <Icon name="XMarkIcon" size={13} />
          Withdraw Dispute Flag
        </button>
        <button
          onClick={() => onAdvance(`Discrepancy: ${selectedDiscrepancy}. ${discrepancyNotes}`)}
          disabled={!selectedDiscrepancy || !discrepancyNotes.trim()}
          className="carbon-btn-primary text-xs py-2 px-5 disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#6929c4', borderColor: '#6929c4' }}
        >
          Proceed to Evidence Collection
          <Icon name="ArrowRightIcon" size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Gather Clinical Evidence ─────────────────────────────────────────
interface Step2Props {
  record: AttributionRecord;
  onAdvance: (notes: string, sources: string[]) => void;
}

const EVIDENCE_SOURCES = [
  {
    id: 'ev-claims',
    label: 'Claims Visit History',
    description: 'E&M visit claims from prior 12-month period showing primary care relationship',
    icon: 'DocumentTextIcon',
  },
  {
    id: 'ev-enrollment',
    label: 'Enrollment Records',
    description: 'Health plan enrollment data confirming PCP designation at time of attribution',
    icon: 'ClipboardDocumentListIcon',
  },
  {
    id: 'ev-ehr',
    label: 'EHR Encounter Data',
    description: 'Cerner encounter records documenting longitudinal care relationship',
    icon: 'ComputerDesktopIcon',
  },
  {
    id: 'ev-attestation',
    label: 'Physician Attestation',
    description: 'Signed attestation from attributed or correct PCP confirming care relationship',
    icon: 'PencilSquareIcon',
  },
  {
    id: 'ev-referral',
    label: 'Referral Documentation',
    description:
      'Referral orders or care coordination records establishing primary care attribution',
    icon: 'ArrowTopRightOnSquareIcon',
  },
  {
    id: 'ev-hie',
    label: 'HIE Data Extract',
    description:
      'Health information exchange records corroborating visit history across facilities',
    icon: 'CircleStackIcon',
  },
];

function Step2GatherEvidence({ record, onAdvance }: Step2Props) {
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [correctPCP, setCorrectPCP] = useState('');
  const [visitCount, setVisitCount] = useState('');

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const canAdvance = selectedSources.length > 0 && evidenceNotes.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="DocumentMagnifyingGlassIcon" size={15} className="text-[#6929c4]" />
          Gather Clinical Evidence
        </h4>
        <p className="text-xs text-carbon-gray-50">
          Select all evidence sources that support the attribution dispute. At least one source is
          required before submission.
        </p>
      </div>

      {/* Correct PCP field */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="carbon-label mb-1 block">Correct Attributed PCP (if known)</label>
          <input
            type="text"
            value={correctPCP}
            onChange={(e) => setCorrectPCP(e.target.value)}
            placeholder="Dr. First Last, NPI: ..."
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-[#6929c4]"
          />
        </div>
        <div>
          <label className="carbon-label mb-1 block">Qualifying Visit Count (prior 12 mo.)</label>
          <input
            type="number"
            value={visitCount}
            onChange={(e) => setVisitCount(e.target.value)}
            placeholder="e.g. 4"
            min={0}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-[#6929c4]"
          />
        </div>
      </div>

      {/* Evidence source selection */}
      <div>
        <p className="carbon-label mb-2">
          Evidence Sources <span className="text-[#da1e28]">*</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EVIDENCE_SOURCES.map((src) => {
            const selected = selectedSources.includes(src.id);
            return (
              <label
                key={src.id}
                className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors
                ${selected ? 'border-[#6929c4] bg-[#f6f2ff]' : 'border-carbon-gray-20 hover:border-carbon-gray-30 bg-white'}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSource(src.id)}
                  className="mt-0.5 accent-[#6929c4]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon
                      name={src.icon as Parameters<typeof Icon>[0]['name']}
                      size={13}
                      className={selected ? 'text-[#6929c4]' : 'text-carbon-gray-50'}
                    />
                    <span className="text-xs font-semibold text-carbon-gray-100">{src.label}</span>
                  </div>
                  <p className="text-2xs text-carbon-gray-50 leading-tight">{src.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Evidence summary notes */}
      <div>
        <label className="carbon-label mb-1 block">
          Evidence Summary <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={evidenceNotes}
          onChange={(e) => setEvidenceNotes(e.target.value)}
          rows={4}
          placeholder="Summarize the clinical evidence supporting this attribution dispute. Include visit dates, provider names, and any relevant clinical context..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] resize-none"
        />
        <p className="text-2xs text-carbon-gray-50 mt-1">
          {evidenceNotes.length} characters — minimum 50 recommended
        </p>
      </div>

      {/* Selected sources summary */}
      {selectedSources.length > 0 && (
        <div className="bg-[#f6f2ff] border border-[#d4bbff] p-3">
          <p className="text-2xs font-semibold text-[#6929c4] uppercase tracking-wide mb-2">
            {selectedSources.length} Evidence Source{selectedSources.length > 1 ? 's' : ''} Selected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedSources.map((id) => {
              const src = EVIDENCE_SOURCES.find((s) => s.id === id);
              return (
                <span
                  key={id}
                  className="text-2xs bg-[#e8daff] text-[#6929c4] px-2 py-0.5 font-medium"
                >
                  {src?.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-carbon-gray-20">
        <button
          onClick={() =>
            onAdvance(
              `Evidence: ${selectedSources.join(', ')}. Correct PCP: ${correctPCP || 'TBD'}. Visits: ${visitCount || 'N/A'}. ${evidenceNotes}`,
              selectedSources
            )
          }
          disabled={!canAdvance}
          className="carbon-btn-primary text-xs py-2 px-5 disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#6929c4', borderColor: '#6929c4' }}
        >
          Proceed to Payer Submission
          <Icon name="ArrowRightIcon" size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Submit Dispute to Payer ─────────────────────────────────────────
interface Step3Props {
  record: AttributionRecord;
  evidenceSources: string[];
  onComplete: (notes: string) => void;
  onWithdraw: (reason: string) => void;
}

const SUBMISSION_CHANNELS = [
  'Payer Portal — Electronic Dispute Submission',
  'EDI 837 Correction Transaction',
  'Secure Fax — Payer Dispute Department',
  'Payer API — Attribution Correction Endpoint',
  'Manual Letter — Certified Mail',
];

function Step3SubmitDispute({ record, evidenceSources, onComplete, onWithdraw }: Step3Props) {
  const [channel, setChannel] = useState(SUBMISSION_CHANNELS[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [expectedResolution, setExpectedResolution] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const canSubmit = channel && submissionNotes.trim().length > 0 && confirmed;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="PaperAirplaneIcon" size={15} className="text-[#6929c4]" />
          Submit Dispute to Payer
        </h4>
        <p className="text-xs text-carbon-gray-50">
          Review the dispute package and submit to {record.payer}. This action creates an immutable
          audit record.
        </p>
      </div>

      {/* Dispute package summary */}
      <div className="border border-carbon-gray-20 overflow-hidden">
        <div className="bg-carbon-gray-10 px-4 py-2.5 border-b border-carbon-gray-20">
          <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
            Dispute Package Summary
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="carbon-label">Patient</p>
              <p className="font-medium text-carbon-gray-100 mt-0.5">{record.patientName}</p>
            </div>
            <div>
              <p className="carbon-label">Payer</p>
              <p className="font-medium text-carbon-gray-100 mt-0.5">{record.payer}</p>
            </div>
            <div>
              <p className="carbon-label">Current Attributed PCP</p>
              <p className="font-medium text-carbon-gray-100 mt-0.5">{record.attributedPCP}</p>
            </div>
            <div>
              <p className="carbon-label">Discrepancy Type</p>
              <p className="font-medium text-carbon-gray-100 mt-0.5">{record.discrepancyType}</p>
            </div>
          </div>
          <div>
            <p className="carbon-label mb-1.5">
              Evidence Sources Attached ({evidenceSources.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {evidenceSources.length > 0 ? (
                evidenceSources.map((id) => (
                  <span
                    key={id}
                    className="text-2xs bg-[#e8daff] text-[#6929c4] px-2 py-0.5 font-medium flex items-center gap-1"
                  >
                    <Icon name="CheckIcon" size={9} />
                    {id
                      .replace('ev-', '')
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                ))
              ) : (
                <span className="text-2xs text-carbon-gray-50">No evidence sources attached</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-[#fff8f8] border border-[#ffb3b8]">
            <Icon
              name="ExclamationTriangleIcon"
              size={13}
              className="text-[#da1e28] flex-shrink-0"
            />
            <p className="text-2xs text-[#da1e28]">
              <span className="font-semibold">RAF Impact:</span> {record.rafImpact} ·{' '}
              <span className="font-semibold">Contract Impact:</span> {record.contractImpact}
            </p>
          </div>
        </div>
      </div>

      {/* Submission channel */}
      <div>
        <label className="carbon-label mb-1 block">
          Submission Channel <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] bg-white"
        >
          {SUBMISSION_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="carbon-label mb-1 block">Payer Reference / Tracking Number</label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. DISP-2026-00412"
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-[#6929c4]"
          />
        </div>
        <div>
          <label className="carbon-label mb-1 block">Expected Resolution Date</label>
          <input
            type="date"
            value={expectedResolution}
            onChange={(e) => setExpectedResolution(e.target.value)}
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-[#6929c4]"
          />
        </div>
      </div>

      <div>
        <label className="carbon-label mb-1 block">
          Submission Notes <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={submissionNotes}
          onChange={(e) => setSubmissionNotes(e.target.value)}
          rows={3}
          placeholder="Document submission details, any verbal communications with payer, and expected next steps..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#6929c4] resize-none"
        />
      </div>

      {/* Audit trail notice */}
      <div className="bg-[#f0f4ff] border border-[#97c1ff] p-3 flex items-start gap-3">
        <Icon name="ShieldCheckIcon" size={15} className="text-[#0043ce] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-[#0043ce] mb-0.5">Immutable Audit Trail</p>
          <p className="text-2xs text-carbon-gray-70">
            Submitting this dispute creates a permanent, timestamped audit record including your
            identity, role, all evidence sources, submission channel, and payer reference. This
            record cannot be modified after submission.
          </p>
        </div>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 accent-[#6929c4]"
        />
        <span className="text-xs text-carbon-gray-70">
          I confirm that the evidence gathered is accurate and complete, and I authorize submission
          of this attribution dispute to {record.payer} on behalf of the care organization.
        </span>
      </label>

      {/* Withdraw option */}
      {showWithdraw ? (
        <div className="border border-carbon-gray-20 p-3 space-y-2">
          <p className="text-xs font-semibold text-carbon-gray-70">
            Reason for withdrawing dispute
          </p>
          <textarea
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            rows={2}
            placeholder="Explain why this dispute is being withdrawn..."
            className="w-full border border-carbon-gray-30 px-3 py-2 text-xs focus:outline-none focus:border-carbon-gray-50 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onWithdraw(withdrawReason)}
              disabled={!withdrawReason.trim()}
              className="carbon-btn-secondary text-xs py-1.5 disabled:opacity-40"
            >
              Confirm Withdraw
            </button>
            <button
              onClick={() => setShowWithdraw(false)}
              className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2 border-t border-carbon-gray-20">
        <button
          onClick={() => setShowWithdraw(true)}
          className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 flex items-center gap-1.5"
        >
          <Icon name="XMarkIcon" size={13} />
          Withdraw Dispute
        </button>
        <button
          onClick={() =>
            onComplete(
              `Channel: ${channel}. Ref: ${referenceNumber || 'N/A'}. Expected: ${expectedResolution || 'TBD'}. ${submissionNotes}`
            )
          }
          disabled={!canSubmit}
          className="carbon-btn-primary text-xs py-2 px-5 disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#6929c4', borderColor: '#6929c4' }}
        >
          <Icon name="PaperAirplaneIcon" size={13} />
          Submit Dispute to Payer
        </button>
      </div>
    </div>
  );
}

// ─── Completed View ───────────────────────────────────────────────────────────
function CompletedView({ record }: { record: AttributionRecord }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
      <div className="w-14 h-14 bg-[#defbe6] flex items-center justify-center">
        <Icon name="CheckBadgeIcon" size={28} className="text-[#24a148]" />
      </div>
      <div>
        <p className="text-base font-semibold text-carbon-gray-100">
          Dispute Submitted Successfully
        </p>
        <p className="text-xs text-carbon-gray-50 mt-1">
          Attribution dispute for <span className="font-medium">{record.patientName}</span> has been
          submitted to <span className="font-medium">{record.payer}</span>.
        </p>
      </div>
      <div className="bg-[#f6f2ff] border border-[#d4bbff] p-4 w-full max-w-sm text-left space-y-2">
        <p className="text-2xs font-semibold text-[#6929c4] uppercase tracking-wide">
          Dispute Record
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Status</span>
            <span className="font-semibold text-[#24a148]">Submitted to Payer</span>
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">RAF Impact</span>
            <span className="font-mono font-semibold text-carbon-gray-100">{record.rafImpact}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-carbon-gray-50">Contract Impact</span>
            <span className="font-mono font-semibold text-carbon-gray-100">
              {record.contractImpact}
            </span>
          </div>
        </div>
      </div>
      <p className="text-2xs text-carbon-gray-50">
        Full audit trail available in the Actions &amp; Tasks tab → Attribution Dispute Trail
      </p>
    </div>
  );
}

// ─── Withdrawn View ───────────────────────────────────────────────────────────
function WithdrawnView({ record }: { record: AttributionRecord }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
      <div className="w-12 h-12 bg-[#fdf6dd] flex items-center justify-center">
        <Icon name="XCircleIcon" size={24} className="text-[#b45309]" />
      </div>
      <p className="text-sm font-semibold text-carbon-gray-100">Dispute Withdrawn</p>
      <p className="text-xs text-carbon-gray-50">
        The attribution dispute for <span className="font-medium">{record.patientName}</span> has
        been withdrawn and logged in the audit trail.
      </p>
    </div>
  );
}

// ─── Main Journey Component ───────────────────────────────────────────────────
interface AttributionDisputeJourneyProps {
  disputeId: string;
  record: AttributionRecord;
  onClose: () => void;
}

export default function AttributionDisputeJourney({
  disputeId,
  record,
  onClose,
}: AttributionDisputeJourneyProps) {
  const { user } = useAppContext();
  const {
    getWorkflow,
    getWorkflowStatus,
    startWorkflow,
    advanceStep,
    completeWorkflow,
    rejectWorkflow,
    resetWorkflow,
  } = useWorkflowMachine();
  const wfDef = workflowDefinitions['attribution-dispute'];
  const wf = getWorkflow('attribution-dispute', disputeId);
  const status = getWorkflowStatus('attribution-dispute', disputeId);

  // Local evidence sources state (passed between steps)
  const [evidenceSources, setEvidenceSources] = useState<string[]>([]);

  const userName = user?.name ?? 'Care Manager';
  const userRole = user?.role ?? 'care_manager';

  // Start workflow if not started
  const handleStart = () => {
    startWorkflow('attribution-dispute', disputeId, userName, userRole);
  };

  const handleStep1Advance = (notes: string) => {
    if (!wf) return;
    advanceStep('attribution-dispute', disputeId, userName, userRole, notes);
  };

  const handleStep2Advance = (notes: string, sources: string[]) => {
    setEvidenceSources(sources);
    advanceStep('attribution-dispute', disputeId, userName, userRole, notes);
  };

  const handleStep3Complete = (notes: string) => {
    completeWorkflow('attribution-dispute', disputeId, userName, userRole, notes);
  };

  const handleWithdraw = (reason: string) => {
    rejectWorkflow('attribution-dispute', disputeId, userName, userRole, `Withdrawn: ${reason}`);
  };

  const handleReset = () => {
    resetWorkflow('attribution-dispute', disputeId);
    setEvidenceSources([]);
  };

  return (
    <div className="border border-[#d4bbff] bg-white overflow-hidden mt-3">
      {/* Journey header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f6f2ff] border-b border-[#d4bbff]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
            <Icon name="ScaleIcon" size={14} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-carbon-gray-100">
              Attribution Dispute Journey
            </p>
            <p className="text-2xs text-carbon-gray-50">
              {record.payer} · {record.patientName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(status === 'completed' || status === 'rejected') && (
            <button
              onClick={handleReset}
              className="text-2xs text-carbon-gray-50 hover:text-carbon-gray-100 flex items-center gap-1 px-2 py-1 border border-carbon-gray-20 hover:border-carbon-gray-30"
            >
              <Icon name="ArrowPathIcon" size={11} />
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="XMarkIcon" size={15} />
          </button>
        </div>
      </div>

      {/* Step indicator */}
      {status !== 'idle' && (
        <div className="px-6 pt-4 pb-2 border-b border-carbon-gray-20">
          <StepIndicator steps={wfDef.steps} currentStep={wf?.currentStep ?? 1} status={status} />
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {status === 'idle' && (
          <div className="space-y-4">
            <AttributionSummaryCard record={record} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-carbon-gray-100">
                  Ready to initiate attribution dispute workflow
                </p>
                <p className="text-2xs text-carbon-gray-50 mt-0.5">
                  3-step process: Surface Discrepancy → Gather Evidence → Submit to Payer
                </p>
              </div>
              <button
                onClick={handleStart}
                className="carbon-btn-primary text-xs py-2 px-5 flex items-center gap-2"
                style={{ background: '#6929c4', borderColor: '#6929c4' }}
              >
                <Icon name="PlayIcon" size={13} />
                Begin Dispute Workflow
              </button>
            </div>
          </div>
        )}

        {status === 'in-progress' && wf?.currentStep === 1 && (
          <>
            <div className="mb-4">
              <AttributionSummaryCard record={record} />
            </div>
            <Step1SurfaceDiscrepancy
              record={record}
              onAdvance={handleStep1Advance}
              onWithdraw={handleWithdraw}
            />
          </>
        )}

        {status === 'in-progress' && wf?.currentStep === 2 && (
          <Step2GatherEvidence record={record} onAdvance={handleStep2Advance} />
        )}

        {(status === 'in-progress' || status === 'awaiting-review') && wf?.currentStep === 3 && (
          <Step3SubmitDispute
            record={record}
            evidenceSources={evidenceSources}
            onComplete={handleStep3Complete}
            onWithdraw={handleWithdraw}
          />
        )}

        {status === 'completed' && <CompletedView record={record} />}
        {status === 'rejected' && <WithdrawnView record={record} />}
      </div>
    </div>
  );
}
