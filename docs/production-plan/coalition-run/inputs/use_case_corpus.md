# ACE Use Case Corpus (70 cases, SME panel instrument)

STATUS: verification instrument for the coalition. Supersedes `use_case_steps.md` as the breadth instrument; its framing rule binds here identically: every case is a REPRESENTATIVE class instance. Each UC verifies a general capability for the class of members, conditions, barriers, actors and failures it exemplifies. A design element that only works for the named instance is a defect. Nothing here may be hardcoded into any engine, pipeline, mapping, policy, template or agent.

Notation: facets cite gap areas (G1..G7), cross-cutting (X1..X5), backlog (O-1..O-9), contracts (C1..C10), direction packs (DP-1..DP-7), C9 domains by row number with tier (e.g. 13@T1). Trace-matrix findings F1/F2/F3 are covered by UC-52, UC-34, UC-54 among others. Personas deliberately vary; diabetes and Maria-shaped journeys appear only where the class demands nothing more specific.

---

## A. Identity resolution (6)

UC-01 | Cross-source anchor at enrollment | Actor: G3 stage-3 identity step | Trigger: 834 add for a member already present in QE clinical history
Journey: A new enrollee's 834 demographics probabilistically match (score >=90) an existing QE-fed record and auto-link to one anchored identity with an audited match decision.
Facets: G3, X2, DP-7, C9 1@T1; match engine (Tier A) | TCOC: duplicate records drive redundant testing and missed history; anchoring prevents both.
Accept: the same member arriving via any two feeds yields exactly one memberId, with the match score, rule path and decision persisted to the audit ledger.

UC-02 | Possible-match steward resolution then merge | Actor: identity data steward | Trigger: match score lands in the 60-90 band
Journey: A steward reviews a possible match in the work queue, confirms it, and identity.member.merged flows through C10 so every projector rekeys by replay, never by in-place rewrite.
Facets: DP-7, C10, C6, G1 rebuild, ADR-005; C9 1@T1 | TCOC: unresolved duplicates fragment utilization history and inflate risk scores.
Accept: after merge, graph, SDE state and care plans reference only the surviving memberId and a lens query shows the unified journey; the merge event and actor are audited.

UC-03 | Wrong merge unmerged (twins) | Actor: identity data steward | Trigger: complaint reveals two siblings with shared DOB, zip and near-identical names were merged
Journey: identity.member.unmerged (same event class in reverse) splits the record; projectors rebuild both identities from replay; clinical content re-attaches per source attribution.
Facets: DP-7, C10.2 rebuild rule, C9 1@T1, 19@T1 | TCOC: cross-contaminated records cause wrong-member interventions and liability.
Accept: post-unmerge, no resource, signal, plan or graph node from source feeds of member A remains attached to member B, verified by source-attribution audit.

UC-04 | Survivorship field conflict | Actor: G3 stage-3 transform | Trigger: 834 address disagrees with member-reported screening address
Journey: Source-ranked survivorship rules (config data, not code) pick the golden value while both source-attributed facts persist with per-field provenance; a later rule change reprojects the golden view without data loss.
Facets: DP-7, C9 1@T1, seam C3 | TCOC: bad addresses waste outreach spend and break NEMT dispatch.
Accept: changing the survivorship ranking in config alters the golden view on reprojection with zero mutation of stored source facts.

UC-05 | Provider identity resolution | Actor: provider-directory pipeline (O-2) | Trigger: the same practitioner appears in directory, claims and roster feeds with variant names
Journey: NPI-anchored resolution with the same survivorship discipline produces one provider identity feeding the G7 shared provider model, exposing directory ghosts.
Facets: DP-7, O-2, O-6, G7; C9 10@T1 | TCOC: ghost networks hide real adequacy gaps and misdirect referrals into failure.
Accept: one NPI resolves to one provider node regardless of feed count, and adequacy computations consume only resolved identities.

UC-06 | Re-entry identity continuity | Actor: enrollment pipeline | Trigger: a justice-involved member re-enrolls after an incarceration coverage gap under a new Medicaid CIN
Journey: Probabilistic match re-anchors the new CIN to the prior identity so pre-incarceration conditions, medications and BH history are present at day one of re-entry.
Facets: DP-7, G3; C9 1@T1, 2@T1, 14 per consent | TCOC: re-entry is a peak window for ED use and overdose; continuity of record is the cheapest prevention.
Accept: a re-enrollment with changed subscriber id but matching traits links to the prior record above threshold, with the coverage gap represented as coverage.terminated then coverage.enrolled, never as a new person.

## B. Record assembly across C9 domains (6)

UC-07 | Dual-eligible elder assembly | Actor: G3 batch lane | Trigger: Medicare crossover claims, pharmacy dispense and ADT all land for an 82-year-old dual
Journey: Claims shadows (T3), dispensed medications (T1) and encounter events (T1) assemble on one record so polypharmacy across both payers is computable.
Facets: G3, X2, C9 3@T3, 5@T1 dispense, 16@T1 | TCOC: duals are the cost tail; unreconciled cross-payer views hide avoidable admissions.
Accept: person-context returns medications with dispense-level T1 tier labels and claims-inferred entries marked T3, never conflated.

