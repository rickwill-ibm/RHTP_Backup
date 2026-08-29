/**
 * PAS request bundle builder (Workstream A: H1, H2, H7, M2 inputs).
 *
 * Produces a Da Vinci PAS-shaped FHIR request Bundle from the patient's CONTEXT (not constants),
 * the order, and the DTR evidence:
 *   • Claim (use=preauthorization) referencing a real Patient resource id — NOT the member id (H7);
 *   • insurance → a bundled Coverage (subscriberId = member id), payor → a bundled Organization (H2);
 *   • the DTR evidence travels: a QuestionnaireResponse per procedure + every uploaded
 *     DocumentReference, bundled AND referenced from Claim.supportingInfo (H1);
 *   • the referenced Patient, Coverage, Organization, Practitioner, and ServiceRequest(s) are all
 *     bundled so the request is self-contained (H2).
 *
 * Pure + deterministic: `now` is supplied and all resource ids are derived, so the same input
 * yields byte-identical output (no crypto.randomUUID, no wall-clock).
 */
import type { DocumentReference, DtrMatchResult, PaOrder } from '@/lib/pa/pa-types';
import type { PatientContext } from '@/lib/pa/patientContext';
import type { QuestionnaireResponse } from '@/lib/dtr/questionnaireResponse';
import { dtrToQuestionnaireResponse } from '@/lib/pa/dtrQuestionnaireResponse';

export const PAS_REQUEST_BUNDLE_PROFILE =
  'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-pas-request-bundle';

export type FhirResource = { resourceType: string } & Record<string, unknown>;
export interface BundleEntry {
  fullUrl?: string;
  resource: FhirResource;
}
export interface PasRequestBundle {
  resourceType: 'Bundle';
  id: string;
  meta: { profile: string[] };
  type: 'collection';
  timestamp: string;
  entry: BundleEntry[];
}

export interface BuildPasInput {
  channel: 'fhir' | 'edi';
  ctx: PatientContext;
  order: PaOrder;
  dtr: DtrMatchResult[];
  /** ISO timestamp — supplied for determinism. */
  now: string;
  /** Canonical DTR questionnaire URL per procedure code (from the published coverage rule). */
  questionnaireCanonicalByCode?: Record<string, string>;
}

/** A FHIR-id-safe token: allowed chars only, trimmed, and capped at 60 (FHIR id max is 64, leaving
 *  room for a `prefix-` from the caller). */
function idSafe(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9.-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
      .replace(/-$/, '') || 'x'
  );
}

