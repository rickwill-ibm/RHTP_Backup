'use client';
// Tab state is mirrored in ?tab= query param so deep-links and refresh restore the active program.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { useGapClosureStore } from '@/lib/patientContext';
import STARSPayerBonusJourney, { type STARSMeasure } from './components/STARSPayerBonusJourney';
import HEDISMeasureDocJourney, { type HEDISMeasure } from './components/HEDISMeasureDocJourney';
import MIPSPaymentAdjJourney, { type MIPSAdjustment } from './components/MIPSPaymentAdjJourney';
import {
  exportSTARSCSV,
  exportHEDISCSV,
  exportMIPSCSV,
  generatePDFReport,
} from '@/lib/exportUtils';
import CohortAttributionModal from './components/CohortAttributionModal';
import type { MeasureDescriptor } from '@/lib/careTeam/cohorts';

// ─── Mock Data ────────────────────────────────────────────────────────────────
const STARS_MEASURES: STARSMeasure[] = [
  {
    id: 'stars-001',
    measureId: 'D01',
    measureName: 'Diabetes Care — HbA1c Control',
    domain: 'Diabetes',
    currentRating: 3,
    targetRating: 4,
    gapCount: 47,
    bonusEstimate: 128400,
    deadline: '2024-09-30',
    contractName: 'BlueCross MA-001',
    status: 'open',
  },
  {
    id: 'stars-002',
    measureId: 'C12',
    measureName: 'Controlling Blood Pressure',
    domain: 'Cardiovascular',
    currentRating: 2,
    targetRating: 4,
    gapCount: 83,
    bonusEstimate: 214700,
    deadline: '2024-09-30',
    contractName: 'Aetna MA-002',
    status: 'open',
  },
  {
    id: 'stars-003',
    measureId: 'D08',
    measureName: 'Statin Use in Persons with Diabetes',
    domain: 'Diabetes',
    currentRating: 4,
    targetRating: 5,
    gapCount: 22,
    bonusEstimate: 58200,
    deadline: '2024-10-15',
    contractName: 'BlueCross MA-001',
    status: 'in-progress',
  },
  {
    id: 'stars-004',
    measureId: 'B09',
    measureName: 'Annual Flu Vaccine',
    domain: 'Preventive',
    currentRating: 3,
    targetRating: 4,
    gapCount: 156,
    bonusEstimate: 312000,
    deadline: '2024-11-01',
    contractName: 'UHC MA-003',
    status: 'open',
  },
];

const HEDIS_MEASURES: HEDISMeasure[] = [
  {
    id: 'hedis-001',
    measureId: 'CDC-HbA1c',
    measureName: 'Comprehensive Diabetes Care — HbA1c Testing',
    domain: 'Diabetes',
    complianceRate: 71,
    targetRate: 85,
    patientsDue: 312,
    patientsCompliant: 221,
    dueDate: '2024-12-31',
    contractName: 'BlueCross MA-001',
    evidenceTypes: ['Lab Result', 'Encounter Note', 'Claims'],
    status: 'open',
  },
  {
    id: 'hedis-002',
    measureId: 'CBP',
    measureName: 'Controlling High Blood Pressure',
    domain: 'Cardiovascular',
    complianceRate: 58,
    targetRate: 75,
    patientsDue: 487,
    patientsCompliant: 282,
    dueDate: '2024-12-31',
    contractName: 'Aetna MA-002',
    evidenceTypes: ['Encounter Note', 'Claims', 'Patient Attestation'],
    status: 'open',
  },
  {
    id: 'hedis-003',
    measureId: 'BCS',
    measureName: 'Breast Cancer Screening',
    domain: 'Preventive',
    complianceRate: 63,
    targetRate: 80,
    patientsDue: 198,
    patientsCompliant: 125,
    dueDate: '2024-12-31',
    contractName: 'UHC MA-003',
    evidenceTypes: ['Lab Result', 'Referral Completion', 'Claims'],
    status: 'in-progress',
  },
  {
    id: 'hedis-004',
    measureId: 'COL',
    measureName: 'Colorectal Cancer Screening',
    domain: 'Preventive',
    complianceRate: 54,
    targetRate: 72,
    patientsDue: 267,
    patientsCompliant: 144,
    dueDate: '2024-12-31',
    contractName: 'BlueCross MA-001',
    evidenceTypes: ['Encounter Note', 'Claims', 'Referral Completion'],
    status: 'open',
  },
];

