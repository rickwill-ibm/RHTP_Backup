/**
 * CDS Hooks — order-sign hook
 * POST /api/cds-hooks/order-sign
 *
 * Called when a clinician signs an order.
 * Validates orders against live MedicationRequests from HAPI FHIR for DDI checks.
 * Falls back to registry medication list when FHIR is unavailable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPatientByFhirId, getPatientById, FHIR_ID_MAP } from '@/lib/patientRegistry';

const FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4029';

async function fhirGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${FHIR_BASE}/${path.replace(/^\//, '')}`, {
      headers: { Accept: 'application/fhir+json' },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface DraftOrder {
  resourceType: string;
  code?: { text?: string; coding?: { display?: string; code?: string }[] };
  priority?: string;
  note?: { text?: string }[];
}

interface MedBundle {
  entry?: {
    resource?: {
      id?: string;
      status?: string;
      medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] };
    };
  }[];
}

// Known DDI pairs: medication name fragment → interacting drug fragments
// This list supplements any DDI flags stored in FHIR extensions.
const DDI_PAIRS: [string, string[]][] = [
  ['sertraline', ['tramadol', 'linezolid', 'methylene blue', 'selegiline']],
  ['warfarin', ['aspirin', 'ibuprofen', 'naproxen', 'fluconazole', 'amiodarone']],
  ['metformin', ['contrast', 'iodine']],
  ['lisinopril', ['potassium', 'spironolactone', 'trimethoprim']],
  ['carvedilol', ['verapamil', 'diltiazem', 'clonidine']],
  ['furosemide', ['gentamicin', 'tobramycin', 'lithium']],
  ['fluticasone', ['ritonavir', 'ketoconazole', 'itraconazole']],
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contextPatientId: string = body?.context?.patientId ?? '';
    const draftOrders: DraftOrder[] =
      body?.context?.draftOrders?.entry?.map((e: { resource: DraftOrder }) => e.resource) ?? [];

    // Resolve platform patient for link building
    const patient =
      getPatientByFhirId(contextPatientId) ??
      getPatientById(contextPatientId) ??
      getPatientById(FHIR_ID_MAP[contextPatientId] ?? '');

    const platformId = patient?.platformId ?? contextPatientId;
    const patientLink = `${APP_URL}/patient-detail?id=${platformId}`;
    const fhirPatientId = patient?.fhirId?.replace(/^patient\//, '') ?? contextPatientId;

    // Fetch active MedicationRequests from HAPI FHIR
    let activeMedNames: string[] = [];
    const medBundle = await fhirGet<MedBundle>(
      `MedicationRequest?patient=${fhirPatientId}&status=active&_count=50`
    );
    if (medBundle?.entry && medBundle.entry.length > 0) {
      activeMedNames = medBundle.entry
        .map(
          (e) =>
            e.resource?.medicationCodeableConcept?.text ??
            e.resource?.medicationCodeableConcept?.coding?.[0]?.display ??
            ''
        )
        .filter(Boolean)
        .map((n) => n.toLowerCase());
    } else if (patient?.medications) {
      // Fall back to registry if FHIR returned nothing
      activeMedNames = patient.medications.map((m) => m.name.toLowerCase());
    }

    const cards: object[] = [];

    // DDI check against live medication list
    for (const order of draftOrders) {
      const orderName = (order.code?.text ?? order.code?.coding?.[0]?.display ?? '').toLowerCase();
      if (!orderName) continue;

      for (const [existingFrag, interactFrags] of DDI_PAIRS) {
        const patientHasMed = activeMedNames.some((m) => m.includes(existingFrag));
        if (!patientHasMed) continue;
        const ddiHit = interactFrags.find((frag) => orderName.includes(frag));
        if (ddiHit) {
          cards.push({
            uuid: `ddi-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            summary: `DDI Risk: ${order.code?.text ?? 'Order'} — potential interaction with ${existingFrag}`,
            detail: `Patient currently takes ${existingFrag} which has a known DDI risk with ${ddiHit}. Review before signing. (Medication list from ${medBundle ? 'HAPI FHIR' : 'registry'})`,
            indicator: 'warning',
            source: { label: 'TCOC DDI Checker', url: patientLink },
            suggestions: [{ label: 'Acknowledge and proceed', actions: [] }],
            links: [],
          });
        }
      }

      // Also check registry ddi flags as a fallback
      if (patient?.medications) {
        const ddiMeds = patient.medications.filter((m) => m.ddi).map((m) => m.name.toLowerCase());
        const registryHit = ddiMeds.find(
          (med) => orderName.includes(med) || med.includes(orderName.split(' ')[0])
        );
        if (registryHit && !cards.some((c: any) => c.summary?.includes(registryHit))) {
          cards.push({
            uuid: `ddi-reg-${Date.now()}`,
            summary: `DDI Risk: ${order.code?.text ?? 'Order'} — interaction with ${registryHit}`,
            detail: `Patient currently takes ${registryHit} which has a known DDI risk. Review before signing.`,
            indicator: 'warning',
            source: { label: 'TCOC DDI Checker', url: patientLink },
            suggestions: [{ label: 'Acknowledge and proceed', actions: [] }],
            links: [],
          });
        }
      }
    }

    // STAT order without clinical note warning
    for (const order of draftOrders) {
      if (order.priority === 'stat' && (!order.note || order.note.length === 0)) {
        cards.push({
          uuid: `stat-note-${Date.now()}`,
          summary: 'STAT order missing required clinical indication note',
          detail:
            'STAT orders require a clinical indication note per policy. Please add a note before signing.',
          indicator: 'warning',
          source: { label: 'TCOC Order Validation', url: '' },
          suggestions: [],
          links: [],
        });
        break;
      }
    }

    return NextResponse.json({ cards });
  } catch (err) {
    // A malformed request body (bad JSON) is expected client input, not a server fault:
    // log it concisely and still fail closed to an empty, PHI-safe card list.
    if (err instanceof SyntaxError) {
      console.warn('[CDS Hooks order-sign] malformed request body — returning empty card list');
    } else {
      console.error('[CDS Hooks order-sign] Error:', err);
    }
    return NextResponse.json({ cards: [] }, { status: 500 });
  }
}
