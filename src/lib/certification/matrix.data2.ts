/**
 * matrix.data2.ts — conformance matrix rows, part 2 of 2.
 *
 * Standards: IHE PIXm/PDQm, X12 834/837/835/278/270-271, terminology,
 * 42 CFR Part 2 / HIPAA, NPI/NPPES. See matrix.data1.ts for the remainder.
 *
 * Every `status` is set explicitly and honestly (E9). Rows anchored to a dataMode
 * seam carry `seamId`; a fail-closed-stub / mock-only seam can never be `supported`.
 * Every non-null `testId` is a real, existing test file (asserted by the matrix test).
 */
import type { StandardEntry } from './types';

export const MATRIX_PART_2: readonly StandardEntry[] = [
  {
    claimId: 'ihe-pixm-pdqm',
    standard: 'IHE PIXm / PDQm (FHIR)',
    capabilities: [
      {
        id: 'pixmpdqm-request-logic',
        capability: 'PIXm $ihe-pix / PDQm Patient search build + parse',
        evidence: {
          codePath:
            'src/lib/identity/external/pixmPdqmResolver.ts + src/lib/identity/external/fhirPixm.ts',
          testId: 'tests/identity/externalEmpi.test.ts',
          status: 'partial',
          note: 'FHIR request build + Parameters/Bundle parse logic is real and verified against a fake FHIR MPI transport, including E9 HELD-not-anchored behavior; the live FHIR endpoint is ci-pending. Partial.',
        },
      },
      {
        id: 'pixmpdqm-live-resolution',
        capability: 'PIXm/PDQm live pipeline identity resolution',
        evidence: {
          codePath: 'src/lib/identity/external/pixmPdqmResolver.ts -> pixmPdqmIdentityResolver',
          testId: 'tests/identity/externalResolver.test.ts',
          status: 'ci-pending',
          note: 'The sync identity seam fails closed (ExternalEmpiNotConfiguredError) until a config + FHIR transport are wired; never mints a default identity. Ci-pending.',
        },
      },
    ],
  },
  {
    claimId: 'x12-834',
    standard: 'X12 834 (Benefit Enrollment and Maintenance)',
    capabilities: [
      {
        id: 'x12-834-enrollment',
        capability: '834 enrollment batch parse -> coverage disposition',
        evidence: {
          codePath: 'src/lib/pipeline/adapters/eligibility834.ts',
          testId: 'tests/pipeline/eligibility834Termination.test.ts',
          status: 'partial',
          note: 'Real segment parser (INS loop + maintenance-type code -> coverage active/terminated) tested including disenrollment; parses a realistic 834 subset, not the full X12 5010 834 loop set. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'x12-837',
    standard: 'X12 837 (Health Care Claim)',
    capabilities: [
      {
        id: 'x12-837-claim',
        capability: '837 claim EDI ingestion',
        evidence: {
          codePath: 'src/lib/pipeline/adapters/claimsFinancial.ts (FHIR Claim modeling)',
          testId: null,
          status: 'absent',
          note: 'Claims are ingested as FHIR Claim resources, not parsed from raw X12 837 EDI; no 837 EDI parser exists. Absent (FHIR Claim path is tracked under CARIN).',
        },
      },
    ],
  },
  {
    claimId: 'x12-835',
    standard: 'X12 835 (Health Care Claim Payment/Advice)',
    capabilities: [
      {
        id: 'x12-835-remittance',
        capability: '835 remittance / adjustment reason codes',
        evidence: {
          codePath: 'src/lib/pipeline/adapters/claimsFinancial.ts (CARC/RARC on ClaimResponse)',
          testId: 'tests/pipeline/claimsFinancial.test.ts',
          status: 'partial',
          note: 'Remittance-advice reason codes (CARC/RARC) are modeled on FHIR ClaimResponse and tested; there is no raw X12 835 EDI parser. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'x12-278',
    standard: 'X12 278 (Health Care Services Review / Prior Auth)',
    capabilities: [
      {
        id: 'x12-278-priorauth',
        capability: '278 prior-authorization request/response',
        evidence: {
          codePath: 'src/lib/pa/pasService.ts (FHIR PAS Bundle; X12 275/278 EDI channel label)',
          testId: 'tests/workflow/paMachine.test.ts',
          status: 'partial',
          note: 'Prior authorization is carried as a Da Vinci PAS FHIR Bundle with a tested lifecycle; X12 275/278 is a labeled EDI channel with no wired clearinghouse gateway. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'x12-270-271',
    standard: 'X12 270 / 271 (Eligibility Inquiry and Response)',
    capabilities: [
      {
        id: 'x12-270-271-eligibility',
        capability: 'Eligibility inquiry + financial clearance determination',
        evidence: {
          codePath: 'src/lib/goldenThread/eligibility.ts + src/app/api/financial-clearance',
          testId: 'tests/api/routes-financial-clearance.test.ts',
          status: 'partial',
          note: 'Eligibility / financial-clearance determination is real and tested (also tests/goldenThread/stages.test.ts); it is not carried as raw X12 270/271 EDI (internal/FHIR representation). Partial.',
        },
      },
    ],
  },
  {
    claimId: 'terminology',
    standard: 'FHIR Terminology Services (ValueSet/CodeSystem/ConceptMap)',
    capabilities: [
      {
        id: 'term-validate-code',
        capability: 'ValueSet $validate-code',
        evidence: {
          codePath: 'src/lib/terminology/validateCode + src/lib/terminology/semanticValidator.ts',
          testId: 'tests/terminology/validateCode.test.ts',
          status: 'partial',
          seamId: 'terminology',
          note: 'The seeded terminology service validates codes (real engine + tests); the production external terminology service is unwired and the stage-4 semantic gate quarantines fail-closed. Partial.',
        },
      },
      {
        id: 'term-translate',
        capability: 'ConceptMap $translate',
        evidence: {
          codePath: 'src/lib/terminology/translate',
          testId: 'tests/terminology/translate.test.ts',
          status: 'partial',
          seamId: 'terminology',
          note: 'Seeded ConceptMap translation is real and tested; production terminology service ci-pending (fail-closed). Partial.',
        },
      },
      {
        id: 'term-expand',
        capability: 'ValueSet $expand',
        evidence: {
          codePath: 'src/lib/terminology/expand',
          testId: 'tests/terminology/expand.test.ts',
          status: 'partial',
          seamId: 'terminology',
          note: 'Seeded ValueSet expansion is real and tested; production terminology service ci-pending (fail-closed). Partial.',
        },
      },
      {
        id: 'term-classify',
        capability: 'Subsumption / code classification',
        evidence: {
          codePath: 'src/lib/terminology/classify',
          testId: 'tests/terminology/classify.test.ts',
          status: 'partial',
          seamId: 'terminology',
          note: 'Seeded classification is real and tested; production terminology service ci-pending (fail-closed). Partial.',
        },
      },
      {
        id: 'term-ucum',
        capability: 'UCUM unit validation (offline, LOINC-aware)',
        evidence: {
          codePath:
            'src/lib/terminology/validateCode (UCUM well-formedness + LOINC appropriateness)',
          testId: 'tests/terminology/ucum.test.ts',
          status: 'supported',
          note: 'UCUM well-formedness and LOINC-unit appropriateness checks are offline, deterministic, and fully tested; no external service required.',
        },
      },
      {
        id: 'term-semantic-gate',
        capability: 'Stage-4 semantic binding gate (fail-closed)',
        evidence: {
          codePath:
            'src/lib/pipeline/semanticBinding.ts + src/lib/terminology/semanticValidator.ts',
          testId: 'tests/terminology/semanticGate.test.ts',
          status: 'partial',
          seamId: 'terminology',
          note: 'The gate turns terminology-unavailable into a fail-closed quarantine and is tested (also tests/pipeline/semanticBinding.test.ts); the production terminology backend it fronts is ci-pending. Partial.',
        },
      },
      {
        id: 'term-vs-governance',
        capability: 'Value-set version-lifecycle governance (maker-checker)',
        evidence: {
          codePath: 'src/lib/terminology/governance + src/app/api/value-set-governance',
          testId: 'tests/terminology/governance.test.ts',
          status: 'partial',
          seamId: 'valueSetGovernanceStore',
          note: 'Draft->review->approved/rejected->retired lifecycle with enforced maker-checker and an immutable audit ledger is real and tested (also tests/api/routes-value-set-governance.test.ts); the durable pg ledger production seam fails closed until wired. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'part2-hipaa',
    standard: '42 CFR Part 2 / HIPAA (privacy, consent, minimum necessary)',
    capabilities: [
      {
        id: 'part2-segmentation-basis',
        capability: '42 CFR Part 2 two-factor segmentation basis',
        evidence: {
          codePath: 'src/lib/pipeline/part2Basis.ts + src/lib/pipeline/segmentation.ts',
          testId: 'tests/pipeline/behavioralHealth.test.ts',
          status: 'supported',
          note: 'Part 2 protection decided on the two-factor (program-context AND SUD-content) basis with fail-safe restrict-on-unknown (E9); real and tested.',
        },
      },
      {
        id: 'part2-consent-optout',
        capability: 'Provider-access consent opt-out enforcement',
        evidence: {
          codePath: 'src/lib/consent + src/app/api/consent/provider-access',
          testId: 'tests/consent/providerAccessOptOut.test.ts',
          status: 'partial',
          seamId: 'consent',
          note: 'Opt-out enforcement logic is real and tested (also tests/property/consentOptOut.property.test.ts, tests/scenario/corpus_C_consent.test.ts); the durable consent store production seam fails closed. Partial.',
        },
      },
      {
        id: 'hipaa-phi-safe-errors',
        capability: 'PHI-safe error bodies (minimum necessary)',
        evidence: {
          codePath: 'src/lib/fhir (OperationOutcome) + API route error shaping',
          testId: 'tests/security/phi-error-bodies.test.ts',
          status: 'supported',
          note: 'Error bodies are PHI-safe OperationOutcomes that never leak member data; enforced and tested.',
        },
      },
      {
        id: 'hipaa-data-lifecycle',
        capability: 'Data lifecycle: right-to-delete, purge, legal hold',
        evidence: {
          codePath: 'src/lib/lifecycle',
          testId: 'tests/lifecycle/rightToDelete.test.ts',
          status: 'supported',
          note: 'Right-to-delete, purge, and legal-hold lifecycle policies are real and tested (also tests/lifecycle/purge.test.ts, tests/lifecycle/legalHold.test.ts).',
        },
      },
      {
        id: 'hipaa-access-control',
        capability: 'Access control / IDOR protection',
        evidence: {
          codePath: 'src/lib/authz + src/middleware.ts',
          testId: 'tests/security/idor.test.ts',
          status: 'supported',
          note: 'Object-level authorization prevents IDOR across member-scoped resources; real and tested (also tests/security/authz-bypass.test.ts).',
        },
      },
    ],
  },
  {
    claimId: 'npi-nppes',
    standard: 'NPI / NPPES (provider identity)',
    capabilities: [
      {
        id: 'npi-validation',
        capability: 'NPI validation (NPPES 80840-prefixed Luhn checksum)',
        evidence: {
          codePath: 'src/lib/identity/provider/npi.ts',
          testId: 'tests/identity/providerIdentity.test.ts',
          status: 'supported',
          note: 'NPI check-digit validation is offline, deterministic, and tested; an invalid NPI is rejected and never anchored (E9).',
        },
      },
      {
        id: 'nppes-directory',
        capability: 'NPPES provider directory resolution',
        evidence: {
          codePath: 'src/lib/identity/provider/directory.ts -> getProviderDirectory()',
          testId: 'tests/identity/providerIdentity.test.ts',
          status: 'ci-pending',
          seamId: 'providerIdentity',
          note: 'Seeded synthetic directory serves the demo; production with no live NPPES client throws NppesNotConfiguredError (fail closed). Live NPPES resolution is ci-pending.',
        },
      },
    ],
  },
] as const;
