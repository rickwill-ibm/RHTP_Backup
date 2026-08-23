# Certification Readiness

Framework v1.2 | Iteration 10 Wave C | generated 2026-08-23

> **This is certification-READINESS, not an assertion of certification.** Nothing
> here is `ready`. Every status reflects what is provable today in CI against
> fixtures and fakes. Per `verification/GAP_AND_STUB_RISK_REGISTER.md` (NS-05) the
> live-integration-executed count is **0**: every concurrency/durability/conformance
> guarantee is proven against fakes, not live infrastructure. Reaching certification
> requires **live infrastructure**, an **accredited test suite**, and/or **licensed
> terminology content** — named per standard below.

## How to read this

Each standard carries: **status**, the **evidence** that substantiates it, the
**residual gaps** that keep it short of certification, and the concrete **path to
certification**. Statuses come from a shared four-value vocabulary that the Wave A
capability matrix and this readiness doc both use:

| status | meaning |
| --- | --- |
| `ready` | Conformance substantiated AND provable against live/accredited infra. Certifiable. **No standard currently qualifies.** |
| `ci-pending` | Protocol logic implemented and exercised in CI against fixtures/fakes; only live infra, an accredited suite, or licensed content blocks certification. |
| `partial` | Implemented for a substantiated subset; material conformance gaps remain even in CI. |
| `absent` | Only a seam / honest-stub exists; the protocol/wire logic itself is not implemented. |

The fail-closed posture is load-bearing to this honesty: unwired seams throw a named
`*NotConfiguredError` in production (`src/lib/config/seamDispositions.ts`), so a
"pending" standard cannot silently serve a fake as production data.

## Status at a glance

| standard | status |
| --- | --- |
| US Core / USCDI | `partial` |
| Da Vinci PAS | `ci-pending` |
| Da Vinci CRD | `ci-pending` |
| Da Vinci DTR | `ci-pending` |
| CARIN (Blue Button) | `partial` |
| SMART on FHIR | `ci-pending` |
| CDS Hooks | `ci-pending` |
| CMS-0057-F APIs | `partial` |
| IHE PIX / PDQ | `absent` |
| X12 EDI (834 / 278) | `partial` |
| Terminology | `ci-pending` |
| 42 CFR Part 2 / HIPAA | `partial` |
| NPI / NPPES | `partial` |

## Per-standard readiness

### US Core / USCDI — `partial`
- **Evidence.** Structural validator `src/lib/fhir/validate.ts`; pipeline stage-4
  profile gate `src/lib/pipeline/profileValidator.ts`. The `profileValidation` seam
  is a fail-closed-stub — production `ProfileValidatorNotConfiguredError` quarantines
  every record rather than admitting it unverified (U2 fix). USCDI data classes are
  represented across pipeline adapters (allergy, medication, goal/task, referral,
  coverage).
- **Residual gaps.** F4: real `$validate` is absent — the stage-4 gate is structural
  presence only in CI; no profile/cardinality/must-support/binding conformance. No IG
  package resolution or value-set binding validation.
- **Path.** Wire a real FHIR validator (HAPI `$validate`) behind the seam; run Inferno
  / ONC (g)(10) US Core against a live server; load US Core + USCDI IG packages.

### Da Vinci PAS — `ci-pending`
- **Evidence.** `src/lib/pa/pasService.ts`, `/api/pas/submit`, `src/lib/server/pasClient.ts`;
  `src/lib/agents/pa/paAgent.ts`; `webhooks/claim-response` (async PA response). U1 fix:
  dev-mock auth defaults OFF and is impossible when real auth is configured, so a
  real-auth deploy can never serve a fake "PA approved".
- **Residual gaps.** No conformance run against a Da Vinci PAS reference implementation
  / accredited suite; X12 278 mapping fidelity bounded; live payer FHIR gateway not
  wired (fail-closed).
- **Path.** Wire a live payer FHIR PAS gateway; run Touchstone / Da Vinci PAS; validate
  Claim/ClaimResponse against PAS profiles via a real validator.

### Da Vinci CRD — `ci-pending`
- **Evidence.** `src/lib/pa/crdService.ts`; CDS Hooks order-sign / patient-view
  (`src/app/api/cds-hooks/*`); medical-necessity signals `src/lib/goldenThread/medicalNecessity.ts`.
