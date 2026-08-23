'use client';
/**
 * useFhirModeSync
 *
 * Syncs the runtime useMockData flag from AppContext into the fhirClient
 * singleton whenever it changes. Mount this once in AppLayout.
 */
import { useEffect } from 'react';
import { useAppContext } from '@/lib/appContext';
import { setFhirMockMode, getFhirMockMode } from '@/lib/services/fhirClient';

export function useFhirModeSync(): void {
  const { useMockData } = useAppContext();

  useEffect(() => {
    // Only write a session override when the UI state actually diverges from
    // the registry's resolved mode. Writing unconditionally on mount would
    // silently stomp env-configured modes (e.g. DATA_MODE_FHIR_STORE) with the
    // client default before the user ever touched the toggle.
    if (getFhirMockMode() !== useMockData) setFhirMockMode(useMockData);
  }, [useMockData]);
}
