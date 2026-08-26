# Iteration 11 Summary - final buildable closeout (record 20/20, F5-b + 4 HIGH + 1 MED closed, framework v1.3)

Framework v1.3. Four parallel build waves on disjoint trees plus a convergence/red-team Wave D.
This is the FINAL BUILDABLE iteration: it clears every open register finding that can be built
in-sandbox and adds the R5 cross-examiner + E12 gate to the framework. No live infra added; all
CI-pending seams stay fail-closed and honestly labeled.

## What shipped

- **Wave A (claims / provider-integration):** F5-b closed - claims/medication/care-team
  performer+prescriber refs resolve to a ProviderIdentity via the reused `anchorProviderRef`
  resolver (`SUBMITTED_BY` / `PRESCRIBED_BY` / `DISPENSED_BY` / care-team roster); no NPI stays
  raw+`deferred-I8A`. Claims golden-thread integrity - an orphan ClaimResponse/EOB HOLDS to the
  dead-letter store instead of dangling an edge. CARC X12 group (CO/PR/OA/PI) captured with
  member-liability derived (missing group -> `indeterminate`); CARC/RARC routed through the
  stage-4 terminology gate.
- **Wave B (three new record domains -> 20/20):** conditions (T1, ICD-10-CM/SNOMED/HCC,
  semantic-gated), diagnostic-reports (honest per-record T1 computable / T2 narrative), and
  family-history (T1). WpcDomain extended to 20; registered one-to-one; the 20/20 record-count
  test pins the count from both compile-time and runtime.
- **Wave C (care-coordination lifecycle + tiebreak):** referral loop-closure (ServiceRequest
  status lifecycle as a dated trail + closed-loop signal making the closed-loop rate computable);
  goal achievement (lifecycle + achievement + target, so a goal can be MET); and the survivorship
  source-order tiebreak now honored (was declared-but-ignored).
- **Wave F (framework v1.2 -> v1.3):** added R5 (Verification / Cross-Examiner persona) and E12
  (claim-vs-evidence gate), wired E12 into the composite DoD, bumped the version. Docs only.
- **Wave D (this convergence):** DRY reconciliation, E9 sweep, the five-persona panel, E12, and
  the register final closeout.

## Register findings CLOSED (6) - each with its evidencing test

| id | sev | evidencing test |
|---|---|---|
| F5-b | HIGH | `tests/pipeline/claimsProviderRef.test.ts` |
| R1-I7-5 (claims integrity) | HIGH | `tests/pipeline/claimsIntegrity.test.ts` |
| R1-I7-6 (CARC group) | HIGH | `tests/pipeline/carcGroup.test.ts` |
| R1-I6-1 (referral loop-closure) | HIGH | `tests/pipeline/referralLifecycle.test.ts` |
| R1-I6-2 (goal status) | HIGH | `tests/pipeline/goalStatus.test.ts` |
| R1-8Ai-2 (survivorship tiebreak) | MED | `tests/identity/survivorshipTiebreak.test.ts` |

Plus the C9 record model 17/20 -> **20/20** (conditions / diagnostic-reports / family-history).

## Convergence + verification

- **Convergence DRY: yes** - WpcDomain appended once to 20; 20 specs one-to-one; provider
  resolver + terminology gate + dead-letter store REUSED across waves, not duplicated.
- **E9: clean** - orphan HELD, unresolvable provider raw, missing CARC group `indeterminate`,
  narrative diagnostic T2, referral/goal default-open; all fail-safe by construction (0 fixed).
- **Five-persona panel:** R1 4 findings, R2 7-item missing-list, R3 6 Acceptable (0 Risky/
  Unacceptable), R4 2 findings + 1 verified-OK, **R5 10 UPHELD / 0 DEMOTED**.
- **E12: satisfied** - every closed finding cites a real passing test that exercises it.
- **Zero new Unacceptable.**

## Gates

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: 1509 passed / 1 expected-fail / 91 skipped.
- `bash check-file-sizes.sh`: PASS (ratchet intact).
- `npx vitest run tests/governance`: 34 passed.

## Build status: buildable-completion

Every open register finding buildable in-sandbox is now CLOSED. The FINAL residual list is ONLY
the non-buildable items:

1. **Live infrastructure (NS-05, live-integration count still 0)** - live FHIR/payer gateway,
   SMART auth server, CDS Hooks, terminology server, NPPES, external MPI, durable consent registry,
   durable pg stores, legal-hold store, migration advisory lock, pool sizing + readiness DB ping,
   observability. All fail closed with named `*NotConfiguredError`.
2. **Licensed content** - SNOMED CT / LOINC / RxNorm / CPT-HCPCS + full CMS-HCC crosswalk + full
   834 code set + a real 837 parser + raw EDI; all seed content is illustrative/`stub:true`.
3. **External accreditation** - Inferno / ONC (g)(10), SMART App Launch + Backend Services,
   Touchstone / Da Vinci, CDS Hooks connectathon, CARIN BB, CMS-0057-F suites, IHE Connectathon,
   42 CFR Part 2 / HIPAA attestation.

The MED domain-intelligence items raised this wave (RAF scoring, T2 retrieval, structured goal
targets, adapter-side X12 extraction, mechanized E12) are enhancements, not correctness or
fail-open defects, and are routed to I12+.
