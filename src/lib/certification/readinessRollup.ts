/**
 * readinessRollup.ts — the ONE place per-standard certification-READINESS status
 * is derived, and the bridge that makes the conformance MATRIX the single source
 * of truth for the certification-readiness doc.
 *
 * WHY THIS EXISTS (Iteration 10 Wave D — convergence to DRY).
 *   Three artifacts made status claims about the same standards: the capability
 *   MATRIX (this dir), the FHIR CapabilityStatement (capabilityStatement/), and
 *   the readiness doc (docs/certification). Wave C armed a comparator that reads a
 *   matrix summary at docs/certification/capability-matrix.summary.json and asserts
 *   the readiness status of every standard EQUALS the matrix's. This module PRODUCES
 *   that summary from the live matrix, so the readiness statuses are no longer an
 *   independently-authored copy: they are validated against a matrix-derived rollup.
 *
 * TWO VOCABULARIES, ONE DERIVATION.
 *   The matrix grades each CAPABILITY on an implementation axis
 *   (supported | partial | ci-pending | absent). The readiness doc grades each
 *   STANDARD on a certification axis (ready | ci-pending | partial | absent). These
 *   are different questions: a standard whose capabilities are all `supported` in CI
 *   can still be only `ci-pending` for certification because no accredited suite or
 *   live integration has run (NS-05: live-integration-executed count is 0). So the
 *   readiness status is NOT a mechanical max of capability statuses; it is derived
 *   from a single declared per-standard `ciCeiling` (the highest CI-provable
 *   maturity), and E9 invariants cross-check that ceiling against the REAL capability
 *   statuses so it can never be set more optimistically than the matrix substantiates.
 */
import { CONFORMANCE_MATRIX, MATRIX_VERSION, CLAIMED_STANDARDS } from './matrix';
import type { ClaimedStandardId, EvidenceStatus } from './types';

/** The readiness axis. `ready` is in the vocabulary but never emitted (NS-05). */
export type ReadinessStatus = 'ready' | 'ci-pending' | 'partial' | 'absent';

/**
 * The highest maturity a standard can be PROVEN to in CI today. This is the single
 * authored judgment per standard; the readiness status derives from it 1:1.
 *  - `wire-absent`     The protocol/wire itself is not implemented (only a seam or
 *                      fake-transport logic exists). Derives to `absent`.
 *  - `material-ci-gap` A substantiated subset is implemented and tested, but a
 *                      material conformance gap remains even in CI. Derives to `partial`.
 *  - `ci-complete`     The protocol logic is fully implemented and exercised in CI
 *                      against fixtures/fakes; only live infra, an accredited suite,
 *                      or licensed content blocks certification. Derives to `ci-pending`.
 */
export type CiCeiling = 'wire-absent' | 'material-ci-gap' | 'ci-complete';

interface ReadinessStandardDef {
  /** Readiness id (the 13-standard set the readiness doc + comparator use). */
  id: string;
  name: string;
  /** The matrix claim ids this readiness standard aggregates (a partition of all 18). */
  claimIds: readonly ClaimedStandardId[];
  ciCeiling: CiCeiling;
}

/**
 * The 13 readiness standards, each mapped to the matrix claim ids it aggregates.
 * The X12 family collapses to one `x12`; IHE PIX/PDQ absorbs PIXm/PDQm. Every one
 * of the 18 CLAIMED_STANDARDS appears in exactly one entry (asserted by the test).
 */
export const READINESS_STANDARDS: readonly ReadinessStandardDef[] = [
  { id: 'us-core-uscdi', name: 'US Core / USCDI', claimIds: ['us-core-uscdi'], ciCeiling: 'material-ci-gap' },
  { id: 'davinci-pas', name: 'Da Vinci PAS', claimIds: ['davinci-pas'], ciCeiling: 'ci-complete' },
  { id: 'davinci-crd', name: 'Da Vinci CRD', claimIds: ['davinci-crd'], ciCeiling: 'ci-complete' },
  { id: 'davinci-dtr', name: 'Da Vinci DTR', claimIds: ['davinci-dtr'], ciCeiling: 'ci-complete' },
  { id: 'carin', name: 'CARIN (Blue Button)', claimIds: ['carin'], ciCeiling: 'material-ci-gap' },
  { id: 'smart', name: 'SMART on FHIR', claimIds: ['smart'], ciCeiling: 'ci-complete' },
  { id: 'cds-hooks', name: 'CDS Hooks', claimIds: ['cds-hooks'], ciCeiling: 'ci-complete' },
  { id: 'cms-0057-f', name: 'CMS-0057-F APIs', claimIds: ['cms-0057-f'], ciCeiling: 'material-ci-gap' },
  {
    id: 'ihe-pix-pdq',
    name: 'IHE PIX / PDQ (+ PIXm / PDQm)',
    claimIds: ['ihe-pix-pdq', 'ihe-pixm-pdqm'],
    ciCeiling: 'wire-absent',
  },
  {
    id: 'x12',
    name: 'X12 EDI (834 / 837 / 835 / 278 / 270-271)',
    claimIds: ['x12-834', 'x12-837', 'x12-835', 'x12-278', 'x12-270-271'],
    ciCeiling: 'material-ci-gap',
  },
  { id: 'terminology', name: 'Terminology services', claimIds: ['terminology'], ciCeiling: 'ci-complete' },
  { id: 'part2-hipaa', name: '42 CFR Part 2 / HIPAA', claimIds: ['part2-hipaa'], ciCeiling: 'material-ci-gap' },
  { id: 'npi-nppes', name: 'NPI / NPPES provider identity', claimIds: ['npi-nppes'], ciCeiling: 'material-ci-gap' },
] as const;

