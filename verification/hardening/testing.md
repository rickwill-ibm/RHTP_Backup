# Testing-Effectiveness Cross-Examination (R5 + testing lens) — DEPLOYMENT robustness

READ-ONLY findings. Adversarial review of the ~1509-green suite: not "are there tests"
but "would these tests WEED OUT a defect before it ships." The suite is honest and
mostly real-logic (only 1 test file uses mock-return assertions, so shallow
tautology is NOT the dominant problem). The dominant problems are (a) the highest-
consequence modules have UNMEASURED catch-power, (b) every concurrency / durability /
conformance / scale guarantee is proven against fakes or pg-mem and its live-executed
count is 0 (register NS-05), and (c) the CI gate that would run the real proofs does
not exist.

## Method (tree-of-thought, branch per test class)

Branched across 8 classes: shallow/tautological, property/fuzz, contract/conformance,
concurrency/idempotency, chaos/failure-injection, load/soak, negative/adversarial PHI
& authz, mutation. Each branch scored on: does a real defect survive the current green?

## Standing facts that frame every finding

- **No CI workflow exists** (`.github/workflows` absent). `check:mutation`,
  `check:testlink`, `test:contract` (newman), and the testcontainer suites are
  scripts nobody runs on a gate. "1509 green" = `vitest run` on a dev box.
- **NS-05: live-integration-executed count = 0.** Every testcontainer suite
  (`tests/integration/*.testcontainers.test.ts`, `pgEvidenceLedger.integration`)
  is `describe.runIf(!HAS_DOCKER)` — it SKIPS when Docker is absent, which is
  always in this environment. The "concurrent" proofs actually executed run on
  pg-mem, a single-threaded in-process JS fake with no MVCC, no lock contention,
  no real PRIMARY-KEY race.
- **Mutation (E13) covers 3 of 311 src/lib modules** (`npi.ts`, `goldenRecord.ts`,
  terminology `membership.ts`). ~1% of the code has measured test catch-power.
- **Property/fuzz covers 5 modules** (match engine, policy engine, network adequacy,
  consent opt-out, golden thread). Every parser/validator/segmenter is example-only.
- **No k6/load harness exists** (grep: referenced only in the roadmap). The D4 / DP-5
  1K/5K/10K load gate was SPEC'd for Iteration 10 Wave B and never executed.

---

## Ranked findings

