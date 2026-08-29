/**
 * Dimension resolution helpers (RHTP Policy Engine, encoding layer).
 *
 * The runtime behavior over the `FIELD_REGISTRY` table: word-numeral normalization, nearest-noun
 * FIELD resolution across a whole sentence/clause scope (appositive commas are NOT delimiters), and
 * unit-resolution + plausible-range gating. Kept in its own module so neither it nor the registry
 * table blows the per-file line cap. Fail-safe throughout — see `dimensions.ts`.
 */
import type { FieldSpec } from './dimensions';
import { FIELD_REGISTRY } from './dimensions';

const WORD_NUMERALS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};
const COMPOUND_RE = new RegExp(
  `\\b(${Object.keys(TENS).join('|')})[\\s-](${Object.keys(ONES).join('|')})\\b`,
  'gi'
);

/**
 * Word → digit, whole-word and case-insensitive: one..twenty, the round tens (thirty..ninety),
 * "hundred", and hyphenated/spaced compounds ("forty-five" → 45). Deliberately does NOT convert the
 * articles "a"/"an" (they are not numerals — "a BMI of 40" must stay "a BMI of 40").
 */
export function normalizeNumerals(text: string): string {
  const withCompounds = text.replace(COMPOUND_RE, (_m, tens: string, ones: string) =>
    String(TENS[tens.toLowerCase()] + ONES[ones.toLowerCase()])
  );
  return withCompounds.replace(/\b([a-z]+)\b/gi, (m) => {
    const digit = WORD_NUMERALS[m.toLowerCase()];
    return digit ?? m;
  });
}

/** A registry noun match found in a scope: which field, and where. */
interface NounHit {
  spec: FieldSpec;
  start: number;
  end: number;
}

function nounHits(scope: string): NounHit[] {
  const out: NounHit[] = [];
  for (const spec of FIELD_REGISTRY) {
    const re = new RegExp(
      spec.detect.source,
      spec.detect.flags.includes('g') ? spec.detect.flags : spec.detect.flags + 'g'
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(scope)) !== null) {
      out.push({ spec, start: m.index, end: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

/**
 * Resolve the FieldSpec whose detect-noun match is NEAREST (by character distance) to a number at
 * [numStart, numEnd] within `scope`. Appositive commas are NOT delimiters — the whole sentence/clause
 * is searched, so a noun 60–120 chars away (across "…, documented on two occasions, …") is still
 * found. Returns undefined when no clinical noun appears anywhere in scope (⇒ no measure).
 */
export function nearestFieldInScope(
  scope: string,
  numStart: number,
  numEnd: number
): FieldSpec | undefined {
  const hits = nounHits(scope);
  if (hits.length === 0) return undefined;
  let best: NounHit | undefined;
  let bestDist = Infinity;
  for (const h of hits) {
    const dist = h.end <= numStart ? numStart - h.end : h.start >= numEnd ? h.start - numEnd : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = h;
    }
  }
  return best?.spec;
}

export interface UnitResolution {
  unit?: string;
  /** true when the value passed the plausible-range gate; false ⇒ caller must NOT emit + flag. */
  inRange: boolean;
  /** a review reason, present when the unit is required-but-absent or the value is out of range. */
  reviewReason?: string;
}

/**
 * Resolve the unit from a TIGHT local window around the number and gate the value against the chosen
 * unit's (or field's) plausible range. Fail-closed: multi-unit with no token ⇒ unit undefined + a
 * review reason; a value outside the range ⇒ inRange:false + a review reason (never a silent drop).
 */
export function resolveUnitAndRange(
  spec: FieldSpec,
  window: string,
  value: number,
  value2?: number
): UnitResolution {
  if (spec.dimensionless) {
    return gateRange(spec, undefined, spec.min, spec.max, value, value2);
  }
  const found = spec.units.find((u) => u.re.test(window));
  if (found) {
    const min = found.min ?? spec.min;
    const max = found.max ?? spec.max;
    return gateRange(spec, found.canonical, min, max, value, value2);
  }
  if (spec.singleUnit && spec.units.length === 1) {
    const only = spec.units[0];
    return gateRange(
      spec,
      only.canonical,
      only.min ?? spec.min,
      only.max ?? spec.max,
      value,
      value2
    );
  }
  // Multi-unit and no unit token in the local window ⇒ unit required, cannot default (fail-closed).
  const gated = gateRange(spec, undefined, spec.min, spec.max, value, value2);
  const reason = `${spec.label} threshold has no explicit unit (one of ${spec.units
    .map((u) => u.canonical)
    .join(', ')}) — unit required for a safe determination`;
  return { unit: undefined, inRange: gated.inRange, reviewReason: gated.reviewReason ?? reason };
}

function gateRange(
  spec: FieldSpec,
  unit: string | undefined,
  min: number,
  max: number,
  value: number,
  value2?: number
): UnitResolution {
  const outOf = (v: number): boolean => v < min || v > max;
  if (outOf(value) || (value2 !== undefined && outOf(value2))) {
    return {
      unit,
      inRange: false,
      reviewReason: `${spec.label} value ${value2 !== undefined ? `${value}–${value2}` : value}${
        unit ? ` ${unit}` : ''
      } is outside the plausible range ${min}–${max} — verify (possible OCR / unit error)`,
    };
  }
  return { unit, inRange: true };
}
