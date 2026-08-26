# Iteration 10 — Wave C (Certification-readiness author, B2) — Report

Framework v1.2. Role: certification-readiness author, disjoint tree. Working tree
`/home/claude/baseline`, live. Waves A (capability matrix) and B (capabilityStatement)
run in PARALLEL with this wave.

## Ownership and scope

OWNED and authored this wave (no other tree touched):
- `docs/certification/CERTIFICATION_READINESS.md` — the readiness doc, per standard.
- `docs/certification/readiness-summary.json` — the machine-readable summary (shared schema).
- `tests/certification/readiness.test.ts` — the drift gate (22 tests).

Did NOT touch: the matrix (Wave A), `capabilityStatement` (Wave B — its
`tests/certification/capabilityStatement.test.ts` landed in the same dir in parallel and
is left untouched), `src/lib/config/seamDispositions.ts`, or any src seam.

## Inputs consumed

- `verification/GAP_AND_STUB_RISK_REGISTER.md` — residuals rolled up per standard
  (F1 X12 834, F2 Part 2, F4 US Core $validate, F5/F5-b NPI/NPPES, NS-02/03/05).
- `src/lib/config/seamDispositions.ts` — the CI-pending fail-closed-stub seams
  (profileValidation, terminology, valueSetGovernance, providerIdentity, crossReference,
  consent, identity...) map directly to per-standard `ci-pending`/`partial` statuses.
- `src/lib/**` evidence (pa/, dtr/, fhir/, terminology/, identity/, consent/, pipeline/,
  server/, cms0057fEndpoints.ts) cited file-by-file per standard.
- Honesty ledgers (`rg FAKE_FIDELITY`) and NS-05 (live-integration count 0) — the honest
  ceiling that keeps every status short of `ready`.

## Integration point (matrix not yet exported — Wave D reconciles)

No Wave A matrix machine-readable output exists at author time (parallel wave). Per the
brief I DEFINED the shared summary schema both the readiness doc and the Wave A matrix
satisfy: `integration.matrixSummaryPath = docs/certification/capability-matrix.summary.json`,
`matrixStandardIdField = id`, `matrixStatusField = status`, `statusSetContract =
[ready, ci-pending, partial, absent]`. The test's comparator is ARMED: it compares
status-by-standard the moment Wave A exports its matrix at that path, else asserts
self-consistency. Wave D flips it from armed to enforced.

## Readiness statuses (honest — nothing is `ready`)

| standard | status | key residual |
| --- | --- | --- |
| US Core / USCDI | partial | F4: real $validate absent (structural gate only) |
| Da Vinci PAS | ci-pending | no accredited suite; live payer gateway unwired |
| Da Vinci CRD | ci-pending | cards not profile-validated; no live rules service |
| Da Vinci DTR | ci-pending | CQL/Questionnaire not run vs real DTR app |
| CARIN (BB) | partial | no C4BB profile conformance (weakest-substantiated) |
| SMART | ci-pending | smartAuth.ts is a demo stub; no real auth server |
| CDS Hooks | ci-pending | demo-card fallback; no live discovery |
| CMS-0057-F APIs | partial | depends on unwired seams; no attestation |
| IHE PIX / PDQ | absent | wire encoding (MLLP/QBP-RSP, PIXm/PDQm) not implemented |
| X12 (834/278) | partial | F1 add/term done; full code-set + acks deferred |
| Terminology | ci-pending | licensed content absent; HCC crosswalk is a stub |
| 42 CFR Part 2 / HIPAA | partial | F2: full consent lifecycle deferred; no attestation |
| NPI / NPPES | partial | F5-b raw refs remain; no live NPPES client |

E9 holds structurally: nothing is `ready`, so no drift can promote a matrix
`ci-pending`/`absent` entry to `ready` here.

## The test (drift gate) — 22 tests, all green

`tests/certification/readiness.test.ts`:
1. Deliverable exists (doc + summary).
2. NO doc-vs-evidence drift: the embedded ```json block in the doc `toStrictEqual` the
   summary JSON.
3. Every brief standard present (13 ids; requiredStandards == entry id set; no dupes/extras).
4. Honest residuals / E9: every status in vocabulary; NO standard `ready`; every standard
   has non-empty evidence + residualGaps + pathToCertification.
5. Readiness-matches-matrix: comparator armed; when the Wave A matrix exists at
   `matrixSummaryPath` it asserts exact per-standard status equality + E9, else asserts
   self-consistency (Wave D reconciles).

## Verification (in /home/claude/baseline)

- `npx tsc --noEmit` — exit 0.
- `npx vitest run tests/certification` — 2 files, 39 tests, all pass (my readiness.test.ts
  contributes 22; the other file is Wave B's capabilityStatement.test.ts, untouched).
- `bash check-file-sizes.sh` — PASS (no new violations; ratchet intact).

## DoD (composite v1.2)

- readiness-doc: YES (per-standard status + evidence + residuals + path to certification).
- matches-matrix-no-drift: YES (internal doc<->summary drift gate green; cross-wave
  comparator defined + armed against the shared schema; Wave D reconciles the matrix).
- all-standards-present: YES (13/13 brief standards, enforced by test).
- honest-residuals: YES (nothing `ready`; NS-05 ceiling stated; CI-pending/synthetic/
  partial named per standard; cross-cutting NS-02/03/05 rolled up).
- E9: readiness reports `ready` for nothing, so never for a ci-pending/absent standard.