UC-08 | CCD tier honesty | Actor: QE micro-batch path | Trigger: a Hixny-class CCD arrives for a member
Journey: The document lands as DocumentReference (T2) while coded problems, meds and labs extract to partial T1, each section carrying its true tier into every consumer.
Facets: G3 stage 3-4, C4, C9 4/5/6 partial T1, 20@T2 | TCOC: treating documents as computable data produces false gap closures and false assurance.
Accept: no CCD-derived datum surfaces at T1 unless it carried a code; the C1 response labels each section's tier and the D1 sheet-3 score counts T2 as T2.

UC-09 | HMIS flat file for a homeless member | Actor: CBO SFTP flat-file path | Trigger: monthly HMIS extract lists a member entering shelter
Journey: The lowest-common-denominator CSV path lands, stages, validates and codes housing instability as a Gravity Z-code condition on the anchored record.
Facets: G3 flat-file first-class (§4A), C9 13@T1 P3, 1@T1 | TCOC: housing instability predicts ED superutilization; visibility enables upstream spend.
Accept: a malformed row quarantines without failing the batch and a valid row yields an SDOHCC-profiled Condition with source provenance naming the HMIS feed.

UC-10 | ADT within the latency budget | Actor: stream lane | Trigger: HL7v2 ADT admit fires from a regional ED
Journey: The admit normalizes, attaches to the anchored identity and emits encounter.admitted within the 60-second receipt-to-signal budget.
Facets: G3 stream, C2, C6, DP-5; C9 3@T1 | TCOC: discharge follow-up within 48 hours is the single strongest readmission lever.
Accept: p95 ADT receipt to signal.raised <=60s at 10x pilot load, with per-member ordering preserved.

UC-11 | Member-reported data lands with provenance | Actor: member via SMS questionnaire | Trigger: a PHQ-2 style check-in response arrives
Journey: The response lands on the record as assessment T1 tagged patient-reported, distinguishable from clinician-observed data in every consumer.
Facets: G3 PGD stream, C9 18@T1; C4 QuestionnaireResponse | TCOC: cheap longitudinal signal replaces expensive outreach touchpoints.
Accept: provenance=patient-reported survives through projection so graph, SDE and care plan can weight it distinctly.

UC-12 | Claims-shadow honesty in the read API | Actor: care manager via C1 | Trigger: person-context read for a member fed only by claims so far
Journey: The API returns condition and utilization shadows clearly labeled T3, and downstream consumers (care plan honesty flags, SDE policies) modulate behavior on that tier.
Facets: C1, C9.4 MVRs, G5 data-limitation flag | TCOC: acting on lagged claims as if current-state clinical drives wrong interventions.
Accept: no C1 section renders without its tier label and the care plan generated from a T3-only record carries the data-limitation flag.

## C. Consent and 42 CFR Part 2 (5)

UC-13 | Part 2 opt-in absent | Actor: G3 stage-3 labeling | Trigger: SUD treatment data arrives with no Part 2 consent on file
Journey: The data is labeled at transformation time, stored segmented, projected only as restricted graph nodes, and never reaches SDE, agents or unauthorized reads.
Facets: §4A segmentation-at-transform, C10 bh.event restricted labels, C9 14, 15@T1 | TCOC: trust preserved keeps SUD members engaged; disclosure violations carry program-level penalty.
Accept: with opt-in absent, envelope inspection alone (never payload parsing) causes non-cleared projectors to drop the event, and no SDE signal references the SUD content.

UC-14 | Consent revoked mid-journey | Actor: member | Trigger: consent.revoked lands while an outreach touchpoint referencing BH content is queued
Journey: The revocation event propagates; subsequent reads exclude the scoped content and the queued touchpoint is re-evaluated and suppressed with a recorded reason.
Facets: C10 consent events, G2 DP-2 suppression, C1 read scoping | TCOC: consent violations end member relationships and invite audit findings.
Accept: any read after the revocation's recordedAt excludes the revoked scope and the suppressed disposition names the consent policy that fired.

UC-15 | Segmented data legitimately requested | Actor: treating SUD provider | Trigger: purpose=treatment read with a specific Part 2 consent on file
Journey: Read-time evaluation on top of transformation-time labels admits the segmented content for this requestor only, with a PHI-safe audit event.
Facets: C1 consent enforcement, C9 15@T1, ADR-005 | TCOC: appropriate BH data access prevents contraindicated prescribing and duplicate assessment.
Accept: the identical request from a requestor without that consent scope returns the record with the segment omitted, not blanked, and both accesses are audited with correlation ids.

UC-16 | Provider-access opt-out | Actor: provider portal request | Trigger: read against a member who opted out of provider access
Journey: The Tier-A opt-out seam short-circuits to 403 with a PHI-safe body before any projection assembly occurs.
Facets: consent seam (C3 exemplar), C1, authz guard | TCOC: opt-out integrity is the floor of member trust in data sharing.
Accept: isOptedOut=true yields 403 with no PHI in the response and an attributed audit event.

