/**
 * MTM Agent — public surface.
 *
 * Only symbols listed here are accessible outside src/lib/agents/mtm/.
 * BFF routes and UI components import from this index; they never reach
 * into sub-modules directly.
 */

// Types
export type {
  DrugLookupResult,
  NdcResult,
  DrugInteraction,
  MtmFinding,
  MtmFindingType,
  MtmSeverity,
  MtmCheckInput,
  CurrentMedication,
  PatientAllergy,
  FhirDetectedIssue,
} from './types';

// Schema parse functions (BFF routes use these for boundary parsing)
export {
  parseRxNormDrugs,
  parseRxNormRelated,
  parseFdaNdcResponse,
  parseRxNavInteraction,
} from './schema';
export type {
  ParsedRxNormDrugs,
  ParsedRxNormRelated,
  ParsedFdaNdcResponse,
  ParsedRxNavInteraction,
  ParsedInteractionPair,
} from './schema';

// Engine
export { evaluate } from './mtmEngine';

// Checkers (also callable independently from BFF routes)
export { checkDuplicateTherapy } from './duplicateTherapyChecker';
export { checkRefillTooSoon } from './refillTooSoonChecker';
export { normaliseInteractions, normaliseSeverity } from './interactionChecker';
export { checkBeersCriteria } from './beersCriteriaChecker';
export { checkDrugAllergy, normaliseAllergyClasses } from './allergyChecker';
export { mapAllergiesToMtm } from './allergyMapper';
export { lookupDrugClass, resolveAllergyClasses, extractIngredient } from './drugClassTable';

// DetectedIssue builder
export { buildDetectedIssues } from './fhirDetectedIssue';

// Agent manifest
export { MTM_AGENT_MANIFEST } from './manifest';
