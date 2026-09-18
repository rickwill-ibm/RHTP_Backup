'use client';
// Financial dashboard action bar driven by the central action registry
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import type { ActionDefinition } from '@/lib/actionRegistry';
import { mockPatients, mockHighCostPatients } from '@/lib/mockData';
import { exportFinancialCSV, generatePDFReport } from '@/lib/exportUtils';

// ─── Flag High Cost Modal ─────────────────────────────────────────────────────
function FlagHighCostModal({ onClose }: { onClose: () => void }) {
  const [selectedPatient, setSelectedPatient] = useState('');
  const [flagReason, setFlagReason] = useState<
    'Inpatient' | 'ER' | 'Specialty' | 'Pharmacy' | 'Other'
  >('Inpatient');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'Routine' | 'Urgent' | 'Critical'>('Routine');
  const [submitted, setSubmitted] = useState(false);
  const [flagId, setFlagId] = useState('');

  const highCostList = mockHighCostPatients ?? [];

  const handleSubmit = () => {
    if (!selectedPatient) {
      toast.error('Please select a patient to flag');
      return;
    }
    const id = `FLAG-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    setFlagId(id);
    setSubmitted(true);
    toast.success(`Patient flagged for cost management review (${id})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-carbon-gray-20 shadow-carbon-lg w-[480px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#f1c21b] flex items-center justify-center">
              <Icon name="FlagIcon" size={16} className="text-[#161616]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-carbon-gray-100">Flag High Cost Patient</h3>
              <p className="text-2xs text-carbon-gray-50">
                Medicare MSSP Track 3 — Cost Management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 space-y-4">
            {/* Success state */}
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <div className="w-14 h-14 bg-[#fdf6dd] flex items-center justify-center">
                <Icon name="FlagIcon" size={28} className="text-[#b45309]" />
              </div>
              <div>
                <p className="text-sm font-bold text-carbon-gray-100">Patient Flagged</p>
                <p className="text-xs text-carbon-gray-50 mt-1">
                  Cost management flag has been logged and routed to the finance team.
                </p>
              </div>
            </div>
            <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-semibold text-[#b45309] uppercase tracking-wide">
                  Flag Receipt
                </p>
                <span className="text-2xs font-mono font-bold text-[#b45309]">{flagId}</span>
              </div>
              <div className="flex justify-between text-2xs border-t border-[#f1c21b] pt-2">
                <span className="text-carbon-gray-70">Patient</span>
                <span className="font-medium text-carbon-gray-100">
                  {highCostList.find((p) => p.id === selectedPatient)?.name ?? selectedPatient}
                </span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Cost Driver</span>
                <span className="font-medium text-carbon-gray-100">{flagReason}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Priority</span>
                <span
                  className={`font-bold ${priority === 'Critical' ? 'text-[#da1e28]' : priority === 'Urgent' ? 'text-[#b45309]' : 'text-[#0e6027]'}`}
                >
                  {priority}
                </span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Flagged</span>
                <span className="font-medium text-carbon-gray-100">
                  {new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {note.trim() && (
                <div className="border-t border-[#f1c21b] pt-2">
                  <p className="text-2xs text-carbon-gray-70 mb-1">Clinical Note</p>
                  <p className="text-2xs text-carbon-gray-100 italic">{note}</p>
                </div>
              )}
            </div>
            <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2.5 flex items-center gap-2">
              <Icon
                name="InformationCircleIcon"
                size={14}
                className="text-[#0043ce] flex-shrink-0"
              />
              <p className="text-2xs text-[#0043ce]">
                Finance team will review within 2 business days. A cost review request has been
                auto-generated.
              </p>
            </div>
            <button className="carbon-btn-primary w-full justify-center py-2.5" onClick={onClose}>
              <Icon name="CheckCircleIcon" size={15} />
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Patient selector */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Select Patient <span className="text-[#da1e28]">*</span>
              </label>
              <select
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
                className="w-full border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
              >
                <option value="">— Select a high-cost patient —</option>
                {highCostList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ${p.pmpm?.toLocaleString()} PMPM · {p.topDriver}
                  </option>
                ))}
              </select>
            </div>

            {/* Cost driver */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Primary Cost Driver
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['Inpatient', 'ER', 'Specialty', 'Pharmacy', 'Other'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setFlagReason(r)}
                    className={`py-1.5 text-2xs font-semibold border transition-colors ${
                      flagReason === r
                        ? r === 'Inpatient'
                          ? 'bg-[#da1e28] text-white border-[#da1e28]'
                          : r === 'ER'
                            ? 'bg-[#b45309] text-white border-[#b45309]'
                            : r === 'Specialty'
                              ? 'bg-[#0043ce] text-white border-[#0043ce]'
                              : r === 'Pharmacy'
                                ? 'bg-[#6929c4] text-white border-[#6929c4]'
                                : 'bg-carbon-gray-70 text-white border-carbon-gray-70'
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Review Priority
              </label>
              <div className="flex gap-2">
                {(['Routine', 'Urgent', 'Critical'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 text-xs font-semibold border transition-colors ${
                      priority === p
                        ? p === 'Critical'
                          ? 'bg-[#da1e28] text-white border-[#da1e28]'
                          : p === 'Urgent'
                            ? 'bg-[#f1c21b] text-[#161616] border-[#f1c21b]'
                            : 'bg-[#0f62fe] text-white border-[#0f62fe]'
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Clinical Note <span className="text-carbon-gray-50 font-normal">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe the cost concern, recent utilization events, or clinical context..."
                rows={3}
                className="w-full border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-xs text-carbon-gray-100 placeholder-carbon-gray-50 focus:outline-none focus:border-[#0f62fe] resize-none"
              />
            </div>

            {/* Summary preview */}
            {selectedPatient && (
              <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3 space-y-1.5">
                <p className="text-2xs font-semibold text-[#b45309] uppercase tracking-wide">
                  Flag Summary
                </p>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-70">Patient</span>
                  <span className="font-medium text-carbon-gray-100">
                    {highCostList.find((p) => p.id === selectedPatient)?.name}
                  </span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-70">PMPM</span>
                  <span className="font-mono font-semibold text-[#da1e28]">
                    ${highCostList.find((p) => p.id === selectedPatient)?.pmpm?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-70">Driver</span>
                  <span className="font-medium text-carbon-gray-100">{flagReason}</span>
                </div>
                <div className="flex justify-between text-2xs">
                  <span className="text-carbon-gray-70">Priority</span>
                  <span
                    className={`font-bold ${priority === 'Critical' ? 'text-[#da1e28]' : priority === 'Urgent' ? 'text-[#b45309]' : 'text-[#0043ce]'}`}
                  >
                    {priority}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button className="carbon-btn-secondary flex-1 justify-center py-2" onClick={onClose}>
                Cancel
              </button>
              <button
                className="carbon-btn-primary flex-1 justify-center py-2.5"
                onClick={handleSubmit}
              >
                <Icon name="FlagIcon" size={14} />
                Submit Flag
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Request Cost Review Modal ────────────────────────────────────────────────
function RequestCostReviewModal({ onClose }: { onClose: () => void }) {
  const { user } = useAppContext();
  const [reviewType, setReviewType] = useState<
    'Outlier Analysis' | 'Utilization Review' | 'RAF Reconciliation' | 'Contract Variance'
  >('Outlier Analysis');
  const [urgency, setUrgency] = useState<'Standard' | 'Expedited' | 'Immediate'>('Standard');
  const [scope, setScope] = useState<'Single Patient' | 'Cohort Segment' | 'Full Panel'>(
    'Cohort Segment'
  );
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [reviewId, setReviewId] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');

  const handleSubmit = () => {
    const id = `CRV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const now = new Date();
    const ts =
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' +
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    setReviewId(id);
    setSubmittedAt(ts);
    setSubmitted(true);
    toast.success(`Cost review request submitted (${id})`, {
      description: `${urgency} · ${reviewType}`,
    });
  };

  const etaDays =
    urgency === 'Immediate'
      ? '1 business day'
      : urgency === 'Expedited'
        ? '3 business days'
        : '5–7 business days';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-carbon-gray-20 shadow-carbon-lg w-[500px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center">
              <Icon name="DocumentMagnifyingGlassIcon" size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-carbon-gray-100">Request Cost Review</h3>
              <p className="text-2xs text-carbon-gray-50">Medicare MSSP Track 3 — Finance Team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 space-y-4">
            {/* Success state */}
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <div className="w-14 h-14 bg-[#defbe6] flex items-center justify-center">
                <Icon name="CheckCircleIcon" size={32} className="text-[#24a148]" />
              </div>
              <div>
                <p className="text-sm font-bold text-carbon-gray-100">Cost Review Requested</p>
                <p className="text-xs text-carbon-gray-50 mt-1">
                  Your request has been submitted to the finance team for review.
                </p>
              </div>
            </div>
            <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-semibold text-[#0e6027] uppercase tracking-wide">
                  Review Receipt
                </p>
                <span className="text-2xs font-mono font-bold text-[#0e6027]">{reviewId}</span>
              </div>
              <div className="flex justify-between text-2xs border-t border-[#a7f0ba] pt-2">
                <span className="text-carbon-gray-70">Submitted</span>
                <span className="font-medium text-carbon-gray-100">{submittedAt}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Requested By</span>
                <span className="font-medium text-carbon-gray-100">{user.name}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Review Type</span>
                <span className="font-medium text-carbon-gray-100">{reviewType}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Scope</span>
                <span className="font-medium text-carbon-gray-100">{scope}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Urgency</span>
                <span
                  className={`font-bold ${urgency === 'Immediate' ? 'text-[#da1e28]' : urgency === 'Expedited' ? 'text-[#b45309]' : 'text-[#0e6027]'}`}
                >
                  {urgency}
                </span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Expected Response</span>
                <span className="font-medium text-carbon-gray-100">{etaDays}</span>
              </div>
              {note.trim() && (
                <div className="border-t border-[#a7f0ba] pt-2">
                  <p className="text-2xs text-carbon-gray-70 mb-1">Request Note</p>
                  <p className="text-2xs text-carbon-gray-100 italic">{note}</p>
                </div>
              )}
            </div>
            <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2.5 flex items-center gap-2">
              <Icon name="ClockIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
              <p className="text-2xs text-[#0043ce]">
                Finance team will respond within {etaDays}. You will be notified when the review is
                complete.
              </p>
            </div>
            <button className="carbon-btn-primary w-full justify-center py-2.5" onClick={onClose}>
              <Icon name="CheckCircleIcon" size={15} />
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Review type */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Review Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    'Outlier Analysis',
                    'Utilization Review',
                    'RAF Reconciliation',
                    'Contract Variance',
                  ] as const
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => setReviewType(t)}
                    className={`py-2 px-3 text-xs font-semibold border text-left transition-colors ${
                      reviewType === t
                        ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Review Scope
              </label>
              <div className="flex gap-2">
                {(['Single Patient', 'Cohort Segment', 'Full Panel'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`flex-1 py-2 text-xs font-semibold border transition-colors ${
                      scope === s
                        ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Urgency
              </label>
              <div className="flex gap-2">
                {(['Standard', 'Expedited', 'Immediate'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUrgency(u)}
                    className={`flex-1 py-2 text-xs font-semibold border transition-colors ${
                      urgency === u
                        ? u === 'Immediate'
                          ? 'bg-[#da1e28] text-white border-[#da1e28]'
                          : u === 'Expedited'
                            ? 'bg-[#f1c21b] text-[#161616] border-[#f1c21b]'
                            : 'bg-[#0f62fe] text-white border-[#0f62fe]'
                        : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <p className="text-2xs text-carbon-gray-50 mt-1">Expected response: {etaDays}</p>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
                Request Details <span className="text-carbon-gray-50 font-normal">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe the cost concern, specific patients or segments to review, relevant contract benchmarks..."
                rows={3}
                className="w-full border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-xs text-carbon-gray-100 placeholder-carbon-gray-50 focus:outline-none focus:border-[#0f62fe] resize-none"
              />
            </div>

            {/* Summary */}
            <div className="bg-[#edf5ff] border border-[#97c1ff] px-4 py-3 space-y-1.5">
              <p className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide">
                Request Summary
              </p>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Type</span>
                <span className="font-medium text-carbon-gray-100">{reviewType}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Scope</span>
                <span className="font-medium text-carbon-gray-100">{scope}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Urgency</span>
                <span
                  className={`font-bold ${urgency === 'Immediate' ? 'text-[#da1e28]' : urgency === 'Expedited' ? 'text-[#b45309]' : 'text-[#0043ce]'}`}
                >
                  {urgency}
                </span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Requested By</span>
                <span className="font-medium text-carbon-gray-100">{user.name}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button className="carbon-btn-secondary flex-1 justify-center py-2" onClick={onClose}>
                Cancel
              </button>
              <button
                className="carbon-btn-primary flex-1 justify-center py-2.5"
                onClick={handleSubmit}
              >
                <Icon name="DocumentMagnifyingGlassIcon" size={14} />
                Submit Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Financial Action Bar ─────────────────────────────────────────────────────
export default function FinancialActionBar() {
  const { getActions, user } = useAppContext();
  const actions = getActions('financial-dashboard');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleAction = (action: ActionDefinition) => {
    if (action.id === 'act-export-financial') {
      exportFinancialCSV(mockPatients);
      toast.success('Financial CSV downloaded', {
        description: `${mockPatients.length} patients exported for payer reconciliation`,
      });
      return;
    }
    if (action.id === 'act-flag-cost') {
      setShowFlagModal(true);
      return;
    }
    if (action.id === 'act-request-review') {
      setShowReviewModal(true);
      return;
    }
    toast.success(`Action: ${action.label}`, { description: action.description });
  };

  const handleFinancialReport = () => {
    const patients = mockPatients;
    const totalPmpm = patients.reduce((s, p) => s + p.pmpmCost, 0);
    const avgPmpm = Math.round(totalPmpm / patients.length);
    const totalHccValue = patients.reduce((s, p) => s + p.hccSuspectValue, 0);
    const highCost = patients.filter((p) => p.pmpmCost > 1000);
    const avgRaf = (patients.reduce((s, p) => s + p.rafScore, 0) / patients.length).toFixed(2);

    generatePDFReport({
      reportTitle: 'Financial Dashboard Report — Medicare MSSP Track 3',
      subtitle: 'Cost Envelope & RAF Revenue Summary',
      generatedBy: user.name,
      sections: [
        {
          title: 'Financial Summary',
          rows: [
            { label: 'Total Attributed Patients', value: String(patients.length) },
            { label: 'Average PMPM Cost', value: `$${avgPmpm.toLocaleString()}` },
            { label: 'PMPM Target', value: '$890' },
            {
              label: 'PMPM Variance',
              value: `$${(avgPmpm - 890).toLocaleString()} (${(((avgPmpm - 890) / 890) * 100).toFixed(1)}%)`,
            },
            { label: 'High-Cost Patients (>$1K PMPM)', value: `${highCost.length} patients` },
            { label: 'Average RAF Score', value: avgRaf },
            { label: 'Total HCC Revenue at Risk', value: `$${totalHccValue.toLocaleString()}` },
            { label: 'Report Period', value: 'Q1 2026 (Jan–Mar)' },
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
          title: 'Cost Distribution by Risk Tier',
          rows: [
            {
              label: 'Critical',
              value: `Avg PMPM: $${Math.round(patients.filter((p) => p.riskTier === 'Critical').reduce((s, p) => s + p.pmpmCost, 0) / Math.max(1, patients.filter((p) => p.riskTier === 'Critical').length)).toLocaleString()}`,
            },
            {
              label: 'High',
              value: `Avg PMPM: $${Math.round(patients.filter((p) => p.riskTier === 'High').reduce((s, p) => s + p.pmpmCost, 0) / Math.max(1, patients.filter((p) => p.riskTier === 'High').length)).toLocaleString()}`,
            },
            {
              label: 'Moderate',
              value: `Avg PMPM: $${Math.round(patients.filter((p) => p.riskTier === 'Moderate').reduce((s, p) => s + p.pmpmCost, 0) / Math.max(1, patients.filter((p) => p.riskTier === 'Moderate').length)).toLocaleString()}`,
            },
            {
              label: 'Low',
              value: `Avg PMPM: $${Math.round(patients.filter((p) => p.riskTier === 'Low').reduce((s, p) => s + p.pmpmCost, 0) / Math.max(1, patients.filter((p) => p.riskTier === 'Low').length)).toLocaleString()}`,
            },
          ],
        },
      ],
      tableHeaders: [
        'Patient Name',
        'Risk Tier',
        'PMPM Cost',
        'PMPM Target',
        'Variance',
        'RAF Score',
        'HCC Revenue at Risk',
      ],
      tableRows: patients
        .sort((a, b) => b.pmpmCost - a.pmpmCost)
        .slice(0, 20)
        .map((p) => [
          p.name,
          p.riskTier,
          `$${p.pmpmCost.toLocaleString()}`,
          `$${p.pmpmTarget.toLocaleString()}`,
          `$${(p.pmpmCost - p.pmpmTarget).toLocaleString()}`,
          p.rafScore.toFixed(2),
          `$${p.hccSuspectValue.toLocaleString()}`,
        ]),
    });
    toast.success('Financial report opened', {
      description: "Use your browser's Print dialog to save as PDF",
    });
  };

  if (actions.length === 0) return null;

  const btnClass = (variant: ActionDefinition['variant']) => {
    const base = 'flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors';
    switch (variant) {
      case 'primary':
        return `${base} bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]`;
      case 'warning':
        return `${base} bg-[#fdf6dd] text-[#b45309] border-[#f1c21b] hover:bg-[#f1c21b]/30`;
      case 'secondary':
        return `${base} bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10`;
      default:
        return `${base} bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10`;
    }
  };

  return (
    <>
      <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap mb-4">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
          Financial Actions
        </span>
        {/* PDF Report button */}
        <button
          className={btnClass('secondary')}
          title="Generate PDF financial summary report"
          onClick={handleFinancialReport}
        >
          <Icon name="DocumentChartBarIcon" size={13} />
          Financial Report
        </button>
        {actions.map((action) => (
          <button
            key={action.id}
            className={btnClass(action.variant)}
            title={action.description}
            onClick={() => handleAction(action)}
          >
            <Icon name={action.icon as any} size={13} />
            {action.shortLabel ?? action.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-carbon-gray-50">Role:</span>
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 ${user.role === 'physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
          >
            {user.role === 'physician' ? 'Physician' : 'Care Manager'}
          </span>
        </div>
      </div>

      {showFlagModal && <FlagHighCostModal onClose={() => setShowFlagModal(false)} />}
      {showReviewModal && <RequestCostReviewModal onClose={() => setShowReviewModal(false)} />}
    </>
  );
}
