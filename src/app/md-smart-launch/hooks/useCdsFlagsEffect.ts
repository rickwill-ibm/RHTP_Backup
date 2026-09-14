// Seed CDS cards from patient's FHIR Flags once launch is ready.
// Extracted from page.tsx to satisfy AI-CODING-CONVENTIONS v2 §2 size ratchet.
import { useEffect } from 'react';
import type { CdsCard } from '@/lib/smartFhirTypes';
import { DEMO_PATIENT_ID } from '@/lib/fhir/store';
import { flagsToCdsCards } from '@/lib/fhir/flagsToCdsCards';
import { getFhirClient } from '@/lib/services/fhirClient';
import { resolveIds } from '../lib/resolveIds';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

interface Params {
  launchReady: boolean;
  launchContext: SmartLaunchContext | null;
  useMockData: boolean;
  setCdsCards: (cards: CdsCard[]) => void;
}

/**
 * After launch, replaces the default CDS cards with cards derived from the
 * patient's live FHIR Flags — but only for non-Maria patients.
 * Maria/demo mode keeps the authored mockCdsCards narrative.
 */
export function useCdsFlagsEffect({
  launchReady,
  launchContext,
  useMockData,
  setCdsCards,
}: Params) {
  useEffect(() => {
    if (!launchReady || !launchContext) return;
    const ids = resolveIds(launchContext, useMockData);
    if (ids.patientId === DEMO_PATIENT_ID) return;
    getFhirClient()
      .search('Flag', { patient: ids.patientId, status: 'active' })
      .then((bundle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cards = flagsToCdsCards(
          ((bundle as any)?.entry ?? []).map((e: any) => e.resource).filter(Boolean),
          ids.patientId
        );
        if (cards.length > 0) setCdsCards(cards);
      })
      .catch(() => {
        /* silent — authored cards remain */
      });
  }, [launchReady, launchContext, useMockData, setCdsCards]);
}
