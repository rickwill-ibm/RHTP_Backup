/**
 * CDS Hooks — patient-view hook
 * POST /api/cds-hooks/patient-view
 *
 * Called when a clinician opens a patient record.
 * In Live FHIR mode: reads care gaps directly from HAPI FHIR Observations so
 * closures performed through the UI are reflected immediately to the EHR.
 * Falls back to registry lookup when FHIR is unavailable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPatientByFhirId, getPatientById, FHIR_ID_MAP } from '@/lib/patientRegistry';

const FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4029';

// ── Low-level fetch helper (server-side) ──────────────────────────────────────
async function fhirGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${FHIR_BASE}/${path.replace(/^\//, '')}`, {
      headers: { Accept: 'application/fhir+json' },
      // Server-side: no browser AbortController; rely on node default timeout
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface FhirObsBundle {
  entry?: {
    resource?: {
      id?: string;
      status?: string;
      code?: { text?: string };
      extension?: { url: string; valueString?: string; valueInteger?: number }[];
    };
  }[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contextPatientId: string = body?.context?.patientId ?? '';

    // 1. Resolve platform patient from FHIR ID or platform ID (for link-building)
    const patient =
      getPatientByFhirId(contextPatientId) ??
      getPatientById(contextPatientId) ??
      getPatientById(FHIR_ID_MAP[contextPatientId] ?? '');

    const platformId = patient?.platformId ?? contextPatientId;
    const patientLink = `${APP_URL}/patient-detail?id=${platformId}`;

    // 2. Resolve the FHIR patient ID to query HAPI FHIR directly
    //    contextPatientId may already be the FHIR resource id, or may need lookup
    const fhirPatientId = patient?.fhirId?.replace(/^patient\//, '') ?? contextPatientId;

    // 3. Fetch Observations from HAPI FHIR (live gap statuses)
    const obsBundle = await fhirGet<FhirObsBundle>(
      `Observation?subject=Patient/${fhirPatientId}&_count=100`
    );

    const BASE_EXT = 'http://tcoc.example.org/fhir/StructureDefinition';

    // Extract care gap observations from the live FHIR bundle
    const liveGaps = (obsBundle?.entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is NonNullable<typeof r> => !!r?.id)
      .filter((r) => {
        // Only include care-gap observations (not BH score or SDOH observations)
        const hasGapExt = r.extension?.some((x) => x.url === `${BASE_EXT}/tcoc-gap-id`);
        return hasGapExt;
      })
      .map((r) => {
        const ext = (url: string) => r.extension?.find((x) => x.url === url);
        const statusRaw = ext(`${BASE_EXT}/care-gap-status`)?.valueString ?? '';
        const domain = ext(`${BASE_EXT}/care-gap-domain`)?.valueString ?? 'Clinical';
        const daysOpen = ext(`${BASE_EXT}/care-gap-days-open`)?.valueInteger ?? 0;
        return {
          id: ext(`${BASE_EXT}/tcoc-gap-id`)?.valueString ?? r.id ?? '',
          name: r.code?.text ?? 'Care Gap',
          status:
            statusRaw ||
            (r.status === 'final' ? 'Closed' : r.status === 'preliminary' ? 'Open' : 'In Progress'),
          domain,
          daysOpen,
        };
      });

    const openGaps = liveGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress');
    const cards: object[] = [];

    if (openGaps.length > 0) {
      // Surface open gaps as CDS cards (up to 5)
      for (const gap of openGaps.slice(0, 5)) {
        cards.push({
          uuid: `gap-${gap.id}`,
          summary: `${gap.domain} Gap: ${gap.name}`,
          detail: `Status: ${gap.status} · ${gap.daysOpen} days open · Source: HAPI FHIR (live)`,
          indicator: gap.daysOpen > 60 ? 'warning' : 'info',
          source: { label: 'TCOC Care Management Platform', url: patientLink },
          suggestions: [],
          links: [{ label: 'View Patient Detail', url: patientLink, type: 'absolute' }],
        });
      }
    } else if (patient) {
      // Fall back to registry CDS cards if FHIR returned nothing
      for (const c of patient.cdsCards ?? []) {
        cards.push({
          uuid: c.id,
          summary: c.summary,
          detail: c.detail,
          indicator:
            c.indicator === 'critical'
              ? 'critical'
              : c.indicator === 'warning'
                ? 'warning'
                : 'info',
          source: { label: 'TCOC Care Management Platform', url: patientLink },
          suggestions: [],
          links: [{ label: 'View Patient Detail', url: patientLink, type: 'absolute' }],
        });
      }
    }

    return NextResponse.json({ cards });
  } catch (err) {
    // A malformed request body (bad JSON) is expected client input, not a server fault:
    // log it concisely and still fail closed to an empty, PHI-safe card list.
    if (err instanceof SyntaxError) {
      console.warn('[CDS Hooks patient-view] malformed request body — returning empty card list');
    } else {
      console.error('[CDS Hooks patient-view] Error:', err);
    }
    return NextResponse.json({ cards: [] }, { status: 500 });
  }
}
