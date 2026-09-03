'use client';
/**
 * FhirModeSyncMount
 *
 * Mounts useFhirModeSync once at the top of the app tree so the
 * fhirClient singleton stays in sync with AppContext.useMockData.
 * Must be rendered inside AppContextProvider.
 */
import { useFhirModeSync } from '@/lib/hooks/useFhirModeSync';

export default function FhirModeSyncMount() {
  useFhirModeSync();
  return null;
}
