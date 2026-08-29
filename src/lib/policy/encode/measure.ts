/**
 * E1 — measure / threshold encoder (RHTP Policy Engine, encoding layer).
 *
 * Parses quantitative thresholds from a criterion's own words into typed `Measure`s, preserving the
 * VERBATIM operator (`>` ≠ `≥`) and explicit endpoint inclusivity for ranges. It is payer-AGNOSTIC
 * and dimension-driven: every clinical dimension it recognizes lives in `FIELD_REGISTRY`, so the same
 * scanner handles age / BMI / BP / weight / HbA1c / eGFR / lipids / LVEF / stenosis / tumor size … .
 *
 * Fail-safe, never a guess (spec §1.3, F1/F6/F7):
 *   - a number resolves its FIELD from the whole sentence/clause scope (the noun may be 60–120 chars
 *     away, across appositive commas), and its UNIT from a tight local window;
 *   - a number with no clinical noun in scope yields NO measure (never a fieldless "Value > N");
 *   - a multi-unit field with no unit token yields a measure + a review reason (unit required);
 *   - an out-of-range value yields NO measure + a review reason (never a silent drop);
 *   - a range/band is ONE measure, never shattered into two single-bound thresholds.
 *
 * Compound blood pressure ("… systolic and/or … diastolic despite N agents", or a "140/90" pair) is
 * modeled as `kind:'compound'` with sub-measures and a therapy qualifier (spec F2/F10).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E1), §1.3, §1.7.
 */
import type { Measure } from './ir';
import type { FieldSpec } from './dimensions';
import {
  FIELD_REGISTRY,
  nearestFieldInScope,
  normalizeNumerals,
  resolveUnitAndRange,
} from './dimensions';
import { scanComparators } from './measureScan';

const POLARITY_RE = /\bnot\s+(?:medically\s+)?necessary\b|\bdenied\b|\bunless\b|\bexcept\b/i;
const UNIT_WINDOW = 18;

// A number whose IMMEDIATELY-following unit token belongs to a time/therapy dimension (days/weeks/
// months/years/sessions/visits/treatments/agents) is NOT a scalar clinical measure — even when the
// nearest clinical noun is a measure field. This kills phantom same-field measures like "30 days"
// resolving to a bmi threshold. (defect 2a)
const FOREIGN_UNIT_RE =
  /^[\s,;:]*(days?|weeks?|months?|years?|sessions?|visits?|treatments?|agents?|medications?|drugs?)\b/i;

// A numeric threshold cue expressed in vague words we cannot resolve to a value ⇒ flag, never drop. (defect 4)
const VAGUE_NUMERAL_RE =
  /(?:greater than|less than|more than|fewer than|at least|at most|no more than|no less than|minimum of|maximum of|≥|≤|>=|<=)\s+(?:a\s+|an\s+)?(?:several|multiple|many|numerous|few|dozens?|scores?)\b/i;

/** True when the token IMMEDIATELY after a hit is a time/therapy unit that is NOT a unit of `spec`. */
function coLocatedForeignUnit(scope: string, hitEnd: number, spec: FieldSpec): boolean {
  const m = FOREIGN_UNIT_RE.exec(scope.slice(hitEnd, hitEnd + 16));
  if (!m) return false;
  const canon = m[1].toLowerCase().replace(/s$/, '') + 's';
  return !spec.units.some((u) => u.canonical === canon);
}

export interface MeasuresResult {
  measures: Measure[];
  reviewReasons: string[];
}

/**
 * Parse every scalar threshold in a clause. May return MULTIPLE measures (e.g. age + BMI in one
 * criterion); bands are ONE measure. Returns the measures plus any review reasons (unit-required,
 * out-of-range) the caller must surface — never dropped, never guessed.
 */
