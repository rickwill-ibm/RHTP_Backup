'use client';
import React from 'react';
import { mockPatients } from '@/lib/mockData';
import RiskBadge from '@/components/ui/RiskBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import DataSourceBadge, { DataSourceGroup } from './DataSourceBadge';

const DATA_SOURCE_GROUPS: DataSourceGroup[] = [
  {
    type: 'EMR',
    sources: [
      { name: 'Cerner Millennium', lastSync: 'Today', daysAgo: 0 },
      { name: 'Epic MyChart', lastSync: '2d ago', daysAgo: 2 },
      { name: 'Allscripts', lastSync: '12d ago', daysAgo: 12 },
    ],
  },
  {
    type: 'HIE',
    sources: [
      { name: 'CommonWell', lastSync: 'Today', daysAgo: 0 },
      { name: 'Carequality', lastSync: '10d ago', daysAgo: 10 },
    ],
  },
  {
    type: 'Payer',
    sources: [
      { name: 'Humana MA-PD', lastSync: '15d ago', daysAgo: 15 },
      { name: 'CMS Medicare', lastSync: '8d ago', daysAgo: 8 },
    ],
  },
  {
    type: 'Lab',
    sources: [
      { name: 'Quest Diagnostics', lastSync: 'Today', daysAgo: 0 },
      { name: 'LabCorp', lastSync: '3d ago', daysAgo: 3 },
    ],
  },
  {
    type: 'Claims',
    sources: [{ name: 'CMS Claims Feed', lastSync: 'Today', daysAgo: 0 }],
  },
  {
    type: 'LPR',
    sources: [{ name: 'LPR Registry', lastSync: 'Today', daysAgo: 0 }],
  },
];

export default function PatientHeader() {
  const patient = mockPatients.find((p) => p.id === 'patient-001')!;

  return (
    <div className="bg-white border border-carbon-gray-20 mb-4">
      {/* Main header row */}
      <div className="px-6 py-4 flex flex-wrap items-start gap-6">
        {/* Avatar + name */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-carbon-gray-90 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl font-bold">MO</span>
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="text-xl font-semibold text-carbon-gray-100">{patient.name}</h2>
              <RiskBadge tier={patient.riskTier} />
              <StatusBadge label="Attribution: Confirmed" variant="success" />
            </div>
            <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
              <span>DOB: {patient.dob}</span>
              <span>Age: {patient.age}</span>
              <span>Gender: {patient.gender}</span>
              <span className="font-mono">{patient.mrn}</span>
              <span>{patient.phone}</span>
            </div>
            <p className="text-xs text-carbon-gray-50 mt-0.5">{patient.address}</p>
          </div>
        </div>

        {/* Key clinical metrics */}
        <div className="flex items-stretch gap-0 ml-auto flex-wrap">
          {[
            {
              key: 'hdr-raf',
              label: 'RAF Score',
              value: patient.rafScore.toFixed(2),
              delta: `+${patient.rafScoreDelta.toFixed(2)}`,
              color: 'text-carbon-gray-100',
              deltaColor: 'text-[#24a148]',
            },
            {
              key: 'hdr-er',
              label: 'ER Risk (30d)',
              value: `${Math.round(patient.predictedErRisk * 100)}%`,
              delta: 'High',
              color: 'text-[#da1e28]',
              deltaColor: 'text-[#da1e28]',
            },
            {
              key: 'hdr-pmpm',
              label: 'PMPM Cost',
              value: `$${patient.pmpmCost.toLocaleString()}`,
              delta: `target $${patient.pmpmTarget}`,
              color: 'text-[#da1e28]',
              deltaColor: 'text-carbon-gray-50',
            },
            {
              key: 'hdr-gaps',
              label: 'Open Care Gaps',
              value: patient.openCareGaps.toString(),
              delta: '1 closed',
              color: 'text-[#0043ce]',
              deltaColor: 'text-[#24a148]',
            },
            {
              key: 'hdr-hcc',
              label: 'HCC Suspects',
              value: patient.openHCCSuspects.toString(),
              delta: `$${(patient.hccSuspectValue / 1000).toFixed(1)}K at risk`,
              color: 'text-[#b45309]',
              deltaColor: 'text-[#b45309]',
            },
          ].map((m) => (
            <div
              key={m.key}
              className="px-5 py-3 border-l border-carbon-gray-20 text-center min-w-[90px]"
            >
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-1">{m.label}</p>
              <p className={`text-2xl font-bold tabular-nums font-mono ${m.color}`}>{m.value}</p>
              <p className={`text-2xs mt-0.5 ${m.deltaColor}`}>{m.delta}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-source data freshness strip */}
      <div className="bg-carbon-gray-10 border-t border-carbon-gray-20 px-6 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-medium text-carbon-gray-70 uppercase tracking-wide mr-2">
          Data Sources:
        </span>
        {DATA_SOURCE_GROUPS.map((group) => (
          <DataSourceBadge key={group.type} group={group} />
        ))}
        <span className="ml-auto text-2xs text-carbon-gray-50">
          Payer: {patient.payer} · ID: <span className="font-mono">{patient.insuranceId}</span>
        </span>
      </div>
    </div>
  );
}
