/**
 * DTR pathway sections: when a policy states MORE THAN ONE medical-necessity determination, the
 * generated questionnaire must separate them with a titled `display` section header per determination
 * — so legitimately-repeated items (a second pathway's BMI/comorbidity/documentation) read as a
 * distinct section, not duplicated questions. A single-determination policy stays header-free.
 */
import { describe, it, expect } from 'vitest';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const group = (heading: string): CriteriaGroup => ({
  heading,
  logic: 'all',
  criteria: [
    { label: 'A', text: 'The individual is age 18 years or older', children: [] },
    { label: 'B', text: 'A body mass index (BMI) of 40 or greater', children: [] },
  ],
});

describe('DTR determination sections', () => {
  it('emits one titled display header per determination when there are 2+', () => {
    const items =
      engineQuestionnaireItems(
        [
          group(
            'Initial surgery is considered medically necessary when all of the following are met:'
          ),
          group(
            'Surgical revision is considered medically necessary when all of the following are met:'
          ),
        ],
        { service: 'Bariatric Surgery' }
      ) ?? [];
    const headers = items.filter((i) => i.type === 'display');
    expect(headers.length).toBe(2);
    expect(headers[0].text).toMatch(/Initial surgery/i);
    expect(headers[1].text).toMatch(/Surgical revision/i);
    // headers are non-answerable: no required flag, no answerValueSet
    expect(headers.every((h) => !h.required && !h.answerValueSet)).toBe(true);
    // the trailing colon is trimmed from the heading
    expect(headers.every((h) => !/[:]\s*$/.test(h.text))).toBe(true);
  });

  it('does NOT add a section header for a single determination', () => {
    const items =
      engineQuestionnaireItems(
        [group('Considered medically necessary when all of the following are met:')],
        {
          service: 'Bariatric Surgery',
        }
      ) ?? [];
    expect(items.some((i) => i.type === 'display')).toBe(false);
  });
});
