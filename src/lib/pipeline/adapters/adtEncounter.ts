// CONTRACT: C9  // CONTRACT: C10
/**
 * ADT encounter STREAM adapter (arrival mode: stream). Proves the HL7v2 stream
 * path. Parses an HL7v2-ish ADT message (segment-per-line, `|`-delimited fields)
 * into a single Encounter event at tier T1. One message = one record (stream
 * lane). Segmentation-at-transform is exercised here: a chemical-dependency
 * hospital service (PV1-10 = 'CD') attaches a Part 2 hint the shared transform
 * turns into a durable 42 CFR Part 2 label.
 *
 * C9.2 yield: ADT -> encounter events T1 (stream).
 */
import type { DomainAdapter, NormalizedRecord, PipelineDeps, RawRecord, ValidationResult } from '../types';

interface Hl7Message {
  segments: Record<string, string[]>; // segment id -> fields (first occurrence)
}

const SOURCE = { system: 'hixny-qe', feed: 'adt-hl7v2' } as const;

const TRIGGER_TO_EVENT: Record<string, string> = {
  A01: 'encounter.admitted',
  A02: 'encounter.transferred',
  A03: 'encounter.discharged',
  A04: 'encounter.ed-arrival',
};

/** HL7v2 encounter class from PV1-2 patient class. */
const CLASS_MAP: Record<string, string> = { I: 'IMP', O: 'AMB', E: 'EMER', P: 'PRENC' };

function parse(payload: string): RawRecord<Hl7Message>[] {
  const segments: Record<string, string[]> = {};
  for (const line of payload.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)) {
    const fields = line.split('|');
    if (fields[0] && !(fields[0] in segments)) segments[fields[0]] = fields;
  }
  const msh = segments['MSH'];
  const controlId = msh?.[9] ?? 'unknown-control-id';
  return [{ sourceRef: controlId, data: { segments } }];
}

function triggerEvent(m: Hl7Message): string | undefined {
  // MSH-9 is "ADT^A01"; the trigger is the second component.
  const msh9 = m.segments['MSH']?.[8] ?? '';
  const parts = msh9.split('^');
  return parts[1];
}

function validate(raw: RawRecord<Hl7Message>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const m = raw.data;
  if (!m.segments['MSH']) issues.push({ reasonCode: 'missing-msh', fieldPath: 'MSH' });
  const trigger = triggerEvent(m);
  if (!trigger || !(trigger in TRIGGER_TO_EVENT))
    issues.push({ reasonCode: 'unsupported-trigger-event', fieldPath: 'MSH-9' });
  const pid = m.segments['PID'];
  if (!pid || !pid[3]) issues.push({ reasonCode: 'missing-patient-id', fieldPath: 'PID-3' });
  if (!m.segments['PV1']) issues.push({ reasonCode: 'missing-pv1', fieldPath: 'PV1' });
  return { ok: issues.length === 0, issues };
}

/** PID-3 is "SRC-MEM-0001^^^HIX^MR"; take the id component. */
function patientSourceId(m: Hl7Message): string {
  return (m.segments['PID']?.[3] ?? '').split('^')[0];
}

/** HL7 sex (PID-8) -> canonical sex, for probabilistic matching only. */
const HL7_SEX: Record<string, 'male' | 'female' | 'other' | 'unknown'> = {
  M: 'male',
  F: 'female',
  O: 'other',
  U: 'unknown',
};

/**
 * Patient demographics parsed from PID (name PID-5 "last^first", dob PID-7
 * YYYYMMDD, sex PID-8), carried into identity resolution for probabilistic
 * matching. Seam-only — never stored on the record.
 */
function demographicsOf(m: Hl7Message): import('../types').DemographicTraits {
  const pid = m.segments['PID'] ?? [];
  const [lastName, firstName] = (pid[5] ?? '').split('^');
  const dob = pid[7] ?? '';
  return {
    lastName: lastName || undefined,
    firstName: firstName || undefined,
    dob: dob.length >= 8 ? `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}` : undefined,
    sex: HL7_SEX[(pid[8] ?? '').toUpperCase()],
  };
}

function normalize(raw: RawRecord<Hl7Message>, deps: PipelineDeps): NormalizedRecord {
  const m = raw.data;
  const controlId = raw.sourceRef;
  const trigger = triggerEvent(m)!;
  const pv1 = m.segments['PV1'] ?? [];
  const patientClass = pv1[2] ?? '';
  const hospitalService = pv1[10] ?? '';
  // Pass the patient demographics so a real EMPI resolver can match
  // probabilistically; the deterministic (demo) resolver ignores them.
  const memberId = deps.resolveIdentity(patientSourceId(m), { feed: SOURCE.feed, demographics: demographicsOf(m) });
  const payload: Record<string, unknown> = {
    encounterRef: `Encounter/enc-${controlId}`,
    encounterClass: CLASS_MAP[patientClass] ?? 'IMP',
    hospitalService,
    trigger,
    pointOfCare: (pv1[3] ?? '').split('^')[0], // location code, not a name
  };
  // Segmentation-at-transform: chemical-dependency service is Part 2 (SUD) data.
  if (hospitalService.toUpperCase() === 'CD') payload.segmentationHints = ['part2-sud'];
  return {
    domain: 'encounter',
    memberId,
    resourceType: 'Encounter',
    fhirResourceId: `Encounter/enc-${controlId}`,
    eventType: TRIGGER_TO_EVENT[trigger],
    tier: 'T1',
    idempotencyKey: `adt:${controlId}`,
    provenance: 'qe-adt-feed',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: hl7TimeToIso(m.segments['EVN']?.[2] ?? m.segments['MSH']?.[6]) ?? new Date(deps.now()).toISOString(),
    payload,
  };
}

/** HL7 timestamp (YYYYMMDDHHMMSS) -> ISO, best-effort. */
function hl7TimeToIso(ts?: string): string | undefined {
  if (!ts || ts.length < 8) return undefined;
  const [y, mo, d, h = '00', mi = '00', s = '00'] = [
    ts.slice(0, 4), ts.slice(4, 6), ts.slice(6, 8), ts.slice(8, 10), ts.slice(10, 12), ts.slice(12, 14),
  ];
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/** The ADT encounter stream adapter. */
export const adtEncounterAdapter: DomainAdapter<Hl7Message> = {
  source: SOURCE,
  domain: 'encounter',
  format: 'hl7v2-adt',
  arrivalMode: 'stream',
  parse,
  validate,
  normalize,
};
