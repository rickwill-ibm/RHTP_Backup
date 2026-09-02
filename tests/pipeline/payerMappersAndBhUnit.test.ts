// Symbol-level unit coverage (E13 test-link) for two modules exercised end-to-end
// elsewhere but not directly symbol-referenced: the payer section mappers and the
// BH-survey observation adapter. Pure, minimal-fixture assertions.
import { describe, it, expect } from 'vitest';
import type { LensResult } from '@/lib/graph/lens/types';
import type { GraphNodeRecord } from '@/lib/graph/types';
import {
  mapRiskProfile,
  mapCoverage,
  mapUtilization,
  mapAlerts,
} from '@/lib/wpc/projectedAggregator.payerMappers';
import { isSurvey, bhObservationAdapter, defaultPipelineDeps } from '@/lib/pipeline';

const node = (kind: string, properties: Record<string, unknown>): GraphNodeRecord =>
  ({ kind, key: `${kind}-1`, properties }) as unknown as GraphNodeRecord;
const lens = (nodes: GraphNodeRecord[]): LensResult => ({ nodes }) as unknown as LensResult;

describe('payer section mappers (PHI-minimal, codes + numbers only)', () => {
  it('mapRiskProfile pulls RAF + prediction and the highest RAF', () => {
    const r = mapRiskProfile(
      lens([
        node('RiskAssessment', {
          predictedOutcome: 'ER Visit',
          probability: 0.84,
          rafScore: 3.42,
          method: '',
        }),
        node('RiskAssessment', {
          predictedOutcome: 'ER Visit',
          probability: 0.5,
          rafScore: 1.9,
          method: '',
        }),
        node('Condition', { code: 'E11.9' }), // ignored
      ])
    );
    expect(r.assessments).toHaveLength(2);
    expect(r.highestRaf).toBe(3.42);
  });

  it('mapCoverage / mapUtilization / mapAlerts summarize their node kinds', () => {
    const c = mapCoverage(
      lens([node('Coverage', { planCode: 'MC', status: 'active', periodStart: '', periodEnd: '' })])
    );
    expect(c.plans).toHaveLength(1);
    expect(c.plans[0].planCode).toBe('MC');

    const u = mapUtilization(
      lens([
        node('Encounter', { encounterClass: 'AMB' }),
        node('Encounter', { encounterClass: 'AMB' }),
      ])
    );
    expect(u.encounterCount).toBe(2);
    expect(u.classes).toEqual(['AMB']); // de-duplicated

    const a = mapAlerts(
      lens([
        node('Flag', { status: 'active', categoryCode: 'clinical' }),
        node('Flag', { status: 'inactive', categoryCode: 'clinical' }),
      ])
    );
    expect(a.activeCount).toBe(1);
    expect(a.categories).toEqual(['clinical']);
  });
});

describe('bhObservation adapter (survey ownership)', () => {
  const deps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });
  const survey = {
    resourceType: 'Observation',
    id: 'o-phq9',
    status: 'final',
    category: [{ coding: [{ code: 'survey' }] }],
    code: {
      coding: [{ system: 'http://loinc.org', code: '44249-1', display: 'PHQ-9 total score' }],
    },
    subject: { reference: 'Patient/p1' },
    effectiveDateTime: '2026-06-01',
    valueQuantity: { value: 14 },
  };

  it('isSurvey recognizes the survey category; a lab is not a survey', () => {
    expect(isSurvey(survey)).toBe(true);
    expect(isSurvey({ category: [{ coding: [{ code: 'laboratory' }] }] })).toBe(false);
  });

  it('the adapter parses + normalizes a survey Observation to the BH-observation event', () => {
    const bundle = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: survey }],
    });
    const raw = bhObservationAdapter.parse(bundle);
    expect(raw).toHaveLength(1);
    const rec = bhObservationAdapter.normalize(raw[0], deps);
    expect(rec.eventType).toBe('behavioral-health.observation-recorded');
    expect(rec.domain).toBe('behavioral-health');
  });
});
