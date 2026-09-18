'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { mockCareGaps, mockPatients } from '@/lib/mockData';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import type { MdOrder, CareTeamAssignment } from '@/lib/smartFhirTypes';

interface CarePlanPanelProps {
  launchContext: SmartLaunchContext;
  completedOrders: MdOrder[];
  confirmedAssignments: CareTeamAssignment[];
}

const CHRONIC_CONDITIONS = [
  {
    code: 'T2DM',
    label: 'Type 2 Diabetes Mellitus',
    icd: 'E11.65',
    hcc: 'HCC 18',
    acuity: 'critical',
    goal: 'A1C < 8.0%',
    current: 'A1C 9.2%',
    status: 'Off Target',
    lastReview: '2026-02-10',
    nextReview: '2026-05-10',
  },
  {
    code: 'CKD',
    label: 'Chronic Kidney Disease Stage 3b',
    icd: 'N18.32',
    hcc: 'HCC 136',
    acuity: 'critical',
    goal: 'eGFR stable ≥ 40',
    current: 'eGFR 42',
    status: 'Monitoring',
    lastReview: '2026-03-15',
    nextReview: '2026-06-15',
  },
  {
    code: 'HTN',
    label: 'Hypertension',
    icd: 'I10',
    hcc: 'HCC 85',
    acuity: 'high',
    goal: 'BP < 130/80',
    current: 'BP 158/96',
    status: 'Off Target',
    lastReview: '2026-04-01',
    nextReview: '2026-05-01',
  },
  {
    code: 'HF',
    label: 'Heart Failure (HFpEF)',
    icd: 'I50.30',
    hcc: 'HCC 85',
    acuity: 'high',
    goal: 'EF ≥ 50%, no decompensation',
    current: 'EF 55% — stable',
    status: 'On Target',
    lastReview: '2026-03-20',
    nextReview: '2026-06-20',
  },
  {
    code: 'AFIB',
    label: 'Atrial Fibrillation',
    icd: 'I48.91',
    hcc: 'HCC 96',
    acuity: 'moderate',
    goal: 'Rate controlled, anticoagulated',
    current: 'Rate 72 bpm — stable',
    status: 'On Target',
    lastReview: '2026-01-20',
    nextReview: '2026-07-20',
  },
];

const CARE_GOALS = [
  {
    id: 'goal-1',
    category: 'Clinical',
    goal: 'Achieve A1C < 8.0% within 6 months',
    owner: 'Dr. James Whitfield',
    targetDate: '2026-10-16',
    status: 'In Progress',
    priority: 'high',
  },
  {
    id: 'goal-2',
    category: 'Clinical',
    goal: 'Reduce BP to < 130/80 mmHg',
    owner: 'Dr. James Whitfield',
    targetDate: '2026-06-01',
    status: 'In Progress',
    priority: 'high',
  },
  {
    id: 'goal-3',
    category: 'Utilization',
    goal: 'Prevent ER visits — post-acute follow-up within 7 days',
    owner: 'Care Manager',
    targetDate: '2026-04-23',
    status: 'Active',
    priority: 'critical',
  },
  {
    id: 'goal-4',
    category: 'Medication',
    goal: 'Improve medication adherence PDC ≥ 0.80',
    owner: 'Pharmacy',
    targetDate: '2026-12-31',
    status: 'In Progress',
    priority: 'moderate',
  },
  {
    id: 'goal-5',
    category: 'Preventive',
    goal: 'Complete Nephrology referral and follow-up',
    owner: 'Dr. Priya Mehta',
    targetDate: '2026-05-30',
    status: 'Pending',
    priority: 'high',
  },
  {
    id: 'goal-6',
    category: 'Preventive',
    goal: 'Diabetic eye exam completed',
    owner: 'Ophthalmology',
    targetDate: '2026-09-30',
    status: 'Pending',
    priority: 'moderate',
  },
];

