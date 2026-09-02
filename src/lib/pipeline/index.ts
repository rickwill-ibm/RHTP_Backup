// CONTRACT: C9  // CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay
/**
 * Pipeline reference architecture (plan §4A) — public surface. Five stages, three
 * representative source adapters (batch / stream / flat-file), lane-agnostic
 * transforms, staging + quarantine, reconciliation gates, and segmentation-at-
 * transform. Stage 5 propagation rides the outbox library (src/lib/outbox).
 */
export type {
  PipelineStage,
  ArrivalMode,
  SourceFormat,
  WpcDomain,
  Tier,
  SourceDescriptor,
  PipelineDeps,
  IdentityResolver,
  DemographicTraits,
  ResolveIdentityTraits,
  LandedBatch,
  RawRecord,
  ValidationIssue,
  ValidationResult,
  ConsentLabel,
  NormalizedRecord,
  QuarantineRecord,
  TransformOutcome,
  ReconciliationReport,
  DomainAdapter,
  StageContract,
} from './types';

export {
  defaultPipelineDeps,
  defaultIdentityResolver,
  selectIdentityResolver,
  landStage,
  stageValidate,
  transformEnrich,
  hash,
  PIPELINE_STAGE_NAMES,
  type LandInput,
  type StageValidateOutput,
} from './stages';

export {
  runTransform,
  batchStep,
  streamConsumer,
  packageBothLanes,
  reconcile,
  assertBalanced,
  buildQuarantineRecord,
  buildHeldRecord,
  ReconciliationError,
  type BatchStepResult,
} from './transform';

export { HeldIdentityError, isHeldIdentityError, type HeldIdentitySignal } from './heldIdentity';

export {
  applySegmentation,
  labelsFromHints,
  readHints,
  SEGMENTATION_RULES,
  type SegmentationRule,
} from './segmentation';

export {
  conformAndLoad,
  projectAndPropagate,
  toIntentInput,
  defaultProfileValidator,
  CONFORM_LOAD_CONTRACT,
  PROJECT_PROPAGATE_CONTRACT,
  type FhirProfileValidator,
  type LoadDeps,
  type ConformLoadResult,
} from './load';

export {
  structuralProfileValidator,
  productionProfileValidator,
  selectProfileValidator,
  ProfileValidatorNotConfiguredError,
} from './profileValidator';

export { runPipeline, type PipelineRunResult } from './pipeline';

export { eligibility834Adapter } from './adapters/eligibility834';
export { adtEncounterAdapter } from './adapters/adtEncounter';
export { cboSdohAdapter } from './adapters/cboSdoh';
// ── WPC payer dimensions (append-only): FHIR-JSON front doors for Coverage /
// Encounter (reuse existing specs) + NEW RiskAssessment / Flag projected domains.
export { coverageFhirAdapter, type CoverageFhirPayload } from './adapters/coverageFhir';
export { encounterFhirAdapter, type EncounterFhirPayload } from './adapters/encounterFhir';
export { riskAssessmentAdapter, type RiskAssessmentPayload } from './adapters/riskAssessment';
export { flagAdapter, type FlagPayload } from './adapters/flag';
export {
  medicationAdapter,
  type MedicationPayload,
  type MedicationDispensePayload,
} from './adapters/medication';
export { labAdapter, type ObservationPayload } from './adapters/lab';
// ── R3 (append-only): route SDOH (social-history) + BH-survey (survey) Observations
// to their OWN domains via new adapters over the EXISTING sdoh / behavioral-health
// specs. No new mapping spec or WpcDomain is introduced (20/20 record domains hold).
export {
  sdohObservationAdapter,
  isSocialHistory,
  classifyScreenResult,
  type SdohObservationPayload,
} from './adapters/sdohObservation';
export {
  bhObservationAdapter,
  isSurvey,
  type BhObservationPayload,
} from './adapters/bhObservation';
export { allergyAdapter, type AllergyPayload } from './adapters/allergy';
export { procedureAdapter, type ProcedurePayload } from './adapters/procedure';
export {
  careTeamAdapter,
  type CareTeamPayload,
  type CareTeamParticipant,
} from './adapters/careTeam';
export { goalTaskAdapter, type GoalPayload, type TaskPayload } from './adapters/goalTask';
export { referralAdapter, type ReferralPayload } from './adapters/referral';
export { immunizationAdapter, type ImmunizationPayload } from './adapters/immunization';
export {
  claimsFinancialAdapter,
  type AdjustmentCode,
  type ClaimPayload,
  type ClaimResponsePayload,
  type EobPayload,
} from './adapters/claimsFinancial';
export {
  priorAuthLifecycleAdapter,
  type PaStatusPhase,
  type PriorAuthLifecyclePayload,
} from './adapters/priorAuthLifecycle';
export { behavioralHealthAdapter, type BehavioralHealthPayload } from './adapters/behavioralHealth';
export {
  evaluatePart2Basis,
  part2Applies,
  isSudDiagnosis,
  isSudCoding,
  isBehavioralHealthDiagnosis,
  isFederallyAssistedSudProgram,
  classifyProgram,
  FEDERALLY_ASSISTED_SUD_PROGRAM_TYPES,
  RECOGNIZED_NON_PART2_PROGRAM_TYPES,
  type Part2BasisContext,
  type Part2BasisResult,
  type ProgramClass,
} from './part2Basis';
export {
  assessmentAdapter,
  type AssessmentPayload,
  type AssessmentItem,
} from './adapters/assessment';
export { caregiverAdapter, type CaregiverPayload } from './adapters/caregiver';
export { documentAdapter, type DocumentPayload, type DocumentPointer } from './adapters/document';

// ── Iteration 11 Wave B (append-only): conditions + diagnostic-reports + family-history.
export { conditionsAdapter, type ConditionPayload } from './adapters/conditions';
export {
  diagnosticReportsAdapter,
  type DiagnosticReportPayload,
  type PresentedFormPointer,
} from './adapters/diagnosticReports';
export { familyHistoryAdapter, type FamilyHistoryPayload } from './adapters/familyHistory';

// ── I8A-ii Wave C: stage-4 semantic gate bound at transform (code-carrying domains).
export {
  bindSemantics,
  isCodeCarryingDomain,
  currencyPostureFromConfig,
  CODE_CARRYING_DOMAINS,
  type SemanticBindingOptions,
} from './semanticBinding';