export function buildPasRequestBundle(input: BuildPasInput): PasRequestBundle {
  const { ctx, order, dtr, now } = input;
  const memberId = ctx.coverage.memberId;
  // A FHIR resource id allows only [A-Za-z0-9.-]; the app's patient keys (e.g. "MARIA_SD_001") can
  // carry underscores, so sanitize for the bundled Patient.id and reference it consistently. The raw
  // key is preserved as a Patient identifier below.
  const patientFhirId = idSafe(ctx.patientId);
  const patientRef = `Patient/${patientFhirId}`;
  const coverageId = `coverage-${idSafe(memberId)}`;
  const orgId = `org-${idSafe(ctx.coverage.payerId)}`;
  const practitionerId = `prac-${idSafe(order.orderingProvider) || 'ordering'}`;
  const claimId = `claim-${idSafe(memberId)}`;
  const bundleId = `pas-bundle-${idSafe(memberId)}`;

  // ── DTR evidence: one QuestionnaireResponse per procedure + collected DocumentReferences ──
  const questionnaireResponses: { id: string; resource: QuestionnaireResponse }[] = dtr.map(
    (d, i) => ({
      id: `qr-${idSafe(d.cptCode) || i}`,
      resource: dtrToQuestionnaireResponse(d, ctx, {
        questionnaireCanonical: input.questionnaireCanonicalByCode?.[d.cptCode],
      }),
    })
  );
  const documentReferences: { id: string; resource: DocumentReference }[] = [];
  dtr.forEach((d) => {
    d.groups.forEach((g) => {
      if (g.uploadedDocumentReference) {
        documentReferences.push({
          id: `docref-${idSafe(d.cptCode)}-${g.id}`,
          resource: g.uploadedDocumentReference,
        });
      }
    });
  });

  // ── ServiceRequests (one per ordered procedure) ──
  const serviceRequests = order.procedures.map((p, i) => ({
    id: `sr-${idSafe(p.cpt)}-${i}`,
    resource: {
      resourceType: 'ServiceRequest',
      id: `sr-${idSafe(p.cpt)}-${i}`,
      status: 'active',
      intent: 'order',
      subject: { reference: patientRef },
      code: { coding: [{ system: p.cptSystem, code: p.cpt, display: p.cptDesc }] },
      requester: { reference: `Practitioner/${practitionerId}`, display: order.orderingProvider },
    } as FhirResource,
  }));

  // ── Claim.supportingInfo: reference every QR + DocumentReference (H1 — evidence travels) ──
  let seq = 0;
  const supportingInfo = [
    ...questionnaireResponses.map((qr) => ({
      sequence: (seq += 1),
      category: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
            code: 'info',
          },
        ],
        text: 'DTR QuestionnaireResponse',
      },
      valueReference: { reference: `QuestionnaireResponse/${qr.id}` },
    })),
    ...documentReferences.map((dr) => ({
      sequence: (seq += 1),
      category: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
            code: 'attachment',
          },
        ],
        text: 'Supporting documentation',
      },
      valueReference: { reference: `DocumentReference/${dr.id}` },
    })),
  ];

  const claim: FhirResource = {
    resourceType: 'Claim',
    id: claimId,
    status: 'active',
    type: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' },
      ],
    },
    use: 'preauthorization',
    patient: { reference: patientRef, display: ctx.name },
    created: now,
    insurer: { reference: `Organization/${orgId}`, display: ctx.coverage.payer },
    provider: { reference: `Practitioner/${practitionerId}`, display: order.orderingProvider },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: { reference: `Coverage/${coverageId}`, display: ctx.coverage.plan },
      },
    ],
    item: order.procedures.map((p, i) => ({
      sequence: i + 1,
      productOrService: { coding: [{ system: p.cptSystem, code: p.cpt, display: p.cptDesc }] },
      // tie each line to its ServiceRequest via a supportingInfo-style reference on the bundle
    })),
    supportingInfo,
  };

  const patient: FhirResource = {
    resourceType: 'Patient',
    id: patientFhirId,
    identifier: [
      {
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MB' }],
        },
        system: `urn:rhtp:payer:${ctx.coverage.payerId}:member`,
        value: memberId,
      },
      // preserve the app's original patient key as a business identifier
      { system: 'urn:rhtp:patient-key', value: ctx.patientId },
    ],
    name: [{ text: ctx.name }],
    birthDate: ctx.dob,
  };

  const coverage: FhirResource = {
    resourceType: 'Coverage',
    id: coverageId,
    status: ctx.coverage.coverageStatus === 'active' ? 'active' : 'cancelled',
    subscriberId: memberId,
    beneficiary: { reference: patientRef },
    payor: [{ reference: `Organization/${orgId}`, display: ctx.coverage.payer }],
    class: [
      {
        type: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'plan' },
          ],
        },
        value: ctx.coverage.plan,
        name: ctx.coverage.plan,
      },
    ],
  };

  const organization: FhirResource = {
    resourceType: 'Organization',
    id: orgId,
    name: ctx.coverage.payer,
  };

  const practitioner: FhirResource = {
    resourceType: 'Practitioner',
    id: practitionerId,
    name: [{ text: order.orderingProvider }],
  };

  const entry: BundleEntry[] = [
    { fullUrl: `urn:uuid:${claimId}`, resource: claim },
    { fullUrl: `urn:uuid:${patientFhirId}`, resource: patient },
    { fullUrl: `urn:uuid:${coverageId}`, resource: coverage },
    { fullUrl: `urn:uuid:${orgId}`, resource: organization },
    { fullUrl: `urn:uuid:${practitionerId}`, resource: practitioner },
    ...serviceRequests.map((sr) => ({ fullUrl: `urn:uuid:${sr.id}`, resource: sr.resource })),
    ...questionnaireResponses.map((qr) => ({
      fullUrl: `urn:uuid:${qr.id}`,
      // keep the embedded QR's subject consistent with the bundled Patient.id
      resource: { ...qr.resource, id: qr.id, subject: { reference: patientRef } } as FhirResource,
    })),
    ...documentReferences.map((dr) => ({
      fullUrl: `urn:uuid:${dr.id}`,
      resource: { ...dr.resource, id: dr.id } as unknown as FhirResource,
    })),
  ];

  return {
    resourceType: 'Bundle',
    id: bundleId,
    meta: { profile: [PAS_REQUEST_BUNDLE_PROFILE] },
    type: 'collection',
    timestamp: now,
    entry,
  };
}

/** Find all resources of a type in a bundle (test/consumer helper). */
export function resourcesOfType(bundle: PasRequestBundle, resourceType: string): FhirResource[] {
  return bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === resourceType);
}
