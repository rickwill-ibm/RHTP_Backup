/**
 * Terminology / semantic-validation seam — public surface.
 *
 * validateCode / translate / classify over the governed code systems (RxNorm,
 * LOINC, SNOMED-CT, ICD-10-CM, CPT-HCPCS, HCC). The seeded service answers demo
 * data from an in-repo allowlist; the production service throws until a real FHIR
 * terminology server is wired. The SemanticValidator is the stage-4 gate that
 * runs alongside the structural profile validator.
 */
export {
  TERMINOLOGY_SYSTEMS,
  SYSTEM_URIS,
  systemForUri,
  TerminologyServiceNotConfiguredError,
} from './types';
export type {
  TerminologySystem,
  TerminologyService,
  CodeValidation,
  CodeValidationStatus,
  TranslationResult,
  ClassificationResult,
  ClassificationScheme,
} from './types';
export { seedTerminologyService } from './seedTerminologyService';
export { productionTerminologyService } from './productionTerminologyService';

// ── I8A-ii wave A (real validateCode + $expand + version/retired + UCUM) — appended block ──
export {
  createSeedTerminologyService,
  type SeedTerminologyOptions,
} from './seedTerminologyService';
export {
  validateCodeVersioned,
  bindingForSystem,
  isGovernedSystem,
  systemDisplay,
  currentMembers,
  membersForVersion,
  declaredCurrentVersion,
  retiredInCurrent,
  isRetiredInCurrent,
  validateUcumForLoinc,
  isValidUcumUnit,
  allowedUnitsForLoinc,
  type ValidateContext,
  type UcumValidation,
  type UcumFinding,
} from './validateCode';
export {
  expandValueSet,
  type ValueSetExpansion,
  type ExpansionEntry,
  type ExpandOptions,
} from './expand';
export { extractLoincQuantities, type LoincQuantity } from './semanticValidator';
export {
  makeSemanticValidator,
  selectSemanticValidator,
  selectTerminologyService,
  extractGovernedCodings,
  type SemanticValidator,
  type GovernedCoding,
} from './semanticValidator';
export type { CodeAssetBinding } from './types';

// The terminology-asset management facility (registry): currency, versioning,
// and lifecycle of all governed value sets / code systems / classifications.
export {
  createValueSetRegistry,
  valueSetRegistry,
  validateAgainstAssetVersion,
  TerminologyRefreshNotConfiguredError,
  ASSET_FAMILIES,
  ASSET_STATUSES,
  BINDING_STRENGTHS,
  REFRESH_CADENCES,
  CADENCE_DAYS,
  type ValueSetRegistry,
  type RegistryOptions,
  type Clock,
  type CurrencyCheckedValidation,
  type AssetFamily,
  type AssetStatus,
  type BindingStrength,
  type RefreshCadence,
  type TerminologyAsset,
  type BindingSpec,
  type ResolvedBinding,
  type CurrencyFlag,
  type AssetRegistrySeed,
} from './registry';

// ── I8A-ii Wave B ($translate cross-map) - appended block ────────────────────
// $translate over the seeded crosswalks (ICD-10-CM <-> CMS-HCC, SNOMED-CT <->
// ICD-10-CM): the target coding(s) with the crosswalk asset id + version, NO-MAP
// (never a fabricated target) for an untranslatable code, live path fail-closed.
export {
  makeCrosswalkTranslator,
  seedCrosswalkTranslator,
  liveCrosswalkTranslator,
  selectCrosswalkTranslator,
} from './translate';
export type {
  CrosswalkTranslator,
  CrosswalkTranslation,
  CrosswalkTarget,
  CrosswalkProvenance,
} from './translate';

// ── I8A-ii Wave B (classification + risk families) - appended block ──────────
// Data-driven, versioned diagnosis-to-HCC classification + the risk-family
// taxonomy (CMS-HCC / RxHCC / HHS-HCC / CDPS) as data (HCC is one of several).
export {
  makeHccClassifier,
  seedHccClassifier,
  liveHccClassifier,
  selectHccClassifier,
  riskFamilyTaxonomy,
} from './classify';
export type { HccClassifier, HccClassification, HccModelRef, RiskFamily } from './classify';

// ── I8A-ii Wave C (value-set version currency enforcement) — appended block ────
// Currency enforcement over the registry: a bound value-set version that is
// expired / superseded / retired / stale is flagged, and under the enforce
// posture quarantines. Reused by the pipeline stage-4 binding at transform.
export {
  CURRENCY_POSTURES,
  CURRENCY_REASONS,
  currencyReasonForFlag,
  decideAssetCurrency,
  decideSystemCurrency,
  decideBindingCurrency,
} from './registry/currency';
export type { CurrencyPosture, CurrencyReason, CurrencyDecision } from './registry/currency';

// ── I8A-iii Wave A (value-set governance lifecycle) — appended block ──────────
// Version-lifecycle state machine (draft -> in-review -> approved(active) /
// rejected -> retired/superseded), ENFORCED maker-checker approval, an immutable
// PHI-free transition audit ledger + history query, chosen-version replay, and
// the valueSetGovernanceStore seam (fail-closed in production). B/C consume the
// read API + the two governance roles from this surface.
export {
  createValueSetGovernanceService,
  createInMemoryValueSetGovernanceStore,
  getValueSetGovernanceStore,
  setProductionValueSetGovernanceStoreFactory,
  replayAgainstVersion,
  allowedActions,
  canTransition,
  nextState,
  isTerminal,
  LIFECYCLE_STATES,
  GOVERNANCE_ACTIONS,
  APPROVAL_MODES,
  GOVERNANCE_ROLES,
  DEFAULT_GOVERNANCE_CONFIG,
  isGovernanceRole,
  IllegalTransitionError,
  MakerCheckerViolationError,
  VersionNotFoundError,
  ValueSetGovernanceStoreNotConfiguredError,
} from './governance';
export type {
  ValueSetGovernanceService,
  GovernanceServiceOptions,
  CreateDraftInput,
  ValueSetGovernanceStore,
  HistoryFilter,
  VersionLifecycleState,
  GovernanceAction,
  ApprovalMode,
  GovernanceConfig,
  GovernedVersionRecord,
  GovernanceTransitionRecord,
  GovernanceRole,
  GovernancePrincipal,
  ReplayInput,
  ReplayResult,
  ReplayStatus,
} from './governance';
