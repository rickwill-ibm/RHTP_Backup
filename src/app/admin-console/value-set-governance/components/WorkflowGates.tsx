'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  canSubmit,
  evaluateApprovalGate,
  type GovernancePrincipal,
  type ValueSetVersion,
} from '../governanceApi';

interface WorkflowGatesProps {
  version: ValueSetVersion;
  principal: GovernancePrincipal;
}

type Outcome = { kind: 'submitted' | 'approved' | 'rejected' | 'blocked'; message: string } | null;

/**
 * Approval-workflow gates for the selected version: submit / approve / reject.
 * Gated by role AND by the maker-checker rule. E9: the approve/reject controls
 * are disabled (not merely hidden) when the gate forbids the action, and each
 * handler RE-CHECKS the gate before acting so a forbidden approval can never be
 * performed by the UI even if a disabled control were bypassed.
 *
 * INTEGRATION SEAM: a real submit/approve/reject routes to the Wave-A governance
 * engine transition API. Until it lands, the handlers surface the gate decision
 * inline and record no state mutation.
 */
export default function WorkflowGates({ version, principal }: WorkflowGatesProps) {
  const [outcome, setOutcome] = useState<Outcome>(null);

  const gate = evaluateApprovalGate(version, principal);
  const submitAllowed = version.state === 'draft' && canSubmit(principal);

  function handleSubmit() {
    if (!submitAllowed) {
      setOutcome({ kind: 'blocked', message: 'Submit is not available for this version / role.' });
      return;
    }
    setOutcome({ kind: 'submitted', message: `Submitted ${version.version} for approval (routes to governance engine).` });
  }

  function handleApprove() {
    // Defense in depth: re-evaluate the gate; never approve what it forbids.
    const g = evaluateApprovalGate(version, principal);
    if (!g.enabled) {
      setOutcome({ kind: 'blocked', message: g.reason });
      return;
    }
    setOutcome({ kind: 'approved', message: `Approved ${version.version} (routes to governance engine).` });
  }

  function handleReject() {
    const g = evaluateApprovalGate(version, principal);
    if (!g.enabled) {
      setOutcome({ kind: 'blocked', message: g.reason });
      return;
    }
    setOutcome({ kind: 'rejected', message: `Rejected ${version.version} (routes to governance engine).` });
  }

  return (
    <div className="bg-white border border-carbon-gray-20 p-5" aria-label="Approval workflow gates">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-carbon-gray-100">Approval Workflow — {version.version}</h3>
        <span className="text-xs text-carbon-gray-50">acting as {principal.name}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!submitAllowed}
          aria-disabled={!submitAllowed}
          className="text-xs px-3 py-1.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] font-semibold hover:bg-[#b8d3ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Submit for Approval
        </button>

        <button
          type="button"
          onClick={handleApprove}
          disabled={!gate.enabled}
          aria-disabled={!gate.enabled}
          aria-describedby="approve-gate-reason"
          data-testid="approve-btn"
          className="text-xs px-3 py-1.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba] font-semibold hover:bg-[#c6efcd] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Approve
        </button>

        <button
          type="button"
          onClick={handleReject}
          disabled={!gate.enabled}
          aria-disabled={!gate.enabled}
          data-testid="reject-btn"
          className="text-xs px-3 py-1.5 bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8] font-semibold hover:bg-[#ffd7d9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Reject
        </button>
      </div>

      {/* Gate explanation — always rendered so the reason a control is disabled is visible (E9 + a11y). */}
      <p id="approve-gate-reason" className="text-xs text-carbon-gray-70 mt-3 flex items-start gap-1.5">
        <Icon name={gate.enabled ? 'CheckCircleIcon' : 'LockClosedIcon'} size={14} className={gate.enabled ? 'text-[#24a148] mt-0.5' : 'text-carbon-gray-50 mt-0.5'} />
        <span>{gate.reason}</span>
      </p>

      {outcome && (
        <p
          role="status"
          className={`text-xs mt-2 font-medium ${outcome.kind === 'blocked' ? 'text-[#da1e28]' : 'text-[#0e6027]'}`}
        >
          {outcome.message}
        </p>
      )}
    </div>
  );
}
