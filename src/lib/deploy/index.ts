/**
 * Deployment config + readiness preflight (iteration 9 wave B).
 *
 * Public surface: the deployment schema (what a posture requires) and the
 * startup PREFLIGHT (fail-closed readiness). The health routes and any boot
 * script import from here.
 */
export {
  REQUIRED_ENV_KEYS,
  SEAM_CONNECTION_KEYS,
  SUBSTRATE_BACKED_SEAMS,
  requiredEnvKeys,
  seamConnectionKey,
  isSubstrateBackedSeam,
  connectionKeyCompletenessProblems,
  assertConnectionKeyCompleteness,
  allDeploymentKeys,
} from './schema';

export {
  runPreflight,
  assertReadyOrThrow,
  PreflightNotReadyError,
  type ReadinessReport,
  type UnmetRequirement,
  type UnmetKind,
} from './preflight';
