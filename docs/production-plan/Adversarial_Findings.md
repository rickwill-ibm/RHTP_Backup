# Adversarial Review Verdict (Phase 3, rubric-scored)

Reviewer: adversarial coalition role per plan §7 Phase 3. Inputs: all six spine files, all five specialist outputs, evidence pack, use_case_corpus.md (70 cases), conventions v2, the governing plan. RERUN rule applied mechanically: packViolations >= 1, or rubricFailures >= 2, sends the output back.

Rubric items scored per specialist: (R1) direction-pack compliance per item; (R2) contract compliance C1..C10; (R3) convention compliance (400-line plans, seams, ratchet, BFF-only, AI guardrails); (R4) golden-path participation stated; (R5) DP-5 budgets honored, never silently dropped; (R6) all 15 template sections present; (R7) effort grammar honest; (R8) current-vs-target labeling honest; (R9) §1.2 generality.

---

## 1. Per-specialist verdicts

### Graph (g1-graph.md): PASS. packViolations: 0. rubricFailures: 1.

| Rubric | Result |
|---|---|
| R1 DP-1 (ontology seed fixed; temporality; causal provenance; lenses as acceptance queries; graph never acts) | PASS. §3.1, §3.4, §3.5; provenance mandatory on causal edges with store-level CHECK. |
| R1 DP-7 (rekey by replay, no in-place rewrites) | PASS. §3.6. |
| R2 Contracts | FAIL (1). §3.6 item 2 makes the ADR-006 outbox table a durable per-member replay source with an ASSUMPTION of full-history retention. No contract grants this: ADR-006 defines the outbox as transactional event birth plus relay, silent on retention (g1-graph.md §3.6 vs spine/adrs.md ADR-006). Flagged honestly (SP-2, E5 assumption) but the interface is unratified. Adjudication (c) below. |
| R3 Conventions | PASS. §5 split, largest ~300 lines; 804-line anchor deleted by extraction; BFF-only; no AI in scope. |
| R4 Golden path | PASS. §6, hop 5b, payload-level. |
| R5 Budgets | PASS. §8; none dropped. |
| R6 15 sections | PASS. |
| R7 Effort | PASS. S/M/L plus labeled assumptions. |
| R8 Labels | PASS. TARGET labeling disciplined; direct-read anchor observation disclosed (§2 item 7), correctly. |
| R9 Generality | PASS. Programs collapsed to data (§3.1 ProgramStatus); keystone legibility "emerges from real BLOCKS assertions, never from a hardcoded chain" (§3.4). |

Findings (carry, no rerun): (G1-a) §3.5 defines six lens ids while DP-1 and the evidence fix five demo lens filters; "all" is additive but the acceptance-query set must be stated as five-plus-one, not silently six. (G1-b) §3.4 mapping specs use edge types absent from the §3.1 edge taxonomy (ADDRESSES, AUTHORIZES, DIRECTED_TO, HAS_INTERVENTION, HAS_PA); the taxonomy list must be completed before mapping modules build. (G1-c) §3.7 claims per-member lens queries stay single-partition, yet a household lens (corpus UC-65) requires cross-member traversal; mechanically fine in Postgres, but the claim needs a stated exception. (G1-d) keystone ranking (UC-18) and the hypothesis-edge confirm/reject workflow (UC-21) are unspecified; lenses return subgraphs, not rankings.

### Pipelines (g3-pipelines.md): PASS. packViolations: 0. rubricFailures: 1.

