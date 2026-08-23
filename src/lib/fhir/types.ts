import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Minimal FHIR R4 typings for the resources this app renders.
 * Intentionally partial — only the fields the UI consumes.
 * (RHTP reintegration: new file, no external dependency added.)
 */

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference?: string;
  display?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  comparator?: string;
  system?: string;
  code?: string;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirAnnotation {
  text?: string;
  time?: string;
}

export interface FhirExtension {
  url: string;
  valueDecimal?: number;
  valueString?: string;
  valueBoolean?: boolean;
}

export interface FhirHumanName {
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
  use?: string;
  text?: string;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: { lastUpdated?: string; versionId?: string };
  extension?: FhirExtension[];
}

export interface FhirBundle<T extends FhirResource = FhirResource> extends FhirResource {
  resourceType: 'Bundle';
  type?: string;
  total?: number;
  entry?: Array<{ fullUrl?: string; resource?: T; request?: { method?: string; url?: string } }>;
}

export interface FhirPatient extends FhirResource {
  resourceType: 'Patient';
  identifier?: Array<{ type?: FhirCodeableConcept; system?: string; value?: string }>;
  name?: FhirHumanName[];
  gender?: string;
  birthDate?: string;
  telecom?: Array<{ system?: string; value?: string; use?: string }>;
  address?: Array<{ line?: string[]; city?: string; state?: string; postalCode?: string }>;
}

export interface FhirEncounter extends FhirResource {
  resourceType: 'Encounter';
  status?: string;
  class?: FhirCoding;
  type?: FhirCodeableConcept[];
  subject?: FhirReference;
  participant?: Array<{ type?: FhirCodeableConcept[]; individual?: FhirReference }>;
  period?: FhirPeriod;
  reasonCode?: FhirCodeableConcept[];
  location?: Array<{ location?: FhirReference & { display?: string } }>;
  serviceProvider?: FhirReference;
}

export interface FhirCondition extends FhirResource {
  resourceType: 'Condition';
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  severity?: FhirCodeableConcept;
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: FhirReference;
  note?: FhirAnnotation[];
}

export interface FhirObservation extends FhirResource {
  resourceType: 'Observation';
  status?: string;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  effectiveDateTime?: string;
  valueQuantity?: FhirQuantity;
  valueCodeableConcept?: FhirCodeableConcept;
  valueString?: string;
  interpretation?: FhirCodeableConcept[];
  referenceRange?: Array<{ low?: FhirQuantity; high?: FhirQuantity; text?: string }>;
  component?: Array<{ code?: FhirCodeableConcept; valueQuantity?: FhirQuantity }>;
  performer?: FhirReference[];
}

export interface FhirMedicationRequest extends FhirResource {
  resourceType: 'MedicationRequest';
  status?: string;
  intent?: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  subject?: FhirReference;
  authoredOn?: string;
  requester?: FhirReference;
  reasonReference?: FhirReference[];
  dosageInstruction?: Array<{ text?: string; timing?: { code?: FhirCodeableConcept } }>;
  dispenseRequest?: { numberOfRepeatsAllowed?: number; quantity?: FhirQuantity };
  note?: FhirAnnotation[];
}

export interface FhirAllergyIntolerance extends FhirResource {
  resourceType: 'AllergyIntolerance';
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  type?: string;
  category?: string[];
  criticality?: string;
  code?: FhirCodeableConcept;
  patient?: FhirReference;
  recordedDate?: string;
  reaction?: Array<{ manifestation?: FhirCodeableConcept[]; severity?: string }>;
}

export interface FhirImmunization extends FhirResource {
  resourceType: 'Immunization';
  status?: string;
  vaccineCode?: FhirCodeableConcept;
  patient?: FhirReference;
  occurrenceDateTime?: string;
}

export interface FhirFlag extends FhirResource {
  resourceType: 'Flag';
  status?: string;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  period?: FhirPeriod;
}

export interface FhirCoverage extends FhirResource {
  resourceType: 'Coverage';
  status?: string;
  type?: FhirCodeableConcept;
  subscriberId?: string;
  beneficiary?: FhirReference;
  payor?: FhirReference[];
}

