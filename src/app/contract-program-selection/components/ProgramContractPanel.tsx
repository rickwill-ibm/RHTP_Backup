'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';

type ProgramType = 'All' | 'Clinical' | 'BH' | 'Social';

const COVERED_COUNTIES = [
  'Bennett',
  'Oglala Lakota',
  'Tripp',
  'Fall River',
  'Gregory',
  'Charles Mix',
  'Pennington',
  'Mellette',
  'Todd',
  'Lyman',
  'Jones',
  'Haakon',
  'Jackson',
  'Ziebach',
];

const CLINICAL_GAPS = [
  {
    measure: 'A1C Control (CDC)',
    program: 'HEDIS',
    target: '75%',
    current: '68%',
    status: 'At Risk',
  },
  {
    measure: 'Controlling Hypertension (CBP)',
    program: 'HEDIS',
    target: '72%',
    current: '71%',
    status: 'On Track',
  },
  {
    measure: 'Colorectal Cancer Screening (COL)',
    program: 'HEDIS',
    target: '65%',
    current: '58%',
    status: 'At Risk',
  },
  {
    measure: 'Diabetes Eye Exam (EED)',
    program: 'HEDIS',
    target: '60%',
    current: '54%',
    status: 'At Risk',
  },
  {
    measure: 'Statin Therapy (SPC)',
    program: 'STARS',
    target: '80%',
    current: '77%',
    status: 'On Track',
  },
  {
    measure: 'SDoH Screening (MIPS-487)',
    program: 'MIPS',
    target: '70%',
    current: '62%',
    status: 'At Risk',
  },
];

const BH_GAPS = [
  {
    measure: 'Follow-Up After Hospitalization — 7-day (FUH)',
    program: 'BH-HEDIS',
    target: '65%',
    current: '58%',
    status: 'At Risk',
  },
  {
    measure: 'Follow-Up After Hospitalization — 30-day (FUM)',
    program: 'BH-HEDIS',
    target: '72%',
    current: '69%',
    status: 'On Track',
  },
  {
    measure: 'Antidepressant Medication Mgmt (AMM)',
    program: 'BH-HEDIS',
    target: '68%',
    current: '61%',
    status: 'At Risk',
  },
  {
    measure: 'SUD Treatment Initiation (IET)',
    program: 'BH-HEDIS',
    target: '60%',
    current: '54%',
    status: 'At Risk',
  },
  {
    measure: 'SUD Treatment Engagement (IET-E)',
    program: 'BH-HEDIS',
    target: '55%',
    current: '47%',
    status: 'At Risk',
  },
  {
    measure: 'Screening for Depression (CDF)',
    program: 'BH-HEDIS',
    target: '80%',
    current: '76%',
    status: 'On Track',
  },
];

const SOCIAL_GAPS = [
  {
    measure: 'PRAPARE Screening Completion',
    program: 'Social',
    target: '70%',
    current: '61%',
    status: 'At Risk',
  },
  {
    measure: 'SNAP Enrollment Rate (SNAP-ENR)',
    program: 'Social',
    target: '75%',
    current: '74%',
    status: 'On Track',
  },
  {
    measure: 'Housing Referral Completion (HOUS-REF)',
    program: 'Social',
    target: '65%',
    current: '52%',
    status: 'At Risk',
  },
  {
    measure: 'CHW Visit Completion Rate (CHW-VISIT)',
    program: 'Social',
    target: '80%',
    current: '77%',
    status: 'On Track',
  },
  {
    measure: 'Dual-Need Cohort Enrollment',
    program: 'Social',
    target: '60%',
    current: '48%',
    status: 'At Risk',
  },
  {
    measure: 'Transportation Assistance Rate',
    program: 'Social',
    target: '55%',
    current: '51%',
    status: 'On Track',
  },
];