UC-17 | Re-disclosure blocked in reporting | Actor: quality-reporting analyst | Trigger: a QARR-class extract is generated for a population including Part 2 members
Journey: The report pipeline applies segmentation so Part 2-derived content is excluded from re-disclosure absent consent, while counts remain statistically usable.
Facets: F3 reporting path, C9 14, C8 compliance audience | TCOC: one re-disclosure incident outweighs years of reporting efficiency gains.
Accept: a generated extract for a mixed population contains zero Part 2-labeled data elements, proven by an automated label scan in the report test suite.

## D. Graph context and keystone-barrier reasoning (4)

UC-18 | Keystone barrier legibility | Actor: care manager via lens query | Trigger: a member shows three open gaps plus a transportation barrier
Journey: The graph relates the barrier to all three blocked interventions via provenance-carrying causal edges from the screening answer, and the keystone lens surfaces it as the highest-leverage node.
Facets: G1, DP-1 rules 2-3, C9 13@T1, 4@>=T3 | TCOC: one barrier fix closes multiple gaps; keystone targeting maximizes yield per intervention dollar.
Accept: the lens query returns the barrier ranked first with each causal edge citing its asserting source, and removing the barrier assertion demotes it on requery.

UC-19 | Temporal journey reconstruction | Actor: clinician reviewing an ED visit | Trigger: "what happened around this encounter" query
Journey: Dated edges reconstruct the fourteen days around the encounter (missed dispense, stalled referral, screening result) in event order for any member and any event type.
Facets: DP-1 temporality, G1, C10 event catalog breadth | TCOC: understanding the causal run-up converts reactive ED spend into preventable-pattern insight.
Accept: the around-event query returns time-ordered related events across at least four C9 domains with p95 <=2s.

UC-20 | Graph rebuild after merge | Actor: G1 projector | Trigger: identity.member.merged for a member with 200+ graph nodes
Journey: The projector rebuilds the merged member's subgraph from record replay, and the five DP-1 lens queries return correct unified results.
Facets: C10.2 rebuild, DP-7, ADR-001 seam | TCOC: a graph that drifts from the record produces confidently wrong coordination.
Accept: post-rebuild lens results are identical to a from-scratch projection of the merged record, verified by automated diff.

UC-21 | Hypothesis edge governance | Actor: G4 agent | Trigger: an agent infers that missed appointments correlate with shift-work schedule
Journey: The agent writes a causal edge flagged as hypothesis with itself as asserting provenance; a clinician confirms or rejects; only confirmed edges influence keystone ranking by default.
Facets: DP-1 rule 2, G4 HITL, C10 | TCOC: unvalidated inferences steering outreach waste touchpoints and erode clinician trust.
Accept: hypothesis edges are visually and queryably distinct, and the keystone lens excludes them unless the caller opts in.

## E. Signal disposition (5)

UC-22 | Coordinated bundle for a BH-primary member | Actor: G2 SDE | Trigger: nine signals accumulate in one week for a member with major depression as primary condition
Journey: The SDE decides per batch: some approved, some suppressed with reasons, one delayed, all delivered as a single coordinated touchpoint through the member's preferred channel.
Facets: G2, DP-2 acceptance shape, C6 ordering, C9 SDE MVR | TCOC: fragmented contact drives disengagement; engagement is the multiplier on every other lever.
Accept: the batch yields exactly one touchpoint whose disposition record enumerates every input signal with its decision and the policy that fired.

UC-23 | Fatigue suppression | Actor: G2 SDE | Trigger: a fourth outreach signal within a member's contact-frequency window
Journey: The frequency cap (policy data, not code) suppresses the signal with an explainable reason while preserving it for the next coordination window.
Facets: DP-2 policy-as-data, C9 15@T1 | TCOC: over-contacted members opt out; each burned channel raises future engagement cost.
Accept: the suppression record names the cap policy and version, and the signal re-enters candidacy when the window reopens.

UC-24 | Conflicting signals resolved by priority | Actor: G2 SDE | Trigger: discharge follow-up (clinical urgency) collides with scheduled wellness outreach
Journey: Priority scoring acts on the discharge follow-up now and delays the wellness contact into the 72-hour coordination window rather than sending both.
Facets: DP-2, journey-lane timers (X1), C9 3@T1 stream | TCOC: post-discharge contact timing is worth more than any other single touchpoint.
Accept: the urgent signal dispatches within its budget while the delayed one carries a scheduled window and executes exactly once.

UC-25 | Disposition policy tuned without deploy | Actor: state program administrator | Trigger: the state halves the monthly contact cap for a pilot county
Journey: The policy change lands as versioned config data; the next disposition batch applies it; no code ships.
Facets: DP-2 data-not-code, conventions adapter pattern | TCOC: state-tunable policy converts a change request from an engineering cost to a configuration action.
Accept: dispositions before and after the change cite different policy versions in their audit records, with zero deployment events between.

UC-26 | Out-of-order redelivery handled | Actor: stream consumers | Trigger: encounter.discharged redelivers after encounter.admitted arrives late for the same member
Journey: memberId partitioning preserves per-member commit order and eventId dedupe absorbs redelivery, so the SDE never raises a follow-up from a stale state.
Facets: C6, C10.2, C2 sequence | TCOC: ordering bugs generate wrong outreach that costs trust and rework.
Accept: injected duplicate and late events at 10x load produce zero duplicate touchpoints and zero state regressions in a chaos test.