- **Residual gaps.** CRD cards not validated against Da Vinci CRD hooks/card profiles
  by an accredited suite; no live coverage/rules service behind the hook.
- **Path.** Wire a live CRD endpoint; run Da Vinci CRD test suite / connectathon.

### Da Vinci DTR — `ci-pending`
- **Evidence.** `src/lib/pa/dtrService.ts`; `/api/dtr/evaluate`, `/api/dtr/package`;
  `src/lib/dtr/questionnaireResponse.ts`; `src/lib/goldenThread/dtr/generator.ts` and
  `dtrFromPolicy.ts` (Questionnaire from policy).
- **Residual gaps.** CQL/Questionnaire population not exercised against a real DTR SMART
  app or accredited suite; no live library/measure evaluation.
- **Path.** Wire a live DTR SMART app + CQL engine; run Da Vinci DTR; validate
  QuestionnaireResponse against DTR profiles.

### CARIN (Blue Button) — `partial`
- **Evidence.** Consumer/member data classes present (`src/lib/patientRegistry.*`,
  coverage mapping `src/lib/graph/mapping/coverage.ts`); Patient Access surface under
  CMS-0057-F §1 (`cms0057fEndpoints.ts` `MANDATE_SECTIONS`).
- **Residual gaps.** No CARIN BB profile conformance (ExplanationOfBenefit, C4BB
  profiles) in CI. This is the weakest-substantiated standard: data-class presence, not
  profile-validated CARIN BB resources.
- **Path.** Model and validate C4BB EOB/Coverage against the CARIN BB IG; run the CARIN
  BB test suite against a live FHIR endpoint.

### SMART on FHIR — `ci-pending`
- **Evidence.** `src/lib/fhir/smartLaunch.ts`; `src/lib/server/smartSession.ts`;
  smart-backend auth option in server env; backbone client auth config
  (`src/lib/backbone/config.ts`).
- **Residual gaps.** `src/lib/services/smartAuth.ts` is an explicit demo stub (always
  authenticated in mock; returns `mock-access-token`). No conformance against SMART App
  Launch / Backend Services with a real authorization server.
- **Path.** Wire a real SMART authorization server (OAuth2 + backend-services JWT); run
  Inferno SMART App Launch (STU2) and Backend Services conformance.

### CDS Hooks — `ci-pending`
- **Evidence.** `src/lib/fhir/cdsHooks.ts` real client (patient-view prefetch of
  Patient/Conditions/MedicationRequests; calls `NEXT_PUBLIC_CDS_HOOKS_ENDPOINT`);
  `/api/cds`, `/api/cds-hooks`, `/api/cds-hooks/order-sign`, `/api/cds-hooks/patient-view`.
- **Residual gaps.** Falls back to bundled demo cards when no endpoint is reachable; no
  accredited conformance run; no live `/cds-services` discovery in CI.
- **Path.** Wire a live CDS Hooks service; validate discovery + card/system-action
  shapes; run CDS Hooks conformance / connectathon.

### CMS-0057-F APIs — `partial`
- **Evidence.** `src/lib/cms0057fEndpoints.ts` `MANDATE_SECTIONS` (§1 Patient Access, §2
  Provider Access, §3 Payer-to-Payer, §4 Prior Auth); `/api-explorer` + postman
  collection/environment/run generators; `src/lib/server/memberMatch.ts` (`$member-match`
  for Provider Access / P2P); `pas/submit` (Prior Auth API); `bulk/start`, `bulk/status`.
- **Residual gaps.** Depends on the same fail-closed seams (FHIR gateway, SMART auth,
  terminology) that are not live-wired; no end-to-end run against a reference payer or
  accredited suite; regulatory attestation not performed.
- **Path.** Wire a live payer FHIR gateway + auth; provision the four API surfaces
  against real endpoints; run CMS-0057-F / Da Vinci PDex, Provider Access, Payer-to-Payer
  suites; complete regulatory attestation.

