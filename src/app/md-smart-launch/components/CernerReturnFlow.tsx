'use client';
import React, { useState } from 'react';
import type { CernerReturnPayload, MdOrder, CareTeamAssignment } from '@/lib/smartFhirTypes';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import Icon from '@/components/ui/AppIcon';

interface CernerReturnFlowProps {
  launchContext: SmartLaunchContext;
  completedOrders: MdOrder[];
  confirmedAssignments: CareTeamAssignment[];
  closedGapIds: string[];
  onReturnInitiated: (payload: CernerReturnPayload) => void;
}

export default function CernerReturnFlow({
  launchContext,
  completedOrders,
  confirmedAssignments,
  closedGapIds,
  onReturnInitiated,
}: CernerReturnFlowProps) {
  const [step, setStep] = useState<'ready' | 'returning' | 'returned'>('ready');
  const [returnId, setReturnId] = useState('');

  const signedOrders = completedOrders.filter((o) => o.status === 'signed');
  const hasActions =
    signedOrders.length > 0 || confirmedAssignments.length > 0 || closedGapIds.length > 0;

  const handleReturn = () => {
    setStep('returning');
    setTimeout(() => {
      const payload: CernerReturnPayload = {
        encounterId: launchContext.encounterId,
        patientId: launchContext.patientId,
        completedOrders: signedOrders.map((o) => o.id),
        signedServiceRequestIds: signedOrders.map((o) => o.fhirServiceRequestId || `SR-${o.id}`),
        careTeamAssignments: confirmedAssignments.map((a) => a.id),
        careGapsClosed: closedGapIds,
        returnTimestamp: new Date().toISOString(),
        returnReason:
          signedOrders.length > 0
            ? 'order-signed'
            : confirmedAssignments.length > 0
              ? 'team-assigned'
              : 'manual',
      };
      const rid = `RTN-${Date.now().toString(36).toUpperCase()}`;
      setReturnId(rid);
      setStep('returned');
      onReturnInitiated(payload);

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: 'SMART_APP_COMPLETED',
            patientId: launchContext.patientId,
            patientName: launchContext.practitionerName || 'Unknown',
            returnId: rid,
            payload,
          },
          'http://localhost:4028'
        );
      }
    }, 1400);
  };

  if (step === 'returning') {
    return (
      <div className="bg-[#0f1624] border border-[#2a3550] p-8 flex flex-col items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-[#6929c4] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white text-sm font-medium">Returning to Cerner PowerChart…</p>
        <p className="text-carbon-gray-50 text-xs mt-1">
          Packaging completed actions and handing back context
        </p>
      </div>
    );
  }

  if (step === 'returned') {
    return (
      <div className="bg-[#0f1624] border border-[#6929c4]">
        <div className="bg-[#6929c4] px-5 py-4 flex items-center gap-3">
          <Icon name="CheckCircleIcon" size={20} className="text-white" />
          <div>
            <p className="text-white text-sm font-semibold">Returned to Cerner PowerChart</p>
            <p className="text-white/70 text-xs">
              All completed actions reflected in encounter · {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-carbon-gray-30 text-xs mb-4">
            Return ID: <span className="font-mono font-semibold text-white">{returnId}</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#161d2e] border border-[#2a3550] px-3 py-3 text-center">
              <p className="text-2xl font-bold font-mono text-white tabular-nums">
                {signedOrders.length}
              </p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">Orders Signed</p>
            </div>
            <div className="bg-[#161d2e] border border-[#2a3550] px-3 py-3 text-center">
              <p className="text-2xl font-bold font-mono text-white tabular-nums">
                {confirmedAssignments.length}
              </p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">Team Assigned</p>
            </div>
            <div className="bg-[#161d2e] border border-[#2a3550] px-3 py-3 text-center">
              <p className="text-2xl font-bold font-mono text-white tabular-nums">
                {closedGapIds.length}
              </p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">Gaps Closed</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[#2a3550]">
            <p className="text-2xs text-carbon-gray-50 text-center">
              Encounter{' '}
              <span className="font-mono text-carbon-gray-30">{launchContext.encounterId}</span>{' '}
              updated in Cerner · MD may close this panel and resume encounter in UHG Controller
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1624] border border-[#2a3550]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#2a3550] flex items-center gap-2">
        <div className="w-5 h-5 bg-[#6929c4] flex items-center justify-center">
          <Icon name="BoltIcon" size={12} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-white">Return to Cerner</span>
        <span className="text-2xs text-carbon-gray-50 ml-auto">
          Encounter:{' '}
          <span className="font-mono text-carbon-gray-30">{launchContext.encounterId}</span>
        </span>
      </div>

      <div className="p-5">
        {/* Summary of completed actions */}
        {hasActions ? (
          <div className="space-y-2 mb-5">
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-3">
              Actions completed this session
            </p>

            {signedOrders.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[#161d2e] border border-[#2a3550]">
                <Icon name="ClipboardDocumentCheckIcon" size={15} className="text-[#a56eff]" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-white">
                    {signedOrders.length} order{signedOrders.length !== 1 ? 's' : ''} signed
                  </p>
                  <p className="text-2xs text-carbon-gray-50">
                    FHIR ServiceRequest resources created
                  </p>
                </div>
                <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
              </div>
            )}

            {confirmedAssignments.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[#161d2e] border border-[#2a3550]">
                <Icon name="UserGroupIcon" size={15} className="text-[#a56eff]" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-white">
                    {confirmedAssignments.length} care team assignment
                    {confirmedAssignments.length !== 1 ? 's' : ''} confirmed
                  </p>
                  <p className="text-2xs text-carbon-gray-50">
                    {confirmedAssignments.map((a) => a.providerName).join(', ')}
                  </p>
                </div>
                <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
              </div>
            )}

            {closedGapIds.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[#161d2e] border border-[#2a3550]">
                <Icon name="CheckBadgeIcon" size={15} className="text-[#a56eff]" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-white">
                    {closedGapIds.length} care gap{closedGapIds.length !== 1 ? 's' : ''} closed
                  </p>
                  <p className="text-2xs text-carbon-gray-50">HEDIS / STARS measures satisfied</p>
                </div>
                <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#161d2e] border border-[#2a3550] px-4 py-3 mb-5 flex items-center gap-2">
            <Icon name="InformationCircleIcon" size={15} className="text-carbon-gray-50" />
            <p className="text-xs text-carbon-gray-50">
              No actions completed yet. Complete orders or team assignments before returning.
            </p>
          </div>
        )}

        {/* Return button */}
        <button
          onClick={handleReturn}
          disabled={!hasActions}
          className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
            hasActions
              ? 'bg-[#6929c4] text-white hover:bg-[#491d8b]'
              : 'bg-[#2a3550] text-carbon-gray-50 cursor-not-allowed'
          }`}
        >
          <Icon name="ArrowRightOnRectangleIcon" size={16} />
          Return to Cerner / UHG Controller
        </button>

        <p className="text-2xs text-carbon-gray-70 text-center mt-3">
          Practitioner: {launchContext.practitionerName} · NPI: {launchContext.practitionerNpi}
        </p>
      </div>
    </div>
  );
}