| Rubric | Result |
|---|---|
| R1 §4A + DP-7 | PASS. Five stages instantiated per source; staging tier; lane-equivalence property test (§11); segmentation labeler ships P1 with rules as data (§3.2.J, §3.7); flat files first-class with manifest engine (§3.2.I); propagation by projection only; provider-directory DAG explicitly refuses to write a projection (dual-write ban honored, §3.3). |
| R2 Contracts | FAIL (1). C1 feeding chain has an unowned link: §3.12 says screens read "the person-context projection (C1, fed by this pair's pipelines + the spine's projection layer)". No spine build owner exists in Phase 2. G1 §3.9 assigns the metrics projector build to this pair; this pair's §5 layout and §13 epics contain no metrics projector and no person-context projector. The C9.4 MVR scoring this pair is measured by depends on a component nobody claims. Adjudication and finalizer item below. |
| R3 Conventions | PASS. §5 split (837 pre-split by loop family); baseline mock files bypassed, never edited; BFF ingest routes; no AI, stated. |
| R4 Golden path | PASS. Hops 0..5 payload-level (§6). |
| R5 Budgets | PASS. All six adopted; the one threat ($validate vs the 4h window) is a named spine escalation, not a drop (§8, R2). |
| R6..R8 | PASS. 15 sections; S/M/L honest; CURRENT/TARGET disciplined. |
| R9 Generality | PASS. load-bundle generalized; fixture generators "any member shape, never Maria-specific" (§3.10). |

Findings (carry): (G3-a) 834 diff-load ASSUMPTION: adjudication (b) below; the "order of magnitude" justification is arithmetically wrong (7M events in a 4h window is ~486/s, the same order as the claims window), but the decision is right for a different reason. (G3-b) §3.2.A says an 834 no-match "creates a new anchored identity"; the 60..90 possible-match band on 834s is unaddressed, risking duplicate creation for re-entry members (UC-06); route the band to steward review like every other feed. (G3-c) idempotency key template `<feed>:<batchId>:<recordKey>` is batch-scoped; claim-identity-level dedupe for resubmissions across batches (UC-45) is unstated. (G3-d) no reconciliation rule joins pa.* against claim adjudication outcomes (UC-43); one row of gate logic, currently owned by nobody.

### Agentic (g2g4-agentic.md): PASS. packViolations: 0. rubricFailures: 1.

| Rubric | Result |
|---|---|
| R1 DP-2 | PASS. Signal taxonomy as data; act/suppress/delay/bundle fold; policy packs versioned data behind a seam; every disposition explainable and audited; stream lane with memberId ordering; acceptance shape preserved (§3.1). sourceGated missed-appointment row is exemplary honesty. |
| R1 DP-3 | PASS. Three named agents, HITL, manifests; work-queue reuse with additive QueueName extension, no second inbox (§3.3.1 item 4); escalation defaults as data with park-with-audit; the P1 degraded escalation (one hop then park) is filed as ESCALATION R1, which the template sanctions. Adjudication (a) below. |
| R1 F1 assignment | PASS. Gap-derivation projector as a separate domain, role separation held, not-certified boundary explicit (§3.2). |
| R2 Contracts | PASS. Event types all in C10.1; outbox pattern for disposition writes; C9 MVR consumed as honesty bound. |
| R3 Conventions | PASS. All six AI guardrails wired as tests; prompts as code with injection evals; manifests per §10. |
| R4 Golden path | PASS. Hops 5a, 6, 7 payload-level, matching the spine exactly (§6). |
| R5 Budgets | PASS. |
| R6, R7, R9 | PASS. |
| R8 Labels | FAIL (1). §2 claims "Citations from evidence.md only; never re-derived" then cites file facts not in the evidence pack (workQueue.ts 113 lines, workQueueView.ts 56, paMachine.ts 96 lines, transition semantics). The manifest permitted loading those public surfaces; the provenance claim is false as written. G1 §2 item 7 shows the correct form (direct read, disclosed). Additionally §4 lists the evidence module under "Reused (named Tier-A code)" when the durable store is the O-1 new build; softened by the same sentence naming the swap, so not counted twice. |

Findings (carry): (G4-a) signal-intake topology is described inconsistently: §3.1.2 step 1 has the intake consumer reading the signals topic consuming signal.raised, while §6 has it consuming care-gap.closed off domain-events directly. One component, two descriptions; adjudication (e) fixes the canonical topology. (G4-b) "escalate up the care-team hierarchy" presumes hierarchy semantics no C9 domain carries at any tier (CareTeam gives membership plus roles, not a reporting ladder); the ladder should be role-rank config data over care-team roles, see (a). (G4-c) referral.stalled emitter ambiguity, see (e).

### Careplan (g5-careplan.md): PASS. packViolations: 0. rubricFailures: 1.

