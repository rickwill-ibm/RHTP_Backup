/**
 * PAS bundle + DTR→QuestionnaireResponse — conformance & routing.
 * Lenses: target-contract conformance (Da Vinci PAS shape), identity-not-conflated (H7),
 * evidence-travels (H1), round-trip (references resolve to bundled resources), determinism.
 */
import { describe, it, expect } from 'vitest';
import { buildPasRequestBundle, resourcesOfType } from '@/lib/pa/pasBundle';
import { dtrToQuestionnaireResponse, isGroupResolved } from '@/lib/pa/dtrQuestionnaireResponse';
import { getPatientContext } from '@/lib/pa/patientContext';
import type { DocumentReference, DtrMatchResult, PaOrder } from '@/lib/pa/pa-types';

function req<T>(v: T | undefined | null): T {
  if (v == null) throw new Error('missing fixture');
  return v;
}
const maria = req(getPatientContext('MARIA_SD_001'));

const docRef: DocumentReference = {
  resourceType: 'DocumentReference',
  status: 'current',
  docStatus: 'preliminary',
  type: { coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summary' }] },
  category: [{ coding: [{ system: 'x', code: 'attachment', display: 'A' }] }],
  subject: { reference: 'Patient/x' },
  date: '2026-07-20T00:00:00.000Z',
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        title: 'neuro-note.pdf',
        size: 10,
        creation: '2026-07-20T00:00:00.000Z',
      },
    },
  ],
  context: { related: [{ display: 'group 2' }] },
};

const dtr: DtrMatchResult = {
  policyTitle: 'MRI Lumbar Spine',
  cptCode: '72148',
  allMet: false,
  groups: [
    { id: 1, title: '≥ 6 Weeks Conservative Therapy', status: 'met', required: true },
    {
      id: 2,
      title: 'Neurological Deficit',
      status: 'pending',
      required: true,
      uploadedDocumentReference: docRef,
    },
    { id: 3, title: 'Ordering Specialty', status: 'gap', required: false },
  ],
};

const order: PaOrder = {
  procedures: [
    {
      cpt: '72148',
      cptSystem: 'http://www.ama-assn.org/go/cpt',
      cptDesc: 'MRI Lumbar Spine w/o Contrast',
    },
  ],
  orderingProvider: 'Dr. James Whitfield MD',
  facility: 'Frontier FQHC',
  orderDate: '07/20/2026',
};

describe('DTR → QuestionnaireResponse (one model, honest answers)', () => {
  const qr = dtrToQuestionnaireResponse(dtr, maria, { questionnaireCanonical: 'urn:q/mri' });

  it('met answers TRUE, attached carries an attachment (not a satisfied boolean), gap is unanswered', () => {
    const g1 = qr.item.find((i) => i.linkId === 'group-1');
    expect(g1?.answer?.[0].valueBoolean).toBe(true);
    const g2 = qr.item.find((i) => i.linkId === 'group-2');
    expect(g2?.answer?.[0].valueAttachment?.title).toBe('neuro-note.pdf');
    expect(g2?.answer?.[0].valueBoolean).toBeUndefined();
    const g3 = qr.item.find((i) => i.linkId === 'group-3');
    expect(g3?.answer).toBeUndefined();
  });

  it('subject references the Patient resource id, not the member id (H7)', () => {
    expect(qr.subject?.reference).toBe(`Patient/${maria.patientId}`);
    expect(qr.subject?.reference).not.toContain(maria.coverage.memberId);
  });

  it('status is in-progress while a required group is only a gap; met+attached required ⇒ resolved', () => {
    expect(qr.status).toBe('completed'); // groups 1 met, 2 attached(resolved), 3 not required
    expect(isGroupResolved(dtr.groups[1])).toBe(true);
    const withGap: DtrMatchResult = {
      ...dtr,
      groups: [{ id: 9, title: 'X', status: 'gap', required: true }],
    };
    expect(dtrToQuestionnaireResponse(withGap, maria).status).toBe('in-progress');
  });
});