### IHE PIX / PDQ (+ PIXm / PDQm) — `absent`
- **Evidence.** `src/lib/identity/external/` seam + types (`pixPdqResolver` HL7v2,
  `pixmPdqmResolver` FHIR; `disposition.ts` selection). Honest stub: every external call
  throws `ExternalEmpiNotConfiguredError` until an endpoint is wired; the README documents
  the QBP/RSP and `$ihe-pix` mappings.
- **Residual gaps.** The wire encoding is **not** implemented: no MLLP send/receive +
  QBP^Q23/Q22 parsing (PIX/PDQ), no `fetch` + Bundle/Parameters parsing (PIXm/PDQm). The
  internal EMPI match engine is the default identity path; external IHE identity is
  stub-only — hence `absent`, not `ci-pending`.
- **Path.** Implement PIX/PDQ HL7v2 (MLLP + QBP/RSP) and/or PIXm/PDQm FHIR wire encodings
  behind the resolver seam; validate against an IHE PIX/PDQ manager; run IHE Connectathon
  (Gazelle) for the chosen actors.

### X12 EDI (834 / 278) — `partial`
- **Evidence.** `src/lib/pipeline/adapters/eligibility834.ts`: 834 batch parse (INS
  loops), INS-3 maintenance-type -> coverage disposition. F1 addressed: add(021),
  change(001), termination(024), cancellation(030) map correctly, so a termination
  produces a terminated/disenrolled coverage record and **never** an active
  re-enrollment. Any other INS-3 value is fail-closed (quarantined
  `unknown-maintenance-type`). 278 flows through the PAS path.
- **Residual gaps.** Full 834 code-set fidelity deferred (025 reinstatement, 002
  audit-compare, retro-term span handling quarantine today rather than being processed);
  no envelope/ack fidelity (ISA/GS/999/TA1); no trading-partner/clearinghouse cert.
- **Path.** Complete the 834 companion-guide code set + envelope/ack (999/TA1) handling;
  trading-partner testing / clearinghouse certification for 834 and 278.

### Terminology — `ci-pending`
- **Evidence.** `src/lib/terminology/` semantic gate wired into pipeline stage 4
  (validateCode/translate/classify); value-set governance lifecycle with enforced
  maker-checker + immutable audit (`src/lib/terminology/governance/`,
  `valueSetGovernanceStore` seam). `productionTerminologyService` throws
  (`TerminologyServiceNotConfiguredError`, fail-closed-stub); the seeded service serves
  demo codes in CI.
- **Residual gaps.** The seed allowlist covers only demo-fixture codes; the HCC crosswalk
  is a small stub, **not** the full CMS mapping (`classify/data/hcc-crosswalk.json`).
  Licensed content (SNOMED CT, LOINC, RxNorm, CPT/HCPCS) is not present; no live
  terminology server.
- **Path.** License terminology content and wire a real terminology server
  (`$validate-code` / `$translate`); load the full CMS-HCC grouping; validate value-set
  expansions against authoritative sources.

### 42 CFR Part 2 / HIPAA — `partial`
- **Evidence.** `src/lib/consent/part2Consent.ts`: consent-directed release (42 CFR 2.31
  named recipient + purpose), break-glass (2.51) under a distinct elevated audit class,
  and the re-disclosure prohibition marker. `src/lib/pipeline/part2Basis.ts` corrected
  the segmentation basis (F2 progressed from a blunt drop); `src/lib/authz/guard.ts`
  break-glass pattern; PHI-safe audit descriptors throughout.
- **Residual gaps.** F2 honest scope: full consent lifecycle (capture, revocation
  propagation, expiry sweeps, a consent registry of record) is deferred; no legal /
  compliance attestation; consent registry not wired (fail-closed consent seam).
- **Path.** Wire a consent registry of record + revocation/expiry propagation behind the
  consent seam; independent 42 CFR Part 2 / HIPAA compliance review and attestation of
  the disclosure surface.

### NPI / NPPES — `partial`
- **Evidence.** `src/lib/identity/provider/npi.ts`: offline deterministic NPI validation
  (80840-prefixed Luhn); an invalid NPI is rejected and never anchored (E9: no fabricated
  provider identity). The `providerIdentity` seam
  (`src/lib/identity/provider/directory.ts`) is an NPPES-directory fail-closed-stub
  (`NppesNotConfiguredError` in production); the F5 fix anchors referral performers by
  validated NPI.
