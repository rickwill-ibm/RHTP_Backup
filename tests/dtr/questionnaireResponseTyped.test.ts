/**
 * DTR typed Generate stage — item model, format guard, enableWhen gating, and the generator's
 * typed output. Proves the "any crap can be entered" free-text inputs are gone: the diagnosis
 * field is ICD-10-format-constrained and documentation is a real attachment upload.
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuestionnaireResponse,
  isItemActive,
  isItemAnswerValid,
  ICD10_RE,
  type QuestionnaireItemDef,
} from '@/lib/dtr/questionnaireResponse';
import { generateQuestionnaireFromPolicy } from '@/lib/goldenThread/dtrFromPolicy';
import type { NormalizedPolicy } from '@/lib/policy';

describe('ICD-10 format guard', () => {
  const dx: QuestionnaireItemDef = {
    linkId: 'supporting-diagnosis',
    text: 'dx',
    type: 'string',
    format: 'icd10',
    required: true,
  };

  it('accepts well-formed ICD-10-CM codes and rejects free-text "crap"', () => {
    for (const good of ['E66.01', 'E6601', 'M54.5', 'Z68.41', 'C50']) {
      expect(isItemAnswerValid(dx, good)).toBe(true);
      expect(ICD10_RE.test(good)).toBe(true);
    }
    for (const bad of ['definitely obese', '12345', 'abc', 'E', '.']) {
      expect(isItemAnswerValid(dx, bad)).toBe(false);
    }
    // empty is not "invalid" — required-ness is a separate check
    expect(isItemAnswerValid(dx, '')).toBe(true);
  });

  it('a malformed diagnosis blocks completion via the invalid list', () => {
    const items = [dx];
    const bad = buildQuestionnaireResponse({
      items,
      answers: { 'supporting-diagnosis': 'nope' },
      complete: true,
    });
    expect(bad.invalid).toEqual(['supporting-diagnosis']);
    expect(bad.response.status).toBe('in-progress');

    const good = buildQuestionnaireResponse({
      items,
      answers: { 'supporting-diagnosis': 'E66.01' },
      complete: true,
    });
    expect(good.invalid).toEqual([]);
    expect(good.response.status).toBe('completed');
  });
});

describe('answer modalities', () => {
  it('decimal → valueDecimal and attachment → valueAttachment', () => {
    const items: QuestionnaireItemDef[] = [
      { linkId: 'bmi', text: 'BMI', type: 'decimal' },
      { linkId: 'doc', text: 'Attach', type: 'attachment', required: true },
    ];
    const { response } = buildQuestionnaireResponse({
      items,
      answers: { bmi: 41.2, doc: 'chart-note.pdf' },
      complete: true,
    });
    expect(response.item.find((i) => i.linkId === 'bmi')?.answer?.[0].valueDecimal).toBe(41.2);
    expect(response.item.find((i) => i.linkId === 'doc')?.answer?.[0].valueAttachment?.title).toBe(
      'chart-note.pdf'
    );
  });
});

describe('enableWhen gating', () => {
  const items: QuestionnaireItemDef[] = [
    { linkId: 'met', text: 'Criterion met?', type: 'boolean' },
    {
      linkId: 'why-not',
      text: 'If not met, explain',
      type: 'string',
      required: true,
      enableWhen: [{ question: 'met', answerBoolean: false }],
    },
  ];

  it('a required item gated OFF is not reported missing', () => {
    const r = buildQuestionnaireResponse({ items, answers: { met: true }, complete: true });
    expect(isItemActive(items[1], { met: true })).toBe(false);
    expect(r.missingRequired).toEqual([]);
    expect(r.response.status).toBe('completed');
  });

  it('a required item gated ON and unanswered IS reported missing', () => {
    const r = buildQuestionnaireResponse({ items, answers: { met: false }, complete: true });
    expect(isItemActive(items[1], { met: false })).toBe(true);
    expect(r.missingRequired).toEqual(['why-not']);
    expect(r.response.status).toBe('in-progress');
  });
});

describe('generator emits typed, validated items (not free text)', () => {
  it('diagnosis is ICD-10-constrained and documentation is an attachment', () => {
    const policy: NormalizedPolicy = {
      policyId: 'demo-criteria',
      source: 'DemoPayer',
      sourceType: 'medical-clinical-policy-bulletin',
      title: 'Demo Surgery',
      category: 'Surgery',
      requiresPA: true,
      determinationBasis: 'medical-necessity-criteria',
      indications: [
        { label: 'A', title: 'Criterion A' },
        { label: 'B', title: 'Criterion B' },
      ],
    };
    const dtr = generateQuestionnaireFromPolicy(policy);

    const dx = dtr.item.find((i) => i.linkId === 'supporting-diagnosis');
    expect(dx?.type).toBe('string');
    expect(dx?.format).toBe('icd10');

    const doc = dtr.item.find((i) => i.linkId === 'clinical-documentation');
    expect(doc?.type).toBe('attachment');
    expect(doc?.required).toBe(true);
  });
});