describe('PAS request bundle conformance (H2)', () => {
  const bundle = buildPasRequestBundle({
    channel: 'fhir',
    ctx: maria,
    order,
    dtr: [dtr],
    now: '2026-07-20T14:00:00.000Z',
    questionnaireCanonicalByCode: { '72148': 'urn:q/mri' },
  });

  it('is a PAS request bundle with the profile', () => {
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.meta.profile[0]).toContain('profile-pas-request-bundle');
  });

  it('bundles the referenced Patient, Coverage, Organization, Practitioner, ServiceRequest', () => {
    for (const rt of [
      'Claim',
      'Patient',
      'Coverage',
      'Organization',
      'Practitioner',
      'ServiceRequest',
    ]) {
      expect(resourcesOfType(bundle, rt).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Claim.patient references the bundled Patient, not the member id (H7)', () => {
    const claim = resourcesOfType(bundle, 'Claim')[0];
    const patient = resourcesOfType(bundle, 'Patient')[0];
    const ref = (claim.patient as { reference: string }).reference;
    expect(ref).toBe(`Patient/${patient.id}`); // round-trips to the bundled Patient resource
    expect(ref).not.toContain(maria.coverage.memberId); // never the member id
    // the app's original patient key is preserved as an identifier (H7: id ≠ member id)
    const idents = patient.identifier as { system: string; value: string }[];
    expect(idents.some((i) => i.value === maria.patientId)).toBe(true);
  });

  it('insurance references a bundled Coverage whose subscriberId is the member id', () => {
    const claim = resourcesOfType(bundle, 'Claim')[0];
    const covRef = (claim.insurance as { coverage: { reference: string } }[])[0].coverage.reference;
    const coverage = resourcesOfType(bundle, 'Coverage')[0];
    expect(covRef).toBe(`Coverage/${coverage.id}`);
    expect(coverage.subscriberId).toBe(maria.coverage.memberId);
  });

  it('insurer is derived from coverage — no hardcoded "South Dakota Medicaid" constant path', () => {
    const claim = resourcesOfType(bundle, 'Claim')[0];
    expect((claim.insurer as { display: string }).display).toBe(maria.coverage.payer);
    const org = resourcesOfType(bundle, 'Organization')[0];
    expect(org.name).toBe(maria.coverage.payer);
  });
});

describe('DTR evidence travels into the bundle (H1)', () => {
  const bundle = buildPasRequestBundle({
    channel: 'fhir',
    ctx: maria,
    order,
    dtr: [dtr],
    now: '2026-07-20T14:00:00.000Z',
  });

  it('carries a QuestionnaireResponse and the uploaded DocumentReference', () => {
    expect(resourcesOfType(bundle, 'QuestionnaireResponse').length).toBe(1);
    expect(resourcesOfType(bundle, 'DocumentReference').length).toBe(1);
  });

  it('Claim.supportingInfo references every QR and DocumentReference (round-trip resolves)', () => {
    const claim = resourcesOfType(bundle, 'Claim')[0];
    const si = claim.supportingInfo as { valueReference: { reference: string } }[];
    const refs = si.map((s) => s.valueReference.reference);
    const ids = new Set(bundle.entry.map((e) => `${e.resource.resourceType}/${e.resource.id}`));
    for (const ref of refs) expect(ids.has(ref)).toBe(true);
    expect(refs.some((r) => r.startsWith('QuestionnaireResponse/'))).toBe(true);
    expect(refs.some((r) => r.startsWith('DocumentReference/'))).toBe(true);
  });
});

describe('resource ids stay FHIR-conformant (RT-2)', () => {
  it('a very long ordering-provider name still yields ids ≤ 64 chars', () => {
    const longOrder: PaOrder = {
      ...order,
      orderingProvider:
        'Dr. Maximilian Alexander Bartholomew Fitzgerald-Montgomery the Third, MD, PhD, FACP, FACS',
    };
    const bundle = buildPasRequestBundle({
      channel: 'fhir',
      ctx: maria,
      order: longOrder,
      dtr: [dtr],
      now: '2026-07-20T14:00:00.000Z',
    });
    for (const e of bundle.entry) {
      const id = String(e.resource.id ?? '');
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id).toMatch(/^[A-Za-z0-9.-]+$/);
    }
  });
});

describe('determinism', () => {
  it('same input ⇒ identical bundle (no randomness/clock)', () => {
    const args = {
      channel: 'fhir' as const,
      ctx: maria,
      order,
      dtr: [dtr],
      now: '2026-07-20T14:00:00.000Z',
    };
    expect(JSON.stringify(buildPasRequestBundle(args))).toBe(
      JSON.stringify(buildPasRequestBundle(args))
    );
  });
});
