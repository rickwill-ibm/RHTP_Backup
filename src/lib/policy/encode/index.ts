/**
 * RHTP Policy Engine — encoding layer public API.
 *
 * Pipeline: extract (CriteriaPolicy) → encodePolicy (PolicyLogic IR) → { toQuestionnaire (DTR),
 * toCoverageRules / crdCoverageInformation (CRD), evaluatePolicy (per-patient determination) } →
 * publish (store the runtime reads) → runtimeCrd (any patient / any procedure PA request).
 *
 * Design authority: docs/policy-encoder-spec.md.
 */
export * from './ir';
export { repairGlyphs, canonicalLabel, detectLabelCollisions } from './text';
export {
  encodeMeasure,
  encodeMeasures,
  parseScalarMeasure,
  parseMeasures,
  parseMeasuresDetailed,
  parseCompoundBP,
  parseCompoundBPDetailed,
} from './measure';
export {
  FIELD_REGISTRY,
  normalizeNumerals,
  nearestFieldInScope,
  resolveUnitAndRange,
  type FieldSpec,
  type UnitSpec,
  type DimensionOwner,
} from './dimensions';
export { parseTimeWindow } from './time';
export { buildValueSet, detectChoiceMin, isOpenSet } from './valueset';
export {
  adolescentPopulation,
  diabetesPopulation,
  isManualReview,
  parseThresholdVariant,
  detectMaturityConstruct,
} from './population';
export {
  isNegationHeading,
  classifyBasis,
  dominantRole,
  buildExcludedProcedure,
  buildCoveredProcedure,
  ROLE_PRECEDENCE,
} from './procedure';
export { resolveReference, parseReferenceClause } from './crossref';
export { encodePolicy } from './encode';
export {
  evaluatePolicy,
  evalMeasure,
  evalCriterion,
  evalExpr,
  type PatientFacts,
  type Determination,
  type Tri,
} from './evaluate';
export { toQuestionnaire, questionnaireUrl, type FhirQuestionnaire, type FhirItem } from './fhir';
export {
  toCoverageRules,
  crdCoverageInformation,
  criteriaNamesOf,
  type EncodedCoverageRule,
  type CrdCoverageInformation,
} from './crd';
export {
  createStore,
  publishPolicy,
  unpublish,
  coverageRuleForCode,
  questionnaireForCode,
  artifactForCode,
  type PublicationStore,
  type PublishedArtifact,
} from './publish';
export { authorAndPublish, runtimeCrd, type AuthorOptions, type RuntimeCrdResult } from './author';
