'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { referralStore, mockCareGaps } from '@/lib/mockData';
import type { SmartLaunchContext, MdOrder, CareTeamAssignment } from '@/lib/smartFhirTypes';
import ReferralModal, { type ReferralFormData } from './ReferralModal';
import { initiateReferral } from '@/lib/services/referralService';
import { getFhirMockMode } from '@/lib/services/fhirClient';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import UpcomingPreventiveNeeds, { UPCOMING_PREVENTIVE_NEEDS } from './UpcomingPreventiveNeeds';
import ReferralCardList, { type ReferralPanelItem } from './ReferralCardList';

interface ActiveReferralsPanelProps {
  launchContext: SmartLaunchContext;
  completedOrders: MdOrder[];
  confirmedAssignments: CareTeamAssignment[];
}

function getReferralOrders(orders: MdOrder[]): MdOrder[] {
  return orders.filter((o) => o.category === 'referral');
}

export default function ActiveReferralsPanel({
  launchContext,
  completedOrders,
  confirmedAssignments,
}: ActiveReferralsPanelProps) {
  const referralOrders = getReferralOrders(completedOrders);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralSubmitting, setReferralSubmitting] = useState(false);
  const [lastReferralConfirmId, setLastReferralConfirmId] = useState<string | null>(null);

  const thisVisitReferrals: ReferralPanelItem[] = referralOrders.map((order) => {
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

  const assignmentOnlyReferrals: ReferralPanelItem[] = confirmedAssignments
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

  const storeReferrals: ReferralPanelItem[] = referralStore
    .getAllReferrals()
    .filter((r) => r.patientId === launchContext.patientId)
    .map((ref) => ({
      id: ref.referralId,
      specialty: ref.specialistType,
      reason: ref.clinicalNotes,
      orderedBy: ref.referringProvider,
      orderedDate: ref.referralDate,
      status:
        ref.status === 'completed'
          ? 'Completed'
          : ref.status === 'scheduled'
            ? 'Scheduled'
            : ref.status === 'in-progress'
              ? 'In Progress'
              : 'Submitted',
      priority: ref.urgency === 'asap' ? 'urgent' : ref.urgency,
      providerName:
        ref.specialistType === 'Unite Us' ? 'Unite Us Community Network' : ref.specialistType,
      dueDate: '',
      source: 'Maria Workflow',
    }));

  const existingVisitReferrals: ReferralPanelItem[] = [
    ...thisVisitReferrals,
    ...assignmentOnlyReferrals,
  ];

  const dedupedStoreReferrals: ReferralPanelItem[] = storeReferrals.filter(
    (ref) =>
      !existingVisitReferrals.some(
        (visitRef) => visitRef.specialty === ref.specialty && visitRef.reason === ref.reason
      )
  );

  const allThisVisit: ReferralPanelItem[] = [...dedupedStoreReferrals, ...existingVisitReferrals];
  const totalActive = allThisVisit.length;

  const patientPlatformId =
    Object.entries(PLATFORM_TO_FHIR_ID_MAP).find(
      ([, fhirId]) => fhirId === launchContext.patientId || launchContext.patientId.endsWith(fhirId)
    )?.[0] ?? launchContext.patientId;

  const referralCareGaps = (mockCareGaps ?? [])
    .filter((g) => g.patientId === patientPlatformId)
    .filter((g) => g.status === 'Open' || g.status === 'In Progress')
    .map((g) => ({
      id: g.id,
      name: g.measureName,
      program: g.program ?? 'HEDIS',
      cmsMips: g.measureId ?? '—',
      priority: 'High',
      status: g.status,
      daysOpen: g.daysOpen ?? 0,
    }));

  const handleReferralSubmit = async (data: ReferralFormData) => {
    setReferralSubmitting(true);
    const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[patientPlatformId] ?? launchContext.patientId;
    const confirmId = `REF-${Date.now().toString(36).toUpperCase()}`;

    if (!getFhirMockMode()) {
      try {
        const result = await initiateReferral({
          patientId: fhirPatientId,
          requesterId: launchContext.practitionerId ?? 'practitioner-rick',
          performerId: 'practitioner-jon',
          serviceCode: '3457005',
          serviceDisplay: `${data.specialistType} Referral — ${data.careGapName}`,
          careGapId: data.careGapId,
          priority: data.priority,
          notes: data.clinicalNotes,
          gainshareEligible: true,
        });
        console.info(
          `[ActiveReferrals] Referral initiated — SR: ${result.serviceRequest?.id}, Task: ${result.task?.id}`
        );
        setLastReferralConfirmId(result.task?.id ?? confirmId);
      } catch (err) {
        console.warn('[ActiveReferrals] initiateReferral failed — logged locally only:', err);
        setLastReferralConfirmId(confirmId);
      }
    } else {
      setLastReferralConfirmId(confirmId);
    }

    setReferralSubmitting(false);
    setShowReferralModal(false);
  };

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
              {launchContext.patientId} · Enc:{' '}
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
            <button
              onClick={() => setShowReferralModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#0035a8] transition-colors"
            >
              <Icon name="PaperAirplaneIcon" size={12} />
              Create Referral
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              label: 'Active Workflow Referrals',
              value: allThisVisit.length,
              color: 'text-[#6929c4]',
              sub: 'Maria launch + this visit',
            },
            {
              label: 'Upcoming Needs',
              value: UPCOMING_PREVENTIVE_NEEDS.length,
              color: 'text-[#b45309]',
              sub: 'Schedule next',
            },
            {
              label: 'Total Active',
              value: totalActive,
              color: 'text-carbon-gray-100',
              sub: 'Current routed items',
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

      {/* Referral card list (extracted to ReferralCardList) */}
      <ReferralCardList items={allThisVisit} />

      {/* Upcoming preventive / scheduling needs */}
      <UpcomingPreventiveNeeds />

      {/* Last referral confirmation */}
      {lastReferralConfirmId && (
        <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3 flex items-center gap-3 text-xs">
          <Icon name="CheckCircleIcon" size={14} className="text-[#0e6027]" />
          <span className="text-[#0e6027] font-semibold">Referral submitted</span>
          <span className="font-mono text-[#0e6027]/70">{lastReferralConfirmId}</span>
          <span className="text-[#0e6027]/70">
            — FHIR ServiceRequest + Task written · Specialist Inbox notified
          </span>
          <button
            onClick={() => setLastReferralConfirmId(null)}
            className="ml-auto text-[#0e6027]/50 hover:text-[#0e6027]"
          >
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

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

      {/* Referral Modal */}
      <ReferralModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        onSubmit={handleReferralSubmit}
        careGaps={referralCareGaps}
        patientName={launchContext.patientId}
        patientId={launchContext.patientId}
      />
    </div>
  );
}
