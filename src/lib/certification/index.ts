/**
 * certification/index.ts — public surface of the conformance matrix.
 *
 * Certification waves B (capabilityStatement) and C (docs/certification) import
 * from HERE. Wave A owns the matrix data + machine-readable document; B and C are
 * read-only consumers.
 */
export type {
  Capability,
  ClaimedStandardId,
  ConformanceMatrix,
  Evidence,
  EvidenceStatus,
  MatrixDocument,
  MatrixRow,
  StandardEntry,
  StatusCounts,
} from './types';

export {
  CLAIMED_STANDARDS,
  CONFORMANCE_MATRIX,
  MATRIX_VERSION,
  allCapabilities,
  buildMatrixDocument,
  capabilitiesWithStatus,
  coveredStandardIds,
  isStubBackedCapability,
  standardById,
  statusCounts,
  toRows,
} from './matrix';

export type {
  CiCeiling,
  ReadinessStatus,
  MatrixReadinessSummary,
  ReadinessRollupRow,
} from './readinessRollup';

export {
  READINESS_STANDARDS,
  buildMatrixReadinessSummary,
  capabilityStatusCounts,
  rollupInvariantViolations,
  statusForCeiling,
} from './readinessRollup';