## F. Care planning (5)

UC-27 | Contraindication blocks an intervention | Actor: G5 generator | Trigger: plan generation for a member with a coded allergy (9@T1) intersecting a candidate medication intervention
Journey: The property invariant excludes or substitutes the contraindicated intervention with a guideline citation, deterministically.
Facets: DP-4 invariant 2, C9 9@T1, C4 | TCOC: adverse events are the most expensive preventable claims class.
Accept: golden-fixture regression shows no generated plan ever contains an intervention contradicting an active coded contraindication.

UC-28 | Polypharmacy in a dual-eligible elder | Actor: G5 with pharmacist lens | Trigger: dispense T1 shows 13 active medications across two payers
Journey: The plan surfaces a deprescribing-review goal with interaction flags derived from computable dispense data, routed to clinician review.
Facets: G5, C9 5@T1 dispense, O-7 content, DP-4 | TCOC: polypharmacy drives falls and admissions in the dual population.
Accept: a fixture with a known interaction pair yields a plan containing a medication-review intervention citing its source, flagged not-SME-reviewed until GB-3.

UC-29 | Pregnancy plan with barriers addressed | Actor: G5 | Trigger: pregnancy condition plus positive food-insecurity screening
Journey: The prenatal plan pairs every goal with an intervention and addresses or explicitly defers each present SDOH barrier, per the acceptance oracle.
Facets: DP-4 invariants 1 and 4, C9 13@T1, 4@T1 | TCOC: prenatal SDOH remediation is the highest-ROI window in Medicaid.
Accept: every barrier in context appears in the plan as addressed or as an explicit deferral with reason; no orphan goals exist.

UC-30 | Caregiver-involved pediatric plan | Actor: G5 plus caregiver | Trigger: asthma action plan for a 7-year-old whose grandmother is the RelatedPerson caregiver
Journey: Plan tasks are assignable to the caregiver, and caregiver-facing content is scoped by the consent model rather than assumed.
Facets: C9 19@T1, C4 RelatedPerson/Task, G5 | TCOC: caregiver activation is the delivery mechanism for pediatric adherence.
Accept: generated Tasks carry the caregiver as performer where designated, and removal of the RelatedPerson link reroutes tasks without regenerating the plan.

UC-31 | Data-limitation honesty flag | Actor: G5 | Trigger: plan generation where allergies exist only at T2 (document)
Journey: Contraindication checking is not asserted; the plan carries the data-limitation flag and routes to mandatory clinician review before activation.
Facets: C9.4 honesty note, DP-4, C5 demo-green | TCOC: false safety assurance is costlier than admitted uncertainty.
Accept: any plan generated below 9@T1 renders the limitation flag in the review surface and cannot activate without a recorded human approval.

## G. Referrals and network adequacy (6)

UC-32 | Specialist desert with telehealth fallback | Actor: G7 adequacy engine | Trigger: endocrinology referral for a member in a county failing time/distance thresholds
Journey: Adequacy (configurable thresholds, never constants) fails the in-person standard and proposes telehealth-eligible alternatives ranked by wait time.
Facets: G7, DP-6, O-6, C9 10@T1, 12@T1 | TCOC: unfilled specialist referrals resurface as ED visits and progression cost.
Accept: the referral candidate list marks each option with the adequacy standard it satisfies, and threshold config changes alter results without deploy.

UC-33 | Closed-loop referral failure escalates | Actor: referral coordination agent | Trigger: referral.stalled after 21 days with no accepting-provider action
Journey: The stall event raises an SDE signal; the agent proposes escalation (alternative provider, direct outreach) through the HITL work queue.
Facets: C10 referral events, G2, G4 DP-3 agent 2, O-8 pattern | TCOC: silent referral death is the largest leak in coordination programs.
Accept: no referral remains in initiated state past its SLA without a stall event, a disposition and a queue item, verified by an aging report of zero silent expiries.

UC-34 | Remediation booking boundary (F2) | Actor: outreach agent plus human coordinator | Trigger: NEMT needed for a confirmed appointment
Journey: Where a closed-loop platform (Unite Us-class) can transact, the agent books through it; where none exists, the platform generates a tracked human-coordinator task rather than silently dropping the arrangement.
Facets: F2 scope boundary, G3 referral-platform path, G4 HITL, C9 12@T1, 13@T1 | TCOC: a missed ride wastes the appointment, the auth and the provider slot simultaneously.
Accept: every remediation need terminates in either a platform-confirmed booking or an open human task with SLA; zero needs reach a terminal state of untracked.

UC-35 | Provider-context join in one call | Actor: care manager | Trigger: open gap needing referral
Journey: The C1 provider-context extension returns gap, adequacy-ranked referral candidates and each candidate's PA posture (gold-card status included) NPI-anchored in a single read.
Facets: C1, O-6, G7, DP-7 provider identity, C9 2/10/12@T1 | TCOC: pre-joined referral intelligence collapses days of coordination into one decision.
Accept: the endpoint returns candidates with adequacy standing and PA posture populated, p95 <=300ms.

