# ITER10 Wave B (B2) Report: FHIR R4 CapabilityStatement

Role: FHIR conformance specialist (B2), disjoint tree. Framework v1.2.
Scope owned: `src/lib/certification/capabilityStatement/` and `tests/certification/capabilityStatement.test.ts`.
Did NOT touch the matrix (Wave A) or docs (Wave C).

## What was built

A deterministic FHIR R4 CapabilityStatement generator driven by the ACTUAL
implemented surface of the application. No clocks, no randomness: the same
surface produces a byte-identical statement (proved by a determinism test over
`serializeCapabilityStatement`).

Files created:

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/certification/capabilityStatement/types.ts` | 138 | Minimal R4 CapabilityStatement typed subset + implemented-surface fact types |
| `src/lib/certification/capabilityStatement/surface.ts` | 149 | The audited implemented surface as data, each entry with a `provenance` path to the implementing file |
| `src/lib/certification/capabilityStatement/generate.ts` | 150 | Deterministic generator + stable serializer (sorted keys/arrays) |
| `src/lib/certification/capabilityStatement/index.ts` | 20 | Public exports |
| `tests/certification/capabilityStatement.test.ts` | 144 | 17 tests proving the statement reflects only the real surface |

All under the 400-line (prod) / 500-line (test) caps.

## The real surface, and how the statement mirrors it

Every listed capability was verified against source before being asserted.

### Resources served (`rest[mode=server].resource`)

From the FHIR passthrough `src/app/api/fhir/[...path]/route.ts`. GET builds real
responses and POST routes to `fhirCreate`:

- Patient: `read`, `search-type`, `create` (identity read is IDOR-scoped to the session principal; break-glass audited).
- Coverage, Condition, ClaimResponse, MedicationRequest: `search-type`, `create` (searchset builders; no per-id read is wired, so none is claimed).

No other resource type is served, so none is listed. Tests assert Observation,
Encounter, Practitioner, Immunization are absent.

### Operations listed (only those implemented)

Server operations (`rest[mode=server].operation`), each with a canonical
OperationDefinition URL:

- `$member-match` = `src/app/api/match/route.ts` POST to `memberMatch.ts` (Da Vinci HRex; consent-gated).
- `$submit` (PAS) = `src/app/api/pas/submit/route.ts` POST to `pasClient.ts` (Da Vinci PAS Claim/$submit; human-gated, 202 without an approver).
- `$validate-code` = `src/lib/terminology/validateCode/validateCode.ts`.
- `$translate` = `src/lib/terminology/translate/crosswalkTranslate.ts`.
- `$expand` = `src/lib/terminology/expand/expand.ts`.

Client operation (`rest[mode=client].operation`):

- `$ihe-pix` (IHE PIXm ITI-83) = `src/lib/identity/external/fhirPixm.ts` + `pixmPdqmResolver.ts`. This app is a CLIENT of an external PIXm server; it does not SERVE the operation. It is therefore honestly placed under `rest.mode = client`, not asserted as a served operation.

Distinction recorded in the surface via an `exposure` tag per operation
(`http-route`, `terminology-library`, `client-invoked`). The terminology
operations are backed by real seeded implementations; the production path fails
closed. They are declared as terminology-service capabilities of the server.

### E9 proof: no operation asserted that is not implemented

`$everything` has NO implementation anywhere in the repo. There is no way to add
it to the statement without a real surface entry, so it is absent by
construction. Tests assert `$everything` (and `$diff`, `$docref`, `$lastn`,
`$graphql`, `$apply`) never appear, and that the serialized statement string does
not contain `$everything`.

### Profiles reflect the validator (honest, not aspirational)

`src/lib/pipeline/profileValidator.ts` is a STRUCTURAL pre-flight
(id `structural-preflight-not-us-core-validate`), NOT US Core `$validate`; the
production validator (`us-core-profile-validator:fail-closed`) fails closed and
admits nothing. It enforces NO named FHIR profile, so `enforcedProfiles` is empty
and NO `supportedProfile` and NO US Core canonical is emitted on any resource. A
test guards the premise (validator id contains `structural-preflight`) and asserts
the serialized statement never matches `us-core`. If a real `$validate` backend is
later wired, `enforcedProfiles()` in `surface.ts` is the single place its profiles
enter the statement.

### rest.security reflects SMART

From `src/lib/server/smartSession.ts` (OAuth2 authorization-code + PKCE, server
held token; the browser never sees a token) and the WSO2 scope default in
`src/lib/server/env.ts`. `rest.security.service` carries the
`SMART-on-FHIR` coding; the description lists the configured scopes
(`openid fhirUser launch/patient patient/*.read offline_access`) and notes that
CDS Hooks discovery is served at `/api/cds-hooks`.

## Wave A integration point

Wave A owns the conformance matrix; it was not present in the tree at build time.
This module is self-standing. Wave A can import `implementedSurface` and
`generateCapabilityStatement` from
`@/lib/certification/capabilityStatement` to cross-check matrix rows against the
generated statement. No dependency runs the other direction.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/certification`: 1 file, 17 tests passed.
- `bash check-file-sizes.sh`: PASS (no new violations; ratchet intact; all new files under cap).

New tests added: 17.
