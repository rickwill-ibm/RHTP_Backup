/**
 * Dimension registry matrix — payer-AGNOSTIC coverage of the clinical dimension × unit × operator
 * space. Proves the encoder is not tuned to one document: age / BMI / BP / weight (kg & lb) / height /
 * HbA1c (% & mmol/mol) / glucose (mg/dL & mmol/L) / eGFR / lipids / LVEF / stenosis / tumor size all
 * parse with the VERBATIM operator, the right field, and a unit drawn only from that field's registry.
 *
 * Lenses: verbatim-operators (spec §1.3), precision-not-recall, no-silent-degradation.
 */
import { describe, it, expect } from 'vitest';
import { parseScalarMeasure, parseMeasures } from '@/lib/policy/encode/measure';
import { FIELD_REGISTRY, normalizeNumerals } from '@/lib/policy/encode/dimensions';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing measure fixture');
  return v;
}

interface Row {
  text: string;
  field: string;
  op: string;
  value: number;
  unit?: string;
}

const MATRIX: Row[] = [
  {
    text: 'The member is at least 18 years of age',
    field: 'age',
    op: '>=',
    value: 18,
    unit: 'years',
  },
  { text: 'A BMI greater than 40 kg/m²', field: 'bmi', op: '>', value: 40, unit: 'kg/m²' },
  { text: 'A BMI of 40 or greater', field: 'bmi', op: '>=', value: 40, unit: 'kg/m²' },
  {
    text: 'systolic blood pressure over 140 mmHg',
    field: 'systolicBP',
    op: '>',
    value: 140,
    unit: 'mmHg',
  },
  {
    text: 'diastolic pressure at least 90 mmHg',
    field: 'diastolicBP',
    op: '>=',
    value: 90,
    unit: 'mmHg',
  },
  { text: 'body weight greater than 100 kg', field: 'weight', op: '>', value: 100, unit: 'kg' },
  { text: 'body weight exceeding 250 lb', field: 'weight', op: '>', value: 250, unit: 'lb' },
  { text: 'height less than 150 cm', field: 'height', op: '<', value: 150, unit: 'cm' },
  {
    text: 'HbA1c greater than or equal to 7.0%',
    field: 'hba1c',
    op: '>=',
    value: 7,
    unit: '%',
  },
  {
    text: 'HbA1c of 53 mmol/mol or greater',
    field: 'hba1c',
    op: '>=',
    value: 53,
    unit: 'mmol/mol',
  },
  {
    text: 'fasting glucose greater than 126 mg/dL',
    field: 'glucose',
    op: '>',
    value: 126,
    unit: 'mg/dL',
  },
  {
    text: 'fasting glucose greater than 7 mmol/L',
    field: 'glucose',
    op: '>',
    value: 7,
    unit: 'mmol/L',
  },
  {
    text: 'eGFR less than 30 mL/min/1.73m²',
    field: 'egfr',
    op: '<',
    value: 30,
    unit: 'mL/min/1.73m²',
  },
  { text: 'LDL greater than 190 mg/dL', field: 'ldl', op: '>', value: 190, unit: 'mg/dL' },
  {
    text: 'triglycerides above 500 mg/dL',
    field: 'triglycerides',
    op: '>',
    value: 500,
    unit: 'mg/dL',
  },
  {
    text: 'left ventricular ejection fraction (LVEF) less than or equal to 35%',
    field: 'lvef',
    op: '<=',
    value: 35,
    unit: '%',
  },
  { text: 'carotid stenosis greater than 70%', field: 'stenosis', op: '>', value: 70, unit: '%' },
  { text: 'tumor size greater than 2 cm', field: 'tumorSize', op: '>', value: 2, unit: 'cm' },
];

describe('dimension × unit × operator matrix', () => {
  for (const row of MATRIX) {
    it(`${row.text} ⇒ ${row.field} ${row.op} ${row.value}${row.unit ? ' ' + row.unit : ''}`, () => {
      const m = req(parseScalarMeasure(row.text));
      expect(m.field).toBe(row.field);
      expect(m.operator).toBe(row.op);
      expect(m.value).toBe(row.value);
      if (row.unit) expect(m.unit).toBe(row.unit);
    });
  }
});

describe('the registry is payer-agnostic and internally consistent', () => {
  it('contains no payer names in any field/label/unit', () => {
    const payer = /aetna|cigna|united|uhc|elevance|anthem|humana|kaiser|horizon|bcbs/i;
    for (const f of FIELD_REGISTRY) {
      expect(payer.test(f.field)).toBe(false);
      expect(payer.test(f.label)).toBe(false);
      for (const u of f.units) expect(payer.test(u.canonical)).toBe(false);
    }
  });

  it('every measure-owner field has at least one unit or is explicitly dimensionless', () => {
    for (const f of FIELD_REGISTRY) {
      if (f.owner !== 'measure') continue;
      expect(f.units.length > 0 || f.dimensionless === true).toBe(true);
    }
  });

  it('singleUnit fields default their sole unit when the token is absent', () => {
    // BMI is singleUnit (kg/m²) — a bare "BMI over 40" still resolves the unit.
    const m = req(parseScalarMeasure('BMI over 40'));
    expect(m.field).toBe('bmi');
    expect(m.unit).toBe('kg/m²');
  });

  it('multi-unit fields require a unit token — absent ⇒ measure + review reason (never a guess)', () => {
    const { measures, reviewReasons } = parseMeasures('body weight greater than 100');
    expect(measures).toHaveLength(1);
    expect(measures[0].unit).toBeUndefined();
    expect(reviewReasons.join(' ')).toMatch(/unit required/i);
  });
});

describe('normalizeNumerals (word → digit, articles preserved)', () => {
  it('converts numerals but never the articles a/an', () => {
    expect(normalizeNumerals('at least three months')).toBe('at least 3 months');
    expect(normalizeNumerals('an obese member')).toBe('an obese member'); // article, not a numeral
    expect(normalizeNumerals('twenty sessions')).toBe('20 sessions');
  });

  it('covers tens and hyphenated compounds beyond twenty', () => {
    expect(normalizeNumerals('a BMI of forty')).toBe('a BMI of 40');
    expect(normalizeNumerals('ninety percent')).toBe('90 percent');
    expect(normalizeNumerals('forty-five')).toBe('45');
    expect(normalizeNumerals('ninety-five')).toBe('95');
  });
});
