'use client';
// Provider selection action bar driven by the central action registry
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import { useWorkflowMachine } from '@/lib/workflowMachine';
import type { ActionDefinition } from '@/lib/actionRegistry';

// ─── Initiate Referral Modal ──────────────────────────────────────────────────
function InitiateReferralModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (specialty: string, note: string) => void;
}) {
  const [specialty, setSpecialty] = useState('');
  const [clinicalNeed, setClinicalNeed] = useState('');
  const [urgency, setUrgency] = useState<'Routine' | 'Urgent' | 'STAT'>('Routine');

  const specialties = [
    'Cardiology',
    'Endocrinology',
    'Nephrology',
    'Neurology',
    'Oncology',
    'Orthopedics',
    'Pulmonology',
    'Rheumatology',
    'Gastroenterology',
    'Hematology',
    'Infectious Disease',
    'Other',
  ];

  const handleConfirm = () => {
    if (!specialty) {
      toast.error('Please select a referral specialty');
      return;
    }
    onConfirm(specialty, clinicalNeed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-carbon-gray-20 shadow-carbon-lg w-[460px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-carbon-gray-20 bg-carbon-gray-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center">
              <Icon name="ArrowTopRightOnSquareIcon" size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-carbon-gray-100">Initiate Referral</h3>
              <p className="text-2xs text-carbon-gray-50">Step 1 of 3 — Identify Referral Need</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Workflow progress */}
          <div className="flex items-center gap-0">
            {[
              { step: 1, label: 'Identify Need', active: true },
              { step: 2, label: 'Select Provider', active: false },
              { step: 3, label: 'Submit Referral', active: false },
            ].map((s, i) => (
              <React.Fragment key={s.step}>
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-semibold ${s.active ? 'bg-[#0f62fe] text-white' : 'bg-carbon-gray-10 text-carbon-gray-50 border border-carbon-gray-20'}`}
                >
                  <span
                    className={`w-4 h-4 flex items-center justify-center text-2xs font-bold ${s.active ? 'bg-white text-[#0f62fe]' : 'bg-carbon-gray-20 text-carbon-gray-70'}`}
                  >
                    {s.step}
                  </span>
                  {s.label}
                </div>
                {i < 2 && <div className="w-4 h-0.5 bg-carbon-gray-20" />}
              </React.Fragment>
            ))}
          </div>

          {/* Specialty selector */}
          <div>
            <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
              Referral Specialty <span className="text-[#da1e28]">*</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {specialties.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpecialty(s)}
                  className={`py-1.5 px-2 text-2xs font-semibold border text-left transition-colors ${
                    specialty === s
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
              {(['Routine', 'Urgent', 'STAT'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`flex-1 py-2 text-xs font-semibold border transition-colors ${
                    urgency === u
                      ? u === 'STAT'
                        ? 'bg-[#da1e28] text-white border-[#da1e28]'
                        : u === 'Urgent'
                          ? 'bg-[#f1c21b] text-[#161616] border-[#f1c21b]'
                          : 'bg-[#0f62fe] text-white border-[#0f62fe]'
                      : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Clinical need */}
          <div>
            <label className="block text-xs font-semibold text-carbon-gray-100 mb-1.5">
              Clinical Need <span className="text-carbon-gray-50 font-normal">(optional)</span>
            </label>
            <textarea
              value={clinicalNeed}
              onChange={(e) => setClinicalNeed(e.target.value)}
              placeholder="Describe the clinical reason for referral, relevant diagnoses, or specific concerns..."
              rows={3}
              className="w-full border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-xs text-carbon-gray-100 placeholder-carbon-gray-50 focus:outline-none focus:border-[#0f62fe] resize-none"
            />
          </div>

          {/* Summary */}
          {specialty && (
            <div className="bg-[#edf5ff] border border-[#97c1ff] px-4 py-3 space-y-1.5">
              <p className="text-2xs font-semibold text-[#0043ce] uppercase tracking-wide">
                Referral Summary
              </p>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Specialty</span>
                <span className="font-medium text-carbon-gray-100">{specialty}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Urgency</span>
                <span
                  className={`font-bold ${urgency === 'STAT' ? 'text-[#da1e28]' : urgency === 'Urgent' ? 'text-[#b45309]' : 'text-[#0043ce]'}`}
                >
                  {urgency}
                </span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-carbon-gray-70">Next Step</span>
                <span className="font-medium text-carbon-gray-100">
                  Select a provider from the directory below
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
              onClick={handleConfirm}
            >
              <Icon name="ArrowRightIcon" size={14} />
              Confirm & Select Provider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Provider Action Bar ──────────────────────────────────────────────────────
export default function ProviderActionBar() {
  const { getActions, user, selectedPatientId } = useAppContext();
  const { startWorkflow, advanceStep, getWorkflowStatus, resetWorkflow } = useWorkflowMachine();
  const actions = getActions('provider-selection');
  const [showReferralModal, setShowReferralModal] = useState(false);

  const handleAction = (action: ActionDefinition) => {
    const entityId = selectedPatientId ?? 'patient-001';

    if (action.id === 'act-initiate-referral') {
      // Always open the referral modal — reset if previously completed/rejected
      const status = getWorkflowStatus('provider-referral', entityId);
      if (status === 'completed' || status === 'rejected') {
        resetWorkflow?.('provider-referral', entityId);
      }
      setShowReferralModal(true);
      return;
    }

    if (action.initiatesWorkflow) {
      const status = getWorkflowStatus(action.initiatesWorkflow, entityId);
      if (status === 'idle') {
        startWorkflow(action.initiatesWorkflow, entityId, user.name, user.role);
        toast.success(`Workflow started: ${action.label}`, { description: action.description });
      } else if (status === 'in-progress' || status === 'awaiting-review') {
        toast.info(`${action.label} workflow is already in progress`, {
          description: 'Continue from where you left off using the step actions below.',
        });
      } else {
        startWorkflow(action.initiatesWorkflow, entityId, user.name, user.role);
        toast.success(`Workflow restarted: ${action.label}`, { description: action.description });
      }
      return;
    }

    if (action.workflowStep) {
      advanceStep(action.workflowStep.workflow, entityId, user.name, user.role);
      toast.success(`Step completed: ${action.label}`, { description: action.description });
      return;
    }

    toast.success(`Action: ${action.label}`, { description: action.description });
  };

  const handleReferralConfirm = (specialty: string, note: string) => {
    const entityId = selectedPatientId ?? 'patient-001';
    const status = getWorkflowStatus('provider-referral', entityId);
    if (status === 'idle') {
      startWorkflow('provider-referral', entityId, user.name, user.role);
    }
    toast.success('Referral initiated — Step 1 complete', {
      description: `${specialty} referral started. Select a provider from the directory to continue.`,
    });
  };

  if (actions.length === 0) return null;

  const btnClass = (variant: ActionDefinition['variant'], actionId?: string) => {
    const base = 'flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors';
    // Initiate Referral always renders as primary-styled to signal it's active
    if (actionId === 'act-initiate-referral') {
      return `${base} bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]`;
    }
    switch (variant) {
      case 'primary':
        return `${base} bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]`;
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
          Provider Actions
        </span>
        {actions.map((action) => (
          <button
            key={action.id}
            className={btnClass(action.variant, action.id)}
            title={action.description}
            onClick={() => handleAction(action)}
          >
            <Icon name={action.icon as any} size={13} />
            {action.shortLabel ?? action.label}
            {action.workflowStep && (
              <span className="text-2xs opacity-60">S{action.workflowStep.step}</span>
            )}
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

      {showReferralModal && (
        <InitiateReferralModal
          onClose={() => setShowReferralModal(false)}
          onConfirm={handleReferralConfirm}
        />
      )}
    </>
  );
}
