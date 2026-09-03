'use client';
/**
 * useDataModeFromUrl
 *
 * Reads ?dataMode=mock|live from the launch URL on mount and applies it to
 * both AppContext (so the header toggle reflects the correct state) and the
 * fhirClient session override (so all FHIR calls use the right backend).
 *
 * This makes the MD SmartApp contextually aware of the RHTP platform's active
 * data mode. The platform appends &dataMode=mock|live when building the
 * /md-smart-launch URL in patient-detail/page.tsx.
 *
 * Must be called BEFORE useFhirModeSync() so the client override is set
 * before that hook's effect reads and re-syncs the mode.
 */
import { useEffect } from 'react';
import { useAppContext } from '@/lib/appContext';
import { setFhirMockMode } from '@/lib/services/fhirClient';

export function useDataModeFromUrl(): void {
  const { setUseMockData } = useAppContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const param = new URLSearchParams(window.location.search).get('dataMode');
    if (param === 'mock' || param === 'live') {
      const wantMock = param === 'mock';
      setUseMockData(wantMock); // sync AppContext → header toggle reflects correct state
      setFhirMockMode(wantMock); // sync fhirClient session override immediately
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only: read the launch URL once
}
