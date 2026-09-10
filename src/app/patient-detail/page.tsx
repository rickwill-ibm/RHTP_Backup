'use client';
import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';

import PatientTabShell from './components/PatientTabShell';
import PatientBreadcrumb from './components/PatientBreadcrumb';
import LegendPanel from './components/LegendPanel';
import WholePersonSummary from './components/WholePersonSummary';
import { PatientContextProvider } from '@/lib/patientContext';
import { useDemoStore } from '@/uhg/store/demoStore';
import { useAppContext } from '@/lib/appContext';
import { getPatientSync } from '@/lib/services/patientService';

// Map mockData patient IDs → registry platform IDs
const MOCK_ID_TO_PLATFORM_ID: Record<string, string> = {
  'patient-maria': 'MARIA_SD_001',
  MARIA_SD_001: 'MARIA_SD_001',
  'patient-001': 'PAT-0042',
  'PAT-0042': 'PAT-0042',
  'patient-0042': 'PAT-0042',
  'patient-002': 'PAT-0087',
  'PAT-0087': 'PAT-0087',
  'patient-003': 'PAT-0103',
  'PAT-0103': 'PAT-0103',
  'patient-004': 'PAT-0156',
  'PAT-0156': 'PAT-0156',
};

function PatientDetailContent() {
  const searchParams = useSearchParams();
  const { useMockData } = useAppContext();
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  const activePatientId = activeCitizenId;

  // The store is authoritative after initial load.
  // ?id= in the URL seeds the store on first mount (via the useEffect below),
  // but once it's written, the PatientSwitcherDropdown controls the active patient.
  const urlId = searchParams?.get('id') ?? '';
  const rawId = activePatientId || urlId || 'MARIA_SD_001';

  // Resolve mockData IDs or legacy IDs to registry platform IDs
  const resolvedId = MOCK_ID_TO_PLATFORM_ID[rawId] ?? rawId;

  // Keep AppContext.activePatientId in sync when navigated here via URL param.
  // This ensures care-team-inbox, specialist-inbox, etc. all show the same patient.
  useEffect(() => {
    if (resolvedId && resolvedId !== activeCitizenId) {
      setActiveCitizen(resolvedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId]);

  // Look up patient from registry — works for any patient, not just Maria
  const registryPatient = getPatientSync(resolvedId);

  // Derive display values from registry (falls back gracefully if patient not in registry)
  const patientName = registryPatient?.name ?? 'Maria Redhawk';
  const rafScore = registryPatient?.rafScore?.toFixed(2) ?? '0.82';
  const riskLabel = registryPatient?.riskLabel ?? 'MODERATE';
  const contract = registryPatient?.contract ?? 'Medicaid RHTP Track 3';
  const hccCount = registryPatient?.hccSuspects ?? 1;
  const hccWarning = `⚠ ${hccCount} HCC suspect${hccCount !== 1 ? 's' : ''} require clinician review before Jun 30`;

  return (
    <PatientContextProvider patientId={resolvedId}>
      <AppLayout
        pageTitle="Citizen Detail"
        breadcrumbs={[
          { label: 'Contracts', href: '/contract-program-selection' },
          { label: contract, href: '/panel-cohort-view' },
          { label: 'Panel', href: '/panel-cohort-view' },
          { label: patientName },
        ]}
        contextBanner={
          <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
            <span className="text-xs font-semibold text-[#0043ce]">
              Contract Context: {contract}
            </span>
            <span className="text-xs text-[#0043ce]">Attribution: Confirmed</span>
            <span className="text-xs text-[#0043ce]">RAF Score: {rafScore}</span>
            <span className="text-xs text-[#0043ce]">Risk: {riskLabel}</span>
            <span className="text-xs font-semibold text-[#da1e28]">{hccWarning}</span>
            <a
              href={`/md-smart-launch?patientId=${PLATFORM_TO_FHIR_ID_MAP[resolvedId] ?? resolvedId}&dataMode=${useMockData ? 'mock' : 'live'}`}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 text-2xs font-semibold bg-[#6929c4] text-white hover:bg-[#491d8b] transition-colors"
              title="Open MD SMART on FHIR launch screen"
            >
              <span>⚡</span>
              Smart App
            </a>
          </div>
        }
      >
        <PatientBreadcrumb
          contractName={contract}
          panelName="Panel & Cohort"
          patientName={patientName}
        />
        {/* Whole Person Summary — new landing view */}
        <div className="mb-4">
          <WholePersonSummary />
        </div>
        {/* Domain detail tabs — Clinical / BH / Social + AI Copilot */}
        <PatientTabShell />
        <LegendPanel />
      </AppLayout>
    </PatientContextProvider>
  );
}

export default function PatientDetailPage() {
  return (
    <React.Suspense
      fallback={<div className="p-8 text-center text-carbon-gray-50">Loading patient record…</div>}
    >
      <PatientDetailContent />
    </React.Suspense>
  );
}
