/**
 * Deterministic CQL generation — emits defines/thresholds for exactly the coded rules given,
 * a valid library header, and a documentation-gated roll-up when nothing is computable.
 */
import { describe, it, expect } from 'vitest';
import { buildCql } from '@/lib/policy/dtr/cql';

describe('buildCql', () => {
  it('emits BMI + comorbidity band + age rules and a combined roll-up', () => {
    const cql = buildCql({
      libraryName: 'Horizon Bariatric',
      comorbidityValueSetUrl: 'urn:rhtp:vs:comorbidities',
      bmi: { threshold: 40, bandWithComorbidity: { lower: 35, upper: 40 } },
      minAge: 18,
    });
    expect(cql).toContain("library HorizonBariatric version '0.1.0'");
    expect(cql).toContain('valueset "Qualifying Comorbidities": \'urn:rhtp:vs:comorbidities\'');
    expect(cql).toContain('define "BMIValue"');
    expect(cql).toContain('"BMIValue" >= 40');
    expect(cql).toContain('"BMIValue" >= 35 and "BMIValue" < 40');
    expect(cql).toContain('"HasQualifyingComorbidity"');
    expect(cql).toContain('define "MeetsAge": "Age" >= 18');
    expect(cql).toContain('define "MeetsCodedCriteria": "MeetsAge" and "MeetsObesity"');
  });

  it('BMI threshold alone (no band) omits the comorbidity clause', () => {
    const cql = buildCql({ libraryName: 'X', bmi: { threshold: 40 } });
    expect(cql).toContain('define "MeetsObesity": "BMIValue" >= 40');
    expect(cql).not.toContain('Qualifying Comorbidities');
  });

  it('with no computable rules, the roll-up is documentation-gated (null)', () => {
    const cql = buildCql({ libraryName: 'Empty' });
    expect(cql).toContain('define "MeetsCodedCriteria": null');
  });

  it('sanitizes a digit-starting library name to a valid identifier', () => {
    expect(buildCql({ libraryName: '2024 Policy' })).toMatch(
      /library Lib2024Policy|library Q?2024/
    );
    expect(buildCql({ libraryName: '2024 Policy' }).startsWith('library ')).toBe(true);
    // the identifier must start with a letter
    const first = buildCql({ libraryName: '2024 Policy' }).split(' ')[1];
    expect(first).toMatch(/^[A-Za-z]/);
  });
});
