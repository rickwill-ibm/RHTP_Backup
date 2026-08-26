# Iteration 10 — Wave D (Convergence engineer B3 + red-team panel host) — Report

Framework v1.2. THE CAPSTONE red-team. Working tree `/home/claude/baseline`, live.
Role: converge the three certification artifacts to DRY (matrix = single source),
run the E9 fail-open sweep over the certification surface, host the mandatory
three-persona red-team (R1 overclaim / R2 negative-space / R3 stub-legitimacy),
fix every Unacceptable, and write the final Iteration 10 register rollup.

## 1. Convergence to DRY — the matrix is the single source

Before this wave the three artifacts each made independent status claims about the
same standards, reconciled only by hand-authoring, and Wave C's readiness->matrix
comparator was ARMED but INERT (no matrix summary existed at the path it watches).

Delivered:
- `src/lib/certification/readinessRollup.ts` (181 lines) — derives the per-standard
  certification-readiness status FROM the live matrix and emits the deterministic
  machine-readable rollup. Two vocabularies, one derivation: the readiness status is
  NOT a mechanical max of capability statuses (a standard whose capabilities are all
  `supported` in CI can still be only `ci-pending` for certification — NS-05); it
  derives 1:1 from a single declared per-standard `ciCeiling`
  (`wire-absent`->absent, `material-ci-gap`->partial, `ci-complete`->ci-pending),
  and E9 invariants cross-check that ceiling against the REAL capability statuses so
  it can never be set more optimistically than the matrix substantiates.
- `docs/certification/capability-matrix.summary.json` — generated at the EXACT
  `matrixSummaryPath` Wave C armed against. This is what wires the readiness
  comparator to the real exported matrix output.
- `src/lib/certification/index.ts` — re-exports the rollup API.
- `tests/certification/matrixRollup.test.ts` (134 lines, 8 tests) — the convergence
  gate.

`tests/certification/readiness.test.ts` flipped from ARMED to ENFORCED: the branch
"status set matches the matrix EXACTLY, per standard (no drift)" now runs and is
green. No divergent claim set survives across matrix / statement / readiness.

## 2. Matrix single source — proofs enforced by matrixRollup.test.ts

1. The rollup covers EXACTLY the 13 readiness standards and PARTITIONS all 18
   claimed standards (each claim id in exactly one bucket; X12 family -> `x12`,
   PIXm/PDQm absorbed into `ihe-pix-pdq`).
2. E9 / honesty invariants have zero violations (no `ready`; `absent` requires zero
   supported caps; `ci-pending` requires zero absent caps; any non-absent status
   requires >=1 implemented cap; every aggregated claim id exists in the matrix).
3. The committed `capability-matrix.summary.json` is byte-equal to the freshly built
   rollup (drift gate).
4. Every readiness-doc standard status EQUALS the matrix rollup (DRY, no divergence).
5. Every CapabilityStatement operation maps to a matrix capability that is
   `supported` or `partial` — statement claims are a subset of the matrix.

## 3. E9 fail-open sweep (certification surface) — CLEAN

`rg`-ed the fail-open shapes (`|| 'supported'`, `?? 'supported'`, default->supported,
`|| 'ready'`, optimistic booleans, blank-config-as-configured) across
`src/lib/certification/**`. NONE found. Each honesty property holds by construction
and is test-enforced: a capability never defaults to supported (no default in the
type; every row explicit); an unproven claim reads not-supported (the 14 `supported`
literals each cite a real on-disk test; no stub seam backs a supported row); readiness
reports `ready` for nothing (0 in both summaries); the CapabilityStatement lists no
unimplemented op (`$everything` absent by construction; `enforcedProfiles()` returns
`[]` so no US Core `supportedProfile` is asserted). The Unacceptable items this wave
were OVERCLAIMS, not fail-open defaults. **E9: clean.**

## 4. Red-team panel (every persona produced findings)

### R1 — OVERCLAIM detection (audit EACH supported row) — 3 Unacceptable DEMOTED
- **pas-fhir-submit** supported->partial: `/api/pas/submit` forwards a caller-supplied
  bundle to `pasClient` (never calls `pasService.buildPasBundle`); the cited test posts
  a hand-made bundle and checks a mock ClaimResponse — proves route/human-gate, not PAS
  Bundle conformance.
- **crd-order-sign** supported->partial: the cited test proves CDS-Hooks card plumbing,
  not Da Vinci CRD card/system-action profile conformance.
- **cms-prior-auth-api** supported->partial: an aggregate "surface implemented and
  tested" claim over sub-capabilities that are themselves partial.
- Plausible-disclosed-kept: `uscore-structural-validation` (honest structural note,
  not US Core $validate), `dtr-evaluate` (real policy eval; DTR-app conformance is the
  separate ci-pending gap). Standards-correctness (OperationDefinition URLs, X12
  real-vs-synthetic) verified clean.

### R2 — NEGATIVE-SPACE (claimed standard/op with zero matrix evidence) — 1 Unacceptable FIXED
- **$member-match** was asserted by the CapabilityStatement with NO matrix evidence row.
  Added `cms-member-match` (partial) under CMS-0057-F citing `routes-match-bulk.test.ts`.
  The subset check now maps all six statement ops to supported/partial rows.

### R3 — STUB-LEGITIMACY (final grade of every CI-pending seam) — 0 faked-green
Graded the 3 ci-pending rows (external EMPI x2, NPPES directory) and 8 seam-anchored
partial/absent rows against `seamDispositions.ts` + the governance fail-closed proof.
Every CI-pending seam fails CLOSED with a named `*NotConfiguredError` (the `consent`
seam fails closed on a plain Error — a naming, not a safety, residual). Absent rows
carry a null testId (no proving test). No green test stands in for a live backend.

## 5. Unacceptable fixed: 4
3 R1 demotions + 1 R2 evidence-row addition. Zero NEW Unacceptable introduced.

## 6. Final register rollup
`verification/GAP_AND_STUB_RISK_REGISTER.md` gained the FINAL Iteration 10 section:
certification-readiness posture, the red-team disposition, the consolidated full
residual list to production certification (8 groups), and the standing NS-05 honesty
ceiling. The I0->I10 build reaches an HONEST, EVIDENCED readiness state — not
certified, but every claim substantiated and every gap named.

## Verification (DoD composite v1.2)
- `npx tsc --noEmit` -> exit 0.
- `npx vitest run` -> 187 files passed / 7 skipped; 1435 tests passed / 1 expected-fail
  / 91 skipped. (`tests/certification` = 4 files, 64 tests.)
- `npx vitest run tests/governance` -> 34 passed.
- `bash check-file-sizes.sh` -> PASS (no new violations; ratchet intact; new files
  181 / 134 lines, under cap).
- Convergence DRY: yes. Matrix single source: yes. E9: clean. Every persona produced
  findings. Zero new Unacceptable (overclaims demoted). Register final rollup: done.
