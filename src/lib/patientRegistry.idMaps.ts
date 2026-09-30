/**
 * patientRegistry.idMaps.ts — UUID and MRN static identity maps.
 *
 * SEAM: patient-id-resolution — the SmartApp resolver (resolvePatientId.ts)
 * consults these maps BEFORE falling through to a live FHIR search.
 * They cover every patient in both the RHTP seed bundles and the Connect360
 * UUID bundles so mock mode never requires a network call.
 *
 * Sources:
 *   UUID → fhir/seed/patients/connect360/manifest.json  (idScheme: "uuidv4")
 *   MRN  → fhir/seed/patients/*.bundle.json             (Patient.identifier[code=MR])
 *
 * INVARIANT: these maps are additive-only. A key is never removed; a new patient
 * registers a new row. Production UUIDs assigned by HAPI that are absent here
 * fall through to a live FHIR search — never to a silent wrong-patient load.
 */

// ── UUID → canonical FHIR resource ID (Connect360 UUIDv4 bundles) ─────────────
// Sourced from fhir/seed/patients/connect360/manifest.json
export const UUID_TO_FHIR_ID_MAP: Record<string, string> = {
  // Dorothy Simmons
  '5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb': 'patient-dorothy-042',
  // James Wilson
  '9c075c8e-9ed6-44ec-a059-80a5d5aaac68': 'patient-james-087',
  // Robert Chen
  '95fa3e42-7027-47f3-95a7-6c254bfe62a9': 'patient-robert-103',
  // Lisa Thompson
  '64b13566-9345-48b2-8da8-4011d9547721': 'patient-lisa-156',
  // Alex Kirby
  '6a5fdc1a-d700-4d69-9ddd-3569543bda5b': 'patient-alex-kirby',
};

// ── MRN → canonical FHIR resource ID ─────────────────────────────────────────
// Sourced from Patient.identifier[type.coding.code=MR].value in each bundle.
// The MRN system URI is http://tcoc.example.org/fhir/sid/mrn (demo default).
// Production sites override via NEXT_PUBLIC_MRN_SYSTEM (see resolvePatientId.ts).
export const MRN_TO_FHIR_ID_MAP: Record<string, string> = {
  // Maria Redhawk — system: urn:rhtp:mrn
  'SD-448291': 'patient-maria-001',
  // Dorothy Simmons — system: http://tcoc.example.org/fhir/sid/mrn
  'MRN-0042': 'patient-dorothy-042',
  // James Wilson
  'MRN-0087': 'patient-james-087',
  // Robert Chen
  'MRN-0103': 'patient-robert-103',
  // Lisa Thompson
  'MRN-0156': 'patient-lisa-156',
  // Denise Fontaine — system: urn:rhtp:mrn
  'NY-882104': 'patient-denise-fontaine',
  // Alex Kirby — no MRN in seed bundle
};

// ── UUID regex (RFC 4122 v4) ──────────────────────────────────────────────────
// Exported so the resolver and tests share a single definition.
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the string is a well-formed UUIDv4. */
export function isUuid(id: string): boolean {
  return UUID_V4_REGEX.test(id);
}

/**
 * Resolve a UUID to a FHIR resource ID using the static map.
 * Returns undefined when the UUID is not in the map (live FHIR search needed).
 */
export function uuidToFhirId(uuid: string): string | undefined {
  return UUID_TO_FHIR_ID_MAP[uuid.toLowerCase()];
}

/**
 * Resolve an MRN to a FHIR resource ID using the static map.
 * Returns undefined when the MRN is not in the map (live FHIR search needed).
 */
export function mrnToFhirId(mrn: string): string | undefined {
  return MRN_TO_FHIR_ID_MAP[mrn];
}