UC-36 | Language-concordant referral for an LEP member | Actor: G7 filtered by member preference | Trigger: referral for a member whose preferred language is not English
Journey: Candidate ranking honors language concordance from provider-directory data, with interpreter-supported options ranked next when concordance is unavailable.
Facets: G7, C9 1@T1 preference, 10@T1, member-experience lens | TCOC: language-discordant care lowers adherence and raises repeat utilization.
Accept: for a member with a recorded language preference, concordant providers rank above non-concordant peers under equal adequacy standing, verified by fixture.

UC-37 | CBO housing referral closes the loop | Actor: closed-loop platform webhook | Trigger: housing referral for the UC-09 member reaches referral.completed
Journey: The completion webhook lands on the record, resolves the sdoh barrier, closes the graph edge and informs the next disposition batch.
Facets: G3 webhook path, C10 sdoh.barrier.resolved, G1, G2 | TCOC: proven barrier closure is what converts SDOH spend from cost to investment.
Accept: barrier resolution propagates to graph and SDE within the stream budget and the member's keystone ranking recomputes.

## H. Prior authorization and gold carding (4)

UC-38 | Standard PA through the golden thread | Actor: goldenThread orchestrator | Trigger: ServiceRequest requiring authorization
Journey: Necessity evidenced, DTR questionnaire completed, PAS submitted, approval persisted to the record with Provenance so the PA lifecycle is pipeline-real, not screen-real.
Facets: goldenThread (Tier A), C9 17@T1, C4 Da Vinci, ADR-005 | TCOC: clean first-pass PA eliminates rework and delayed-care cost.
Accept: the approved PA exists as record resources with Provenance and appears in person-context without any mock source.

UC-39 | Gold card earned from real feeds | Actor: payer UM analyst | Trigger: O-2 denial-rate feed shows a provider crossing the gold-card threshold
Journey: The roster updates as data; qualifying submissions take the pa.goldcard.applied path with auto-approval and full audit.
Facets: O-2, C10 pa events, goldenThread gold-card path | TCOC: gold carding removes admin cost from the highest-trust segment of utilization.
Accept: a submission from a gold-carded provider approves without manual review, and threshold-crossing in either direction changes the path on the next submission without deploy.

UC-40 | Denial then successful appeal | Actor: appeals coordinator | Trigger: pa.denied on a necessity dispute
Journey: The appeal assembles its evidence packet from the append-only ledger (original documentation, guideline citations, timeline), the overturn posts, and the full history remains reconstructable.
Facets: ADR-005, C10, golden thread, C9 17@T1 | TCOC: appeal cycle time is pure admin cost; evidence reuse collapses it.
Accept: the appeal packet is generated from ledger entries alone (no manual re-collection) and post-overturn state shows denial and reversal as distinct audited events.

UC-41 | Agent-driven stage-3 PA | Actor: PA/documentation agent (DP-3 agent 3) | Trigger: SDE-approved intervention needs authorization
Journey: The agent drives the existing /prior-auth machine end to end from thread context, proposing each gated action into the goldenThread work queue for human approval.
Facets: O-8, G4, DP-3 reuse rule, journey lane X1 | TCOC: PA labor is the largest automatable admin block in UM.
Accept: the agent completes the flow with every mutation human-approved through the existing inbox (no second inbox exists) and the full action chain audited.

## I. Golden thread financial reconciliation (5)

UC-42 | Intent-to-payment chain complete | Actor: golden thread | Trigger: 835 payment posts for a delivered authorized service
Journey: The chain ties care-plan intent to authorization to delivery encounter to claim to payment as linked ledger evidence for any service class.
Facets: C9 16@T1, 17@T1, G3 835 path, ADR-005 | TCOC: a provable thread is what converts care coordination from asserted value to auditable value.
Accept: given a paid claim, a single query reconstructs the complete chain with every link carrying its evidence reference.

UC-43 | Payment contradicts authorization | Actor: payment-integrity analyst | Trigger: 835 denial arrives for a service holding an approved PA
Journey: Reconciliation flags the contradiction as a work item with the full thread attached, instead of the denial dying in a remit file.
Facets: G3 835, golden thread, C10 claim events | TCOC: approved-then-denied leakage is recoverable revenue and provider-abrasion cost.
Accept: every PA-approved service with a non-matching adjudication generates a flagged discrepancy item within one reconciliation cycle.

UC-44 | Appeal outcome re-reconciled | Actor: golden thread ledger | Trigger: overturned claim denial re-adjudicates and pays
Journey: The append-only ledger records denial, appeal and payment as successive events so the financial history is complete and immutable.
Facets: ADR-005 append-only, C10 payment.posted | TCOC: clean audit history removes recoupment-dispute cost.
Accept: no ledger entry is ever mutated; the reconstructed timeline shows all three states in order with actors.

UC-45 | Duplicate claim detection | Actor: payment-integrity analyst | Trigger: the same service lands twice via 837 resubmission
Journey: Idempotency keys at the claims pipeline plus thread reconciliation surface the duplicate before double payment.
Facets: C2 idempotencyKey, G3 stage 2, C9 16@T1 | TCOC: duplicate payment is direct dollar loss plus recovery cost.
Accept: a resubmitted identical claim produces one financial fact and one flagged duplicate, never two payments.

