/**
 * certification/types.ts — the conformance MATRIX as queryable DATA.
 *
 * The matrix answers ONE question for every standard the platform claims:
 *   standard -> capability -> evidence { codePath, testId, status, note }.
 *
 * HONESTY CONTRACT (E9: a capability must never DEFAULT to supported).
 *   - `EvidenceStatus` has no default. Every row states its status explicitly.
 *   - A capability backed only by a stub/seam (a fail-closed *NotConfiguredError
 *     seam, or a mock-only demo source) is `ci-pending` or `partial` with the
 *     honest note — NEVER `supported`. When a row is anchored to a dataMode seam
 *     it carries that seam id, and the matrix test cross-checks it against
 *     config/seamDispositions.ts: a fail-closed-stub / mock-only seam can never
 *     back a `supported` row.
 *   - A `supported` (or `partial`) row MUST point to a real, existing test file.
 *     The matrix test asserts every non-null `testId` resolves on disk.
 *
 * This module OWNS the machine-readable output that certification waves B
 * (capabilityStatement) and C (docs) consume — see matrix.ts buildMatrixDocument().
 */

import type { DataModeSeam } from '@/lib/config/dataMode';

/**
 * The four honest conformance states a capability can carry.
 *  - `supported`  A real production-grade implementation exists AND is proven by a
 *                 real, existing test. Never a stub, never a seam that fails closed.
 *  - `partial`    Real, tested logic exists but the capability is scoped: a subset
 *                 of the standard, or the logic is real while a live backend/wire is
 *                 still CI-pending. The note states exactly what is and is not covered.
 *  - `ci-pending` The seam/shape exists and fails closed (a named *NotConfiguredError)
 *                 until a real backend is wired; no production implementation yet.
 *  - `absent`     The standard is claimed at the program level but no implementation
 *                 of this capability exists in the tree.
 */
export type EvidenceStatus = 'supported' | 'partial' | 'ci-pending' | 'absent';

/** The canonical id for each standard the brief claims. */
export type ClaimedStandardId =
  | 'us-core-uscdi'
  | 'davinci-pas'
  | 'davinci-crd'
  | 'davinci-dtr'
  | 'carin'
  | 'smart'
  | 'cds-hooks'
  | 'cms-0057-f'
  | 'ihe-pix-pdq'
  | 'ihe-pixm-pdqm'
  | 'x12-834'
  | 'x12-837'
  | 'x12-835'
  | 'x12-278'
  | 'x12-270-271'
  | 'terminology'
  | 'part2-hipaa'
  | 'npi-nppes';

/** The evidence backing one capability. Every field is required except the seam anchor. */
export interface Evidence {
  /** A real source path (dir or file) where the capability is implemented. */
  codePath: string;
  /**
   * A real, existing test FILE path (repo-relative) that proves the capability,
   * or null when the capability is ci-pending/absent with no proving test.
   * The matrix test asserts a non-null value resolves on disk.
   */
  testId: string | null;
  /** Explicit conformance state (E9: never defaulted). */
  status: EvidenceStatus;
  /** Honest one-line scope note: what IS and what is NOT covered. */
  note: string;
  /**
   * Optional dataMode seam this capability is anchored to. When set, the matrix
   * test cross-checks config/seamDispositions.ts: a fail-closed-stub or mock-only
   * seam can NEVER back a `supported` row.
   */
  seamId?: DataModeSeam;
}

/** One capability within a standard, plus its evidence. */
export interface Capability {
  /** Stable kebab-case id, unique within the whole matrix. */
  id: string;
  /** Human-readable capability label. */
  capability: string;
  evidence: Evidence;
}

/** One claimed standard and every capability the matrix tracks for it. */
export interface StandardEntry {
  /** Canonical claimed-standard id (must be a member of CLAIMED_STANDARDS). */
  claimId: ClaimedStandardId;
  /** Full display name of the standard. */
  standard: string;
  capabilities: Capability[];
}

/** The whole conformance matrix. */
export type ConformanceMatrix = readonly StandardEntry[];

// ── Machine-readable output types (consumed by waves B and C) ─────────────────

/** A single flattened evidence row — the unit waves B and C iterate. */
export interface MatrixRow {
  claimId: ClaimedStandardId;
  standard: string;
  capabilityId: string;
  capability: string;
  codePath: string;
  testId: string | null;
  status: EvidenceStatus;
  note: string;
  seamId?: DataModeSeam;
}

/** Deterministic counts by status. */
export interface StatusCounts {
  supported: number;
  partial: number;
  'ci-pending': number;
  absent: number;
}

/** The machine-readable matrix document. Deterministic: no timestamps, no rng. */
export interface MatrixDocument {
  /** Framework version this matrix was authored against. */
  version: string;
  /** Every claimed standard id the matrix is required to cover. */
  claimedStandards: readonly ClaimedStandardId[];
  /** Distinct claimId count present in the rows. */
  standardsCovered: number;
  counts: StatusCounts;
  rows: readonly MatrixRow[];
}
