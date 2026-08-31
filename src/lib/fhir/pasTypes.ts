/**
 * Da Vinci PAS resource types (FHIR R4, partial) — Claim(use=preauthorization) + Organization.
 * Split out of `types.ts` for the file-size cap and re-exported from there so importers are unchanged.
 * Defined ONCE here so the authoring PAS bridge (`src/lib/policy/pas`) and the runtime PAS builder
 * (`src/lib/pa/pasBundle.ts`) can converge on one shape rather than two parallel `Record<string,unknown>`
 * bundles. Only the fields the CRD→DTR→PAS authoring preview consumes.
 */
import type { FhirResource, FhirReference, FhirCodeableConcept } from './types';

export interface FhirClaimSupportingInfo {
  sequence: number;
  category: FhirCodeableConcept;
  valueReference?: FhirReference;
}

export interface FhirClaimItem {
  sequence: number;
  productOrService: FhirCodeableConcept;
}

export interface FhirClaimInsurance {
  sequence: number;
  focal: boolean;
  coverage: FhirReference;
}

export interface FhirClaim extends FhirResource {
  resourceType: 'Claim';
  status: 'active' | 'draft' | 'cancelled' | 'entered-in-error';
  /** PAS is a prior-authorization request. */
  use: 'preauthorization';
  patient: FhirReference;
  created?: string;
  insurer?: FhirReference;
  provider?: FhirReference;
  priority?: FhirCodeableConcept;
  insurance: FhirClaimInsurance[];
  supportingInfo?: FhirClaimSupportingInfo[];
  item?: FhirClaimItem[];
}

export interface FhirOrganization extends FhirResource {
  resourceType: 'Organization';
  name?: string;
}
