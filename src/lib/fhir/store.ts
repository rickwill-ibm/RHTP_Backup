/**
 * In-memory FHIR store — backs the FhirClient's mock mode.
 *
 * Loads the same transaction bundles that seed the live HAPI server
 * (fhir/seed/*.bundle.json), so mock and live modes render identical
 * patients. Supports the read/search/create/update/delete semantics the
 * app's queries need, including a useful subset of FHIR search params:
 *   patient / subject, category, clinical-status, status, code,
 *   encounter, _sort (-date), _count.
 *
 * Created resources persist for the session, so demo write-back flows
 * (orders appearing in the Orders list, notes in Documentation) work
 * without a server.
 */
import type { FhirBundle, FhirResource } from './types';
import mariaBundle from '../../../fhir/seed/maria-redhawk.bundle.json';

type AnyResource = FhirResource & Record<string, unknown>;

const SEED_BUNDLES: FhirBundle[] = [mariaBundle as unknown as FhirBundle];

// resourceType -> id -> resource
let db: Map<string, Map<string, AnyResource>> | null = null;
let createSeq = 0;

function load(): Map<string, Map<string, AnyResource>> {
  if (db) return db;
  db = new Map();
  for (const bundle of SEED_BUNDLES) {
    for (const entry of bundle.entry ?? []) {
      const res = entry.resource as AnyResource | undefined;
      if (!res?.resourceType || !res.id) continue;
      if (!db.has(res.resourceType)) db.set(res.resourceType, new Map());
      db.get(res.resourceType)!.set(res.id, res);
    }
  }
  return db;
}

// ── Search helpers ───────────────────────────────────────────────────────────

function refMatches(value: unknown, target: string): boolean {
  // target may be "patient-maria-001" or "Patient/patient-maria-001"
  const ref = (value as { reference?: string } | undefined)?.reference;
  if (!ref) return false;
  const bare = target.includes('/') ? target : target;
  return ref === bare || ref.endsWith(`/${target}`) || ref === `Patient/${target}` || ref === target;
}

function ccMatchesToken(cc: unknown, token: string): boolean {
  if (!cc) return false;
  const list = Array.isArray(cc) ? cc : [cc];
  for (const c of list as Array<{ coding?: Array<{ code?: string; system?: string }>; text?: string }>) {
    if (c?.text?.toLowerCase() === token.toLowerCase()) return true;
    for (const coding of c?.coding ?? []) {
      // token may be "code" or "system|code"
      const [sys, code] = token.includes('|') ? token.split('|') : [undefined, token];
      if (coding.code === code && (!sys || coding.system === sys)) return true;
    }
  }
  return false;
}

function effectiveDate(res: AnyResource): string {
  return (
    (res.effectiveDateTime as string) ??
    ((res.period as { start?: string })?.start as string) ??
    (res.authoredOn as string) ??
    (res.date as string) ??
    (res.recordedDate as string) ??
    (res.occurrenceDateTime as string) ??
    (res.performedDateTime as string) ??
    ''
  );
}

function matchesParam(res: AnyResource, key: string, raw: string): boolean {
  const value = String(raw);
  switch (key) {
    case 'patient':
    case 'subject':
      return (
        refMatches(res.subject, value) ||
        refMatches(res.patient, value) ||
        refMatches(res.beneficiary, value)
      );
    case 'encounter':
      return refMatches(res.encounter, value);
    case 'category':
      return ccMatchesToken(res.category, value);
    case 'clinical-status':
      return ccMatchesToken(res.clinicalStatus, value);
    case 'status':
      return res.status === value || res.lifecycleStatus === value;
    case 'code':
      return ccMatchesToken(res.code, value) || ccMatchesToken(res.medicationCodeableConcept, value)
        || ccMatchesToken(res.vaccineCode, value) || ccMatchesToken(res.type, value);
    case '_id':
      return res.id === value;
    default:
      // Unknown params are ignored (permissive, like a lenient server)
      return true;
  }
}

// ── Public API (mirrors FhirClient method shapes) ────────────────────────────

export function storeRead<T = unknown>(resourceType: string, id: string): T | undefined {
  return load().get(resourceType)?.get(id) as T | undefined;
}

export function storeSearch<T = unknown>(
  resourceType: string,
  params: Record<string, string | number | boolean>,
): T {
  const all = Array.from(load().get(resourceType)?.values() ?? []);
  const { _sort, _count, _include: _ignored, ...filters } = params as Record<string, string>;

  let results = all.filter((res) =>
    Object.entries(filters).every(([k, v]) => matchesParam(res, k, String(v))),
  );

  if (_sort) {
    const desc = String(_sort).startsWith('-');
    results = results.sort((a, b) => {
      const da = effectiveDate(a);
      const dbb = effectiveDate(b);
      return desc ? dbb.localeCompare(da) : da.localeCompare(dbb);
    });
  }
  if (_count) results = results.slice(0, Number(_count));

  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    total: results.length,
    entry: results.map((resource) => ({ resource })),
  };
  return bundle as unknown as T;
}

export function storeCreate<T = unknown>(resource: Record<string, unknown>): T {
  const d = load();
  const rt = String(resource.resourceType ?? 'Basic');
  createSeq += 1;
  const id = (resource.id as string) ?? `local-${rt.toLowerCase()}-${Date.now()}-${createSeq}`;
  const stored = { ...resource, id, meta: { lastUpdated: new Date().toISOString() } } as AnyResource;
  if (!d.has(rt)) d.set(rt, new Map());
  d.get(rt)!.set(id, stored);
  return stored as unknown as T;
}

export function storeUpdate<T = unknown>(resource: Record<string, unknown> & { id: string }): T {
  const d = load();
  const rt = String(resource.resourceType ?? 'Basic');
  const stored = { ...resource, meta: { lastUpdated: new Date().toISOString() } } as AnyResource;
  if (!d.has(rt)) d.set(rt, new Map());
  d.get(rt)!.set(resource.id, stored);
  return stored as unknown as T;
}

export function storeDelete(resourceType: string, id: string): void {
  load().get(resourceType)?.delete(id);
}

/** The demo patient the SMART launch context resolves to in mock mode. */
export const DEMO_PATIENT_ID = 'patient-maria-001';
export const DEMO_ENCOUNTER_ID = 'encounter-maria-today';
