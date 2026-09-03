'use client';
/**
 * useFhirModeSync
 *
 * Syncs the runtime useMockData flag from AppContext into the fhirClient
 * singleton whenever it changes. Mount this once in AppLayout.
 */
import { useEffect } from 'react';
import { useAppContext } from '@/lib/appContext';
import { setFhirMockMode } from '@/lib/services/fhirClient';

export function useFhirModeSync(): void {
  const { useMockData } = useAppContext();

  useEffect(() => {
    setFhirMockMode(useMockData);
    console.debug(`[FhirModeSync] mock=${useMockData}`);
  }, [useMockData]);
}