export interface FhirCareTeam extends FhirResource {
  resourceType: 'CareTeam';
  status?: string;
  name?: string;
  subject?: FhirReference;
  participant?: Array<{ role?: FhirCodeableConcept[]; member?: FhirReference }>;
}

export interface FhirGoal extends FhirResource {
  resourceType: 'Goal';
  lifecycleStatus?: string;
  description?: FhirCodeableConcept;
  subject?: FhirReference;
  target?: Array<{ measure?: FhirCodeableConcept; detailQuantity?: FhirQuantity; dueDate?: string }>;
}

export interface FhirCarePlan extends FhirResource {
  resourceType: 'CarePlan';
  status?: string;
  intent?: string;
  title?: string;
  subject?: FhirReference;
  period?: FhirPeriod;
  addresses?: FhirReference[];
  goal?: FhirReference[];
  activity?: Array<{ detail?: { status?: string; description?: string } }>;
}

export interface FhirServiceRequestR4 extends FhirResource {
  resourceType: 'ServiceRequest';
  status?: string;
  intent?: string;
  priority?: string;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  requester?: FhirReference;
  authoredOn?: string;
  reasonReference?: FhirReference[];
  reasonCode?: FhirCodeableConcept[];
  note?: FhirAnnotation[];
}

export interface FhirDiagnosticReport extends FhirResource {
  resourceType: 'DiagnosticReport';
  status?: string;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  effectiveDateTime?: string;
  conclusion?: string;
}

export interface FhirDocumentReference extends FhirResource {
  resourceType: 'DocumentReference';
  status?: string;
  type?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  date?: string;
  author?: FhirReference[];
  description?: string;
  content?: Array<{ attachment?: { contentType?: string; data?: string; title?: string } }>;
  context?: { encounter?: FhirReference[] };
}

export interface FhirFamilyMemberHistory extends FhirResource {
  resourceType: 'FamilyMemberHistory';
  status?: string;
  patient?: FhirReference;
  relationship?: FhirCodeableConcept;
  condition?: Array<{ code?: FhirCodeableConcept }>;
}

export interface FhirProcedure extends FhirResource {
  resourceType: 'Procedure';
  status?: string;
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  performedDateTime?: string;
}

export interface FhirPractitioner extends FhirResource {
  resourceType: 'Practitioner';
  identifier?: Array<{ system?: string; value?: string }>;
  name?: FhirHumanName[];
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function ccText(cc?: FhirCodeableConcept): string {
  return cc?.text ?? cc?.coding?.[0]?.display ?? cc?.coding?.[0]?.code ?? '—';
}

export function codeOf(cc?: FhirCodeableConcept, system?: string): string | undefined {
  if (!cc?.coding) return undefined;
  const c = system ? cc.coding.find((x) => x.system === system) : cc.coding[0];
  return c?.code;
}

export function humanName(names?: FhirHumanName[]): string {
  const n = names?.[0];
  if (!n) return 'Unknown';
  if (n.text) return n.text;
  return [n.prefix?.join(' '), n.given?.join(' '), n.family, n.suffix?.join(' ')]
    .filter(Boolean)
    .join(' ');
}

/** LAST, First — Cerner banner style */
export function bannerName(names?: FhirHumanName[]): string {
  const n = names?.[0];
  if (!n) return 'UNKNOWN';
  return `${(n.family ?? '').toUpperCase()}, ${n.given?.join(' ') ?? ''}`.trim();
}

export function ageFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  const now = clock.nowDate();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export function quantityText(q?: FhirQuantity): string {
  if (!q || q.value === undefined) return '—';
  return `${q.comparator ?? ''}${q.value}${q.unit ? ` ${q.unit}` : ''}`;
}

/** H / L / A / C interpretation code from an Observation */
export function interpCode(obs: FhirObservation): string | undefined {
  return obs.interpretation?.[0]?.coding?.[0]?.code;
}

/** Adherence PDC from the RHTP extension, as 0–100 */
export function adherencePdc(res: FhirResource): number | undefined {
  const ext = res.extension?.find(
    (e) => e.url === 'https://rhtp.example.org/fhir/StructureDefinition/adherence-pdc',
  );
  return ext?.valueDecimal !== undefined ? Math.round(ext.valueDecimal * 100) : undefined;
}
