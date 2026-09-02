// SEAM: cdc-relay  // M3
/**
 * Patient-context extraction for the fan-out ingest driver — split out of
 * `ingestBundle.ts` to keep that file under the size cap (a routing driver, not a
 * demographics parser). Reads the bundle's Patient once and returns the PHI-safe
 * identity material the driver pre-resolves on: the demographics (name/dob/sex +
 * global medicaidId + a SOURCE-SCOPED localId = {assigningAuthority, MRN}) and the
 * tokens the bundle uses to reference the patient (fullUrl / Patient/<id> / id).
 */
import type { DemographicTraits } from '@/lib/pipeline';
import type { FhirBundle } from './ingestBundle';

export interface PatientContext {
  demographics: DemographicTraits;
  /** Every token the bundle uses to reference this patient (for xref seeding). */
  tokens: string[];
  /** The primary token identity is anchored on (fullUrl token, else the id). */
  patientToken: string;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** The raw subject-id token an adapter would extract from a reference. */
function tokenFromRef(ref: string): string {
  return ref.split('/').pop() ?? '';
}

/** Extract the Patient's demographics + the id tokens its records reference. */
export function patientContext(
  bundle: FhirBundle,
  sourceSystem: string,
  medicaidSystem?: string
): PatientContext | null {
  const entries = bundle.entry ?? [];
  const patientEntry = entries.find((e) => str(obj(e.resource).resourceType) === 'Patient');
  if (!patientEntry) return null;
  const patient = obj(patientEntry.resource);
  const name = Array.isArray(patient.name) ? obj(patient.name[0]) : {};
  const given = Array.isArray(name.given) ? str(name.given[0]) : '';
  const identifiers = Array.isArray(patient.identifier) ? patient.identifier.map(obj) : [];

  const mrn = identifiers.find(
    (i) => /mrn|\bmr\b/i.test(str(i.system)) || /mrn/i.test(str(obj(i.type).text))
  );
  const medicaid = identifiers.find((i) =>
    medicaidSystem ? str(i.system) === medicaidSystem : /medicaid/i.test(str(i.system))
  );
  const sex = str(patient.gender) as DemographicTraits['sex'];

  const demographics: DemographicTraits = {
    firstName: given,
    lastName: str(name.family),
    dob: str(patient.birthDate),
    sex: sex || undefined,
    medicaidId: medicaid ? str(medicaid.value) : undefined,
  };
  const mrnValue = mrn ? str(mrn.value) : '';
  if (mrnValue) demographics.localId = { assigningAuthority: sourceSystem, value: mrnValue };

  // The tokens the bundle uses to reference this patient (fullUrl + Patient/<id> + id).
  const fullUrlToken = tokenFromRef(str(patientEntry.fullUrl));
  const idToken = str(patient.id);
  const tokens = [
    ...new Set([fullUrlToken, idToken, tokenFromRef(`Patient/${idToken}`)].filter(Boolean)),
  ];
  const patientToken = fullUrlToken || idToken;
  return { demographics, tokens, patientToken };
}