const MIPS_ADJUSTMENTS: MIPSAdjustment[] = [
  {
    id: 'mips-001',
    noticeId: 'CMS-ADJ-2024-00847',
    performanceYear: '2023',
    compositeScore: 62,
    adjustmentPct: -1.25,
    adjustmentAmount: 48200,
    qualityScore: 58,
    promotingInteropScore: 70,
    improvementActScore: 40,
    costScore: 65,
    deadline: '2024-08-15',
    status: 'open',
    appealEligible: true,
  },
  {
    id: 'mips-002',
    noticeId: 'CMS-ADJ-2024-00912',
    performanceYear: '2023',
    compositeScore: 88,
    adjustmentPct: 1.75,
    adjustmentAmount: 67400,
    qualityScore: 90,
    promotingInteropScore: 85,
    improvementActScore: 80,
    costScore: 92,
    deadline: '2024-09-01',
    status: 'open',
    appealEligible: false,
  },
  {
    id: 'mips-003',
    noticeId: 'CMS-ADJ-2024-01034',
    performanceYear: '2022',
    compositeScore: 45,
    adjustmentPct: -4.0,
    adjustmentAmount: 154800,
    qualityScore: 42,
    promotingInteropScore: 55,
    improvementActScore: 35,
    costScore: 48,
    deadline: '2024-07-30',
    status: 'in-review',
    appealEligible: true,
  },
];

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KPIStrip({ program }: { program: 'STARS' | 'HEDIS' | 'MIPS' }) {
  // ── Derived from data arrays ────────────────────────────────────────────────
  const starsOpenGaps = STARS_MEASURES.reduce((a, m) => a + m.gapCount, 0);
  const starsBonus = STARS_MEASURES.reduce((a, m) => a + m.bonusEstimate, 0);
  const starsInProgress = STARS_MEASURES.filter((m) => m.status === 'in-progress').length;
  const starsAvgRating = (
    STARS_MEASURES.reduce((a, m) => a + m.currentRating, 0) / STARS_MEASURES.length
  ).toFixed(1);

  const hedisAvgCompliance = (
    HEDIS_MEASURES.reduce((a, m) => a + m.complianceRate, 0) / HEDIS_MEASURES.length
  ).toFixed(1);
  const hedisPatientsDue = HEDIS_MEASURES.reduce(
    (a, m) => a + (m.patientsDue - m.patientsCompliant),
    0
  );
  const hedisOpen = HEDIS_MEASURES.filter((m) => m.status === 'open').length;
  const hedisInProgress = HEDIS_MEASURES.filter((m) => m.status === 'in-progress').length;

  const mipsAvgScore = Math.round(
    MIPS_ADJUSTMENTS.reduce((a, m) => a + m.compositeScore, 0) / MIPS_ADJUSTMENTS.length
  );
  const mipsPenalty = MIPS_ADJUSTMENTS.filter((m) => m.adjustmentPct < 0).reduce(
    (a, m) => a + m.adjustmentAmount,
    0
  );
  const mipsBonus = MIPS_ADJUSTMENTS.filter((m) => m.adjustmentPct > 0).reduce(
    (a, m) => a + m.adjustmentAmount,
    0
  );
  const mipsPending = MIPS_ADJUSTMENTS.filter((m) => m.status !== 'closed').length;
  const mipsPenaltyCount = MIPS_ADJUSTMENTS.filter((m) => m.adjustmentPct < 0).length;
  const mipsBonusCount = MIPS_ADJUSTMENTS.filter((m) => m.adjustmentPct > 0).length;

  const kpis = {
    STARS: [
      {
        label: 'Avg Star Rating',
        value: starsAvgRating,
        sub: 'Target: 4.0',
        color: '#b45309',
        icon: 'StarIcon',
      },
      {
        label: 'Open Measure Gaps',
        value: starsOpenGaps.toLocaleString(),
        sub: `Across ${STARS_MEASURES.length} measures`,
        color: '#da1e28',
        icon: 'ExclamationTriangleIcon',
      },
      {
        label: 'Bonus at Risk',
        value: `$${(starsBonus / 1000).toFixed(0)}K`,
        sub: 'If gaps not closed',
        color: '#da1e28',
        icon: 'CurrencyDollarIcon',
      },
      {
        label: 'Measures In-Progress',
        value: String(starsInProgress),
        sub: `of ${STARS_MEASURES.length} active`,
        color: '#0043ce',
        icon: 'ArrowPathIcon',
      },
    ],
    HEDIS: [
      {
        label: 'Avg Compliance Rate',
        value: `${hedisAvgCompliance}%`,
        sub: 'Target: 78%',
        color: '#da1e28',
        icon: 'ChartBarIcon',
      },
      {
        label: 'Patients Due',
        value: hedisPatientsDue.toLocaleString(),
        sub: `Across ${HEDIS_MEASURES.length} measures`,
        color: '#b45309',
        icon: 'UserGroupIcon',
      },
      {
        label: 'Measures Open',
        value: String(hedisOpen),
        sub: `of ${HEDIS_MEASURES.length} active`,
        color: '#da1e28',
        icon: 'DocumentTextIcon',
      },
      {
        label: 'Measures In-Progress',
        value: String(hedisInProgress),
        sub: 'Certification pending',
        color: '#0043ce',
        icon: 'ArrowPathIcon',
      },
    ],
    MIPS: [
      {
        label: 'Avg Composite Score',
        value: String(mipsAvgScore),
        sub: 'Threshold: 75',
        color: '#b45309',
        icon: 'ChartBarIcon',
      },
      {
        label: 'Pending Adjustments',
        value: String(mipsPending),
        sub: 'Notices to review',
        color: '#da1e28',
        icon: 'DocumentMagnifyingGlassIcon',
      },
      {
        label: 'Penalty Exposure',
        value: `$${(mipsPenalty / 1000).toFixed(0)}K`,
        sub: `Across ${mipsPenaltyCount} notice${mipsPenaltyCount !== 1 ? 's' : ''}`,
        color: '#da1e28',
        icon: 'ExclamationTriangleIcon',
      },
      {
        label: 'Bonus Earned',
        value: `$${(mipsBonus / 1000).toFixed(1)}K`,
        sub: `${mipsBonusCount} positive adjustment${mipsBonusCount !== 1 ? 's' : ''}`,
        color: '#24a148',
        icon: 'CurrencyDollarIcon',
      },
    ],
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-carbon-gray-20">
      {kpis[program].map((kpi) => (
        <div key={kpi.label} className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0 mt-0.5">
            <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
          </div>
          <div>
            <p className="font-mono text-lg font-bold leading-tight" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="text-xs font-semibold text-carbon-gray-100 leading-tight">{kpi.label}</p>
            <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── STARS Table ──────────────────────────────────────────────────────────────
type MeasureOverlay = Record<string, { numerator: number; denominator: number; rate: number }>;

function STARSTable({
  onSelect,
  onCreateCohort,
  overlay = {},
}: {
  onSelect: (m: STARSMeasure) => void;
  onCreateCohort: (d: MeasureDescriptor) => void;
  overlay?: MeasureOverlay;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Measure</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Domain</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Contract</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Current</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Target</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Citizens</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Bonus Est.</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Deadline</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {STARS_MEASURES.map((m) => {
            const live = overlay[m.id];
            return (
              <tr
                key={m.id}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-[#b45309]">{m.measureId}</p>
                  <p className="text-carbon-gray-70 mt-0.5">{m.measureName}</p>
                </td>
                <td className="px-4 py-3 text-carbon-gray-70">{m.domain}</td>
                <td className="px-4 py-3 text-carbon-gray-50 font-mono text-2xs">
                  {m.contractName}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Icon
                        key={i}
                        name="StarIcon"
                        size={12}
                        className={i < m.currentRating ? 'text-[#b45309]' : 'text-carbon-gray-20'}
                      />
                    ))}
                  </div>
                  {live && (
                    <p className="text-2xs text-[#0043ce] mt-0.5 font-mono">{live.rate}% FHIR</p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Icon
                        key={i}
                        name="StarIcon"
                        size={12}
                        className={i < m.targetRating ? 'text-[#0043ce]' : 'text-carbon-gray-20'}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-[#da1e28]">
                  {live ? live.denominator - live.numerator : m.gapCount}
                  {live && (
                    <p className="text-2xs text-[#0043ce] font-normal">
                      {live.numerator}/{live.denominator} FHIR
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-[#24a148]">
                  ${m.bonusEstimate.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">
                  {m.deadline}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${m.status === 'open' ? 'bg-[#ffd7d9] text-[#da1e28]' : m.status === 'in-progress' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {m.status.replace('-', ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={() => onSelect(m)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#b45309] text-white text-2xs font-semibold hover:bg-[#8a3e07] transition-colors whitespace-nowrap"
                    >
                      <Icon name="PlayIcon" size={10} />
                      Start Workflow
                    </button>
                    <button
                      onClick={() =>
                        onCreateCohort({
                          measureKey: m.measureId,
                          measureName: m.measureName,
                          contractName: m.contractName,
                          program: 'STARS',
                          openGapCount: m.gapCount,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] transition-colors whitespace-nowrap"
                    >
                      <Icon name="UserGroupIcon" size={10} />
                      Assign to Care Manager
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── HEDIS Table ──────────────────────────────────────────────────────────────
function HEDISTable({
  onSelect,
  onCreateCohort,
  overlay = {},
}: {
  onSelect: (m: HEDISMeasure) => void;
  onCreateCohort: (d: MeasureDescriptor) => void;
  overlay?: MeasureOverlay;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Measure</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Domain</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Contract</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Compliance</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Target</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">
              Patients Due
            </th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Due Date</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {HEDIS_MEASURES.map((m) => {
            const live = overlay[m.id];
            const displayRate = live ? live.rate : m.complianceRate;
            const color =
              displayRate >= m.targetRate
                ? '#24a148'
                : displayRate >= m.targetRate * 0.8
                  ? '#b45309'
                  : '#da1e28';
            return (
              <tr
                key={m.id}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-[#0043ce]">{m.measureId}</p>
                  <p className="text-carbon-gray-70 mt-0.5">{m.measureName}</p>
                </td>
                <td className="px-4 py-3 text-carbon-gray-70">{m.domain}</td>
                <td className="px-4 py-3 text-carbon-gray-50 font-mono text-2xs">
                  {m.contractName}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-mono font-bold" style={{ color }}>
                    {displayRate}%
                    {live && <span className="ml-1 text-2xs font-normal text-[#0043ce]">FHIR</span>}
                  </p>
                  <div className="w-16 h-1 bg-carbon-gray-20 mt-1 ml-auto">
                    <div
                      className="h-full"
                      style={{ width: `${displayRate}%`, backgroundColor: color }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-carbon-gray-70">
                  {m.targetRate}%
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-mono font-bold text-[#da1e28]">
                    {live ? live.denominator - live.numerator : m.patientsDue - m.patientsCompliant}
                  </p>
                  <p className="text-carbon-gray-30 text-2xs">
                    {live ? live.denominator : m.patientsDue} total
                  </p>
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">{m.dueDate}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${m.status === 'open' ? 'bg-[#ffd7d9] text-[#da1e28]' : m.status === 'in-progress' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {m.status.replace('-', ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={() => onSelect(m)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] transition-colors whitespace-nowrap"
                    >
                      <Icon name="PlayIcon" size={10} />
                      Start Workflow
                    </button>
                    <button
                      onClick={() =>
                        onCreateCohort({
                          measureKey: m.measureId,
                          measureName: m.measureName,
                          contractName: m.contractName,
                          program: 'HEDIS',
                          openGapCount: live
                            ? live.denominator - live.numerator
                            : m.patientsDue - m.patientsCompliant,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#6929c4] text-white text-2xs font-semibold hover:bg-[#491d8b] transition-colors whitespace-nowrap"
                    >
                      <Icon name="UserGroupIcon" size={10} />
                      Assign to Care Manager
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MIPS Table ───────────────────────────────────────────────────────────────
function MIPSTable({ onSelect }: { onSelect: (a: MIPSAdjustment) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Notice ID</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
              Perf. Year
            </th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
              Composite Score
            </th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Adjustment</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Amount</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">
              Appeal Eligible
            </th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Deadline</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {MIPS_ADJUSTMENTS.map((a) => {
            const isPenalty = a.adjustmentPct < 0;
            return (
              <tr
                key={a.id}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-[#6929c4]">{a.noticeId}</p>
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">
                  {a.performanceYear}
                </td>
                <td className="px-4 py-3 text-center">
                  <p
                    className={`font-mono font-bold text-lg ${a.compositeScore >= 75 ? 'text-[#24a148]' : a.compositeScore >= 60 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                  >
                    {a.compositeScore}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`font-mono font-bold ${isPenalty ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                  >
                    {isPenalty ? '' : '+'}
                    {a.adjustmentPct}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  <span className={isPenalty ? 'text-[#da1e28]' : 'text-[#24a148]'}>
                    {isPenalty ? '-' : '+'}${Math.abs(a.adjustmentAmount).toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {a.appealEligible ? (
                    <span className="text-2xs font-semibold text-[#24a148] bg-[#defbe6] px-2 py-0.5">
                      YES
                    </span>
                  ) : (
                    <span className="text-2xs font-semibold text-carbon-gray-50 bg-carbon-gray-10 px-2 py-0.5">
                      NO
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">
                  {a.deadline}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${a.status === 'open' ? 'bg-[#ffd7d9] text-[#da1e28]' : a.status === 'in-review' ? 'bg-[#d0e2ff] text-[#0043ce]' : a.status === 'appealed' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {a.status.replace('-', ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSelect(a)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#6929c4] text-white text-2xs font-semibold hover:bg-[#491d8b] transition-colors whitespace-nowrap"
                  >
                    <Icon name="PlayIcon" size={10} />
                    Start Workflow
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── BH Measures Data ─────────────────────────────────────────────────────────
interface BHMeasure {
  id: string;
  measureId: string;
  measureName: string;
  domain: string;
  complianceRate: number;
  targetRate: number;
  patientsDue: number;
  patientsCompliant: number;
  dueDate: string;
  contractName: string;
  status: 'open' | 'in-progress' | 'closed';
  description: string;
}

const BH_MEASURES: BHMeasure[] = [
  {
    id: 'bh-001',
    measureId: 'FUH',
    measureName: 'Follow-Up After Hospitalization for Mental Illness',
    domain: 'Behavioral Health',
    complianceRate: 48,
    targetRate: 72,
    patientsDue: 87,
    patientsCompliant: 42,
    dueDate: '2024-12-31',
    contractName: 'Medicaid Managed Care',
    status: 'open',
    description: '7-day and 30-day follow-up after inpatient psychiatric discharge',
  },
  {
    id: 'bh-002',
    measureId: 'FUM',
    measureName: 'Follow-Up After Emergency Dept Visit for Mental Illness',
    domain: 'Behavioral Health',
    complianceRate: 41,
    targetRate: 65,
    patientsDue: 124,
    patientsCompliant: 51,
    dueDate: '2024-12-31',
    contractName: 'Medicaid Managed Care',
    status: 'open',
    description: '7-day and 30-day follow-up after ED visit for mental illness',
  },
  {
    id: 'bh-003',
    measureId: 'AMM',
    measureName: 'Antidepressant Medication Management',
    domain: 'Behavioral Health',
    complianceRate: 62,
    targetRate: 78,
    patientsDue: 203,
    patientsCompliant: 126,
    dueDate: '2024-12-31',
    contractName: 'BlueCross MA-001',
    status: 'in-progress',
    description: 'Acute and continuation phase antidepressant medication adherence',
  },
  {
    id: 'bh-004',
    measureId: 'SAA',
    measureName: 'Adherence to Antipsychotic Medications for Schizophrenia',
    domain: 'Behavioral Health',
    complianceRate: 55,
    targetRate: 70,
    patientsDue: 67,
    patientsCompliant: 37,
    dueDate: '2024-12-31',
    contractName: 'Medicaid Managed Care',
    status: 'open',
    description: 'Proportion of days covered (PDC) ≥80% for antipsychotic medications',
  },
];

// ─── BH KPI Strip ─────────────────────────────────────────────────────────────
function BHKPIStrip() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-carbon-gray-20">
      {(() => {
        const fuh = BH_MEASURES.find((m) => m.measureId === 'FUH');
        const amm = BH_MEASURES.find((m) => m.measureId === 'AMM');
        const avgCompliance = Math.round(
          BH_MEASURES.reduce((a, m) => a + m.complianceRate, 0) / BH_MEASURES.length
        );
        const patientsDue = BH_MEASURES.reduce(
          (a, m) => a + (m.patientsDue - m.patientsCompliant),
          0
        );
        return [
          {
            label: 'Avg BH Compliance',
            value: `${avgCompliance}%`,
            sub: 'Target: 71%',
            color: '#b45309',
            icon: 'ChartBarIcon',
          },
          {
            label: 'Patients Due',
            value: String(patientsDue),
            sub: `Across ${BH_MEASURES.length} BH measures`,
            color: '#da1e28',
            icon: 'UserGroupIcon',
          },
          {
            label: 'FUH 7-Day Rate',
            value: fuh ? `${fuh.complianceRate}%` : '—',
            sub: fuh
              ? `Target: ${fuh.targetRate}% — gap: ${fuh.targetRate - fuh.complianceRate}pts`
              : 'No FUH data',
            color: '#da1e28',
            icon: 'ExclamationTriangleIcon',
          },
          {
            label: 'AMM Continuation',
            value: amm ? `${amm.complianceRate}%` : '—',
            sub: amm
              ? amm.status === 'in-progress'
                ? 'In-progress workflow'
                : `Target: ${amm.targetRate}%`
              : 'No AMM data',
            color: '#007d79',
            icon: 'ArrowPathIcon',
          },
        ];
      })().map((kpi) => (
        <div key={kpi.label} className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0 mt-0.5">
            <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
          </div>
          <div>
            <p className="font-mono text-lg font-bold leading-tight" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="text-xs font-semibold text-carbon-gray-100 leading-tight">{kpi.label}</p>
            <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── BH Measures Table ────────────────────────────────────────────────────────
function BHTable({ onCreateCohort }: { onCreateCohort: (d: MeasureDescriptor) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Measure</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Description</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Contract</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Compliance</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Target</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Gap</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Due Date</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {BH_MEASURES.map((m) => {
            const gap = m.targetRate - m.complianceRate;
            const color =
              m.complianceRate >= m.targetRate
                ? '#24a148'
                : m.complianceRate >= m.targetRate * 0.8
                  ? '#b45309'
                  : '#da1e28';
            return (
              <tr
                key={m.id}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-[#007d79]">{m.measureId}</p>
                  <p className="text-carbon-gray-70 mt-0.5 max-w-xs">{m.measureName}</p>
                </td>
                <td className="px-4 py-3 text-carbon-gray-50 max-w-xs">{m.description}</td>
                <td className="px-4 py-3 text-carbon-gray-50 font-mono text-2xs">
                  {m.contractName}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-mono font-bold" style={{ color }}>
                    {m.complianceRate}%
                  </p>
                  <div className="w-16 h-1 bg-carbon-gray-20 mt-1 ml-auto">
                    <div
                      className="h-full"
                      style={{ width: `${m.complianceRate}%`, backgroundColor: color }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-carbon-gray-70">
                  {m.targetRate}%
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono font-bold text-[#da1e28]">-{gap}pts</span>
                  <p className="text-2xs text-carbon-gray-50">
                    {m.patientsDue - m.patientsCompliant} patients
                  </p>
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">{m.dueDate}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${m.status === 'open' ? 'bg-[#ffd7d9] text-[#da1e28]' : m.status === 'in-progress' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {m.status.replace('-', ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-[#007d79] text-white text-2xs font-semibold hover:bg-[#005d5d] transition-colors whitespace-nowrap">
                      <Icon name="PlayIcon" size={10} />
                      Close Gap
                    </button>
                    <button
                      onClick={() =>
                        onCreateCohort({
                          measureKey: m.measureId,
                          measureName: m.measureName,
                          contractName: m.contractName,
                          program: 'BH',
                          openGapCount: m.patientsDue - m.patientsCompliant,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] transition-colors whitespace-nowrap"
                    >
                      <Icon name="UserGroupIcon" size={10} />
                      Assign to Care Manager
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Social Program Measures ──────────────────────────────────────────────────
interface SocialMeasure {
  id: string;
  measureId: string;
  measureName: string;
  domain: string;
  completionRate: number;
  targetRate: number;
  populationDue: number;
  populationCompliant: number;
  dueDate: string;
  programName: string;
  status: 'open' | 'in-progress' | 'closed';
  description: string;
}

const SOCIAL_MEASURES: SocialMeasure[] = [
  {
    id: 'soc-001',
    measureId: 'PRAPARE',
    measureName: 'PRAPARE Social Needs Screening Completion',
    domain: 'Screening',
    completionRate: 61,
    targetRate: 80,
    populationDue: 12400,
    populationCompliant: 7564,
    dueDate: '2024-12-31',
    programName: 'RHTP Social Program',
    status: 'open',
    description:
      'Percentage of attributed population with completed PRAPARE screening in measurement year',
  },
  {
    id: 'soc-002',
    measureId: 'SNAP-ENR',
    measureName: 'SNAP Benefit Enrollment Rate',
    domain: 'Food Security',
    completionRate: 74,
    targetRate: 85,
    populationDue: 4820,
    populationCompliant: 3567,
    dueDate: '2024-12-31',
    programName: 'Food Security Program',
    status: 'in-progress',
    description:
      'Percentage of SNAP-eligible screened patients successfully enrolled in SNAP benefits',
  },
  {
    id: 'soc-003',
    measureId: 'HOUS-REF',
    measureName: 'Housing Referral Completion Rate',
    domain: 'Housing',
    completionRate: 48,
    targetRate: 70,
    populationDue: 2140,
    populationCompliant: 1027,
    dueDate: '2024-12-31',
    programName: 'Housing Navigation Program',
    status: 'open',
    description:
      'Percentage of patients with housing instability who received and completed a housing referral',
  },
  {
    id: 'soc-004',
    measureId: 'CHW-VISIT',
    measureName: 'CHW Home Visit Completion Rate',
    domain: 'Community Health',
    completionRate: 82,
    targetRate: 85,
    populationDue: 3280,
    populationCompliant: 2690,
    dueDate: '2024-12-31',
    programName: 'CHW Program',
    status: 'in-progress',
    description:
      'Percentage of assigned high-risk patients receiving at least one CHW home visit per quarter',
  },
  {
    id: 'soc-005',
    measureId: 'DUAL-NEED',
    measureName: 'Dual-Need Cohort Care Plan Completion',
    domain: 'Whole Person',
    completionRate: 56,
    targetRate: 75,
    populationDue: 1840,
    populationCompliant: 1030,
    dueDate: '2024-12-31',
    programName: 'Whole Person Care Program',
    status: 'open',
    description:
      'Percentage of patients with 2+ social domains with an active whole-person care plan',
  },
];

function SocialKPIStrip() {
  const avgCompletion = Math.round(
    SOCIAL_MEASURES.reduce((a, m) => a + m.completionRate, 0) / SOCIAL_MEASURES.length
  );
  const totalGap = SOCIAL_MEASURES.reduce(
    (a, m) => a + (m.populationDue - m.populationCompliant),
    0
  );
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-carbon-gray-20">
      {[
        {
          label: 'Avg Completion Rate',
          value: `${avgCompletion}%`,
          sub: 'Target: 79%',
          color: '#b45309',
          icon: 'ChartBarIcon',
        },
        {
          label: 'Population Gap',
          value: totalGap.toLocaleString(),
          sub: 'Across 5 measures',
          color: '#da1e28',
          icon: 'UserGroupIcon',
        },
        (() => {
          const m = SOCIAL_MEASURES.find((s) => s.measureId === 'PRAPARE');
          return {
            label: 'PRAPARE Screening',
            value: m ? `${m.completionRate}%` : '—',
            sub: m
              ? `Target: ${m.targetRate}% — gap: ${m.targetRate - m.completionRate}pts`
              : 'No data',
            color: '#da1e28',
            icon: 'ClipboardDocumentCheckIcon',
          };
        })(),
        (() => {
          const m = SOCIAL_MEASURES.find((s) => s.measureId === 'CHW-VISIT');
          return {
            label: 'CHW Visit Rate',
            value: m ? `${m.completionRate}%` : '—',
            sub: m
              ? `Target: ${m.targetRate}% — gap: ${m.targetRate - m.completionRate}pts`
              : 'No data',
            color: m && m.completionRate >= m.targetRate * 0.9 ? '#198038' : '#b45309',
            icon: 'HomeIcon',
          };
        })(),
      ].map((kpi) => (
        <div key={kpi.label} className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0 mt-0.5">
            <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
          </div>
          <div>
            <p className="font-mono text-lg font-bold leading-tight" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="text-xs font-semibold text-carbon-gray-100 leading-tight">{kpi.label}</p>
            <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SocialTable({ onCreateCohort }: { onCreateCohort: (d: MeasureDescriptor) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Measure</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Description</th>
            <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Program</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Completion</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Target</th>
            <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">Gap</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Due Date</th>
            <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {SOCIAL_MEASURES.map((m) => {
            const gap = m.targetRate - m.completionRate;
            const color =
              m.completionRate >= m.targetRate
                ? '#24a148'
                : m.completionRate >= m.targetRate * 0.8
                  ? '#b45309'
                  : '#da1e28';
            return (
              <tr
                key={m.id}
                className="border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-[#198038]">{m.measureId}</p>
                  <p className="text-carbon-gray-70 mt-0.5 max-w-xs">{m.measureName}</p>
                  <span className="text-2xs text-carbon-gray-50 bg-carbon-gray-10 px-1.5 py-0.5 mt-1 inline-block">
                    {m.domain}
                  </span>
                </td>
                <td className="px-4 py-3 text-carbon-gray-50 max-w-xs">{m.description}</td>
                <td className="px-4 py-3 text-carbon-gray-50 font-mono text-2xs">
                  {m.programName}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-mono font-bold" style={{ color }}>
                    {m.completionRate}%
                  </p>
                  <div className="w-16 h-1 bg-carbon-gray-20 mt-1 ml-auto">
                    <div
                      className="h-full"
                      style={{ width: `${m.completionRate}%`, backgroundColor: color }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-carbon-gray-70">
                  {m.targetRate}%
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono font-bold text-[#da1e28]">-{gap}pts</span>
                  <p className="text-2xs text-carbon-gray-50">
                    {(m.populationDue - m.populationCompliant).toLocaleString()} people
                  </p>
                </td>
                <td className="px-4 py-3 text-center font-mono text-carbon-gray-70">{m.dueDate}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${m.status === 'open' ? 'bg-[#ffd7d9] text-[#da1e28]' : m.status === 'in-progress' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-[#defbe6] text-[#0e6027]'}`}
                  >
                    {m.status.replace('-', ' ').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-[#198038] text-white text-2xs font-semibold hover:bg-[#0e6027] transition-colors whitespace-nowrap">
                      <Icon name="PlayIcon" size={10} />
                      Close Gap
                    </button>
                    <button
                      onClick={() =>
                        onCreateCohort({
                          measureKey: m.measureId,
                          measureName: m.measureName,
                          contractName: m.programName,
                          program: 'Social',
                          openGapCount: m.populationDue - m.populationCompliant,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] transition-colors whitespace-nowrap"
                    >
                      <Icon name="UserGroupIcon" size={10} />
                      Assign to Care Manager
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Program Tab ──────────────────────────────────────────────────────────────
type Program = 'STARS' | 'HEDIS' | 'MIPS' | 'BH' | 'Social';

const PROGRAM_CONFIG: Record<
  Program,
  {
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
  }
> = {
  STARS: {
    label: 'STARS',
    description: 'Payer Bonus Workflow',
    color: '#b45309',
    bgColor: '#fdf6dd',
    borderColor: '#f1c21b',
    icon: 'StarIcon',
  },
  HEDIS: {
    label: 'HEDIS',
    description: 'Measure Documentation Workflow',
    color: '#0043ce',
    bgColor: '#edf5ff',
    borderColor: '#97c1ff',
    icon: 'DocumentCheckIcon',
  },
  MIPS: {
    label: 'MIPS',
    description: 'Payment Adjustment Review',
    color: '#6929c4',
    bgColor: '#f6f2ff',
    borderColor: '#d4bbff',
    icon: 'ScaleIcon',
  },
  BH: {
    label: 'BH Quality',
    description: 'Behavioral Health Measures',
    color: '#007d79',
    bgColor: '#d9fbfb',
    borderColor: '#3ddbd9',
    icon: 'HeartIcon',
  },
  Social: {
    label: 'Social Programs',
    description: 'Screening, Enrollment & CBO Metrics',
    color: '#198038',
    bgColor: '#defbe6',
    borderColor: '#a7f0ba',
    icon: 'ClipboardDocumentCheckIcon',
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────
// ─── MeasureReport FHIR→display overlay ──────────────────────────────────────
// Maps a canonical measure URL fragment to the local static measure IDs
const MEASURE_URL_TO_ID: Record<string, string> = {
  'CDC-HbA1c': 'hedis-001',
  CBP: 'hedis-002',
  BCS: 'hedis-003',
  COL: 'hedis-004',
  D01: 'stars-001',
  C12: 'stars-002',
  D08: 'stars-003',
  B09: 'stars-004',
};

function extractMeasureId(url: string): string | null {
  for (const key of Object.keys(MEASURE_URL_TO_ID)) {
    if (url?.includes(key)) return MEASURE_URL_TO_ID[key];
  }
  return null;
}

export default function STARSHEDISMIPSPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') ?? 'STARS') as Program;
  const [activeProgram, setActiveProgram] = useState<Program>(
    Object.keys(PROGRAM_CONFIG).includes(initialTab) ? initialTab : 'STARS'
  );

  // Mirror active tab into URL without pushing a new history entry
  const handleSetProgram = React.useCallback(
    (prog: Program) => {
      setActiveProgram(prog);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set('tab', prog);
      router.replace(`/stars-hedis-mips?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );
  const [fhirSource, setFhirSource] = useState(false);
  const [fhirMeasureCount, setFhirMeasureCount] = useState(0);
  // Live FHIR MeasureReport overlays: measureId → { numerator, denominator, complianceRate }
  const [fhirMeasureOverlay, setFhirMeasureOverlay] = useState<
    Record<string, { numerator: number; denominator: number; rate: number }>
  >({});
  const fhirLoadedRef = useRef(false);
  const { closures } = useGapClosureStore();
  const closureCount = Object.values(closures).filter((c) => c.status === 'CLOSED').length;
  const prevClosureCountRef = useRef(closureCount);

  const fetchMeasureReports = () => {
    if (getFhirMockMode()) return;
    getFhirClient()
      .search('MeasureReport', { _count: 50 })
      .then((bundle: any) => {
        const reports: any[] = (bundle?.entry ?? [])
          .map((e: any) => e?.resource)
          .filter(Boolean)
          .filter((r: any) => r?.resourceType === 'MeasureReport');
        const count = reports.length;
        if (count > 0) {
          setFhirMeasureCount(count);
          setFhirSource(true);
          // Build overlay map: match MeasureReport.measure URL to local measure IDs
          const overlay: Record<string, { numerator: number; denominator: number; rate: number }> =
            {};
          for (const report of reports) {
            const measureUrl: string = report.measure ?? '';
            const localId = extractMeasureId(measureUrl);
            if (!localId) continue;
            // Extract numerator/denominator from MeasureReport.group[0].population
            const populations: any[] = report.group?.[0]?.population ?? [];
            const numeratorPop = populations.find((p: any) =>
              p.code?.coding?.some((c: any) => c.code === 'numerator')
            );
            const denominatorPop = populations.find((p: any) =>
              p.code?.coding?.some((c: any) => c.code === 'denominator')
            );
            const numerator: number = numeratorPop?.count ?? 0;
            const denominator: number = denominatorPop?.count ?? 0;
            const rate = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
            overlay[localId] = { numerator, denominator, rate };
          }
          if (Object.keys(overlay).length > 0) setFhirMeasureOverlay(overlay);
        }
      })
      .catch(() => {});
  };

  // Initial load
  useEffect(() => {
    if (fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    fetchMeasureReports();
  }, []);

  // Re-fetch MeasureReports whenever a new gap closure is recorded in the store
  useEffect(() => {
    if (closureCount > prevClosureCountRef.current) {
      prevClosureCountRef.current = closureCount;
      console.info(`[MeasureReport] Re-fetching after gap closure (${closureCount} closed gaps)`);
      fetchMeasureReports();
    }
  }, [closureCount]);
  const [selectedSTARS, setSelectedSTARS] = useState<STARSMeasure | null>(null);
  const [selectedHEDIS, setSelectedHEDIS] = useState<HEDISMeasure | null>(null);
  const [selectedMIPS, setSelectedMIPS] = useState<MIPSAdjustment | null>(null);
  const [cohortMeasure, setCohortMeasure] = useState<MeasureDescriptor | null>(null);

  const cfg = PROGRAM_CONFIG[activeProgram];

  const handleExportCSV = () => {
    if (activeProgram === 'STARS') {
      exportSTARSCSV(STARS_MEASURES);
      toast.success('STARS CSV downloaded', {
        description: `${STARS_MEASURES.length} measures exported`,
      });
    } else if (activeProgram === 'HEDIS') {
      exportHEDISCSV(HEDIS_MEASURES);
      toast.success('HEDIS CSV downloaded', {
        description: `${HEDIS_MEASURES.length} measures exported`,
      });
    } else if (activeProgram === 'MIPS') {
      exportMIPSCSV(MIPS_ADJUSTMENTS);
      toast.success('MIPS CSV downloaded', {
        description: `${MIPS_ADJUSTMENTS.length} adjustments exported`,
      });
    } else if (activeProgram === 'BH') {
      toast.success('BH Quality CSV downloaded', {
        description: `${BH_MEASURES.length} measures exported`,
      });
    } else {
      toast.success('Social Programs CSV downloaded', {
        description: `${SOCIAL_MEASURES.length} measures exported`,
      });
    }
  };

  const handleProgramReport = () => {
    if (activeProgram === 'STARS') {
      const totalBonus = STARS_MEASURES.reduce((s, m) => s + m.bonusEstimate, 0);
      const totalGaps = STARS_MEASURES.reduce((s, m) => s + m.gapCount, 0);
      generatePDFReport({
        reportTitle: 'STARS Payer Bonus Report',
        subtitle: 'Measure Gap & Bonus Opportunity Summary',
        sections: [
          {
            title: 'STARS Summary',
            rows: [
              { label: 'Total Measures', value: String(STARS_MEASURES.length) },
              { label: 'Total Open Gaps', value: String(totalGaps) },
              { label: 'Total Bonus at Risk', value: `$${totalBonus.toLocaleString()}` },
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
        ],
        tableHeaders: [
          'Measure ID',
          'Measure Name',
          'Domain',
          'Contract',
          'Current Rating',
          'Target Rating',
          'Gaps',
          'Bonus Estimate',
          'Deadline',
          'Status',
        ],
        tableRows: STARS_MEASURES.map((m) => [
          m.measureId,
          m.measureName,
          m.domain,
          m.contractName,
          `${m.currentRating}★`,
          `${m.targetRating}★`,
          String(m.gapCount),
          `$${m.bonusEstimate.toLocaleString()}`,
          m.deadline,
          m.status.toUpperCase(),
        ]),
      });
    } else if (activeProgram === 'HEDIS') {
      const totalDue = HEDIS_MEASURES.reduce(
        (s, m) => s + (m.patientsDue - m.patientsCompliant),
        0
      );
      generatePDFReport({
        reportTitle: 'HEDIS Measure Documentation Report',
        subtitle: 'Compliance & Documentation Queue Summary',
        sections: [
          {
            title: 'HEDIS Summary',
            rows: [
              { label: 'Total Measures', value: String(HEDIS_MEASURES.length) },
              { label: 'Total Patients Remaining', value: String(totalDue) },
              {
                label: 'Avg Compliance Rate',
                value: `${(HEDIS_MEASURES.reduce((s, m) => s + m.complianceRate, 0) / HEDIS_MEASURES.length).toFixed(1)}%`,
              },
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
        ],
        tableHeaders: [
          'Measure ID',
          'Measure Name',
          'Domain',
          'Contract',
          'Compliance',
          'Target',
          'Patients Due',
          'Compliant',
          'Remaining',
          'Status',
        ],
        tableRows: HEDIS_MEASURES.map((m) => [
          m.measureId,
          m.measureName,
          m.domain,
          m.contractName,
          `${m.complianceRate}%`,
          `${m.targetRate}%`,
          String(m.patientsDue),
          String(m.patientsCompliant),
          String(m.patientsDue - m.patientsCompliant),
          m.status.toUpperCase(),
        ]),
      });
    } else if (activeProgram === 'MIPS') {
      const totalPenalty = MIPS_ADJUSTMENTS.filter((a) => a.adjustmentPct < 0).reduce(
        (s, a) => s + a.adjustmentAmount,
        0
      );
      generatePDFReport({
        reportTitle: 'MIPS Payment Adjustment Report',
        subtitle: 'CMS Payment Adjustment Notice Summary',
        sections: [
          {
            title: 'MIPS Summary',
            rows: [
              { label: 'Total Notices', value: String(MIPS_ADJUSTMENTS.length) },
              { label: 'Total Penalty Exposure', value: `$${totalPenalty.toLocaleString()}` },
              {
                label: 'Appeal-Eligible Notices',
                value: String(MIPS_ADJUSTMENTS.filter((a) => a.appealEligible).length),
              },
              {
                label: 'Avg Composite Score',
                value: (
                  MIPS_ADJUSTMENTS.reduce((s, a) => s + a.compositeScore, 0) /
                  MIPS_ADJUSTMENTS.length
                ).toFixed(1),
              },
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
        ],
        tableHeaders: [
          'Notice ID',
          'Perf. Year',
          'Composite Score',
          'Adjustment %',
          'Amount',
          'Quality',
          'Promoting Interop',
          'Deadline',
          'Appeal Eligible',
          'Status',
        ],
        tableRows: MIPS_ADJUSTMENTS.map((a) => [
          a.noticeId,
          a.performanceYear,
          String(a.compositeScore),
          `${a.adjustmentPct > 0 ? '+' : ''}${a.adjustmentPct}%`,
          `${a.adjustmentPct < 0 ? '-' : '+'}$${Math.abs(a.adjustmentAmount).toLocaleString()}`,
          String(a.qualityScore),
          String(a.promotingInteropScore),
          a.deadline,
          a.appealEligible ? 'Yes' : 'No',
          a.status.toUpperCase(),
        ]),
      });
    } else {
      generatePDFReport({
        reportTitle:
          activeProgram === 'BH' ? 'BH Quality Measures Report' : 'Social Programs Quality Report',
        subtitle:
          activeProgram === 'BH'
            ? 'Behavioral Health HEDIS Measure Compliance Summary'
            : 'Social Program Completion & Screening Rate Summary',
        sections: [
          {
            title: `${activeProgram} Summary`,
            rows: [
              {
                label: 'Total Measures',
                value: String(activeProgram === 'BH' ? BH_MEASURES.length : SOCIAL_MEASURES.length),
              },
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
        ],
        tableHeaders: ['Measure ID', 'Measure Name', 'Completion', 'Target', 'Gap', 'Status'],
        tableRows: (activeProgram === 'BH' ? BH_MEASURES : SOCIAL_MEASURES).map((m) => [
          m.measureId,
          m.measureName,
          `${(m as any).complianceRate ?? (m as any).completionRate}%`,
          `${m.targetRate}%`,
          `-${m.targetRate - ((m as any).complianceRate ?? (m as any).completionRate)}pts`,
          m.status.toUpperCase(),
        ]),
      });
    }
    toast.success(`${activeProgram} report opened`, {
      description: "Use your browser's Print dialog to save as PDF",
    });
  };

  return (
    <AppLayout
      pageTitle="Quality Gaps & Attribution"
      breadcrumbs={[{ label: 'TCOC Platform' }, { label: 'Quality Gaps & Attribution' }]}
    >
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2 border-b border-carbon-gray-20">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {fhirMeasureCount} MeasureReport resources verified in HAPI FHIR
          </span>
        </div>
      )}
      {/* Program Selector */}
      <div className="bg-white border-b border-carbon-gray-20 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.keys(PROGRAM_CONFIG) as Program[]).map((prog) => {
            const c = PROGRAM_CONFIG[prog];
            const isActive = activeProgram === prog;
            return (
              <button
                key={prog}
                onClick={() => handleSetProgram(prog)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors border ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-white border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10'
                }`}
                style={isActive ? { backgroundColor: c.color, borderColor: c.color } : {}}
              >
                <Icon name={c.icon as any} size={14} />
                {c.label}
                <span
                  className={`text-2xs font-normal ${isActive ? 'text-white/70' : 'text-carbon-gray-30'}`}
                >
                  {c.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Strip */}
      {activeProgram === 'BH' ? (
        <BHKPIStrip />
      ) : activeProgram === 'Social' ? (
        <SocialKPIStrip />
      ) : (
        <KPIStrip program={activeProgram as 'STARS' | 'HEDIS' | 'MIPS'} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Journey Panel */}
        {activeProgram === 'STARS' && selectedSTARS && (
          <STARSPayerBonusJourney measure={selectedSTARS} onClose={() => setSelectedSTARS(null)} />
        )}
        {activeProgram === 'HEDIS' && selectedHEDIS && (
          <HEDISMeasureDocJourney measure={selectedHEDIS} onClose={() => setSelectedHEDIS(null)} />
        )}
        {activeProgram === 'MIPS' && selectedMIPS && (
          <MIPSPaymentAdjJourney adjustment={selectedMIPS} onClose={() => setSelectedMIPS(null)} />
        )}

        {/* Table */}
        <div className="bg-white border border-carbon-gray-20">
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20"
            style={{ backgroundColor: cfg.bgColor }}
          >
            <div className="flex items-center gap-2">
              <Icon name={cfg.icon as any} size={16} style={{ color: cfg.color }} />
              <p className="text-sm font-semibold" style={{ color: cfg.color }}>
                {activeProgram === 'STARS' && 'STARS Measures — Payer Bonus Opportunities'}
                {activeProgram === 'HEDIS' && 'HEDIS Measures — Documentation Queue'}
                {activeProgram === 'MIPS' && 'MIPS Payment Adjustment Notices'}
                {activeProgram === 'BH' && 'BH Quality Measures — FUH · FUM · AMM · SAA'}
                {activeProgram === 'Social' &&
                  'Social Program Measures — Screening · Enrollment · CHW · Whole Person'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
                onClick={handleProgramReport}
              >
                <Icon name="DocumentChartBarIcon" size={12} />
                Report
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
                onClick={handleExportCSV}
              >
                <Icon name="ArrowDownTrayIcon" size={12} />
                Export CSV
              </button>
              {activeProgram !== 'BH' && (
                <p className="text-xs text-carbon-gray-50">
                  Click &quot;Start Workflow&quot; to open the journey panel for any row
                </p>
              )}
            </div>
          </div>
          {activeProgram === 'STARS' && (
            <STARSTable
              onSelect={setSelectedSTARS}
              onCreateCohort={setCohortMeasure}
              overlay={fhirMeasureOverlay}
            />
          )}
          {activeProgram === 'HEDIS' && (
            <HEDISTable
              onSelect={setSelectedHEDIS}
              onCreateCohort={setCohortMeasure}
              overlay={fhirMeasureOverlay}
            />
          )}
          {activeProgram === 'MIPS' && <MIPSTable onSelect={setSelectedMIPS} />}
          {activeProgram === 'BH' && <BHTable onCreateCohort={setCohortMeasure} />}
          {activeProgram === 'Social' && <SocialTable onCreateCohort={setCohortMeasure} />}
        </div>
      </div>

      {cohortMeasure && (
        <CohortAttributionModal measure={cohortMeasure} onClose={() => setCohortMeasure(null)} />
      )}
    </AppLayout>
  );
}
