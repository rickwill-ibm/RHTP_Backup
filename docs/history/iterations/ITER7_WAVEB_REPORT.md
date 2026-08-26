# Iteration 7 — Wave B report: claims-financial + pa-lifecycle domains

Two C9 record domains built end to end through the domain-adapter template
(`src/lib/pipeline/adapters/_TEMPLATE.md`, medications as the worked reference).
Both are tier T1, deterministic (clock injected), generic + synthetic (no hardcoded
persona), identity-anchored through the seam, and registered in exactly the two
registries the template names. Disjoint tree from wave A (behavioral-health/Part 2)
and wave C (assessments/caregiver/documents).

## 1. claims-financial domain (`claims-financial`, T1)

Files:
- Adapter: `src/lib/pipeline/adapters/claimsFinancial.ts`
- Mapping: `src/lib/graph/mapping/claimsFinancial.ts`
- Fixture: `tests/pipeline/fixtures/claimsFinancial.json`
- Tests: `tests/pipeline/claimsFinancial.test.ts`, `tests/graph/claimsFinancial.test.ts`

ONE FHIR-JSON feed carries the THREE resource kinds that form the golden-thread
financial chain (mirrors the medications two-node-type / causal-link shape, one step
richer):

| FHIR resource | resourceType | eventType | provenance |
|---|---|---|---|
| Claim | Claim | `claim.submitted` | provider-submitted |
| ClaimResponse | ClaimResponse | `claim.adjudicated` | payer-adjudication |
| ExplanationOfBenefit | ExplanationOfBenefit | `claim.explained` | payer-eob |

### The golden-thread chain projection

```
(Member) --HAS_CLAIM {valid from created}--> (Claim)
(Claim)  --ADJUDICATED_BY {causal: asserter=payer, basis=<outcome>@<claimRef>}--> (ClaimResponse)
(ClaimResponse) --EXPLAINED_BY {valid from created}--> (ExplanationOfBenefit)
```

- `HAS_CLAIM` is the factual submission link (associative, dated).
- `ADJUDICATED_BY` is the one ASSERTED step in the chain (the payer asserts this
  response adjudicates that claim), so per DP-1 it is CAUSAL and carries PHI-safe
  provenance (`asserter` = adjudicating payer, `basis` = outcome @ claim ref).
- `EXPLAINED_BY` is the factual derivation of the member-facing explanation
  (associative, dated).

### CARC/RARC on a denial

`adjustmentCodes()` scans `ClaimResponse.item[].adjudication[].reason.coding[]` and
top-level `error[].code.coding[]`, classifying by code system: a
claim-adjustment-reason system is CARC, a remittance-advice-remark system is RARC.
The captured codes travel PHI-safe as `carcCodes` / `rarcCodes` string lists on the
ClaimResponse node and the ADJUDICATED_BY edge. The denied chain in the fixture
carries CARC 197 (prior-auth absent) + RARC N130; a paid response yields `[]/[]`.

## 2. pa-lifecycle domain (`pa-lifecycle`, T1)

Files:
- Adapter: `src/lib/pipeline/adapters/priorAuthLifecycle.ts`
- Mapping: `src/lib/graph/mapping/priorAuthLifecycle.ts`
- Fixture: `tests/pipeline/fixtures/priorAuthLifecycle.json`
- Tests: `tests/pipeline/priorAuthLifecycle.test.ts`, `tests/graph/priorAuthLifecycle.test.ts`

Captures a PA request's STATUS LIFECYCLE (submitted -> pending -> approved | denied
-> appealed) as an ordered, dated history, NOT a snapshot. One event
`pa-lifecycle.captured` per PA request.

### Lifecycle as dated validity intervals

```
(Member) --HAS_PA_REQUEST {start=submittedAt, end=decisionAt|null}--> (PriorAuthRequest)
(PriorAuthRequest) --HAS_PA_STATUS {status}--> (PaStatusEvent/<pa>/<seq>)   one per phase
(PriorAuthRequest) --PA_FOR_SERVICE--> (ServiceRequest)   when referenced
(PriorAuthRequest) --PA_FOR_CLAIM-->   (Claim)            when referenced
```

Each status phase is its own `PaStatusEvent` node + a `HAS_PA_STATUS` edge whose
validity interval opens at the phase timestamp and closes at the next phase's (open
for the latest phase). So an asOf query can ask "what status was this PA in as of
date X". Where the source names them, the PA links to the driving ServiceRequest
(the referrals domain's node kind) and the resulting Claim (the claims-financial
node kind) — cross-domain golden-thread integration, both as raw references.

### Lifecycle capture vs. authoritative state (the CRITICAL boundary)

This domain LINKS to the existing goldenThread `paMachine` (`src/lib/workflow/paMachine.ts`,
`src/lib/pa/pasService.ts`); it does not duplicate or drive it.