/** ciCeiling -> readiness status. Never emits `ready` (that requires live/accredited proof). */
export function statusForCeiling(ceiling: CiCeiling): ReadinessStatus {
  switch (ceiling) {
    case 'wire-absent':
      return 'absent';
    case 'material-ci-gap':
      return 'partial';
    case 'ci-complete':
      return 'ci-pending';
  }
}

/** Aggregate capability-status counts across the claim ids of a readiness standard. */
export function capabilityStatusCounts(claimIds: readonly ClaimedStandardId[]): Record<EvidenceStatus, number> {
  const counts: Record<EvidenceStatus, number> = { supported: 0, partial: 0, 'ci-pending': 0, absent: 0 };
  for (const entry of CONFORMANCE_MATRIX) {
    if (!claimIds.includes(entry.claimId)) continue;
    for (const cap of entry.capabilities) counts[cap.evidence.status] += 1;
  }
  return counts;
}

export interface ReadinessRollupRow {
  id: string;
  name: string;
  status: ReadinessStatus;
  ciCeiling: CiCeiling;
  claimIds: readonly ClaimedStandardId[];
  capabilityStatuses: Record<EvidenceStatus, number>;
}

export interface MatrixReadinessSummary {
  version: string;
  kind: 'capability-matrix-rollup';
  generatedFrom: string;
  claimedStandards: readonly ClaimedStandardId[];
  readinessStandards: number;
  standards: ReadinessRollupRow[];
}

/**
 * Build the deterministic matrix->readiness rollup. This is the machine-readable
 * summary written to docs/certification/capability-matrix.summary.json and consumed
 * by tests/certification/readiness.test.ts. No clocks, no rng: identical every build.
 */
export function buildMatrixReadinessSummary(): MatrixReadinessSummary {
  const standards: ReadinessRollupRow[] = READINESS_STANDARDS.map((def) => ({
    id: def.id,
    name: def.name,
    status: statusForCeiling(def.ciCeiling),
    ciCeiling: def.ciCeiling,
    claimIds: def.claimIds,
    capabilityStatuses: capabilityStatusCounts(def.claimIds),
  }));
  return {
    version: MATRIX_VERSION,
    kind: 'capability-matrix-rollup',
    generatedFrom: 'src/lib/certification (buildMatrixDocument -> readinessRollup)',
    claimedStandards: CLAIMED_STANDARDS,
    readinessStandards: standards.length,
    standards,
  };
}

/**
 * E9 / honesty invariants tying each readiness status to the REAL capability
 * statuses. Returns the list of violations (empty = honest). The rollup test fails
 * on any non-empty result, so a ceiling can never be set more optimistically than
 * the matrix substantiates.
 */
export function rollupInvariantViolations(): string[] {
  const problems: string[] = [];
  for (const row of buildMatrixReadinessSummary().standards) {
    const c = row.capabilityStatuses;
    const nonAbsent = c.supported + c.partial + c['ci-pending'];
    // Never certify from a readiness summary.
    if (row.status === 'ready') problems.push(`${row.id}: readiness must never be 'ready' (NS-05)`);
    // `absent` cannot sit over a `supported` capability.
    if (row.status === 'absent' && c.supported > 0) {
      problems.push(`${row.id}: 'absent' but ${c.supported} supported capability(ies) exist`);
    }
    // `ci-pending` claims "fully in CI" — no capability may be entirely absent.
    if (row.status === 'ci-pending' && c.absent > 0) {
      problems.push(`${row.id}: 'ci-pending' but ${c.absent} absent capability(ies) exist`);
    }
    // Any non-absent readiness status needs at least one implemented capability.
    if (row.status !== 'absent' && nonAbsent === 0) {
      problems.push(`${row.id}: status '${row.status}' but no implemented capability`);
    }
    // Every aggregated claim id must actually exist in the matrix.
    for (const claimId of row.claimIds) {
      if (!CLAIMED_STANDARDS.includes(claimId)) problems.push(`${row.id}: unknown claim id ${claimId}`);
    }
  }
  return problems;
}
