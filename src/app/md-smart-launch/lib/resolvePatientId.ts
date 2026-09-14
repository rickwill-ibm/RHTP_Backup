/**
 * resolvePatientId — SmartApp patient ID resolver chain.
 *
 * SEAM: patient-id-resolution — single entry point for all ID forms.
 * Accepts any patient identifier the SmartApp may receive and returns
 * the canonical FHIR resource ID used by the FHIR store and HAPI server.
 *
 * Resolution order (cheapest first, no network until needed):
 *   1. Empty / known demo alias        → DEMO_PATIENT_ID (dev convenience only)
 *   2. FHIR slug passthrough           → storeRead confirms it exists
 *   3. Platform ID (PAT-xxxx, etc.)    → PLATFORM_TO_FHIR_ID_MAP
 *   4. UUID (Connect360)               → UUID_TO_FHIR_ID_MAP static, then live FHIR GET
 *   5. MRN                             → MRN_TO_FHIR_ID_MAP static
 *                                        → EMPI PIXm via BFF (/api/empi/mrn-to-uuid)
 *                                          → UUID → uuidToFhirId or FHIR GET /Patient/{uuid}
 *                                        → fallback: direct FHIR identifier search
 *   6. Unrecognised                    → returns null (caller shows "Patient not found")
 *
 * INVARIANT: never silently falls back to a wrong patient.
 * A null result MUST surface a "Patient not found" error — never a silent
 * redirect to the demo patient.
 *
 * Live FHIR searches are performed via the BFF (/api/fhir/* or /api/empi/*),
 * never directly from the browser to the FHIR server or EMPI.
 */
import { DEMO_PATIENT_ID, storeRead } from '@/lib/fhir/store';
import {
  PLATFORM_TO_FHIR_ID_MAP,
  isUuid,
  uuidToFhirId,
  mrnToFhirId,
} from '@/lib/patientRegistry';

/** Which resolution strategy succeeded — included in the launch audit trail. */
export type IdentifierSource =
  | 'demo-alias'
  | 'fhir-slug'
  | 'platform-id'
  | 'uuid-static'
  | 'uuid-live'
  | 'mrn-static'
  | 'mrn-empi'
  | 'mrn-live';

export interface ResolvedPatient {
  canonicalFhirId: string;
  /** How the ID was resolved — recorded in the audit trail, PHI-safe. */
  identifierSource: IdentifierSource;
}

/** Known demo aliases that map directly to the Maria fixture. */
const DEMO_ALIASES = new Set(['', 'maria-redhawk-001', 'patient/maria-redhawk-001']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function presentInStore(fhirId: string): boolean {
  return storeRead('Patient', fhirId) !== undefined;
}

async function fhirSearchFirst(searchPath: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/fhir/${searchPath}`, {
      headers: { Accept: 'application/fhir+json' },
    });
    if (!res.ok) return null;
    const bundle = (await res.json()) as {
      entry?: { resource?: { id?: string; resourceType?: string } }[];
    };
    const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient');
    const id = patient?.resource?.id;
    return id ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask the BFF EMPI route to convert an MRN to an enterprise UUID via PIXm.
 * Returns null when EMPI is not configured or the MRN is unknown — the caller
 * falls back to a direct FHIR identifier search.
 */
async function empiMrnToUuid(mrn: string, mrnSystem: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ mrn, system: mrnSystem });
    const res = await fetch(`/api/empi/mrn-to-uuid?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { uuid?: string };
    return body.uuid ?? null;
  } catch {
    return null;
  }
}

// ── Public resolver ───────────────────────────────────────────────────────────

/**
 * Resolve any patient identifier to a canonical FHIR resource ID.
 *
 * @param rawId  The identifier as received (URL param, SMART context, Connect360 UUID, MRN…)
 * @param mock   True when the app is in mock/seeded mode — skips live FHIR searches.
 * @returns      ResolvedPatient on success, null when the patient cannot be found.
 */
export async function resolvePatientId(
  rawId: string,
  mock: boolean
): Promise<ResolvedPatient | null> {
  const id = (rawId ?? '').trim().replace(/^patient\//, '');

  // 1. Empty / demo alias — developer convenience only.
  if (DEMO_ALIASES.has(id)) {
    return { canonicalFhirId: DEMO_PATIENT_ID, identifierSource: 'demo-alias' };
  }

  // 2. FHIR slug passthrough — starts with 'patient-' and present in mock store.
  if (id.startsWith('patient-') && presentInStore(id)) {
    return { canonicalFhirId: id, identifierSource: 'fhir-slug' };
  }

  // 3. Platform ID (e.g. PAT-0042, MARIA_SD_001).
  const fromPlatform = PLATFORM_TO_FHIR_ID_MAP[id];
  if (fromPlatform) {
    return { canonicalFhirId: fromPlatform, identifierSource: 'platform-id' };
  }

  // 4. UUID (Connect360 UUIDv4 resource IDs).
  if (isUuid(id)) {
    const fromStatic = uuidToFhirId(id);
    if (fromStatic) {
      return { canonicalFhirId: fromStatic, identifierSource: 'uuid-static' };
    }
    if (!mock) {
      const fromLive = await fhirSearchFirst(`Patient?_id=${encodeURIComponent(id)}`);
      if (fromLive) return { canonicalFhirId: fromLive, identifierSource: 'uuid-live' };
    }
    return null;
  }

  // 5. MRN — static map → EMPI PIXm (production) → FHIR identifier search (fallback).
  const fromMrnStatic = mrnToFhirId(id);
  if (fromMrnStatic) {
    return { canonicalFhirId: fromMrnStatic, identifierSource: 'mrn-static' };
  }
  if (!mock) {
    const mrnSystem =
      process.env.NEXT_PUBLIC_MRN_SYSTEM ?? 'http://tcoc.example.org/fhir/sid/mrn';

    // 5a. EMPI PIXm — production-correct path: MRN → enterprise UUID → FHIR GET.
    const empiUuid = await empiMrnToUuid(id, mrnSystem);
    if (empiUuid) {
      // UUID may already be in the static map (seeded patients); resolve it directly.
      const fromUuidStatic = uuidToFhirId(empiUuid);
      if (fromUuidStatic) {
        return { canonicalFhirId: fromUuidStatic, identifierSource: 'mrn-empi' };
      }
      // Not in static map — fetch the FHIR resource by UUID directly.
      const fromFhir = await fhirSearchFirst(`Patient?_id=${encodeURIComponent(empiUuid)}`);
      if (fromFhir) return { canonicalFhirId: fromFhir, identifierSource: 'mrn-empi' };
    }

    // 5b. Fallback: direct FHIR identifier search (no external EMPI configured).
    const path = `Patient?identifier=${encodeURIComponent(`${mrnSystem}|${id}`)}`;
    const fromLive = await fhirSearchFirst(path);
    if (fromLive) return { canonicalFhirId: fromLive, identifierSource: 'mrn-live' };
  }

  // 6. Unresolvable — caller must show "Patient not found", never a silent fallback.
  return null;
}
