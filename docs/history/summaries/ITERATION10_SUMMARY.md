# Iteration 10 Summary — Certification / Conformance Capstone

Framework v1.2. Iteration 10 built the certification/conformance layer and, in the
capstone Wave D, converged it to a single source of truth with a mechanically honest
readiness posture. The build plan (I0 -> I10) reaches an HONEST, EVIDENCED
certification-READINESS state: not certified, but every claim substantiated by a real
code path + test, and every gap named and fail-closed.

## What the iteration delivered

| wave | role | deliverable |
|---|---|---|
| A | conformance-matrix specialist | The MATRIX as queryable data — 18 claimed standards, 43 capability rows, `standard -> capability -> evidence{codePath,testId,status,note}` + a deterministic machine-readable document. Every `supported` row cites a real on-disk test; no stub/mock seam backs a supported row (E9). |
| B | FHIR conformance specialist | A deterministic FHIR R4 CapabilityStatement generated ONLY from the audited implemented surface. Lists no unimplemented op (`$everything` absent by construction); asserts no US Core profile the structural validator does not enforce. |
| C | certification-readiness author | The per-standard readiness doc (13 standards) + machine-readable summary + an ARMED readiness->matrix comparator. Nothing `ready`; every standard carries evidence, residual gaps, and a path to certification. |
| D | convergence engineer + red-team host | Converged the three to DRY (matrix = single source), wired the comparator to the real matrix output, ran the E9 sweep + three-persona red-team, demoted overclaims, wrote the final register rollup. |

## Convergence (Wave D) — matrix is the single source

`src/lib/certification/readinessRollup.ts` derives each standard's readiness status
FROM the live matrix via a single declared `ciCeiling` and emits
`docs/certification/capability-matrix.summary.json` at the exact path Wave C armed
against. The readiness comparator flipped from armed to ENFORCED; a new convergence
test proves the rollup partitions all 18 claimed standards, is drift-gated byte-equal
to the committed summary, matches the readiness doc per standard, and that every
CapabilityStatement operation is a subset of the matrix's supported/partial rows. No
divergent claim set survives across the three artifacts.

## Red-team disposition (capstone)

- **R1 Overclaim: 3 Unacceptable demoted** — `pas-fhir-submit`, `crd-order-sign`,
  `cms-prior-auth-api` (supported -> partial); their cited tests exercise route/card
  plumbing, not the standard's conformance requirement. Standards-correctness (URLs,
  X12 synthetic labeling) verified clean.
- **R2 Negative-space: 1 Unacceptable fixed** — `$member-match` was claimed by the
  statement with no matrix evidence; added the `cms-member-match` partial row.
- **R3 Stub-legitimacy: 0 faked-green** — every CI-pending seam fails closed with a
  named `*NotConfiguredError` (consent = plain Error, naming residual); absent rows
  carry no proving test.
- **Unacceptable fixed: 4.** E9 fail-open sweep of the certification surface: CLEAN.

## Final readiness posture (nothing `ready`)

US Core/USCDI `partial` · Da Vinci PAS/CRD/DTR `ci-pending` · CARIN `partial` · SMART
`ci-pending` · CDS Hooks `ci-pending` · CMS-0057-F `partial` · IHE PIX/PDQ(+PIXm/PDQm)
`absent` · X12 `partial` · Terminology `ci-pending` · 42 CFR Part 2/HIPAA `partial` ·
NPI/NPPES `partial`.

The consolidated residual list to production certification (live infra behind
fail-closed seams, real FHIR `$validate`, IHE wire encodings, X12 fidelity, accredited
conformance runs, Part 2 consent lifecycle + attestation, NPI F5-b, and the I9
operability residuals) is in `verification/GAP_AND_STUB_RISK_REGISTER.md` (Iteration 10
section). Standing honesty ceiling (NS-05): live-integration-executed count is 0 —
which is exactly why the honest terminal status is certification-READINESS, not
certification.

## Verification
- `npx tsc --noEmit`: exit 0.
- `npx vitest run`: 1435 passed / 1 expected-fail / 91 skipped (187 files, 7 skipped).
- `npx vitest run tests/governance`: 34 passed.
- `bash check-file-sizes.sh`: PASS (ratchet intact).