UC-46 | Outcome attribution evidence | Actor: program evaluator | Trigger: a clinical outcome improves (A1c-class beat) after coordinated interventions
Journey: Ledger evidence plus graph temporality assemble the milestone: which interventions, in what order, with what results, attributable and defensible.
Facets: ADR-005, DP-1 temporality, C9 6@T1, 11@T1, F1-adjacent | TCOC: attribution evidence is what sustains program funding and value-based payment.
Accept: the milestone packet links outcome observation to preceding plan interventions through dated evidence, generated without manual assembly.

## J. Agents and HITL (5)

UC-47 | Outreach agent proposes, human disposes | Actor: outreach agent (DP-3 agent 1) | Trigger: SDE-approved touchpoint ready for execution
Journey: The agent drafts the touchpoint into the existing goldenThread work queue; a coordinator approves; the agent executes and records the outcome.
Facets: G4, DP-3 reuse rule, C10 touchpoint.executed | TCOC: agent-drafted outreach multiplies coordinator caseload capacity.
Accept: no member-facing action executes without a recorded human approval, and the queue is the same component the PA flow uses.

UC-48 | HITL escalation ladder | Actor: agent runtime | Trigger: a queued proposal breaches its priority-tier SLA unactioned
Journey: The item escalates up the care-team hierarchy per manifest defaults and, if still unactioned, parks with a full audit trail rather than silently expiring.
Facets: DP-3 escalation defaults, conventions §10 manifests | TCOC: silent expiry converts near-miss coordination into missed care.
Accept: a fixture item aged past SLA shows escalation events at each rung and a parked terminal state; zero items reach deletion without audit.

UC-49 | Autonomy promotion by configuration | Actor: operations owner | Trigger: the outreach agent's low-risk reminder class earns promotion beyond HITL
Journey: The autonomy dial changes in the per-deployment manifest (an operational decision, never a code change); higher-risk classes remain gated.
Facets: DP-3 autonomy dial, AI guardrail 3 | TCOC: graduated autonomy captures labor savings without surrendering governance.
Accept: post-promotion, reminder-class actions execute without queue gating while all other classes still require approval, with the manifest change itself audited.

UC-50 | PHI-safe model calls | Actor: any agent with LLM narration | Trigger: agent composes a narrative over a disposition decision
Journey: The model call carries references and codes only, per the guardrails, asserted by test rather than by policy prose.
Facets: AI guardrail 4, conventions §10, DP-2 explainability | TCOC: a PHI leak in a model call is breach cost plus program credibility.
Accept: an automated assertion over captured model-call payloads finds zero free-text clinical narrative and zero direct identifiers.

UC-51 | Graceful degradation without the LLM | Actor: agent runtime | Trigger: narration backbone unavailable during an outage
Journey: The deterministic engine path continues (dispositions, queue items, evidence), narration fails loud with BackboneNotConfiguredError, and nothing blocks care actions.
Facets: AI guardrail 6, Tier-A/B honesty, X1 | TCOC: resilience keeps the labor-saving core running through vendor outages.
Accept: with the model endpoint down, all deterministic acceptance tests still pass and degraded surfaces state their condition honestly.

## K. Dashboards and measures (4)

UC-52 | Gap derivation as a named projector (F1) | Actor: measure/gap projector (assigned per spine disposition inside G2 scope) | Trigger: observation.recorded satisfies a HEDIS GSD-class numerator
Journey: The projector evaluates measure logic as policy data, emits care-gap.closed, and explicitly does not live inside the SDE (role separation), with certification out of scope and stated.
Facets: F1, C10 care-gap events, DP-2 role separation, C9 6@T1 | TCOC: computable gap status is the substrate of every quality-revenue lever.
Accept: gap events are emitted by a projector distinct from disposition logic, rebuild from replay, and the not-certified boundary is documented on the surface.

UC-53 | Gap closure to dashboard within budget | Actor: quality manager | Trigger: an EED-class gap closes on an incoming result
Journey: The closure flows through metric projections into shared view-models; the dashboard reflects it without per-screen inline math.
Facets: O-3 pattern, G6 lesson, DP-5 1s read budget | TCOC: current gap status directs outreach spend to still-open gaps only.
Accept: dashboard view-model read p95 <=1s and the number shown equals the projector's count exactly (one source of truth).

UC-54 | QARR-class report generated (F3) | Actor: quality-reporting analyst | Trigger: annual program reporting cycle
Journey: The report generates from the same view-models the screens consume (O-5 pattern as template), so screen and submission can never disagree, with Part 2 exclusions applied per UC-17.
Facets: F3, O-5 pattern, C8 compliance audience, C9 16@T1 | TCOC: reporting integrity protects quality withhold dollars and avoids resubmission cost.
Accept: for any shared measure, the report value and the dashboard value derive from one view-model, proven by a consistency test, with the F3 parked-scope boundary labeled.

UC-55 | County drill-down for a rural program officer | Actor: state program officer | Trigger: RHTP county review
Journey: The geospatial view (O-4 choropleth) drills from state to county to gap-and-adequacy detail off shared view-models, honoring focusCounties.
Facets: O-3, O-4, G7, X5 accessibility | TCOC: county-level targeting is how rural transformation dollars get allocated.
Accept: drill-down renders from view-models with no inline aggregation and passes axe-core checks per O-9.

