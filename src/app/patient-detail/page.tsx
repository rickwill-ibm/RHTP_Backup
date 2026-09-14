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
  // ── DEMO HOTFIX (pre-EMPI remediation) ──────────────────────────────
  // The top-bar patient switcher (demoStore.activeCitizenId) is the SINGLE source
  // of truth for the active patient. The URL ?id= is treated as a SEED only: it
  // sets the store on navigation, after which this screen renders from the store,
  // so switching patients always updates the entire record. Previously the URL
  // param took precedence over the store, pinning the body to the navigated patient
  // while the switcher (store-only) silently diverged (header vs body mismatch).
  // Full system-generated EMPI enterprise-member-id resolution is tracked in the
  // post-demo remediation plan.
  const urlId = searchParams?.get('id') ?? '';
  const seedId = urlId ? (MOCK_ID_TO_PLATFORM_ID[urlId] ?? urlId) : '';

  // Seed the store from the URL param on navigation (only when the URL id changes).
  useEffect(() => {
    if (seedId && seedId !== activeCitizenId) {
      setActiveCitizen(seedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedId]);

  // Render from the store — the switcher's target. URL is a seed, never a 2nd source.
  // Prefer the fresh URL seed over the (possibly stale, pre-effect) store value on
  // the very first paint after navigation — the effect above will sync the store to
  // match seedId a moment later anyway, so this just removes the one-paint window
  // where the OLD patient's data would otherwise flash/stick before the sync lands.
  const resolvedId = seedId || activeCitizenId || 'MARIA_SD_001';

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
