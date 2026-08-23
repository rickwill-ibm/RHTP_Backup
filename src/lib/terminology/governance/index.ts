/**
 * Value-set governance — public surface (I8A-iii Wave A).
 *
 * The version-lifecycle state machine, the maker-checker approval service, the
 * immutable transition audit + history query, chosen-version replay, and the
 * valueSetGovernanceStore seam. Waves B (UI) and C (routes) consume these types,
 * the read API (activeVersion / listVersions / history / replay), and the two
 * governance roles (re-exported here for a single import path).
 */
export {
  LIFECYCLE_STATES,
  GOVERNANCE_ACTIONS,
  APPROVAL_MODES,
  DEFAULT_GOVERNANCE_CONFIG,
  IllegalTransitionError,
  MakerCheckerViolationError,
  VersionNotFoundError,
  type VersionLifecycleState,
  type GovernanceAction,
  type ApprovalMode,
  type GovernanceConfig,
  type GovernedVersionRecord,
  type GovernanceTransitionRecord,
} from './types';

// The two governance roles + principal, surfaced here so B/C import from one path.
export {
  GOVERNANCE_ROLES,
  isGovernanceRole,
  type GovernanceRole,
  type GovernancePrincipal,
} from '@/lib/authz/principal/types';

export {
  allowedActions,
  canTransition,
  nextState,
  isTerminal,
} from './stateMachine';

export {
  createInMemoryValueSetGovernanceStore,
  getValueSetGovernanceStore,
  setProductionValueSetGovernanceStoreFactory,
  ValueSetGovernanceStoreNotConfiguredError,
  type ValueSetGovernanceStore,
  type HistoryFilter,
} from './store';

export {
  createValueSetGovernanceService,
  type ValueSetGovernanceService,
  type GovernanceServiceOptions,
  type CreateDraftInput,
} from './service';

export {
  replayAgainstVersion,
  type ReplayInput,
  type ReplayResult,
  type ReplayStatus,
} from './replay';

// The SINGLE maker-checker predicate — shared by the service (throws), the admin
// console gate (disables), and the BFF boundary (403). Wave D convergence.
export {
  evaluateMakerChecker,
  type MakerCheckerParams,
  type MakerCheckerDecision,
} from './makerChecker';