| Rubric | Result |
|---|---|
| R1 DP-4 | PASS. All four oracle parts executable (§3.2); fixture sign-off honestly distinguished from GB-3 SME sign-off; clinical/financial separation elevated to a rigor requirement (§3.3); O-7 hard-gated on smeReviewed. |
| R2 Contracts | FAIL (1). §1 target row says plans persist "through the stage-4 loader path with an outbox event" while §3.1 correctly uses the ADR-006 internal-writer outbox in the BFF route's transaction scope. The stage-4 loader is a batch-lane step container the BFF cannot invoke. One of these is wrong; adjudication (f) resolves it in favor of §3.1. |
| R3 Conventions | PASS. Exemplary defect inventory with file:line; ratchet-conformant delegate retirement; rootCauseAnalyzer.ts (401 lines, over cap) named and frozen. |
| R4 Golden path | PASS. Hop 8 payload-level (§6). |
| R5 Budgets | PASS. Internal 500ms evaluate() target correctly labeled ASSUMPTION and design intent, not a spine budget. |
| R6..R8 | PASS. |
| R9 Generality | PASS, and the strongest §1.2 work in the coalition: the ref-margaret- literal and demo-journey keyword strings surfaced as the defect class the plan predicted (§2 item 1). |

Findings (carry): (G5-a) UC-28's "known interaction pair" flag sits against §3.3's explicit boundary (class-level gating only, no pharmacy-grade interaction engine); SP1 must state whether common-pair rules fit inside the class-rule set or UC-28 is a labeled scope boundary. (G5-b) generation is exclusively clinician-initiated; no event-triggered plan initiation exists (UC-68 newborn plan initiation, UC-30 task rerouting on related-person.unlinked); needs a stated trigger posture, even if the answer is "human-initiated only in P2".

### Documentation (x4-documentation.md): PASS. packViolations: 0. rubricFailures: 0.

All 15 sections present; register conforms to C8 with a legal additive column; every embedded annex labels CURRENT vs TARGET line by line; runbook skeletons carry named failure modes and zero fictional commands; generated-content rules enforced by named CI checks (§11); the drift patch is specified as a verified-pattern edit with a recurrence guard; the honesty ledger and operator guide match the evidence pack claim for claim, including the ones that hurt (Part 2 "not yet built and we won't pretend otherwise", care plan "asserted, not verified"). Attack axes (audience-less docs, doc bloat, target-as-current prose, hand-written generatables, missing done-gates) all come up empty. Findings (carry, minor): (X4-a) the ledger and operator guide inherit the RECONSTRUCTED trace steps; the closing-sentence label is present, keep it through every Phase-4 derivative. (X4-b) the capability-brief row is authored-now but deferred to Phase-4 assembly; the finalizer owns closing that row or the register's first lint run fails on it.

No specialist triggers the mechanical rerun rule. Zero pack violations coalition-wide; each of the four engineering outputs carries exactly one rubric failure, below the two-failure threshold.

---

## 2. Spine findings

S1. **C1 implementation is an orphan.** The spine defines the person-context endpoint, the O-6 provider-context endpoint, the CQRS read models behind them, plus a metrics projector, then assigns no Phase-2 builder. G1 builds only the lens route and the view-model registry; G3 builds feeds and events and points at "the spine's projection layer", which does not build anything; G1 §3.9 assigns the metrics projector to the pipeline pair, which never accepted it. Every consumer MVR score, UC-12, UC-35, UC-36, UC-53, UC-55, UC-61, and G3's own definition of done hang on this unowned layer. Largest single structural gap in the coalition output.

S2. **ADR-006's one-transaction claim conflicts with the store seam.** "The stage-4 loader commits the FHIR resource write and the outbox row in one transaction" is not achievable when HAPI is reached only via FHIR REST (G3 §9, doctrine 6), and is categorically unachievable after a managed-FHIR swap. The pattern needs an explicit mechanism (outbox-intent row first, idempotent apply, confirm; or colocated-DB posture stated as a seam caveat). Both internal writers (G5 plans, agentic dispositions, PA persistence) inherit whatever the answer is.

S3. **Outbox retention is undecided but load-bearing.** C6 promises offset-zero topic replay (implying long topic retention) and G1 leans on outbox-as-history (adjudication c). ADR-006 must state retention for both the topic and the outbox table.