| id | test class | gap | defects it would catch | effort | priority |
|---|---|---|---|---|---|
| T-01 | contract/conformance | The CMS-0057-F Postman collection (`tools/contract/cms0057f.postman_collection.json`) and `test:contract` (newman) exist but are wired into NO gate (`check:all`/`check:framework` omit them) and no CI runs them. Inferno / Touchstone / CDS-Hooks connectathon are entirely `ci-pending` in the matrix — never executed. | Route/response-shape drift, broken PAS/CRD/DTR request-response conformance, US Core profile violations, any regression the fixture suite cannot see because it tests functions not HTTP surface. The whole certification claim rests on suites that have never run. | M (wire newman into CI now; Inferno/Touchstone need a live server = L) | **P0** |
| T-02 | concurrency/idempotency | Idempotency, outbox, evidence-ledger, graph, and Temporal "concurrency" proofs execute only on pg-mem / fakes; the real-Postgres testcontainer variants SKIP (Docker absent, NS-05). pg-mem serializes JS, so `Promise.all` "concurrent double-delivery" tests (`idempotencyStore.contract.test.ts`) cannot exercise the real check-and-set race they claim to prove. | Lost-update / double-produce under real multi-writer Postgres (double outreach, double signal), PRIMARY-KEY upsert races, connection-pool exhaustion, deadlock on the append-only stores. The exact NS-04 class the store was built to prevent, unproven against the engine that would actually break. | M (stand up Docker-in-CI so the existing testcontainer suites RUN; add adversarial interleavings) | **P0** |
| T-03 | mutation | E13 mutation sampler runs on 3 of 311 modules. The PHI-segmentation, enrollment, identity-match, consent-gate, and outbox-sequencing modules have ZERO measured catch-power. A green test over one of these can be fully tautological and no gate would know. | Tests that assert the happy path but would still pass if the guard inverted: e.g. a `>=` threshold flipped in `matchEngine`, a `part2` boolean flipped in `part2Basis`, an INS-3 branch flipped in `eligibility834`. Silent fail-open regressions. | M (expand `mutation-targets.json` to the ~12 highest-consequence modules) | **P0** |
| T-04 | load/soak | D4 / DP-5 (1K/5K/10K throughput + latency budget via k6) never executed; no k6/artillery file exists. UC-10 "ADT within the latency budget" and UC-59 "annual enrollment surge" are registered `pending`. No p95/p99 assertion anywhere. | Latency-budget blowout on the ADT/HL7v2 lane, projector N+1 / full-scan query shapes at 10^6 members, batch-ingest memory limits, connection-pool exhaustion under enrollment surge — none observable until a real payer feed hits it in production. | L (author k6 spec + run against a staged backbone) | **P0** |
| T-05 | property/fuzz | `part2Basis.classifyProgram` (42 CFR Part 2 SUD segmentation, the most consequence-heavy PHI code in the build) is example-only. The fail-safe invariant "SUD content over ANY missing/ambiguous/unrecognized program provenance → RESTRICTED" is asserted on 6 hand-picked cases. | A regression that re-opens the I7D-1 fail-open (ambiguous provenance → disclosable) on an input shape the 6 examples miss. A property test generating random facility-type / federally-assisted-flag / diagnosis combinations would prove the invariant holds universally, not anecdotally. | S (reuse the `_prng.ts` harness) | **P0** |
| T-06 | property/fuzz | X12 834 parser (`eligibility834.ts`) is fixture-only (add + termination fixtures). No fuzz over INS-3 code space, DTP*349 spans, segment ordering, or malformed segments. F1 (termination re-enrolled) was a REAL shipped defect in exactly this parser. | Unknown/retired INS-3 codes silently mis-classified, DTP boundary errors, segment-order assumptions, malformed-batch handling. The parser's own history proves this class ships. Property test: every INS-3 outside the known set must fail-closed (quarantine), never `active`. | S | **P1** |
| T-07 | chaos/failure-injection | No systematic fault-injection suite. I5C-1 (dead-letter WRITE-failure swallowed → NS-01 drop re-introduced under fault) was caught by CODE REVIEW, not a test. Poison-loop is unbounded (R1-DL3, no max-retry test). No test for backend-down mid-batch, partial-batch rollback, poison message, or store-unavailable. | Fail-open-under-fault (a store/backend that is UP in every test but DOWN in the fault case), silent record loss on partial failure, unbounded poison-record retry loops, batches that half-commit. The failure modes that only appear when a dependency misbehaves. | M (a fault-injecting fake per seam: throw-on-write, throw-on-Nth, latency) | **P1** |
| T-08 | contract/conformance | FHIR `$validate` is structural 4-field presence only (`fhir/validate.test.ts`: resourceType present, id is string, type match). No profile / cardinality / must-support / binding conformance (register F4). The test passes because the validator is shallow — it proves the stub, not conformance. | US Core / USCDI profile violations, missing must-support elements, wrong value-set bindings — every real $validate finding. A green FHIR-validation suite that would accept a non-conformant resource. Needs a real validator (HAPI $validate) behind the seam and a conformance corpus. | L | **P1** |
| T-09 | property/fuzz | Terminology `validateCode` / `expand` / `translate` are example-only. Code-set membership, version binding (FY2025→FY2026, retired-code handling), and UCUM are asserted on fixed codes. | A membership check that admits an out-of-value-set code, a version-binding regression that treats a retired code as active, a translate that fabricates a mapping. Property test: a code not in the bound version's member set must never validate as active. | S | **P1** |
| T-10 | property/fuzz | Survivorship `goldenRecord` field-conflict resolution is example + tiebreak-disagreement tested (good) but not fuzzed over generated multi-source conflict sets. | Non-deterministic golden-record projection under source-order permutation, a survivorship rule that loses a source's provenance, tiebreak instability. Property test: golden view must be order-independent and every field must carry a provenance {source,rank,reason}. | S | **P1** |
| T-11 | shallow/tautological | The certification suite (`certification/matrix.test.ts`, `matrixRollup`, `readiness`) is a self-referential META-test: it proves the honesty-matrix is internally consistent (every `supported` row points to a file on disk, nothing `ready` drifts). It proves LABELING is honest, not that any protocol WORKS. A reader can mistake a green cert suite for "certified." | Nothing new — by design. The risk is interpretive: 4 green certification test files can read as conformance when they are an honesty ledger. Recommend a banner/naming pass so the green is not misread at deployment sign-off; the real conformance gap is T-01/T-08. | S (doc/naming) | **P1** |
| T-12 | negative/adversarial (PHI) | Part 2 break-glass TTL is NOT enforced (R1-I7-2: scope has no expiry) and Part 2 access audit does NOT persist (R1-I7-3: return value only). These are untestable-because-absent, so there is no red test flagging the missing guarantee. Consent revocation propagation to already-projected nodes is also absent (F2-b). | A break-glass grant that never expires (as durable as a consented one), a Part 2 disclosure with no persisted accounting-of-disclosures record, a revoked consent that leaves data surfaced. Negative tests should exist and FAIL until F2-b is built, marking the gap red instead of invisible. | M (build feature; but add the failing negative tests NOW as an executable backlog) | **P1** |
| T-13 | load/soak | The append-only stores (dead-letter, idempotency markers, evidence, outbox, graph) grow unbounded with no TTL/purge (register R2 missing-list, repeated). No soak test measures memory/row growth or the retention window under sustained volume. | Unbounded store growth → OOM / disk exhaustion / query slowdown over days of real feed volume; one idempotency row per (consumer,eventId) forever. Only a soak (hours, sustained produce) surfaces it; unit tests run in milliseconds and never see it. | M | **P2** |
| T-14 | negative/adversarial (authz) | Authz negatives exist (`authz-bypass` 16 assertions, `idor` 2, `principal-authz` 2, consent-scoping) — decent breadth, thin depth. IDOR is 2 assertions; no fuzz over crafted principal claims, scope confusion, role-escalation payloads, or maker-checker bypass (same admin creates+resolves, register R2). | Cross-member/cross-tenant read via a crafted id the 2 IDOR cases miss, privilege escalation through malformed scope/role claims, separation-of-duties bypass on high-impact merges. Boundary + adversarial-input fuzz on the authz predicate. | M | **P2** |
| T-15 | chaos/failure-injection | Clock is injected everywhere (deterministic, good) but there is no test for CLOCK SKEW BETWEEN SERVICES or out-of-order event arrival across a partition boundary (a ClaimResponse before its Claim = R1-I7-5 dangling edge; cross-batch at-least-once). | Dangling golden-thread edges to orphan nodes, ordering-dependent projection bugs, TTL/expiry mis-fires under skew, coverage-validity windows computed against a wrong clock. Only cross-service ordering/skew injection catches these. | M | **P2** |
| T-16 | scenario | `tests/scenario/corpus_coverage.test.ts` registers ~20 use cases as `it.skip` (pending). Several (UC-4 survivorship, UC-5 provider identity, UC-13 Part 2 opt-in) name capabilities BUILT in later iterations (I8A) — the pending markers are now stale, so real scenario coverage is silently below the corpus. | End-to-end scenario regressions in now-built capabilities that the skipped acceptance checks would catch. Audit the pending list, promote the now-buildable ones to runnable; every one still skipped is honest debt but also an unguarded path. | S (audit + promote) | **P2** |

---

## Ranked "highest-value testing to add" (the ask)

1. **Stand up Docker-in-CI and RUN the existing testcontainer suites (T-02) + wire
   newman contract into the gate (T-01).** The proofs are already written; they just
   never execute. This flips NS-05's live-executed count off 0 and converts the
   largest block of "proven against fakes" into real proof for the least new code.
2. **Expand mutation targets from 3 to ~12 modules (T-03).** Cheapest way to convert
   "green" into "green with measured catch-power" on the fail-open-prone modules
   (part2Basis, matchEngine, eligibility834, consent scopeCovers, outbox sequencing).
3. **Property-fuzz the PHI segmenter and the X12/terminology parsers (T-05/T-06/T-09).**
   The `_prng.ts` harness already exists; these are the modules whose defects are
   both high-consequence and historically real (F1) or safety-critical (Part 2).
4. **Author + execute the D4/k6 load + soak spec (T-04/T-13).** The only class of
   defect (latency budget, N+1 at scale, unbounded-store growth) that unit tests
   are structurally incapable of catching.
5. **Add a fault-injection fake per seam (T-07)** so the fail-open-under-fault class
   (I5C-1 was found by luck) becomes a standing gate, not a code-review catch.
