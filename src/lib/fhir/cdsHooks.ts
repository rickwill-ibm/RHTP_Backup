/**
 * CDS Hooks client — calls configured CDS services.
 *
 * invokePatientViewHook  — `patient-view` on launch (existing).
 * invokeOrderSignHook    — `order-sign` / `prescribe-medication` when the
 *                          provider signs orders; drives the CRD → DTR → PAS
 *                          Prior Authorization workflow.
 *
 * In mock mode, invokeOrderSignHook inspects the draft orders against the
 * PA_REQUIRED_CODES set and returns a synthetic CDS card with a DTR SMART
 * link for any PA-requiring order — so the full CRD → DTR → PAS flow is
 * exercisable without a running CDS backend.
 */
import type { CdsCard, FhirServiceRequest } from '@/lib/smartFhirTypes';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { PA_REQUIRED_CODES } from '@/lib/smartFhirMockData';

const CDS_ENDPOINT =
  process.env.NEXT_PUBLIC_CDS_HOOKS_ENDPOINT ?? 'http://localhost:8080/cds-services';
const CDS_ENABLED = (process.env.NEXT_PUBLIC_ENABLE_CDS_HOOKS ?? 'true').toLowerCase() === 'true';
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
    cardType:
      raw.indicator === 'critical' ? 'critical' : raw.indicator === 'warning' ? 'warning' : 'info',
    summary: raw.summary,
    detail: raw.detail,
    source: raw.source?.label ?? 'CDS Service',
    indicator: raw.indicator,
    suggestions: raw.suggestions?.map((s, j) => ({
      id: s.uuid ?? `sugg-${i}-${j}`,
      label: s.label,
      actions: [],
    })),
    links: raw.links?.map((l) => ({
      label: l.label,
      url: l.url,
      type: l.type as 'smart' | 'absolute',
    })),
    overrideReasons: raw.overrideReasons?.map((o) => o.display ?? ''),
    timestamp: new Date().toISOString(),
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
  fhirBaseUrl: string
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
      client
        .search('Condition', { patient: patientId, 'clinical-status': 'active' })
        .catch(() => undefined),
      client
        .search('MedicationRequest', { patient: patientId, status: 'active' })
        .catch(() => undefined),
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

/**
 * Invoke the `order-sign` (or `prescribe-medication`) hook for every
 * discovered CDS service that supports it.  Called when the provider signs
 * orders in OrderEntryModule — implements the CRD leg of the PA workflow.
 *
 * Returns null when live invocation isn't possible.
 */
export async function invokeOrderSignHook(
  patientId: string,
  encounterId: string,
  practitionerId: string,
  fhirBaseUrl: string,
  draftOrders: FhirServiceRequest[]
): Promise<CdsCard[] | null> {
  // ── Mock mode: return synthetic PA card for PA-requiring orders ──────────
  if (getFhirMockMode()) {
    const paOrder = draftOrders.find((sr) => {
      const code = sr.code?.coding?.[0]?.code ?? sr.code?.text ?? '';
      return PA_REQUIRED_CODES.has(code);
    });
    if (!paOrder) return null;

    const orderName = paOrder.code?.text ?? paOrder.code?.coding?.[0]?.display ?? 'this order';
    const mockDtrCard: CdsCard = {
      id: `crd-mock-${Date.now()}`,
      hookType: 'order-sign',
      cardType: 'warning',
      summary: `Prior Authorization required for ${orderName}`,
      detail: `Payer coverage rules require prior authorization before this service can be approved. Complete the Documentation Templates & Rules (DTR) questionnaire to support the PA request.`,
      source: 'CDS Hooks / Coverage Requirements Discovery (mock)',
      indicator: 'warning',
      suggestions: [],
      links: [
        {
          label: 'Open DTR Questionnaire',
          // Points at the local DTR app context (same-origin in dev = inline; external = new tab)
          url: `http://localhost:5174/dtr-launch?serviceRequestId=${paOrder.id ?? 'sr-001'}&patientId=${patientId}`,
          type: 'smart',
        },
      ],
      timestamp: new Date().toISOString(),
    };
    return [mockDtrCard];
  }

  if (!CDS_ENABLED) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDS_TIMEOUT);
  try {
    const disc = await fetch(CDS_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!disc.ok) return null;
    const { services = [] } = (await disc.json()) as {
      services?: Array<{ id: string; hook: string }>;
    };

    // Accept both standard order-sign and DaVinci prescribe-medication hooks
    const orderSignServices = services.filter(
      (s) => s.hook === 'order-sign' || s.hook === 'prescribe-medication'
    );
    if (orderSignServices.length === 0) return null;

    const draftOrdersBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: draftOrders.map((r) => ({ resource: r })),
    };

    const request = {
      hookInstance: crypto.randomUUID(),
      hook: 'order-sign',
      fhirServer: fhirBaseUrl,
      context: {
        userId: `Practitioner/${practitionerId}`,
        patientId,
        encounterId,
        draftOrders: draftOrdersBundle,
      },
    };

    const all: CdsCard[] = [];
    for (const svc of orderSignServices) {
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
    return null;
  } finally {
    clearTimeout(timer);
  }
}