export function parseMeasures(text: string): MeasuresResult {
  const scope = normalizeNumerals(text);
  const negated = POLARITY_RE.test(scope);
  const measures: Measure[] = [];
  const reviewReasons: string[] = [];

  for (const hit of scanComparators(scope)) {
    const spec = nearestFieldInScope(scope, hit.start, hit.end);
    // No clinical noun anywhere in scope ⇒ no measure (never a fieldless threshold).
    if (!spec) continue;
    // Time-window / therapy dimensions are owned by their own encoders, not a scalar Measure.
    if (spec.owner !== 'measure') continue;
    // A time/therapy unit sitting right after the number (e.g. "30 days") means this number belongs
    // to that dimension, not to the nearest measure noun ⇒ no scalar measure. (defect 2a)
    if (coLocatedForeignUnit(scope, hit.end, spec)) continue;

    const window = scope.slice(hit.start, Math.min(scope.length, hit.end + UNIT_WINDOW));
    const res = resolveUnitAndRange(spec, window, hit.value, hit.value2);
    // Out of plausible range ⇒ do NOT emit; flag for review (possible OCR / unit error).
    if (!res.inRange) {
      if (res.reviewReason) reviewReasons.push(res.reviewReason);
      continue;
    }

    const measure: Measure = {
      kind: 'scalar',
      field: spec.field,
      operator: hit.operator,
      value: hit.value,
      sourceSpan: { start: hit.start, end: hit.end },
    };
    if (hit.value2 !== undefined) measure.value2 = hit.value2;
    if (hit.isRange) {
      measure.inclusiveLow = hit.inclusiveLow;
      measure.inclusiveHigh = hit.inclusiveHigh;
    }
    if (res.unit !== undefined) measure.unit = res.unit;
    if (negated) measure.negatedLocally = true;
    // Unit required but absent (multi-unit) ⇒ emit with unit undefined AND flag.
    if (res.reviewReason) reviewReasons.push(res.reviewReason);
    measures.push(measure);
  }

  // Dedupe same-field measures within one criterion: keep the first (primary), drop later ones. This
  // removes a variant value double-counted as a standalone threshold ("BMI ≥ 40 (or ≥ 37.5 …)"). (defect 2b)
  const seen = new Set<string>();
  const deduped: Measure[] = [];
  for (const m of measures) {
    const key = m.field ?? '';
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(m);
  }

  // A numeric threshold expressed in vague words we cannot resolve ⇒ flag, never silently drop. (defect 4)
  if (VAGUE_NUMERAL_RE.test(scope)) {
    reviewReasons.push(
      'numeric threshold expressed in vague words (e.g. "several"/"multiple") — exact value required; verify'
    );
  }

  return { measures: deduped, reviewReasons };
}

/** Detect the first BP comparator cue and its operator. Returns undefined when no cue is present. */
function bpOperator(text: string): Measure['operator'] | undefined {
  if (/greater than or equal to|≥|>=|at least|no less than|minimum/i.test(text)) return '>=';
  if (/greater than|exceeding|above|over|>/i.test(text)) return '>';
  if (/less than or equal to|≤|<=|no more than|at most/i.test(text)) return '<=';
  if (/less than|below|under|</i.test(text)) return '<';
  return undefined;
}

/** Gate one BP axis against its registry range; an out-of-range value pushes a review reason. */
function gateBPAxis(
  field: 'systolicBP' | 'diastolicBP',
  value: number,
  reviewReasons: string[]
): void {
  const spec = FIELD_REGISTRY.find((f) => f.field === field);
  if (!spec) return;
  const res = resolveUnitAndRange(spec, 'mmHg', value);
  if (!res.inRange && res.reviewReason) reviewReasons.push(res.reviewReason);
}

function bpTherapyQualifier(text: string): Measure['therapyQualifier'] | undefined {
  const agents =
    /(?:despite|on|concurrent use of)\s*(?:concurrent use of\s*)?(\d+)\s*(?:anti-?hypertensive\s*)?agents/i.exec(
      text
    );
  if (!agents) return undefined;
  return {
    drugClassCount: parseInt(agents[1], 10),
    distinctClasses: /different classes|of different classes|distinct/i.test(text),
  };
}

export interface CompoundResult {
  measure: Measure | null;
  reviewReasons: string[];
}

/**
 * Parse a compound blood-pressure measure, returning any review reasons. Handles the explicit
 * "systolic … N and/or diastolic … N" phrasing AND the "140/90" slash-pair. A bare pair with no
 * comparator cue ("BP 140/90") is a REVIEW FLAG, never a guessed threshold.
 */
