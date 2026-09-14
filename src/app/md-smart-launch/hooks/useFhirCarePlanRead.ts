// useFhirCarePlanRead — load a persisted FHIR CarePlan resource on mount.
// Extracted from CarePlanPanel to satisfy AI-CODING-CONVENTIONS v2 §2 ratchet.
import { useState, useEffect } from 'react';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

export interface FhirCarePlanSummary {
  title: string;
  description?: string;
  status: string;
  lastUpdated?: string;
  domainCount: number;
}

/**
 * Reads CarePlan/{cp-<platformId>} from FHIR on mount.
 * Returns null until loaded; silent if not yet created.
 */
export function useFhirCarePlanRead(platformPatientId: string): {
  carePlan: FhirCarePlanSummary | null;
  setCarePlan: (v: FhirCarePlanSummary | null) => void;
} {
  const [carePlan, setCarePlan] = useState<FhirCarePlanSummary | null>(null);

  useEffect(() => {
    if (getFhirMockMode()) return;
    const safePlatformId = platformPatientId.replace(/\//g, '-').replace(/[^A-Za-z0-9\-.]/g, '-');
    const carePlanId = `cp-${safePlatformId}`;
    getFhirClient()
      .read<{
        resourceType: string;
        title?: string;
        description?: string;
        status?: string;
        meta?: { lastUpdated?: string };
        extension?: { url: string; valueString?: string }[];
        note?: { text?: string }[];
      }>('CarePlan', carePlanId)
      .then((cp) => {
        if (cp?.resourceType !== 'CarePlan') return;
        const ext = cp.extension?.find(
          (e) => e.url === 'http://tcoc.example.org/fhir/StructureDefinition/care-plan-domains'
        );
        const raw = ext?.valueString ?? cp.note?.[0]?.text ?? null;
        let domainCount = 0;
        if (raw) {
          try {
            domainCount = (JSON.parse(raw) as unknown[]).length;
          } catch {
            /* ignore */
          }
        }
        setCarePlan({
          title: cp.title ?? 'Comprehensive Care Plan',
          description: cp.description,
          status: cp.status ?? 'active',
          lastUpdated: cp.meta?.lastUpdated
            ? new Date(cp.meta.lastUpdated).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : undefined,
          domainCount,
        });
        console.info(`[CarePlanPanel] Loaded CarePlan/${carePlanId} from FHIR`);
      })
      .catch(() => {
        /* not yet created — silent */
      });
  }, [platformPatientId]);

  return { carePlan, setCarePlan };
}
