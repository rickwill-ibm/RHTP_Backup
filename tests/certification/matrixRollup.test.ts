/**
 * matrixRollup.test.ts — Iteration 10 Wave D convergence gate.
 *
 * Proves the conformance MATRIX is the single source of truth for the per-standard
 * certification-readiness status, and that no claim set diverges across the three
 * certification artifacts (matrix / CapabilityStatement / readiness doc):
 *
 *   1. The matrix->readiness rollup covers EXACTLY the 13 readiness standards and
 *      PARTITIONS all 18 claimed standards (every claim id in exactly one bucket).
 *   2. E9 / honesty invariants tie each readiness status to the REAL capability
 *      statuses (a ceiling can never be set more optimistically than the matrix).
 *   3. The committed docs/certification/capability-matrix.summary.json is byte-equal
 *      to the freshly built rollup (drift gate — the readiness comparator reads it).
 *   4. The readiness doc summary status of every standard EQUALS the matrix rollup
 *      (DRY: readiness is validated against the matrix, not authored independently).
 *   5. Every operation the CapabilityStatement asserts maps to a matrix capability
 *      whose status is `supported` or `partial` (statement claims ⊆ matrix; no op
 *      is claimed for an absent/ci-pending-only capability).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLAIMED_STANDARDS,
  READINESS_STANDARDS,
  allCapabilities,
  buildMatrixReadinessSummary,
  rollupInvariantViolations,
} from '@/lib/certification';
import { implementedSurface } from '@/lib/certification/capabilityStatement';

const ROOT = process.cwd();
const SUMMARY_PATH = resolve(ROOT, 'docs/certification/capability-matrix.summary.json');
const READINESS_SUMMARY_PATH = resolve(ROOT, 'docs/certification/readiness-summary.json');

const READINESS_IDS = [
  'us-core-uscdi',
  'davinci-pas',
  'davinci-crd',
  'davinci-dtr',
  'carin',
  'smart',
  'cds-hooks',
  'cms-0057-f',
  'ihe-pix-pdq',
  'x12',
  'terminology',
  'part2-hipaa',
  'npi-nppes',
];

describe('matrix->readiness rollup — coverage & partition', () => {
  it('covers EXACTLY the 13 readiness standards', () => {
    const ids = READINESS_STANDARDS.map((s) => s.id).sort();
    expect(ids).toStrictEqual([...READINESS_IDS].sort());
  });

  it('partitions all 18 claimed standards (each claim id in exactly one bucket)', () => {
    const seen = READINESS_STANDARDS.flatMap((s) => s.claimIds);
    // No claim id appears twice.
    expect(new Set(seen).size).toBe(seen.length);
    // The union is exactly CLAIMED_STANDARDS.
    expect([...seen].sort()).toStrictEqual([...CLAIMED_STANDARDS].sort());
  });
});

describe('matrix->readiness rollup — E9 / honesty invariants', () => {
  it('has no invariant violations (status never more optimistic than the matrix)', () => {
    expect(rollupInvariantViolations()).toStrictEqual([]);
  });

  it("emits no 'ready' status (readiness, not certification)", () => {
    const ready = buildMatrixReadinessSummary().standards.filter((s) => s.status === 'ready');
    expect(ready).toStrictEqual([]);
  });
});

describe('matrix->readiness rollup — committed summary is not stale (drift gate)', () => {
  it('capability-matrix.summary.json equals the freshly built rollup', () => {
    expect(existsSync(SUMMARY_PATH), 'capability-matrix.summary.json must be committed').toBe(true);
    const onDisk = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
    expect(onDisk).toStrictEqual(JSON.parse(JSON.stringify(buildMatrixReadinessSummary())));
  });
});

describe('convergence — readiness doc statuses equal the matrix (DRY, no divergence)', () => {
  it('every readiness standard status matches the matrix rollup exactly', () => {
    const rollup = new Map(buildMatrixReadinessSummary().standards.map((s) => [s.id, s.status]));
    const readiness = JSON.parse(readFileSync(READINESS_SUMMARY_PATH, 'utf8')) as {
      standards: Array<{ id: string; status: string }>;
    };
    // Same id set.
    expect(readiness.standards.map((s) => s.id).sort()).toStrictEqual([...rollup.keys()].sort());
    // Same status per standard.
    for (const s of readiness.standards) {
      expect(s.status, `divergence on ${s.id}: readiness=${s.status} matrix=${rollup.get(s.id)}`).toBe(
        rollup.get(s.id)
      );
    }
  });
});

describe('convergence — CapabilityStatement claims ⊆ matrix supported/partial set', () => {
  // Every operation the statement asserts must be backed by a matrix capability that
  // is supported or partial. No op may be claimed for an absent/ci-pending capability.
  const OP_TO_CAPABILITY: Record<string, string> = {
    '$member-match': 'cms-member-match',
    '$submit': 'pas-fhir-submit',
    '$validate-code': 'term-validate-code',
    '$translate': 'term-translate',
    '$expand': 'term-expand',
    '$ihe-pix': 'pixmpdqm-request-logic',
  };

  const capabilityById = new Map(allCapabilities().map(({ capability }) => [capability.id, capability]));

  it('every asserted operation maps to a known matrix capability', () => {
    for (const op of implementedSurface().operations) {
      const capId = OP_TO_CAPABILITY[op.name];
      expect(capId, `statement op ${op.name} has no matrix capability mapping`).toBeDefined();
      expect(capabilityById.has(capId), `matrix has no capability ${capId}`).toBe(true);
    }
  });

  it('every mapped capability is supported or partial (never ci-pending/absent)', () => {
    for (const op of implementedSurface().operations) {
      const cap = capabilityById.get(OP_TO_CAPABILITY[op.name])!;
      expect(
        ['supported', 'partial'],
        `statement op ${op.name} -> ${cap.id} is ${cap.evidence.status} (must be supported/partial)`
      ).toContain(cap.evidence.status);
    }
  });
});
