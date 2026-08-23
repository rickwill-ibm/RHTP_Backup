/**
 * matrix.ts — the conformance matrix as queryable DATA, plus the deterministic
 * machine-readable document that certification waves B and C consume.
 *
 * CLAIMED_STANDARDS is the authoritative list of every standard the brief claims.
 * The matrix test proves the assembled matrix covers EXACTLY this set (no claimed
 * standard missing, no row for an unclaimed standard).
 */
import { SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions';
import { MATRIX_PART_1 } from './matrix.data1';
import { MATRIX_PART_2 } from './matrix.data2';
import type {
  Capability,
  ClaimedStandardId,
  ConformanceMatrix,
  EvidenceStatus,
  MatrixDocument,
  MatrixRow,
  StandardEntry,
  StatusCounts,
} from './types';

/** Framework version this matrix is authored against. */
export const MATRIX_VERSION = 'v1.2';

/**
 * Every standard the brief claims. The matrix MUST cover exactly this set.
 * Order is stable (used for deterministic output).
 */
export const CLAIMED_STANDARDS: readonly ClaimedStandardId[] = [
  'us-core-uscdi',
  'davinci-pas',
  'davinci-crd',
  'davinci-dtr',
  'carin',
  'smart',
  'cds-hooks',
  'cms-0057-f',
  'ihe-pix-pdq',
  'ihe-pixm-pdqm',
  'x12-834',
  'x12-837',
  'x12-835',
  'x12-278',
  'x12-270-271',
  'terminology',
  'part2-hipaa',
  'npi-nppes',
] as const;

/** The assembled conformance matrix (part 1 + part 2, in claimed order). */
export const CONFORMANCE_MATRIX: ConformanceMatrix = [...MATRIX_PART_1, ...MATRIX_PART_2];

// ── Queries ───────────────────────────────────────────────────────────────────

/** The standard entry for a claimed id, or undefined. */
export function standardById(claimId: ClaimedStandardId): StandardEntry | undefined {
  return CONFORMANCE_MATRIX.find((s) => s.claimId === claimId);
}

/** Every claimId present in the matrix (deduplicated, matrix order). */
export function coveredStandardIds(): ClaimedStandardId[] {
  const seen = new Set<ClaimedStandardId>();
  const out: ClaimedStandardId[] = [];
  for (const s of CONFORMANCE_MATRIX) {
    if (!seen.has(s.claimId)) {
      seen.add(s.claimId);
      out.push(s.claimId);
    }
  }
  return out;
}

/** Every capability across the matrix, flattened. */
export function allCapabilities(): Array<{ entry: StandardEntry; capability: Capability }> {
  return CONFORMANCE_MATRIX.flatMap((entry) =>
    entry.capabilities.map((capability) => ({ entry, capability })),
  );
}

/** Every capability carrying a given status. */
export function capabilitiesWithStatus(
  status: EvidenceStatus,
): Array<{ entry: StandardEntry; capability: Capability }> {
  return allCapabilities().filter(({ capability }) => capability.evidence.status === status);
}

// ── Machine-readable output ─────────────────────────────────────────────────

/** Flatten the matrix into one row per capability. Deterministic order. */
export function toRows(): MatrixRow[] {
  return allCapabilities().map(({ entry, capability }) => ({
    claimId: entry.claimId,
    standard: entry.standard,
    capabilityId: capability.id,
    capability: capability.capability,
    codePath: capability.evidence.codePath,
    testId: capability.evidence.testId,
    status: capability.evidence.status,
    note: capability.evidence.note,
    ...(capability.evidence.seamId ? { seamId: capability.evidence.seamId } : {}),
  }));
}

/** Count capabilities by status. */
export function statusCounts(): StatusCounts {
  const counts: StatusCounts = { supported: 0, partial: 0, 'ci-pending': 0, absent: 0 };
  for (const { capability } of allCapabilities()) counts[capability.evidence.status] += 1;
  return counts;
}

/**
 * The deterministic machine-readable matrix document. No timestamps, no rng, so
 * two builds of the same tree are byte-identical. Waves B and C consume this.
 */
export function buildMatrixDocument(): MatrixDocument {
  return {
    version: MATRIX_VERSION,
    claimedStandards: CLAIMED_STANDARDS,
    standardsCovered: coveredStandardIds().length,
    counts: statusCounts(),
    rows: toRows(),
  };
}

/**
 * True when a capability is anchored to a seam whose production disposition is a
 * stub (fail-closed-stub) or demo-only (mock-only). Such a capability must never
 * be `supported`. Exported so the matrix test and consumers share one rule.
 */
export function isStubBackedCapability(capability: Capability): boolean {
  const seamId = capability.evidence.seamId;
  if (!seamId) return false;
  const disposition = SEAM_DISPOSITIONS[seamId]?.disposition;
  return disposition === 'fail-closed-stub' || disposition === 'mock-only';
}
