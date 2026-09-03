/**
 * PAS — DaVinci Prior Authorization Support
 *
 * Submits a DaVinci PAS Claim Bundle to POST /Claim/$submit on the fhir-service
 * (port 8080), which routes through to the payer's adjudication logic.
 *
 * The response is a Bundle containing a ClaimResponse with one of:
 *   outcome = 'complete'  → approved / denied (disposition text carries decision)
 *   outcome = 'queued'    → pended (async; caller should poll useClaimResponseByRequest)
 */

import type { FhirServiceRequest } from '@/lib/smartFhirTypes';
import { getFhirMockMode } from '@/lib/services/fhirClient';

const PAS_BASE =
  (process.env.NEXT_PUBLIC_PAS_ENDPOINT ?? 'http://localhost:8080/fhir/r4/Claim').replace(
    /\/\$submit$/,
    '',
  );

export type PaOutcome = 'approved' | 'pended' | 'denied' | 'error';

export interface PaSubmitResult {
  claimId: string;
  claimResponseId: string;
  outcome: PaOutcome;
  disposition?: string;
}

/** Build a minimal DaVinci PAS Claim resource from a ServiceRequest. */
function buildClaim(params: {
  serviceRequest: FhirServiceRequest;
  patientId: string;
  practitionerId: string;
  coverageId?: string;
  questionnaireResponseId?: string;
}): Record<string, unknown> {
  const { serviceRequest, patientId, practitionerId, coverageId, questionnaireResponseId } = params;
  return {
    resourceType: 'Claim',
    meta: { profile: ['http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-claim'] },
    status: 'active',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
    use: 'preauthorization',
    patient: { reference: `Patient/${patientId}` },
    created: new Date().toISOString(),
    insurer: { reference: 'Organization/payer-001' },
    provider: { reference: `Practitioner/${practitionerId}` },
    priority: { coding: [{ code: serviceRequest.priority ?? 'normal' }] },
    ...(coverageId
      ? { insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverageId}` } }] }
      : {}),
    supportingInfo: questionnaireResponseId
      ? [
          {
            sequence: 1,
            category: { coding: [{ system: 'http://hl7.org/fhir/us/davinci-pas/CodeSystem/PASSupportingInfoType', code: 'patientEvent' }] },
            valueReference: { reference: `QuestionnaireResponse/${questionnaireResponseId}` },
          },
        ]
      : [],
    item: [
      {
        sequence: 1,
        extension: [
          {
            url: 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/extension-itemTraceNumber',
            valueIdentifier: { value: `TRACE-${Date.now()}` },
          },
        ],
        productOrService: serviceRequest.code,
        servicedDate: new Date().toISOString().slice(0, 10),
        quantity: { value: 1 },
      },
    ],
  };
}

function mapOutcome(outcome?: string, disposition?: string): PaOutcome {
  if (outcome === 'complete') {
    const d = (disposition ?? '').toLowerCase();
    if (d.includes('denied') || d.includes('not approved')) return 'denied';
    return 'approved';
  }
  if (outcome === 'queued') return 'pended';
  return 'error';
}

export async function submitPriorAuthClaim(params: {
  serviceRequest: FhirServiceRequest;
  patientId: string;
  practitionerId: string;
  coverageId?: string;
  questionnaireResponseId?: string;
}): Promise<PaSubmitResult> {
  if (getFhirMockMode()) {
    // Return a realistic mock pended response
    return {
      claimId: `claim-mock-${Date.now()}`,
      claimResponseId: `claimresponse-mock-${Date.now()}`,
      outcome: 'pended',
      disposition: 'Payer review pending (mock)',
    };
  }

  const claim = buildClaim(params);
  const bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [{ resource: claim }],
  };

  const res = await fetch(`${PAS_BASE}/$submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(bundle),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PAS $submit failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const responseBundle = await res.json() as {
    entry?: Array<{ resource?: { resourceType?: string; id?: string; outcome?: string; disposition?: string; request?: { reference?: string } } }>;
  };

  const claimResponse = responseBundle.entry?.find(
    (e) => e.resource?.resourceType === 'ClaimResponse',
  )?.resource;
  const claimResource = responseBundle.entry?.find(
    (e) => e.resource?.resourceType === 'Claim',
  )?.resource;

  return {
    claimId: claimResource?.id ?? 'unknown',
    claimResponseId: claimResponse?.id ?? 'unknown',
    outcome: mapOutcome(claimResponse?.outcome, claimResponse?.disposition),
    disposition: claimResponse?.disposition,
  };
}
