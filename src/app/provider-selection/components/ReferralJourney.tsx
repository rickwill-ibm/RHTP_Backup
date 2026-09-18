'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import { useAppContext } from '@/lib/appContext';
import { workflowDefinitions } from '@/lib/actionRegistry';
import type { Provider } from '@/lib/mockData';

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

// ─── Provider Summary Card ────────────────────────────────────────────────────
function ProviderSummaryCard({ provider }: { provider: Provider }) {
  const tierColors: Record<string, string> = {
    Preferred: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
    'In-Network': 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
    'Out-of-Network': 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  };
  return (
    <div className="bg-[#edf5ff] border border-[#97c1ff] p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">
              {provider.name
                .split(' ')
                .map((w) => w[0])
                .slice(1, 3)
                .join('')}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-2xs font-semibold px-2 py-0.5 border ${tierColors[provider.networkTier] ?? 'bg-carbon-gray-10 text-carbon-gray-70'}`}
              >
                {provider.networkTier}
              </span>
              {provider.vbcAligned && (
                <span className="text-2xs px-1.5 py-0.5 bg-[#d0e2ff] text-[#0043ce] font-semibold">
                  VBC Aligned
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-carbon-gray-100">{provider.name}</p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              {provider.specialty} · NPI: {provider.npi}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xs text-carbon-gray-50">Quality Score</p>
          <p
            className={`font-mono text-base font-bold ${provider.qualityScore >= 90 ? 'text-[#24a148]' : provider.qualityScore >= 80 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
          >
            {provider.qualityScore}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {[
          { label: 'Affiliated Facility', value: provider.affiliatedFacility },
          { label: 'Avg Wait Time', value: `${provider.avgWaitDays} days` },
          { label: 'Distance', value: `${provider.distance} mi` },
          {
            label: 'Accepting Patients',
            value: provider.acceptingNewPatients ? 'Yes' : 'Waitlist',
          },
        ].map((f) => (
          <div key={f.label}>
            <p className="carbon-label">{f.label}</p>
            <p className="font-medium text-carbon-gray-100 mt-0.5">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Select Provider ──────────────────────────────────────────────────
interface Step1Props {
  provider: Provider;
  onConfirm: (specialty: string, urgency: string, notes: string) => void;
  onCancel: () => void;
}

const REFERRAL_SPECIALTIES = [
  'Cardiology',
  'Ophthalmology',
  'Endocrinology',
  'Nephrology',
  'Pulmonology',
  'Neurology',
  'Orthopedics',
  'Gastroenterology',
  'Oncology',
  'Rheumatology',
];

const URGENCY_LEVELS = [
  {
    value: 'routine',
    label: 'Routine',
    desc: 'Non-urgent, schedule within 30 days',
    color: 'text-[#24a148]',
  },
  { value: 'urgent', label: 'Urgent', desc: 'Schedule within 7 days', color: 'text-[#b45309]' },
  { value: 'stat', label: 'STAT', desc: 'Immediate — within 24–48 hours', color: 'text-[#da1e28]' },
];

function Step1SelectProvider({ provider, onConfirm, onCancel }: Step1Props) {
  const [specialty, setSpecialty] = useState(provider.specialty);
  const [urgency, setUrgency] = useState('routine');
  const [clinicalReason, setClinicalReason] = useState('');
  const [icdCode, setIcdCode] = useState('');

  const canAdvance = specialty && urgency && clinicalReason.trim().length >= 10;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="UserCircleIcon" size={15} className="text-[#0f62fe]" />
          Confirm Provider Selection
        </h4>
        <p className="text-xs text-carbon-gray-50">
          Review the selected provider and specify the referral specialty, urgency, and clinical
          reason before proceeding.
        </p>
      </div>

      {/* Referral specialty */}
      <div>
        <label className="carbon-label mb-1 block">
          Referral Specialty <span className="text-[#da1e28]">*</span>
        </label>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] bg-white"
        >
          {REFERRAL_SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Urgency */}
      <div>
        <p className="carbon-label mb-2">
          Urgency Level <span className="text-[#da1e28]">*</span>
        </p>
        <div className="space-y-1.5">
          {URGENCY_LEVELS.map((u) => (
            <label
              key={u.value}
              className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors
              ${urgency === u.value ? 'border-[#0f62fe] bg-[#edf5ff]' : 'border-carbon-gray-20 hover:border-carbon-gray-30 bg-white'}`}
            >
              <input
                type="radio"
                name="urgency"
                value={u.value}
                checked={urgency === u.value}
                onChange={() => setUrgency(u.value)}
                className="mt-0.5 accent-[#0f62fe]"
              />
              <div>
                <span className={`text-xs font-semibold ${u.color}`}>{u.label}</span>
                <p className="text-2xs text-carbon-gray-50 mt-0.5">{u.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Clinical reason */}
      <div>
        <label className="carbon-label mb-1 block">
          Clinical Reason for Referral <span className="text-[#da1e28]">*</span>
        </label>
        <textarea
          value={clinicalReason}
          onChange={(e) => setClinicalReason(e.target.value)}
          rows={3}
          placeholder="Describe the clinical indication, relevant diagnoses, and reason for specialist referral..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
        <p className="text-2xs text-carbon-gray-30 mt-1">{clinicalReason.length} chars (min 10)</p>
      </div>

      {/* ICD-10 code */}
      <div>
        <label className="carbon-label mb-1 block">Primary ICD-10 Code</label>
        <input
          type="text"
          value={icdCode}
          onChange={(e) => setIcdCode(e.target.value.toUpperCase())}
          placeholder="e.g. I50.9, E11.9, H35.30"
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
        />
      </div>

      {/* Network compliance notice */}
      {provider.networkTier === 'Out-of-Network' && (
        <div className="flex items-start gap-3 p-3 bg-[#fff8f8] border border-[#ffb3b8]">
          <Icon
            name="ExclamationTriangleIcon"
            size={14}
            className="text-[#da1e28] flex-shrink-0 mt-0.5"
          />
          <p className="text-xs text-[#da1e28]">
            <span className="font-semibold">Out-of-Network Warning:</span> This provider is outside
            the contracted network. Prior authorization may be required. Consider selecting a
            Preferred or In-Network provider to reduce patient cost-sharing.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() =>
            onConfirm(
              specialty,
              urgency,
              `Specialty: ${specialty} | Urgency: ${urgency} | ICD: ${icdCode || 'N/A'} | Reason: ${clinicalReason}`
            )
          }
          disabled={!canAdvance}
          className="carbon-btn-primary text-xs py-2 disabled:opacity-40"
        >
          <Icon name="ArrowRightCircleIcon" size={14} />
          Confirm Provider — Proceed to EMR Submission
        </button>
        <button onClick={onCancel} className="carbon-btn-secondary text-xs py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Submit to EMR ────────────────────────────────────────────────────
interface Step2Props {
  provider: Provider;
  onSubmit: (channel: string, notes: string) => void;
  onBack: () => void;
}

const EMR_CHANNELS = [
  {
    value: 'cerner-order',
    label: 'Cerner Order Entry',
    desc: 'Direct referral order via Cerner PowerChart',
    icon: 'ComputerDesktopIcon',
  },
  {
    value: 'direct-message',
    label: 'Direct Secure Message',
    desc: 'Send referral via Direct Messaging protocol',
    icon: 'EnvelopeIcon',
  },
  {
    value: 'fax',
    label: 'Fax Transmission',
    desc: 'Fax referral packet to provider office',
    icon: 'PrinterIcon',
  },
  {
    value: 'phone',
    label: 'Phone Coordination',
    desc: 'Verbal referral with follow-up documentation',
    icon: 'PhoneIcon',
  },
];

const REQUIRED_DOCUMENTS = [
  { id: 'doc-summary', label: 'Patient Summary / Problem List', required: true },
  { id: 'doc-labs', label: 'Recent Lab Results (90 days)', required: true },
  { id: 'doc-meds', label: 'Current Medication List', required: true },
  { id: 'doc-imaging', label: 'Relevant Imaging Reports', required: false },
  { id: 'doc-consult', label: 'Prior Specialist Consult Notes', required: false },
  { id: 'doc-auth', label: 'Prior Authorization (if required)', required: false },
];

function Step2SubmitToEMR({ provider, onSubmit, onBack }: Step2Props) {
  const [channel, setChannel] = useState('cerner-order');
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(
    new Set(['doc-summary', 'doc-labs', 'doc-meds'])
  );
  const [referralNotes, setReferralNotes] = useState('');
  const [appointmentPref, setAppointmentPref] = useState('');
  const [confirmGate, setConfirmGate] = useState(false);

  const toggleDoc = (id: string) => {
    setCheckedDocs((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const requiredDocsMet = REQUIRED_DOCUMENTS.filter((d) => d.required).every((d) =>
    checkedDocs.has(d.id)
  );
  const canSubmit = channel && requiredDocsMet && confirmGate;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="PaperAirplaneIcon" size={15} className="text-[#0f62fe]" />
          Submit Referral to EMR
        </h4>
        <p className="text-xs text-carbon-gray-50">
          Select the submission channel, confirm required documents are attached, and submit the
          referral order to {provider.name}.
        </p>
      </div>

      {/* Submission channel */}
      <div>
        <p className="carbon-label mb-2">
          Submission Channel <span className="text-[#da1e28]">*</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EMR_CHANNELS.map((ch) => (
            <label
              key={ch.value}
              className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors
              ${channel === ch.value ? 'border-[#0f62fe] bg-[#edf5ff]' : 'border-carbon-gray-20 hover:border-carbon-gray-30 bg-white'}`}
            >
              <input
                type="radio"
                name="emr-channel"
                value={ch.value}
                checked={channel === ch.value}
                onChange={() => setChannel(ch.value)}
                className="mt-0.5 accent-[#0f62fe]"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <Icon
                    name={ch.icon as 'ComputerDesktopIcon'}
                    size={12}
                    className="text-[#0f62fe]"
                  />
                  <span className="text-xs font-semibold text-carbon-gray-100">{ch.label}</span>
                </div>
                <p className="text-2xs text-carbon-gray-50 mt-0.5">{ch.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Document checklist */}
      <div>
        <p className="carbon-label mb-2">Referral Documentation Checklist</p>
        <div className="space-y-1.5">
          {REQUIRED_DOCUMENTS.map((doc) => (
            <label
              key={doc.id}
              className={`flex items-center gap-3 p-2.5 border cursor-pointer transition-colors
              ${checkedDocs.has(doc.id) ? 'border-[#24a148] bg-[#defbe6]/30' : 'border-carbon-gray-20 hover:border-carbon-gray-30'}`}
            >
              <input
                type="checkbox"
                checked={checkedDocs.has(doc.id)}
                onChange={() => toggleDoc(doc.id)}
                className="accent-[#24a148]"
              />
              <span className="text-xs text-carbon-gray-100 flex-1">{doc.label}</span>
              {doc.required && (
                <span className="text-2xs text-[#da1e28] font-semibold">Required</span>
              )}
            </label>
          ))}
        </div>
        {!requiredDocsMet && (
          <p className="text-2xs text-[#da1e28] mt-1.5 flex items-center gap-1">
            <Icon name="ExclamationCircleIcon" size={11} />
            All required documents must be confirmed before submission.
          </p>
        )}
      </div>

      {/* Appointment preference */}
      <div>
        <label className="carbon-label mb-1 block">
          Appointment Preference / Special Instructions
        </label>
        <input
          type="text"
          value={appointmentPref}
          onChange={(e) => setAppointmentPref(e.target.value)}
          placeholder="e.g. Morning appointments preferred, interpreter needed, wheelchair accessible..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe]"
        />
      </div>

      {/* Submission notes */}
      <div>
        <label className="carbon-label mb-1 block">Submission Notes</label>
        <textarea
          value={referralNotes}
          onChange={(e) => setReferralNotes(e.target.value)}
          rows={2}
          placeholder="Additional notes for the receiving provider or care coordinator..."
          className="w-full border border-carbon-gray-30 px-3 py-2 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#0f62fe] resize-none"
        />
      </div>

      {/* Cerner integration notice */}
      {channel === 'cerner-order' && (
        <div className="flex items-start gap-3 p-3 bg-[#edf5ff] border border-[#97c1ff]">
          <Icon
            name="InformationCircleIcon"
            size={14}
            className="text-[#0043ce] flex-shrink-0 mt-0.5"
          />
          <p className="text-xs text-[#0043ce]">
            <span className="font-semibold">Cerner Integration:</span> This referral will be
            submitted as a PowerChart order and will appear in the provider&apos;s referral queue
            within 15 minutes. A task will be auto-created in the patient&apos;s chart.
          </p>
        </div>
      )}

      {/* Confirmation gate */}
      <label className="flex items-start gap-3 p-3 border border-carbon-gray-20 cursor-pointer hover:border-[#0f62fe] transition-colors">
        <input
          type="checkbox"
          checked={confirmGate}
          onChange={(e) => setConfirmGate(e.target.checked)}
          className="mt-0.5 accent-[#0f62fe]"
        />
        <p className="text-xs text-carbon-gray-70">
          I confirm that all required clinical documentation has been reviewed, the referral is
          clinically appropriate, and I authorize submission of this referral order to{' '}
          <span className="font-semibold text-carbon-gray-100">{provider.name}</span>.
        </p>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() =>
            onSubmit(
              channel,
              `Channel: ${channel} | Docs: ${Array.from(checkedDocs).join(', ')} | Appt Pref: ${appointmentPref || 'None'} | Notes: ${referralNotes || 'None'}`
            )
          }
          disabled={!canSubmit}
          className="carbon-btn-primary text-xs py-2 disabled:opacity-40"
        >
          <Icon name="PaperAirplaneIcon" size={14} />
          Submit Referral to EMR
        </button>
        <button onClick={onBack} className="carbon-btn-secondary text-xs py-2">
          <Icon name="ArrowLeftIcon" size={14} />
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Audit Trail ──────────────────────────────────────────────────────
interface Step3Props {
  provider: Provider;
  referralId: string;
  onClose: () => void;
}

function Step3AuditTrail({ provider, referralId, onClose }: Step3Props) {
  const { getWorkflow } = useWorkflowMachine();
  const wf = getWorkflow('provider-referral', referralId);
  const wfDef = workflowDefinitions['provider-referral'];

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-carbon-gray-100 mb-1 flex items-center gap-2">
          <Icon name="ClipboardDocumentListIcon" size={15} className="text-[#24a148]" />
          Referral Submitted — Audit Trail
        </h4>
        <p className="text-xs text-carbon-gray-50">
          The referral has been submitted to the EMR. The complete workflow audit trail is recorded
          below and is immutable.
        </p>
      </div>

      {/* Submission confirmation banner */}
      <div className="flex items-start gap-3 p-4 bg-[#defbe6] border border-[#a7f0ba]">
        <Icon name="CheckCircleIcon" size={18} className="text-[#24a148] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-[#0e6027]">Referral Successfully Submitted</p>
          <p className="text-xs text-[#0e6027] mt-0.5">
            Referral to <span className="font-semibold">{provider.name}</span> has been submitted
            via EMR. Reference ID:{' '}
            <span className="font-mono font-bold">{referralId.toUpperCase()}</span>
          </p>
          <div className="flex items-center gap-4 mt-2 text-2xs text-[#0e6027]">
            <span>
              Submitted:{' '}
              {new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>
              Status: <span className="font-semibold">Pending Acceptance</span>
            </span>
          </div>
        </div>
      </div>

      {/* Referral details summary */}
      <div className="border border-carbon-gray-20">
        <div className="px-4 py-3 bg-carbon-gray-10 border-b border-carbon-gray-20">
          <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
            Referral Details
          </p>
        </div>
        <div className="divide-y divide-carbon-gray-20">
          {[
            { label: 'Referred To', value: provider.name },
            { label: 'Specialty', value: provider.specialty },
            { label: 'NPI', value: provider.npi },
            { label: 'Network Tier', value: provider.networkTier },
            { label: 'Affiliated Facility', value: provider.affiliatedFacility },
            { label: 'Referral ID', value: referralId.toUpperCase() },
          ].map((f) => (
            <div key={f.label} className="flex justify-between items-center px-4 py-2.5 text-xs">
              <span className="text-carbon-gray-50">{f.label}</span>
              <span className="font-medium text-carbon-gray-100 font-mono">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow step history */}
      {wf && wf.stepHistory.length > 0 && (
        <div className="border border-carbon-gray-20 overflow-hidden">
          <div className="px-4 py-3 bg-carbon-gray-10 border-b border-carbon-gray-20 flex items-center gap-2">
            <Icon name="ClockIcon" size={13} className="text-carbon-gray-50" />
            <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
              Workflow Step History
            </p>
            <span className="text-2xs text-carbon-gray-30 ml-auto">
              Immutable — Tamper-Evident Log
            </span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {['Step', 'Action', 'Completed By', 'Role', 'Notes', 'Timestamp'].map((h) => (
                  <th
                    key={`rh-${h}`}
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
        </div>
      )}

      {/* Next steps */}
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-4">
        <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-2">
          Next Steps
        </p>
        <div className="space-y-1.5 text-xs text-carbon-gray-70">
          <div className="flex items-start gap-2">
            <Icon
              name="CheckCircleIcon"
              size={12}
              className="text-[#24a148] mt-0.5 flex-shrink-0"
            />
            <span>Referral order created in Cerner — provider will receive notification</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="ClockIcon" size={12} className="text-carbon-gray-50 mt-0.5 flex-shrink-0" />
            <span>Expect appointment scheduling contact within 2–3 business days</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="BellIcon" size={12} className="text-[#0043ce] mt-0.5 flex-shrink-0" />
            <span>Care manager will receive notification when appointment is confirmed</span>
          </div>
          <div className="flex items-start gap-2">
            <Icon
              name="DocumentTextIcon"
              size={12}
              className="text-carbon-gray-50 mt-0.5 flex-shrink-0"
            />
            <span>Referral status will update in patient chart within 24 hours</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onClose} className="carbon-btn-primary text-xs py-2">
          <Icon name="CheckIcon" size={14} />
          Close Referral Journey
        </button>
      </div>
    </div>
  );
}

// ─── Main Referral Journey Panel ──────────────────────────────────────────────
export interface ReferralJourneyProps {
  provider: Provider;
  referralId: string;
  onClose: () => void;
}

export default function ReferralJourney({ provider, referralId, onClose }: ReferralJourneyProps) {
  const { getWorkflow, getWorkflowStatus, startWorkflow, advanceStep, completeWorkflow } =
    useWorkflowMachine();
  const { user: currentUser } = useAppContext();
  const wfDef = workflowDefinitions['provider-referral'];

  const wf = getWorkflow('provider-referral', referralId);
  const status = getWorkflowStatus('provider-referral', referralId);

  // Auto-start workflow on mount if idle
  React.useEffect(() => {
    if (status === 'idle') {
      startWorkflow('provider-referral', referralId, currentUser.name, currentUser.role);
    }
  }, [status, referralId, currentUser, startWorkflow]);

  const currentStep = wf?.currentStep ?? 1;

  const handleStep1Confirm = (specialty: string, urgency: string, notes: string) => {
    advanceStep('provider-referral', referralId, currentUser.name, currentUser.role, notes);
  };

  const handleStep2Submit = (channel: string, notes: string) => {
    completeWorkflow('provider-referral', referralId, currentUser.name, currentUser.role, notes);
  };

  return (
    <div className="border border-[#97c1ff] bg-white overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#edf5ff] border-b border-[#97c1ff]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center flex-shrink-0">
            <Icon name="ArrowTopRightOnSquareIcon" size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Provider Referral Journey
            </h3>
            <p className="text-2xs text-carbon-gray-50 font-mono">
              {provider.name} · {provider.specialty} · Ref: {referralId.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'completed' && (
            <span className="text-2xs font-semibold px-2.5 py-1 border bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]">
              Referral Submitted
            </span>
          )}
          {status === 'in-progress' && (
            <span className="text-2xs font-semibold px-2.5 py-1 border bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]">
              In Progress — Step {currentStep}/{wfDef.steps.length}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-20 transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-5 py-4 border-b border-carbon-gray-20 bg-white">
        <StepIndicator
          steps={wfDef.steps}
          currentStep={currentStep}
          status={status === 'idle' ? 'in-progress' : status}
        />
      </div>

      {/* Provider summary */}
      <div className="px-5 pt-4">
        <ProviderSummaryCard provider={provider} />
      </div>

      {/* Step content */}
      <div className="px-5 py-5">
        {(status === 'idle' || (status === 'in-progress' && currentStep === 1)) && (
          <Step1SelectProvider
            provider={provider}
            onConfirm={handleStep1Confirm}
            onCancel={onClose}
          />
        )}
        {status === 'in-progress' && currentStep === 2 && (
          <Step2SubmitToEMR
            provider={provider}
            onSubmit={handleStep2Submit}
            onBack={() => {
              /* read-only back — step already recorded */
            }}
          />
        )}
        {status === 'awaiting-review' && currentStep === 2 && (
          <Step2SubmitToEMR provider={provider} onSubmit={handleStep2Submit} onBack={() => {}} />
        )}
        {status === 'completed' && (
          <Step3AuditTrail provider={provider} referralId={referralId} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