- **Residual gaps.** F5-b: claims / care-team / medication prescriber performer refs are
  still raw strings — only the referral mapping was closed. No live NPPES client wired;
  the seeded synthetic directory is demo-only.
- **Path.** Wire a live NPPES registry client behind the `providerIdentity` seam; apply
  the `anchorProviderRef` pattern to the remaining claims/care-team/medication mappings
  (F5-b).

## Cross-cutting residuals (roll-up from the risk register)

These are not per-standard but gate any real production pilot, from
`verification/GAP_AND_STUB_RISK_REGISTER.md`:

- **NS-05** — live-integration-executed count is 0; the honest ceiling on every
  "ci-pending" status until real infra (Iteration 9 substrate) is bound.
- **NS-02** — no metrics/tracing/correlation-id observability across subsystems.
- **NS-03** — no right-to-delete / erasure / retention across append-only stores.
- **Deploy-ordering constraint** — the dead-letter and idempotency stores are hard
  production dependencies; deploying `pipeline=production` without them bricks ingestion
  (runbook item).

## Machine-readable summary

The block below is the single machine-readable source a test compares against the Wave A
capability matrix. `tests/certification/readiness.test.ts` asserts this block equals
`docs/certification/readiness-summary.json` (no doc-vs-evidence drift), that every
standard in the brief is present, and — when Wave A exports its matrix at
`integration.matrixSummaryPath` — that the status set matches exactly (E9: readiness
never reports `ready` for a standard the matrix marks `ci-pending`/`absent`). Waves A and
B run in parallel; **Wave D reconciles** the two status sets and flips the comparator from
armed to enforced.

