# Coalition log — Golden Thread End-to-End flow (`/golden-thread-flow`)

Iteration: Phase-G extended process-flow experience. Date opened: 2026-09-14.
Scope (files/paths): `src/lib/goldenThread/e2eFlow.ts` (data spine, DONE), `src/components/goldenThread/flow/*` (client board — pending), `src/app/(reviewer)/golden-thread-flow/page.tsx` (server page — pending), `src/components/AppLayout.nav.ts` (nav — pending, LIVE tree).

## Pre-flight classification (coalition-protocol §1)
New module + new capability + new files under `src/lib/**` + a consulting-grade deliverable → **coalition REQUIRED, full panel**. Safety invariant touched: the "no autonomous adverse action" Twin-Ladder gate.

## LENS-COVERAGE MAP (Definition of Ready — every touched surface has an owning lens)
| Surface touched | Owning lens |
|---|---|
| FHIR / interop: SMART launch, CRD/DTR/PAS, X12 276/278/275/837 direction | **D1 FHIR/Interoperability** |
| Policy / regulatory: CMS-0057-F timelines, 42 CFR 455.23, 438 Subpart F appeals, §1557, MHPAEA, TPL/payer-of-last-resort, LEIE screening | **D4 Policy/Regulatory & Compliance** |
| Clinical / UM: medical necessity, E/M coding, denial review, who-must-be-decider | **D5 Medical Director** |
| Governance / AI accountability: adverse-action HITL invariant, verdict truthfulness | **R (adversarial-reviewer)** + v1.5 AI-governance lens |
| Engineering: client/`node:crypto` barrel boundary, correctness, security | **R4 / C1** (after coding) |
| Negative space / stub legitimacy | **R2 / R3** (after coding) |
| Claim re-verification | **R5** (after coding) |
| UX / workflow density of the board | **D8** (after coding, on the built UI) |
| Tests | **T1 (unit/property on the spine), T3 (E2E golden-path)** |

## Adversarial review BEFORE coding — Round 1 (design/data-spine)
Staffed: framework adversarial-reviewer (R) + a US-payer PI/revenue-cycle SME (D4/D5 proxy). **Verdict: NO-GO** — ~12 findings. Formal D1/D4/D5 re-attack of the corrected spine is the GO gate.

### Findings + resolutions (all resolved in the corrected `e2eFlow.ts` unless noted)
1. **`verdict()` false reason (HIGH).** Local reason builder always blamed evidence; produced "D2 permits only A1" on TKT-4476 where the HITL *manifest* was the cap. → **Fixed:** reason now distinguishes manifest-capped vs evidence-capped and interpolates the real rung; hardcoded "(capped A2)" removed.
2. **"No autonomous adverse action" not engine-enforced for freeze/suspend (HIGH).** `humanGated` was hand-typed; `integrity-freeze` isn't in the adverse set. → **Fixed (demo):** every `OutboundAction.humanGated` is now DERIVED via `actionRequiresHuman = isSubmissionActionType || isAdverseCoverageAction`; adverse provider actions (455.23 suspension, rule suspension, gold-card revocation, recoupment) are recommendation-text human determinations, not agent buttons. **Backlog (NEW):** harden `decisionGate` so a provider-payment-suspension actionType is engine-adverse, DISTINCT from the tamper-response `integrity-freeze` (which legitimately auto-fires) — not done here to avoid regressing tamper protection.
3. **CPT 99354 deleted 1/1/2023 (HIGH).** → **Fixed:** TKT-4471 uses 99215 + 99417.
4. **CARC-45 misframed as underpayment evidence (HIGH).** CO-45 is the normal write-off. → **Fixed:** TKT-4472 reframed to "allowed below loaded fee schedule; CO-45 *over-adjustment* beyond the contract-permitted amount."
5. **Real provider names on allegations (HIGH).** Cleveland Clinic (Ohio) + real-sounding FQHC on fraud/upcode/disparate-impact. → **Fixed:** all providers fictional + "(illustrative)", WA-geographic; Cleveland-Clinic *scale* kept as a labelled illustration per client ask.
6. **Dual-Medicaid-MCO COB + QHIN arbiter implausible (MED-HIGH).** → **Fixed:** TKT-4476 reframed as commercial-primary/Medicaid-secondary TPL, payer of last resort (42 CFR 433.139), resolved by State TPL — QHIN removed, arbiter role relabelled "State TPL / Independent Review."
7. **Four-fifths stated wrong; MHPAEA/§1557 missing (MED-HIGH).** → **Fixed:** TKT-4473 states the approval-rate ratio 0.756<0.80, cites §1557 (not EEOC), adds MHPAEA NQTL + a risk-adjustment caveat + member reprocessing/appeal rights.
8. **Ticket verdict computed with `actionType:''` → "agent may act" on critical tickets (MED).** → **Fixed:** each ticket's verdict is computed against its most-privileged proposed action.
9. **276/275 EDI direction backwards (MED).** → **Fixed:** records requested via ADR/275 intake; 276 (provider→payer status) removed from the SIU flow.
10. **837-corrected wrong instrument for payer underpayment (MED).** → **Fixed:** TKT-4472 uses a provider dispute/reconsideration (appeal); corrected-claim removed.
11. **$184,500 / 17 office-E/M claims didn't reconcile (MED).** → **Fixed:** exposure set to ~$5.1k direct with an explicit "extrapolate only via statistically-valid sample" note.
12. **Amerigroup rebranded to Wellpoint (LOW).** → **Fixed** in PAYERS + TKT-4473.