S4. **Golden-path sample data bug.** The ADT sample (contracts.md C2, recordedAt 04-01T22:47:21, sequence 117) commits before the observation (golden-path hop 5, recordedAt 04-02T09:14:58, sequence 116) yet carries the higher sequence. Per-member commit-order sequencing is the contract's core promise; fix the samples before anyone codes against them.

S5. **F3 (QARR-class reporting) is parked while carrying compliance exposure.** UC-17 shows the risk is not merely missing scope: any interim reporting or extract path without Part 2 re-disclosure scrubbing is a violation vector. Parking the capability does not park the exposure; the spine should record a binding interim rule (no population extracts until a segmentation-scrubbing report path exists).

S6. **C9 row 19 timing vs the 834's own content.** Household links are P3, but the 834 carries dependent linkage natively; UC-68 (newborn onto the household record inside the enrollment cycle) fails until P3 as declared. Pulling 834-dependent related-person.linked into P1 is nearly free and unblocks the household cases.

S7. Trace-matrix findings F1/F2/F3 are well-formed and corpus-confirmed (UC-52, UC-34, UC-54); the F2 boundary is workable because SDE care-team-task touchpoints give the tracked-human-task fallback UC-34 requires.

---

## 3. Cross-cutting adjudications

**(a) Agentic R1 (care-team hierarchy T3 at P1) vs C9 phasing.** Adjudicated: accept, with two amendments. The apparent conflict mostly dissolves because all three agents are P2 capabilities (trace rows 11, 12 O-8, 14) and care team reaches T1 at P2; the real gap is that no C9 tier ever delivers a hierarchy, only membership plus roles. Resolution: (1) the escalation ladder becomes role-rank configuration data evaluated over care-team membership (consistent with DP-2/DP-3 policy-as-data), so 10@T1 membership suffices; (2) the degraded P1 posture (one audited hop, then park) is ratified as DP-3-conformant; (3) pilot deployments with rosters get care-team attribution at P1 through the O-2 directory/roster loader, which G3 already emits "where attribution present". Spine records this; no C9 change required.

**(b) Pipeline 834 diff-load ASSUMPTION vs the spine event budget.** Adjudicated: diff-load stands, with a corrected rationale. §4A stage 5 requires an event per committed record change; a no-op upsert is not a change, so diff-load is doctrine-conformant, not an exception. The load model's batch-class budget (~470/s) was derived from claims windows and never sized 834 emit-all, so emit-all would be the deviation requiring spine re-derivation, not diff-load. Strike G3's "order of magnitude" sentence (7M events in a 4h window is ~486/s, the same order as claims). G3 R8 (owner programs that mandate full-file event emission for audit) remains a named owner decision; if taken, the spine re-derives the batch-class window budget.

**(c) Graph outbox-retention-as-replay-source vs ADR-006.** Adjudicated: legitimate need, unratified interface. G1's per-member rekey requires an ordered per-member history; full-topic scans per merge are unreasonable. Resolution: amend ADR-006 to declare the outbox table append-only with retention aligned to the audit policy (7-year default), making it the sanctioned per-member ordered event history, and simultaneously answer S2 (atomicity mechanism) so one amendment settles both. Alternative if the spine declines: per-member rebuild re-derives from landing-zone replay via G3's dag-replay, at higher cost. G1's SP-2 and G3's SP-7 merge into one joint spike executing the amendment.

**(d) F1 measure/gap projector ownership.** Adjudicated: owned exactly once. The build lives solely in agentic scope (`src/lib/gapDerivation/`, g2g4 §3.2). G1 consumes care-gap.* events only and says so twice (§3.4 careGaps row "F1 projector in G2 scope"; risk R2); G5 consumes events only (risk 5). No duplicate ownership. Residual items: the owner escalation on G2 scope growth (trace matrix F1) is still open, and two F1-adjacent capabilities are inside nobody's F1 grant: keystone ranking (UC-18) and the attribution/milestone packet generator (UC-46). Name both for the finalizer rather than letting them creep into gapDerivation.

