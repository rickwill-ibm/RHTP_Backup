# Iteration 11 Wave A (B2, claims/provider-integration) Report

Role: Claims / provider-integration specialist. Disjoint tree. Framework v1.2.
Working tree: /home/claude/baseline (live). Waves B/C/F ran in parallel; no shared files touched.

## Scope delivered (all three)

### 1) F5-b: performer + prescriber ref resolution (claims / care-team / medication)

Reused the 8A-i provider resolver (`anchorProviderRef` sync path) and the ProviderIdentity
node namespace exactly as the referrals mapping already does. No resolver logic reimplemented.

- New shared helper `src/lib/graph/mapping/providerRef.ts` (`providerRefMutations`): one ref ->
  either an NPI-anchored ProviderIdentity node + resolved edge, or the raw ref node flagged
  `deferred-I8A`. Empty ref -> no edge (mirrors referrals). E9: never invents an NPI.
- `src/lib/graph/mapping/claimsFinancial.ts` — `submitted()` resolves the billing/rendering
  provider via new edge `SUBMITTED_BY` (Claim -> ProviderIdentity | raw).
- `src/lib/graph/mapping/medication.ts` — `prescribed()` resolves the prescriber via
  `PRESCRIBED_BY`; `dispensed()` resolves the dispensing performer via `DISPENSED_BY`.
- `src/lib/graph/mapping/careteam.ts` — pipeline-fed (`care-team.formed`) participants that
  carry a valid NPI resolve to a ProviderIdentity roster node (MEMBER_OF_CARE_TEAM /
  HAS_CARE_TEAM point to it); no valid NPI keeps the raw CareTeamMember / Practitioner node.
  The legacy Iteration-2 demo path (`careteam.assigned`, Wave C surface) was left untouched.

E9 proven: an explicit invalid NPI and a ref with no NPI both stay raw + `deferred-I8A`; the
made-up NPI is never used as a node key.

### 2) Claims golden-thread integrity (orphan does not dangle)

- New `src/lib/graph/mapping/claimsIntegrity.ts`: `projectClaimsWithIntegrity(events, deps, {knownClaims})`
  tracks Claim presence (this batch + prior-batch `knownClaims`). A `claim.adjudicated` /
  `claim.explained` whose Claim is absent emits NO `ADJUDICATED_BY` / `EXPLAINED_BY` edge and NO
  orphan node; it is HELD as a dead-letter input. `holdOrphanClaims()` persists via the existing
  NS-01 dead-letter store seam (`kind: 'quarantine'`, `reasonCode: orphan-claim-response |
  orphan-claim-explanation`). PHI-safe: ids/codes/refs only; the absent Claim ref rides in
  `payloadRef` so an operator can chase it. E9: held, never dangled, never silently dropped.

### 3) CARC group captured + CARC/RARC routed through the terminology gate

- New `src/lib/graph/mapping/carcGroup.ts`: X12 group codes CO/PR/OA/PI and
  `deriveMemberLiability()`. PR present -> `member-responsibility`; groups present without PR ->
  `not-member-responsibility`; NO group -> `indeterminate`. The adjudication now stamps
  `carcGroups` + `memberLiability` on the ClaimResponse node and the `ADJUDICATED_BY` edge.
  E9 proven: a missing group yields `indeterminate`, never a defaulted liability.
- New `src/lib/graph/mapping/adjustmentTerminology.ts`: `routeAdjustmentCodes()` runs each
  CARC/RARC code through the stage-4 terminology gate's `selectTerminologyService().validateCode`
  (reused, not reimplemented). X12 is not yet a governed value set, so the gate returns the
  fail-safe `ungoverned` disposition rather than fabricating validity. PHI-safe findings.

## Tests (new: 22 cases across 3 files, all in tests/pipeline/)

- `tests/pipeline/claimsProviderRef.test.ts` (8) — F5-b resolve/raw for claims, medication
  (prescriber + dispenser, incl. NPI extracted from a ref), care-team participants.
- `tests/pipeline/claimsIntegrity.test.ts` (5) — intact chain projects both edges; orphan
  adjudication and orphan explanation HOLD with no dangling edge; prior-batch knownClaims
  honored; dead-letter reuse + PHI-safety.
- `tests/pipeline/carcGroup.test.ts` (9) — liability derivation incl. E9 no-default; group
  captured on node + edge; CARC/RARC routed through the terminology gate (PHI-safe).

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/pipeline tests/graph`: 368 passed / 54 files, green and stable across
  3 consecutive full runs (one earlier one-off was a pre-existing parallel-execution flake in
  the unrelated referral e2e; referral suite passes 3/3 in isolation, not caused by this wave).
- `bash check-file-sizes.sh`: PASS (no new violations; ratchet intact).

## Boundaries respected

Did not add Wave-B domains, did not edit the WpcDomain union, did not touch referral/goal
lifecycle or lenses (Wave C). Reused the provider resolver, the ProviderIdentity namespace, the
dead-letter store, and the stage-4 terminology gate; reimplemented none of them.

## Follow-up seam (noted, out of scope)

The claims adapter (`src/lib/pipeline/adapters/claimsFinancial.ts`) currently flattens CARC/RARC
to code lists and does not yet emit `carcGroups` or `providerRef`/`providerNpi`. The mapping
captures them when the payload carries them (proven at the projector layer). Wiring the adapter
to extract X12 group codes and the billing-provider NPI from the 835/FHIR source is an
ingestion-layer follow-up.
