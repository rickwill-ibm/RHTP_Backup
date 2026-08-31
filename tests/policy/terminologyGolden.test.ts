/**
 * Golden corpus for the terminology-resolution layer (Phase 1, inline/offline).
 *
 * Asserts the whole seam against the INLINE provider only — deterministic, no VSAC key:
 *   concept signal → registry.resolve → canonical ValueSet URI → inline $expand → authoritative codings,
 * plus the safety properties (unconfident → unset; CPT/urn:rhtp never leaves inline; VSAC gated).
 */
import { describe, it, expect } from 'vitest';
import { defaultConceptRegistry } from '@/lib/policy/dtr/terminology/registry';
import {
  inlineExpansionProvider,
  isInlineOnlyUri,
  selectExpansionProvider,
  vsacConfigFromEnv,
} from '@/lib/policy/dtr/terminology/expansion';
import { vsacExpansionProvider, VsacNotConfiguredError } from '@/lib/policy/dtr/terminology/vsac';
import {
  ALL_VALUE_SETS,
  VS_ABLATION_CPT,
  VS_BY_URL,
  VS_CARDIAC_ARRHYTHMIA,
  VS_COMORBIDITY,
  VS_OBESITY_DX,
  VS_TOBACCO_STATUS,
  VS_YES_NO_UNKNOWN,
  SYSTEM,
} from '@/lib/policy/dtr/conformance/valueSets';
import {
  engineQuestionnaireItems,
  fhirItemsToDefs,
  hydrateExpansions,
} from '@/lib/policy/dtr/engineQuestionnaireItems';
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import type { CriteriaGroup } from '@/lib/policy/extract/criteria';

const R = defaultConceptRegistry;

describe('concept-binding registry — positive matches', () => {
  it('binds an obesity-related comorbidity list to the comorbidity ValueSet', () => {
    const b = R.resolve({
      text: 'One or more of the following obesity-related comorbidities',
      optionDisplays: ['Type 2 diabetes mellitus', 'Obstructive sleep apnea', 'Hypertension'],
    });
    expect(b?.valueSetUri).toBe(VS_COMORBIDITY.url);
  });

  it('binds a morbid-obesity diagnosis list to the obesity-diagnosis ValueSet', () => {
    const b = R.resolve({
      text: 'A qualifying morbid obesity diagnosis',
      optionDisplays: ['E66.01 morbid obesity', 'E66.2 morbid obesity with hypoventilation'],
    });
    expect(b?.valueSetUri).toBe(VS_OBESITY_DX.url);
  });

  it('binds a yes/no/unknown option set to the yes-no-unknown ValueSet', () => {
    const b = R.resolve({ text: 'Documented?', optionDisplays: ['Yes', 'No', 'Unknown'] });
    expect(b?.valueSetUri).toBe(VS_YES_NO_UNKNOWN.url);
  });
});

describe('concept-binding registry — safety: unconfident stays unset', () => {
  it('returns undefined for an unrelated concept (no guessing)', () => {
    expect(
      R.resolve({
        text: 'One or more of the following',
        optionDisplays: ['Physician-supervised diet', 'CPAP trial', 'Psychological evaluation'],
      })
    ).toBeUndefined();
  });

  it('returns undefined when two rules fire (ambiguous)', () => {
    // "morbid obesity" (diagnosis cue) AND "comorbidities" (comorbidity cue) → 2 matches → unset.
    expect(
      R.resolve({
        text: 'Morbid obesity with the following comorbidities',
        optionDisplays: ['Type 2 diabetes', 'Sleep apnea'],
      })
    ).toBeUndefined();
  });

  it('never binds to a URI outside the curated corpus', () => {
    const known = new Set(ALL_VALUE_SETS.map((v) => v.url));
    for (const t of ['obesity diagnosis', 'comorbidities: diabetes and hypertension', 'yes no']) {
      const b = R.resolve({ text: t, optionDisplays: ['Yes', 'No'] });
      if (b) expect(known.has(b.valueSetUri)).toBe(true);
    }
  });
});

describe('inline expansion provider', () => {
  it('expands every curated ValueSet to its authoritative codings', async () => {
    for (const vs of ALL_VALUE_SETS) {
      const ex = await inlineExpansionProvider.expand(vs.url);
      expect(ex?.url).toBe(vs.url);
      expect(ex?.codings.map((c) => c.code)).toEqual(vs.concepts.map((c) => c.code));
      for (const c of ex?.codings ?? []) expect(c.system).toMatch(/^https?:\/\/|^urn:/);
    }
  });

  it('returns undefined for an unknown URI', async () => {
    expect(
      await inlineExpansionProvider.expand('urn:rhtp:dtr/ValueSet/does-not-exist')
    ).toBeUndefined();
  });

  it('exposes every curated ValueSet through VS_BY_URL', () => {
    for (const vs of ALL_VALUE_SETS) expect(VS_BY_URL[vs.url]).toBe(vs);
  });
});

