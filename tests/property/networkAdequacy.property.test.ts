/**
 * Property-style tests — network adequacy engine (src/lib/networkAdequacy/adequacyEngine.ts).
 * Seeded deterministic generation via _prng.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  computeCell,
  computeGaps,
  computeMetrics,
  haversineMiles,
  validateCell,
  type CellKey,
} from '@/lib/networkAdequacy/adequacyEngine';
import type {
  AdequacyInput,
  AdequacyStandard,
  GeoUnit,
  Lob,
  Provider,
  Severity,
} from '@/lib/networkAdequacy/types';
import { bool, float, forCases, int, pick, subset, type Rng } from './_prng';

const LOBS: Lob[] = ['Medicaid', 'Medicare', 'Commercial'];
const SPECIALTIES = ['Pediatrics', 'Cardiology', 'OB/GYN'];
const COUNTIES = ['Minnehaha', 'Pennington', 'Todd', 'Oglala Lakota'];

function genGeo(rng: Rng, name: string): GeoUnit {
  return {
    fips: `46${int(rng, 100, 999)}`,
    name,
    state: 'SD',
    countyType: pick(rng, ['large-metro', 'metro', 'micro', 'rural', 'ccn'] as const),
    lat: float(rng, 42, 46),
    lng: float(rng, -104, -96),
    population: int(rng, 1000, 200000),
    members: {
      Medicaid: bool(rng, 0.9) ? int(rng, 0, 50000) : 0,
      Medicare: bool(rng, 0.7) ? int(rng, 0, 20000) : 0,
      Commercial: bool(rng, 0.7) ? int(rng, 0, 40000) : 0,
    },
  };
}

function genStandard(rng: Rng, specialty: string): AdequacyStandard {
  return {
    specialty,
    maxDistanceMiles: int(rng, 10, 60),
    requiredPer100k: int(rng, 1, 20),
    maxWaitDays: int(rng, 5, 30),
    minInNetworkPct: int(rng, 80, 95),
    targetAdequacyPct: int(rng, 70, 95),
  };
}

function genProvider(rng: Rng, i: number): Provider {
  const lobs = subset(rng, LOBS, 0.6);
  return {
    npi: `10000${i}`,
    name: `Provider ${i}`,
    specialty: pick(rng, SPECIALTIES),
    county: pick(rng, COUNTIES),
    lat: float(rng, 41, 47),
    lng: float(rng, -105, -95),
    lobs: lobs.length ? lobs : [pick(rng, LOBS)],
    acceptingNewPatients: bool(rng, 0.8),
    status: 'active',
  };
}

function genInput(rng: Rng): AdequacyInput {
  const counties = COUNTIES.slice(0, int(rng, 2, COUNTIES.length));
  return {
    providers: Array.from({ length: int(rng, 0, 15) }, (_, i) => genProvider(rng, i)),
    geo: counties.map((c) => genGeo(rng, c)),
    standards: SPECIALTIES.slice(0, int(rng, 1, 3)).map((s) => genStandard(rng, s)),
    waitTimes: bool(rng, 0.5)
      ? [
          {
            county: pick(rng, counties),
            specialty: pick(rng, SPECIALTIES),
            lob: pick(rng, LOBS),
            avgWaitDays: int(rng, 1, 60),
          },
        ]
      : undefined,
  };
}

function genKey(rng: Rng, input: AdequacyInput): CellKey {
  return {
    county: pick(rng, input.geo).name,
    specialty: pick(rng, input.standards).specialty,
    lob: pick(rng, LOBS),
  };
}

describe('network adequacy properties', () => {
  it('property: adding a matching provider never worsens a cell adequacy score (monotonicity)', () => {
    forCases(300, 0xadd1, (rng, i) => {
      const input = genInput(rng);
      const key = genKey(rng, input);
      const before = computeCell(input, key);
      expect(before, `case ${i}: geo+standard exist so cell must compute`).not.toBeNull();

      const extra: Provider = {
        npi: '9999999999',
        name: 'New contract',
        specialty: key.specialty,
        county: bool(rng, 0.6) ? key.county : pick(rng, COUNTIES),
        lat: float(rng, 41, 47),
        lng: float(rng, -105, -95),
        lobs: [key.lob],
        acceptingNewPatients: true,
        status: 'active',
      };
      const after = computeCell({ ...input, providers: [...input.providers, extra] }, key);
      expect(after).not.toBeNull();
      expect(after!.adequacyPct, `case ${i}: adequacy worsened ${before!.adequacyPct} -> ${after!.adequacyPct}`)
        .toBeGreaterThanOrEqual(before!.adequacyPct);
      expect(after!.providerCount).toBeGreaterThanOrEqual(before!.providerCount);
      if (before!.nearestDistanceMiles !== null && after!.nearestDistanceMiles !== null) {
        expect(after!.nearestDistanceMiles).toBeLessThanOrEqual(before!.nearestDistanceMiles);
      }
    });
  });

  it('property: distance and ratio computations are non-negative and finite', () => {
    forCases(300, 0xd157, (rng, i) => {
      const d = haversineMiles(
        float(rng, -90, 90),
        float(rng, -180, 180),
        float(rng, -90, 90),
        float(rng, -180, 180)
      );
      expect(d, `case ${i}: haversine negative or NaN`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(d)).toBe(true);

      const input = genInput(rng);
      for (const m of computeMetrics(input)) {
        expect(m.providersPer100k).toBeGreaterThanOrEqual(0);
        expect(m.providerCount).toBeGreaterThanOrEqual(0);
        expect(m.memberCount).toBeGreaterThan(0); // zero-member cells are skipped
        expect(m.adequacyPct).toBeGreaterThanOrEqual(0);
        expect(m.adequacyPct).toBeLessThanOrEqual(100);
        if (m.nearestDistanceMiles !== null) {
          expect(m.nearestDistanceMiles).toBeGreaterThanOrEqual(0);
        }
        if (m.memberProviderRatio !== null) {
          expect(m.memberProviderRatio).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  it('property: zero-distance to self — a point is 0 miles from itself', () => {
    forCases(100, 0x5e1f, (rng) => {
      const lat = float(rng, -90, 90);
      const lng = float(rng, -180, 180);
      expect(haversineMiles(lat, lng, lat, lng)).toBe(0);
    });
  });

  it('property: gap derivation is consistent with the threshold direction (gap iff below target)', () => {
    const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    forCases(200, 0x9a9, (rng, i) => {
      const input = genInput(rng);
      const metrics = computeMetrics(input);
      for (const m of metrics) {
        expect(m.gapStatus, `case ${i}: gapStatus disagrees with threshold`).toBe(
          m.adequacyPct < m.targetPct
        );
      }
      const gaps = computeGaps(input);
      expect(gaps.length).toBe(metrics.filter((m) => m.gapStatus).length);
      for (const g of gaps) {
        expect(g.currentPct).toBeLessThan(g.requiredPct);
        expect(g.shortfallProviders).toBeGreaterThanOrEqual(0);
        expect(g.affectedPopulation).toBeGreaterThanOrEqual(0);
        const spec: Severity =
          g.currentPct < 50 ? 'critical' : g.currentPct < 70 ? 'high' : g.currentPct < 85 ? 'medium' : 'low';
        expect(g.severity).toBe(spec);
      }
      for (let k = 1; k < gaps.length; k++) {
        const prev = gaps[k - 1];
        const cur = gaps[k];
        const ok =
          SEV_ORDER[prev.severity] < SEV_ORDER[cur.severity] ||
          (SEV_ORDER[prev.severity] === SEV_ORDER[cur.severity] &&
            prev.affectedPopulation >= cur.affectedPopulation);
        expect(ok, `case ${i}: gap sort order violated at index ${k}`).toBe(true);
      }
    });
  });

  it('property: validateCell compliant flag equals the conjunction of its checks', () => {
    forCases(150, 0x7a1d, (rng, i) => {
      const input = genInput(rng);
      const key = genKey(rng, input);
      const v = validateCell(input, key);
      if (v === null) return; // no geo/standard for the key — legal null, not a crash
      expect(v.checks.length).toBe(5);
      expect(v.compliant, `case ${i}`).toBe(v.checks.every((c) => c.pass));
      for (const c of v.checks) {
        expect(c.required).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
