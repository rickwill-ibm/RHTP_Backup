/**
 * Authoring PAS bridge — the pure builder. Assembles a Da Vinci PAS-shaped request Bundle (the FHIR
 * equivalent of an X12 278 prior-authorization request) from a policy's coverage rules plus a completed
 * DTR QuestionnaireResponse (mode 'response') or a labeled specimen (mode 'specimen').
 *
 * Honest by construction: only PRIOR-AUTH-REQUIRED codes become `Claim.item` (you never request preauth
 * for a not-covered code); the davinci-pas profile is stamped ONLY in response mode (a specimen is
 * marked `synthesized`, `conformanceAsserted:false`); no clinical data is fabricated; `now` is injected,
 * ids are derived — same input ⇒ byte-identical output.
 */
import type {
  FhirBundle,
  FhirClaim,
  FhirClaimItem,
  FhirClaimSupportingInfo,
  FhirCoverage,
  FhirOrganization,
  FhirPatient,
  FhirPractitioner,
  FhirResource,
} from '@/lib/fhir/types';
import type { QuestionnaireResponse } from '@/lib/dtr/questionnaireResponse';
import { buildSpecimenResponse, SPECIMEN_IDENTIFIER_SYSTEM } from './specimenResponse';
import type { PasRequestInput, PasRequestPreview } from './types';

const PAS_PROFILE =
  'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-pas-request-bundle';
const CPT = 'http://www.ama-assn.org/go/cpt';
const HCPCS = 'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets';

/** FHIR-id-safe token (allowed chars, ≤ 50). */
function idSafe(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9.-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
      .replace(/-$/, '') || 'x'
  );
}

export function buildPasRequest(input: PasRequestInput): PasRequestPreview {
  const specimen = input.mode === 'specimen';
  const canonical = input.questionnaireCanonical;

  let response: QuestionnaireResponse;
  let missingForSubmission: string[];
  let patientRef: string;
  if (input.mode === 'specimen') {
    const r = buildSpecimenResponse(input.items, canonical);
    response = r.response;
    missingForSubmission = r.missingRequired;
    patientRef = 'Patient/specimen';
  } else {
    response = input.response;
    missingForSubmission = [];
    patientRef = input.patientRef;
  }

  const pid = idSafe(input.policyId);
  const patientId = idSafe(patientRef.replace(/^Patient\//, ''));
  const coverageId = `coverage-${pid}`;
  const orgId = `payer-${pid}`;
  const requestorId = `requestor-${pid}`;
  const qrId = `qr-${pid}`;

  // Only prior-auth-required codes belong in a preauth Claim — never a not-covered / investigational one.
  const paRules = input.coverageRules.filter((r) => r.priorAuthRequired);
  const items: FhirClaimItem[] = paRules.map((r, i) => ({
    sequence: i + 1,
    productOrService: {
      coding: [
        {
          system: r.codeSystem === 'HCPCS' ? HCPCS : CPT,
          code: r.code,
          display: r.display ?? r.code,
        },
      ],
    },
  }));

  const patient: FhirPatient = {
    resourceType: 'Patient',
    id: patientId,
    ...(specimen
      ? { identifier: [{ system: SPECIMEN_IDENTIFIER_SYSTEM, value: 'specimen' }] }
      : {}),
  };
  const org: FhirOrganization = {
    resourceType: 'Organization',
    id: orgId,
    name: input.policyTitle,
  };
  const coverage: FhirCoverage = {
    resourceType: 'Coverage',
    id: coverageId,
    status: 'active',
    beneficiary: { reference: `Patient/${patientId}` },
    payor: [{ reference: `Organization/${orgId}` }],
  };
  const requestor: FhirPractitioner = { resourceType: 'Practitioner', id: requestorId };
  const qr: QuestionnaireResponse & FhirResource = {
    ...response,
    resourceType: 'QuestionnaireResponse',
    id: qrId,
  };

  const supportingInfo: FhirClaimSupportingInfo[] = [
    {
      sequence: 1,
      category: { coding: [{ code: 'additionalInformation' }] },
      valueReference: { reference: `QuestionnaireResponse/${qrId}` },
    },
  ];

  const claim: FhirClaim = {
    resourceType: 'Claim',
    id: `claim-${pid}`,
    status: 'active',
    use: 'preauthorization',
    patient: { reference: `Patient/${patientId}` },
    ...(input.now ? { created: input.now } : {}),
    insurer: { reference: `Organization/${orgId}` },
    provider: { reference: `Practitioner/${requestorId}` },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverageId}` } }],
    supportingInfo,
    ...(items.length ? { item: items } : {}),
  };

  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    ...(specimen ? {} : { meta: { profile: [PAS_PROFILE] } }),
    entry: [claim, patient, coverage, org, requestor, qr].map((resource) => ({ resource })),
  };

  return {
    bundle,
    synthesized: specimen,
    conformanceAsserted: !specimen,
    missingForSubmission,
  };
}
