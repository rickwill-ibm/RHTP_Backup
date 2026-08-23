# Deployment-Hardening Plan (adversarial review of Iterations 1-11)

Status: FOR APPROVAL. Produced by a 7-lens red-team panel (v1.4 framework, tree-of-thought
hypothesis generation) reading the real codebase, plus the open register backlog. Findings
only - no code changed. Detail per lens in `verification/hardening/{crud,audit,reconciliation,reprocessing,ha-scale,testing,whole-person-care}.md`.

## The dominant finding: UNWIRED REALNESS

This is NOT fail-open dishonesty - the substrate fails closed and is honestly labeled. The
deployment blocker is that production-shaped subsystems are BUILT AND TESTED AGAINST FAKES
but have NO PRODUCTION CALLER. The demo stays green because it runs on hand-authored
artifacts (hardcoded `patient-001`/Maria, an 804-line `wholePersonGraphData.ts`) in PARALLEL
to the real code. Examples the panel independently surfaced:
- the outbox has no live consumer wiring it to the graph projector (REC-01);
- `OutboxSweeper.sweep` and the reconciliation jobs are invoked by nothing outside tests (REC-03, HS-02);
- the holistic-context engine returns an empty context for every member except Maria (WPC-01);
- the real projected graph + lenses are wired to ZERO app routes; the UI renders authored data (WPC-02);
- merge/unmerge, right-to-delete, replay, held-identity adjudication all exist in lib with no operational surface (CRUD-03/05, RP-02/05, R1-DL1).

Hardening is therefore mostly WIRING + durability + the compliance/CRUD/care depth a real
payer operation needs - not green-field building. That is good news: the hard logic exists.

## Severity rollup (109 findings across 7 lenses)
- Critical: ~17 · High: ~51 · Med: ~38 (testing uses P0 5 / P1 7 / P2 4).
- Plus the open register backlog: F2-b Part 2 residuals (R1-I7-2/3/4), R1-DL1 held-identity,
  R1-9-3/4/5 (pool/legal-hold-durability/migration-lock), terminology residuals (subsumption,
  live maps, HCC content), R1-8Ai-2 tiebreak, and the standing live-infra/licensing/accreditation ceiling (NS-05).

## The iterative plan (sequenced; each is a full framework wave with its own red-team + E13)

### HW1 / Iteration 12 - Durable state + HA foundation  [unblocks multi-instance deploy]
Move every in-memory store to the substrate (governance, legal-hold [R1-9-4], held-review,
session); WIRE the outbox->projector consumer with offset/checkpoint (REC-01) and SCHEDULE the
outbox sweep + reconciliation jobs (REC-03, HS-02); connection-pool sizing + a single-bootstrap
singleton (HS-04, R1-9-3); timeouts + retries + circuit-breakers on every external seam
(HS-03); readiness = real backend LIVENESS not config-presence (HS-06); member-ordering across
instances (HS-01); migration advisory-lock (R1-9-5).
Closes: HS-01/02/03/04/06, REC-01/03, R1-9-3/4/5. Why first: nothing is safe multi-instance until this holds.

### HW2 / Iteration 13 - Audit + disclosure integrity  [compliance go-live blocker]
Unify the audit spine INTO the durable tamper-evident ledger (AUD-01); real actor identity,
not `'session-user'` (AUD-02); PERSIST + TIME-BOX Part 2 / break-glass audit (R1-I7-2/3,
AUD-05/06); audit every mutating / admin / EMPI-merge / purge / PA action with before-after
(AUD-07/08/09); accounting-of-disclosures + read-audit + RADV/OCR export (AUD-10); retention
enforcement. Closes: the audit lens + F2-b audit residuals. Why second: audit gaps block a payer go-live.

### HW3 / Iteration 14 - CRUD lifecycle + correction/void + re-processing  [day-2 operations]
Add UPDATE/PATCH/DELETE + entered-in-error/void/amendment across records (CRUD-02); a real
consent-directive CRUD store (CRUD-01); care-plan persistence + versioning + status lifecycle
(CRUD-04); operational right-to-delete/purge surface (CRUD-03); EMPI merge/unmerge steward
surface + held-identity adjudication with candidate set + apply (CRUD-05, R1-DL1). Re-processing:
content-hash idempotency so a CORRECTION resend re-projects (RP-01); raw-payload retention for
dead-letter re-drive (RP-02); effective-time / bitemporal projection so a late older record does
not clobber newer state (RP-03); replay-from-log wired + re-derive-after-a-mapping-fix (RP-04/05);
834 full-file vs change-file reconciliation + implicit-term (REC-06). Why third: corrections, voids, and reprocessing are non-optional operationally.

### HW4 / Iteration 15 - Whole-person-care functional depth  [the value proposition]
Wire the holistic context to the REAL graph + 20 domains, de-hardcode Maria (WPC-01/02/04);
a real HEDIS/Stars measure engine (numerator/denominator/eligible population) instead of
asserted gaps (WPC-08); real barrier / keystone analytics + risk stratification over the graph
(WPC-04/07); a LIVING care plan tracked to outcome, tied to goal + referral loop-closure
(WPC-05); SDOH capture -> intervention -> funded/tracked (WPC-06); agent orchestration acting
on RESOLVED member data with real (not no-op) effects (WPC-13); care-gap closed-loop. Why fourth: depends on HW1 substrate + HW3 CRUD being real; this is the product.

### HW5 / Iteration 16 - Test-hardening + defect-weeding  [threads through all; net-new harnesses here]
Wire contract/Inferno/Newman into CI (T-01); real-Postgres testcontainer concurrency tests to
prove NS-04 races on the real engine (T-02); expand E13 mutation to the critical modules -
part2Basis, matchEngine, eligibility834, consent gate (T-03); execute the D4/DP-5 load/soak
harness (T-04); property/fuzz on the Part 2 SUD segmenter + engines + X12/FHIR parsers (T-05);
chaos/failure-injection (backend down, partial batch, poison message, clock skew); negative /
authz / PHI-safety boundary tests. Note: each HW iteration also ADDS its own tests; HW5 is the
net-new test INFRASTRUCTURE + the retroactive property/contract/load coverage.

### HW6 / backlog cleanup (fold into the above or a final pass)
Terminology residuals (SNOMED subsumption / ICD category rollup, reverse+transitive translate,
real HCC family content + V28 set, UCUM grammar parser, Gravity SDOH depth); survivorship
source-order tiebreak already noted (R1-8Ai-2); minimum-necessary field-level Part 2 (R1-I7-4);
consent revocation re-restriction propagation. These are MED/policy-fidelity, not blockers.

## Sequencing rationale (tree-of-thought)
Ordered by DEPENDENCY and DEPLOYMENT-RISK, not severity alone: HW1 first because multi-instance
data-loss/SPOF makes everything else moot; HW2 next because audit is a hard compliance gate;
HW3 before HW4 because whole-person-care depth needs real CRUD + reprocessing underneath it;
HW5 threads throughout but owns the net-new test harnesses. HW1-HW3 are the true
"robust-for-deployment" core; HW4 is value-depth; HW5 is confidence.

## What remains beyond code (unchanged, honest)
Live infrastructure cutover, licensed terminology content, and external accreditation
(Inferno/Touchstone/IHE) - the NS-05 ceiling. HW5 wires the suites so they RUN the moment infra exists.
