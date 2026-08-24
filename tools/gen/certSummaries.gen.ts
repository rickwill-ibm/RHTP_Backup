/**
 * Certification summary GENERATOR (Framework v1.6 §8).
 * Regenerates the two committed, DERIVED artifacts the drift gates check:
 *   - docs/certification/capability-matrix.summary.json  (from the live rollup)
 *   - docs/certification/readiness-summary.json           (from the doc's json block)
 *
 * Run on demand:  npm run gen:cert
 * Lives under tools/ (outside the tests/** include) so it is NOT part of the unit
 * suite - it has side effects (writes files) by design. Correctness is ENFORCED by
 * tests/certification/matrixRollup.test.ts + readiness.test.ts; this is simply how
 * you make those gates green again after a legitimate matrix or doc change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMatrixReadinessSummary } from '@/lib/certification';

const ROOT = process.cwd();
const MATRIX = resolve(ROOT, 'docs/certification/capability-matrix.summary.json');
const READINESS = resolve(ROOT, 'docs/certification/readiness-summary.json');
const DOC = resolve(ROOT, 'docs/certification/CERTIFICATION_READINESS.md');

describe('gen: certification summaries', () => {
  it('regenerates both committed summaries and asserts doc/matrix convergence', () => {
    // 1. capability-matrix.summary.json - the deterministic rollup (no clocks/rng).
    const summary = buildMatrixReadinessSummary();
    writeFileSync(MATRIX, JSON.stringify(summary, null, 2) + '\n');

    // 2. readiness-summary.json - the single fenced json block embedded in the doc,
    //    kept byte-identical to the doc (that equality is the readiness drift gate).
    const md = readFileSync(DOC, 'utf8');
    const m = md.match(/```json\s*\n([\s\S]*?)\n```/);
    expect(m, 'CERTIFICATION_READINESS.md must contain a fenced json block').toBeTruthy();
    const block = (m as RegExpMatchArray)[1];
    writeFileSync(READINESS, block + '\n');

    // 3. convergence: the doc's per-standard statuses MUST equal the matrix rollup,
    //    or the doc is stale and must be reconciled before this can be committed green.
    const readiness = JSON.parse(block) as { standards: Array<{ id: string; status: string }> };
    const mm = new Map(summary.standards.map((s) => [s.id, s.status]));
    const mismatches = readiness.standards
      .filter((s) => s.status !== mm.get(s.id))
      .map((s) => `${s.id}: doc=${s.status} matrix=${mm.get(s.id)}`);
    expect(mismatches, 'readiness doc statuses diverge from the matrix rollup').toEqual([]);
  });
});
