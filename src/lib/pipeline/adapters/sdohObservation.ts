// CONTRACT: C9  // CONTRACT: C10  // R3
/**
 * SDOH-screening FHIR-JSON adapter (arrival mode: batch). Parses the SDOH subset
 * of a FHIR Observation feed — the `social-history` category — into normalized
 * SDOH records at tier T1, so a Gravity/AHC-HRSN screening reaches the member's
 * SOCIAL-need subgraph instead of being mis-filed as a lab result.
 *
 * R3 rationale: labs/vitals, SDOH and BH-survey Observations arrive on one FHIR
 * Observation stream, distinguished only by `category`. The lab adapter now owns
 * `laboratory` + `vital-signs`; THIS adapter owns `social-history` and emits
 * `sdoh.screening.recorded` events claimed by the EXISTING `sdohSpec` (which
 * matches the `sdoh.` prefix), so no new mapping spec or domain is introduced — the
 * screening projects onto the SdohScreening / SocialNeed node shape that spec
 * already builds.
 *
 * The screening RESULT is mapped from structured signals only (the LOINC code ->
 * the SDOH domain + a PHI-safe ICD-10 Z-code, and a coded/interpretation-derived
 * positive/negative finding). The free-text result string is NEVER copied into the
 * normalized payload (codes + refs only, §4A stage 3 PHI-minimal): it is read only
 * to derive the boolean finding, exactly as a lab result value is read to derive a
 * flag. A screening with no recognizable positive signal records the SdohScreening
 * as a negative/among-screened result, never a fabricated unmet need.
 *
 * C9.2 yield: SDOH-screening FHIR feed -> sdoh T1 (SdohScreening + positive need).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One tagged FHIR Observation pulled from the bundle. */
interface ObsResource {
  resource: Record<string, unknown>;
}

/** The SdohScreening payload the sdohSpec reads (codes + refs only, PHI-safe). */
export interface SdohObservationPayload {
  responseRef: string;
  domain: string;
  zCode: { system: string; code: string };
  positive: boolean;
  provenance: string;
}

const SOURCE = { system: 'sdoh-fhir-hub', feed: 'sdoh-observation-fhir' } as const;
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** All category codes across every category coding (not just coding[0]). */
function categoryCodes(resource: Record<string, unknown>): string[] {
  const cat = resource.category;
  if (!Array.isArray(cat)) return [];
  const out: string[] = [];
  for (const c of cat) {
    const coding = obj(c).coding;
    if (Array.isArray(coding)) for (const cc of coding) out.push(str(obj(cc).code));
  }
  return out;
}
/** This adapter owns Observations carrying the `social-history` category. */
export function isSocialHistory(resource: Record<string, unknown>): boolean {
  return categoryCodes(resource).includes('social-history');
}

/** The LOINC screening code from code.coding (any position). */
function loincCode(resource: Record<string, unknown>): string {
  const coding = obj(resource.code).coding;
  if (!Array.isArray(coding)) return '';
  for (const c of coding) {
    const cc = obj(c);
    if (/loinc/i.test(str(cc.system)) && str(cc.code)) return str(cc.code);
  }
  // fall back to the first coding's code when the system is unlabeled
  const first = Array.isArray(coding) ? obj(coding[0]) : {};
  return str(first.code);
}

/**
 * LOINC AHC-HRSN / PRAPARE screening code -> {SDOH domain, ICD-10 Z-code}. Data,
 * not logic (conventions v2): new screening instruments extend the table. The
 * domain string is what `barrierKeyForDomain` (holistic aggregator) buckets on.
 */
const SCREEN_BY_LOINC: Record<string, { domain: string; zcode: string }> = {
  '71802-3': { domain: 'housing-instability', zcode: 'Z59.0' }, // Housing status
  '88122-7': { domain: 'food-insecurity', zcode: 'Z59.41' }, // Food insecurity risk
  '93030-5': { domain: 'transportation-insecurity', zcode: 'Z59.82' }, // Transportation insecurity
  '76513-1': { domain: 'financial-strain', zcode: 'Z59.86' }, // Financial resource strain
  '93159-5': { domain: 'food-insecurity', zcode: 'Z59.41' }, // Hunger Vital Sign
  '71969-0': { domain: 'housing-instability', zcode: 'Z59.0' },
};

