/**
 * Certification — CapabilityStatement (B2, iteration 10 Wave B).
 *
 * A FHIR R4 CapabilityStatement generated deterministically from the ACTUAL
 * implemented surface of this application. Wave A (conformance matrix) may import
 * `implementedSurface` / the generated statement to cross-check its rows; this
 * module does not depend on Wave A.
 */
export { generateCapabilityStatement, serializeCapabilityStatement } from './generate';
export { implementedSurface } from './surface';
export type {
  CapabilityStatementResource,
  CapabilityRest,
  CapabilityResource,
  CapabilityOperation,
  ImplementedSurface,
  ImplementedOperation,
  ImplementedResource,
  SmartSecurityFacts,
} from './types';
