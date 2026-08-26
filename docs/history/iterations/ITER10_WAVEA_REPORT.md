# Iteration 10 — Wave A (Certification/Conformance Matrix)

Role: B2 certification/conformance specialist, disjoint tree. Framework v1.2.
Owned surface: `src/lib/certification/` (matrix data + machine-readable output) and
`tests/certification/matrix.test.ts`. Did NOT touch `capabilityStatement/` (Wave B)
or `docs/certification` (Wave C).

## What was built

A conformance MATRIX as queryable DATA:
`standard -> capability -> evidence { codePath, testId, status, note }`, plus a
deterministic machine-readable document that waves B and C consume.

Files (all under the size caps):

- `src/lib/certification/types.ts` (135) — `EvidenceStatus`, `ClaimedStandardId`,
  `Evidence`, `Capability`, `StandardEntry`, `ConformanceMatrix`, and the
  machine-readable output types (`MatrixRow`, `StatusCounts`, `MatrixDocument`).
  `status` has no default; `Evidence.seamId` optionally anchors a row to a dataMode
  seam for the mechanical stub cross-check.
- `src/lib/certification/matrix.data1.ts` (280) — rows for US Core/USCDI, Da Vinci
  PAS/CRD/DTR, CARIN, SMART, CDS Hooks, CMS-0057-F, IHE PIX/PDQ.
- `src/lib/certification/matrix.data2.ts` (286) — rows for IHE PIXm/PDQm, X12
  834/837/835/278/270-271, terminology, 42 CFR Part 2/HIPAA, NPI/NPPES.
- `src/lib/certification/matrix.ts` (136) — `CLAIMED_STANDARDS`,
  `CONFORMANCE_MATRIX`, queries (`standardById`, `coveredStandardIds`,
  `allCapabilities`, `capabilitiesWithStatus`), the deterministic
  `buildMatrixDocument()`, `statusCounts()`, `toRows()`, and `isStubBackedCapability()`.
- `src/lib/certification/index.ts` (32) — public surface for B and C (re-exports
  types + matrix API; does not touch B's `capabilityStatement/` subdir).
- `tests/certification/matrix.test.ts` (229) — 17 tests.

## Standard coverage (18 claimed standards, 42 capability rows)

Every standard named in the brief has at least one row. `CLAIMED_STANDARDS` is the
authoritative set; the matrix test proves the assembled matrix covers EXACTLY it
(no missing, no extra), including each X12 family member individually.

Counts by status: supported 17, partial 20, ci-pending 3, absent 2 (total 42).

Honesty highlights (E9 — a capability never defaults to supported):

- US Core `$validate` backend -> partial (`profileValidation` seam fail-closed;
  structural pre-flight is the supported part).
- SMART -> principal/scope enforcement supported; App Launch OAuth2 partial
  (`smartAuth.ts` is an explicit demo stub, full launch-context ci-pending).
- IHE PIX/PDQ + PIXm/PDQm -> message build/parse logic partial (real + tested vs a
  fake transport; live MLLP/FHIR wire ci-pending); the sync identity seam is a
  separate ci-pending row that fails closed.
- X12: 834 partial (real segment parser, 834-ish subset), 835 partial (CARC/RARC on
  FHIR ClaimResponse, no raw 835 EDI), 278 partial (PAS FHIR Bundle; 275/278 EDI a
  labeled channel), 270/271 partial (financial-clearance determination, not raw EDI),
  837 absent (claims modeled as FHIR Claim, no 837 EDI parser).
- CMS-0057-F -> §4 Prior Auth API supported; Patient/Provider Access + bulk partial;
  §3 Payer-to-Payer absent (declared in mandate metadata only).
- Terminology -> seeded engine ops (validate-code/translate/expand/classify/gate/
  governance) partial (production TS seam fail-closed); UCUM validation supported
  (offline deterministic).
- Part 2/HIPAA -> segmentation basis, PHI-safe errors, lifecycle, access-control all
  supported; consent opt-out partial (durable store seam fail-closed).
- NPI/NPPES -> NPI validation supported (offline Luhn); NPPES directory ci-pending
  (`providerIdentity` seam fail-closed).

## Mechanical guarantees enforced by the test

1. matrix covers EXACTLY the claimed standards (set equality both directions).
2. every non-null `testId` resolves to a real file on disk, and every `supported`
   row has a non-null, existing test file.
3. every primary `codePath` token resolves to a real file/dir.
4. no stub/mock-backed capability is `supported`: rows carrying a `seamId` are
   cross-checked against `config/seamDispositions.ts` — a `fail-closed-stub` or
   `mock-only` seam can never back a `supported` row.
5. `buildMatrixDocument()` is deterministic (identical JSON across builds); counts
   sum to the row total; `standardsCovered === CLAIMED_STANDARDS.length`.
6. capability ids unique; every capability has an explicit valid status + note.

## Verification

- `npx tsc --noEmit` -> exit 0.
- `npx vitest run tests/certification/matrix.test.ts` -> 17/17 passed.
- `npx vitest run tests/certification` -> 3 files, 56/56 passed (my 17 + Wave B
  capabilityStatement + Wave C readiness, which consume `@/lib/certification`).
- `bash check-file-sizes.sh` -> PASS (no new violations; ratchet intact).

## For waves B and C

Import from `@/lib/certification`: `buildMatrixDocument()` returns the deterministic
`{ version, claimedStandards, standardsCovered, counts, rows }` document; `toRows()`
gives the flat `MatrixRow[]`; `CLAIMED_STANDARDS` is the coverage contract.
