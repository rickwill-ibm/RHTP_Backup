'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

const HOUSEHOLDS = [
  {
    id: 'hh-001',
    address: '412 Cottonwood Lane, Bennett County, SD 57716',
    members: [
      {
        id: 'PAT-0006',
        name: 'Maria Redhawk',
        role: 'Head of Household',
        age: 52,
        riskTier: 'HIGH',
        openGaps: 8,
        activePrograms: 3,
        lastContact: '2 days ago',
      },
      {
        id: 'PAT-0061',
        name: 'Thomas Redhawk',
        role: 'Spouse',
        age: 55,
        riskTier: 'MEDIUM',
        openGaps: 3,
        activePrograms: 1,
        lastContact: '14 days ago',
      },
      {
        id: 'PAT-0062',
        name: 'Lily Redhawk',
        role: 'Dependent',
        age: 16,
        riskTier: 'LOW',
        openGaps: 1,
        activePrograms: 1,
        lastContact: '30 days ago',
      },
    ],
    sharedSdoh: ['Transportation Barrier', 'Food Insecurity', 'Tribal Land — Remote Access'],
    householdRisk: 'HIGH',
    totalOpenGaps: 12,
    activeInterventions: 4,
    incomeLevel: 'Below 138% FPL',
    insuranceCoverage: 'Medicaid — RHTP Track 3',
    lastHouseholdAssessment: '2024-11-15',
  },
  {
    id: 'hh-002',
    address: '88 Prairie View Dr, Jackson County, MO 64050',
    members: [
      {
        id: 'PAT-0042',
        name: 'Dorothy Simmons',
        role: 'Head of Household',
        age: 68,
        riskTier: 'HIGH',
        openGaps: 5,
        activePrograms: 2,
        lastContact: '1 day ago',
      },
      {
        id: 'PAT-0421',
        name: 'Harold Simmons',
        role: 'Spouse',
        age: 71,
        riskTier: 'HIGH',
        openGaps: 7,
        activePrograms: 2,
        lastContact: '3 days ago',
      },
    ],
    sharedSdoh: ['Social Isolation', 'Medication Adherence Risk'],
    householdRisk: 'HIGH',
    totalOpenGaps: 12,
    activeInterventions: 3,
    incomeLevel: '138–250% FPL',
    insuranceCoverage: 'Medicare Advantage',
    lastHouseholdAssessment: '2024-11-28',
  },
  {
    id: 'hh-003',
    address: '2201 Elm Street, Clay County, MO 64116',
    members: [
      {
        id: 'PAT-0031',
        name: 'Rosa Gutierrez',
        role: 'Head of Household',
        age: 34,
        riskTier: 'MEDIUM',
        openGaps: 2,
        activePrograms: 2,
        lastContact: '5 days ago',
      },
      {
        id: 'PAT-0311',
        name: 'Carlos Gutierrez',
        role: 'Spouse',
        age: 37,
        riskTier: 'LOW',
        openGaps: 0,
        activePrograms: 0,
        lastContact: '45 days ago',
      },
      {
        id: 'PAT-0312',
        name: 'Sofia Gutierrez',
        role: 'Dependent',
        age: 8,
        riskTier: 'LOW',
        openGaps: 1,
        activePrograms: 1,
        lastContact: '10 days ago',
      },
      {
        id: 'PAT-0313',
        name: 'Miguel Gutierrez',
        role: 'Dependent',
        age: 5,
        riskTier: 'LOW',
        openGaps: 0,
        activePrograms: 1,
        lastContact: '10 days ago',
      },
    ],
    sharedSdoh: ['Childcare Barrier', 'Language Access (Spanish)'],
    householdRisk: 'MEDIUM',
    totalOpenGaps: 3,
    activeInterventions: 2,
    incomeLevel: '138–250% FPL',
    insuranceCoverage: 'Medicaid CHIP + Marketplace',
    lastHouseholdAssessment: '2024-10-30',
  },
];

const RISK_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  HIGH: { bg: '#fff1f1', text: '#da1e28', border: '#ffd7d9' },
  MEDIUM: { bg: '#fdf6dd', text: '#b45309', border: '#f1c21b' },
  LOW: { bg: '#defbe6', text: '#0e6027', border: '#a7f0ba' },
};

