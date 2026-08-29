/**
 * Clinical dimension registry (RHTP Policy Engine, encoding layer).
 *
 * A single, extensible, payer-AGNOSTIC table describing every quantitative clinical dimension the
 * encoder recognizes: the clinical NOUN (synonyms/abbreviations + common OCR variants — NEVER the
 * unit), the units that may legally attach to that noun, whether a sole unit may DEFAULT, and a
 * unit-aware plausible range that FLAGS (never silently drops) an out-of-range value.
 *
 * Nothing here guesses: an ambiguous unit or an out-of-range value produces a REVIEW reason, and a
 * number with no clinical noun in scope produces NO measure at all (never a fieldless "Value > N").
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E1), §1.3, §1.7.
 */
import type { MeasureOperator } from './ir';

export type DimensionOwner = 'measure' | 'timeWindow' | 'therapy';

export interface UnitSpec {
  canonical: string;
  re: RegExp;
  /** Optional unit-specific plausible range (e.g. HbA1c 3–20 % vs 10–200 mmol/mol). */
  min?: number;
  max?: number;
}

export interface FieldSpec {
  field: string;
  label: string;
  owner: DimensionOwner;
  /** The clinical NOUN / synonyms / abbreviations + common OCR variants. NEVER the unit. */
  detect: RegExp;
  /** ONLY these units may attach to this field. */
  units: UnitSpec[];
  /** true ⇒ the sole unit may DEFAULT when the token is absent; false ⇒ unit REQUIRED or review. */
  singleUnit: boolean;
  dimensionless?: boolean;
  /** Unit-aware plausible bound that FLAGS, never silently filters. */
  min: number;
  max: number;
  legalOps: MeasureOperator[];
}

const SCALAR_OPS: MeasureOperator[] = ['>=', '<=', '>', '<', 'between', '=', '!='];
const MGDL: UnitSpec = { canonical: 'mg/dL', re: /mg\s*\/\s*dl/i, min: 1, max: 1000 };
const MMOLL: UnitSpec = { canonical: 'mmol/L', re: /mmol\s*\/\s*l(?![a-z])/i, min: 0.1, max: 60 };
const LIPID_UNITS: UnitSpec[] = [MGDL, MMOLL];