**(e) Event-name and payload mismatches across C10 usage.** Three found, all fixable by declaration: (1) referral.stalled has two candidate emitters: G3 lists it among webhook-path events while disclaiming stall inference; agentic runs stall timers producing "stalled awareness". ADR-006's one-way-events-are-born rule permits one. Resolution: platform-reported stalls emit referral.stalled through the pipeline outbox; internally inferred stalls are SDE signals (signal.raised with a stall signalType), never a record-domain event. (2) signal.raised topology: canonical form is intake consumes domain-events, maps via taxonomy, publishes signal.raised to the signals topic, folds from its projection; g2g4 §3.1.2 step 1 must be rewritten to match its own §6. (3) G1's mapping-table edge types not in its taxonomy (finding G1-b). Every other consumed and emitted event type across all five outputs was checked against C10.1: consistent.

**(f) Careplan persistence dependency vs the pipeline plan.** Adjudicated: G5 §3.1 is correct; G5 §1 is wrong. Care plans persist via the ADR-006 internal-writer outbox in the BFF route's transaction scope, using the outbox library the pipeline pair provides (G3 build step 2); the stage-4 loader is a batch container the route cannot call. Same ruling covers PA-lifecycle persistence (C9 #17, the "small G3 task"), which agentic E5 depends on for pa.* events. Sequencing consequence, binding on the finalizer's dependency order: outbox library (G3 step 2) precedes G5 E3 and agentic E5. Both writers inherit whatever S2 resolution the spine adopts.

---

## 4. Corpus coverage gaps (70 cases)

Standard applied: "cannot support as designed at target architecture", not "not built yet". Cases not listed were verified supportable by the combined designs, including the three named-attention cases where covered.

Named-attention cases first:

- **UC-03 (twin unmerge): PARTIAL.** Projection-side unmerge is fully designed (G1 §3.6 crosswalk rekey; G3 merge events; rebuild contract test). Undesigned: re-attachment of the canonical FHIR record itself. G3 says only "staged records under a merged id re-attach on replay"; nobody designs retraction or re-subjecting of resources already loaded into HAPI under the wrong member. UC-03's accept criterion ("no resource... from source feeds of member A remains attached to member B") is unmeetable on the record as designed. Failing design: G3 plus spine DP-7 record semantics.
- **UC-31 (T2 allergy tier honesty at runtime): COVERED.** G5 contextAdapter never upgrades tiers; the dataLimitations flag is a property invariant (P2 asserts flag emission below 9@T1); activation is always HITL, satisfying "cannot activate without a recorded human approval".
- **UC-52 (measure engine): COVERED.** Distinct projector, replay-rebuildable, not-certified boundary documented (g2g4 §3.2), contingent only on the still-open F1 owner escalation.

| Case | Verdict | Failing design | Reason |
|---|---|---|---|
| UC-03 | PARTIAL | G3 + spine (DP-7) | Canonical-record re-attachment on unmerge undesigned (above) |
| UC-12, UC-61 | GAP (implementation) | Spine (S1) | Person-context read model and endpoint have no build owner; the design exists, the builder does not |
| UC-17 | GAP | Nobody (F3 parked) | Part 2 re-disclosure scrubbing in any extract/report path; compliance-critical even while F3 is parked (S5) |
| UC-19 | PARTIAL | G1 | Store supports it (dated edges) but the query layer has no around-event time-window query type; lens config shape cannot express it |
| UC-28 | PARTIAL | G5 (honest boundary) | Interaction-pair flags exceed the stated class-rule scope; SP1 decides fit or labels the boundary |
| UC-35, UC-36 | GAP | Spine (S1) + G7 split | O-6 provider-context endpoint has no builder; language-concordance ranking logic designed by nobody |
| UC-43 | GAP | G3 / golden thread | No PA-approved-vs-adjudication discrepancy gate exists in any reconciliation design |
| UC-45 | PARTIAL | G3 | Idempotency keys are batch-scoped; claim-identity dedupe across resubmitted batches unstated |
| UC-46 | PARTIAL | Nobody (F1/F3-adjacent) | Attribution/milestone packet generator unowned; ledger and graph primitives exist |
| UC-53, UC-55 | PARTIAL | G1/G3 seam | Metrics projector build claimed by neither (G1 assigns to pipeline; pipeline layout omits it) |
| UC-54 | GAP (labeled) | Nobody (F3 parked) | QARR-class generation parked; the corpus itself requires the boundary label, which X4 carries |
| UC-64 | GAP | Spine (C1) | No break-glass/emergency-access provision anywhere: no time-boxed override, reason capture, or distinct audit class |
| UC-65 | PARTIAL | G1 | No household lens among the defined set; cross-member traversal contradicts the single-partition claim (G1-c) |
| UC-67 | PARTIAL | Spine (C1) + G3 | C1 purpose enum has no member/proxy requestor class; minor-consent segmentation is a label class no rule set names (machinery is generic data, content and requestor model missing) |
| UC-68 | PARTIAL | Spine (C9 row 19) + G5 | Household links declared P3 vs enrollment-cycle need (S6); no event-triggered plan initiation (G5-b) |
| UC-06 | NOTE | G3 | 834 possible-match band ambiguity (G3-b); continuity recoverable via later steward merge, so not a hard gap |
| UC-18, UC-21 | NOTE | G1 | Keystone ranking algorithm and hypothesis confirm/reject workflow unspecified (G1-d) |

