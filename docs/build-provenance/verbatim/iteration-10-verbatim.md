# Iteration 10 — verbatim agent prompts (exactly as sent, composed per v1.2)

Iteration-level master brief inherited by all: `coalition/inputs/iteration10_context.md`. Composed per v1.2, captured verbatim at send-time (E10). Wave D (overclaim red-team) appended at iteration close. HONESTY RULE: no standard asserted supported on a stub.

---

## Agent: 10 wave A — conformance matrix (evidence binding)
```
ROLE: Certification/conformance specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration10_context.md (Wave A scope).
CONTEXT MANIFEST: read the brief; the API route surface (src/app/api/**); the validators (src/lib/pipeline/profileValidator.ts, terminology/semanticValidator.ts); the identity external adapters (PIX/PDQ, PIXm/PDQm); the X12 adapters (src/lib/pipeline/adapters/*834*, claims); the Da Vinci PA machine + CRD/DTR (src/lib/pa/*, goldenThread); seamDispositions.ts (what is CI-pending); the existing test ids across tests/**. You OWN src/lib/certification/ + tests/certification/matrix.test.ts. Do NOT touch capabilityStatement/ (B) or docs/certification (C).
Working tree /home/claude/baseline; live.
SCOPE: build a conformance MATRIX as queryable DATA: standard -> capability -> evidence {codePath, testId, status: supported|partial|ci-pending|absent, note}. Cover EVERY claimed standard in the brief. A capability backed only by a stub/seam is ci-pending or partial with the honest note - NEVER supported. Deterministic. Tests: matrix covers every claimed standard; every supported row points to a REAL existing test id (assert the id exists); a stubbed capability is not supported.
Verify: npx tsc --noEmit 0; npx vitest run tests/certification green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove full standard coverage + supported-rows-point-to-real-tests + no-stub-marked-supported. E9: a capability must not default to supported.
OUTPUT: /home/claude/baseline/ITER10_WAVEA_REPORT.md; reply ONLY: matrix-covers-all y/n, supported-rows-real-tests y/n, no-stub-supported y/n, counts {supported/partial/ci-pending/absent}, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 10 wave B — FHIR CapabilityStatement from the real surface
```
ROLE: FHIR conformance specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration10_context.md (Wave B scope).
CONTEXT MANIFEST: read the brief; the real API routes (src/app/api/**) incl. fhir passthrough, match ($ihe-pix), pas ($submit), cds-hooks; the profile validator (what profiles/resources it enforces); the terminology $validate-code/$translate/$expand operations. You OWN src/lib/certification/capabilityStatement/ + tests/certification/capabilityStatement.test.ts. Do NOT touch the matrix (A) or docs (C); you MAY read the matrix types if exported.
Working tree /home/claude/baseline; live.
SCOPE: generate a FHIR R4 CapabilityStatement from the ACTUAL implemented surface - resources served, operations implemented ($ihe-pix, $validate-code, $translate, PAS $submit, etc.), profiles the validator enforces, SMART/CDS-Hooks security. It must NOT list a resource/operation the code does not serve. Deterministic. Tests: statement lists only implemented operations; a not-implemented operation (pick one, e.g. $everything if absent) is NOT listed; profiles reflect the validator; rest.security reflects SMART.
Verify: npx tsc --noEmit 0; npx vitest run tests/certification green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove the statement reflects only the real surface. E9: no operation asserted that is not implemented.
OUTPUT: /home/claude/baseline/ITER10_WAVEB_REPORT.md; reply ONLY: capabilitystatement-generated y/n, only-implemented-ops y/n, profiles-reflect-validator y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 10 wave C — certification readiness report (no doc-vs-evidence drift)
```
ROLE: Certification-readiness author (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration10_context.md (Wave C scope).
CONTEXT MANIFEST: read the brief; verification/GAP_AND_STUB_RISK_REGISTER.md (residuals to roll up); the CI-pending seams (seamDispositions.ts); the honesty ledgers (FAKE_FIDELITY.md if present). You OWN docs/certification/CERTIFICATION_READINESS.md + a machine-readable summary + tests/certification/readiness.test.ts. Do NOT touch the matrix (A) or capabilityStatement (B); consume the matrix's machine-readable output if exported, else define the summary schema the readiness doc and Wave A both satisfy and note the integration point.
Working tree /home/claude/baseline; live.
SCOPE: docs/certification/CERTIFICATION_READINESS.md - per standard: status, what substantiates it (evidence), residual gaps, and the concrete PATH TO CERTIFICATION (live infra / accredited test suite / licensed content still required). Include a machine-readable summary block (JSON) that a test can compare to the matrix. Honest: name what is CI-pending / synthetic / partial. Tests: the readiness machine-summary matches the Wave A matrix status set exactly (no doc-vs-evidence drift); every standard in the brief appears.
Verify: npx tsc --noEmit 0; npx vitest run tests/certification green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove readiness-matches-matrix (no drift) + every standard present + honest residuals. E9: readiness must not report ready for a standard the matrix marks ci-pending/absent.
OUTPUT: /home/claude/baseline/ITER10_WAVEC_REPORT.md; reply ONLY: readiness-doc y/n, matches-matrix-no-drift y/n, all-standards-present y/n, honest-residuals y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```
Note: composed COMPLETE prompts as sent.

---

## Agent: 10 wave D — convergence + OVERCLAIM red-team panel (COMPOSED v1.2; captured verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity = OVERCLAIM DETECTION: for each supported claim, is the evidence real + sufficient or a stub dressed as conformance? + standards-correctness; R2 negative-space = claimed standard with NO evidence; R3 stub-legitimacy = final honest grade of every CI-pending seam). Framework v1.2. This is the CAPSTONE red-team.
INHERITS: coalition/inputs/iteration10_context.md.
CONTEXT MANIFEST: working tree /home/claude/baseline (live). Read ITER10_WAVEA/B/C_REPORT.md; src/lib/certification/** (matrix + capabilityStatement); docs/certification/CERTIFICATION_READINESS.md + its summary; verification/GAP_AND_STUB_RISK_REGISTER.md; seamDispositions.ts. Edit any file to fix findings.
SCOPE: 1) CONVERGENCE to DRY: make the MATRIX the single source - wire the readiness comparator to the REAL exported matrix output (close the pending integration Wave C noted) and confirm the CapabilityStatement claims are a subset of the matrix supported/partial set; no divergent claim sets across matrix / statement / readiness. 2) E9 FAIL-OPEN SWEEP (certification): a capability must not default to supported; an unproven claim must read not-supported; readiness must not report ready for a ci-pending/absent standard; the CapabilityStatement must not list an unimplemented op. 3) RED-TEAM PANEL (mandatory, every persona MUST produce findings): R1 OVERCLAIM - audit EACH supported row: does the cited test actually exercise the standard's requirement, or is it a shallow/stub test? Demote any overclaim to partial/ci-pending. Check standards-correctness (profile URLs, operation names, X12 real-vs-synthetic). R2 - any claimed standard with zero evidence. R3 - final grade of every CI-pending seam (honestly fail-closed, not faked-green). 4) Fix Unacceptable (demote overclaims). Update verification/GAP_AND_STUB_RISK_REGISTER.md with a FINAL Iteration 10 rollup: the certification-readiness posture + the full residual list to production certification. Note the build plan (I0 -> I10) reaches an honest, evidenced readiness state.
DoD (composite v1.2): tsc 0; full suite green (orchestrator re-runs); size/ratchet PASS; no fail-open (E9); seams fail-closed (E1); convergence DRY (matrix single source); every persona produced findings; zero new Unacceptable (overclaims demoted); register final rollup done.
OUTPUT: /home/claude/baseline/ITER10_WAVED_REPORT.md + ITERATION10_SUMMARY.md. Reply ONLY: convergence DRY y/n, matrix-single-source y/n, E9 result, R1 overclaims-demoted count, R2/R3 counts, Unacceptable fixed y/n, register final-rollup y/n, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
