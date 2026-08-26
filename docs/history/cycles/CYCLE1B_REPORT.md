# Cycle 1B Report - BFF Route Test Coverage (Iteration 0)

Author: route-test author, Cycle 1. Governing standard: AI-CODING-CONVENTIONS v2 §14
(route coverage: auth 401, authz 403, validation 400/422, happy-path 200, PHI-safe body).
No src/ files were modified; all additions are new files under tests/api/.

## Routes found (25 route.ts files under src/app/api)

```
auth/callback  auth/login  auth/logout  auth/session
bulk/start  bulk/status
cds  cds-hooks  cds-hooks/order-sign  cds-hooks/patient-view
config-status  consent/provider-access
dtr/evaluate  dtr/package
evidence/[id]  fhir/[...path]  financial-clearance
match  network-adequacy  pas/submit
postman-collection  postman-environment  postman-run
webhooks/claim-response  work-queue
```

## New files

| File | Lines | Tests | Skips |
|---|---|---|---|
| tests/api/_helpers.ts (shared request builder, session/guard mocks, PHI-safe assertion) | 160 | - | - |
| tests/api/routes-auth.test.ts (login, callback, logout, session GET/POST) | 159 | 14 | 0 |
| tests/api/routes-fhir-passthrough.test.ts (fhir/[...path] GET/POST) | 143 | 8 | 1 |
| tests/api/routes-match-bulk.test.ts (match, bulk/start, bulk/status) | 149 | 11 | 1 |
| tests/api/routes-cds.test.ts (cds, cds-hooks discovery, patient-view, order-sign) | 213 | 12 | 2 |
| tests/api/routes-dtr.test.ts (dtr/evaluate, dtr/package) | 104 | 8 | 2 |
| tests/api/routes-evidence-workqueue.test.ts (evidence/[id], work-queue) | 117 | 8 | 0 |
| tests/api/routes-financial-clearance.test.ts | 107 | 9 | 1 |
| tests/api/routes-consent.test.ts (consent/provider-access GET/POST) | 133 | 8 | 0 |
| tests/api/routes-pas-webhook.test.ts (pas/submit, webhooks/claim-response) | 169 | 10 | 1 |
| tests/api/routes-network-adequacy.test.ts (GET + assistant POST) | 109 | 9 | 0 |
| tests/api/routes-config-postman.test.ts (config-status, postman-collection/-environment/-run) | 163 | 10 | 1 |

Total new tests: 107 (98 passing, 9 skipped with named infrastructure reasons).
All files are far under the 500-line test cap.

## House pattern established (tests/api/_helpers.ts)

- Handlers are imported directly from the route files and invoked with a
  constructed NextRequest (makeRequest); dynamic segments via routeParams().
- The session seam (@/lib/server/smartSession) and authz seam (@/lib/authz/guard)
  are stubbed with vi.mock factories driven by mutable sessionState/guardState,
  so 401 and 403 branches are exercised without weakening any route.
- Dev-mock (offline stub) mode is toggled through the real env switch the routes
  read (ALLOW_DEV_MOCK_AUTH); feature-flag 404 gates through NEXT_PUBLIC_FLAG_*.
- expectPhiSafeBody/expectPhiSafeError fail on SSN-shaped values, DOB-shaped ISO
  dates, seed-patient names, and PHI-bearing JSON keys; applied to every error
  body (401/400/403/404/5xx) per §14.
- Audit events emitted by routes under test are redirected to a temp sink via
  AUDIT_LOG_DIR; config-status POST tests snapshot and restore .rhtp-config.json.

## Cases per route (§14 matrix)

- Auth 401: asserted on every route that enforces a session (fhir passthrough
  GET/POST, match, bulk start/status, cds, dtr/package, evidence, work-queue,
  financial-clearance, network-adequacy GET/POST, pas/submit, consent GET/POST
  in live mode, webhook via shared-secret 401, auth/callback failure 401).
- Authz 403: evidence/[id], work-queue, financial-clearance (guard-denied path).
  Other routes call the guard with a fixed permitted role or enforce no
  role gate in source; tested as they exist.
- Validation 400: auth/callback, auth/session POST (missing field + malformed
  JSON), match, bulk/start (missing priorPayer + malformed JSON), bulk/status,
  cds (missing hookId), dtr/evaluate (missing cptCode + malformed JSON),
  dtr/package, evidence (injection-shaped id), financial-clearance (bad
  patientId, bad orderCode, bad NPI), consent (missing memberId/action and
  missing recordedBy attribution), network-adequacy (non-string query, over-cap
  query), pas/submit (missing claimBundle), config-status (malformed JSON).
  The only 422 branch in the codebase (financial-clearance order code resolved
  from live FHIR) is unreachable offline and is covered by a reasoned skip.
- Happy path 200/201/202: every route, with response-shape assertions
  (OperationOutcome shape on errors; Bundle/Parameters/ClaimResponse/domain
  shapes on success; 202 for bulk start, PAS human gate, and verified webhook;
  redirects asserted for the auth flows).
- Route-specific invariants also covered: PAS human gate refuses submission
  without approvedBy (202 + informational OperationOutcome); webhook rejects
  missing/wrong shared secret; config-status strips a client-injected
  wso2ClientSecret and never echoes secrets; correlation id echo on the FHIR
  passthrough; per-patient scoping of mock FHIR bundles and evidence records.

## Skipped cases (9, each with the blocking infrastructure named in-line)

1. fhir/[...path] POST live create: requires the Docker HAPI/APIM backbone.
2. bulk/status live export polling: requires the bulk gateway (Ballerina backbone).
3. cds-hooks/patient-view live care-gap cards: requires the Docker HAPI FHIR server.
4. cds-hooks/order-sign live DDI check: requires the Docker HAPI FHIR server.
5. dtr/evaluate via live Policy Engine: requires the POLICY_ENGINE_URL service.
6. dtr/package $questionnaire-package: requires the Docker FHIR backbone.
7. financial-clearance 422 invalid resolved order code: requires the Docker HAPI
   backbone (mock registry orders are always valid CPT codes).
8. pas/submit live submit: requires the Docker services (Ballerina) backbone.
9. postman-run SSE Newman run: requires the app server listening on localhost:4029.

## Verification

- `npx vitest run`: 44 files passed, 321 tests passed, 9 skipped, 0 failures
  (baseline 223 tests still green; 98 new passing + 9 reasoned skips).
- `npx tsc --noEmit`: exit 0.
- `bash check-file-sizes.sh`: PASS, no new violations; ratchet intact
  (75 frozen legacy files unchanged or smaller).
- No repo artifacts left behind: .rhtp-config.json restored/removed by the
  config tests; route audit output redirected to a temp directory. The
  pre-existing .audit/audit.log.jsonl is written by the existing identity
  test suite, not by these tests.
