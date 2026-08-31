/**
 * Authoring PAS bridge (Tier 3): assemble a Da Vinci PAS request Bundle (the FHIR 278 equivalent) from a
 * policy's coverage rules + a completed OR specimen DTR response. Deterministic, honest (only PA-required
 * codes; profile only when real; nothing fabricated), payer-agnostic.
 */
import { describe, it, expect } from 'vitest';
import { buildPasRequest } from '@/lib/policy/pas/pasRequest';
import { buildSpecimenResponse } from '@/lib/policy/pas/specimenResponse';
import type { PasRequestInput } from '@/lib/policy/pas/types';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import type { FhirClaim } from '@/lib/fhir/types';

const canonical = 'urn:rhtp:dtr/Questionnaire/p';
const rule = (
  code: string,
  priorAuthRequired: boolean,
  role: CoverageRule['role']
): CoverageRule => ({
  code,
  codeSystem: 'CPT',
  display: `Procedure ${code}`,
  priorAuthRequired,
  policyId: 'p',
  policyTitle: 'Example Policy',
  questionnaireCanonical: priorAuthRequired ? canonical : '',
  role,
  reason: `rule ${code}`,
});
const coverageRules: CoverageRule[] = [
  rule('43775', true, 'covered'),
  rule('00488', false, 'investigational'), // must NOT appear as a preauth item
];
const items: QuestionnaireItemDef[] = [
  { linkId: 'bmi', text: 'BMI', type: 'decimal', required: true },
  { linkId: 'attest', text: 'Attest', type: 'boolean', required: true },
];

const specimenInput: PasRequestInput = {
  mode: 'specimen',
  items,
  coverageRules,
  questionnaireCanonical: canonical,
  policyTitle: 'Example Policy',
  policyId: 'p',
  now: '2026-08-30T00:00:00Z',
};

const claimOf = (bundle: { entry?: { resource?: { resourceType: string } }[] }): FhirClaim =>
  (bundle.entry ?? []).find((e) => e.resource?.resourceType === 'Claim')!.resource as FhirClaim;

describe('buildPasRequest — specimen (authoring preview)', () => {
  const out = buildPasRequest(specimenInput);

  it('is a preauthorization Claim requesting ONLY prior-auth-required codes', () => {
    const claim = claimOf(out.bundle);
    expect(claim.use).toBe('preauthorization');
    const codes = (claim.item ?? []).flatMap(
      (i) => i.productOrService.coding?.map((c) => c.code) ?? []
    );
    expect(codes).toContain('43775');
    expect(codes).not.toContain('00488'); // not-covered / investigational never requested
  });

  it('bundles every referenced resource (self-contained) and links the QR via supportingInfo', () => {
    const claim = claimOf(out.bundle);
    const ids = new Set(
      (out.bundle.entry ?? []).map(
        (e) => `${e.resource?.resourceType}/${(e.resource as { id?: string } | undefined)?.id}`
      )
    );
    expect(ids.has(claim.patient.reference!.replace(/^.*?(Patient\/)/, 'Patient/'))).toBe(true);
    expect(ids.has(claim.insurance[0].coverage.reference!)).toBe(true);
    const qrRef = claim.supportingInfo?.[0].valueReference?.reference;
    expect(qrRef).toMatch(/^QuestionnaireResponse\//);
    expect(ids.has(qrRef!)).toBe(true);
  });

  it('is honest: synthesized, no profile asserted, nothing answered, missing items surfaced', () => {
    expect(out.synthesized).toBe(true);
    expect(out.conformanceAsserted).toBe(false);
    expect(out.bundle.meta?.profile ?? []).not.toContain(
      'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-pas-request-bundle'
    );
    expect(out.missingForSubmission).toEqual(expect.arrayContaining(['bmi', 'attest']));
    // specimen patient carries a specimen identifier, never a member id
    const patient = (out.bundle.entry ?? []).find((e) => e.resource?.resourceType === 'Patient')!
      .resource as {
      identifier?: { system?: string }[];
    };
    expect(patient.identifier?.[0].system).toBe('urn:rhtp:pas:specimen');
  });

  it('is deterministic — same input yields byte-identical output', () => {
    expect(JSON.stringify(buildPasRequest(specimenInput))).toBe(
      JSON.stringify(buildPasRequest(specimenInput))
    );
  });
});

describe('buildSpecimenResponse — nothing fabricated', () => {
  it('leaves every answer unset, stays in-progress, and lists the required items as missing', () => {
    const { response, missingRequired } = buildSpecimenResponse(items, canonical);
    expect(response.status).toBe('in-progress');
    expect(response.subject?.reference).toBe('Patient/specimen');
    // no answer was fabricated on any item
    expect(response.item.every((i) => i.answer === undefined)).toBe(true);
    expect(missingRequired).toEqual(expect.arrayContaining(['bmi', 'attest']));
  });
});

describe('buildPasRequest — response (real completed DTR)', () => {
  it('stamps the davinci-pas profile and marks it not synthesized', () => {
    const out = buildPasRequest({
      mode: 'response',
      response: { resourceType: 'QuestionnaireResponse', status: 'completed', item: [] },
      patientRef: 'Patient/abc',
      coverageRules,
      questionnaireCanonical: canonical,
      policyTitle: 'Example Policy',
      policyId: 'p',
    });
    expect(out.synthesized).toBe(false);
    expect(out.conformanceAsserted).toBe(true);
    expect(out.bundle.meta?.profile).toContain(
      'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-pas-request-bundle'
    );
  });
});
