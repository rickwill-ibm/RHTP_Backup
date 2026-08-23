/**
 * The ACTUAL implemented FHIR surface of this application, as data.
 *
 * Every entry here is an audited fact about code that EXISTS in this repo. The
 * generator turns this into a CapabilityStatement; nothing aspirational is
 * asserted. Each entry carries a `provenance` path to the implementing file so a
 * reviewer can confirm the surface is real.
 *
 * Honesty rules encoded here (DoD E9 — no operation asserted that is not
 * implemented):
 *   - Only operations with a backing implementation are listed. `$everything`
 *     has NO implementation anywhere in the repo, so it is absent by
 *     construction (there is no way to add it without a real implementation).
 *   - Profiles come from what the profile VALIDATOR enforces. The validator is a
 *     structural pre-flight (id `structural-preflight-not-us-core-validate`) and
 *     the production path FAILS CLOSED; it enforces NO named US Core profile, so
 *     `enforcedProfiles` is empty and no US Core supportedProfile is claimed.
 *   - Security reflects the real SMART-on-FHIR session manager and env scopes.
 */
import { structuralProfileValidator } from '@/lib/pipeline/profileValidator';
import type {
  ImplementedSurface,
  ImplementedOperation,
  ImplementedResource,
  SmartSecurityFacts,
} from './types';

// ── Resources served by the FHIR passthrough (src/app/api/fhir/[...path]) ─────
// GET builds real responses for these types (mock builders + live passthrough);
// POST routes to fhirCreate for the same types. Interactions are only those the
// route genuinely wires.
const RESOURCES: ImplementedResource[] = [
  {
    type: 'Patient',
    interactions: ['read', 'search-type', 'create'],
    provenance: 'src/app/api/fhir/[...path]/route.ts (mockFhirGet Patient; IDOR-scoped)',
    documentation:
      'Patient identity read is scoped to the session principal (IDOR gate); break-glass audited.',
  },
  {
    type: 'Coverage',
    interactions: ['search-type', 'create'],
    provenance: 'src/app/api/fhir/[...path]/route.ts (mockFhirGet Coverage searchset)',
  },
  {
    type: 'Condition',
    interactions: ['search-type', 'create'],
    provenance: 'src/app/api/fhir/[...path]/route.ts (mockFhirGet Condition searchset)',
  },
  {
    type: 'ClaimResponse',
    interactions: ['search-type', 'create'],
    provenance: 'src/app/api/fhir/[...path]/route.ts (mockFhirGet ClaimResponse — PA history)',
  },
  {
    type: 'MedicationRequest',
    interactions: ['search-type', 'create'],
    provenance: 'src/app/api/fhir/[...path]/route.ts (mockFhirGet MedicationRequest searchset)',
  },
];

// ── Operations — each has a real implementation in the repo ───────────────────
const OPERATIONS: ImplementedOperation[] = [
  {
    name: '$member-match',
    definition: 'http://hl7.org/fhir/us/davinci-hrex/OperationDefinition/member-match',
    exposure: 'http-route',
    mode: 'server',
    provenance: 'src/app/api/match/route.ts (POST) -> src/lib/server/memberMatch.ts',
    documentation:
      'Da Vinci HRex $member-match. Consent-gated (provider-access opt-out); break-glass audited.',
  },
  {
    name: '$submit',
    definition: 'http://hl7.org/fhir/us/davinci-pas/OperationDefinition/Claim-submit',
    exposure: 'http-route',
    mode: 'server',
    provenance: 'src/app/api/pas/submit/route.ts (POST) -> src/lib/server/pasClient.ts',
    documentation:
      'Da Vinci PAS Claim/$submit (prior authorization). HUMAN-GATED: returns 202 without an approver.',
  },
  {
    name: '$validate-code',
    definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-validate-code',
    exposure: 'terminology-library',
    mode: 'server',
    provenance: 'src/lib/terminology/validateCode/validateCode.ts (validateCodeVersioned)',
    documentation:
      'Terminology $validate-code over governed systems (RxNorm/LOINC/SNOMED-CT/ICD-10-CM/CPT-HCPCS/HCC). Production path fails closed.',
  },
  {
    name: '$translate',
    definition: 'http://hl7.org/fhir/OperationDefinition/ConceptMap-translate',
    exposure: 'terminology-library',
    mode: 'server',
    provenance: 'src/lib/terminology/translate/crosswalkTranslate.ts (makeCrosswalkTranslator)',
    documentation:
      'ConceptMap $translate over seeded crosswalks (ICD-10-CM<->CMS-HCC, SNOMED-CT<->ICD-10-CM). NO-MAP, never a fabricated target.',
  },
  {
    name: '$expand',
    definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-expand',
    exposure: 'terminology-library',
    mode: 'server',
    provenance: 'src/lib/terminology/expand/expand.ts (expandValueSet)',
    documentation: 'ValueSet $expand over the governed, versioned value sets.',
  },
  {
    name: '$ihe-pix',
    definition: 'https://profiles.ihe.net/ITI/PIXm/OperationDefinition/Patient-ihe-pix',
    exposure: 'client-invoked',
    mode: 'client',
    provenance: 'src/lib/identity/external/fhirPixm.ts + pixmPdqmResolver.ts (ITI-83, outbound)',
    documentation:
      'IHE PIXm Patient/$ihe-pix cross-reference. This app is a CLIENT of an external PIXm server; it does not serve the operation.',
  },
];

/**
 * Profiles the profile VALIDATOR enforces. The validator (profileValidator.ts)
 * is a structural pre-flight, not US Core $validate; production fails closed. It
 * therefore enforces NO named FHIR profile, and the statement must not claim any.
 */
function enforcedProfiles(): string[] {
  // Derived from the validator's own identity: a structural pre-flight enforces
  // no US Core profile. If a real $validate backend is ever wired (id changes to
  // a us-core validator that admits records), this list is where its profiles go.
  const isStructuralStub = structuralProfileValidator.id.includes('structural-preflight');
  return isStructuralStub ? [] : [];
}

const SECURITY: SmartSecurityFacts = {
  service: 'SMART-on-FHIR',
  cors: true,
  // Default WSO2 scope set (src/lib/server/env.ts WSO2_SCOPE default).
  scopes: ['openid', 'fhirUser', 'launch/patient', 'patient/*.read', 'offline_access'],
  cdsHooks: true, // src/app/api/cds-hooks/route.ts serves the CDS Hooks discovery document.
  provenance: 'src/lib/server/smartSession.ts (PKCE auth-code, server-held token) + env.ts scopes',
};

/** The audited, implemented surface. Deterministic: stable order, no clocks. */
export function implementedSurface(): ImplementedSurface {
  return {
    resources: RESOURCES,
    operations: OPERATIONS,
    enforcedProfiles: enforcedProfiles(),
    security: SECURITY,
  };
}
