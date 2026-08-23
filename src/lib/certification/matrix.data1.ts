/**
 * matrix.data1.ts — conformance matrix rows, part 1 of 2.
 *
 * Standards: US Core/USCDI, Da Vinci PAS/CRD/DTR, CARIN, SMART, CDS Hooks,
 * CMS-0057-F, IHE PIX/PDQ. See matrix.data2.ts for the remainder.
 *
 * Every `status` is set explicitly and honestly (E9). Rows anchored to a dataMode
 * seam carry `seamId`; a fail-closed-stub / mock-only seam can never be `supported`.
 * Every non-null `testId` is a real, existing test file (asserted by the matrix test).
 */
import type { StandardEntry } from './types';

export const MATRIX_PART_1: readonly StandardEntry[] = [
  {
    claimId: 'us-core-uscdi',
    standard: 'HL7 US Core / ONC USCDI',
    capabilities: [
      {
        id: 'uscore-structural-validation',
        capability: 'FHIR structural + OperationOutcome validation',
        evidence: {
          codePath: 'src/lib/fhir + src/lib/pipeline/profileValidator.ts (structural pre-flight)',
          testId: 'tests/fhir/validate.test.ts',
          status: 'supported',
          note: 'Structural/cardinality validation and OperationOutcome shaping are real and tested (also tests/fhir/operationOutcome.test.ts).',
        },
      },
      {
        id: 'uscore-profile-validate',
        capability: 'US Core profile $validate conformance backend',
        evidence: {
          codePath: 'src/lib/pipeline/profileValidator.ts -> productionProfileValidationService',
          testId: 'tests/pipeline/profileValidator.test.ts',
          status: 'partial',
          seamId: 'profileValidation',
          note: 'Structural pre-flight real and tested; production US Core $validate backend unwired -> gate quarantines every record (profile-validation-unavailable). Full profile conformance is ci-pending.',
        },
      },
      {
        id: 'uscdi-dataclass-mapping',
        capability: 'USCDI data-class mapping via ingest adapters',
        evidence: {
          codePath: 'src/lib/pipeline/adapters (allergy, medication, immunization, lab, procedure, ...)',
          testId: 'tests/pipeline/adapters.test.ts',
          status: 'partial',
          note: 'Adapters map source feeds to US Core resource shapes and are tested; produced resources are not $validate-verified against US Core profiles (see uscore-profile-validate).',
        },
      },
    ],
  },
  {
    claimId: 'davinci-pas',
    standard: 'Da Vinci PAS (Prior Authorization Support)',
    capabilities: [
      {
        id: 'pas-machine',
        capability: 'PA lifecycle state machine (CRD -> DTR -> submit -> adjudicate)',
        evidence: {
          codePath: 'src/lib/workflow/paMachine.ts',
          testId: 'tests/workflow/paMachine.test.ts',
          status: 'supported',
          note: 'Deterministic PA state machine with SLA + human-approval gates, fully unit-tested including the happy path and expedited transitions.',
        },
      },
      {
        id: 'pas-fhir-submit',
        capability: 'PAS FHIR Claim/$submit bundle build + submission route',
        evidence: {
          codePath: 'src/lib/pa/pasService.ts + src/app/api/pas/submit',
          testId: 'tests/api/routes-pas-webhook.test.ts',
          status: 'partial',
          note: 'The human-gated submit route (202 without an approver; forwards the claimBundle to pasClient) is real and tested; buildPasBundle in pasService builds a minimal Claim/$submit bundle but is NOT exercised by the cited route test and the emitted bundle is not PAS-profile validated. Demoted from supported (R1 overclaim: cited test proves route/human-gate behavior with a caller-supplied bundle, not PAS Bundle conformance). Partial.',
        },
      },
      {
        id: 'pas-claimresponse-webhook',
        capability: 'PAS ClaimResponse webhook ingestion + lifecycle projection',
        evidence: {
          codePath: 'src/app/api/webhooks/claim-response + src/lib/pipeline/adapters/priorAuthLifecycle.ts',
          testId: 'tests/pipeline/priorAuthLifecycle.test.ts',
          status: 'supported',
          note: 'Async ClaimResponse webhook maps into the prior-auth lifecycle; adapter + route both tested (also tests/api/routes-pas-webhook.test.ts).',
        },
      },
    ],
  },
  {
    claimId: 'davinci-crd',
    standard: 'Da Vinci CRD (Coverage Requirements Discovery)',
    capabilities: [
      {
        id: 'crd-order-sign',
        capability: 'CRD coverage-requirements via CDS Hooks order-sign',
        evidence: {
          codePath: 'src/lib/pa/crdService.ts + src/app/api/cds + src/app/api/cds-hooks/order-sign',
          testId: 'tests/api/routes-cds.test.ts',
          status: 'partial',
          note: 'CRD checks run through the CDS Hooks order-sign BFF route backed by the policy engine; route + card shaping are tested (cards returned, STAT-order flagged). Demoted from supported (R1 overclaim: the cited test proves CDS-Hooks card plumbing, NOT Da Vinci CRD card/system-action profile conformance or coverage-requirements semantics). Partial.',
        },
      },
    ],
  },
  {
    claimId: 'davinci-dtr',
    standard: 'Da Vinci DTR (Documentation Templates and Rules)',
    capabilities: [
      {
        id: 'dtr-evaluate',
        capability: 'DTR questionnaire evaluate + package',
        evidence: {
          codePath: 'src/lib/pa/dtrService.ts + src/app/api/dtr/evaluate + src/app/api/dtr/package',
          testId: 'tests/api/routes-dtr.test.ts',
          status: 'supported',
          note: 'DTR evaluate/package routes wrap the policy engine and are tested (also tests/dtr/questionnaireResponse.test.ts for QuestionnaireResponse shaping).',
        },
      },
      {
        id: 'dtr-generate',
        capability: 'DTR questionnaire generation from policy',
        evidence: {
          codePath: 'src/lib/goldenThread/dtr/generator.ts + src/lib/goldenThread/dtrFromPolicy.ts',
          testId: 'tests/goldenThread/dtrGenerator.test.ts',
          status: 'supported',
          note: 'Policy-driven questionnaire generation is real and tested end-to-end (also tests/goldenThread/dtrAndIngest.test.ts).',
        },
      },
    ],
  },
  {
    claimId: 'carin',
    standard: 'CARIN Blue Button (consumer claims)',
    capabilities: [
      {
        id: 'carin-eob-chain',
        capability: 'Claim -> ClaimResponse -> EOB modeling with CARC/RARC',
        evidence: {
          codePath: 'src/lib/pipeline/adapters/claimsFinancial.ts',
          testId: 'tests/pipeline/claimsFinancial.test.ts',
          status: 'partial',
          note: 'Claim/ClaimResponse/ExplanationOfBenefit chain with CARC/RARC denial codes is modeled and tested (also tests/graph/claimsFinancial.test.ts); resources are not validated against CARIN BB profiles and there is no Patient-Access $everything bulk export. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'smart',
    standard: 'SMART App Launch / SMART on FHIR',
    capabilities: [
      {
        id: 'smart-principal-scope',
        capability: 'SMART principal + member-scope derivation and enforcement',
        evidence: {
          codePath: 'src/lib/authz/principal/index.ts',
          testId: 'tests/security/principal-authz.test.ts',
          status: 'supported',
          note: 'Principal role + authorized member scope are derived from SMART fhirUser/session facts and enforced (self/panel/org); real and tested (also tests/authz/guard.test.ts).',
        },
      },
      {
        id: 'smart-app-launch',
        capability: 'SMART App Launch OAuth2 (authorize / callback / session)',
        evidence: {
          codePath: 'src/app/api/auth (login, callback, session) + src/lib/services/smartAuth.ts',
          testId: 'tests/api/routes-auth.test.ts',
          status: 'partial',
          note: 'Auth routes implement IdP authorize/callback/session with a dev fallback and are tested; smartAuth.ts is an explicit demo stub and full SMART launch-context + token introspection is ci-pending. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'cds-hooks',
    standard: 'CDS Hooks',
    capabilities: [
      {
        id: 'cdshooks-patient-view',
        capability: 'patient-view hook',
        evidence: {
          codePath: 'src/app/api/cds-hooks/patient-view + src/lib/hooks',
          testId: 'tests/api/routes-cds.test.ts',
          status: 'supported',
          note: 'patient-view hook request/response + card shaping implemented and tested.',
        },
      },
      {
        id: 'cdshooks-order-sign',
        capability: 'order-sign hook',
        evidence: {
          codePath: 'src/app/api/cds-hooks/order-sign',
          testId: 'tests/api/routes-cds.test.ts',
          status: 'supported',
          note: 'order-sign hook implemented and tested; drives the CRD coverage-requirements path.',
        },
      },
    ],
  },
  {
    claimId: 'cms-0057-f',
    standard: 'CMS-0057-F Interoperability + Prior Authorization APIs',
    capabilities: [
      {
        id: 'cms-patient-access',
        capability: 'Section 1 Patient Access API (FHIR read + bulk)',
        evidence: {
          codePath: 'src/app/api/fhir/[...path] + src/app/api/bulk',
          testId: 'tests/api/routes-fhir-passthrough.test.ts',
          status: 'partial',
          note: 'FHIR read/passthrough present and tested; full USCDI+ Patient Access is gated by the US Core profile-validation seam. Partial.',
        },
      },
      {
        id: 'cms-provider-access',
        capability: 'Section 2 Provider Access API (consent-gated)',
        evidence: {
          codePath: 'src/app/api/consent/provider-access + src/lib/consent',
          testId: 'tests/api/routes-consent.test.ts',
          status: 'partial',
          seamId: 'consent',
          note: 'Provider-access consent opt-out gate is real and tested; the durable consent store production seam fails closed until wired. Partial.',
        },
      },
      {
        id: 'cms-payer-to-payer',
        capability: 'Section 3 Payer-to-Payer API',
        evidence: {
          codePath: 'src/lib/cms0057fEndpoints.ts (MANDATE_SECTIONS payerToPayer)',
          testId: null,
          status: 'absent',
          note: 'Payer-to-payer exchange is declared as a mandate section in the endpoint metadata; no implemented route or data flow exists. Absent.',
        },
      },
      {
        id: 'cms-prior-auth-api',
        capability: 'Section 4 Prior Authorization API (PARDD: CRD/DTR/PAS)',
        evidence: {
          codePath: 'src/app/api/pas/submit + src/app/api/dtr + src/app/api/cds',
          testId: 'tests/api/routes-pas-webhook.test.ts',
          status: 'partial',
          note: 'The PARDD prior-auth API surface (CRD, DTR, PAS submit + ClaimResponse webhook) exists and is route-tested across routes-cds / routes-dtr / routes-pas-webhook. Demoted from supported (R1 overclaim: an aggregate "surface implemented and tested" claim over sub-capabilities that are themselves partial, e.g. PAS Bundle conformance and CRD profile conformance are not validated end-to-end). Partial.',
        },
      },
      {
        id: 'cms-member-match',
        capability: 'Da Vinci HRex $member-match (Provider Access / P2P member identification)',
        evidence: {
          codePath: 'src/app/api/match/route.ts + src/lib/server/memberMatch.ts',
          testId: 'tests/api/routes-match-bulk.test.ts',
          status: 'partial',
          note: 'HRex $member-match route (consent-gated, break-glass audited) resolves a member identity from Parameters and is route-tested (validation + mock happy path); it is not validated against the HRex member-match profile and runs against the demo registry. Added to back the CapabilityStatement $member-match claim (R2: statement op previously had no matrix evidence row). Partial.',
        },
      },
      {
        id: 'cms-bulk-export',
        capability: 'Async bulk export job (start / status)',
        evidence: {
          codePath: 'src/app/api/bulk/start + src/app/api/bulk/status',
          testId: 'tests/api/routes-match-bulk.test.ts',
          status: 'partial',
          note: 'Bulk job start/status flow is tested; it is job scaffolding, not a full FHIR Bulk Data ndjson $export. Partial.',
        },
      },
    ],
  },
  {
    claimId: 'ihe-pix-pdq',
    standard: 'IHE PIX / PDQ (HL7v2)',
    capabilities: [
      {
        id: 'pixpdq-message-logic',
        capability: 'PIX QBP^Q23 / PDQ QBP^Q22 build + RSP parse',
        evidence: {
          codePath: 'src/lib/identity/external/pixPdqResolver.ts + src/lib/identity/external/hl7v2.ts',
          testId: 'tests/identity/externalEmpi.test.ts',
          status: 'partial',
          note: 'HL7v2 query build + RSP parse logic is real and verified against a fake MPI transport, including E9 HELD-not-anchored behavior; the live MLLP endpoint is ci-pending. Partial.',
        },
      },
      {
        id: 'pixpdq-live-resolution',
        capability: 'PIX/PDQ live pipeline identity resolution',
        evidence: {
          codePath: 'src/lib/identity/external/pixPdqResolver.ts -> pixPdqIdentityResolver',
          testId: 'tests/identity/externalResolver.test.ts',
          status: 'ci-pending',
          note: 'The sync identity seam fails closed (ExternalEmpiNotConfiguredError) until a config + MLLP transport are wired; never mints a default identity. Ci-pending.',
        },
      },
    ],
  },
] as const;
