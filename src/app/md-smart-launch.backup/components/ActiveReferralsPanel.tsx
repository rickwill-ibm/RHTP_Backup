'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { SmartLaunchContext, MdOrder, CareTeamAssignment } from '@/lib/smartFhirTypes';

interface ActiveReferralsPanelProps {
  launchContext: SmartLaunchContext;
  completedOrders: MdOrder[];
  confirmedAssignments: CareTeamAssignment[];
}

// Referrals from order catalog that were signed
function getReferralOrders(orders: MdOrder[]): MdOrder[] {
  return orders.filter((o) => o.category === 'referral');
}

const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  Submitted: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  Scheduled: 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]',
  'In Progress': 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  Completed: 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]',
};

const PRIORITY_STYLE: Record<string, string> = {
  stat: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  urgent: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  routine: 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20',
};

// Pre-existing referrals (from prior encounters / care gaps)
const PRE_EXISTING_REFERRALS = [
  {
    id: 'ref-pre-001',
    specialty: 'Ophthalmology',
    reason: 'Diabetic Eye Exam — HEDIS CDC-EYE gap',
    orderedBy: 'Care Manager',
    orderedDate: '2026-03-01',
    status: 'Pending',
    priority: 'routine',
    providerName: 'TBD — patient has not scheduled',
    dueDate: '2026-09-30',
    source: 'Care Gap',
  },
  {
    id: 'ref-pre-002',
    specialty: 'Nephrology',
    reason: 'CKD Stage 3b monitoring — eGFR 42, overdue 45 days',
    orderedBy: 'Dr. James Whitfield',
    orderedDate: '2026-02-20',
    status: 'Submitted',
    priority: 'urgent',
    providerName: 'Awaiting assignment',
    dueDate: '2026-05-01',
    source: 'Chronic Condition',
  },
];