const ALL_GAPS = [
  {
    measure: 'A1C Control (CDC)',
    program: 'HEDIS',
    target: '75%',
    current: '68%',
    status: 'At Risk',
  },
  {
    measure: 'BH Access Rate (FUH 7-day)',
    program: 'BH-HEDIS',
    target: '65%',
    current: '58%',
    status: 'At Risk',
  },
  {
    measure: 'PRAPARE Screening Completion',
    program: 'Social',
    target: '70%',
    current: '61%',
    status: 'At Risk',
  },
  {
    measure: 'Controlling Hypertension (CBP)',
    program: 'HEDIS',
    target: '72%',
    current: '71%',
    status: 'On Track',
  },
  {
    measure: 'Antidepressant Medication Mgmt (AMM)',
    program: 'BH-HEDIS',
    target: '68%',
    current: '61%',
    status: 'At Risk',
  },
  {
    measure: 'SNAP Enrollment Rate (SNAP-ENR)',
    program: 'Social',
    target: '75%',
    current: '74%',
    status: 'On Track',
  },
];

const PROGRAM_GAP_CONFIG: Record<
  ProgramType,
  {
    gaps: typeof CLINICAL_GAPS;
    title: string;
    icon: string;
    headerColor: string;
    programBadgeColors: Record<string, string>;
  }
> = {
  All: {
    gaps: ALL_GAPS,
    title: 'Target Care Gaps & Quality Measures — All Programs',
    icon: 'ChartBarIcon',
    headerColor: '#0043ce',
    programBadgeColors: {
      HEDIS: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      'BH-HEDIS': 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
      Social: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
      STARS: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
      MIPS: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
    },
  },
  Clinical: {
    gaps: CLINICAL_GAPS,
    title: 'Target Care Gaps & Quality Measures — Clinical Program',
    icon: 'ChartBarIcon',
    headerColor: '#0043ce',
    programBadgeColors: {
      HEDIS: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
      STARS: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
      MIPS: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
    },
  },
  BH: {
    gaps: BH_GAPS,
    title: 'Behavioral Health Quality Measures — BH Program',
    icon: 'HeartIcon',
    headerColor: '#9f1853',
    programBadgeColors: {
      'BH-HEDIS': 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
    },
  },
  Social: {
    gaps: SOCIAL_GAPS,
    title: 'Social Program Performance Measures',
    icon: 'ClipboardDocumentCheckIcon',
    headerColor: '#198038',
    programBadgeColors: {
      Social: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
    },
  },
};

const SHARED_SAVINGS: Record<
  ProgramType,
  {
    totalPool: string;
    earnedYTD: string;
    projectedFull: string;
    minThreshold: string;
    maxEarnRate: string;
    benchmarkPMPM: string;
    actualPMPM: string;
  }
> = {
  All: {
    totalPool: '$4.2M',
    earnedYTD: '$1.27M',
    projectedFull: '$2.1M',
    minThreshold: '65%',
    maxEarnRate: '40%',
    benchmarkPMPM: '$892',
    actualPMPM: '$847',
  },
  Clinical: {
    totalPool: '$3.2M',
    earnedYTD: '$1.1M',
    projectedFull: '$1.84M',
    minThreshold: '65%',
    maxEarnRate: '40%',
    benchmarkPMPM: '$892',
    actualPMPM: '$847',
  },
  BH: {
    totalPool: '$0.8M',
    earnedYTD: '$0.28M',
    projectedFull: '$0.52M',
    minThreshold: '60%',
    maxEarnRate: '35%',
    benchmarkPMPM: '$210',
    actualPMPM: '$198',
  },
  Social: {
    totalPool: '$0.2M',
    earnedYTD: '$0.06M',
    projectedFull: '$0.14M',
    minThreshold: '55%',
    maxEarnRate: '30%',
    benchmarkPMPM: '$48',
    actualPMPM: '$44',
  },
};