describe('routing + selection (CPT / urn:rhtp never leaves inline)', () => {
  it('keeps all curated (urn:rhtp) URIs inline-only', () => {
    for (const vs of ALL_VALUE_SETS) expect(isInlineOnlyUri(vs.url)).toBe(true);
    expect(isInlineOnlyUri('http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1')).toBe(false);
  });

  it('selects inline when VSAC is not configured', () => {
    expect(vsacConfigFromEnv({}).configured).toBe(false);
    expect(selectExpansionProvider(vsacConfigFromEnv({})).provider.id).toBe('inline');
  });

  it('even when VSAC IS configured, a urn:rhtp ValueSet still expands inline (never to VSAC)', async () => {
    const cfg = vsacConfigFromEnv({
      VSAC_ENDPOINT: 'https://cts.nlm.nih.gov/fhir',
      VSAC_API_KEY: 'x',
    });
    expect(cfg.configured).toBe(true);
    const { provider } = selectExpansionProvider(cfg);
    const ex = await provider.expand(VS_COMORBIDITY.url);
    expect(ex?.codings.length).toBe(VS_COMORBIDITY.concepts.length); // inline data, no network
  });
});

describe('VSAC provider is gated (inert offline)', () => {
  it('throws VsacNotConfiguredError rather than reaching the network', async () => {
    await expect(vsacExpansionProvider.expand('http://x/ValueSet/y')).rejects.toBeInstanceOf(
      VsacNotConfiguredError
    );
  });
});

describe('hydrateExpansions — opt-in, fail-safe', () => {
  const bound: QuestionnaireItemDef = {
    linkId: 'c1',
    text: 'Comorbidity',
    type: 'choice',
    answerValueSet: VS_COMORBIDITY.url,
    answerOption: [{ value: 'x', label: 'placeholder' }],
  };
  const unbound: QuestionnaireItemDef = { linkId: 'm1', text: 'BMI', type: 'decimal' };

  it('replaces a bound item’s options with authoritative codings', async () => {
    const [hy] = await hydrateExpansions([bound], inlineExpansionProvider);
    expect(hy.answerOption?.map((o) => o.value)).toEqual(
      VS_COMORBIDITY.concepts.map((c) => c.code)
    );
    expect(hy.answerOption?.every((o) => !!o.coding?.system)).toBe(true);
  });

  it('leaves an unbound item untouched', async () => {
    const [hy] = await hydrateExpansions([unbound], inlineExpansionProvider);
    expect(hy).toEqual(unbound);
  });

  it('never blanks options when the ValueSet is unknown or the provider throws', async () => {
    const orphan: QuestionnaireItemDef = {
      ...bound,
      answerValueSet: 'urn:rhtp:dtr/ValueSet/missing',
    };
    const [inlineKept] = await hydrateExpansions([orphan], inlineExpansionProvider);
    expect(inlineKept.answerOption).toEqual(orphan.answerOption); // miss → intact
    const [gatedKept] = await hydrateExpansions([bound], vsacExpansionProvider);
    expect(gatedKept.answerOption).toEqual(bound.answerOption); // throw → intact
  });
});

