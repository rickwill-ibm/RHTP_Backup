// Regression suite for the red-team findings on the WPC payer-dimensions change.
// Each test pins a specific defect the green suite did not exercise:
//   F1 (HIGH)  — a SNOMED-coded SUD Encounter/Flag must be RESTRICTED (42 CFR Part 2),
//                not disclosed because the SUD signal was SNOMED rather than ICD-10.
//   F2 (MED)   — the RAF parser must extract real RAF phrasings (of/:/comma) and return
//                null (not a phantom 0) when no RAF is present.
//   F3 (MED)   — an id-less payer resource must QUARANTINE (unkeyable), never silently
//                collide onto one graph node.
import { describe, it, expect } from 'vitest';
import {
  isSudCoding,
  encounterFhirAdapter,
  flagAdapter,
  coverageFhirAdapter,
  riskAssessmentAdapter,
  defaultPipelineDeps,
} from '@/lib/pipeline';

const deps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });
const SCT = 'http://snomed.info/sct';
const ICD = 'http://hl7.org/fhir/sid/icd-10-cm';
const bundle = (r: object) =>
  JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: r }] });
const hints = (adapter: typeof encounterFhirAdapter, r: object): string[] => {
  const raw = adapter.parse(bundle(r))[0];
  const rec = adapter.normalize(raw, deps);
  return (rec.payload.segmentationHints as string[] | undefined) ?? [];
};

describe('F1 — SNOMED-coded SUD content is recognized (no Part 2 leak by coding system)', () => {
  it('isSudCoding: SNOMED SUD concepts AND ICD-10 F10–F19 are SUD; non-SUD SNOMED is not', () => {
    expect(isSudCoding('191816009', SCT)).toBe(true); // opioid dependence (SNOMED)
    expect(isSudCoding('7200002', SCT)).toBe(true); // alcoholism (SNOMED)
    expect(isSudCoding('F10.20', ICD)).toBe(true); // ICD-10 alcohol
    expect(isSudCoding('185349003', SCT)).toBe(false); // check-up (SNOMED, not SUD)
    expect(isSudCoding('E11.9', ICD)).toBe(false); // diabetes (not SUD)
  });

  it('a SNOMED-SUD Encounter carries the part2-sud hint (would project RESTRICTED)', () => {
    const enc = {
      resourceType: 'Encounter',
      id: 'e-sud',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/p1' },
      type: [{ coding: [{ system: SCT, code: '191816009', display: 'Opioid dependence' }] }],
      period: { start: '2026-01-01' },
    };
    expect(hints(encounterFhirAdapter, enc)).toContain('part2-sud');
  });

  it('a non-SUD Encounter carries NO part2 hint (never over-restricted)', () => {
    const enc = {
      resourceType: 'Encounter',
      id: 'e-ok',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/p1' },
      type: [{ coding: [{ system: SCT, code: '185349003', display: 'Encounter for check up' }] }],
      period: { start: '2026-01-01' },
    };
    expect(hints(encounterFhirAdapter, enc)).not.toContain('part2-sud');
  });

  it('a SNOMED-SUD Flag carries the part2-sud hint', () => {
    const flag = {
      resourceType: 'Flag',
      id: 'f-sud',
      status: 'active',
      subject: { reference: 'Patient/p1' },
      category: [{ coding: [{ system: SCT, code: '7200002', display: 'Alcoholism' }] }],
      code: { text: 'alert' },
    };
    expect(hints(flagAdapter, flag)).toContain('part2-sud');
  });
});

describe('F2 — RAF parser is phrasing-tolerant and never fabricates a 0', () => {
  const raf = (rationale: string): number | null => {
    const r = {
      resourceType: 'RiskAssessment',
      id: 'ra1',
      subject: { reference: 'Patient/p1' },
      prediction: [{ outcome: { text: 'ER Visit' }, probabilityDecimal: 0.8, rationale }],
    };
    const raw = riskAssessmentAdapter.parse(bundle(r))[0];
    return riskAssessmentAdapter.normalize(raw, deps).payload.rafScore as number | null;
  };
  it.each([
    ['Predicted ER risk 84% based on RAF score 3.42 and profile', 3.42],
    ['estimated RAF score of 3.42', 3.42],
    ['RAF: 3.42', 3.42],
    ['RAF of 3.42', 3.42],
    ['RAF weight 3.42', 3.42],
    ['RAF score 3,42 (locale comma)', 3.42],
    ['RAF score 4', 4],
  ])('parses %s -> %d', (text, expected) => {
    expect(raf(text)).toBe(expected);
  });
  it('returns null (NOT 0) when no RAF is present', () => {
    expect(raf('High utilization risk based on clinical profile')).toBeNull();
    expect(raf('')).toBeNull();
  });
});

describe('F3 — id-less payer resources QUARANTINE (never silent node collision)', () => {
  const idless: Record<string, object> = {
    Coverage: {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: 'Patient/p1' },
      period: { start: '2026-01-01' },
    },
    Encounter: {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/p1' },
      period: { start: '2026-01-01' },
    },
    Flag: {
      resourceType: 'Flag',
      status: 'active',
      subject: { reference: 'Patient/p1' },
      code: { text: 'x' },
    },
    RiskAssessment: {
      resourceType: 'RiskAssessment',
      subject: { reference: 'Patient/p1' },
      prediction: [{ outcome: { text: 'ER' }, probabilityDecimal: 0.5 }],
    },
  };
  const adapters = {
    Coverage: coverageFhirAdapter,
    Encounter: encounterFhirAdapter,
    Flag: flagAdapter,
    RiskAssessment: riskAssessmentAdapter,
  } as const;
  for (const kind of Object.keys(idless) as (keyof typeof adapters)[]) {
    it(`${kind} with no id fails validation (quarantines)`, () => {
      const adapter = adapters[kind];
      const raw = adapter.parse(bundle(idless[kind]))[0];
      const res = adapter.validate(raw);
      expect(res.ok).toBe(false);
      expect(res.issues.map((i) => i.reasonCode).some((c) => c.includes('-id'))).toBe(true);
    });
    it(`${kind} WITH an id passes validation`, () => {
      const adapter = adapters[kind];
      const raw = adapter.parse(bundle({ ...idless[kind], id: `${kind}-1` }))[0];
      expect(adapter.validate(raw).ok).toBe(true);
    });
  }
});
