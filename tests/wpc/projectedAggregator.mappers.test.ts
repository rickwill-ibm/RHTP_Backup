/**
 * Pure section mappers (WPC-01 Phase 3) — direct unit tests over hand-built lens
 * fixtures, so each mapper is proven in isolation (E13 symbol-level coverage).
 */
import { describe, it, expect } from 'vitest';
import type { GraphEdgeRecord, GraphNodeRecord, PropVal } from '@/lib/graph/types';
import type { LensName, LensResult } from '@/lib/graph/lens/types';
import {
  NEUTRAL_SECTIONS,
  PROJECTED_SECTIONS,
  mapBarriers,
  mapClinical,
  mapPatient,
  neutralAccess,
  neutralCaregiver,
  neutralDigital,
  neutralFinancial,
  neutralPsychosocial,
} from '@/lib/wpc/projectedAggregator.mappers';

function node(
  kind: string,
  key: string,
  properties: Record<string, PropVal> = {},
  restricted = false
): GraphNodeRecord {
  return { kind, key, labels: [kind], properties, restricted };
}
function edge(
  type: string,
  fromKey: string,
  to: { kind: string; key: string },
  start: string
): GraphEdgeRecord {
  return {
    type,
    from: { kind: 'Member', key: fromKey },
    to,
    properties: {},
    validity: { start, end: null },
    causal: false,
  };
}
function lens(
  name: LensName,
  memberId: string,
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[]
): LensResult {
  return { lens: name, memberId, nodes, edges };
}

describe('projected-graph mappers (WPC-01 Phase 3)', () => {
  it('mapPatient reads member props and falls back honestly when absent', () => {
    expect(mapPatient(node('Member', 'm1', { name: 'A', age: 40, gender: 'F', mrn: 'X' }))).toEqual(
      {
        id: 'm1',
        name: 'A',
        age: 40,
        gender: 'F',
        mrn: 'X',
      }
    );
    const bare = mapPatient(node('Member', 'm2', { id: 'm2' }));
    expect(bare.name).toBe('m2');
    expect(bare.age).toBe(0);
    expect(bare.gender).toBe('unknown');
    expect(bare.mrn).toBeUndefined();
  });

  it('mapBarriers: unmet need → identified, negative screen → resolved, unscreened → not-screened', () => {
    const nodes = [
      node('SocialNeed', 'm1:transportation-insecurity', { domain: 'transportation-insecurity' }),
      node('SdohScreening', 'Obs/food', { domain: 'food-insecurity', positive: false }),
    ];
    const edges = [
      edge(
        'HAS_UNMET_NEED',
        'm1',
        { kind: 'SocialNeed', key: 'm1:transportation-insecurity' },
        '2026-04-03T00:00:00Z'
      ),
      edge(
        'SCREENED_FOR',
        'm1',
        { kind: 'SdohScreening', key: 'Obs/food' },
        '2026-04-03T00:00:00Z'
      ),
    ];
    const b = mapBarriers(lens('sdoh-barrier', 'm1', nodes, edges));
    expect(b.transportation.status).toBe('identified');
    expect(b.transportation.severity).toBe('high');
    expect(b.transportation.screeningDate).toBe('2026-04-03T00:00:00Z');
    expect(b.food.status).toBe('resolved'); // negative screen
    expect(b.housing.status).toBe('not-screened'); // never screened, honest
  });

  it('mapClinical maps conditions, meds, encounters, and care gaps', () => {
    const whole = lens(
      'whole-person',
      'm1',
      [
        node('Condition', 'Condition/1', {
          code: 'E11.9',
          hccRelevant: true,
          clinicalStatus: 'active',
        }),
        node('Medication', 'Medication/1', { rxNorm: '860975' }),
        node('Encounter', 'Encounter/1', { encounterClass: 'IMP' }),
      ],
      [edge('HAS_PROBLEM', 'm1', { kind: 'Condition', key: 'Condition/1' }, '2026-01-01T00:00:00Z')]
    );
    const careGap = lens(
      'care-gap',
      'm1',
      [node('SocialNeed', 'm1:food-insecurity', { domain: 'food-insecurity' })],
      []
    );

    const c = mapClinical(whole, careGap);
    expect(c.conditionCount).toBe(1);
    expect(c.chronicConditions[0].severity).toBe('high'); // HCC-relevant
    expect(c.chronicConditions[0].controlled).toBe(false); // clinicalStatus active
    expect(c.chronicConditions[0].diagnosisDate).toBe('2026-01-01T00:00:00Z');
    expect(c.medications).toHaveLength(1);
    expect(c.recentHospitalizations).toBe(1); // IMP encounter
    expect(c.openCareGaps.length).toBeGreaterThan(0);
  });

  it('neutral null-objects and provenance section lists', () => {
    expect(neutralFinancial().insuranceCoverage.type).toBe('Uninsured');
    expect(neutralCaregiver().isCaregiverForOthers).toBe(false);
    expect(neutralAccess().ruralStatus).toBe('urban');
    expect(neutralDigital().hasSmartphone).toBe(false);
    expect(neutralPsychosocial().socialIsolation).toBe(false);
    expect(PROJECTED_SECTIONS).toContain('barriers');
    expect(NEUTRAL_SECTIONS).toContain('financialProfile');
  });
});