### Negative-space additions taken
- **NEW TKT-4477 EXCLUDED-PROVIDER (LEIE/SAM screening)** — the SME's "most conspicuous gap," now the 7th ticket (critical, PI→SIU, mandatory MFCU referral, homonym-verification caveat).
- Member due process / 438 Subpart F appeal rights (TKT-4473), 455.23 + MFCU referral (TKT-4471, 4477), CMS-0057-F decision-timeframe clock (payer-ops stage) woven in.

### Backlog (owning iteration: NEXT / not this build)
- decisionGate hardening (see finding 2). NCCI/unbundling & service-after-death archetypes. Model-governance (FPR/drift/who-validated-the-model). 42 CFR Part 2 handling for the BH cohort. WORM key-custody + retention statement + deterministic-replay data snapshot.

## Adversarial-before-coding — Round 1b (domain panel GO gate, on the corrected spine)
Staffed: **D1 FHIR/Interop · D4 Policy/Regulatory · D5 Medical Director** (independent, parallel). **All three: GO.** No Critical/High survived. Residual Med/Low fold-ins, ALL applied to the spine:
- D1: relabelled 275 record-requests as ADR/277-RFAI · 275-intake (4471/4475/4477); removed non-standard "denial-rate context" (CRD) and "propensity-to-approve" (DTR) as analytic overlays; SMART/CDS-Hooks label split; 99417 + G2212-per-Medicaid note; **remittance/claim evidence tier D3→D2** (an 835 is not settlement-grade).
- D4: added CMS-0057-F **deemed-denial-on-timeout** + specific-denial-reason + extension-with-member-notice to payer-ops; 438 Subpart K parity hook + §1557 via 45 CFR Part 92 (TKT-4473); 60-day report-and-return (TKT-4477); relabelled arbiter role to State TPL / PI Recovery; re-seated the 455.23 decision off "MD" onto SIU/compliance in the forensic log.
- D5: TKT-4473 admin-vs-medical-necessity denial distinction (438.210(b)(3) appropriate-expertise decider — NOT "physician"; corrected W7.5c-0) + BH re-review criteria (ASAM/LOCUS); TKT-4471 benign NPI-attribution differential + single-day arithmetic reconciled; TKT-4474 "automated MDM read is a hypothesis the audit confirms".

## Build
5 files: `flow/{ProcessFlowBoard,OperationsBoard,PartyWorkbench,FlowBoards}.tsx` (client) + `golden-thread-flow/page.tsx` (server). Reuses EditorialShell/StatusBadge/TwinLadder*/AppLayout/AnalystWorkbench. T1 tests in `tests/goldenThread/e2eFlow.test.ts`. Gate: tsc 0 errors; no `@/lib/evidence` barrel in any client file; page renders HTTP 200; three views screenshotted.

## Adversarial review AFTER coding — Round 2 (on the built implementation)
Staffed: framework adversarial-reviewer running R2/R3/R4/R5. **R4 boundary UPHELD** — full client dependency graph traced, no `@/lib/evidence` barrel or `node:*` reachable from any `'use client'` file (HTTP-200 dynamic render is the proof). Findings + resolutions:
- **R3-F1 (HIGH, fix-now): "Reproduce" masquerade** — caption claimed a deterministic replay it didn't perform. → **Fixed:** honest caption ("marks the entry re-verified — illustrative; the seed carries the replay result; no live replay engine wired"); the auditor value (append-only tamper-evident log + Twin-Ladder gate backing "no autonomous adverse action") stated truthfully.
- **R5/R4-F2 (MED-HIGH): "no autonomous adverse action" was curation, not engine, for the suspension class.** → **Fixed properly:** added `suspend/suspension/exclude/exclusion/debar/sanction` to `ADVERSE_COVERAGE_PATTERNS` (deliberately NOT `freeze` — tamper-response `integrity-freeze` must still auto-fire); added an adverse-path **negative test**. Now engine-enforced.
- **R5-F3 (MED): headline test was tautological** (compared the field to the function that set it). → **Fixed:** first test now asserts against a hand-written expectation table; inversion is caught.
- **R4-F4 (MED): stale `prepared` state → phantom "recorded" confirmation across tickets.** → **Fixed:** `key={selected.id}` on TicketDetail.
- **R4/UX-F5 (MED): Provider workbench opened on the Payer lens** (child self-defaulted). → **Fixed:** added `initialParty` prop to AnalystWorkbench; PartyWorkbench drives it and stops double-filtering.
- **R2/R4-F6 (MED): ProcessFlowBoard hardcoded 11 columns while accepting a stages prop.** → **Fixed:** columns derived from the data.
- **R2-F7 (MED): unlabelled forensic `<select>`s.** → **Fixed:** aria-labels. **F11 (LOW):** tabs now role=tab/aria-selected. **F12 (LOW):** Reproduce keyed by stable per-entry id (a ref can repeat). **F9 (LOW):** neutral-seat badge relabelled. **F10 (LOW):** cadence comment tightened.
- **Negative space:** 42 CFR Part 2 note added to TKT-4473 (BH cohort). Still backlog: full Part 2 segmentation, WORM key-custody/retention statement, model-governance (FPR/drift), page-level server error state (F8), NCCI/unbundling & service-after-death archetypes, decisionGate provider-suspension vs tamper-freeze type split.

## Verification (final)
`tsc --noEmit` 0 errors project-wide · 63 tests pass (16 new flow invariants + existing governance/interlock/property suites, confirming the decisionGate change is non-regressing) · no barrel import in any client file · page HTTP 200 · all three views screenshotted after fixes. **DoD met.**