## L. Operational: pipelines, replay, surge (5)

UC-56 | Quarantine and remediation | Actor: pipeline operator (SRE) | Trigger: an 837 batch fails X12 envelope validation for 4% of records
Journey: Rejects quarantine with PHI-safe rejection reporting; the remediation workflow corrects and re-processes; the 30-day TTL alarm fires on anything left.
Facets: §4A stage 2, DP-5 quarantine TTL, D7 runbooks | TCOC: silently vanished records become missed gaps and phantom completeness.
Accept: counts satisfy in = loaded + rejected per batch; every quarantined record reaches resolved or alarmed-expiry, never silent deletion.

UC-57 | Reconciliation gate blocks a bad load | Actor: batch lane | Trigger: a pharmacy load's counts fail the reconciliation gate
Journey: The load blocks, alarms, and replays from the immutable landing zone after the adapter fix, without duplicating already-loaded records.
Facets: §4A stages 1 and 4, C6 replay, idempotent upsert | TCOC: partial loads corrupt adherence signals and the interventions built on them.
Accept: replay of a corrected batch yields exact target counts with zero duplicates, verified by resource-level reconciliation.

UC-58 | DLQ replay after a poison event | Actor: SRE | Trigger: a malformed event crashes a projector consumer repeatedly
Journey: The event lands in the DLQ with mirrored keying; the fixed consumer replays it with the original eventId so idempotent peers are unaffected.
Facets: C6 DLQ contract, C10.2 idempotency, D7 replay runbook | TCOC: consumer outages that require manual data surgery are the expensive kind.
Accept: post-replay, projector state matches a clean-run baseline and no consumer processed the event twice.

UC-59 | Annual enrollment surge | Actor: X1 substrate | Trigger: full-file 834 lands during continuous ADT flow
Journey: Batch-class work proceeds under its 4h budget with the alarmed 1h catch-up exemption while stream-class events keep their latency budgets under backpressure.
Facets: DP-5 budgets, C6 traffic classes, load gates 1K/5K/10K per min | TCOC: surge failures during enrollment are member-facing at the worst moment.
Accept: at the 5K/min burst gate, stream p95 budgets hold and the 834 completes inside budget, demonstrated in the D4 k6 scenario.

UC-60 | Projector store rebuilt from offset zero | Actor: SRE | Trigger: graph store corruption detected
Journey: Full-topic replay rebuilds the projector while the demo stays green (mock toggle as the fallback mode) and the rebuilt store passes lens-query verification.
Facets: C10.2 rebuild, C6 offset-zero replay, C5 dual-mode | TCOC: rebuildability turns a data-store disaster into a routine operation.
Accept: rebuild completes within the documented window and post-rebuild lens results diff clean against record-derived truth.

## M. Privacy and security (4)

UC-61 | Purpose-scoped projection | Actor: operations staff via C1 | Trigger: purpose=operations read on a full record
Journey: Sections the purpose does not justify are omitted (not blanked), enforced server-side before assembly, with a correlation-id audit event.
Facets: C1 consent enforcement, authz guard (Tier A), ADR-005 | TCOC: minimum-necessary discipline is the audit-penalty firewall.
Accept: the operations-purpose response contains no clinical sections and the audit ledger shows the access with purpose recorded.

UC-62 | Full access-trail reconstruction | Actor: compliance auditor | Trigger: a member exercises their accounting-of-disclosures right
Journey: The ledger reconstructs every access to the member's record (who, purpose, when, sections) across BFF, agents and reports, PHI-safe in the log itself.
Facets: ADR-005, GB-7 consumer, C8 compliance docs | TCOC: audit readiness converts regulator interactions from crisis to routine.
Accept: the trail query returns a complete, chronologically ordered access history whose completeness is proven by injecting known accesses in test.

