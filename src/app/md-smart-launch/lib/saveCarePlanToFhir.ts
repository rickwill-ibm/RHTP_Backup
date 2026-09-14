// saveCarePlanToFhir — FHIR write operations for the CarePlan save flow.
// Extracted from CarePlanPanel to satisfy AI-CODING-CONVENTIONS v2 §2 ratchet.
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import type { FhirCarePlanSummary } from '../hooks/useFhirCarePlanRead';

export interface SaveCarePlanParams {
  platformPatientId: string;
  encounterId: string;
  performer: string;
  planData: { title?: string; description?: string; addresses?: string[] };
  careGaps: {
    id: string;
    measureName: string;
    status: string;
    program?: string;
    notes?: string;
    assignedTo?: string;
    dueDate?: string;
    closureRequirement?: string;
  }[];
}

const DOMAIN_META: Record<string, { color: string; icon: string }> = {
  Clinical: { color: '#0043ce', icon: 'HeartIcon' },
  'Behavioral Health': { color: '#6929c4', icon: 'SparklesIcon' },
  BH: { color: '#6929c4', icon: 'SparklesIcon' },
  Social: { color: '#b45309', icon: 'HomeIcon' },
  'Social Needs': { color: '#b45309', icon: 'HomeIcon' },
};

function buildDomainsPayload(careGaps: SaveCarePlanParams['careGaps'], performer: string) {
  const domainMap: Record<string, { color: string; icon: string; goals: unknown[] }> = {};
  careGaps.forEach((g) => {
    const domainKey =
      g.program === 'MIPS'
        ? 'Behavioral Health'
        : g.notes?.startsWith('Social') || g.notes?.startsWith('BH')
          ? g.notes.split(' ')[0] === 'BH'
            ? 'Behavioral Health'
            : 'Social Needs'
          : 'Clinical';
    if (!domainMap[domainKey]) {
      const meta = DOMAIN_META[domainKey] ?? { color: '#0043ce', icon: 'DocumentTextIcon' };
      domainMap[domainKey] = { color: meta.color, icon: meta.icon, goals: [] };
    }
    domainMap[domainKey].goals.push({
      goal: g.measureName,
      status: g.status === 'Open' ? 'open' : g.status === 'In Progress' ? 'in-progress' : 'closed',
      owner: g.assignedTo || performer,
      dueDate: g.dueDate,
      tasks: [g.closureRequirement ?? g.measureName],
    });
  });
  return Object.entries(domainMap).map(([domain, v]) => ({
    domain,
    color: v.color,
    icon: v.icon,
    goals: v.goals,
  }));
}

function fmtLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Persists a CarePlan + AuditEvent + ServiceRequests to FHIR.
 * In mock mode, only returns the summary for local display.
 * @returns The FhirCarePlanSummary to display, or throws on FHIR failure.
 */
export async function saveCarePlanToFhir(params: SaveCarePlanParams): Promise<FhirCarePlanSummary> {
  const { platformPatientId, encounterId, performer, planData, careGaps } = params;
  const now = new Date().toISOString();
  const safePlatformId = platformPatientId.replace(/\//g, '-').replace(/[^A-Za-z0-9\-.]/g, '-');
  const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[platformPatientId] ?? platformPatientId;
  const carePlanId = `cp-${safePlatformId}`;
  const planTitle = planData.title ?? 'Comprehensive Care Plan';
  const planDescription: string | undefined = planData.description ?? undefined;
  const domainsPayload = buildDomainsPayload(careGaps, performer);

  const summary: FhirCarePlanSummary = {
    title: planTitle,
    description: planDescription,
    status: 'active',
    lastUpdated: fmtLocalDate(now),
    domainCount: domainsPayload.length,
  };

  if (getFhirMockMode()) return summary;

  await getFhirClient().update({
    resourceType: 'CarePlan',
    id: carePlanId,
    status: 'active',
    intent: 'plan',
    title: planTitle,
    description: planDescription,
    subject: { reference: `Patient/${fhirPatientId}` },
    author: { display: performer },
    created: now,
    note: [
      {
        text: `Generated via MD SMART Launch · Encounter: ${encounterId} · Saved by: ${performer}`,
      },
    ],
    extension: [
      {
        url: 'http://tcoc.example.org/fhir/StructureDefinition/care-plan-domains',
        valueString: JSON.stringify(domainsPayload),
      },
    ],
    ...(planData.addresses?.length
      ? { addresses: planData.addresses.map((a: string) => ({ display: a })) }
      : {}),
  });
  console.info(`[CarePlan] ${carePlanId} approved & saved to FHIR`);

  // Fire-and-forget: AuditEvent
  getFhirClient()
    .create({
      resourceType: 'AuditEvent',
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: 'rest',
        display: 'RESTful Operation',
      },
      subtype: [
        { system: 'http://hl7.org/fhir/restful-interaction', code: 'update', display: 'update' },
      ],
      action: 'U',
      recorded: now,
      outcome: '0',
      agent: [{ who: { display: performer }, requestor: true }],
      source: { observer: { display: 'TCOC-SMART-Launch' } },
      entity: [
        { what: { reference: `CarePlan/${carePlanId}` }, type: { code: '4', display: 'Other' } },
      ],
    })
    .catch((err) => console.warn('[AuditEvent] CarePlan audit post failed:', err));

  // Fire-and-forget: ServiceRequest per open gap
  careGaps
    .filter((g) => g.status === 'Open' || g.status === 'In Progress')
    .forEach((gap) => {
      getFhirClient()
        .create({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'plan',
          code: { text: gap.measureName },
          subject: { reference: `Patient/${fhirPatientId}` },
          requester: { display: performer },
          authoredOn: now,
          note: [{ text: `Care gap: ${gap.measureName} — care plan intervention` }],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id',
              valueString: gap.id,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/care-plan-id',
              valueString: carePlanId,
            },
          ],
        })
        .catch((err) => console.warn(`[ServiceRequest] Gap ${gap.id} POST failed:`, err));
    });

  return summary;
}