const NETWORK_BADGES: Record<ProgramType, Array<{ label: string; color: string }>> = {
  All: [
    { label: '4 FQHCs', color: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]' },
    { label: '3 Rural Hospitals', color: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' },
    { label: '48 BH Organizations', color: 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]' },
    { label: '84 CBO Partners', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
  ],
  Clinical: [
    { label: '4 FQHCs', color: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]' },
    { label: '3 Rural Hospitals', color: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' },
    { label: '6 PCP Practices', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
    { label: '5 Specialist Groups', color: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]' },
  ],
  BH: [
    { label: '18 BH Counseling Centers', color: 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]' },
    {
      label: '8 Crisis Stabilization Units',
      color: 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]',
    },
    { label: '12 SUD Treatment Programs', color: 'bg-[#ffd6e8] text-[#9f1853] border-[#ffafd2]' },
    { label: '10 Psychiatric Practices', color: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]' },
  ],
  Social: [
    { label: '32 Housing Navigators', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
    { label: '24 Food Banks / SNAP Orgs', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
    { label: '18 CHW Organizations', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
    { label: '10 Transportation CBOs', color: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]' },
  ],
};

const PROGRAM_DESCRIPTIONS: Record<
  ProgramType,
  {
    name: string;
    sponsor: string;
    population: string;
    populationSub: string;
    model: string;
    modelSub: string;
  }
> = {
  All: {
    name: 'South Dakota Rural Health Transformation Program — All Programs',
    sponsor: 'SD Department of Health & Human Services (DHSS)',
    population: '128,400 Attributed Lives',
    populationSub: 'Clinical + BH + Social program enrollees',
    model: 'Two-Sided Risk — Track 2',
    modelSub: 'Whole-person shared savings across all three program domains',
  },
  Clinical: {
    name: 'South Dakota Rural Health Transformation Program — Clinical',
    sponsor: 'SD Department of Health & Human Services (DHSS)',
    population: '128,400 Medicaid Beneficiaries',
    populationSub: 'Rural, low-income, and underserved populations',
    model: 'Two-Sided Risk — Track 2',
    modelSub: 'Min savings threshold: 65% · Max earn rate: 40%',
  },
  BH: {
    name: 'SD RHTP — Behavioral Health Program',
    sponsor: 'SD DHSS + Division of Behavioral Health (DBH)',
    population: '41,200 BH Program Enrollees',
    populationSub: 'Medicaid beneficiaries with BH diagnosis or SUD',
    model: 'BH Pay-for-Performance — Track 1',
    modelSub: 'FUH/FUM, AMM, IET quality gate thresholds apply',
  },
  Social: {
    name: 'SD RHTP — Social Programs',
    sponsor: 'SD DHSS + Office of Social Services (OSS)',
    population: '64,800 Screened Social Program Lives',
    populationSub: 'PRAPARE-screened Medicaid population with ≥1 SDOH need',
    model: 'CBO Performance-Based Contracting',
    modelSub: 'Screening completion, benefit enrollment, and dual-need closure rates',
  },
};

interface ProgramContractPanelProps {
  showFull?: boolean;
  programType?: ProgramType;
}

export default function ProgramContractPanel({
  showFull = false,
  programType = 'Clinical',
}: ProgramContractPanelProps) {
  const gapConfig = PROGRAM_GAP_CONFIG[programType];
  const savings = SHARED_SAVINGS[programType];
  const badges = NETWORK_BADGES[programType];
  const desc = PROGRAM_DESCRIPTIONS[programType];

  return (
    <div className="space-y-4">
      {/* Contract Summary */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-3 border-b border-carbon-gray-20 bg-[#f0f4ff] flex items-center gap-2">
          <Icon name="DocumentTextIcon" size={15} className="text-[#0043ce]" />
          <h3 className="text-sm font-semibold text-carbon-gray-100">Executive Contract Summary</h3>
          {programType !== 'All' && programType !== 'Clinical' && (
            <span
              className="ml-2 text-2xs font-semibold px-2 py-0.5 border"
              style={
                programType === 'BH'
                  ? { background: '#ffd6e8', color: '#9f1853', borderColor: '#ffafd2' }
                  : { background: '#defbe6', color: '#0e6027', borderColor: '#a7f0ba' }
              }
            >
              {programType === 'BH' ? '🧠 Behavioral Health' : '🤝 Social Programs'}
            </span>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Program Details */}
          <div className="space-y-3">
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Rural Health Program
              </p>
              <p className="text-sm font-semibold text-carbon-gray-100">{desc.name}</p>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                State Sponsor
              </p>
              <p className="text-sm font-medium text-carbon-gray-100">{desc.sponsor}</p>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Covered Counties ({COVERED_COUNTIES.length})
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {COVERED_COUNTIES.map((c) => (
                  <span
                    key={c}
                    className="text-2xs px-2 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Covered Population
              </p>
              <p className="text-sm font-semibold text-carbon-gray-100">{desc.population}</p>
              <p className="text-xs text-carbon-gray-50">{desc.populationSub}</p>
            </div>
          </div>

          {/* Right: Financial Model */}
          <div className="space-y-3">
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Payment Model
              </p>
              <p className="text-sm font-medium text-carbon-gray-100">{desc.model}</p>
              <p className="text-xs text-carbon-gray-50">{desc.modelSub}</p>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Gain Share Pool
              </p>
              <p className="text-xl font-bold font-mono text-[#24a148]">{savings.totalPool}</p>
              <p className="text-xs text-carbon-gray-50">
                Earned YTD: {savings.earnedYTD} · Projected: {savings.projectedFull}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-carbon-gray-10 px-3 py-2.5 border border-carbon-gray-20">
                <p className="text-2xs text-carbon-gray-50">Benchmark PMPM</p>
                <p className="text-base font-bold font-mono text-carbon-gray-100">
                  {savings.benchmarkPMPM}
                </p>
              </div>
              <div className="bg-[#defbe6] px-3 py-2.5 border border-[#a7f0ba]">
                <p className="text-2xs text-[#0e6027]">Actual PMPM</p>
                <p className="text-base font-bold font-mono text-[#24a148]">{savings.actualPMPM}</p>
              </div>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-1">
                Network Participants
              </p>
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className={`text-2xs font-semibold px-2 py-0.5 border ${b.color}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Target Care Gaps & Quality Measures */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
          <Icon name={gapConfig.icon as any} size={15} style={{ color: gapConfig.headerColor }} />
          <h3 className="text-sm font-semibold text-carbon-gray-100">{gapConfig.title}</h3>
          <span className="ml-auto text-xs text-carbon-gray-50">
            Performance Period: Jan–Dec 2026
          </span>
        </div>
        <div className="divide-y divide-carbon-gray-20">
          {gapConfig.gaps.map((gap) => {
            const currentPct = parseInt(gap.current);
            const targetPct = parseInt(gap.target);
            const progress = Math.min((currentPct / targetPct) * 100, 100);
            const isOnTrack = gap.status === 'On Track';
            const badgeClass =
              gapConfig.programBadgeColors[gap.program] ??
              'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20';
            return (
              <div key={gap.measure} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-carbon-gray-100">{gap.measure}</span>
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 border ${badgeClass}`}>
                      {gap.program}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-carbon-gray-20 relative overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${isOnTrack ? 'bg-[#24a148]' : 'bg-[#b45309]'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-carbon-gray-70 flex-shrink-0">
                      {gap.current} <span className="text-carbon-gray-30">/ {gap.target}</span>
                    </span>
                  </div>
                </div>
                <span
                  className={`text-2xs font-semibold px-2 py-1 flex-shrink-0 ${
                    isOnTrack ? 'bg-[#defbe6] text-[#0e6027]' : 'bg-[#fdf6dd] text-[#b45309]'
                  }`}
                >
                  {gap.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