UC-63 | BFF invariant holds | Actor: adversarial client | Trigger: a browser attempts to reach an engine or store directly
Journey: Only /api/* routes answer; no secrets exist in NEXT_PUBLIC scope; route-level tests assert 401/403/400/422/200 with PHI-safe bodies.
Facets: BFF-only invariant, D4 absorbed test plan, X5 | TCOC: perimeter integrity is the precondition of every other privacy claim.
Accept: the D4 route-test suite passes on every BFF route and a repo scan finds zero secret-bearing NEXT_PUBLIC variables.

UC-64 | Part 2 emergency access | Actor: ED clinician | Trigger: medical emergency involving an unconscious member with segmented SUD history
Journey: The medical-emergency provision admits the segmented content for the treating clinician, time-boxed, with mandatory reason capture and a distinct audit class for after-the-fact compliance review.
Facets: C1 read-time evaluation, C9 14/15, ADR-005 | TCOC: emergency-blind records cause contraindicated treatment; ungoverned break-glass causes violations; both are expensive.
Accept: emergency access requires a recorded invoking actor and reason, expires by policy, and appears in a dedicated audit report for review.

## N. Multi-member household and pediatric-adjacent (4)

UC-65 | Household keystone resolved once | Actor: care coordinator | Trigger: three household members each show transportation-blocked gaps
Journey: Household links (P3 1@T1) let the graph relate one vehicle-access barrier across members so a single remediation serves all three journeys.
Facets: C9 1 household, 19@T1, G1, DP-1, F2 boundary | TCOC: household-level remediation triples the yield of one intervention.
Accept: the household lens surfaces the shared barrier across member subgraphs and one resolution event closes the related edge on each.

UC-66 | Caregiver-reported screening | Actor: pediatric caregiver | Trigger: a parent completes an HRSN screening on a child's behalf
Journey: The response lands on the child's record with provenance caregiver-reported and the RelatedPerson identified, distinct from self-report in every consumer.
Facets: G3 screening path, C9 18@T1, 19@T1, C4 | TCOC: caregiver-sourced SDOH data is the only screening path for young children.
Accept: provenance distinguishes reporter from subject and the caregiver link is queryable from the child's person-context.

UC-67 | Adolescent confidential services shielded | Actor: consent engine | Trigger: caregiver proxy views a 16-year-old's record containing minor-consented sensitive services
Journey: Segmentation scopes the proxy view to exclude minor-consented content per policy while the adolescent's own view and the treating clinician's view remain complete.
Facets: C9 15@T1 segmentation, C1 purpose scoping | TCOC: confidentiality failures end adolescent engagement with care entirely.
Accept: the same record read under three requestor contexts (proxy, member, clinician) returns three correctly scoped projections, each audited.

UC-68 | Newborn onto the household record | Actor: enrollment pipeline | Trigger: 834 add for a newborn linked to an enrolled mother
Journey: The newborn anchors as a new identity with related-person.linked to the mother; her pregnancy care plan transitions and a well-child plan initiates without manual re-entry.
Facets: DP-7 (new identity, not a merge), C10 household events, G5 | TCOC: first-year well-child adherence sets the lifetime utilization trajectory.
Accept: the newborn record exists with the household link inside the enrollment cycle and no clinical content from the mother's record attaches to the child.

## O. Rural-specific barriers (2)

UC-69 | Winter distance barrier reshapes the plan | Actor: G2 plus G7 | Trigger: a January appointment 70 miles away for a COPD member during a weather closure window
Journey: The disposition delays outreach into a coordination window, adequacy proposes a telehealth substitution, and NEMT (per UC-34's boundary) is arranged for what must stay in person.
Facets: DP-2 delay, G7 telehealth, DP-6 configurable thresholds, F2 | TCOC: winter no-shows in rural counties waste slots and cascade into exacerbation admissions.
Accept: the rescheduling disposition records the barrier-informed reason and the substituted modality satisfies the applicable adequacy standard.

UC-70 | Broadband-poor engagement path | Actor: G2 channel policy | Trigger: touchpoints repeatedly fail for a member in a no-broadband area flagged with digital-access barriers
Journey: Channel-preference policy (data, not code) falls back from app to SMS to mail to community health worker, per RHTP program design, with each attempt recorded.
Facets: DP-2 policy-as-data, C9 13@T1 digital-access barrier, member experience | TCOC: unreachable members accrue silent gaps until they arrive by ambulance.
Accept: channel fallback follows the configured ladder with each attempt and outcome audited, and no member is marked unreachable while ladder rungs remain untried.

---

## Coverage self-audit

| Facet family | Cases | Count |
|---|---|---|
| A Identity resolution incl merge/unmerge | UC-01..06 | 6 |
| B Record assembly across C9 domains | UC-07..12 | 6 |
| C Consent and Part 2 | UC-13..17 | 5 |
| D Graph context and keystone reasoning | UC-18..21 | 4 |
| E Signal disposition | UC-22..26 | 5 |
| F Care planning | UC-27..31 | 5 |
| G Referrals and network adequacy | UC-32..37 | 6 |
| H Prior auth and gold carding | UC-38..41 | 4 |
| I Golden thread financial | UC-42..46 | 5 |
| J Agents and HITL | UC-47..51 | 5 |
| K Dashboards and measures | UC-52..55 | 4 |
| L Operational | UC-56..60 | 5 |
| M Privacy and security | UC-61..64 | 4 |
| N Household and pediatric-adjacent | UC-65..68 | 4 |
| O Rural-specific | UC-69..70 | 2 (plus rural content in UC-32, UC-55) |
| **Total** | | **70** |

Cross-cutting checks: trace findings F1 (UC-52, UC-53, UC-46), F2 (UC-34, UC-65, UC-69), F3 (UC-54, UC-17) each carry 2+ cases. Personas: BH-primary (UC-13, UC-22), pregnancy (UC-29, UC-68), pediatric caregiver (UC-30, UC-66), dual-eligible elder (UC-07, UC-28), justice-involved re-entry (UC-06), homeless/HMIS (UC-09, UC-37), LEP (UC-36), quality-reporting actor (UC-17, UC-54), payment-integrity actor (UC-43, UC-45), ops/SRE (UC-56..60). No facet fell below 2 cases; rural sits at the 2-case floor within its own family and is reinforced by rural-sited cases in families G and K. Justice-involved re-entry carries one dedicated case (UC-06); if the panel wants a second, a re-entry BH warm-handoff case would slot into family C or G without displacing coverage elsewhere.