export function parseCompoundBPDetailed(text: string): CompoundResult {
  const reviewReasons: string[] = [];
  if (!/blood pressure|hypertension|systolic|diastolic|mmhg|\bbp\b/i.test(text)) {
    return { measure: null, reviewReasons };
  }

  const sys = /(\d+(?:\.\d+)?)\s*mmhg\s*systolic|systolic\D{0,40}?(\d+(?:\.\d+)?)/i.exec(text);
  const dia = /(\d+(?:\.\d+)?)\s*mmhg\s*diastolic|diastolic\D{0,40}?(\d+(?:\.\d+)?)/i.exec(text);
  let sysVal = sys ? parseFloat(sys[1] ?? sys[2]) : undefined;
  let diaVal = dia ? parseFloat(dia[1] ?? dia[2]) : undefined;
  let op = bpOperator(text) ?? '>';

  // Slash-pair fallback ("140/90") when no explicit systolic/diastolic values were found.
  if (sysVal === undefined && diaVal === undefined) {
    const slash = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(text);
    if (slash) {
      const cue = bpOperator(text);
      if (!cue) {
        reviewReasons.push(
          'blood pressure "' +
            slash[1] +
            '/' +
            slash[2] +
            '" has no comparator — cannot tell whether it is a minimum threshold; verify'
        );
        return { measure: null, reviewReasons };
      }
      op = cue;
      sysVal = parseFloat(slash[1]);
      diaVal = parseFloat(slash[2]);
    }
  }
  if (sysVal === undefined && diaVal === undefined) return { measure: null, reviewReasons };

  // Route each axis through the SAME plausible-range gate the scalar path uses, so an absurd BP
  // (systolic > 300 / diastolic > 200) surfaces a review reason instead of encoding silently. (defect 3)
  if (sysVal !== undefined) gateBPAxis('systolicBP', sysVal, reviewReasons);
  if (diaVal !== undefined) gateBPAxis('diastolicBP', diaVal, reviewReasons);

  const subMeasures: Measure[] = [];
  if (sysVal !== undefined)
    subMeasures.push({
      kind: 'scalar',
      field: 'systolicBP',
      operator: op,
      value: sysVal,
      unit: 'mmHg',
    });
  if (diaVal !== undefined)
    subMeasures.push({
      kind: 'scalar',
      field: 'diastolicBP',
      operator: op,
      value: diaVal,
      unit: 'mmHg',
    });

  const measure: Measure = {
    kind: 'compound',
    field: 'bloodPressure',
    logic: /and\/or/i.test(text) ? 'any' : 'all',
    subMeasures,
  };
  const tq = bpTherapyQualifier(text);
  if (tq) measure.therapyQualifier = tq;
  return { measure, reviewReasons };
}

/** Compound BP shim (unchanged signature): the measure only. */
export function parseCompoundBP(text: string): Measure | null {
  return parseCompoundBPDetailed(text).measure;
}

/** Top-level detailed entry: compound BP first (as the sole measure), else scalar measures. */
export function parseMeasuresDetailed(text: string): MeasuresResult {
  const compound = parseCompoundBPDetailed(text);
  if (compound.measure)
    return { measures: [compound.measure], reviewReasons: compound.reviewReasons };
  const scalar = parseMeasures(text);
  return {
    measures: scalar.measures,
    reviewReasons: [...compound.reviewReasons, ...scalar.reviewReasons],
  };
}

/** All measures for a clause: compound BP as the sole measure if it matches, else scalar measures. */
export function encodeMeasures(text: string): Measure[] {
  return parseMeasuresDetailed(text).measures;
}

/** Shim (unchanged signature): the first scalar measure, or null. */
export function parseScalarMeasure(text: string): Measure | null {
  return parseMeasures(text).measures[0] ?? null;
}

/** Shim (unchanged signature): compound BP, else the first scalar measure, else null. */
export function encodeMeasure(text: string): Measure | null {
  return parseCompoundBP(text) ?? parseScalarMeasure(text);
}

// Re-exported so importers can reach the registry through the measure module too.
export { FIELD_REGISTRY };