All remaining cases (52 of 70): supportable as designed.

---

## 5. Findings the finalizer must carry into deliverables

1. **Assign the C1 implementation layer (S1).** Recommended split: pipeline pair builds the person-context projector and the metrics projector (they are stage-5 consumers); G1 owns the serving surface (person-context route, provider-context route, view-model reads), extending its existing lens and view-model ownership. Add matrix rows and epics; without this the D1 sheet-3 scores are unmeasurable.
2. **Amend ADR-006** in one edit covering: the atomicity mechanism over the FHIR REST seam (S2), outbox retention as the sanctioned per-member ordered history (adjudication c), and topic retention for offset-zero replay (S3). Merge G1 SP-2 and G3 SP-7 into one joint spike executing it.
3. **Fix the spine sample-data sequence bug** (S4) before any consumer code is written against the C2 samples.
4. **Record the (b) ruling in D2/D3:** 834 diff-load is the doctrine-conformant default; emit-all is the deviation requiring spine re-derivation; G3 R8 goes to the owner as a decision item; strike the order-of-magnitude sentence.
5. **Record the (a) ruling:** escalation ladders are role-rank config over care-team membership; degraded P1 posture ratified; pilot roster path named.
6. **Record the (e) rulings** as C10 catalog annotations: single emitter for referral.stalled (pipeline outbox for platform-reported; SDE signal for inferred); canonical signal-intake topology; G1 completes its edge taxonomy before mapping modules build.
7. **Record the (f) ruling:** internal-writer outbox for care-plan and PA persistence; dependency order updated so the outbox library precedes G5 E3 and agentic E5.
8. **Carry the corpus gaps table (§4) into D1** as rows or named scope boundaries: UC-03 record-side unmerge (assign G3 + DP-7 semantics note), UC-43 discrepancy gate (assign G3), UC-64 break-glass (assign spine C1, compliance review), UC-17/UC-54 interim re-disclosure rule (S5, binding), UC-19/UC-65 query additions (assign G1), UC-46 attribution packet (parked-adjacent, named), UC-67 proxy requestor model (spine C1 additive change), UC-68 household-link timing (S6 owner decision).
9. **Close the four one-per-specialist rubric failures as revision notes, not reruns:** G1 outbox interface (resolved by item 2), G3 projection ownership (resolved by item 1), G2G4 §2 citation-provenance sentence corrected to the G1 disclosure form, G5 §1 persistence wording corrected to §3.1.
10. **The F1 owner escalation from the trace matrix is still open** (G2 scope growth vs unparking a G6 slice); the finalizer surfaces it in the deliverable package rather than treating the spine disposition as owner-approved.
11. **X4 obligations at Phase 4:** the capability-brief register row closes at D6 assembly (X4-b); the RECONSTRUCTED label survives into every executive derivative (X4-a); the label audit runs across all D7 documents including the specialist-contributed annex deltas.
12. **Keystone ranking and hypothesis-edge review workflow (G1-d)** need a named owner before the D3 screen's "keystone barrier legible" claim (trace step 7) can be marked covered at P2.