describe('pipeline — a real comorbidity choice binds end-to-end', () => {
  const sections: CriteriaGroup[] = [
    {
      heading: 'considered medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        {
          label: 'A',
          text: 'One or more of the following obesity-related comorbidities',
          children: [
            { label: '1', text: 'Type 2 diabetes mellitus', children: [] },
            { label: '2', text: 'Obstructive sleep apnea', children: [] },
            { label: '3', text: 'Essential hypertension', children: [] },
          ],
        },
      ],
    },
  ];

  it('sets answerValueSet on the generated choice item (and nowhere else)', () => {
    const items = engineQuestionnaireItems(sections, { service: 'Bariatric Surgery' }) ?? [];
    const choice = items.find((i) => i.type === 'choice');
    expect(choice?.answerValueSet).toBe(VS_COMORBIDITY.url);
    // Non-choice items (e.g. the documentation attachment) never get a binding.
    expect(items.filter((i) => i.type !== 'choice').every((i) => !i.answerValueSet)).toBe(true);
  });

  it('fhirItemsToDefs is a pure sync projection (returns an array, not a Promise)', () => {
    const r = fhirItemsToDefs([]);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('cross-domain / cross-payer generality (Aetna cardiac, tobacco)', () => {
  it('binds a cardiac arrhythmia list — a NEW payer + specialty — off arrhythmia terms', () => {
    const b = R.resolve({
      text: 'One or more of the following qualifying arrhythmias',
      optionDisplays: ['Paroxysmal atrial fibrillation', 'Typical atrial flutter', 'AVNRT'],
    });
    expect(b?.valueSetUri).toBe(VS_CARDIAC_ARRHYTHMIA.url);
  });

  it('a realistic "catheter ablation for the following arrhythmias" heading still binds (no ablation-rule collision)', () => {
    const b = R.resolve({
      text: 'Catheter ablation is medically necessary for one or more of the following arrhythmias',
      optionDisplays: ['Atrial fibrillation', 'Supraventricular tachycardia'],
    });
    expect(b?.valueSetUri).toBe(VS_CARDIAC_ARRHYTHMIA.url);
  });

  it('binds a tobacco-status option set (cross-cutting concept)', () => {
    const b = R.resolve({
      text: 'Tobacco use status',
      optionDisplays: ['Current every day smoker', 'Former smoker', 'Never smoked tobacco'],
    });
    expect(b?.valueSetUri).toBe(VS_TOBACCO_STATUS.url);
  });

  it('a cardiac concept never mis-binds to a metabolic value set (and vice versa)', () => {
    expect(
      R.resolve({ text: 'arrhythmias', optionDisplays: ['Atrial flutter'] })?.valueSetUri
    ).toBe(VS_CARDIAC_ARRHYTHMIA.url);
    expect(
      R.resolve({ text: 'obesity-related comorbidities', optionDisplays: ['Type 2 diabetes'] })
        ?.valueSetUri
    ).not.toBe(VS_CARDIAC_ARRHYTHMIA.url);
  });

  it('the ablation PROCEDURE (CPT) set is inline + expandable + never resolver-bound', async () => {
    // No resolver rule points at a procedure set — procedure-shaped options must NOT bind to it.
    expect(
      R.resolve({
        text: 'Select the ablation procedure performed',
        optionDisplays: ['Pulmonary vein isolation', 'AV node ablation'],
      })
    ).toBeUndefined();
    expect(isInlineOnlyUri(VS_ABLATION_CPT.url)).toBe(true);
    const ex = await inlineExpansionProvider.expand(VS_ABLATION_CPT.url);
    expect(ex?.codings.map((c) => c.code)).toContain('93656');
    expect(ex?.codings.every((c) => c.system === SYSTEM.cpt)).toBe(true);
    // Even with VSAC "configured", a CPT-bearing urn:rhtp set is served inline (never sent to VSAC).
    const cfg = vsacConfigFromEnv({
      VSAC_ENDPOINT: 'https://cts.nlm.nih.gov/fhir',
      VSAC_API_KEY: 'x',
    });
    const { provider } = selectExpansionProvider(cfg);
    const viaRouter = await provider.expand(VS_ABLATION_CPT.url);
    expect(viaRouter?.codings.length).toBe(VS_ABLATION_CPT.concepts.length);
  });

  it('the corpus spans multiple payers, domains, and code systems', () => {
    expect(ALL_VALUE_SETS.length).toBeGreaterThanOrEqual(6);
    const systems = new Set(ALL_VALUE_SETS.flatMap((v) => v.concepts.map((c) => c.system)));
    expect(systems.has(SYSTEM.icd10)).toBe(true);
    expect(systems.has(SYSTEM.snomed)).toBe(true);
    expect(systems.has(SYSTEM.cpt)).toBe(true);
  });
});

describe('pipeline generality — a clean cardiac (non-Horizon) policy binds end-to-end', () => {
  const cardiac: CriteriaGroup[] = [
    {
      heading: 'Cardiac catheter ablation is medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        {
          label: 'A',
          text: 'One or more of the following qualifying arrhythmias',
          children: [
            { label: '1', text: 'Paroxysmal atrial fibrillation', children: [] },
            { label: '2', text: 'Typical atrial flutter', children: [] },
            { label: '3', text: 'Supraventricular tachycardia', children: [] },
          ],
        },
      ],
    },
  ];

  it('the same engine + resolver bind a cardiac arrhythmia choice with zero payer-specific code', () => {
    const items = engineQuestionnaireItems(cardiac, { service: 'Cardiac Catheter Ablation' }) ?? [];
    const choice = items.find((i) => i.type === 'choice');
    expect(choice?.answerValueSet).toBe(VS_CARDIAC_ARRHYTHMIA.url);
    // and it did NOT collapse onto a metabolic/bariatric value set.
    expect(choice?.answerValueSet).not.toBe(VS_COMORBIDITY.url);
  });
});