/** The raw result string of a screening (valueCodeableConcept.text/coding, valueString). */
function resultText(resource: Record<string, unknown>): string {
  const vcc = obj(resource.valueCodeableConcept);
  const coding = Array.isArray(vcc.coding) ? obj(vcc.coding[0]) : {};
  return [str(vcc.text), str(coding.display), str(resource.valueString)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
/**
 * A coded positive/negative interpretation, when the source carries one. This is
 * the AUTHORITATIVE finding when present — the free-text classifier below is only a
 * fallback. HL7 v3 ObservationInterpretation for a SDOH SCREEN: POS / A / AA are a
 * positive finding; NEG / N are negative. The lab high/critical-high flags (H / HH)
 * are deliberately NOT treated as SDOH-positive (FINDING 3): they are laboratory
 * range flags, not a social-need signal, and this adapter only owns social-history
 * Observations. Returns undefined when no coded SDOH interpretation exists.
 */
function codedInterpretation(resource: Record<string, unknown>): boolean | undefined {
  const interp = resource.interpretation;
  const arr = Array.isArray(interp) ? interp : [];
  for (const i of arr) {
    const coding = obj(i).coding;
    const first = Array.isArray(coding) ? obj(coding[0]) : {};
    const code = str(first.code).toUpperCase();
    if (['POS', 'A', 'AA'].includes(code)) return true;
    if (['NEG', 'N'].includes(code)) return false;
  }
  return undefined;
}

/*
 * Free-text screening classifier (FALLBACK ONLY — a coded interpretation always
 * wins). Deterministic, table-driven, PHI-safe: the result text is classified to a
 * boolean and NEVER copied into the normalized payload. FINDING 1 (the bug this
 * replaces): the old positive regex trailed a `\b` on the stems `insecur` / `instab`
 * / `homeless`, so every INFLECTED form — "food insecurity", "housing instability",
 * "homelessness" — failed to match and silently classified NEGATIVE, hiding a real
 * unmet need (fail-UNsafe: the dangerous direction). The stems are now prefixes so
 * any inflection matches, and negation is handled so a screen that NAMES a domain
 * only to rule it out ("Screened — no food insecurity") does not flip to a false
 * positive. Five ordered signals — the first that fires decides:
 *   1. NEGATED PROBLEM  ("no food insecurity", "negative for housing instability") -> NEGATIVE
 *   2. NEGATED RESOURCE ("no stable housing", "lacks reliable transport")          -> POSITIVE
 *   3. BARRIER stem     (prefix-matched; "insecur"/"instab"/"homeless"/…)          -> POSITIVE
 *   4. CLEAR SCREEN     ("stable", "secure", "adequate", "not flagged")            -> NEGATIVE
 *   5. default (no barrier signal at all)                                          -> NEGATIVE
 * Order matters and encodes the fail-safe direction (a HIDDEN real need is the
 * dangerous outcome): (1) before (2) so "no food insecurity" (negation + PROBLEM)
 * reads negative rather than being caught by "no … food" in (2); (2) before (3) so
 * "no stable housing" (a LACK of a good) surfaces as a barrier; (3) before (4) so an
 * affirmatively-stated barrier ("unstable housing, otherwise stable mood") is NOT
 * silenced by a stray clear-word later in the same string. Only an EXPLICIT negation
 * (1) or a screen with no barrier stem at all (4/5) resolves to negative.
 */
const NEGATION =
  "(?:no|not|none|never|negative|lack(?:s|ing)?|without|denie[sd]|denied|unable|cannot|can'?t)";
const PROBLEM =
  '(?:insecur|instab|unstabl|homeless|barrier|hardship|strain|unmet|evict|deprivation)';
const RESOURCE =
  '(?:stable|secure|adequate|permanent|reliable|sufficient|housing|shelter|food|transport|income|employ)';
const NEG_PROBLEM = new RegExp(`\\b${NEGATION}\\b[\\s\\S]{0,24}${PROBLEM}`, 'i');
const NEG_RESOURCE = new RegExp(`\\b${NEGATION}\\b[\\s\\S]{0,24}\\b${RESOURCE}`, 'i');
const BARRIER =
  /\b(barrier|insecur|instab|unstabl|homeless|evict|hardship|strain|shelter|unmet|limited|inadequate|insufficient|cannot afford|can'?t afford|unable to afford|no transport|lacks? transport|low income|kept from care|cost barrier)/i;
const CLEAR_SCREEN =
  /\b(stable|secure|adequate|sufficient|resolved|not flagged|no flag|no risk|low risk|negative)\b/i;

/** Classify a screening result string to a positive (barrier present) / negative finding. */
export function classifyScreenResult(text: string): boolean {
  if (!text) return false;
  if (NEG_PROBLEM.test(text)) return false; // negated problem: the domain was ruled out
  if (NEG_RESOURCE.test(text)) return true; // negated resource: a good the member LACKS -> a barrier
  if (BARRIER.test(text)) return true; // any affirmatively-stated barrier (incl. inflections)
  if (CLEAR_SCREEN.test(text)) return false; // affirmatively clear screen
  return false; // no barrier signal -> among-screened, never a fabricated need
}

/** Derive the positive finding: a coded interpretation wins; else classify the result text. */
function isPositive(resource: Record<string, unknown>): boolean {
  const coded = codedInterpretation(resource);
  if (coded !== undefined) return coded;
  return classifyScreenResult(resultText(resource));
}

/** subject.reference last component -> the source member id (anchored via the seam). */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}

function parse(payload: string): RawRecord<ObsResource>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const out: RawRecord<ObsResource>[] = [];
  for (const entry of entries) {
    const resource = obj(obj(entry).resource);
    if (str(resource.resourceType) !== 'Observation') continue;
    if (!isSocialHistory(resource)) continue; // owns social-history only
    const id = str(resource.id) || `sdoh-obs-${out.length + 1}`;
    out.push({ sourceRef: id, data: { resource } });
  }
  return out;
}

function validate(raw: RawRecord<ObsResource>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const { resource } = raw.data;
  if (!subjectSourceId(resource))
    issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  const code = loincCode(resource);
  if (!code) issues.push({ reasonCode: 'missing-observation-code', fieldPath: 'code.coding' });
  else if (!SCREEN_BY_LOINC[code])
    issues.push({ reasonCode: 'unmapped-sdoh-screening-code', fieldPath: 'code.coding' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<ObsResource>, deps: PipelineDeps): NormalizedRecord {
  const resource = raw.data.resource;
  const obsId = str(resource.id);
  const memberId = deps.resolveIdentity(subjectSourceId(resource), { feed: SOURCE.feed });
  const observationRef = `Observation/${obsId}`;
  const code = loincCode(resource);
  const map = SCREEN_BY_LOINC[code] ?? { domain: 'unknown', zcode: '' };
  const positive = isPositive(resource);
  const effectiveDateTime = str(resource.effectiveDateTime);
  // The ICD-10 SDOH Z-code is the diagnosis of an UNMET need — it belongs on a
  // POSITIVE finding, never on a negative screen (recording a Z-code for a "stable
  // housing" screen would assert a housing problem that the screen just ruled out).
  // A negative screen carries an empty code, so the semantic gate has no governed
  // coding to reject and the SdohScreening still projects (fail-honest, PHI-safe).
  const zCode = positive ? { system: ICD10, code: map.zcode } : { system: ICD10, code: '' };
  const payload: SdohObservationPayload = {
    responseRef: observationRef,
    domain: map.domain,
    zCode,
    positive,
    provenance: 'screening-recorded',
  };
  return {
    domain: 'sdoh',
    memberId,
    resourceType: 'Observation',
    fhirResourceId: observationRef,
    eventType: 'sdoh.screening.recorded',
    tier: 'T1',
    idempotencyKey: `sdoh:obs:${obsId}`,
    provenance: 'screening-recorded',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: effectiveDateTime
      ? `${effectiveDateTime}T00:00:00Z`
      : new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The SDOH-screening FHIR-JSON batch adapter (social-history Observation -> sdoh). */
export const sdohObservationAdapter: DomainAdapter<ObsResource> = {
  source: SOURCE,
  domain: 'sdoh',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
