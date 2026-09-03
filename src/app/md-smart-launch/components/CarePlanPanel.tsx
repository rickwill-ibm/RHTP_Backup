'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { mockCareGaps, mockPatients, mockHCCSuspects, referralStore } from '@/lib/mockData';
import type { SmartLaunchContext, MdOrder, CareTeamAssignment } from '@/lib/smartFhirTypes';
import { usePatient } from '@/lib/fhir/hooks';
import { bannerName } from '@/lib/fhir/types';
import { DEMO_PATIENT_ID } from '@/lib/fhir/store';
import {
  generateComprehensiveCarePlan,
  generateHolisticCarePlan,
  type GeneratedCarePlan,
} from '@/lib/services/carePlanGenerator';
import CarePlanForm from '@/app/patient-detail/components/CarePlanForm';
import {
  getClosedGapsForPatient,
  getProviderGainshareSummary,
} from '@/lib/services/gapClosureService';
import { useAppContext } from '@/lib/appContext';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import {
  CHRONIC_CONDITIONS,
  CARE_GOALS,
  ACUITY_STYLE,
  STATUS_STYLE,
  GOAL_PRIORITY_STYLE,
  GOAL_STATUS_ICON,
} from '../data/carePlanData';
import { useFhirCarePlanRead } from '../hooks/useFhirCarePlanRead';
import { saveCarePlanToFhir } from '../lib/saveCarePlanToFhir';

interface CarePlanPanelProps {
  patientId: string;
  launchContext: SmartLaunchContext;
  completedOrders: MdOrder[];
  confirmedAssignments: CareTeamAssignment[];
}

type Section = 'conditions' | 'gaps' | 'goals' | 'team' | 'closed-gaps';

