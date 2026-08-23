/**
 * Seam mock<->production parity (E15) + installer frontend-only lock (HW0 / I12).
 *
 * - Freezes each seam's mock shape (drift detection now; the contract a future
 *   production disposition must satisfy later).
 * - Proves every registered dataMode seam still DEFAULTS to 'mock', so the
 *   frontend-only + mock install runs with zero backend (governing constraint #3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  seamShapeRecords,
  assertShapeEquivalent,
  SEAM_PARITY,
} from '../../src/lib/demoPreservation';
import { DEFAULT_DATA_MODES, describeDataModes } from '../../src/lib/config/dataMode';

const GOLDEN = join(__dirname, 'seam-shapes-golden.json');

describe('E15 seam parity — frozen mock shapes', () => {
  const live = seamShapeRecords();

  if (process.env.DEMO_GOLDEN_WRITE === '1' || !existsSync(GOLDEN)) {
    it('writes the seam-shape golden (generation mode)', () => {
      writeFileSync(GOLDEN, JSON.stringify(live, null, 2) + '\n');
      expect(existsSync(GOLDEN)).toBe(true);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const goldenBySeam = new Map(golden.map((r: any) => [r.seam, r]));

  it('registers the expected seams', () => {
    expect(live.map((r) => r.seam).sort()).toEqual(golden.map((r: any) => r.seam).sort());
  });

  for (const rec of live) {
    it(`seam "${rec.seam}" mock shape is unchanged`, () => {
      const g = goldenBySeam.get(rec.seam) as any;
      expect(g, `golden missing seam ${rec.seam}`).toBeTruthy();
      expect(rec.shapeHash).toBe(g.shapeHash);
    });
  }

  it('assertShapeEquivalent accepts a same-shape production sample and rejects a divergent one', () => {
    const mock = SEAM_PARITY[0].sample();
    // same shape (values differ) -> passes
    expect(() => assertShapeEquivalent(mock, structuredCloneish(mock), 'graph')).not.toThrow();
    // divergent shape -> throws E15
    expect(() => assertShapeEquivalent(mock, { totallyDifferent: true }, 'graph')).toThrow(/E15 parity FAIL/);
  });
});

describe('installer frontend-only + mock lock (constraint #3)', () => {
  it('every registered seam defaults to mock', () => {
    for (const [seam, mode] of Object.entries(DEFAULT_DATA_MODES)) {
      expect(mode, `seam ${seam} must default to mock`).toBe('mock');
    }
  });

  it('with no DATA_MODE env set, every seam resolves to mock (zero-backend demo)', () => {
    const saved = { ...process.env };
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('DATA_MODE') || k === 'NEXT_PUBLIC_USE_MOCK_DATA') delete process.env[k];
    }
    try {
      for (const d of describeDataModes()) expect(d.mode).toBe('mock');
    } finally {
      Object.assign(process.env, saved);
    }
  });
});

// tiny structural clone that changes primitive values but keeps shape
function structuredCloneish(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(structuredCloneish);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k] = structuredCloneish(val);
    return o;
  }
  if (typeof v === 'string') return v + '_x';
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'boolean') return !v;
  return v;
}
