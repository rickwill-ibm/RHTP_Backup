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
  mapCareTeam,
  mapClinical,
  mapPart2,
  mapPatient,
  mapAccess,
  unknownAccess,
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
    expect(unknownAccess().ruralStatus).toBe('unknown');
    expect(neutralDigital().hasSmartphone).toBe(false);
    expect(neutralPsychosocial().socialIsolation).toBe(false);
    expect(PROJECTED_SECTIONS).toContain('barriers');
    expect(NEUTRAL_SECTIONS).toContain('financialProfile');
  });
});

describe('mapCareTeam', () => {
  it('counts CareTeamMember nodes and de-dupes roles (order-stable)', () => {
    const l = lens(
      'care-team',
      'M1',
      [
        node('Member', 'M1'),
        node('CareTeamMember', 'ct1', { role: 'Care Manager' }),
        node('Practitioner', 'pr1', { role: 'PCP' }),
        // NPI-converged treating physician — a ProviderIdentity node, NOT CareTeamMember;
        // it must still be counted (the bug the fix closes).
        node('ProviderIdentity', 'npi-123', { role: 'Cardiologist' }),
        node('CareTeamMember', 'ct2', { role: 'Care Manager' }),
      ],
      []
    );
    const out = mapCareTeam(l);
    expect(out.memberCount).toBe(4);
    expect(out.roles).toEqual(['Care Manager', 'PCP', 'Cardiologist']);
  });

  it('is empty (not fabricated) when the lens has no team nodes', () => {
    const out = mapCareTeam(lens('care-team', 'M1', [node('Member', 'M1')], []));
    expect(out).toEqual({ memberCount: 0, roles: [] });
  });
});

describe('mapPart2 (42 CFR Part 2 enforcement is surfaced, not dropped)', () => {
  it('no Part 2 scope -> zero restricted, disclosed=false (an ENFORCED restriction)', () => {
    const out = mapPart2(lens('part2-restricted', 'M1', [], []), { part2: false, segments: [] });
    // count is UNKNOWN (null), never 0 — 0 would misread as 'no Part 2 data'
    expect(out).toEqual({ restrictedNodeCount: null, disclosed: false });
  });

  it('with a Part 2 grant -> restricted nodes counted, disclosed=true', () => {
    const l = lens(
      'part2-restricted',
      'M1',
      [node('Diagnosis', 'd1', {}, true), node('Diagnosis', 'd2', {}, true)],
      []
    );
    const out = mapPart2(l, { part2: true, segments: [] });
    expect(out).toEqual({ restrictedNodeCount: 2, disclosed: true });
  });
});

describe('provenance declares the newly surfaced lenses as projected', () => {
  it('careTeam + part2Restricted are projected, not neutral', () => {
    expect(PROJECTED_SECTIONS).toContain('careTeam');
    expect(PROJECTED_SECTIONS).toContain('part2Restricted');
    expect(NEUTRAL_SECTIONS).not.toContain('careTeam');
    expect(NEUTRAL_SECTIONS).not.toContain('part2Restricted');
  });
});

describe('mapAccess (first FHIR-fed dimension, fail-closed)', () => {
  const wp = (props?: Record<string, PropVal>) =>
    lens(
      'whole-person',
      'M1',
      props ? [node('Member', 'M1'), node('AccessContext', 'M1', props)] : [node('Member', 'M1')],
      []
    );

  it('maps a fully-reported AccessContext', () => {
    const out = mapAccess(
      wp({
        ruralStatus: 'rural',
        distanceToProviderMiles: 45,
        publicTransitAvailable: false,
        broadbandAvailable: true,
        cellularCoverage: 'good',
        nearestPharmacyMiles: 12,
        nearestERMiles: 35,
        nearestFacilityMiles: 45,
        nearestLabLocation: 'Rapid City',
      })
    );
    expect(out.ruralStatus).toBe('rural');
    expect(out.dataAvailability).toBe('reported');
    expect(out.distanceToProvider).toBe(45);
    expect(out.publicTransitAvailable).toBe(false);
    expect(out.broadbandAccess).toBe(true);
    expect(out.cellularCoverage).toBe('good');
    expect(out.nearestPharmacy).toBe(12);
    expect(out.nearestER).toBe(35);
    expect(out.distanceToNearestFacility).toBe(45);
    expect(out.nearestLabLocation).toBe('Rapid City');
  });

  it('NO access node -> honest unknown, NEVER a fabricated urban/0/false', () => {
    const out = mapAccess(wp());
    expect(out).toEqual({ ruralStatus: 'unknown', dataAvailability: 'unknown' });
    expect('distanceToProvider' in out).toBe(false);
    expect('publicTransitAvailable' in out).toBe(false);
  });

  it('partial node (rural only): present fields map, dataAvailability is partial', () => {
    const out = mapAccess(wp({ ruralStatus: 'frontier' }));
    expect(out.ruralStatus).toBe('frontier');
    expect(out.dataAvailability).toBe('partial'); // one field known, not enough for 'reported'
    expect('nearestER' in out).toBe(false);
    expect('publicTransitAvailable' in out).toBe(false);
  });

  it('present-but-EMPTY node is NOT reported (honest availability)', () => {
    const out = mapAccess(wp({}));
    expect(out.ruralStatus).toBe('unknown');
    expect(out.dataAvailability).toBe('unknown'); // node exists but nothing resolved -> not a lie
  });

  it('unrecognised enum value fails closed (not passed through)', () => {
    const out = mapAccess(wp({ ruralStatus: 'exurban', cellularCoverage: 'spotty' }));
    expect(out.ruralStatus).toBe('unknown');
    expect('cellularCoverage' in out).toBe(false);
  });

  it('non-numeric distance fails closed to omitted', () => {
    const out = mapAccess(
      wp({ ruralStatus: 'urban', distanceToProviderMiles: 'far' as unknown as PropVal })
    );
    expect(out.ruralStatus).toBe('urban');
    expect('distanceToProvider' in out).toBe(false);
  });

  it('ignores foreign node kinds on the whole-person lens', () => {
    const l = lens(
      'whole-person',
      'M1',
      [
        node('Member', 'M1'),
        node('Condition', 'c1', { name: 'x' }),
        node('AccessContext', 'M1', { ruralStatus: 'suburban' }),
      ],
      []
    );
    expect(mapAccess(l).ruralStatus).toBe('suburban');
  });
});

describe('access provenance + unknownAccess', () => {
  it('accessProfile is now PROJECTED, not NEUTRAL', () => {
    expect(PROJECTED_SECTIONS).toContain('accessProfile');
    expect(NEUTRAL_SECTIONS).not.toContain('accessProfile');
  });
  it('unknownAccess is honest (no fabricated fields)', () => {
    expect(unknownAccess().ruralStatus).toBe('unknown');
    expect(unknownAccess().dataAvailability).toBe('unknown');
    expect('distanceToProvider' in unknownAccess()).toBe(false);
  });
});
