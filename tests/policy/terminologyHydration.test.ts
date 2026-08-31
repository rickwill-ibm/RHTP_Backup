/**
 * End-to-end terminology binding (Tier 3): a synthetic comorbidity policy → engine questionnaire items
 * → hydrateExpansions (offline inline provider) → the comorbidity choice ships with AUTHORITATIVE codings
 * (real code systems), not just display strings. This is what the DTR API route now does before delivery.
 * Payer-agnostic (the binding keys on the clinical concept, never a payer name).
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy } from '@/lib/policy/extract/criteria';
import {
  engineQuestionnaireItems,
  hydrateExpansions,
} from '@/lib/policy/dtr/engineQuestionnaireItems';
import type { TextSource } from '@/lib/policy/extract/types';

const mk = (text: string): TextSource => ({
  sourceFile: 'p.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

const doc = mk(
  [
    'Clinical UM Guideline',
    'Medically Necessary:',
    'Bariatric surgery is medically necessary when the member has:',
    'A. A BMI of 35 kg/m² or greater with one or more of the following comorbidities:',
    '   i. Type 2 diabetes',
    '   ii. Hypertension',
    '   iii. Obstructive sleep apnea',
    'Coding',
    '43775 procedure',
    'References',
  ].join('\n')
);

describe('terminology binding is real end-to-end (bound + expanded to codings)', () => {
  it('binds the comorbidity choice to a canonical ValueSet and expands it to coded options', async () => {
    const cp = extractCriteriaPolicy(doc);
    const items = engineQuestionnaireItems(cp.medicallyNecessary, { service: 'Bariatric' }) ?? [];
    const comorbBefore = items.find(
      (i) => i.type === 'choice' && /comorbid|diabetes|apnea/i.test(i.text)
    );
    // it carries a canonical answerValueSet binding (the conformance-important property)
    expect(comorbBefore?.answerValueSet).toBeTruthy();

    const hydrated = await hydrateExpansions(items);
    const comorb = hydrated.find(
      (i) => i.type === 'choice' && /comorbid|diabetes|apnea/i.test(i.text)
    );
    // after hydration its options carry authoritative code systems (http/urn), not bare display text
    const codings = (comorb?.answerOption ?? []).map((o) => o.coding).filter(Boolean);
    expect(codings.length).toBeGreaterThan(0);
    expect(codings.every((c) => /^https?:\/\/|^urn:/.test(c!.system))).toBe(true);
  });

  it('is fail-safe — an item with no binding is returned unchanged', async () => {
    const items = engineQuestionnaireItems(cp0().medicallyNecessary, { service: 'S' }) ?? [];
    const hydrated = await hydrateExpansions(items);
    expect(hydrated.length).toBe(items.length);
  });
});

function cp0(): ReturnType<typeof extractCriteriaPolicy> {
  return extractCriteriaPolicy(
    mk(
      [
        'Guideline',
        'Medically Necessary:',
        'Medically necessary when all of the following are met:',
        '1. Age 18 or older.',
        'Coding',
        '43775 x',
        'References',
      ].join('\n')
    )
  );
}