// Enhanced care gap data with financial context
const CARE_GAPS_FINANCIAL = [
  {
    id: 'cgf-001',
    measureName: 'A1C Testing (CDC)',
    measureId: 'CDC-001',
    program: 'HEDIS',
    status: 'Open',
    dueDate: '2026-09-30',
    daysOpen: 112,
    riskLevel: 'High',
    qualityBonus: '$220',
    sharedSavingsAttribution: '$85',
    networkImpact: 'High',
    qualityProgram: 'HEDIS CDC Measure',
    closureRequirement: 'A1C lab result within measurement year',
    assignedTo: 'Angela Torres',
  },
  {
    id: 'cgf-002',
    measureName: 'Controlling Hypertension (CBP)',
    measureId: 'CBP-236',
    program: 'HEDIS',
    status: 'In Progress',
    dueDate: '2026-12-31',
    daysOpen: 89,
    riskLevel: 'High',
    qualityBonus: '$195',
    sharedSavingsAttribution: '$72',
    networkImpact: 'High',
    qualityProgram: 'HEDIS CBP Measure',
    closureRequirement: 'BP reading < 140/90 documented',
    assignedTo: 'Dr. James Whitfield',
  },
  {
    id: 'cgf-003',
    measureName: 'Preventive Screening (COL)',
    measureId: 'COL-113',
    program: 'HEDIS',
    status: 'Open',
    dueDate: '2026-12-31',
    daysOpen: 45,
    riskLevel: 'Medium',
    qualityBonus: '$75',
    sharedSavingsAttribution: '$28',
    networkImpact: 'Medium',
    qualityProgram: 'HEDIS COL Measure',
    closureRequirement: 'Colonoscopy or FOBT within measurement period',
    assignedTo: 'Angela Torres',
  },
  {
    id: 'cgf-004',
    measureName: 'Statin Therapy (SPC)',
    measureId: 'SPC-438',
    program: 'STARS',
    status: 'Open',
    dueDate: '2026-09-30',
    daysOpen: 67,
    riskLevel: 'High',
    qualityBonus: '$140',
    sharedSavingsAttribution: '$55',
    networkImpact: 'High',
    qualityProgram: 'CMS STARS SPC Measure',
    closureRequirement: 'Active statin prescription documented',
    assignedTo: 'Angela Torres',
  },
  {
    id: 'cgf-005',
    measureName: 'SDoH Screening (MIPS-487)',
    measureId: 'MIPS-487',
    program: 'MIPS',
    status: 'Open',
    dueDate: '2026-12-31',
    daysOpen: 22,
    riskLevel: 'Low',
    qualityBonus: '$45',
    sharedSavingsAttribution: '$18',
    networkImpact: 'Low',
    qualityProgram: 'MIPS Quality Measure 487',
    closureRequirement: 'SDoH screening tool completed and documented',
    assignedTo: 'Angela Torres',
  },
];

// AI Care Plan Recommendations with explainability
const AI_RECOMMENDATIONS = [
  {
    id: 'ai-001',
    intervention: 'Cardiology Referral',
    icon: 'HeartIcon',
    sourceCareGap: 'Controlling Hypertension (CBP-236)',
    relatedCondition: 'Hypertension — BP 158/96 (Off Target)',
    qualityMeasure: 'HEDIS CBP-236',
    clinicalGuideline: 'JNC 8 Hypertension Guidelines — Stage 2 HTN with comorbidities',
    confidence: 94,
    expectedImpact: 'Close CBP care gap, improve quality score, reduce cardiovascular risk',
    gainShareValue: '$195',
    priority: 'critical',
    reason:
      'Patient has uncontrolled hypertension (BP 158/96) with concurrent HFpEF. Cardiology evaluation required per JNC 8 guidelines for resistant hypertension.',
  },
  {
    id: 'ai-002',
    intervention: 'A1C Lab Order',
    icon: 'BeakerIcon',
    sourceCareGap: 'A1C Testing (CDC-001)',
    relatedCondition: 'Type 2 Diabetes — A1C 9.2% (Off Target)',
    qualityMeasure: 'HEDIS CDC-001',
    clinicalGuideline:
      'ADA Standards of Care 2026 — A1C testing every 3 months for uncontrolled T2DM',
    confidence: 98,
    expectedImpact: 'Close CDC care gap, earn quality bonus, document disease control',
    gainShareValue: '$220',
    priority: 'high',
    reason:
      'A1C last measured 2026-02-10 at 9.2%. HEDIS CDC measure requires A1C test within measurement year. Gap has been open 112 days.',
  },
  {
    id: 'ai-003',
    intervention: 'Statin Prescription Review',
    icon: 'ClipboardDocumentCheckIcon',
    sourceCareGap: 'Statin Therapy (SPC-438)',
    relatedCondition: 'Cardiovascular Risk — LDL 118 mg/dL',
    qualityMeasure: 'CMS STARS SPC-438',
    clinicalGuideline:
      'ACC/AHA Cholesterol Guidelines — High-intensity statin for ASCVD risk ≥ 7.5%',
    confidence: 91,
    expectedImpact: 'Close SPC care gap, improve STARS rating, reduce CV event risk',
    gainShareValue: '$140',
    priority: 'high',
    reason:
      'Patient has T2DM + HTN + HFpEF — ASCVD risk > 10%. No active statin documented in current medication list. SPC gap open 67 days.',
  },
  {
    id: 'ai-004',
    intervention: 'Colorectal Cancer Screening Order',
    icon: 'DocumentMagnifyingGlassIcon',
    sourceCareGap: 'Preventive Screening (COL-113)',
    relatedCondition: 'Age-appropriate preventive care',
    qualityMeasure: 'HEDIS COL-113',
    clinicalGuideline: 'USPSTF Grade A — Colorectal cancer screening ages 45–75',
    confidence: 87,
    expectedImpact: 'Close COL care gap, earn quality bonus, fulfill preventive care obligation',
    gainShareValue: '$75',
    priority: 'moderate',
    reason:
      'Patient age-eligible for colorectal cancer screening. No prior colonoscopy or FOBT documented in claims or EMR. Gap open 45 days.',
  },
];

