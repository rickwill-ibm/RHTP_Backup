/**
 * Comparator scanner (RHTP Policy Engine, encoding layer).
 *
 * Finds, left-to-right and with char spans, every quantitative comparator in a criterion clause —
 * range/band forms FIRST as ONE hit, then postfix ("N or greater") ATOMIC tokens, then prefix
 * comparators. Most-specific wins (an earlier, wider claim blocks a narrower one), an empty match can
 * never advance `lastIndex` into an infinite loop, and every hit carries a captured digit. It emits
 * OPERATOR + VALUE(S) + endpoint inclusivity ONLY — field and unit are resolved by the caller from
 * scope (spec §4 E1, §1.3).
 */
import type { MeasureOperator } from './ir';

export interface ComparatorHit {
  start: number;
  end: number;
  operator: MeasureOperator;
  value: number;
  value2?: number;
  inclusiveLow?: boolean;
  inclusiveHigh?: boolean;
  isRange: boolean;
}

const N = '(\\d+(?:\\.\\d+)?)';
const UNIT_GAP = '(?:kg\\/m²|kg\\/m2|%|mmhg|mmol\\/mol|mg\\/dl|mmol\\/l|cm|mm|years?)?';

interface RangeRule {
  re: RegExp;
  low: (m: RegExpExecArray) => number;
  high: (m: RegExpExecArray) => number;
  incLow?: boolean;
  incHigh: (m: RegExpExecArray) => boolean | undefined;
}

// Ranges, most-specific first. Each is ONE hit (never shattered into two single-bound thresholds).
const RANGE_RULES: RangeRule[] = [
  {
    // "≥35 and <40" two-comparator band ⇒ inclusive-low, exclusive-high.
    re: new RegExp(
      `(?:≥|>=|greater than or equal to|at least|no less than)\\s*${N}\\s*${UNIT_GAP}\\s+and\\s+(?:<|less than|below|under)\\s*${N}`,
      'gi'
    ),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[2]),
    incLow: true,
    incHigh: () => false,
  },
  {
    // "between X and Y" (endpoints English-ambiguous ⇒ undefined) / "between X and <Y".
    re: new RegExp(`between\\s+${N}\\s*${UNIT_GAP}\\s+and\\s+(<\\s*)?${N}`, 'gi'),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[3]),
    incLow: undefined,
    incHigh: (m) => (m[2] ? false : undefined),
  },
  {
    // "35 to <40" ⇒ inclusive-low, exclusive-high.
    re: new RegExp(`${N}\\s*to\\s*<\\s*${N}`, 'gi'),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[2]),
    incLow: true,
    incHigh: () => false,
  },
  {
    // "35 to 39.9" plain band (endpoints ambiguous ⇒ undefined).
    re: new RegExp(`${N}\\s*to\\s+${N}`, 'gi'),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[2]),
    incLow: undefined,
    incHigh: () => undefined,
  },
  {
    // "35–40" / "35—40" en/em dash band.
    re: new RegExp(`${N}\\s*[–—]\\s*${N}`, 'gi'),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[2]),
    incLow: undefined,
    incHigh: () => undefined,
  },
  {
    // "35-40" hyphen band (tight, digits both sides).
    re: new RegExp(`${N}-${N}`, 'g'),
    low: (m) => parseFloat(m[1]),
    high: (m) => parseFloat(m[2]),
    incLow: undefined,
    incHigh: () => undefined,
  },
];

// Postfix ATOMIC token: "N (or older|greater|more|higher)" ⇒ >=. Tolerates an intervening unit/"of
// age" so "18 years of age or older" is captured. Never clamps a value inside the token.
const POSTFIX_RE = new RegExp(
  `${N}\\s*(?:[a-z%\\/²]+(?:\\s+of\\s+age|\\s+old)?\\s*)?(?:or\\s+(?:greater|older|more|higher))(?!\\s+than)`,
  'gi'
);

interface PrefixRule {
  re: RegExp;
  op: MeasureOperator;
}

// Prefix comparators, most-specific operator first so "greater than or equal to" is not shadowed.
const PREFIX_RULES: PrefixRule[] = [
  {
    re: new RegExp(
      `(?:greater than or equal to|at least|no less than|minimum of|≥|>=)\\s*${N}`,
      'gi'
    ),
    op: '>=',
  },
  { re: new RegExp(`(?:less than or equal to|no more than|at most|≤|<=)\\s*${N}`, 'gi'), op: '<=' },
  { re: new RegExp(`(?:greater than|exceeding|more than|above|over|>)\\s*${N}`, 'gi'), op: '>' },
  { re: new RegExp(`(?:less than|below|under|<)\\s*${N}`, 'gi'), op: '<' },
];

function overlaps(claimed: { s: number; e: number }[], s: number, e: number): boolean {
  return claimed.some((c) => s < c.e && e > c.s);
}

/** Scan a clause for comparator hits, resolving overlaps by specificity. Sorted by start. */
export function scanComparators(text: string): ComparatorHit[] {
  const hits: ComparatorHit[] = [];
  const claimed: { s: number; e: number }[] = [];

  const push = (h: ComparatorHit): void => {
    hits.push(h);
    claimed.push({ s: h.start, e: h.end });
  };

  for (const rule of RANGE_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      const start = m.index;
      const end = m.index + m[0].length;
      if (overlaps(claimed, start, end)) continue;
      push({
        start,
        end,
        operator: 'between',
        value: rule.low(m),
        value2: rule.high(m),
        inclusiveLow: rule.incLow,
        inclusiveHigh: rule.incHigh(m),
        isRange: true,
      });
    }
  }

  POSTFIX_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = POSTFIX_RE.exec(text)) !== null) {
    if (pm.index === POSTFIX_RE.lastIndex) POSTFIX_RE.lastIndex++;
    const start = pm.index;
    const end = pm.index + pm[0].length;
    if (overlaps(claimed, start, end)) continue;
    push({ start, end, operator: '>=', value: parseFloat(pm[1]), isRange: false });
  }

  for (const rule of PREFIX_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      const start = m.index;
      const end = m.index + m[0].length;
      if (overlaps(claimed, start, end)) continue;
      push({ start, end, operator: rule.op, value: parseFloat(m[1]), isRange: false });
    }
  }

  return hits.sort((a, b) => a.start - b.start);
}
