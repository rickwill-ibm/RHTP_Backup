/**
 * E0/E1 encoder tests — grounded in the canonical corpus lines the adversaries quoted.
 * Lenses: verbatim-operators (spec §1.3), precision-not-recall (prose ≠ criteria),
 * no-silent-degradation (unparsed ⇒ null, never a guess).
 */
import { describe, it, expect } from 'vitest';
import { repairGlyphs, detectLabelCollisions } from '@/lib/policy/encode/text';
import { encodeMeasure, parseScalarMeasure, parseCompoundBP } from '@/lib/policy/encode/measure';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing measure fixture');
  return v;
}

describe('E0 glyph repair (whitelisted, never guesses numbers/operators)', () => {
  it('repairs Horizon OCR label + concatenation artifacts', () => {
    expect(repairGlyphs('Ill. For members').repaired).toBe('III. For members');
    expect(repairGlyphs('I1.D.1').repaired).toBe('II.D.1');
    expect(repairGlyphs('not medically necessaryfor members').repaired).toBe(
      'not medically necessary for members'
    );
    expect(repairGlyphs('considered investigationaf.').repaired).toBe(
      'considered investigational.'
    );
    expect(repairGlyphs('BM/ greater than 40').repaired).toContain('BMI');
  });

  it('flags an unrecoverable operator glyph for review instead of guessing', () => {
    const r = repairGlyphs('BMI �35 with a comorbidity');
    expect(r.needsReview).toBe(true);
    expect(r.notes.some((n) => n.startsWith('REVIEW:'))).toBe(true);
  });

  it('flags colliding sibling labels (never de-duplicates)', () => {
    expect(detectLabelCollisions(['A.', 'A.', 'A.', 'A.'])).toEqual([{ label: 'A', count: 4 }]);
    expect(detectLabelCollisions(['i.', 'i.'])).toEqual([{ label: 'I', count: 2 }]);
    expect(detectLabelCollisions(['A.', 'B.', 'C.'])).toEqual([]);
  });
});

describe('E1 measure — verbatim operators (> ≠ ≥)', () => {
  it('Horizon ">40" is strict greater-than, not >=', () => {
    const m = req(parseScalarMeasure('A body mass index (BMI) greater than 40 kg/m²'));
    expect(m.operator).toBe('>');
    expect(m.value).toBe(40);
    expect(m.field).toBe('bmi');
    expect(m.unit).toBe('kg/m²');
  });

  it('Elevance "40 or greater" is >=', () => {
    const m = req(parseScalarMeasure('A BMI of 40 or greater'));
    expect(m.operator).toBe('>=');
    expect(m.value).toBe(40);
  });

  it('"at least 18 years of age" is an age measure >= 18 (never a boolean)', () => {
    const m = req(parseScalarMeasure('The member is at least 18 years of age'));
    expect(m.field).toBe('age');
    expect(m.operator).toBe('>=');
    expect(m.value).toBe(18);
    expect(m.unit).toBe('years');
  });

  it('Aetna adolescent "exceeding 40" is strict >', () => {
    const m = req(parseScalarMeasure('BMI exceeding 40'));
    expect(m.operator).toBe('>');
    expect(m.value).toBe(40);
  });

  it('Horizon "between 35 and 40" is a range with UNKNOWN endpoint inclusivity (⇒ review)', () => {
    const m = req(parseScalarMeasure('A BMI between 35 kg/m² and 40 kg/m²'));
    expect(m.operator).toBe('between');
    expect(m.value).toBe(35);
    expect(m.value2).toBe(40);
    expect(m.inclusiveLow).toBeUndefined();
    expect(m.inclusiveHigh).toBeUndefined();
  });

  it('Elevance "35 to <40" has explicit inclusive-low / exclusive-high endpoints', () => {
    const m = req(parseScalarMeasure('BMI 35 to <40'));
    expect(m.operator).toBe('between');
    expect(m.inclusiveLow).toBe(true);
    expect(m.inclusiveHigh).toBe(false);
  });
});

describe('E1 compound BP — systolic/diastolic OR, "despite N agents" preserved', () => {
  it('Horizon refractory HTN encodes as OR with a therapy qualifier', () => {
    const m = req(
      parseCompoundBP(
        'blood pressure greater than 140 mmHg systolic and/or 90 mmHg diastolic despite concurrent use of 3 anti-hypertensive agents of different classes'
      )
    );
    expect(m.kind).toBe('compound');
    expect(m.logic).toBe('any'); // and/or ⇒ OR
    expect((m.subMeasures ?? []).map((s) => s.field).sort()).toEqual(['diastolicBP', 'systolicBP']);
    expect(m.therapyQualifier?.drugClassCount).toBe(3);
    expect(m.therapyQualifier?.distinctClasses).toBe(true);
  });
});

describe('E1 no-silent-degradation', () => {
  it('returns null on prose with no threshold (caller keeps free-text + review)', () => {
    expect(encodeMeasure('The member has documented obesity of long standing duration')).toBeNull();
  });
});