export default function ActiveReferralsPanel({
  launchContext,
  completedOrders,
  confirmedAssignments,
}: ActiveReferralsPanelProps) {
  const referralOrders = getReferralOrders(completedOrders);

  // Build this-visit referrals from signed orders + confirmed assignments
  const thisVisitReferrals = referralOrders.map((order) => {
    const matchedAssignment = confirmedAssignments.find(
      (a) =>
        order.display.toLowerCase().includes(a.specialty.toLowerCase()) ||
        a.specialty.toLowerCase().includes(order.display.toLowerCase().split(' ')[0])
    );
    return {
      id: order.id,
      specialty: order.display,
      reason: order.note || `Ordered during encounter ${launchContext.encounterId}`,
      orderedBy: launchContext.practitionerName,
      orderedDate: new Date().toISOString().split('T')[0],
      status: matchedAssignment ? 'Scheduled' : 'Submitted',
      priority: order.priority,
      providerName: matchedAssignment ? matchedAssignment.providerName : 'Pending assignment',
      dueDate: '',
      source: 'This Visit',
      networkTier: matchedAssignment?.networkTier,
      qualityScore: matchedAssignment?.qualityScore,
      waitDays: matchedAssignment?.waitDays,
    };
  });

  // Also add confirmed assignments that don't have a matching order
  const assignmentOnlyReferrals = confirmedAssignments
    .filter(
      (a) =>
        !referralOrders.some(
          (o) =>
            o.display.toLowerCase().includes(a.specialty.toLowerCase()) ||
            a.specialty.toLowerCase().includes(o.display.toLowerCase().split(' ')[0])
        )
    )
    .map((a) => ({
      id: a.id,
      specialty: `${a.specialty} Referral`,
      reason: `Care team assignment — ${a.role}`,
      orderedBy: launchContext.practitionerName,
      orderedDate: new Date().toISOString().split('T')[0],
      status: 'Scheduled' as const,
      priority: 'routine' as const,
      providerName: a.providerName,
      dueDate: '',
      source: 'This Visit',
      networkTier: a.networkTier,
      qualityScore: a.qualityScore,
      waitDays: a.waitDays,
    }));

  const allThisVisit = [...thisVisitReferrals, ...assignmentOnlyReferrals];
  const totalActive =
    allThisVisit.length + PRE_EXISTING_REFERRALS.filter((r) => r.status !== 'Completed').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-carbon-gray-100 flex items-center gap-2">
              <Icon name="ArrowTopRightOnSquareIcon" size={16} className="text-[#6929c4]" />
              Active Referrals
            </h2>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              {launchContext.patientName} · Enc:{' '}
              <span className="font-mono">{launchContext.encounterId}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] font-bold">
              {totalActive} Active
            </span>
            {allThisVisit.length > 0 && (
              <span className="px-2 py-1 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff] font-medium">
                {allThisVisit.length} from this visit
              </span>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              label: 'This Visit',
              value: allThisVisit.length,
              color: 'text-[#6929c4]',
              sub: 'Signed & submitted',
            },
            {
              label: 'Pre-existing',
              value: PRE_EXISTING_REFERRALS.filter((r) => r.status !== 'Completed').length,
              color: 'text-[#b45309]',
              sub: 'Awaiting completion',
            },
            {
              label: 'Total Active',
              value: totalActive,
              color: 'text-carbon-gray-100',
              sub: 'Across all sources',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-carbon-gray-10 px-3 py-2.5 border border-carbon-gray-20"
            >
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-xs font-medium text-carbon-gray-70 mt-0.5">{item.label}</p>
              <p className="text-2xs text-carbon-gray-50">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* This Visit Referrals */}
      {allThisVisit.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
              This Visit
            </span>
            <span className="px-1.5 py-0.5 text-2xs font-bold bg-[#6929c4] text-white">
              {allThisVisit.length}
            </span>
          </div>
          <div className="space-y-2">
            {allThisVisit.map((ref) => (
              <div key={ref.id} className="bg-white border border-[#d4bbff] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 bg-[#f6f2ff] border border-[#d4bbff] flex items-center justify-center flex-shrink-0">
                      <Icon name="ArrowTopRightOnSquareIcon" size={14} className="text-[#6929c4]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-carbon-gray-100">
                          {ref.specialty}
                        </span>
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 border ${STATUS_STYLE[ref.status] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                        >
                          {ref.status}
                        </span>
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 border ${PRIORITY_STYLE[ref.priority] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                        >
                          {ref.priority.toUpperCase()}
                        </span>
                        <span className="text-2xs px-1.5 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
                          ⚡ This Visit
                        </span>
                      </div>
                      <p className="text-xs text-carbon-gray-50 mb-1.5">{ref.reason}</p>
                      <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                        <span>
                          Provider:{' '}
                          <span className="font-medium text-carbon-gray-70">
                            {ref.providerName}
                          </span>
                        </span>
                        {ref.networkTier && (
                          <span>
                            Network:{' '}
                            <span className="font-medium text-carbon-gray-70">
                              {ref.networkTier}
                            </span>
                          </span>
                        )}
                        {ref.qualityScore && (
                          <span>
                            Quality:{' '}
                            <span className="font-medium text-[#24a148]">
                              {ref.qualityScore}/100
                            </span>
                          </span>
                        )}
                        {ref.waitDays && (
                          <span>
                            Wait:{' '}
                            <span className="font-medium text-carbon-gray-70">{ref.waitDays}d</span>
                          </span>
                        )}
                        <span>Ordered by: {ref.orderedBy}</span>
                        <span>Date: {ref.orderedDate}</span>
                      </div>
                    </div>
                  </div>
                  <Icon
                    name="CheckCircleIcon"
                    size={16}
                    className="text-[#24a148] flex-shrink-0 mt-0.5"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No this-visit referrals */}
      {allThisVisit.length === 0 && (
        <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-5 py-4 flex items-center gap-3 text-xs text-carbon-gray-50">
          <Icon name="InformationCircleIcon" size={16} />
          <span>
            No referrals signed during this visit yet. Sign orders or confirm care team assignments
            to see them here.
          </span>
        </div>
      )}

      {/* Pre-existing Referrals */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
            Pre-existing / Prior Encounters
          </span>
          <span className="px-1.5 py-0.5 text-2xs font-bold bg-carbon-gray-70 text-white">
            {PRE_EXISTING_REFERRALS.length}
          </span>
        </div>
        <div className="space-y-2">
          {PRE_EXISTING_REFERRALS.map((ref) => (
            <div key={ref.id} className="bg-white border border-carbon-gray-20 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 bg-carbon-gray-10 border border-carbon-gray-20 flex items-center justify-center flex-shrink-0">
                    <Icon name="ClockIcon" size={14} className="text-carbon-gray-50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {ref.specialty}
                      </span>
                      <span
                        className={`text-2xs font-medium px-1.5 py-0.5 border ${STATUS_STYLE[ref.status] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                      >
                        {ref.status}
                      </span>
                      <span
                        className={`text-2xs font-medium px-1.5 py-0.5 border ${PRIORITY_STYLE[ref.priority] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                      >
                        {ref.priority.toUpperCase()}
                      </span>
                      <span className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-50">
                        {ref.source}
                      </span>
                    </div>
                    <p className="text-xs text-carbon-gray-50 mb-1.5">{ref.reason}</p>
                    <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                      <span>
                        Provider:{' '}
                        <span className="font-medium text-carbon-gray-70">{ref.providerName}</span>
                      </span>
                      <span>Ordered by: {ref.orderedBy}</span>
                      <span>Date: {ref.orderedDate}</span>
                      {ref.dueDate && (
                        <span>
                          Due: <span className="font-medium text-[#da1e28]">{ref.dueDate}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {ref.status === 'Pending' && (
                  <Icon
                    name="ExclamationTriangleIcon"
                    size={16}
                    className="text-[#f1c21b] flex-shrink-0 mt-0.5"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FHIR note */}
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3 flex items-start gap-2 text-xs text-carbon-gray-50">
        <Icon name="BoltIcon" size={13} className="text-[#6929c4] mt-0.5 flex-shrink-0" />
        <span>
          Referrals from this visit are written to Cerner as FHIR{' '}
          <span className="font-mono">ServiceRequest</span> resources and will appear in PowerChart
          on return. Pre-existing referrals are sourced from FHIR R4 at{' '}
          <span className="font-mono text-2xs">{launchContext.fhirBaseUrl}</span>.
        </span>
      </div>
    </div>
  );
}