```json
{
  "schemaVersion": "1.0.0",
  "framework": "v1.2",
  "wave": "iteration10-waveC",
  "generated": "2026-08-23",
  "kind": "certification-readiness",
  "honesty": "This is certification-READINESS, not an assertion of certification. No standard is 'ready'. Every status reflects what is provable in CI against fixtures/fakes today (verification/GAP_AND_STUB_RISK_REGISTER.md NS-05: live-integration-executed count is 0). Live infra, an accredited test suite, and/or licensed terminology content are required to reach certification.",
  "integration": {
    "matrixSummaryPath": "docs/certification/capability-matrix.summary.json",
    "matrixStandardIdField": "id",
    "matrixStatusField": "status",
    "statusSetContract": ["ready", "ci-pending", "partial", "absent"],
    "reconciliation": "Wave A (capability matrix) and Wave B (capabilityStatement) run in PARALLEL with this wave; no matrix machine-readable output exists at author time. This file DEFINES the shared summary schema both the readiness doc and the Wave A matrix satisfy. tests/certification/readiness.test.ts enforces no doc-vs-evidence drift now and compares status-by-standard against the matrix summary WHEN Wave A exports it at matrixSummaryPath. Wave D reconciles the two status sets and flips the comparator from armed to enforced.",
    "e9Rule": "Readiness must not report 'ready' for any standard the matrix marks 'ci-pending' or 'absent'. Satisfied structurally: this summary marks NOTHING 'ready', so no drift can promote a ci-pending/absent matrix entry to ready here."
  },
  "statusVocabulary": {
    "ready": "Conformance substantiated AND provable against live/accredited infrastructure. Certifiable. (No standard currently qualifies.)",
    "ci-pending": "Protocol logic is implemented and exercised in CI against fixtures/fakes; only live infrastructure, an accredited test suite, or licensed content blocks certification.",
    "partial": "Implemented for a substantiated subset; material conformance gaps remain even in CI (documented per standard).",
    "absent": "Only a seam/honest-stub exists; the protocol/wire logic itself is not implemented."
  },
  "requiredStandards": [
    "us-core-uscdi",
    "davinci-pas",
    "davinci-crd",
    "davinci-dtr",
    "carin",
    "smart",
    "cds-hooks",
    "cms-0057-f",
    "ihe-pix-pdq",
    "x12",
    "terminology",
    "part2-hipaa",
    "npi-nppes"
  ],
  "standards": [
    {
      "id": "us-core-uscdi",
      "name": "US Core / USCDI",
      "status": "partial",
      "evidence": [
        "src/lib/fhir/validate.ts structural validator; pipeline stage-4 profile gate src/lib/pipeline/profileValidator.ts",
        "profileValidation seam is a fail-closed-stub (src/lib/config/seamDispositions.ts): production ProfileValidatorNotConfiguredError quarantines every record rather than admitting it unverified (U2 fix)",
        "USCDI data classes represented across pipeline adapters (allergy, medication, goalTask, referral, coverage)"
      ],
      "residualGaps": [
        "F4: real $validate is absent. Stage-4 gate is structural presence only in CI; no profile/cardinality/must-support/binding conformance",
        "No FHIR IG package resolution, no terminology binding validation against US Core value sets"
      ],
      "pathToCertification": [
        "Wire a real FHIR validator (HAPI $validate) behind the profileValidation seam",
        "Run Inferno / ONC (g)(10) US Core test kit against a live FHIR server",
        "Load US Core + USCDI IG packages for must-support and binding checks"
      ]
    },
    {
      "id": "davinci-pas",
      "name": "Da Vinci PAS (Prior Authorization Support)",
      "status": "ci-pending",
      "evidence": [
        "src/lib/pa/pasService.ts, /api/pas/submit route, src/lib/server/pasClient.ts",
        "src/lib/agents/pa/paAgent.ts; webhooks/claim-response route (async PA response)",
        "U1 fix: dev-mock auth defaults OFF and is impossible when real auth is configured (no fake 'PA approved' in a real-auth deploy)"
      ],
      "residualGaps": [
        "No conformance run against a Da Vinci PAS reference implementation / accredited suite",
        "X12 278 mapping fidelity bounded (see x12 standard entry)",
        "Live payer FHIR gateway not wired (fail-closed seams)"
      ],
      "pathToCertification": [
        "Wire a live payer FHIR PAS gateway (backbone clients)",
        "Execute Touchstone / Da Vinci PAS test suite",
        "Validate Claim/ClaimResponse against PAS profiles via a real validator"
      ]
    },
    {
      "id": "davinci-crd",
      "name": "Da Vinci CRD (Coverage Requirements Discovery)",
      "status": "ci-pending",
      "evidence": [
        "src/lib/pa/crdService.ts; CDS Hooks order-sign / patient-view (src/app/api/cds-hooks/*)",
        "coverage/medical-necessity signals via src/lib/goldenThread/medicalNecessity.ts"
      ],
      "residualGaps": [
        "CRD cards not validated against Da Vinci CRD hooks/card profiles by an accredited suite",
        "No live coverage/rules service behind the hook"
      ],
      "pathToCertification": [
        "Wire a live CRD service endpoint",
        "Run Da Vinci CRD test suite / connectathon validation of card and system-action shapes"
      ]
    },
    {
      "id": "davinci-dtr",
      "name": "Da Vinci DTR (Documentation Templates and Rules)",
      "status": "ci-pending",
      "evidence": [
        "src/lib/pa/dtrService.ts; /api/dtr/evaluate and /api/dtr/package routes",
        "src/lib/dtr/questionnaireResponse.ts; src/lib/goldenThread/dtr/generator.ts and dtrFromPolicy.ts (Questionnaire from policy)"
      ],
      "residualGaps": [
        "CQL/Questionnaire population not exercised against a real DTR SMART app or accredited suite",
        "No live library/measure evaluation service"
      ],
      "pathToCertification": [
        "Wire a live DTR SMART app + CQL engine",
        "Run Da Vinci DTR test suite; validate QuestionnaireResponse against DTR profiles"
      ]
    },
    {
      "id": "carin",
      "name": "CARIN (Blue Button / consumer-directed)",
      "status": "partial",
      "evidence": [
        "Consumer/member data classes present (src/lib/patientRegistry.*, coverage mapping src/lib/graph/mapping/coverage.ts)",
        "Patient Access surface under CMS-0057-F §1 (cms0057fEndpoints.ts MANDATE_SECTIONS)"
      ],
      "residualGaps": [
        "No CARIN BB profile conformance validation (ExplanationOfBenefit, C4BB profiles) in CI",
        "Weakest-substantiated standard: data-class presence, not profile-validated CARIN BB resources"
      ],
      "pathToCertification": [
        "Model and validate C4BB ExplanationOfBenefit / Coverage against CARIN BB IG",
        "Run CARIN BB test suite against a live FHIR endpoint"
      ]
    },
    {
      "id": "smart",
      "name": "SMART on FHIR / SMART App Launch + Backend Services",
      "status": "ci-pending",
      "evidence": [
        "src/lib/fhir/smartLaunch.ts; src/lib/server/smartSession.ts; smart-backend auth option in server env",
        "backbone client auth config (src/lib/backbone/config.ts)"
      ],
      "residualGaps": [
        "src/lib/services/smartAuth.ts is an explicit demo stub (always authenticated in mock; returns 'mock-access-token')",
        "No conformance against SMART App Launch / Backend Services with a real authorization server"
      ],
      "pathToCertification": [
        "Wire a real SMART authorization server (OAuth2 + backend-services JWT assertion)",
        "Run Inferno SMART App Launch (STU2) and Backend Services conformance"
      ]
    },
    {
      "id": "cds-hooks",
      "name": "CDS Hooks",
      "status": "ci-pending",
      "evidence": [
        "src/lib/fhir/cdsHooks.ts real client (patient-view prefetch: Patient/Conditions/MedicationRequests; calls NEXT_PUBLIC_CDS_HOOKS_ENDPOINT)",
        "/api/cds, /api/cds-hooks, /api/cds-hooks/order-sign, /api/cds-hooks/patient-view routes"
      ],
      "residualGaps": [
        "Falls back to bundled demo cards when no endpoint is reachable; no accredited CDS Hooks conformance run",
        "No live discovery (/cds-services) against a real CDS service in CI"
      ],
      "pathToCertification": [
        "Wire a live CDS Hooks service; validate discovery + card/system-action shapes",
        "Run CDS Hooks conformance / connectathon validation"
      ]
    },
    {
      "id": "cms-0057-f",
      "name": "CMS-0057-F APIs (Patient Access, Provider Access, Payer-to-Payer, Prior Auth)",
      "status": "partial",
      "evidence": [
        "src/lib/cms0057fEndpoints.ts MANDATE_SECTIONS (§1-§4); /api-explorer + postman collection/environment/run generators",
        "src/lib/server/memberMatch.ts ($member-match for Provider Access / P2P); pas/submit for Prior Auth API",
        "bulk/start, bulk/status routes (bulk data)"
      ],
      "residualGaps": [
        "Depends on the same fail-closed seams (FHIR gateway, SMART auth, terminology) that are not live-wired",
        "No end-to-end run against a CMS-0057-F reference payer or accredited suite; attestation not performed"
      ],
      "pathToCertification": [
        "Wire live payer FHIR gateway + auth; provision the four API surfaces against real endpoints",
        "Execute CMS-0057-F / Da Vinci PDex, Provider Access, Payer-to-Payer test suites; complete regulatory attestation"
      ]
    },
    {
      "id": "ihe-pix-pdq",
      "name": "IHE PIX / PDQ (+ PIXm / PDQm)",
      "status": "absent",
      "evidence": [
        "src/lib/identity/external/ seam + types (pixPdqResolver HL7v2, pixmPdqmResolver FHIR); disposition.ts selection",
        "Honest stub: every external call throws ExternalEmpiNotConfiguredError until an endpoint is wired (README documents QBP/RSP and $ihe-pix mappings)"
      ],
      "residualGaps": [
        "Wire encoding is NOT implemented: no MLLP send/receive + QBP^Q23/Q22 parsing (PIX/PDQ), no fetch + Bundle/Parameters parsing (PIXm/PDQm)",
        "Internal EMPI match engine is the default path; external IHE identity is stub-only"
      ],
      "pathToCertification": [
        "Implement PIX/PDQ HL7v2 (MLLP + QBP/RSP) and/or PIXm/PDQm FHIR wire encodings behind the resolver seam",
        "Validate against an IHE PIX/PDQ manager; run IHE Connectathon (Gazelle) for the chosen actors"
      ]
    },
    {
      "id": "x12",
      "name": "X12 EDI (834 enrollment, 278 prior auth)",
      "status": "partial",
      "evidence": [
        "src/lib/pipeline/adapters/eligibility834.ts: 834 batch parse (INS loops), INS-3 maintenance-type -> coverage disposition",
        "F1 addressed: add(021)/change(001)/termination(024)/cancellation(030) map correctly; a termination produces a terminated/disenrolled coverage, NEVER an active re-enrollment",
        "Any other INS-3 value is fail-closed (quarantined 'unknown-maintenance-type'); 278 flows through the PAS path"
      ],
      "residualGaps": [
        "Full 834 code-set fidelity deferred: 025 reinstatement, 002 audit-compare, retro-term span handling quarantine today instead of being processed",
        "No X12 envelope/ack fidelity (ISA/GS/999/TA1), no trading-partner/clearinghouse certification"
      ],
      "pathToCertification": [
        "Complete 834 companion-guide code set + envelope/ack (999/TA1) handling",
        "Trading-partner testing / clearinghouse certification for 834 and 278"
      ]
    },
    {
      "id": "terminology",
      "name": "Terminology (RxNorm, LOINC, SNOMED CT, ICD-10-CM, CPT/HCPCS, HCC)",
      "status": "ci-pending",
      "evidence": [
        "src/lib/terminology/ semantic gate wired into pipeline stage 4 (validateCode/translate/classify)",
        "Value-set governance lifecycle with enforced maker-checker + immutable audit (src/lib/terminology/governance/, valueSetGovernanceStore seam)",
        "productionTerminologyService throws (fail-closed-stub, TerminologyServiceNotConfiguredError); seeded service serves demo codes in CI"
      ],
      "residualGaps": [
        "Seed allowlist covers only demo-fixture codes; HCC crosswalk is a small stub, NOT the full CMS mapping (classify/data/hcc-crosswalk.json)",
        "Licensed terminology content (SNOMED CT, LOINC, RxNorm, CPT/HCPCS) not present; no live terminology server"
      ],
      "pathToCertification": [
        "License terminology content and wire a real terminology server ($validate-code/$translate) behind the seam",
        "Load the full CMS-HCC grouping / crosswalk; validate value-set expansions against authoritative sources"
      ]
    },
    {
      "id": "part2-hipaa",
      "name": "42 CFR Part 2 / HIPAA",
      "status": "partial",
      "evidence": [
        "src/lib/consent/part2Consent.ts: consent-directed release (42 CFR 2.31 named recipient+purpose), break-glass (2.51) under a distinct elevated audit class, re-disclosure prohibition marker",
        "src/lib/pipeline/part2Basis.ts corrected segmentation basis (F2 progressed from a blunt drop); src/lib/authz/guard.ts break-glass pattern; PHI-safe audit descriptors throughout"
      ],
      "residualGaps": [
        "F2 honest scope: full consent lifecycle (capture, revocation propagation, expiry sweeps, a consent registry of record) is deferred",
        "No legal/compliance attestation; consent registry not wired (fail-closed consent seam)"
      ],
      "pathToCertification": [
        "Wire a consent registry of record + revocation/expiry propagation behind the consent seam",
        "Independent 42 CFR Part 2 / HIPAA compliance review and attestation of the disclosure surface"
      ]
    },
    {
      "id": "npi-nppes",
      "name": "NPI / NPPES provider identity",
      "status": "partial",
      "evidence": [
        "src/lib/identity/provider/npi.ts: offline deterministic NPI validation (80840-prefixed Luhn); an invalid NPI is rejected and never anchored (E9: no fabricated provider identity)",
        "providerIdentity seam (src/lib/identity/provider/directory.ts): NPPES directory fail-closed-stub, NppesNotConfiguredError in production; F5 fix anchors referral performers by validated NPI"
      ],
      "residualGaps": [
        "F5-b: claims / care-team / medication prescriber performer refs still raw strings; only the referral mapping was closed",
        "No live NPPES client wired; seeded synthetic directory is demo-only"
      ],
      "pathToCertification": [
        "Wire a live NPPES registry client behind the providerIdentity seam",
        "Apply the anchorProviderRef pattern to the remaining claims/care-team/medication mappings (F5-b)"
      ]
    }
  ]
}
```