const SDOH_COLORS: Record<string, string> = {
  'Transportation Barrier': '#0043ce',
  'Food Insecurity': '#b45309',
  'Tribal Land — Remote Access': '#6929c4',
  'Social Isolation': '#da1e28',
  'Medication Adherence Risk': '#8a3ffc',
  'Childcare Barrier': '#198038',
  'Language Access (Spanish)': '#00539a',
};

export default function HouseholdViewPage() {
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>('hh-001');
  const [search, setSearch] = useState('');
  const [fhirPatientCount, setFhirPatientCount] = useState<number | null>(null);
  const fhirLoadedRef = useRef(false);

  // Live FHIR: count patients on mount to verify HAPI connectivity
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Patient', { _count: 100 })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? []).filter(
          (e: any) => e?.resource?.resourceType === 'Patient'
        ).length;
        if (count > 0) setFhirPatientCount(count);
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const filteredHouseholds = HOUSEHOLDS.filter(
    (hh) =>
      hh.address.toLowerCase().includes(search.toLowerCase()) ||
      hh.members.some((m) => m.name.toLowerCase().includes(search.toLowerCase()))
  );

  const selected = HOUSEHOLDS.find((hh) => hh.id === selectedHousehold);

  const totalHouseholds = HOUSEHOLDS.length;
  const highRiskHouseholds = HOUSEHOLDS.filter((hh) => hh.householdRisk === 'HIGH').length;
  const totalMembers = HOUSEHOLDS.reduce((a, hh) => a + hh.members.length, 0);
  const totalGaps = HOUSEHOLDS.reduce((a, hh) => a + hh.totalOpenGaps, 0);

  return (
    <AppLayout
      pageTitle="Household View"
      breadcrumbs={[{ label: 'CDP & Agentic Automation' }, { label: 'Household View' }]}
    >
      {/* KPI Strip */}
      {fhirPatientCount !== null && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {fhirPatientCount} patients verified in HAPI FHIR
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Households',
            value: totalHouseholds.toString(),
            icon: 'HomeIcon',
            color: 'text-[#0043ce]',
            bg: 'bg-[#d0e2ff]',
          },
          {
            label: 'High Risk Households',
            value: highRiskHouseholds.toString(),
            icon: 'ExclamationTriangleIcon',
            color: 'text-[#da1e28]',
            bg: 'bg-[#fff1f1]',
          },
          {
            label: 'Total Members',
            value: totalMembers.toString(),
            icon: 'UserGroupIcon',
            color: 'text-[#198038]',
            bg: 'bg-[#defbe6]',
          },
          {
            label: 'Open Care Gaps',
            value: totalGaps.toString(),
            icon: 'ClipboardDocumentListIcon',
            color: 'text-[#b45309]',
            bg: 'bg-[#fdf6dd]',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon name={kpi.icon as any} size={20} className={kpi.color} />
            </div>
            <div>
              <p className="text-xs text-carbon-gray-50">{kpi.label}</p>
              <p className="text-xl font-bold text-carbon-gray-100">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Household List */}
        <div className="xl:col-span-1 bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100 mb-2">Households</p>
            <div className="relative">
              <Icon
                name="MagnifyingGlassIcon"
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search household or member..."
                className="pl-8 pr-3 py-1.5 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#0043ce] w-full"
              />
            </div>
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {filteredHouseholds.map((hh) => {
              const rc = RISK_CONFIG[hh.householdRisk];
              const isSelected = selectedHousehold === hh.id;
              return (
                <div
                  key={hh.id}
                  onClick={() => setSelectedHousehold(hh.id)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#d0e2ff]/30 border-l-2 border-[#0043ce]' : 'hover:bg-carbon-gray-10'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-carbon-gray-100 truncate">
                        {hh.address}
                      </p>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5">
                        {hh.members.length} members · {hh.totalOpenGaps} open gaps
                      </p>
                    </div>
                    <span
                      className="px-1.5 py-0.5 text-2xs font-semibold flex-shrink-0"
                      style={{ background: rc.bg, color: rc.text }}
                    >
                      {hh.householdRisk}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {hh.members.slice(0, 3).map((m) => (
                      <span
                        key={m.id}
                        className="text-2xs bg-carbon-gray-10 text-carbon-gray-70 px-1.5 py-0.5"
                      >
                        {m.name.split(' ')[0]}
                      </span>
                    ))}
                    {hh.members.length > 3 && (
                      <span className="text-2xs text-carbon-gray-50">+{hh.members.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Household Detail */}
        {selected ? (
          <div className="xl:col-span-2 space-y-4">
            {/* Header */}
            <div className="bg-white border border-carbon-gray-20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name="HomeIcon" size={16} className="text-[#0043ce]" />
                    <p className="text-sm font-semibold text-carbon-gray-100">{selected.address}</p>
                    <span
                      className="px-1.5 py-0.5 text-2xs font-semibold"
                      style={{
                        background: RISK_CONFIG[selected.householdRisk].bg,
                        color: RISK_CONFIG[selected.householdRisk].text,
                      }}
                    >
                      {selected.householdRisk} RISK
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-carbon-gray-50">
                    <span>
                      Coverage:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {selected.insuranceCoverage}
                      </span>
                    </span>
                    <span>
                      Income:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {selected.incomeLevel}
                      </span>
                    </span>
                    <span>
                      Last Assessment:{' '}
                      <span className="font-medium text-carbon-gray-70">
                        {selected.lastHouseholdAssessment}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 text-center flex-shrink-0">
                  <div>
                    <p className="text-xl font-bold text-carbon-gray-100">
                      {selected.totalOpenGaps}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">Open Gaps</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-carbon-gray-100">
                      {selected.activeInterventions}
                    </p>
                    <p className="text-2xs text-carbon-gray-50">Interventions</p>
                  </div>
                </div>
              </div>
              {/* Shared SDOH */}
              <div className="mt-3 pt-3 border-t border-carbon-gray-10">
                <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
                  Shared SDOH Factors
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.sharedSdoh.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-2xs font-semibold"
                      style={{
                        background: (SDOH_COLORS[s] || '#4d5358') + '22',
                        color: SDOH_COLORS[s] || '#4d5358',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Members */}
            <div className="bg-white border border-carbon-gray-20">
              <div className="px-4 py-3 border-b border-carbon-gray-20">
                <p className="text-sm font-semibold text-carbon-gray-100">Household Members</p>
              </div>
              <div className="divide-y divide-carbon-gray-10">
                {selected.members.map((member) => {
                  const rc = RISK_CONFIG[member.riskTier];
                  return (
                    <div key={member.id} className="px-4 py-3 flex items-center gap-4">
                      <div className="w-9 h-9 bg-[#d0e2ff] flex items-center justify-center flex-shrink-0">
                        <Icon name="UserIcon" size={16} className="text-[#0043ce]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-carbon-gray-100">
                            {member.name}
                          </span>
                          <span className="text-xs text-carbon-gray-50">{member.role}</span>
                          <span className="text-xs text-carbon-gray-50">Age {member.age}</span>
                          <span
                            className="px-1.5 py-0.5 text-2xs font-semibold"
                            style={{ background: rc.bg, color: rc.text }}
                          >
                            {member.riskTier}
                          </span>
                        </div>
                        <p className="text-2xs text-carbon-gray-50 mt-0.5">
                          {member.id} · Last contact: {member.lastContact}
                        </p>
                      </div>
                      <div className="flex gap-4 text-center flex-shrink-0">
                        <div>
                          <p className="text-sm font-bold text-carbon-gray-100">
                            {member.openGaps}
                          </p>
                          <p className="text-2xs text-carbon-gray-50">Gaps</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-carbon-gray-100">
                            {member.activePrograms}
                          </p>
                          <p className="text-2xs text-carbon-gray-50">Programs</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="xl:col-span-2 bg-white border border-carbon-gray-20 flex items-center justify-center h-64">
            <div className="text-center">
              <Icon name="HomeIcon" size={32} className="text-carbon-gray-30 mx-auto mb-2" />
              <p className="text-sm text-carbon-gray-50">Select a household to view details</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