const ACUITY_STYLE: Record<string, { dot: string; badge: string }> = {
  critical: { dot: 'bg-[#da1e28]', badge: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]' },
  high: { dot: 'bg-[#f1c21b]', badge: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
  moderate: { dot: 'bg-[#0043ce]', badge: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]' },
};

const STATUS_STYLE: Record<string, string> = {
  'Off Target': 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
  'On Target': 'bg-[#defbe6] text-[#24a148] border border-[#a7f0ba]',
  Monitoring: 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
};

const GOAL_PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  high: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  moderate: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
};

const GOAL_STATUS_ICON: Record<string, { icon: string; color: string }> = {
  'In Progress': { icon: 'ClockIcon', color: 'text-[#b45309]' },
  Active: { icon: 'BoltIcon', color: 'text-[#da1e28]' },
  Pending: { icon: 'EllipsisHorizontalCircleIcon', color: 'text-carbon-gray-50' },
  Completed: { icon: 'CheckCircleIcon', color: 'text-[#24a148]' },
};

type Section = 'conditions' | 'gaps' | 'goals' | 'team' | 'ai-plan';

export default function CarePlanPanel({
  launchContext,
  completedOrders,
  confirmedAssignments,
}: CarePlanPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>('conditions');
  const [expandedAiRec, setExpandedAiRec] = useState<string | null>(null);
  const patient = mockPatients.find((p) => p.id === launchContext.patientId) || mockPatients[0];
  const careGaps = mockCareGaps.filter((g) => g.patientId === patient.id);
  const openGaps = careGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress');

  // Merge confirmed assignments + order-based referrals into care team
  const careTeamMembers = [
    {
      name: 'Dr. James Whitfield',
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

  const totalGainShare = CARE_GAPS_FINANCIAL.filter(
    (g) => g.status === 'Open' || g.status === 'In Progress'
  ).reduce((sum, g) => sum + parseInt(g.qualityBonus.replace('$', '')), 0);

  const SECTIONS: Array<{ key: Section; label: string; icon: string; count?: number }> = [
    {
      key: 'conditions',
      label: 'Chronic Conditions',
      icon: 'HeartIcon',
      count: CHRONIC_CONDITIONS.length,
    },
    {
      key: 'gaps',
      label: 'Care Gaps + Gain Share',
      icon: 'ExclamationTriangleIcon',
      count: CARE_GAPS_FINANCIAL.filter((g) => g.status !== 'Closed').length,
    },
    {
      key: 'ai-plan',
      label: 'AI Care Plan',
      icon: 'SparklesIcon',
      count: AI_RECOMMENDATIONS.length,
    },
    { key: 'goals', label: 'Care Goals', icon: 'FlagIcon', count: CARE_GOALS.length },
    { key: 'team', label: 'Care Team', icon: 'UserGroupIcon', count: careTeamMembers.length },
  ];

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
              {patient.name} · MRN {patient.mrn} · Enc:{' '}
              <span className="font-mono">{launchContext.encounterId}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2 py-1 bg-[#defbe6] text-[#24a148] border border-[#a7f0ba] font-medium">
              ✓ Care Plan Active
            </span>
            <span className="text-carbon-gray-50">Last updated: 2026-04-08</span>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mt-4 grid grid-cols-5 gap-3">
          {[
            {
              label: 'Chronic Conditions',
              value: CHRONIC_CONDITIONS.length,
              sub: '2 off target',
              color: 'text-[#da1e28]',
            },
            {
              label: 'Open Care Gaps',
              value: CARE_GAPS_FINANCIAL.filter((g) => g.status !== 'Closed').length,
              sub: `${careGaps.filter((g) => g.status === 'Closed').length} closed`,
              color: 'text-[#b45309]',
            },
            {
              label: 'AI Recommendations',
              value: AI_RECOMMENDATIONS.length,
              sub: 'Pending review',
              color: 'text-[#6929c4]',
            },
            {
              label: 'Active Goals',
              value: CARE_GOALS.filter((g) => g.status !== 'Completed').length,
              sub: '1 critical priority',
              color: 'text-[#da1e28]',
            },
            {
              label: 'Potential Gain Share',
              value: `$${totalGainShare}`,
              sub: 'If all gaps closed',
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

      {/* Section tabs */}
      <div className="flex gap-0.5 bg-carbon-gray-10 p-0.5 border border-carbon-gray-20">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeSection === s.key
                ? s.key === 'ai-plan'
                  ? 'bg-[#9f1853] text-white'
                  : 'bg-[#6929c4] text-white'
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

      {/* Care Gaps with Financial Context */}
      {activeSection === 'gaps' && (
        <div className="space-y-2">
          {/* Financial summary banner */}
          <div className="bg-[#defbe6] border border-[#a7f0ba] px-5 py-3 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Icon name="CurrencyDollarIcon" size={16} className="text-[#24a148]" />
              <span className="text-sm font-semibold text-[#0e6027]">
                Potential Quality Bonus: ${totalGainShare}
              </span>
            </div>
            <span className="text-xs text-[#0e6027]">
              Closing all open gaps contributes to network gain-share pool
            </span>
            <span className="ml-auto text-xs text-[#0e6027] font-medium">
              RHTP Performance Period 2026
            </span>
          </div>

          {CARE_GAPS_FINANCIAL.map((gap) => {
            const isOpen = gap.status === 'Open' || gap.status === 'In Progress';
            const totalValue =
              parseInt(gap.qualityBonus.replace('$', '')) +
              parseInt(gap.sharedSavingsAttribution.replace('$', ''));
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
                              : 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]'
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
                      <span
                        className={`text-2xs font-medium px-1.5 py-0.5 ${
                          gap.riskLevel === 'High'
                            ? 'bg-[#fff1f1] text-[#da1e28]'
                            : gap.riskLevel === 'Medium'
                              ? 'bg-[#fdf6dd] text-[#b45309]'
                              : 'bg-carbon-gray-10 text-carbon-gray-50'
                        }`}
                      >
                        {gap.riskLevel} Risk
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                      <span>
                        Due: <span className="font-medium text-carbon-gray-70">{gap.dueDate}</span>
                      </span>
                      {isOpen && (
                        <span className="text-[#da1e28] font-medium">{gap.daysOpen}d open</span>
                      )}
                      <span>
                        Measure:{' '}
                        <span className="font-mono text-carbon-gray-70">{gap.measureId}</span>
                      </span>
                      <span>Assigned: {gap.assignedTo}</span>
                    </div>
                    <p className="text-xs text-carbon-gray-50 mt-1">
                      <span className="font-medium text-carbon-gray-70">Closure: </span>
                      {gap.closureRequirement}
                    </p>
                  </div>

                  {/* Financial attribution */}
                  {isOpen && (
                    <div className="flex-shrink-0 bg-[#f0fff4] border border-[#a7f0ba] px-3 py-2.5 min-w-[140px]">
                      <p className="text-2xs text-[#0e6027] font-semibold uppercase tracking-wide mb-1.5">
                        Closing this gap earns:
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-2xs text-carbon-gray-50">Quality Bonus</span>
                          <span className="text-xs font-bold font-mono text-[#24a148]">
                            {gap.qualityBonus}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-2xs text-carbon-gray-50">Shared Savings</span>
                          <span className="text-xs font-bold font-mono text-[#24a148]">
                            {gap.sharedSavingsAttribution}
                          </span>
                        </div>
                        <div className="border-t border-[#a7f0ba] pt-1 flex justify-between items-center">
                          <span className="text-2xs font-semibold text-[#0e6027]">Total</span>
                          <span className="text-sm font-bold font-mono text-[#24a148]">
                            ${totalValue}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="text-2xs text-carbon-gray-50">Network Impact:</span>
                        <span
                          className={`text-2xs font-semibold ${
                            gap.networkImpact === 'High'
                              ? 'text-[#da1e28]'
                              : gap.networkImpact === 'Medium'
                                ? 'text-[#b45309]'
                                : 'text-carbon-gray-50'
                          }`}
                        >
                          {gap.networkImpact}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Care Plan with Explainability */}
      {activeSection === 'ai-plan' && (
        <div className="space-y-3">
          {/* AI header */}
          <div className="bg-[#f6f2ff] border border-[#d4bbff] px-5 py-3 flex items-center gap-3">
            <Icon name="SparklesIcon" size={16} className="text-[#6929c4]" />
            <div>
              <p className="text-sm font-semibold text-[#6929c4]">
                AI-Generated Care Plan Recommendations
              </p>
              <p className="text-xs text-carbon-gray-50">
                Each recommendation is linked to a care gap, quality measure, and gain-share
                opportunity
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-2xs font-semibold px-2 py-1 bg-[#6929c4] text-white">
                {AI_RECOMMENDATIONS.length} Interventions
              </span>
              <span className="text-2xs font-semibold px-2 py-1 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                $
                {AI_RECOMMENDATIONS.reduce(
                  (s, r) => s + parseInt(r.gainShareValue.replace('$', '')),
                  0
                )}{' '}
                Total Gain Share
              </span>
            </div>
          </div>

          {AI_RECOMMENDATIONS.map((rec) => {
            const isExpanded = expandedAiRec === rec.id;
            const priorityStyle =
              rec.priority === 'critical'
                ? 'border-l-[#da1e28]'
                : rec.priority === 'high'
                  ? 'border-l-[#b45309]'
                  : 'border-l-[#0043ce]';
            return (
              <div
                key={rec.id}
                className={`bg-white border border-carbon-gray-20 border-l-4 ${priorityStyle}`}
              >
                {/* Rec header */}
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-carbon-gray-10 transition-colors"
                  onClick={() => setExpandedAiRec(isExpanded ? null : rec.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
                        <Icon name={rec.icon as any} size={14} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-carbon-gray-100">
                            {rec.intervention}
                          </span>
                          <span
                            className={`text-2xs font-semibold px-1.5 py-0.5 ${
                              rec.priority === 'critical'
                                ? 'bg-[#fff1f1] text-[#da1e28]'
                                : rec.priority === 'high'
                                  ? 'bg-[#fdf6dd] text-[#b45309]'
                                  : 'bg-[#d0e2ff] text-[#0043ce]'
                            }`}
                          >
                            {rec.priority.toUpperCase()}
                          </span>
                          <span className="text-2xs font-mono text-carbon-gray-50">
                            {rec.qualityMeasure}
                          </span>
                        </div>
                        <p className="text-xs text-carbon-gray-50">
                          <span className="font-medium text-carbon-gray-70">Gap: </span>
                          {rec.sourceCareGap}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Confidence */}
                      <div className="text-center">
                        <div className="relative w-10 h-10">
                          <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                            <circle
                              cx="18"
                              cy="18"
                              r="15.9"
                              fill="none"
                              stroke="#e0e0e0"
                              strokeWidth="3"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r="15.9"
                              fill="none"
                              stroke="#6929c4"
                              strokeWidth="3"
                              strokeDasharray={`${rec.confidence} ${100 - rec.confidence}`}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-[#6929c4]">
                            {rec.confidence}%
                          </span>
                        </div>
                        <p className="text-2xs text-carbon-gray-50 mt-0.5">AI Conf.</p>
                      </div>
                      {/* Gain share */}
                      <div className="bg-[#defbe6] border border-[#a7f0ba] px-2.5 py-2 text-center">
                        <p className="text-sm font-bold font-mono text-[#24a148]">
                          {rec.gainShareValue}
                        </p>
                        <p className="text-2xs text-[#0e6027]">Gain Share</p>
                      </div>
                      <Icon
                        name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                        size={14}
                        className="text-carbon-gray-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Explainability panel */}
                {isExpanded && (
                  <div className="border-t border-carbon-gray-20 px-5 py-4 bg-[#fafafa]">
                    <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Icon name="LightBulbIcon" size={13} className="text-[#6929c4]" />
                      Why was this intervention suggested?
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Reason
                          </p>
                          <p className="text-xs text-carbon-gray-100 leading-relaxed">
                            {rec.reason}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Related Condition
                          </p>
                          <p className="text-xs font-medium text-carbon-gray-100">
                            {rec.relatedCondition}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Source Care Gap
                          </p>
                          <p className="text-xs font-medium text-[#0043ce]">{rec.sourceCareGap}</p>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Supporting Quality Measure
                          </p>
                          <p className="text-xs font-semibold text-carbon-gray-100">
                            {rec.qualityMeasure}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Clinical Guideline
                          </p>
                          <p className="text-xs text-carbon-gray-70 italic">
                            {rec.clinicalGuideline}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                            Expected Impact
                          </p>
                          <p className="text-xs text-[#24a148] font-medium">{rec.expectedImpact}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-carbon-gray-20 flex items-center gap-3">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors">
                        <Icon name="CheckIcon" size={12} />
                        Accept Recommendation
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 border border-carbon-gray-20 bg-white text-carbon-gray-70 text-xs font-medium hover:bg-carbon-gray-10 transition-colors">
                        <Icon name="XMarkIcon" size={12} />
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Care Goals */}
      {activeSection === 'goals' && (
        <div className="space-y-2">
          {CARE_GOALS.map((goal) => {
            const priorityStyle =
              GOAL_PRIORITY_STYLE[goal.priority] ||
              'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20';
            const statusInfo = GOAL_STATUS_ICON[goal.status] || {
              icon: 'ClockIcon',
              color: 'text-carbon-gray-50',
            };
            return (
              <div key={goal.id} className="bg-white border border-carbon-gray-20 px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-2xs font-semibold px-1.5 py-0.5 border ${priorityStyle}`}
                      >
                        {goal.priority.toUpperCase()}
                      </span>
                      <span className="text-2xs text-carbon-gray-50 px-1.5 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20">
                        {goal.category}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-carbon-gray-100">{goal.goal}</p>
                    <div className="flex items-center gap-4 text-xs text-carbon-gray-50 mt-1 flex-wrap">
                      <span>
                        Owner: <span className="font-medium text-carbon-gray-70">{goal.owner}</span>
                      </span>
                      <span>
                        Target:{' '}
                        <span className="font-mono text-carbon-gray-70">{goal.targetDate}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Icon name={statusInfo.icon as any} size={14} className={statusInfo.color} />
                    <span className={`text-xs font-medium ${statusInfo.color}`}>{goal.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Care Team */}
      {activeSection === 'team' && (
        <div className="space-y-2">
          {careTeamMembers.map((member, i) => (
            <div
              key={`member-${i}`}
              className="bg-white border border-carbon-gray-20 px-5 py-4 flex items-center gap-4"
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  member.type === 'PCP' ? 'bg-[#0043ce]' : 'bg-[#6929c4]'
                }`}
              >
                <span className="text-white text-xs font-bold">
                  {member.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-carbon-gray-100">{member.name}</p>
                <p className="text-xs text-carbon-gray-50">
                  {member.role} · {member.specialty}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-2xs font-semibold px-2 py-0.5 ${
                    member.type === 'PCP'
                      ? 'bg-[#d0e2ff] text-[#0043ce]'
                      : 'bg-[#f6f2ff] text-[#6929c4]'
                  }`}
                >
                  {member.type}
                </span>
                <span
                  className={`text-2xs font-semibold px-2 py-0.5 ${
                    member.status === 'Active'
                      ? 'bg-[#defbe6] text-[#0e6027]'
                      : 'bg-[#fdf6dd] text-[#b45309]'
                  }`}
                >
                  {member.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
