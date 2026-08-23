import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * CDS Hooks client — calls configured CDS services with a real
 * `patient-view` request (prefetch: Patient, Conditions, MedicationRequests).
 * Falls back to the bundled demo cards when no endpoint is reachable
 * (mock mode always uses the bundled cards).
 */
import type { CdsCard } from '@/lib/smartFhirTypes';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

const CDS_ENDPOINT =
  process.env.NEXT_PUBLIC_CDS_HOOKS_ENDPOINT ?? 'http://localhost:8080/cds-services';
const CDS_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_CDS_HOOKS ?? 'true').toLowerCase() === 'true';
const CDS_TIMEOUT = Number(process.env.NEXT_PUBLIC_CDS_HOOKS_TIMEOUT ?? 10_000);

interface RawCdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: 'info' | 'warning' | 'critical';
  source?: { label?: string };
  suggestions?: Array<{ uuid?: string; label: string }>;
  links?: Array<{ label: string; url: string; type: string }>;
  overrideReasons?: Array<{ display?: string }>;
}

function toAppCard(raw: RawCdsCard, i: number): CdsCard {
  return {
    id: raw.uuid ?? `cds-live-${i}`,
    hookType: 'patient-view',
    cardType: raw.indicator === 'critical' ? 'critical' : raw.indicator === 'warning' ? 'warning' : 'info',
    summary: raw.summary,
    detail: raw.detail,
    source: raw.source?.label ?? 'CDS Service',
    indicator: raw.indicator,
    suggestions: raw.suggestions?.map((s, j) => ({
      id: s.uuid ?? `sugg-${i}-${j}`,
      label: s.label,
      actions: [],
    })),
    links: raw.links?.map((l) => ({ label: l.label, url: l.url, type: l.type as 'smart' | 'absolute' })),
    overrideReasons: raw.overrideReasons?.map((o) => o.display ?? ''),
    timestamp: clock.nowIso(),
  };
}

/**
 * Invoke the `patient-view` hook against every discovered CDS service.
 * Returns null when live invocation isn't possible (caller keeps fallback cards).
 */
export async function invokePatientViewHook(
  patientId: string,
  encounterId: string,
  practitionerId: string,
  fhirBaseUrl: string,
): Promise<CdsCard[] | null> {
  if (!CDS_ENABLED || getFhirMockMode()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDS_TIMEOUT);
  try {
    // Discovery
    const disc = await fetch(CDS_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!disc.ok) return null;
    const { services = [] } = (await disc.json()) as {
      services?: Array<{ id: string; hook: string }>;
    };
    const patientViewServices = services.filter((s) => s.hook === 'patient-view');
    if (patientViewServices.length === 0) return null;

    // Prefetch context resources
    const client = getFhirClient();
    const [patient, conditions, meds] = await Promise.all([
      client.read('Patient', patientId).catch(() => undefined),
      client.search('Condition', { patient: patientId, 'clinical-status': 'active' }).catch(() => undefined),
      client.search('MedicationRequest', { patient: patientId, status: 'active' }).catch(() => undefined),
    ]);

    const request = {
      hookInstance: crypto.randomUUID(),
      hook: 'patient-view',
      fhirServer: fhirBaseUrl,
      context: { userId: `Practitioner/${practitionerId}`, patientId, encounterId },
      prefetch: { patient, conditions, medicationRequests: meds },
    };

    const all: CdsCard[] = [];
    for (const svc of patientViewServices) {
      const res = await fetch(`${CDS_ENDPOINT}/${svc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const { cards = [] } = (await res.json()) as { cards?: RawCdsCard[] };
      all.push(...cards.map(toAppCard));
    }
    return all.length > 0 ? all : null;
  } catch {
    return null; // unreachable service → caller keeps bundled demo cards
  } finally {
    clearTimeout(timer);
  }
}