/** The extensible registry. Order matters only for tie-broken nearest-noun resolution (stable). */
export const FIELD_REGISTRY: FieldSpec[] = [
  {
    field: 'age',
    label: 'Age',
    owner: 'measure',
    detect: /\bage\b|years?\s+of\s+age|years?\s+old/i,
    units: [
      { canonical: 'years', re: /\byears?\b|\byrs?\b/i, min: 0, max: 130 },
      { canonical: 'months', re: /\bmonths?\b|\bmos?\b/i, min: 0, max: 1560 },
    ],
    singleUnit: false,
    min: 0,
    max: 130,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'bmi',
    label: 'BMI',
    owner: 'measure',
    detect: /\bbmi\b|body\s+mass\s+index|\bbm\/?i\b/i,
    units: [{ canonical: 'kg/m²', re: /kg\s*\/\s*m²|kg\s*\/\s*m2|kg\s*per\s*m2/i }],
    singleUnit: true,
    min: 8,
    max: 100,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'systolicBP',
    label: 'Systolic BP',
    owner: 'measure',
    detect: /systolic/i,
    units: [{ canonical: 'mmHg', re: /mmhg/i }],
    singleUnit: true,
    min: 40,
    max: 300,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'diastolicBP',
    label: 'Diastolic BP',
    owner: 'measure',
    detect: /diastolic/i,
    units: [{ canonical: 'mmHg', re: /mmhg/i }],
    singleUnit: true,
    min: 20,
    max: 200,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'weight',
    label: 'Weight',
    owner: 'measure',
    detect: /\bweight\b|body\s+weight/i,
    units: [
      { canonical: 'kg', re: /\bkg\b|kilograms?/i, min: 0.5, max: 700 },
      { canonical: 'lb', re: /\blbs?\b|pounds?/i, min: 1, max: 1500 },
    ],
    singleUnit: false,
    min: 0.5,
    max: 1500,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'height',
    label: 'Height',
    owner: 'measure',
    detect: /\bheight\b/i,
    units: [
      { canonical: 'cm', re: /\bcm\b|centimet(?:er|re)s?/i, min: 20, max: 260 },
      { canonical: 'm', re: /\bm\b|met(?:er|re)s?/i, min: 0.3, max: 2.6 },
      { canonical: 'in', re: /\bin\b|inch(?:es)?|"/i, min: 8, max: 100 },
    ],
    singleUnit: false,
    min: 0.3,
    max: 260,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'hba1c',
    label: 'HbA1c',
    owner: 'measure',
    detect: /\bhba1c\b|\bhgba1c\b|\ba1c\b|glycated\s+h(?:a)?emoglobin/i,
    units: [
      { canonical: '%', re: /%|percent/i, min: 2, max: 20 },
      { canonical: 'mmol/mol', re: /mmol\s*\/\s*mol/i, min: 5, max: 220 },
    ],
    singleUnit: false,
    min: 2,
    max: 220,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'glucose',
    label: 'Glucose',
    owner: 'measure',
    detect: /\bglucose\b|blood\s+sugar/i,
    units: [
      { canonical: 'mg/dL', re: /mg\s*\/\s*dl/i, min: 10, max: 1500 },
      { canonical: 'mmol/L', re: /mmol\s*\/\s*l(?![a-z])/i, min: 0.5, max: 90 },
    ],
    singleUnit: false,
    min: 0.5,
    max: 1500,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'egfr',
    label: 'eGFR',
    owner: 'measure',
    detect: /\begfr\b|estimated\s+gfr|glomerular\s+filtration|creatinine\s+clearance/i,
    units: [{ canonical: 'mL/min/1.73m²', re: /ml\s*\/\s*min(?:\s*\/\s*1\.73\s*m[²2])?/i }],
    singleUnit: true,
    min: 1,
    max: 200,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'ldl',
    label: 'LDL',
    owner: 'measure',
    detect: /\bldl\b|ldl-?c/i,
    units: LIPID_UNITS,
    singleUnit: false,
    min: 0.1,
    max: 1000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'hdl',
    label: 'HDL',
    owner: 'measure',
    detect: /\bhdl\b|hdl-?c/i,
    units: LIPID_UNITS,
    singleUnit: false,
    min: 0.1,
    max: 1000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'totalCholesterol',
    label: 'Total cholesterol',
    owner: 'measure',
    detect: /total\s+cholesterol/i,
    units: LIPID_UNITS,
    singleUnit: false,
    min: 0.1,
    max: 1000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'triglycerides',
    label: 'Triglycerides',
    owner: 'measure',
    detect: /triglycerides?/i,
    units: LIPID_UNITS,
    singleUnit: false,
    min: 0.1,
    max: 3000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'lvef',
    label: 'LVEF',
    owner: 'measure',
    detect: /\blvef\b|ejection\s+fraction|\bef\b/i,
    units: [{ canonical: '%', re: /%|percent/i }],
    singleUnit: true,
    min: 5,
    max: 90,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'stenosis',
    label: 'Stenosis',
    owner: 'measure',
    detect: /stenosis/i,
    units: [{ canonical: '%', re: /%|percent/i }],
    singleUnit: true,
    min: 1,
    max: 100,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'tumorSize',
    label: 'Tumor size',
    owner: 'measure',
    detect: /tumou?r\s*size|tumou?r|lesion\s*size/i,
    units: [
      { canonical: 'cm', re: /\bcm\b/i, min: 0.1, max: 60 },
      { canonical: 'mm', re: /\bmm\b/i, min: 1, max: 600 },
    ],
    singleUnit: false,
    min: 0.1,
    max: 600,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'duration',
    label: 'Duration',
    owner: 'timeWindow',
    detect: /\bduration\b/i,
    units: [
      { canonical: 'months', re: /\bmonths?\b/i },
      { canonical: 'weeks', re: /\bweeks?\b/i },
      { canonical: 'days', re: /\bdays?\b/i },
      { canonical: 'years', re: /\byears?\b/i },
    ],
    singleUnit: false,
    min: 0,
    max: 1000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'sessions',
    label: 'Sessions',
    owner: 'timeWindow',
    detect: /\bsessions?\b|\bvisits?\b|\btreatments?\b/i,
    units: [],
    singleUnit: false,
    dimensionless: true,
    min: 0,
    max: 1000,
    legalOps: SCALAR_OPS,
  },
  {
    field: 'agents',
    label: 'Agents',
    owner: 'therapy',
    detect: /\bagents?\b|\bmedications?\b|\bdrugs?\b/i,
    units: [],
    singleUnit: false,
    dimensionless: true,
    min: 0,
    max: 100,
    legalOps: SCALAR_OPS,
  },
];

// Resolution helpers live in their own module to respect the per-file line cap; re-exported here so
// the registry's public surface stays a single import (`./dimensions`).
export {
  normalizeNumerals,
  nearestFieldInScope,
  resolveUnitAndRange,
  type UnitResolution,
} from './dimensionResolve';