- It REFERENCES the paMachine `PaState` vocabulary via `STATUS_TO_STATE`, typed
  `satisfies Record<string, PaState>` so the compiler rejects any label the machine
  does not define — it can only ever reference the existing vocabulary, never invent
  a state. `referencedState('made-up')` -> `'Unknown'`.
- Every node it emits is stamped `authoritative: false` +
  `stateSource: 'pa-lifecycle-capture'`. The `machineState` property is an OBSERVED
  label, not a decision.
- It never calls `paMachine.transition` and emits only `pa-lifecycle.*` events —
  disjoint from the machine's authoritative `claim-response` signal. Authoritative
  Approved/Denied comes SOLELY from the paMachine (payer ClaimResponse). This domain
  captures; the machine decides. Addresses the I6 red-team loop-closure/status-
  lifecycle concern for this domain (a real dated lifecycle, not a bare snapshot).

## 3. Registration (exactly the two template registries + the union)

- `src/lib/pipeline/index.ts`: `claimsFinancialAdapter`, `priorAuthLifecycleAdapter`
  (+ payload types) exported.
- `src/lib/graph/mapping/index.ts`: `claimsFinancialSpec`, `priorAuthLifecycleSpec`
  imported and appended to `MAPPING_SPECS`.
- `src/lib/pipeline/types.ts`: `WpcDomain` widened with `'claims-financial'` and
  `'pa-lifecycle'`. `SourceFormat` unchanged (both feeds are `fhir-json`); no new
  seam id (both ride the existing pipeline seam).

## 4. Namespace pin (E3)

`tests/pipeline/domainNamespaceIntegrity.waveB.test.ts` (owned by wave B) extended
with pin blocks for both domains: domain id, node kinds, edge types, registry
membership, and that every eventType the adapter emits is claimed by exactly the
domain's spec (F-C1 lesson). Pre-existing referral/immunization pins retained.

## 5. Tests (34 new)

Pipeline (`tests/pipeline`):
- claims normalization -> chain records at T1; malformed subject-less Claim
  quarantines with a PHI-safe reason; a denial carries CARC 197 + RARC N130; C9 tier
  assertions; end-to-end `runPipeline` propagates one chain event per record.
- pa-lifecycle DATED status lifecycle captured (submitted/pending/approved with
  timestamps, not a snapshot); denied-then-appealed with decision date; C9 tier
  assertions; the boundary test — references the PaState vocabulary, marks capture
  non-authoritative, emits only `pa-lifecycle.*`, and `paMachine.transition` is the
  sole authoritative decision path; end-to-end `runPipeline`.

Graph (`tests/graph`):
- claims chain projects Claim -> ClaimResponse -> EOB (HAS_CLAIM / causal
  ADJUDICATED_BY / EXPLAINED_BY); denial node carries CARC/RARC; both backends
  (pg-mem + Neo4j fake) rebuild byte-identical; idempotent replay; whole-person lens
  surfaces the Claim.
- pa-lifecycle status transitions as dated validity intervals (one HAS_PA_STATUS
  edge per phase, intervals chained); PriorAuthRequest + PaStatusEvent nodes are
  `authoritative: false`; PA_FOR_SERVICE / PA_FOR_CLAIM links; both backends
  byte-identical; idempotent; whole-person lens surfaces the PriorAuthRequest.

Namespace-pin: 10 tests (5 per domain).

## 6. C9 coverage matrix rows (this wave)

| Domain id | Tier | Adapter | Mapping | Node types | Edge types | Arrival |
|---|---|---|---|---|---|---|
| claims-financial | T1 | claimsFinancial.ts | claimsFinancial.ts | Claim, ClaimResponse, ExplanationOfBenefit | HAS_CLAIM, ADJUDICATED_BY (causal), EXPLAINED_BY | batch |
| pa-lifecycle | T1 | priorAuthLifecycle.ts | priorAuthLifecycle.ts | PriorAuthRequest, PaStatusEvent | HAS_PA_REQUEST, HAS_PA_STATUS (dated intervals), PA_FOR_SERVICE, PA_FOR_CLAIM | batch |

Both feed the plan's 11/20 -> 17/20 C9 advance (wave-D convergence bumps and notes
the remaining 3 gated on live feeds GB-6). Remaining for I8A: real payer
Claim/ClaimResponse linkage + provider identity resolution (claims), and full
UM-system PA linkage + consent/authoritative-state integration surfacing (pa).

## 7. Verification

- `npx tsc --noEmit` = 0.
- `npx vitest run` fully green: 1132 passed, 1 expected-fail (pre-existing
  intentional), 91 skipped; 158 files passed.
- `bash check-file-sizes.sh` PASS (ratchet intact; largest new file 244 lines src /
  331 lines test, all under the 400/500 caps).
