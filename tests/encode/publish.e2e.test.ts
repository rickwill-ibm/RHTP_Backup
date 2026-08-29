/**
 * Authoring → publication → runtime CRD loop — the "one source of truth" proof.
 * The runtime CRD reads coverage from what authoring PUBLISHED, not a seed; an unpublished code
 * fails closed; re-publishing supersedes the prior version.
 */
import { describe, it, expect } from 'vitest';
import type { CriteriaPolicy } from '@/lib/policy/extract/criteria';
import type { ProcedureRule } from '@/lib/policy/encode/ir';
import { createStore } from '@/lib/policy/encode/publish';
import { authorAndPublish, runtimeCrd } from '@/lib/policy/encode/author';

function req<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}

const criteria: CriteriaPolicy = {
  title: 'Bariatric Surgery',
  guidelineId: 'HORIZON-BARIATRIC',
  status: 'active',
  medicallyNecessary: [
    {
      heading: 'medically necessary when all of the following are met',
      logic: 'all',
      criteria: [
        { label: 'A', text: 'The member is at least 18 years of age', children: [] },
        { label: 'C', text: 'A body mass index (BMI) greater than 40 kg/m²', children: [] },
      ],
    },
  ],
  notMedicallyNecessary: [
    'Bariatric surgery is not medically necessary for members who have not met criteria.',
  ],
  codes: [],
  provenance: [],
  warnings: [],
  stats: { groups: 1, criteria: 2, codes: 0 },
};
const procedures: ProcedureRule[] = [
  {
    code: '43775',
    system: 'CPT',
    coverageCode: 'covered',
    sourceText: 'sleeve',
    sourceSpan: { start: 0, end: 0 },
  },
];
const clock = () => '2026-08-28T00:00:00.000Z';

describe('authoring publishes what the runtime reads', () => {
  it('publishes a Questionnaire + coverage rules keyed by code', () => {
    const store = createStore();
    const art = authorAndPublish(store, criteria, {
      procedures,
      service: 'Bariatric Surgery',
      now: clock,
    });
    expect(art.version).toBe(1);
    expect(art.questionnaire.item.length).toBeGreaterThan(0);
    expect(art.coverageRules.find((r) => r.code === '43775')).toBeTruthy();
  });

  it('runtime CRD reads the published rule and evaluates the patient', () => {
    const store = createStore();
    authorAndPublish(store, criteria, { procedures, service: 'Bariatric Surgery', now: clock });
    const approvable = runtimeCrd(store, '43775', { measures: { age: 45, bmi: 42 } });
    expect(approvable.published).toBe(true);
    expect(approvable.coverage.determination.disposition).toBe('approvable');
    expect(approvable.coverage.questionnaireCanonical).toContain('urn:rhtp:dtr/Questionnaire/');

    const failing = runtimeCrd(store, '43775', { measures: { age: 15, bmi: 42 } });
    expect(failing.coverage.determination.coverage).toBe('not-covered');
  });

  it('an unpublished procedure code fails closed (not a silent covered)', () => {
    const store = createStore();
    authorAndPublish(store, criteria, { procedures, service: 'Bariatric Surgery', now: clock });
    const res = runtimeCrd(store, '99999', { measures: { age: 45, bmi: 42 } });
    expect(res.published).toBe(false);
    expect(res.coverage.coverage).toBe('not-covered');
  });

  it('re-publishing supersedes the prior version', () => {
    const store = createStore();
    authorAndPublish(store, criteria, { procedures, service: 'Bariatric Surgery', now: clock });
    const v2 = authorAndPublish(store, criteria, {
      procedures,
      service: 'Bariatric Surgery',
      now: clock,
    });
    expect(v2.version).toBe(2);
    expect(req(store.byGuideline.get('HORIZON-BARIATRIC')).version).toBe(2);
  });
});