export default function CarePlanPanel({
  patientId,
  launchContext,
  completedOrders,
  confirmedAssignments,
}: CarePlanPanelProps) {
  const { activePhysician } = useAppContext();
  const [activeSection, setActiveSection] = useState<Section>('conditions');
  const [showGeneratedPlan, setShowGeneratedPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedCarePlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [closedGaps, setClosedGaps] = useState<any[]>([]);
  const [gainshare, setGainshare] = useState<any>(null);

  // ── Live FHIR: read the patient's persisted CarePlan on mount ───────────────
  const { carePlan: fhirCarePlan, setCarePlan: setFhirCarePlan } = useFhirCarePlanRead(
    launchContext.patientId
  );

  // Identity: for Maria/demo use mock registry; for other patients use FHIR Patient resource
  const isMockPatient = patientId === DEMO_PATIENT_ID;
  const fhirPatient = usePatient(isMockPatient ? undefined : patientId);
  const mockPatient = mockPatients.find((p) => p.id === launchContext.patientId) || mockPatients[0];
  const patient = mockPatient; // keep reference for mock-data lookups below
  const careGaps = mockCareGaps.filter((g) => g.patientId === patient.id);
  const openGaps = careGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress');
  const hccSuspects = mockHCCSuspects.filter((h) => h.patientId === patient.id);
  // Resolved display name: prefer FHIR for non-demo patients
  const resolvedName =
    !isMockPatient && fhirPatient.data ? bannerName(fhirPatient.data.name) : patient.name;
  const resolvedPcp = patient.primaryCareProvider || 'Primary Care Provider (to be assigned)';

  // Subscribe to referral store updates for real-time gap closure
  useEffect(() => {
    const updateClosedGaps = () => {
      const closed = getClosedGapsForPatient(patient.id);
      setClosedGaps(closed);

      // Update gainshare summary
      const gainshareSummary = getProviderGainshareSummary('dr-whitfield-001');
      setGainshare(gainshareSummary);
    };

    updateClosedGaps();
    const unsubscribe = referralStore.subscribe(updateClosedGaps);
    return unsubscribe;
  }, [patient.id]);

  // Merge confirmed assignments + order-based referrals into care team
  const careTeamMembers = [
    {
      name: resolvedPcp,
      role: 'Primary Care Physician',
      specialty: 'Internal Medicine',
      type: 'PCP',
      status: 'Active',
    },
    ...confirmedAssignments.map((a) => ({
      name: a.providerName,
      role: a.role,
      specialty: a.specialty,
      type: 'Specialist',
      status: 'Assigned',
    })),
  ];

  const SECTIONS: Array<{ key: Section; label: string; icon: string; count?: number }> = [
    {
      key: 'conditions',
      label: 'Chronic Conditions',
      icon: 'HeartIcon',
      count: CHRONIC_CONDITIONS.length,
    },
    {
      key: 'gaps',
      label: 'Open Care Gaps',
      icon: 'ExclamationTriangleIcon',
      count: openGaps.length,
    },
    { key: 'closed-gaps', label: 'Closed Gaps', icon: 'CheckCircleIcon', count: closedGaps.length },
    { key: 'goals', label: 'Care Goals', icon: 'FlagIcon', count: CARE_GOALS.length },
    { key: 'team', label: 'Care Team', icon: 'UserGroupIcon', count: careTeamMembers.length },
  ];

  const handleGenerateComprehensive = async () => {
    setIsGenerating(true);

    // Simulate AI processing time
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      // Use holistic care plan for Maria Redhawk, standard for others
      const generated =
        patient.id === 'patient-001' || patient.name.toLowerCase().includes('maria')
          ? generateHolisticCarePlan({
              patient,
              hccSuspects,
              careGaps,
              alerts: [],
            })
          : generateComprehensiveCarePlan({
              patient,
              hccSuspects,
              careGaps,
              alerts: [],
              clinicalData: null,
            });

      setGeneratedPlan(generated);
      setShowGeneratedPlan(true);
    } catch (error) {
      console.error('Error generating care plan:', error);
      alert('Failed to generate care plan. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (planData: any) => {
    setSaveError(null);
    const performer = activePhysician?.displayName ?? 'Physician';
    setIsSaving(true);
    try {
      const summary = await saveCarePlanToFhir({
        platformPatientId: patient.id ?? launchContext.patientId,
        encounterId: launchContext.encounterId,
        performer,
        planData,
        careGaps,
      });
      setFhirCarePlan(summary);
    } catch (err) {
      console.warn('[CarePlan] FHIR save failed:', err);
      setSaveError('FHIR save failed — plan saved locally only. Retry or check network.');
    } finally {
      setIsSaving(false);
    }
    setShowGeneratedPlan(false);
    setGeneratedPlan(null);
  };

  const handleCancel = () => {
    setShowGeneratedPlan(false);
    setGeneratedPlan(null);
  };

  // If saving — show spinner overlay over the form
  if (isSaving) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Icon name="ArrowPathIcon" size={40} className="text-[#6929c4] animate-spin" />
        <p className="text-sm font-semibold text-carbon-gray-100">Saving Care Plan to FHIR…</p>
        <p className="text-xs text-carbon-gray-50">Writing CarePlan resource to HAPI server</p>
      </div>
    );
  }

  // If showing generated plan form, render it
  if (showGeneratedPlan && generatedPlan) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-sm text-[#0f62fe] hover:text-[#0043ce] font-medium"
        >
          <Icon name="ArrowLeftIcon" size={16} />
          Back to Care Plan
        </button>
        {saveError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[#fff1f1] border border-[#ffb3b8] text-xs text-[#da1e28]">
            <Icon name="ExclamationTriangleIcon" size={14} />
            {saveError}
          </div>
        )}
        <CarePlanForm
          mode="create"
          generatedPlan={generatedPlan}
          patientId={patient.id}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-carbon-gray-20 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-carbon-gray-100 flex items-center gap-2">
              <Icon name="ClipboardDocumentListIcon" size={16} className="text-[#6929c4]" />
              Active Care Plan
            </h2>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              {resolvedName} · MRN {patient.mrn} · Enc:{' '}
              <span className="font-mono">{launchContext.encounterId}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateComprehensive}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-[#6929c4] text-white text-sm font-medium hover:bg-[#8a3ffc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Icon name="SparklesIcon" size={14} />
                  Generate AI Care Plan
                </>
              )}
            </button>
            <span
              className={`px-2 py-1 border font-medium text-xs ${fhirCarePlan ? 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]' : 'bg-carbon-gray-10 text-carbon-gray-50 border-carbon-gray-20'}`}
            >
              {fhirCarePlan ? '✓ Care Plan Active (FHIR)' : '○ No Saved Plan'}
            </span>
            <span className="text-carbon-gray-50 text-xs">
              {fhirCarePlan?.lastUpdated
                ? `Last updated: ${fhirCarePlan.lastUpdated}`
                : 'Last updated: —'}
            </span>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            {
              label: 'Chronic Conditions',
              value: CHRONIC_CONDITIONS.length,
              sub: 'Maria longitudinal profile',
              color: 'text-[#da1e28]',
            },
            {
              label: 'Open Care Gaps',
              value: openGaps.length,
              sub: `${careGaps.filter((g) => g.status === 'Closed').length} closed`,
              color: 'text-[#b45309]',
            },
            {
              label: 'Active Goals',
              value: CARE_GOALS.filter((g) => g.status !== 'Completed').length,
              sub: 'Labcorp + Unite Us in workflow',
              color: 'text-[#da1e28]',
            },
            {
              label: 'Care Team Members',
              value: careTeamMembers.length,
              sub: `${confirmedAssignments.length} assigned this visit`,
              color: 'text-[#24a148]',
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

      {/* ── Persisted FHIR CarePlan banner ── updates immediately after approve, and on re-mount */}
      {fhirCarePlan && (
        <div className="border border-[#198038] bg-[#defbe6] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Icon
                name="CheckCircleIcon"
                size={18}
                className="text-[#198038] flex-shrink-0 mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0e6027]">{fhirCarePlan.title}</p>
                {fhirCarePlan.description && (
                  <p className="text-xs text-[#198038] mt-0.5 truncate">
                    {fhirCarePlan.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-2xs text-[#0e6027]">
                  {fhirCarePlan.domainCount > 0 && (
                    <span>{fhirCarePlan.domainCount} care gap domains</span>
                  )}
                  {fhirCarePlan.lastUpdated && <span>Updated {fhirCarePlan.lastUpdated}</span>}
                  <span className="text-[#198038]">Status: {fhirCarePlan.status}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href={`/patient-detail?id=${launchContext.patientId}&tab=wholeperson`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-[#198038] text-[#0e6027] hover:bg-[#defbe6] transition-colors"
              >
                <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                View in Patient Detail
              </a>
              <span className="font-bold px-2 py-1 bg-[#198038] text-white text-2xs">
                ✓ FHIR Live
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeSection === s.key
                ? 'bg-[#6929c4] text-white'
                : 'text-carbon-gray-70 hover:bg-white hover:text-carbon-gray-100'
            }`}
          >
            <Icon name={s.icon as any} size={13} />
            {s.label}
            {s.count !== undefined && (
              <span
                className={`text-2xs px-1.5 py-0.5 font-bold ${activeSection === s.key ? 'bg-white/20 text-white' : 'bg-carbon-gray-20 text-carbon-gray-70'}`}
              >
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chronic Conditions */}
      {activeSection === 'conditions' && (
        <div className="space-y-2">
          {CHRONIC_CONDITIONS.map((cond) => {
            const style = ACUITY_STYLE[cond.acuity];
            return (
              <div key={cond.code} className="bg-white border border-carbon-gray-20 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-carbon-gray-100">
                          {cond.label}
                        </span>
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 border ${style.badge}`}
                        >
                          {cond.acuity.toUpperCase()}
                        </span>
                        <span className="text-2xs font-mono text-carbon-gray-50">{cond.icd}</span>
                        <span className="text-2xs text-carbon-gray-50">{cond.hcc}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                        <span>
                          Goal: <span className="text-carbon-gray-70 font-medium">{cond.goal}</span>
                        </span>
                        <span>
                          Current:{' '}
                          <span className="text-carbon-gray-70 font-medium">{cond.current}</span>
                        </span>
                        <span>Last review: {cond.lastReview}</span>
                        <span>Next review: {cond.nextReview}</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 flex-shrink-0 ${STATUS_STYLE[cond.status] || 'bg-carbon-gray-10 text-carbon-gray-70 border border-carbon-gray-20'}`}
                  >
                    {cond.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Care Gaps */}
      {activeSection === 'gaps' && (
        <div className="space-y-2">
          {careGaps.length === 0 && (
            <div className="bg-white border border-carbon-gray-20 px-5 py-8 text-center text-sm text-carbon-gray-50">
              No care gaps on record for this patient.
            </div>
          )}
          {careGaps.map((gap) => {
            const isOpen = gap.status === 'Open' || gap.status === 'In Progress';
            return (
              <div
                key={gap.id}
                className={`bg-white border px-5 py-4 ${isOpen ? 'border-carbon-gray-20' : 'border-carbon-gray-10 opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {gap.measureName}
                      </span>
                      <span
                        className={`text-2xs font-medium px-1.5 py-0.5 border ${
                          gap.program === 'HEDIS'
                            ? 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]'
                            : gap.program === 'STARS'
                              ? 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]'
                              : 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]'
                        }`}
                      >
                        {gap.program}
                      </span>
                      <span
                        className={`text-2xs font-medium px-1.5 py-0.5 border ${
                          gap.status === 'Open'
                            ? 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]'
                            : gap.status === 'In Progress'
                              ? 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
                              : 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]'
                        }`}
                      >
                        {gap.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                      <span>
                        Due: <span className="font-medium text-carbon-gray-70">{gap.dueDate}</span>
                      </span>
                      {isOpen && (
                        <span className="text-[#da1e28] font-medium">{gap.daysOpen}d open</span>
                      )}
                      <span>Assigned: {gap.assignedTo}</span>
                    </div>
                    <p className="text-xs text-carbon-gray-50 mt-1.5 italic">{gap.notes}</p>
                    <p className="text-xs text-carbon-gray-50 mt-1">
                      <span className="font-medium text-carbon-gray-70">Closure: </span>
                      {gap.closureRequirement}
                    </p>
                  </div>
                  {isOpen && (
                    <div className="flex-shrink-0">
                      <Icon name="ExclamationTriangleIcon" size={16} className="text-[#f1c21b]" />
                    </div>
                  )}
                  {!isOpen && (
                    <div className="flex-shrink-0">
                      <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Closed Gaps */}
      {activeSection === 'closed-gaps' && (
        <div className="space-y-2">
          {closedGaps.length === 0 && (
            <div className="bg-white border border-carbon-gray-20 px-5 py-8 text-center text-sm text-carbon-gray-50">
              <Icon name="CheckCircleIcon" size={48} className="text-carbon-gray-30 mx-auto mb-3" />
              <p>No care gaps have been closed yet.</p>
              <p className="text-xs mt-2">
                Gaps will appear here when specialists complete referrals.
              </p>
            </div>
          )}
          {closedGaps.map((referral) => (
            <div key={referral.referralId} className="bg-white border border-[#a7f0ba] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Icon name="CheckCircleIcon" size={16} className="text-[#24a148]" />
                    <span className="text-sm font-semibold text-carbon-gray-100">
                      {referral.careGap?.description || 'Care Gap Closed'}
                    </span>
                    <span className="text-2xs font-medium px-1.5 py-0.5 border bg-[#defbe6] text-[#24a148] border-[#a7f0ba]">
                      CLOSED
                    </span>
                    <span className="text-2xs font-medium px-1.5 py-0.5 border bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]">
                      {referral.careGap?.measure || 'Quality Measure'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                    <span>
                      Patient:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {referral.patientName}
                      </span>
                    </span>
                    <span>
                      Specialist:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {referral.specialistType}
                      </span>
                    </span>
                    <span>
                      Closed:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {new Date().toLocaleDateString()}
                      </span>
                    </span>
                  </div>
                  {referral.careGap && (
                    <div className="mt-2 pt-2 border-t border-carbon-gray-20">
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-carbon-gray-50">
                          Target:{' '}
                          <span className="font-medium text-carbon-gray-70">
                            {referral.careGap.targetCriteria}
                          </span>
                        </span>
                        <span className="text-[#24a148] font-medium">✓ Criteria Met</span>
                      </div>
                    </div>
                  )}
                </div>
                {referral.careGap && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-carbon-gray-50">Gainshare Earned</p>
                    <p className="text-lg font-bold text-[#24a148]">
                      ${Math.round(referral.careGap.gainshareAmount * 0.6)}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">
                      60% of ${referral.careGap.gainshareAmount}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {closedGaps.length > 0 && gainshare && (
            <div className="bg-[#defbe6] border border-[#a7f0ba] px-5 py-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#24a148] mb-1">
                    Total Gainshare Earned
                  </p>
                  <p className="text-xs text-carbon-gray-70">
                    {gainshare.gapsClosed} gap{gainshare.gapsClosed !== 1 ? 's' : ''} closed this
                    period
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#24a148]">
                    ${gainshare.totalEarned.toLocaleString()}
                  </p>
                  <p className="text-xs text-carbon-gray-70">Provider share (60%)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Care Goals */}
      {activeSection === 'goals' && (
        <div className="space-y-2">
          <div className="bg-[#f6f2ff] border border-[#d4bbff] px-4 py-3">
            <p className="text-xs font-semibold text-[#6929c4]">Maria-specific workflow note</p>
            <p className="text-xs text-carbon-gray-70 mt-1">
              Transportation support has been routed to Unite Us. Eye exam and annual wellness visit
              are shown as upcoming scheduling needs, not active gaps already present in Maria's
              record.
            </p>
          </div>
          {CARE_GOALS.map((goal) => {
            const priorityStyle =
              GOAL_PRIORITY_STYLE[goal.priority] ||
              'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20';
            const statusConfig = GOAL_STATUS_ICON[goal.status] || {
              icon: 'ClockIcon',
              color: 'text-carbon-gray-50',
            };
            return (
              <div key={goal.id} className="bg-white border border-carbon-gray-20 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon
                      name={statusConfig.icon as any}
                      size={16}
                      className={`mt-0.5 flex-shrink-0 ${statusConfig.color}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-carbon-gray-100">
                          {goal.goal}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-carbon-gray-50 flex-wrap">
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 border ${priorityStyle}`}
                        >
                          {goal.priority.toUpperCase()}
                        </span>
                        <span className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-70">
                          {goal.category}
                        </span>
                        <span>
                          Owner:{' '}
                          <span className="font-medium text-carbon-gray-70">{goal.owner}</span>
                        </span>
                        <span>Target: {goal.targetDate}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-carbon-gray-50 flex-shrink-0">{goal.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Care Team */}
      {activeSection === 'team' && (
        <div className="space-y-2">
          {careTeamMembers.map((member, idx) => (
            <div key={idx} className="bg-white border border-carbon-gray-20 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-[#6929c4]/10 border border-[#d4bbff] flex items-center justify-center flex-shrink-0">
                  <Icon name="UserIcon" size={16} className="text-[#6929c4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-carbon-gray-100">
                      {member.name}
                    </span>
                    <span className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20 text-carbon-gray-70">
                      {member.type}
                    </span>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 border ${
                        member.status === 'Active'
                          ? 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]'
                          : 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
                      }`}
                    >
                      {member.status}
                    </span>
                  </div>
                  <p className="text-xs text-carbon-gray-50 mt-0.5">
                    {member.role} · {member.specialty}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {confirmedAssignments.length === 0 && (
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-3 text-xs text-carbon-gray-50 flex items-center gap-2">
              <Icon name="InformationCircleIcon" size={14} />
              No specialist assignments confirmed this visit yet. Use the Care Team tab to assign
              specialists.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
