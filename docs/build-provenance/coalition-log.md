# Coalition Log

Append-only record of the architect + SWE + adversarial coalition run for each core-logic change,
per `docs/framework/coalition-protocol.md`. Enforced by `g_coalition` in `scripts/ci-gates.sh`:
a landing that touches a core-logic path with no new entry here FAILS the gate.

Newest first. One entry per qualifying change.

## 2026-09-12 — Wave 13.1: remediation GATE-GREEN — interlock GATE in the recovery sim (#495 follow-up) + illustrative-seeded labeling (HIGH-4/MED-5)

**Scope (core-logic paths):** `src/lib/goldenThread/recoverySimulation.ts` (route every scenario through the REAL `evaluateInterlock` GATE; derive `recoverable`/`category` from the gate + adverse-ness, not the rung ceiling alone; additive `actionType?`/`isSubmission?` on `SimScenario` and `resolved`/`requiresHuman`/`adverse`/`submission`/`submissionRequiresHuman` on `ScenarioResult`; new `indeterminate` category; scenario/batch data extracted to `recoveryCohorts.ts` and re-exported), `src/lib/goldenThread/recoveryCohorts.ts` (new — extracted data + the indeterminate-liability FAIL scenario), `src/lib/goldenThread/recoveryFailScenarios.ts` (new adverse-at-A3/D3 probe; gateway scenario's own action made submission-class), `src/lib/goldenThread/medicalNecessity.ts` (thread `historicalDenialRateSeeded`/`goldCardSeeded` into propensity + VM), `src/lib/goldenThread/threadOrchestrator.ts` (mark seeded feeds), `src/lib/policy/propensity.ts` (illustrative-seeded denial-rate label). Seams: `src/lib/policy/denialRates.ts` + `src/lib/policy/goldCardSource.ts` (additive `seeded?` marker; mock sources set true). UI/consumers: `src/components/goldenThread/SimulationConsole.tsx` (Gate column; `requiresHumanForSubmission` computed from the interlock, not a literal), `src/components/goldenThread/ScenarioGateCell.tsx` (new, presentational — extracted to stay within the size cap), `src/components/goldenThread/MedicalNecessityPanel.tsx` (label a seeded per-provider approval rate as illustrative). All additive; behind `goldenThreadE2E` where route-facing; flag-off/param-absent byte-identical; demoPreservation untouched; PHI-safe (codes/rungs/amounts only).

**Architect + SWE design.**
- **HIGH-1 & HIGH-2 — the simulation must exercise the interlock GATE, not just the rung ceiling.** `simulateScenario` previously computed `category` from `rung` alone and never called `evaluateInterlock`, so an adverse recovery action at strong evidence would be categorized `recoverable-agent-draft`. Now every scenario routes through the REAL `evaluateInterlock({ manifestTier, evidenceTier, action, isSubmission })` and consults `isAdverseCoverageAction`/`isSubmissionActionType`. `recoverable`/`category`/`resolved` derive from the gate: an adverse action is human-gated regardless of rung and is categorized `recoverable-manual` (never agent-draft); evidence-assist (A0) stays manual; otherwise agent-draft (human submits). `actionType`/`isSubmission` are additive optional fields defaulting to a non-adverse, non-submission `draft-recovery` so existing scenarios are byte-identical in outcome.
- **MED-6 — the missing FAIL scenarios.** Four fail-closed cases, each asserting the GATE outcome (not just the rung): (1) payer auto-denial (adverse) at autonomous+D0 → permitted rung A0 AND `resolved=false`; (2) adverse recoupment at A3/D3 that STILL blocks (rung A3, NOT evidence-capped, yet human-gated — the most persuasive fail-closed demo); (3) submission-gateway fail-closed even at D3/autonomous; (4) indeterminate member-liability (no recognized X12 group) exercising `reconcile`'s `indeterminate` fail-closed verdict → new `indeterminate` category, no recovery. Reused/extended `recoveryFailScenarios.ts`; all four are in the `SCENARIOS` dropdown and the `gov-failclosed` cohort.
- **HIGH-3 — SimulationConsole honesty.** The console claimed scenarios "run through the real reconciliation + Twin-Ladder interlock" (now TRUE — `simulateScenario` calls `evaluateInterlock`) and passed `requiresHumanForSubmission={true}` as a literal (now computed from a real interlock evaluation of a submission-class action via `result.submissionRequiresHuman`). Added a "Gate" column (`resolved` / **BLOCKED** with reason) so a viewer can SEE the gate hold an adverse/submission action. The gate badge was extracted into `ScenarioGateCell.tsx` so `SimulationConsole.tsx` stays within the 400-line cap (extraction, not a baselined breach).
- **HIGH-4 & MED-5 — label seeded statistics as illustrative.** When a SEEDED loader is active (the mock `denialRates`/`goldCardSource` feeds now carry a `seeded` marker), the propensity denial-rate factor reads "Illustrative seeded denial rate N% (not a book of business)" and the gold-card panel labels the per-provider figure "illustrative seeded N% approval — not a book of business" with a design-basis note (Texas HB 3459: PA exemption after a ≥90% approval rate over 6 months). A real feed (no `seeded` marker / param absent) renders byte-identically.

**Adversarial review (before & after).**
- *Fabrication risk:* gate outcomes must not be hand-asserted. FIX: `simulateScenario` reads `permittedRung`/`cappedByEvidence`/`requiresHuman`/`resolved` back from `evaluateInterlock`; tests assert the interlock's own verdicts. The `submissionRequiresHuman` value is derived from a real submission-class interlock evaluation, not a literal.
- *Rung-only bypass (the reported finding):* a regression test asserts NO scenario carrying an adverse action is ever categorized `recoverable-agent-draft`, even at maximum autonomy. The adverse-at-A3/D3 test proves the block is rung-independent.
- *Byte-identical regression:* tests assert a scenario with no `actionType` keeps its prior categorization (strong→agent-draft, weak→manual), ordinary scenarios carry no `fail`, and the propensity denial-rate label is unchanged without the seeded flag. `check:types` + full `vitest` green; demoPreservation golden untouched (it fingerprints the graph/SMART/roster panels, not these surfaces).
- *Client-bundle safety:* `interlock.ts` transitively imports only pure modules (decisionGate, tierConfig) — no `node:crypto` — so pulling it into the client `SimulationConsole` bundle is safe; deep imports of `tierConfig` retained.
- *Size ratchet:* data extracted from `recoverySimulation.ts` (399→~355) into `recoveryCohorts.ts`; gate badge extracted into `ScenarioGateCell.tsx`; `SimulationConsole.tsx` kept < 400. No new size-baseline breach.

**Reuse-first:** the submission/adverse predicates stay single-sourced in `decisionGate.ts` and are delegated to (never re-implemented); the extracted `recoveryCohorts.ts` is re-exported from `recoverySimulation.ts` so importers are unchanged. No duplication introduced.

## 2026-09-12 — Wave 13: financial-clearance completion (GATE-GREEN) — cited denial baselines (#501) + fail-closed recovery scenarios (#495)

**Scope (core-logic paths):** `src/lib/policy/denialBaselines.ts` (new), `src/lib/goldenThread/recoverySimulation.ts` (additive `fail?` probe on scenario + result, `failClosedCount`, three FAIL scenarios spread into `SCENARIOS`, a `gov-failclosed` batch), `src/lib/goldenThread/recoveryFailScenarios.ts` (new). UI/consumers: `src/components/goldenThread/ShiftLeftPanel.tsx` (new, presentational), `src/app/(reviewer)/golden-thread/page.tsx` (renders `<ShiftLeftPanel/>`, behind `goldenThreadE2E`). All additive; behind `goldenThreadE2E` where route-facing; flag-off byte-identical (page returns "not enabled"); demoPreservation untouched; PHI-safe (population statistics + codes/rungs only, no member id values).

**Architect + SWE design.**
- **#501 — ground the shift-left messaging in CITED, DEFENSIBLE baselines.** The shift-left surface carried no grounded denial baseline (motivational framing was ungrounded — an over-claim by omission). Added a single source of truth (`denialBaselines.ts`) holding the verified figures, each with a short SOURCE TAG: ACA in-network denial ~19% and only ~5% medical-necessity (KFF 2024); MA PA ~7.7% denied, ~11.5% appealed, ~80.7% overturned (KFF 2024); provider PA cost ~$10.97 manual vs ~$5.79 electronic (CAQH 2023); administrative-complexity waste ~$265.6B/yr (JAMA 2019, Shrank et al. — explicitly NOT the "$20B admin waste" over-claim); CMS-0057-F process/metrics 1/1/2026 + FHIR PA API 1/1/2027, scoped to MA/Medicaid/CHIP/QHP (not commercial), Da Vinci CRD/DTR/PAS IGs recommended not mandated. `ShiftLeftPanel.tsx` renders them with source tags under an explicit DECISION-SUPPORT (not-a-guarantee) framing.
- **#495 — add PAYER + PROVIDER FAIL / fail-closed scenarios to the recovery simulation.** Each carries a `FailProbe` evaluated through the REAL `evaluateInterlock` (no hand-asserted numbers): (1) PAYER — an auto-denial on thin evidence (D0) tier-capped to A0 and human-gated → cannot act autonomously; (2) PROVIDER — a recovery on absent evidence (D0) capped to assist (A0) → cannot escalate past flag/draft; (3) GATEWAY — a payer-facing submission (`x12-837-corrected`) fail-closed at the human gate even at D3/autonomous (rung A3, NOT evidence-capped, yet blocked). Added to the named `SCENARIOS` dropdown with clear "FAIL (…)" labels and to a `gov-failclosed` batch; `CohortResult.failClosedCount` aggregates blocked probes.

**Adversarial review (before & after).**
- *Fabrication risk (before):* fail outcomes must not be hand-asserted. FIX: `evaluateFailProbe` routes every probe through the real `evaluateInterlock`; the outcome (`cappedRung`, `cappedByEvidence`, `requiresHuman`, `blocked`, `reason`) is read back from it. Tests assert the interlock's own verdicts.
- *Silent-drift risk (before):* the cited figures could rot. FIX: `denialBaselines.test.ts` pins every value + source tag, asserts the ACA "mostly not medical-necessity" context, the CMS scope/date facts, and NEGATIVELY asserts the disallowed "$20B" over-claim is absent.
- *Regression risk (after):* the `fail?` fields are optional and set only when a probe is present; a test asserts the ordinary scenarios (`strong-underpaid`, `weak-underpaid`, `pa-denied`, `matched`) carry NO fail outcome — behavior byte-identical. Determinism asserted (repeat evaluation equal).
- *PHI (after):* baselines are population statistics; `ShiftLeftPanel` renders no member data; the interlock `reason` strings are PHI-safe (code-level drivers only).

**New tests.** `tests/policy/denialBaselines.test.ts` (6 cases — value/source pins, ACA context, no-$20B, CMS milestones, framing, frozen); `tests/app/ShiftLeftPanel.test.tsx` (3 cases — figures+tags, CMS dates, decision-support framing); `tests/goldenThread/recoverySimulation.test.ts` (7 cases — dropdown membership, the three fail-closed outcomes, unchanged ordinary scenarios, cohort `failClosedCount`, determinism).

**Size ratchet.** `recoverySimulation.ts` re-formatted to 399 lines (< 400 cap) by tightening comments and the import/return shape — no baseline entry added. `SimulationConsole.tsx` left UNTOUCHED (its prettier-canonical form is already near the cap; a UI callout was intentionally NOT added to avoid a ratchet breach — the FAIL scenarios are visible via their dropdown labels, and the fail-closed outcome is fully computed + asserted in the simulation logic and tests).

**NOTED backlog (NOT built — reason).** Separation-of-duties (drafter≠approver second signature) and per-record action throttle remain deferred: both require wiring durable, per-record identity/counter state into the recovery decision + action routes. A pure, unwired helper would trip the E14 wired-path gate ("unwired realness"), and full route wiring with durable state is not a small/gate-safe additive change. Left in the backlog for a dedicated route-hardening increment. The remaining NOTED items (three-terminal-detector duplication, `ProcessTierScope` unused fields, reject-permanently-locks-action-type) are likewise untouched this increment.

**Reuse-first.** No new governance logic: `recoveryFailScenarios.ts` REUSES the existing `evaluateInterlock` / `permittedRung` (the same functions the runtime and the interlock UI use) rather than re-deriving caps; `denialBaselines.ts` is the single source of truth the panel + test both read. No duplication introduced.

## 2026-09-12 — Wave 12: walkthrough remediation — PHI-safe submission ref + workbench Approve closes

**Scope.** Two defects a live walkthrough surfaced (core governance is fine; these are PHI/wiring
edges). Additive, behind `goldenThreadE2E`, flag-off byte-identical, demoPreservation untouched.

**FIX-1 (HIGH, PHI-in-DOM).** The recovery-decision success receipt rendered
`Receipt reference: appeal-mock::ev-<memberId>-…-claim::<remittanceId>` — the MOCK submission ref
embedded the member-embedding claim/evidence id and crossed to the client (also returned as
`submissionRef` from the decision route and `ref` from the Wave-9 governed-action route, and stored
on the ledger `submission` entry). Root cause: `submitAppealMock` built the ref as
`appeal-mock::${claimId}::${remittanceId}`, and in the seeded demo the claim id IS `ev-<memberId>-…-claim`.
Fix — PHI-safe AT THE SOURCE: new `mockReceiptRef(prefix, {claimId, remittanceId})`
(`src/lib/dataSources/submissionGateway.ts`) mints `${prefix}::${remittanceId}::c-<sha256(claimId)[0..12]>`
— the payer remittance id (PHI-safe) stays plain as the correlation anchor, the (possibly
member-embedding) claim id is reduced to a short non-reversible hash and NEVER placed raw.
Both mock paths route through it: `submitAppealMock` (submission-class → decision route + governed
`appeal`) and `executeMock`'s internal-action branch in `src/lib/goldenThread/governedAction.ts`
(provider-notice / ticket-update). Deterministic (replay → same ref), so exactly-once id-idempotent
appends are unchanged. Fixing at the source means the ledger `submission.submissionRef` field and the
party projection are PHI-safe too — not just the DOM.
Tests: negative-PHI on the decision route (`recoveryDecisionRoute.test.ts` — the member-embedding
`taskClaimId` seed now yields a ref with no `MARIA_SD_001`), on `runGovernedAction` (new describe in
`governedAction.test.ts` for both submission + internal paths), and the exact-format determinism
assertions in `submissionGateway.test.ts` + `governedAction.test.ts`.

**FIX-2 (MED, demo wiring).** `/analyst-workbench` Approve → 404 "Recovery record not found". Root
cause: the governed Approve targets `${recordId}-recovery` in the store, but the workbench offered
Approve for ANY analysis `action` — including when the RUN (`GET /api/evidence/:id?party=&analysis=`)
was served the dev-mock SEED SKELETON (a synthesized, NOT-persisted record with no recovery entry,
returned whenever the record is absent from the store, e.g. a dev restart / cold client). The RUN
then looked successful over a phantom while the Approve resolved the empty store and 404'd (store and
analysis diverged). In the standard dev-mock flow the page DOES persist the thread (verified: RUN over
the persisted record + Approve both return 200), so the defect surfaces only when the analysis ran
over the skeleton. Golden-thread never hits this because it renders its decision panel ONLY from the
actual persisted recovery outcome of the run it just executed.
Fix (mirror golden-thread, client-side so the legitimate Wave-8 analysis-over-skeleton READ / API
Explorer feature is untouched): the workbench now OFFERS the governed Approve only when the RUN is
backed by a PERSISTED recovery draft — signalled by `routedEscalation.queueItem` being non-null (the
routed queue item exists only when the record carries a recovery draft). With no persisted recovery it
renders an honest "no persisted recovery draft — nothing to submit" state (`NoRecoveryToActOn`) instead
of an Approve that would 404 — exactly as golden-thread shows "no recovery was proposed". So RUN and
Approve always bind to the SAME persisted record; in the dev-mock posture the page persists the thread
(with a recovery draft) → the queue item is present → Approve executes the governed MOCK action → no
404. The evidence route is UNCHANGED (analysis-over-skeleton reads still 200); the action route's
honest not-found/flag-off/auth handling is untouched. The stale amber note on the page (which pre-dated
Wave-11 A5 and claimed the endpoint returns a seed skeleton) was corrected.
Files: `src/components/goldenThread/AnalystWorkbench.tsx` (read the `routedEscalation.queueItem` signal
into `hasRecovery`) + `AnalystWorkbenchResult.tsx` (gate `ActionBlock` on it; add `NoRecoveryToActOn`).
Tests: `tests/goldenThread/analystWorkbenchWiring.test.ts` — persists via the REAL orchestrator, proves
the RUN returns the persisted sealed record with a routed queue item (not the skeleton) and the Approve
resolves + executes (200, mock, not-transmitted, no 404), plus a guard that over a non-persisted record
the routed queue item is null (client withholds Approve) while a direct Approve is an honest 404;
`tests/app/AnalystWorkbench.test.tsx` — Approve is offered with a queue item and WITHHELD without one.

**Reuse-first.** No new state/store/engine. `mockReceiptRef` is the single ref-minting helper reused by
both mock paths; the submission-class predicate, interlock, gateway seam, evidence recorders and the
verify-before-reseal guard are all reused unchanged. All changes additive + behind `goldenThreadE2E`;
flag-off byte-identical; demoPreservation untouched; PHI-safe.

**Adversarial (R1/R2/R4/R5).** R4 (PHI/IDOR): confirmed the ref no longer carries a member substring in
the decision-route body, the governed-action body, or the persisted `submission` entry; remittanceId is
a payer-assigned reference already treated PHI-safe across the codebase. R5 (claims): re-verified live —
reproduced the leak (`appeal-mock::ev-MARIA_SD_001-…`) and the 404 (cold governed RUN served a phantom
skeleton) against the running dev server BEFORE, and the tests prove both closed AFTER. R2 (negative
space): the fail-closed production `submissionGateway.load()` (throws before any transmission) is
untouched; determinism preserved so exactly-once appends still no-op on replay.

## 2026-09-12 — Wave 9: Governed analyst ACTIONS (X12 / communication) + a durable ticket lifecycle

**Scope.** A Wave-8 finding PROPOSES an action; the analyst TRIGGERS it (an X12/communication
request or a ticket update) and it runs through the SAME governance the recovery DECISION uses —
interlock-gated, qualified-human-approved at HITL, verify-before-reseal, append-only + sealed,
exactly-once. Core-logic paths: `src/lib/goldenThread/governedAction.ts` (net-new runner) +
`src/lib/goldenThread/ledgerAnalyticsTemplates.ts` (denial-rca made genuinely executable). Wired via
a NEW `POST /api/recovery/[id]/action` route MIRRORING the decision route. Composition-only — no
interlock / gateway / routing / recorder / tier math is reimplemented.

**What ALREADY existed (reused verbatim, NOT reimplemented).**
- `evaluateInterlock` / `permittedRung` (interlock.ts) — the action's permitted rung + human
  requirement (evidenceTier single-sourced from `taskEvidenceTier ?? computeProcessTier`). REUSED.
- `isQualifiedHumanDecision` (decisionGate.ts) + the submission-class rule (mirrors FIX-1) — a
  payer-facing X12/appeal is human-gated regardless of rung; no auto-execute at any tier. REUSED.
- `submissionGateway` seam (dataSources) — the fail-closed MOCK X12/appeal transport (channel:'mock',
  transmitted:false; production `load()` throws BEFORE any send). REUSED (same discipline as the appeal).
- `routeEscalation` (escalationRouter.ts, Wave-7) — the durable ticket routing / queue hop. REUSED.
- The recovery DECISION route pattern (route.ts) — auth → reviewer role → qualified-human gate →
  id-validate (no IDOR) → verify-before-reseal → tenancy → exactly-once terminal short-circuit →
  run → re-read-latest + re-apply + re-seal + save. MIRRORED (a NEW route; the 399-line decision
  route was NOT grown).
- `recordSubmission` / `recordRecoveryTerminal` id-idempotent recorder pattern — the new
  `recordGovernedAction` is the SAME pattern (no-op on the deterministic `${actionId}::${status}` id).

**What was MISSING (the net-new logic).** A finding could be surfaced but not TRIGGERED: there was
no governed executor for an X12/communication action, no durable ticket lifecycle, and `denial-rca`
returned pass-through fields rather than a genuine execution over the projection. Net-new: a
`governed-action` evidence variant + `recordGovernedAction` recorder, the `governedAction.ts` runner
(~352 lines), the action route (~324 lines), and the executable `denial-rca` aggregates.

**Adversarial BEFORE coding — 5 findings, all folded in:**
- R1 (correctness / FIX-1): no auto-execute of a payer-facing X12 at any tier without a qualified
  human. FIX: `isSubmissionAction` marks X12/appeal submission-class; `evaluateInterlock` forces the
  human path; a `system`/`autonomy:*` decider is blocked at the route (403) AND the runner surfaces
  it as `proposed` (never executed). Tests: system/autonomy → proposed/403; two negative runner tests.
- R2 (PHI): a `governed-action` entry carries member-embedding refs — could leak via `projectForParty`.
  FIX: the audit projection's `governed-action` case DELIBERATELY omits `ref`/`claimId` (only
  actionType/status/rung/decidedBy/channel), so it stays PHI-safe under party projection; the runner's
  ticket reuses the masked queue item; a runner test asserts no member substring in the ticket.
- R3 (exactly-once / concurrency): a retried/concurrent trigger must not double-execute. FIX:
  id-idempotent `recordGovernedAction` (`${actionId}::${status}`) + a terminal short-circuit
  (`governedActionTerminal`) + a re-read-latest guard before save (mirrors the decision route). Tests:
  two concurrent approves → ONE executed entry; terminal short-circuit returns idempotent 200.
- R4 (determinism / IO): the runner stays pure aside from the injected mock gateway + fresh inbox;
  `now`/`gateway`/`inbox` injected; the ROUTE owns store IO + signer + gateway-seam resolution. Test:
  two runs deep-equal.
- R5 (honest execution + durability): denial-rca must genuinely COMPUTE (not a literal), and the ticket
  lifecycle must be honestly durable. FIX: denial-rca reduces the ACTUAL adjustment lines +
  determination into aggregates (appealable/contractual split, dominant group, CARC/deficiency counts),
  still reproducible under the perturbed-clock gate; the durable lifecycle is append-only
  `governed-action` entries on the EXISTING pg-backed evidence spine — NOT a new queue backend (the
  honest durability answer; remaining gaps in FAKE_FIDELITY row 8).

**Adversarial AFTER coding — SHIP.** tsc clean; every touched file ≤ cap (evidenceRecord.ts trimmed
to 400); 18 runner tests + 17 wired-path route tests + 1 executable-denial-rca test pass (+ Wave-6/7/8
regressions). The `governed-action` entry is tier-mapped D3 like `submission` (a D3 MIN can never LIFT
the weakest-link authority tier). Flag-off / param-absent byte-identical (404 route test). Access never
widened (reuses the decision route's auth/tenancy gates). Transmit-side caveat documented (two
concurrent X12 approves invoke the gateway twice — ledger exactly-once does NOT cover transmission; a
real EDI seam needs a pre-transmit CAS — FAKE_FIDELITY row 8).

**FAKE_FIDELITY.** Extended row 7 (denial-rca now genuinely executes, still curated — not live codegen)
and added row 8 (mock X12 transmission via the fail-closed seam; ledger-backed ticket lifecycle vs a
durable queue with restart-surviving escalation-hop history; the transmit-side CAS gap).

**Changes (all additive, behind `goldenThreadE2E`):**
1. `src/lib/evidence/evidenceRecord.ts` — the `governed-action` EvidenceEntry variant + `GovernedActionType`.
2. `src/lib/evidence/financialRecorders.ts` — `recordGovernedAction` (id-idempotent lifecycle recorder).
3. `src/lib/evidence/tier.ts` — `governed-action` → D3 (action record, never lifts the min); `index.ts` exports.
4. `src/lib/evidence/auditProjection.ts` — PHI-safe `governed-action` audit-line case (omits member-embedding refs).
5. NEW `src/lib/goldenThread/governedAction.ts` — the governed-action runner (decide → mock-exec → lifecycle → ticket).
6. `src/lib/goldenThread/ledgerAnalyticsTemplates.ts` — `denial-rca` made genuinely executable over the projection.
7. NEW `src/app/api/recovery/[id]/action/route.ts` — the wired governed-action route (mirrors the decision route).
8. NEW `tests/goldenThread/governedAction.test.ts` (18) + `governedActionRoute.test.ts` (17) + `ledgerAnalytics.test.ts` (+1).
9. `src/lib/agentRuntime/FAKE_FIDELITY.md` — row 7 extended + row 8 (mock X12; durability gap; transmit CAS).

## 2026-09-12 — Wave 8: Ledger Intelligence — curated, gated analysis/RCA over the party-scoped projection

**Scope.** A CURATED, deterministic analysis/RCA registry run OVER `projectForParty` behind TWO
real gates (plan-validate + result-evaluate), producing a PHI-safe finding, an interlock-gated
action, and a Wave-7-routed ticket. Core-logic path: `src/lib/goldenThread/ledgerAnalytics.ts`
(+ `ledgerAnalyticsTemplates.ts` split for the size cap) + the additive `?analysis=` route wiring.
Composition-only — no reconcile/interlock/integrity/routing/tier math is reimplemented.

**What ALREADY existed (reused verbatim, NOT reimplemented).**
- `reconcile` (reconciliation.ts) — the `recovery-verification` agreement re-check. REUSED.
- `verifyLedgerIntegrity` (ledgerIntegrity.ts) — the `integrity-check` attestation. REUSED.
- `evaluateInterlock` (interlock.ts) — the proposed action's autonomy rung (evidenceTier
  single-sourced from `taskEvidenceTier ?? computeProcessTier`) — NEVER hardcoded. REUSED.
- `deriveMemberLiability` (carcGroup.ts) — the `denial-rca` liability disposition. REUSED.
- `projectForParty` + `MASKED_RECORD_REF` (partyView.ts) — the party-scoped PHI-safe view. REUSED.
- `routeEscalation` (escalationRouter.ts, Wave-7) — a gate failure / anomaly / tamper OPENS a
  ticket through the EXISTING queue/inbox/escalation engine (no new queue backend). REUSED.

**What was MISSING (the net-new module).** Nothing ran governed analyses over the projection: the
Wave-6/7 read surfaced the projection + escalation signals but performed no analysis, applied no
plan/result gate, and produced no finding/action. The module is exactly that — a small typed
registry + a governed runner composing the above (~309 + ~220 lines).

**Adversarial BEFORE coding — 5 findings, all folded in:**
- R1 (DRY): don't reimplement reconcile/interlock/integrity/tier/routing. FIX: every computation
  delegates; the module is composition. The templates split is size-cap only, not new logic.
- R2 (NO-GO, PHI): a curated body could leak a memberId/name/clinical note. FIX: bodies read ONLY
  PHI-safe structured facts (a deficiency's free-text `detail` is dropped — only its `kind` code is
  used); every finding/ticket is stamped `MASKED_RECORD_REF`; a negative test asserts no member
  substring AND no clinical-note substring anywhere in the run, plus a route-path PHI assertion.
- R3 (gate realness): the two gates must be REAL, not decoration. FIX: plan-validate = party-scope
  + a PHI/non-projected reads denylist; result-evaluate = re-run under a perturbed injected clock,
  require byte-identical output. Both reject paths open a routed ticket. Tests hit BOTH paths
  (out-of-scope + PHI-unsafe → plan-rejected; non-reproducible forecast → eval-rejected).
- R4 (determinism / GET side-effect): `now` + `inbox` injected; the route injects a FRESH
  per-request inbox; two runs with identical inputs are deep-equal (test).
- R5 (authority not hardcoded): the action rung MUST come from the interlock. FIX: rung =
  `evaluateInterlock(...).permittedRung`; tests assert a D0 record caps the HOTL grant to A0 and a
  D3 record lets it stand at A2 — interlock-derived, never a constant.

**Adversarial AFTER coding — SHIP.** tsc clean; both files < 400-line cap; 15 module tests + 5
wired-path route tests pass (+ Wave-6/7 regressions). Composes-not-derives verified (reconcile
re-check disagreement→ticket; verifyLedgerIntegrity tamper→critical both-party ticket; masked queue
item). PHI-safe (no member/clinical substring). Deterministic. Additive + reuse of the route's
auth/tenancy/consent gates; param-absent / flag-off byte-identical (two negative route tests).

**FAKE_FIDELITY.** Added row 7 to `src/lib/agentRuntime/FAKE_FIDELITY.md`: the curated deterministic
analyses are NOT executed generated code — real Planner→CodeGen→sandboxed CodeEval execution is the
named production item; the result-evaluate gate rejecting the non-reproducible `denial-forecast`
template stands in for the pipeline refusing an unreproducible codegen result.

**Changes (all additive):**
1. NEW `src/lib/goldenThread/ledgerAnalytics.ts` — `ANALYSES` registry + `runAnalysis` runner + gates.
2. NEW `src/lib/goldenThread/ledgerAnalyticsTemplates.ts` — the curated deterministic analysis bodies.
3. NEW `tests/goldenThread/ledgerAnalytics.test.ts` (15) + additive `tests/api/routes-evidence-workqueue.test.ts` cases (5).
4. `src/app/api/evidence/[id]/route.ts` — additive `?analysis=<id>` wiring inside the post-auth `withParty` closure.
5. `src/lib/agentRuntime/FAKE_FIDELITY.md` — row 7 (curated analyses vs real codegen execution).

## 2026-09-12 — Wave 7: Escalation router — bridge Wave-6 signals through the existing queue/escalation engine

**Scope.** A thin BRIDGE that routes the Wave-6 escalation signals through the EXISTING
queue / inbox / escalation-as-data machinery — reuse-first, no duplication. Core-logic path:
`src/lib/goldenThread/escalationRouter.ts` (+ the additive route wiring). One NEW glue module +
one additive route augmentation — nothing existing changed shape.

**What ALREADY existed (reused verbatim, NOT reimplemented).**
- `recoveryReviewItem` (workQueueView.ts) already derives the durable `agent-proposal` WorkItem
  from a persisted recovery draft (via `buildProposalWorkItem` + the CMS SLA math). REUSED.
- `deriveEscalationSignals` (Wave-6) already derives the gate + PHI-safe party signals. REUSED.
- `isSlaBreached` (workQueue.ts) already decides breach; `getEscalationTier` + `nextEscalationStep`
  (escalation.ts, over `data/escalation-policies.json`) already own the escalation hop/park math —
  applied by the runtime ENGINE to its EPHEMERAL per-request proposals only. REUSED.
- `ProposalInbox` / `createMemoryProposalInbox` (inbox.ts) already is the HITL work-queue port. REUSED.
- `MASKED_RECORD_REF` + the masking discipline (partyView.ts). REUSED.

**What was MISSING (the net-new bridge).** Nothing tied those pieces together for a shared record:
the durable recovery WorkItem was derived on read but NEVER run through the escalation policy
(the engine's SLA/hop math governed only the ephemeral in-request proposal — the durable item's
comment in workQueueView.ts explicitly deferred a durable sweep); the signals were a Wave-6 read
derivation with no queue placement, no inbox enqueue, and no per-party notification lens. The
bridge is exactly that glue — ~210 lines, composing the above, inventing no SLA/escalation math.

**Adversarial BEFORE coding — 5 findings, all folded in:**
- R1 (DRY): the route already calls `deriveEscalationSignals` for its `escalation` field; the bridge
  calling it again double-derives. FIX: `routeEscalation(record, ctx, pre?)` accepts the caller's
  pre-derived `EscalationResult`; the route computes it once and threads it in (test asserts the
  `signals` reference is reused, not recomputed).
- R2 (NO-GO, PHI): the recovery id is `ev-<memberId>-…-recovery` and `WorkItem.memberId` is the real
  member — exposing the raw WorkItem to a party leaks the member. FIX: `maskQueueItem` drops
  `memberId` + `evidenceId` and reports `MASKED_RECORD_REF` (Wave-6 discipline); negative-PHI tests
  assert no member substring in the routed result OR the route body.
- R3 (GET side-effect): enqueuing on a read. FIX: the route injects a FRESH per-request
  `createMemoryProposalInbox()` (the demo substrate) — idempotent-by-id, mutates no shared/durable
  state. A durable queue backend stays a production item (FAKE_FIDELITY.md row 1 gap).
- R4 (determinism/hop honesty): the durable read has no in-memory hop history, so a naive "next hop"
  always reads as hop-0. FIX: `hopsSoFar` is injectable (default 0 = the FIRST unattended hop);
  `escalationStep` is present ONLY when `isSlaBreached`; `now` is injected. Documented that an
  accumulating durable SWEEP (the Wave-3/4 `overdueRecoveryItems` follow-up) would pass its count.
- R5 (access): the field must never widen access. FIX: it lives inside the EXISTING post-auth
  `withParty` closure, gated on `goldenThreadE2E` + `?party=`; two negative route tests assert
  param-absent / flag-off is byte-identical (no `routedEscalation`).

**Adversarial AFTER coding — SHIP.** tsc clean; escalationRouter 210 lines (< 400 cap); 21 tests
pass (9 router unit + the route wired-path + Wave-6 regressions). Composes-not-derives verified
(pre-result reuse, terminal drops from the queue via `isRecoveryTerminal`, SLA-breach hop = policy
`assigned-reviewer`/72h, exhausted hierarchy → park). PHI-safe (masked queue item; no member
substring). Deterministic (now + inbox injected). Additive + reuse of the route's auth/tenancy gates.

**Changes (all additive):**
1. NEW `src/lib/goldenThread/escalationRouter.ts` — `routeEscalation(record, ctx, pre?)` (+ test
   `tests/goldenThread/escalationRouter.test.ts`).
2. `src/app/api/evidence/[id]/route.ts` — additive `routedEscalation` field in the `?party=` branch
   behind `goldenThreadE2E` (+ wired-path + 2 negative tests in
   `tests/api/routes-evidence-workqueue.test.ts`).

**Residuals (honest).** The bridge is a READ-path derivation + a demo-substrate enqueue: the
in-memory `ProposalInbox` is per-request, so nothing durably persists the routed/escalated item and
no scheduler re-evaluates hops over time — a DURABLE QUEUE BACKEND + escalation SWEEP (accumulating
`hopsSoFar` over persisted `filingDeadline`s via `overdueRecoveryItems`) remains a production item
(FAKE_FIDELITY.md rows 1 + 4). There is still no notification DELIVERY channel (the notifications
are what each party SHOULD see, not a sent message). The recovery submission stays a mock,
not-transmitted receipt (FAKE_FIDELITY.md row 6). In dev-mock mode the seeded record carries no
recovery draft, so the routed block is present-but-empty (queueItem/escalationStep null) — the
bridge is exercised end-to-end by the router unit tests over crafted draft records.

## 2026-09-12 — Wave 6: Dual-party evidence visibility + notification/escalation gates

**Scope.** The real seams behind a shared, dual-audited Evidence Ledger UI. Additive, behind
`goldenThreadE2E` where wired; flag-off / param-absent byte-identical. Core-logic path:
`src/lib/goldenThread/escalationSignals.ts` (+ the evidence-layer projection + the route wiring).
Two NEW pure modules + one additive route augmentation — nothing existing changed shape.

**Reuse (optimal).** Neither new module re-derives governance, tier, projection, or deadline math.
`projectForParty` reuses `toAuditEvents` (the existing PHI-safe projection) over a masked record and
`computeProcessTier` for the header tier. `deriveEscalationSignals` reuses `evaluateInterlock`
(the one twin-ladder definition of the permitted rung), `computeProcessTier`, `daysToDeadline` +
`RECOVERY_URGENT_WINDOW_DAYS`, and `isRecoveryTerminal`. The only net-new vocabulary is a frozen
A0..A3 → assist/hitl/hotl/autonomous gate map (a label mapping, not governance math).

**Adversarial BEFORE coding — 5 NO-GO findings, all folded in:**
- F1 (NO-GO, PHI): `toAuditEvents` emits `resourceRef: Evidence/${record.id}#${e.id}` and the record
  id + entry ids embed the member (`ev-<memberId>-…`). Verbatim reuse would leak the member into
  every event. FIX: mask the record id + memberId + re-key entries to positional handles
  (`entry-<n>`) BEFORE projection; a negative-PHI test asserts the mask is LOAD-BEARING (the raw
  record WOULD leak).
- F2 (NO-GO, PHI): `LedgerSeal` carries member-embedding `recordId`/`memberId` identity fields.
  FIX: the header exposes the seal's `alg` + `keyId` ONLY (identity dropped); test asserts it.
- F3 (NO-GO, PHI): a member-embedding `correlationId` (e.g. `corr::<recoveryId>`) would leak via the
  projected events. FIX: the route passes the request correlation id (client/random, not member);
  the pure function defaults to a neutral `'party-view'`.
- F4 (NO-GO, layering): reusing the route's `terminalOutcome` (in `src/app/**`) from `src/lib`
  inverts the dependency. FIX: read the `recovery-decision` marker via `latestOfType` + reuse the
  lib-level `isRecoveryTerminal`; no app→lib import.
- F5 (NO-GO, honesty): a hardcoded gate would fake the twin-ladder. FIX: the gate is
  `evaluateInterlock(...).permittedRung` mapped through the label table — a D0 tier caps it to
  `assist` (tested), proving the derivation is live.

**Adversarial AFTER coding — SHIP.** tsc clean; sizes under cap (partyView 105, escalationSignals
186, route 356). Both parties get byte-identical `events` (shared-ledger parity test); no member
substring in either projection or the signals; gate derived (D0→assist, D3+HITL→hitl); terminal
labeled mock/not-transmitted; deterministic (now injected). Route augmentation is additive: absent
`?party` OR flag-off → base body unchanged (two negative route tests). The `?party` param is read
only AFTER every auth/consent/authz/tenancy gate — it never widens access.

**Changes (all additive):**
1. NEW `src/lib/evidence/partyView.ts` — `projectForParty(record, party, opts?)` (+ test
   `tests/evidence/partyView.test.ts`, incl. negative-PHI + masking-load-bearing).
2. NEW `src/lib/goldenThread/escalationSignals.ts` — `deriveEscalationSignals(record, ctx)` (+ test
   `tests/goldenThread/escalationSignals.test.ts`).
3. `src/app/api/evidence/[id]/route.ts` — additive `?party=payer|provider` augmentation behind
   `goldenThreadE2E` (+ 3 wired-path tests in `tests/api/routes-evidence-workqueue.test.ts`).

**Residuals (honest).** The projection is a READ view + the signals are a DERIVATION of what each
party should see — there is NO notification DELIVERY channel and no durable escalation sweep (that
remains the Wave-3/4 `overdueRecoveryItems` follow-up). The recovery submission stays a mock,
not-transmitted receipt (FAKE_FIDELITY.md row 6). In dev-mock mode the base evidence response still
carries `patientName` (pre-existing mock behavior); the party projection field itself is PHI-safe.

**Gate:** `bash scripts/ci-gates.sh push` → ALL PASS. Nothing pushed to any remote — delivered as a
patch for the owner's own apply.

## 2026-09-12 — Wave 5: Visible golden-thread UI (order→cash, interlock, HITL) + Wave-4 finalization

**Scope.** Two landings, one coalition run. (A) **Wave-4 finalization** — the reconstruct-and-signal recovery
DECISION loop (a qualified-human APPROVE/REJECT on the durable recovery draft re-executes the deterministic
workflow on a fresh engine to its suspension, signals the decision, and runs the post-approval MOCK submission
exactly-once) was code-complete but uncommitted and had no coalition-log entry; this records it and splits the
decision route (444→383 lines) under the size cap. (B) **Wave-5** — the FIRST visible surface for the entire
order→cash capability Waves 1–4 built into the backend but never rendered. New route `/golden-thread` (behind
`goldenThreadE2E`) runs the REAL `runOrderToCash` on the seed member and renders the full eight-stage thread,
the reconciliation verdict, the Twin-Ladder interlock, the sealed Evidence Record, and a LIVE HITL decision
control wired to the real `POST /api/recovery/[id]/decision`.

**Reuse (optimal).** The page COMPUTES nothing — it calls `runOrderToCash` with the exact CashDeps wiring the
`/api/financial-clearance` E2E branch uses, and reuses `EvidenceTimeline`, `StatusBadge`, the mock loaders,
`createRuntime`/`createRecoveryWorkflow`, and the real decision endpoint. `TwinLadderInterlock` IMPORTS the real
governance model (`permittedRung`, `AUTONOMY_RUNG`, `TIER_RUNG_CEILING`) rather than reimplementing it. Only two
small presentational leaves are net-new (`ThreadRail`, `TwinLadderInterlock`) plus the client `RecoveryDecisionPanel`.

**Adversarial BEFORE coding — 4 NO-GO findings, all folded in:**
- F1 (NO-GO): a self-contained page with no cookie read would be STATICALLY PRERENDERED → `flag()` frozen to
  "not enabled" at build + the orchestrator's persist discarded before runtime → decision POST 404s. FIX:
  `export const dynamic = 'force-dynamic'`.
- F2 (NO-GO): the HITL loop only closes offline if three things are pinned — persist to the shared
  `getEvidenceStore()` singleton (not a throwaway per-render store; else the decision route 404s), `idempotency:false`
  (else the 2nd render dedupes to an empty thread), and the dev-mock auth posture (`ALLOW_DEV_MOCK_AUTH=true`,
  WSO2 unconfigured → dev pa-reviewer session). All pinned; a 401 outside dev-mock is honest, not the deliverable.
- F3 (NO-GO, PHI): the recovery id embeds the member id (`ev-<memberId>-…-recovery`) and must reach the client to
  address the endpoint (prop + fetch URL + logs). Demo member is synthetic (`MARIA_SD_001`). Mitigation: kept out
  of every rendered node/attribute/aria + a negative-PHI test; the URL/log exposure is an ACCEPTED prototype
  residual with a NAMED production follow-up (opaque server-issued recovery handles) added to the production-fix plan.
- F4 (NO-GO): `EvidenceTimeline` renders `aria-label="Evidence record ${record.id} …"` → member leak on verbatim
  reuse. FIX: the page passes a masked clone `{ ...record, id: 'evidence-record' }`; a negative-PHI test asserts no
  member substring in the DOM AND that the masking is load-bearing (an unmasked record WOULD leak).
- F5–F8 (MED/LOW): interlock consumes the real model (done); timely-filing time-bomb (~2026-12-28) → dated
  screenshot; `idempotency:false` also kills the golden-drift/singleton vector; GET-with-write is an idempotent
  overwrite (deterministic id). Refresh re-runs from seed and resets the panel — documented prototype residual.

**Adversarial AFTER coding — SHIP.** tsc clean; the reconstruct-and-signal route behavior is unchanged by the
extraction (24 route tests green); the interlock renders the imported permitted rung and the two honest invariants
(submission human-gated; seal ≠ tier); the decision panel POSTs the real endpoint, labels the mock submission
not-transmitted, surfaces real errors, and never renders the member-embedding id (negative-PHI test green).

**Changes (all additive except the route split):**
1. NEW `src/app/(reviewer)/golden-thread/page.tsx` — force-dynamic, flag-gated, self-contained real orchestrator run.
2. NEW `src/components/goldenThread/{ThreadRail,TwinLadderInterlock,RecoveryDecisionPanel}.tsx` (+ 4 tests).
3. Wave-4 core-logic (this entry covers them): `src/lib/goldenThread/recoveryDispatch.ts`,
   `src/lib/goldenThread/workQueueView.ts`, `src/app/api/recovery/[id]/decision/route.ts`,
   `src/lib/dataSources/submissionGateway.ts` (NEW seam), `src/lib/evidence/{financialRecorders,evidenceRecord,tier,auditProjection}.ts`,
   `src/lib/agents/revenueCycle/*`, manifests + FAKE_FIDELITY row 6 + seam plumbing (dataMode/seamDispositions/deploy/idempotency).
4. NEW `src/app/api/recovery/[id]/decisionSupport.ts` — `terminalOutcome` + `runReconstructAndSignal` extracted from the
   route to hold it under the 400-line cap (383) (+ test `tests/goldenThread/recoveryDecisionSupport.test.ts`).

**Gate:** `bash scripts/ci-gates.sh push` → ALL PASS (format, types, sizes+ratchet, lint, testlink E13,
page-boundaries, skill-mirror, unit tests, wired-path E14, provenance E11, coalition). Flag-off byte-identical
(the page short-circuits to "not enabled" when `goldenThreadE2E` is off; no unconditional nav entry). Nothing
committed by the agent — delivered as a patch for the owner's own apply.

## 2026-09-12 — Wave 3: Genuine agent engagement (Revenue-Cycle agent through the runtime)

**Scope.** Make the golden-thread order→cash recovery a GENUINELY GOVERNED AGENT ACTION. Before: the twin-ladder
interlock was computed but no agent acted on it (recoveryAgentTier a hardcoded 'HITL' literal; recovery an inert
draft entry; nothing dispatched, no HITL work item). Additive, behind `goldenThreadE2E`. Core-logic paths:
`src/lib/goldenThread/**`, `src/lib/agents/revenueCycle/**`.

**Coalition roster.** Architect + SWE plan; adversarial-BEFORE (R1–R5) → NO-GO; 2 work-trees (agent module;
wiring) with interface freeze; adversarial-AFTER → NO-GO; fix pass; RE-ATTACK → GO; a final residual fix.

**Adversarial BEFORE — NO-GO; frame corrected before coding.** The first design (dispatch-and-suspend on a
per-request engine, orderToCash writing the draft directly) was theater with more steps — the agent's governed
EFFECT never runs and the engine dies before any human decision. FIX (reviewer option b): the AGENT writes the
draft through its OWN `ctx.useTool('evidence.append')` under `assertToolAllowed` + the interlock; orderToCash
stops writing it; the durable resume/submit loop is an explicit Wave-4 follow-up. Plus: named size-pinned
`NON_DISPATCHED_AGENTS` + positive reachability (not a bijection relaxation); bounded fail-closed suspension
await; dispatch only on the firstProcessed idempotency path; engine constructed in route, injected into deps.

**Built.** `revenue-cycle-agent` manifest (autonomyTier HITL; toolAllowlist reconciliation.read/evidence.append/
work-queue.submit — NO submit tool, so submission is structurally impossible: `ToolNotAllowedError`). NEW
`src/lib/agents/revenueCycle/*` `createRecoveryWorkflow` (governed read → interlock consumed → `evidence.append`
draft → `proposeAndWait` HITL gate). `orderToCash`/`recoveryDispatch.ts` dispatch the agent on `underpaid` via an
injected engine (deterministic ManualClock), await suspension, persist the agent-written draft once.
`recoveryAgentTier` now resolved from `getAgentManifest(...)`. Durable reviewable item via `workQueueView`.
`tier.ts`/interlock untouched; MARIA/wpcGraph parity byte-identical; no demo-golden regen (manifests not
fingerprinted); flag-off byte-identical.

**Adversarial AFTER — NO-GO; 2 HIGH + MEDs fixed (regression-tested):**
- (HIGH-1) returned `workItemId` was the ephemeral engine proposal id (dead pointer, mismatched the durable
  item). FIX: surface the DURABLE evidence recovery id (== recoveryReviewItem's id); ephemeral id never crosses
  the request boundary.
- (HIGH-2) no durable timely-filing SLA; priority hardcoded; escalation only on the discarded engine → a recovery
  could silently miss the appeal window. FIX: compute + persist a `filingDeadline` (configurable window) on the
  durable entry + work item; `recoveryPriority(delta, daysToDeadline)`; a pure `overdueRecoveryItems` selector
  (the durable auto-sweep/cron is Wave-4 — the engine's escalation is NOT represented as governing).
- (MED-3) auto-approve ignored submission → tier promotion could auto-approve a payer-facing action. FIX:
  `isSubmission` on ProposedAction; `isAutoApprovable` returns false for a submission at ANY tier.
- (MED-4) fail-closed when `deps.recovery` absent in production (`RecoveryRuntimeRequiredError`).
- (MED-5) draft attributed to the agent (`REVENUE_CYCLE_AGENT_ID`), not `system`. (LOW-6) single-sourced rung.

**RE-ATTACK — GO.** Both HIGH exploits CLOSED; MEDs/LOW closed, no regressions (FIX-1 no-submit-tool,
mark-after-save idempotency, single-writer, flag-off, E14 wired-path all intact). One residual (MED-NEW: durable
work-item priority was still a constant) fixed in a final pass — priority persisted on the entry + surfaced on the
inbox item (urgent→expedited/72h); plus a malformed-paidDate guard (degrade to deadline-unknown/high, no 500).

**Is "agents engaged" now true?** YES for the recovery DRAFT — the agent executes governed tool calls through
the manifest allowlist + interlock + decisionGate, is the single writer, proposes once, suspends at the HITL gate
with no auto-execute. NOT yet for the SUBMISSION or a durable resume — those stay human-gated / Wave-4.

**Wave-4 backlog (tracked, honest):** durable engine + resume/execute loop (human decision resumes the same
workflow instance to run submission); a running durable sweep/cron over `overdueRecoveryItems`; per-payer filing
windows via a config seam (the 120-day global is illustrative); multi-line/multi-claim 835 recovery; asymmetric
non-repudiable ledger signing (from Wave 2); overpayment/recoupment routing.

**Gate:** `bash scripts/ci-gates.sh push` after the fixes. Nothing committed by the agent — Wave-3 patch handed
back for the owner's native apply on `feat/golden-thread-twin-ladder`.

---

## 2026-09-12 — Wave 2: Golden-Thread hardening (tamper-evident ledger, idempotency, tenancy)

**Scope.** Additive hardening on Wave 1 (baseline f24aab5), same branch, behind `goldenThreadE2E` + seam
mock-defaults. Core-logic paths: `src/lib/goldenThread/**` (orderToCash.ts, orderToCashDedupe.ts, tenantStamp.ts),
`src/lib/evidence/**` (ledgerIntegrity.ts, verifyStored.ts), `src/lib/security/tenant/resolve.ts`.

**Coalition roster.** Architect + SWE plan; adversarial-BEFORE (R1–R5); 3 parallel work-trees (A ledger/config,
B flow/tenancy, C UI) with interface freeze; adversarial-AFTER; fix pass; RE-ATTACK; a second fix + verify.

**Adversarial BEFORE — NO-GO; frame corrected before coding.** The flagship "seal → D3 tier lift" was the
WRONG model: a cryptographic seal proves integrity/provenance, which is ORTHOGONAL to evidence strength; lifting
the tier would manufacture authority-rung headroom (D3→A3) for an action that is human-adjudicated regardless.
FIX: the seal is an INDEPENDENT tamper-evidence attribute the interlock/tier NEVER read (`tier.ts` untouched;
no `settlementTier`). Also: HMAC is *tamper-evident*, not "settlement-grade" (asymmetric KMS is the fail-closed
production path); idempotency key = payer-side `claimRef:remittanceId` (not the synthetic evId); tenancy enforced
at the route READ boundary (`canAccessMemberTenantAware`), not just stamped.

**Built.** (W2-1) `ledgerIntegrity.ts` — sha256 hash-chain over entries + HMAC `LedgerSeal` binding
recordId+memberId; `verifyLedgerIntegrity` recomputes live (tamper/reorder/append/cross-record all → intact:false);
`signingKey` seam (demo HMAC / production throws `DataSourceNotConfiguredError`); `verifyStored.loadVerifiedRecord`
wired into `GET /api/evidence/[id]`. (W2-2) 835 replay idempotency via the existing `idempotencyStore` seam, key
`claimRef:remittanceId`. (W2-3) tenancy: route read-boundary enforcement + `requireTenantScope` fail-closed before
persist + `tenant?` stamping on the 5 financial entries, reusing the `tenancy` seam. (W2-4) `recordTier` (full
record) vs `CashResult.currentTier` (decision-critical) distinct; raw-remittance exclusion gated on
`liftsTierTo==='D2' && verdict!=='not-recoverable'`. (W2-5) EvidenceTimeline: new stage labels + PHI-safe
summaries + tier chips + a 3-state seal indicator. `canonicalJson` extracted + shared with `fingerprint.ts`.
One new seam `signingKey` (dataMode/seamDispositions/prober/deploy-schema/demo-golden 27→28); certification rollup
unaffected. `tier.ts`/`interlock.ts` untouched; MARIA/wpcGraph parity byte-identical; flag-off byte-identical.

**Adversarial AFTER — NO-GO; 2 HIGH + fixes (regression-tested):**
- (HIGH) seal verified only at WRITE time (tautology); no read-path verifier. FIX: `loadVerifiedRecord` +
  wired into the evidence GET route; tampering a STORED record → intact:false on read.
- (HIGH) mark-BEFORE-commit idempotency → a save failure permanently marks the 835 processed → silent loss of a
  recovery. FIX: `markProcessed` AFTER a successful `store.save`; a save failure leaves no marker → replay
  reprocesses. Residual (rare duplicate human-gated DRAFT on a concurrent-replay race) documented; transactional
  exactly-once deferred to Wave 3. Plus: deduped return no longer surfaces a misleading live `underpaid`; the
  "settlement-grade" comment relabeled; production tenancy fail-closed on absent actorScope; `lobFromPayer`
  ordering bug fixed (marketplace before ` ma`); UI signature wording made symmetric-honest.

**RE-ATTACK — Finding 2 CLOSED; Finding 1 CLOSED at the API layer but surfaced a NEW HIGH:** the reviewer
evidence VIEWER discarded the route's `integrity` verdict and showed a green "Sealed" chip over a tampered record.
FIX: page passes `integrity` into EvidenceTimeline; 3-state indicator (not-verified / intact / **broken**);
tests pin that a tampered record renders "Integrity broken" and never a positive verdict.

**Wave-3 backlog (tracked, fails closed / not live today):** asymmetric (Ed25519/RSA) non-repudiable signing +
key-by-keyId resolution & rotation (HMAC verify currently uses the current key → pre-rotation records read
signed:false); transactional exactly-once (marker+ledger in one tx); tenant identity from a stable payer→tenant
map (not free-text payer string); EvidenceTimeline aria-label embeds record.id (patientId) — PHI-in-DOM;
verify-on-read is dark in the default mock demo (seeded records unsealed); overpayment/recoupment routing;
multi-line/multi-claim 835; represented payer PA adjudication source.

**Gate:** `bash scripts/ci-gates.sh push` after the E13 mockBundle test + the two fix passes. Nothing committed by
the agent — handed back as a local branch off `main` (Wave-2 patch) for the owner's own push.

---

## 2026-09-11 — Wave goldenThreadE2E: Golden-Thread order→cash, Twin-Ladder governed

**Scope.** End-to-end continuation of the financial-clearance golden thread (order → coverage/CRD →
necessity/DTR → PAS decision → 837 claim → 835 remittance → reconciliation → recovery), governed by a
Twin Ladder: every evidence entry carries a tier (D0–D3); the tier gates each agent's authority rung
(A0–A3) via `permittedRung = min(manifestAutonomyTier→rung, ceiling(evidenceTier))`; the tier-independent
adverse-action `decisionGate` overrides. Behind `flag('goldenThreadE2E')` (default OFF); flag-off byte-identical.
Core-logic paths touched: `src/lib/goldenThread/**` (reconciliation.ts, orderToCash.ts).

**Coalition roster.** Architect + SWE design pass (module/interface spec, file map, test matrix, seam/golden
plan). Adversarial-BEFORE (R1–R5) + an independent code-fact verifier. Three parallel specialist builders on
disjoint work-trees with an interface freeze (WT-1 evidence spine+tier; WT-2 governance interlock; WT-3 ports,
reconciliation, orchestrator, seams, flag, route). Adversarial-AFTER (R1–R5). Fix pass. Re-attack
(critical-finding protocol). Size-remediation pass.

**Adversarial BEFORE — NO-GO (conditional); 3 must-fix folded in before coding:**
1. (Critical) "recovery autonomy gated by `decisionGate`" was a frame error — the gate matches only
   member-coverage-adverse verbs, so a recovery/appeal action would auto-resolve at A2 with no human. FIX:
   recovery is DRAFT-only; any payer-facing submission human-gated regardless of rung; `ADVERSE_COVERAGE_PATTERNS`
   extended (additive) with the financial-adverse class (recoup/offset/clawback/overpayment/balance-bill).
2. reconciliation math used a liability disposition, not dollars; a CO write-off would be miscounted as
   recoverable. FIX: per-group `{CO|PR|OA|PI, amount}` in the 835 seed; `delta = (contractedAllowed − ΣPR) −
   paid`; CO/PI/OA never inflate the delta; gate on `deriveMemberLiability !== 'indeterminate'`.
3. "only two non-additive touches" was false — new seams force `dataMode.ts` + `seamDispositions.ts` +
   `seamFailClosed.test.ts` probers + `flags.ts`. Touch-list corrected.

**Adversarial AFTER — NO-GO; 2 HIGH + 1 MED + 1 LOW, all fixed with regression tests:**
- (HIGH) recovery tier was stage-filtered → mathematically constant D2, defeating weakest-link + falsely
  attesting D2. FIX: weakest-link `computeProcessTier` over decision-critical inputs = all entries EXCEPT the
  superseded raw remittance (by remittanceId). Seed now resolves D1 → recovery capped A1 (human). Regression:
  injecting an un-reconciled D0 remittance drops the tier to D0 (old code could never pass this).
- (HIGH) orchestrator synthesized PA `approved` from `netRequiresPA`. FIX: `pasDecision` is a caller-supplied
  input, never synthesized; absent → fail-safe (no recovery). Regression: `denied` → no recovery draft.
- (MED) missing contracted rate `?? 0` → fabricated `overpaid`. FIX: undefined contract → `indeterminate`.
- (LOW) denied+shortfall mislabeled `matched`. FIX: new `not-recoverable` verdict (lifts D2, no recovery).

**Re-attack — GO.** Both HIGH exploits CLOSED with live evidence + reversion-failing tests; FIX-1/FIX-2/flag-off
parity hold. Two new LOW findings, both fail-safe (summary-tier vs decision-tier reporting divergence; exclusion
not gated on an actual D2 lift) — tracked in Wave-2 backlog, non-blocking.

**Reuse (optimal-reuse mandate):** `appendEntry` + the existing recorder shape; `deriveMemberLiability`/
`normalizeGroups`; `DataSourceLoader`/`selectLoader` + boundary validators (new gateways mirror
`goldCardRoster.ts`); `AutonomyTier` + `evaluateDecision`/`isAdverseCoverageAction` (interlock EXTENDS the
pattern list, never forks the gate); `computeProcessTier`/`permittedRung`/`evaluateInterlock`; the append-only
JSONB pg ledger (no migration). No helper re-implemented.

**Changes (additive; only non-additive touches = the route flag-fork and the deliberate `config.dataModes`
golden regen):** NEW `evidence/tierConfig.ts`,`tier.ts`,`financialRecorders.ts`; `evidenceRecord.ts` widened
(recorders extracted to keep ≤400). NEW `agents/governance/interlock.ts`; `decisionGate.ts` pattern list
extended. NEW `dataSources/remittanceGateway.ts`,`contractRepository.ts` + 2 seeds; `dataMode.ts`(+2 seams),
`seamDispositions.ts`(+2), `seamFailClosed.test.ts`(+2 probers via helper), `deploy/schema.ts`(+2 connection
keys — caught by the canonical gate, not the pre-code review). NEW `goldenThread/reconciliation.ts`,
`orderToCash.ts`; `flags.ts`(+goldenThreadE2E); `financial-clearance/route.ts` nested flag-fork. NEW tests for
every module + a regression test per finding. Deliberate `demo-golden.json` `config.dataModes` regen (25→27);
diff confined to that panel; `seam-shapes-golden.json` unchanged; MARIA/wpcGraph parity byte-identical.

**Wave-2 backlog (negative space, deferred, fails closed today):** JWS/hash-linked ledger signing (D3
settlement-grade); 835 replay idempotency via `idempotencyStore`; tenancy stamping on financial entries;
multi-line/multi-claim 835; represented payer PA adjudication source; overpayment/recoupment routing;
EvidenceTimeline UI for the new stages; the two LOW re-attack findings.

**Gate:** `bash scripts/ci-gates.sh push` after the deploy-schema fix + recorder extraction. Nothing committed
by the agent — handed back as a local branch off `main` for the owner's own push.

---

## 2026-09-03 — Coalition deployment: AGENTS.md roster + SESSION-START-PROMPT.md

**Scope:** docs-only change — no `src/lib/**` domain logic touched. Coalition trigger
classification: new file (`docs/build-provenance/SESSION-START-PROMPT.md`) + >40 lines
changed in `AGENTS.md`. Trigger met on "new file" and ">40 changed lines" criteria.

**Change summary:**
- `AGENTS.md`: replaced the verbose coalition-prose section with the full agent roster
  (B0–B3, R1–R5, ON-DEMAND Scale) embedded as a copyable SESSION START deployment prompt,
  keeping the file at ≤150 lines. Pre-flight trigger table, reasoning-mode rules, gate
  command, and Definition of Done preserved. Added `npm run gate:push` to the commands
  section. Added `coalition-log.md` entry requirement to the Definition of Done.
- `docs/build-provenance/SESSION-START-PROMPT.md` (NEW): standalone, fully self-contained
  session-start prompt with the complete coalition roster, per-agent mandates and must-ask
  questions, reasoning-mode rules (CoT default / ToT injection points), pre-flight
  checklist, gate commands, Definition of Done, and stop conditions. Intended to be copied
  verbatim and sent as the first message to any AI agent starting an RHTP session.

**Architect pass (B1):** docs-only; no ADR required. The prompt mirrors the canonical
persona definitions in `docs/framework/personas.md` and the trigger rules in
`docs/framework/coalition-protocol.md` verbatim — no new design decisions.

**Adversarial pass (pre-delivery):** R5 cross-examination applied to the prompt itself:
- Claim "coalition is active" — UPHELD: the prompt forces the agent to name each persona
  and confirm before proceeding; it does not merely assert activation.
- Claim "reasoning mode enforced" — UPHELD: CoT/ToT injection points are explicit and the
  prohibition on ToT for mechanical tasks is stated.
- Claim "gate enforced" — UPHELD: `npm run check:all` and `npm run gate:push` are named
  explicitly; the commit-message no-attribution rule is restated.
- Risk R3 (stub): the prompt is a doc artifact, not a seam — no stub grading applies.
- Risk R2 (negative-space): the pre-flight checklist covers all five trigger classes; the
  stop-and-report rules cover the four stop conditions from `AGENTS.md`. No absent item
  found that was present in the canonical framework docs.

**Verification:** `tsc --noEmit` 0 · `check:sizes` PASS ratchet intact · no src/ files
changed · `AGENTS.md` line count 138 (≤ 150 cap).
## 2026-09-03 — Patient navigation fix: Agentic Orchestrate category (A1–A8 findings)

**Context:** Two screens in the Agentic Orchestrate tab category — `whole-person-care-summary` (the
knowledge-graph explorer) and `journey-aware-context` (the engagement channel timeline) — always
rendered Maria Redhawk regardless of which patient was selected in the roster dropdown. Ten of the
twelve uhg-orchestrate screens correctly read `demoStore.activeCitizenId`; only these two were
hardwired. The fix converges both screens onto the same shared seam already proven by the ten
working screens, preserving Maria's authored graph at 100% byte-identical fidelity and running fully
mock-mode (no Neo4j/Postgres dependency).

**Root cause (A1 + A2, both CRITICAL).** `whole-person-care-summary/page.tsx`: `CanvasSVGGraph`'s
D3 simulation read module-level `graphNodes`/`graphEdges` constants directly (lines 913–943), so the
canvas never switched even though `RightPanel` received the active patient's nodes. `GapAwareCanvasSVGGraph`
also seeded `effectiveNodes`/`effectiveEdges` from `graphNodes`/`graphEdges`. `LENS_NODE_SETS` was a
module-level constant keyed from `graphNodes.map()`, so lens filtering was always over Maria's 55 nodes.
`journey-aware-context/page.tsx`: all JSX still referenced 20+ deleted constants (`MEMBER_NAME`,
`CHANNELS`, `INTERACTIONS`, `ACTIVE_WINDOW_START_HOUR`, etc.) and seven fields were missing from the
`JourneyContext` interface (`sessionFrequency`, `sessionFrequencySubtext`, `lastTouchpointDays`,
`lastTouchpointChannel`, `lastTouchpointSubtext`, `activeWindowStat`, `activeWindowStatSubtext`),
causing a compile failure.

**Additional findings closed (A3–A8).** A3: dead SDOH fallback in `builder.ts` duplicated logic
already in `resources.ts:citizenNeeds()` — removed. A5: `GapAwareCanvasSVGGraph` is Maria-only by
design (HbA1c closure animation) — documented. A6: `DarkLensBar` node-count badges always showed
Maria's counts — now receives `lensCounts` computed from `activeNodes`. A7: hardcoded
`"Maria's Active Window"` string in the channel band legend — replaced with `ctx.activeWindowLabel`.
A8: unknown-patient fallback used `MARIA_CHANNELS` — replaced with a generic default.

**Architect + SWE.** New module `src/lib/wpcGraph/` (4 files — `types.ts`, `builder.ts`,
`useWholePersonGraph.ts`, `journeyContext.ts`) implements the shared patient-context seam. Two
additional files extracted to satisfy the size ratchet: `src/lib/wpcGraph/lensUtils.ts`
(`MARIA_LENS_NODE_SETS`, `buildLensNodeSets`) and `src/lib/wpcGraph/mariaJourneyData.ts` (Maria's
15-interaction authored constants). `page.tsx` edits are net-neutral (2123 → 2123 lines, exactly at
baseline). `journeyContext.ts` stays at 373 / 400 lines.

**Seam wiring.** Both pages now open with:
```
const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
```
matching the canonical pattern from `consumer-360`, `whole-person-care`, and the other ten screens.
`journey-aware-context` drops the old `useAppContext → activePatientId` path entirely.

**Maria fidelity gate.** `buildWholePersonGraph('MARIA_SD_001')` passes `deepEqual(result.nodes,
GOLDEN_NODES)` and `deepEqual(result.edges, GOLDEN_EDGES)` — the authored 55-node/77-edge graph is
returned verbatim without modification.

**Adversarial + red-team.** Architect agent issued HOLD verdict (A1+A2 critical) before coding.
SWE fixes applied with independent architect review of each finding. 105/105 tests pass
(55 builder + 50 journeyContext).

**Verification:** `npm run check:types` → 0 errors · `npm run check:sizes` → PASS, ratchet intact
(75 frozen legacy files unchanged) · `npx vitest run tests/wpcGraph` → 105/105 · lint warnings
limited to pre-existing prettier issues in unrelated files (confirmed by stash/pop baseline comparison).

**Files changed:**
- NEW: `src/lib/wpcGraph/types.ts`, `builder.ts`, `useWholePersonGraph.ts`, `journeyContext.ts`,
  `lensUtils.ts`, `mariaJourneyData.ts`
- NEW: `tests/wpcGraph/builder.test.ts`, `journeyContext.test.ts`
- MODIFIED (net-neutral): `src/app/whole-person-care-summary/page.tsx` (2123 → 2123)
- MODIFIED (net-reduce): `src/app/journey-aware-context/page.tsx` (594 → ~480)


## 2026-09-02 — WPC Da Vinci Risk Adjustment: the CODING GAP as a first-class projected dimension

**Context:** the platform owned both ends of the risk-adjustment value chain — a RADV-defensibility /
submission-scrub module (`src/lib/finance/riskAdjustment/`) and an "HCC Suspects" clinician UI — but had NO
standards-based artifact connecting the ingested clinical evidence to them. The coding gap (the central object of
payer risk adjustment) was *dropped* on ingestion (care-gap Observations → non-projected census) and absent from
the graph (the generic `RiskAssessment` node has no HCC category, gap status, suspect type, hierarchy, or model
version). This wave implements the **Da Vinci Risk Adjustment IG** (`hl7.org/fhir/us/davinci-ra`) Coding Gap
MeasureReport as a NEW projected dimension. Record-domain count moves **22 → 23**
(`tests/pipeline/domainRecordCount.test.ts` 23/23).

**Architect + SWE.** New adapter `src/lib/pipeline/adapters/codingGapReport.ts` FLATTENS a Da Vinci-RA Coding Gap
`MeasureReport` (one per member per model version) into one record per `group` (condition category), parsing the
HCC code + code system, evidence status (open/closed/pending), suspect type (historic/suspected/net-new),
hierarchical status, evidence-status-date (date-only), model+version, and the group's supporting-evidence
references (`evaluatedResource` + `ra-groupReference`). New spec `src/lib/graph/mapping/codingGap.ts` projects a
`CodingGap` node keyed by `(measureReportId, model, version, groupId, conditionCategory)` — so concurrent
CMS-HCC **V24 and V28** gaps coexist through the blend — with `HAS_CODING_GAP` (Member→CodingGap, associative,
dated) and `SUPPORTED_BY` (CodingGap→Evidence) edges. Routing: a Da Vinci-RA `MeasureReport` PROJECTS; any other
MeasureReport is a loud by-design non-projection (`MeasureReport:non-ra`). Surfaced through the holistic lens via
`mapCodingGaps` (`CodingGapSummary`: openCount + suspectedCount), consent-filtered like every other dimension.

**The coding-intensity firewall (the P0 safety property).** A coding gap — especially a `suspected` one — is a
payer-analytics HYPOTHESIS, never a clinical assertion. Enforced three ways: (1) `coding-gap` is OUT of
`CODE_CARRYING_DOMAINS`, so it never runs the clinical semantic-binding gate; (2) both edges are ASSOCIATIVE, never
causal; (3) the adapter NEVER emits a Condition — it only CITES evidence via a neutral `Evidence` node. An
ungoverned evidence status / suspect type QUARANTINES (never guessed). 42 CFR Part 2: SUD-linked HCC gaps carry a
Part 2 label (segmentation-at-transform) and the consent lens filters them uniformly (DP-1).

**Adversarial red-team (independent agent, tree-of-thought; six findings, all closed before delivery).** An
independent red-team agent attacked the build against the platform's own safety posture:

- **FINDING 1 — HIGH (closed): the firewall was unenforced — SUPPORTED_BY minted a `Condition`.** Both graph
  stores auto-create an edge's endpoints, so a `SUPPORTED_BY` edge to `Condition/x` MINTED a `Condition` node from
  an unverified reference — a hypothesis materialized as a diagnosis, and the firewall test passed only because its
  fixture cited no evidence. Fix: `SUPPORTED_BY` now targets a NEUTRAL `Evidence` node (keyed by the reference,
  carrying `{evidenceRef, resourceType}` for join-back), never a clinical kind; the firewall test was strengthened
  to a `suspected` gap CITING `Condition/hypothesis` and asserts ZERO Condition nodes minted.
- **FINDING 2 — HIGH (closed): 42 CFR Part 2 under-restriction (SUD leak).** SUD detection matched a literal digit
  set against `coding[0]` with no leading-zero normalization, so `HCC055`, a co-listed ICD in `coding[0]`, or a
  version mismatch would leave a SUD gap unrestricted and DISCLOSED under NO_CONSENT. Fix: version-aware
  `SUD_HCC_BY_VERSION` (V24 {54,55} / V28 {135-138}, UNION fail-closed default), `hccDigits` strips leading zeros,
  and `pickConditionCategory` scans ALL codings for the HCC-system coding; a digit-less HCC code FAILS CLOSED.
- **FINDING 3 — MEDIUM (closed): PHI leak via evidenceStatusDate.** The date field fell through to a free-text
  `valueString`. Fix: `dateExtValue` reads only `valueDate`/`valueDateTime`, ISO-validated.
- **FINDING 4 — MEDIUM (closed): node-key collision.** The key omitted model+version+group, so a repeated category
  in one report (or a reused report id across versions) collapsed two gaps onto one node. Fix: the key now folds in
  model, version, and group id; a duplicate-category test asserts two distinct nodes.
- **FINDING 5 — MEDIUM (closed): evidence mis-linkage.** The report-wide evidence fallback fanned every citation to
  every group, cross-linking a co-reported (possibly SUD) gap's evidence. Fix: the fallback fires ONLY for a
  single-group report; multi-group reports without `ra-groupReference` leave evidence unlinked (never guessed).
- **FINDING 6 — LOW (closed): discriminator brittleness.** The `ra-` regex missed the canonical `davinci-ra/`
  namespace. Fix: the discriminator now matches `davinci-ra` and `ra/`.

Re-review by the same agent confirmed both HIGH blockers closed with the consent posture intact (the Evidence node
inherits the envelope's restriction; restriction only ratchets up in both stores).

**Adversarial coverage** (`tests/wpc/codingGapDimension.test.ts`, BOTH backends — pg-mem + Neo4j fake): projection
of the RA fields, V24/V28 non-collision, Evidence-node citation (no Condition minted), the suspected-gap firewall,
Part 2 SUD restriction (incl. zero-padded HCC055), duplicate-category non-collision, ungoverned-value quarantine,
non-RA MeasureReport by-design non-projection, PHI-minimal node, and version-aware fail-closed SUD detection. E14:
the adapter is reached via routing and the spec via the registry — both WIRED (not orphans).

## 2026-09-02 — WPC FHIR-Subscription streaming ingest (worked example)

**Context:** the 5-patient load path is BATCH only — a FHIR transaction bundle through `ingestBundle`
(`src/lib/runtime/ingestBundle.ts`). The platform already declares a STREAM lane (`ArrivalMode =
'batch'|'stream'|'micro-batch'`; the HL7v2 `adtEncounter` adapter is `arrivalMode:'stream'`) and an
adapter's `arrivalMode` already flows to the outbox event's lane `class` via `laneClass` in
`src/lib/pipeline/load.ts` (`toIntentInput` sets `class: laneClass(mode)`). The missing piece was a
FHIR R4 **Subscription** front door that ingests ONE resource (not a bundle) in real time. This change
builds it as additive runtime/driver work. NO `WpcDomain` and NO mapping spec were added —
`MAPPING_SPECS.length` stays **22** (`tests/pipeline/domainRecordCount.test.ts` still 22/22).

**Rides the existing transform/outbox/graph path.** The new driver `src/lib/runtime/ingestStreamEvent.ts`
routes the single resource with the SAME `route()` (`ingestRouting.ts`), builds a single-entry collection
bundle `{resourceType:'Bundle',type:'collection',entry:[{resource}]}`, and runs the owning adapter through
the REAL `runPipeline` into the SHARED outbox, then drains to the graph with `runProjectionOnce` — reusing
`defaultPipelineDeps`, `makeDevOutboxDeps`, `OutboxWriter` and the `IngestStores` shape exactly as
`ingestBundle` does. `ingestBundle`'s behavior is unchanged (the stream driver only imports its `IngestStores`
type).

**Stream lane via `arrivalMode:'stream'` → event `class:'stream'`.** The FHIR-JSON domain adapters are
shared with the batch path and declare `arrivalMode:'batch'`. A tiny helper `asStreamAdapter(adapter)`
returns a shallow copy `{ ...adapter, arrivalMode:'stream' }` (the shared adapter is NEVER mutated), so the
SAME parse/validate/normalize/segmentation logic runs but `runPipeline` reads `arrivalMode:'stream'` and
`toIntentInput` stamps the outbox event `class:'stream'`. Proven in the suite by reading the shared outbox
(`outbox.all()`): the streamed Observation's intent carries `envelope.class === 'stream'` while dorothy's
batch-loaded intents all carry `'batch'`.

**Consolidates onto the same member via the shared xref — and NEVER mints blind (identity-safety gate).**
Identity resolves through the SAME `createXrefEmpiResolver(stores.xref, src)` seam with the SAME `idScope`
(= sourceSystem) the batch driver seeds, so a streamed event for a patient already batch-loaded resolves to
the EXISTING member — no new member is minted (asserted by an unchanged `Member` node count). Because a single
streamed resource carries only a subject REFERENCE (a bare id token, no demographics), the driver adds a
PRE-RESOLUTION GATE before running the pipeline: it computes the subject token the SAME way the adapters do
(`subject`/`beneficiary`/`patient` `.reference.split('/').pop()`) and looks it up in the shared xref under
`scopeKey(scope, token)`. `linked` → consolidate; `unlinked` WITH an operator-confirmed `expectedMemberId` →
seed the xref link, then consolidate; `unlinked` without confirmation, or `ambiguous`, → HELD (never a blind
mint). Idempotency holds: streaming the same Observation twice yields exactly ONE node (deterministic
`fhirResourceId` PUT + per-member checkpoint).

**Balance-control on every path.** Every event — admitted, unrouted, or held — emits ONE PHI-safe
`LoadReconciliationRecord` (`buildLoadReconciliationRecord`, `countIn:1`, resource-granular census that always
sums to 1) and appends it when a `reconciliation` store is wired, so no stream event is silently dropped. A held
event also persists a `held-identity` dead-letter (sourceRef = token, PHI-safe) when a `deadLetter` store is
wired — the same durable audit posture the batch lane has.

**Adversarial red-team (tree-of-thought; three findings, all closed before delivery).** The panel attacked the
worked example against the batch path's own safety posture:

- **FINDING 1 — HIGH (closed): a stream event for an unknown subject silently minted a phantom member.** The
  id-only EMPI path mints for any token it has never seen; a single streamed resource carries no demographics,
  so an unknown subject would fail OPEN to a mint — exactly the blind mint the batch driver refuses (it holds a
  no-Patient / possible-match bundle). The first cut even enshrined the mint as correct in a test. Fix: the
  pre-resolution gate above HOLDS an `unlinked`/`ambiguous` subject (first-class `held:true` + `heldReason`,
  nothing minted or projected) unless the caller passes an operator-confirmed `expectedMemberId`; the test now
  asserts the unknown subject HOLDS and mints no member.
- **FINDING 2 — MEDIUM (closed): the stream lane left no reconciliation trace.** The batch lane emits an ABC
  record per load; the stream lane emitted none, and unrouted/held events left no durable trace. Fix: every path
  emits and (when wired) appends a balanced `LoadReconciliationRecord`, and a held event also persists a
  `held-identity` dead-letter; both are asserted on both backends.
- **FINDING 3 — LOW (closed): held was not a first-class result and the `HeldIdentityError` catch was dead
  code.** `StreamEventResult` had no `held` flag and the post-pipeline `HeldIdentityError` catch could not fire
  (id-only resolution never throws). Fix: `held`/`heldReason`/`reconciliation` are first-class result fields; the
  gate is the primary hold mechanism and the pipeline catch is retained, honestly documented, as a defense-in-depth
  backstop for a future demographics-based adapter hold.

**Adversarial coverage** (`tests/wpc/streamEvent.test.ts`, BOTH backends — pg-mem + Neo4j fake): same-member
consolidation, real stream-lane `class`, labs-vitals projection, unroutable `Basic` (unrouted + balanced ABC
record, nothing projected, no crash), unknown subject HELD (no blind mint), operator-confirmed `expectedMemberId`
consolidation, wired-store durable trace (held-identity dead-letter + balanced reconciliation), and double-stream
idempotency. E14: the driver is an unwired module like the other runtime drivers and is listed in
`wiring-baseline.json`'s `orphans`.

## 2026-09-02 — WPC remediation/reprocessing + audit-balance-control (ABC) ledger

**Context:** the fan-out ingest driver (`src/lib/runtime/ingestBundle.ts`) surfaced quarantines and identity
holds in its result object but (a) did not persist them to the durable append-only dead-letter ledger by default,
(b) emitted no consolidated per-load reconciliation record, and (c) had no path to bring a held/quarantined record
back into the graph once coded. This change builds all three as runtime/driver work. NO `WpcDomain` and NO mapping
spec were added — `MAPPING_SPECS.length` stays **22** (`tests/pipeline/domainRecordCount.test.ts` still 22/22).

**Durable hold persistence wired into the driver.** `IngestStores` gained two OPTIONAL durable stores —
`deadLetter?: DeadLetterStore` and `reconciliation?: ReconciliationStore` (optional so every existing caller/test
keeps working). When `deadLetter` is present the driver passes it into every `runPipeline` call (replacing the old
`options.deadLetterStore ?? null`), so quarantines + held-identity records persist immutably; and the WHOLE-BUNDLE
identity hold (the possible-match early-return path) is now itself persisted as a `held-identity` dead-letter record
(memberRef = source handle, reasonCode = `pre.reasonCode`, sourceRef = patient token, payloadRef = `bundle:${scope}`)
so a held bundle never vanishes from the audit trail.

**The ABC artifact — `LoadReconciliationRecord`.** A new leaf module `src/lib/runtime/reconciliation.ts` defines the
PHI-safe per-load record (counts, refs, ids only — never names/narrative), an in-memory append-only
`ReconciliationStore` (`append`/`list`/`get`, filter by memberRef/kind), and the deterministic-loadId record builder
(reusing the exported `stableHash` from `deadLetter/types.ts`, no new hash). The driver returns the record on
`IngestBundleResult.reconciliation` and appends it when a store is wired. `balanced` is the balance-control proof:
for a non-held load `admitted + quarantined + nonProjected === countIn`; a held bundle is trivially balanced.

**The remediation round trip (coded → reprocess → resolve hold).** New `src/lib/runtime/remediation.ts` exports
`remediateAndReprocess(correctedBundle, opts, stores)`: it runs a steward-staged corrected mini-bundle (member's
Patient + the now-coded resource) back through `ingestBundle` into the SAME graph+xref (M3 consolidation → same
member, no duplicate), and on CONSERVATIVE success (admitted > 0, ZERO residual quarantine, not held) resolves the
hold via `deadLetter.resolve(holdId, 'retry', actor)` (immutable resolved version) and emits a `remediation`
reconciliation record reflecting the delta. A partially-successful remediation (any residual quarantine) does NOT
resolve the hold — it stays open. `registerWpcReprocessLane(stores, provider)` binds the `quarantine` retry lane;
FAIL-CLOSED: if the provider has no staged correction the lane returns `no-remediation-staged` and the record stays
open. Idempotent: re-running re-projects the same node (deterministic idempotent PUT) and re-resolving a terminal
hold is a no-op.

**PHI-safe posture.** The ledgers are refs + codes + counts only; the corrected raw resource is supplied
transiently by the caller (the steward) and is NEVER written to the PHI-safe ledger — honest by construction. The
Alex Kirby end-to-end test (`tests/wpc/remediationReprocess.test.ts`, BOTH backends) asserts the ledgers contain no
`Kirby`/`Alex`/`Diabetes`.

**Adversarial red-team (tree-of-thought; five findings, all closed before delivery).** The panel attacked what the
green suite structurally could not prove:

- **FINDING 1 — HIGH (closed): false / wrong-hold closure.** Hold resolution keyed on a COARSE aggregate
  (`admittedTotal > 0 && quarantined === 0`) and never checked that the SPECIFIC held record was the thing fixed — so
  a valid-but-unrelated correction, or a wrong `holdId`, would stamp a hold `retried` though its resource was never
  remediated. Fix: `remediateAndReprocess` now looks the hold up, takes its `sourceRef` as the target, and resolves
  ONLY when that exact resource is present in the correction AND admitted (not re-quarantined).
- **FINDING 2 — HIGH (closed): silent identity split.** For an identifier-poor member (alex-kirby: MRN + NHS only, no
  medicaidId) the anchor is a MINTED id derived from source+token, so a steward whose corrected bundle drifted on
  `sourceSystem`/`fullUrl` would mint a NEW member, fragment the record, and falsely close the hold. Fix:
  `RemediationOptions.expectedMemberId` is now REQUIRED (the hold's owning member, from the load); remediation REFUSES
  to resolve unless the correction consolidates onto that exact member (`reason: 'member-mismatch'`).
- **FINDING 3 — MEDIUM (closed): loadId collision.** A `load` record and a `remediation` record for the same
  (source, patient, time) shared a deterministic `loadId`, so `get(loadId)` returned the wrong kind. Fix: `kind` is
  folded into the id (prefix + hash), and the remediation record carries its own `remed-${holdId}-…` id.
- **FINDING 4 — MEDIUM (closed): held-bundle balance fiat.** A held bundle set `balanced = true` by fiat while its
  routed resources were unaccounted. Fix: a held bundle now counts ALL resources as non-projected, so `balanced` is
  ALWAYS a genuine conservation check (`admitted + quarantined + nonProjected === countIn`), never a waiver.
- **FINDING 5 — LOW (noted + partially hardened):** the PHI guard checks keys not values and the test was
  case-sensitive; ledger `sourceRef` can embed a lowercased resource-id slug (a PRE-EXISTING dead-letter behavior).
  The reconciliation `loadId` hashes the patient token rather than embedding it; the resource-id-slug hardening (hash
  ids in the dead-letter store) is logged for the backlog as it spans all dead-letter callers.

Findings 1 & 2 are pinned by new regression tests (`member-mismatch` and `target-not-in-correction` both refuse to
resolve, hold stays open). Scope: `ingestBundle.ts` (durable stores + ABC record + held-balance fix), new
`reconciliation.ts` + `remediation.ts`, `remediationReprocess.test.ts`. No invariant/domain changed. Verification
after fixes: `tsc` 0; full suite **2357 passed** / 1 expected-fail / 74 skipped / 0 failed; `check:sizes` pass; 22/22.

## 2026-09-02 — WPC payer dimensions: Coverage/Encounter FHIR adapters + RiskAssessment/Flag projection + referral/goal coding

**Context:** four payer FHIR resource types that had been parked in the non-projected census had to become
first-class PROJECTED knowledge-graph dimensions, and the quarantined referrals/goals had to clear by gaining
governed codes. Coverage and Encounter were HALF-BUILT — `WpcDomain` already carried `'coverage'`/`'encounter'`
and `coverageSpec` (HAS_COVERAGE) / `encounterSpec` (HAD_ENCOUNTER) were already registered, but wired only to the
X12-834 / HL7v2-ADT adapters. RiskAssessment and Flag were genuinely new. Scope of change:
`src/lib/pipeline/adapters/{coverageFhir,encounterFhir,riskAssessment,flag}.ts` (new FHIR-JSON adapters),
`src/lib/graph/mapping/{riskAssessment,flag}.ts` (new specs) + `src/lib/graph/mapping/index.ts`,
`src/lib/pipeline/types.ts` (WpcDomain +2), `src/lib/runtime/ingestRouting.ts` (route() + discriminators EXTRACTED
from `ingestBundle.ts` to stay under the 400-line prod cap), the referral adapter+spec (review-routing flag), the
seed generator + terminology delta, `src/lib/wpc/projectedAggregator*` (four optional sections), and the tests
(`domainRecordCount`, `wpcRecordLoad`, new `payerDimensionsR4`).

**The 20 → 22 invariant.** RiskAssessment and Flag are each a NEW `WpcDomain` + a NEW mapping spec + node kind
(`RiskAssessment`/`Flag`) + edge (`HAS_RISK_ASSESSMENT`/`HAS_FLAG`), so `MAPPING_SPECS.length` and the WpcDomain set
both move 20 → **22** (asserted 22/22 from both ends by `tests/pipeline/domainRecordCount.test.ts`). Coverage and
Encounter add NO spec and NO domain — their new adapters emit `coverage.recorded` / `encounter.recorded` onto the
EXISTING specs — so the count is 22, not 24. This is the tripwire the architect flagged: reusing the half-built
specs is what keeps the count honest.

**42 CFR Part 2 handling.** The Encounter and Flag adapters mirror `behavioralHealth.ts`: when any
Encounter.type/reasonCode or Flag.category/code coding is an ICD-10 SUD code (F10–F19, via the shared
`isSudDiagnosis`), they evaluate `evaluatePart2Basis` and — failing safe on absent program context — attach the
PHI-safe `part2-sud` segmentation hint while leaving `consent.part2Restricted=false` at normalize. The shared
transform maps the hint to the durable `42-CFR-Part-2` label the projector reads off the ENVELOPE, so a SUD-coded
Encounter/Flag projects as a RESTRICTED node — HIDDEN under NO_CONSENT, VISIBLE only under a Part 2 grant, on both
backends (`payerDimensionsR4.test.ts`). RiskAssessment is non-restricted by default and is intentionally kept OUT
of `CODE_CARRYING_DOMAINS` (seed RAF carries no governed HCC coding; requiring governed codes would re-quarantine it).

**PHI-minimal projection.** Coverage projects plan code + status + period only (NEVER subscriberId/memberId — the
beneficiary ref anchors identity and is never persisted). Encounter projects class + trigger code + point-of-care
ref only, never narrative. RiskAssessment projects the predicted-outcome code/text, probability decimal, and the RAF
score parsed to a bare NUMBER by regex (the rationale sentence never reaches the graph), plus the method code. Flag
projects the category coding code + status + period only — NEVER Flag.code.text, which is free-text PHI narrative.
None of these payloads emit a governed `{system,code}` object, so the load-stage semantic gate does not touch them.

**SR-3 review routing.** Every parked referral gained a governed serviceCode (CPT-HCPCS + SNOMED-CT), each of which
was ALSO added to `terminology-seed.json` in the same change so the load-stage semantic gate admits rather than
trading `missing-service-code` for `semantic-unrecognized-code`. Robert's SR-3 (medication-cost / financial-navigation
referral) is deliberately coded with a generic Patient-referral SNOMED code AND flagged for human review: a
`needs-coding-review` FHIR extension (`gravity-sdoh-financial-navigation-code-TBD`) surfaces as
`reviewRequired`/`reviewReason` on the normalized ReferralPayload and the projected ServiceRequest node — visibly
tagged, not silently coded. Goals gained `Goal.description.coding` (they bypass the semantic gate but are coded
honestly). Result: the coded cohort now admits with ZERO quarantine; alex-kirby's genuinely uncoded resources remain
the honest quarantine exception.

**Coalition (architect design → SWE build → adversarial red-team):** first build landed green — `tsc --noEmit` 0;
`vitest run` 2328 passed / 1 expected-fail / 74 skipped, 0 failed; `check-file-sizes.sh` passes (route() extracted
to `ingestRouting.ts`; payer mappers extracted to `projectedAggregator.payerMappers.ts` to hold both source files
under the 400-line cap); 22/22 invariant holds; both graph backends agree.

**Adversarial red-team (tree-of-thought; three findings, all closed):**

- **FINDING 1 — HIGH (closed, 42 CFR Part 2 leak).** Encounter/Flag SUD detection used the ICD-only `isSudDiagnosis`
  (F10–F19), so a SUD encounter/flag coded in **SNOMED CT** (the norm for `Encounter.type`/`reasonCode`/`Flag.code`
  — e.g. SNOMED 191816009 opioid dependence, 7200002 alcoholism) was NOT recognized and projected UNRESTRICTED,
  disclosed under NO_CONSENT. This was the exact residual risk the first build flagged. Fix: a new
  `isSudCoding(code, system)` in `part2Basis.ts` (ICD-10 F10–F19 OR a governed SNOMED SUD concept set), and
  `evaluatePart2Basis` now evaluates SUD content through `isSudCoding` — so the leak is closed centrally (also
  hardening the Condition/behavioral-health path). The Encounter/Flag adapters detect via `isSudCoding`. Pinned by
  `tests/pipeline/payerDimensionsRedteam.test.ts` (SNOMED-SUD encounter/flag → part2 hint; non-SUD SNOMED → none).
- **FINDING 2 — MEDIUM (closed, silent RAF corruption).** The RAF regex required the literal `RAF score <digit>`,
  so common phrasings ("RAF score of 3.42", "RAF: 3.42", locale "3,42") silently yielded `0` or a truncated integer —
  a fabricated low risk score with no quarantine. Fix: a phrasing-tolerant parser (score/weight/of/:/=, comma or dot
  decimal) that returns **`null` (not 0)** when no RAF is present; the spec omits the `rafScore` property on null so
  a phantom 0 never reaches the graph. Pinned with seven phrasing cases + the null-absent cases.
- **FINDING 3 — MEDIUM (closed, silent node collision).** The four payer adapters keyed the node on `resource.id`
  with no fallback while `validate()` never required it, so two id-less resources (a legal transaction-bundle shape
  that references by `fullUrl`) would upsert onto ONE node — silent loss, while reconciliation still balanced. Fix:
  each adapter's `validate()` now requires `resource.id` (`missing-{coverage,encounter,flag,risk-assessment}-id`), so
  an unkeyable resource QUARANTINES (accounted) instead of merging. Pinned for all four kinds.
- **FINDING 4 — LOW (closed).** Stale `ingestBundle.ts` routing docstring still listed Coverage/Encounter/Flag/
  RiskAssessment as non-projected; corrected to match `ingestRouting.ts`.

**Verification after fixes:** `tsc --noEmit` 0; `vitest run` **2348 passed** / 1 expected-fail / 74 skipped, 0 failed;
`check:sizes` passes; 22/22 invariant intact; both backends agree. Remaining documented limitation (backlog, not a
blocker): SUD content coded ONLY in `Flag.code.text` free-text is deliberately not read (PHI-minimal — the narrative
never reaches the node), and the SNOMED SUD set is a curated starter list to be bound to a governed SNOMED SUD refset
in production; the same SNOMED-SUD hardening now also benefits the Condition path via the shared `isSudCoding`.

## 2026-09-02 — WPC record-load: SDOH/BH observation routing · fan-out ingest driver · M3 identity (R3)

**Context:** the whole-person load path had to route ONE FHIR bundle (labs + SDOH screenings + BH surveys +
conditions + meds + referrals + care-team) into the projected graph, giving the social and behavioral data
**their own semantics** (Gravity/AHC-HRSN LOINC panels → SDOH domain + ICD-10 Z-code; PHQ-9/AUDIT-C surveys as
SIGNALS, not diagnoses) without inventing a new mapping spec or `WpcDomain` (the `domainRecordCount` tripwire:
`MAPPING_SPECS.length === 20`). Scope of change: `src/lib/pipeline/adapters/{lab,sdohObservation,bhObservation}.ts`,
`src/lib/graph/mapping/behavioralHealth.ts`, `src/lib/runtime/ingestBundle.ts` (new fan-out driver), the seed
bundles + terminology delta, and `tests/wpc/wpcRecordLoad.test.ts` (adversarial, both graph backends) +
`tests/pipeline/sdohClassifierR3.test.ts`.

**Coalition (architect design → SWE build → adversarial red-team):**

- **R3 — one Observation stream, three owners (by category, not guesswork).** The lab adapter now owns
  `laboratory` + `vital-signs` only; a NEW `sdohObservation` adapter owns `social-history` and emits
  `sdoh.screening.recorded` (claimed by the EXISTING `sdohSpec`, `sdoh.` prefix → SdohScreening/SocialNeed +
  Z-code); a NEW `bhObservation` adapter owns `survey` and emits `behavioral-health.observation-recorded`
  (claimed by `behavioralHealthSpec` → a `BehavioralHealthObservation` node via `HAS_BH_OBSERVATION`, DISTINCT
  from the Condition/diagnosis path — a score is never a diagnosis). No new spec, no new domain: 20/20 holds.
- **Fan-out ingest driver (`ingestBundle`).** Routes each bundle entry to its owning adapter, runs every group
  through the REAL five-stage `runPipeline` into a shared outbox, then drains to the projected graph. Every
  resource lands in exactly one census bucket (admitted / quarantined / non-projected) — conservation asserted.
- **M3 identity wiring.** The bundle's Patient is pre-resolved ONCE (name/dob + a GLOBAL medicaidId + a
  SOURCE-SCOPED `localId` = {assigningAuthority: sourceSystem, value: MRN}); a possible-match band HOLDS the
  whole bundle (no wrong-person auto-link). One person's records consolidate to one member; a raw subject id or
  MRN reused across DIFFERENT sources cannot cross-link (id namespaced by source; localId is same-source-exact).
  This is the end-to-end population of the R2-B source-scoping that the prior wave left unexercised (its M3 note).

**Adversarial red-team (tree-of-thought; three findings, all closed):**

- **FINDING 1 — HIGH (closed).** The SDOH free-text positive classifier trailed a `\b` on the stems
  `insecur` / `instab` / `homeless`, so every INFLECTED form ("food insecurity", "housing instability",
  "homelessness") failed to match and silently classified NEGATIVE — hiding a real unmet need (fail-UNsafe: the
  dangerous direction). Since the seed screenings carry no coded interpretation, the classifier was load-bearing.
  Fix: a deterministic, PHI-safe, negation-AWARE classifier with a fail-safe precedence — negated-problem
  ("no food insecurity") → negative; negated-resource ("no stable housing") → positive; affirmative barrier stem
  (prefix-matched, so inflections match) → positive; else clear-screen → negative. Verified against ALL 30 real
  seed strings + adversarial inflections and negation traps (incl. multi-clause "unstable housing, otherwise
  stable mood" → positive: a barrier stem is never silenced by a stray later clear-word). Pinned by
  `tests/pipeline/sdohClassifierR3.test.ts`.
- **FINDING 2 — MEDIUM (closed).** An Observation matching none of lab/vital/social-history/survey was dropped
  into a generic `Observation` non-projection count — so a real clinical Observation that failed to route was
  indistinguishable from an intended care-gap overlay and could vanish into the "by design" census. Fix: the
  driver now recognizes care-gap Observations explicitly (`isCareGap`) and counts them under `Observation:care-gap`,
  while ANY other unroutable Observation lands under a loud, distinct `Observation:unrouted` bucket a monitor
  asserts is zero for well-formed input. No clinical routing changed; the census is now honest.
- **FINDING 3 — LOW (closed).** The SDOH coded-interpretation reader treated lab range flags `H` / `HH` as a
  SDOH-positive finding. Removed: `H`/`HH` are laboratory flags, not a social-need signal; SDOH positives are
  `POS` / `A` / `AA` only.

**Verification / DoD:** `tsc --noEmit` 0; full suite **2317 passing** (+1 expected-fail, 74 skipped — the only
skips are the Docker testcontainer integration files); **20/20 C9 domain count intact** (`domainRecordCount`);
both graph backends (pg-mem + Neo4j fake) agree on routing, holistic context, EMPI consolidation/no-merge, and
Part 2 restriction. Every red-team finding is closed and pinned by an adversarial assertion.

## 2026-09-02 — WPC FHIR→knowledge-graph ingestion hardening (R1 Part 2 segmentation · R2-B source-scoped identity + PIX/PDQ)

**Context:** loading whole-person FHIR R4 records through the existing ingestion pipeline into the knowledge
graph surfaced two core-safety defects (found by the coalition's spike + red-team, not by the green suite).
Scope of change: `src/lib/pipeline/adapters/{conditions,behavioralHealth}.ts`, `src/lib/identity/{mpiTypes,
matchEngine,empiResolver}.ts`, `src/lib/identity/external/*` (PIX/PDQ), `src/lib/pipeline/types.ts`, and the
associated identity/pipeline tests (incl. retargeted `tests/scenario/corpus_A_identity.test.ts`,
`tests/property/matchEngine.property.test.ts`).

**Coalition (architect design → SWE build → two adversarial red-team rounds):**

- **R1 — 42 CFR Part 2 segmentation integrity.** The `conditions` and `behavioralHealth` adapters both claimed
  `Condition`, so an F-coded (SUD/BH) Condition was double-owned and its `restricted` flag was projection-order
  dependent — a last-writer clear could disclose Part 2 data. Fix: both adapters now resolve the ICD-10 F-code
  **by system in ANY coding position** (`icd10FCoding`) and partition ownership exactly-one-owner (conditions
  skips F-coded; behavioralHealth skips coded-but-non-F; both keep coding-less → quarantined by both).
  - **Red-team R1-1 (closed):** a SNOMED-first / F-second dual-coded SUD Condition was silently dropped by BOTH
    (behavioralHealth read `coding[0]`). Fixed by by-system resolution + an adversarial fixture.
  - **Red-team H1 (closed, CRITICAL):** a dual-diagnosis with a NON-SUD F-code first + a SUD F-code second ran
    the Part 2 basis on the non-SUD code → disclosed. Fixed: the basis is evaluated over the SUD coding in ANY
    position (`icd10SudCoding`), never the display code. Fixture added (`conditionOwnershipR1.test.ts`).

- **R2-B — source-scoped enterprise identity (PHI-comingling fix) + PIX/PDQ external EMPI.** An MRN (source-
  LOCAL) was being used as a global deterministic key → two different people sharing an MRN across sources could
  false-merge. Fix (owner chose Option B): added `ScopedIdentifier`/`localId`; a new deterministic rule
  `localId-same-source-exact` (equal value AND equal assigning authority only); **demoted `name+dob-exact` out
  of the deterministic set** (identical name+dob now HOLDS for review, never auto-merges); `canonicalPersonKey`
  precedence global-id → same-authority local-id → name → record, with the assigning authority embedded in the
  anchor key. The IHE **PIX/PDQ** external-EMPI seam was completed on the existing `external/*` machinery
  (`setProductionPixPdqConfig`, `assigningAuthorityToScope`, gated by dataMode=production + external-pixpdq +
  config+transport; **fail-closed when unconfigured, zero network in tests**).
  - **Red-team L1 (closed):** naive `:`-delimited keys allowed a URI/OID authority to collide two distinct
    component-pairs → false merge. Fixed by escaping the delimiter inside every key component (`escKey`).
  - **Documented trades (accepted, not defects):** M1 — HCC risk-adjustment relevance is not carried on the
    behavioral-health path (no HCC codings in the seed; follow-up if BH HCC is needed). M2 — demoting name+dob
    HELDs demographics-thin EMR-only feeds; this is the deliberate Option-B safety trade (comingling > holding)
    and must be a conscious rollout decision. M3 — the source-scoping is exercised by unit tests but not yet
    populated by production adapters (`idScope`/`localId`); it is wired end-to-end in the fan-out ingest driver
    (subsequent WPC wave), which pre-resolves demographics and seeds the per-authority xref.

**Verification / DoD:** `tsc --noEmit` 0; full suite **2263 passing** (+1 expected-fail, 74 skipped; the only
skips are the Docker testcontainer integration files); **20/20 C9 domain count intact**; `empiResolver.ts`
309 < 400 line ceiling. Every red-team CRITICAL/HIGH finding (R1-1, H1, R2-1 MRN-as-global, L1) is closed and
pinned by an adversarial assertion.

## 2026-08-30 — Review-screen UX redesign (layout · research drawer · submit affordance)

**Owner feedback (from live browser use):** the Policy Encoding Review screen had three connected problems
— (1) rows rendered the full CPT descriptor inline with the controls pinned right, so the PAGE scrolled
sideways and the code + controls couldn't be seen together; (2) no way to RESEARCH a code ("just listed with
a bunch of others"); (3) the Submit button looked stuck (disabled until a small checkbox below ~45 rows).
Plus a doubled-code display ("43644 — 43644 —").

**Coalition (UI-architect design → SWE build → adversarial red-team):**
- **Root-caused the horizontal scroll** to a missing `min-w-0` on the workbench's `1fr` grid column
  (`PolicyDtrWorkbench.tsx`): a grid item defaults to `min-width:auto` and won't shrink below its content,
  so a truncating descriptor forced the page wider. Added `min-w-0`; controls are now `shrink-0`; the AI row
  uses `flex-wrap` so on the narrowest widths controls wrap under the descriptor instead of overflowing.
- **Per-code research drawer** (`EncodingReviewCodeDrawer.tsx`, NEW): the descriptor is an accessible
  disclosure (`aria-expanded`/`aria-controls`, `role=region`) that opens the full descriptor, the byte-anchored
  source excerpt (provenance), the plain-English section-of-origin (WHY it defaulted to Covered·PA — payer-
  agnostic), system/code/confidence, and an "Explain <code> in the assistant" button that seeds the Encoding
  Assistant (unidirectional prop + nonce, latest-`ask` ref → no re-fire loop). Threaded `source` (from
  `review.provenance`) + `sourceSection` (from `GuidelineCode`) into the procedure `ReviewElement`
  (`fromPolicyReview.ts`, `encodingReview.ts`). The AI-decided row is extracted to `EncodingReviewAiRow.tsx`.
- **Sticky action bar**: the footer is now `sticky bottom-0` with the acknowledgement checkbox moved in beside
  the real blocker ("1 step left: …") and the submit button — always visible. The gate logic
  (`submitReadiness`/`canSubmit`/fail-closed disable) is UNCHANGED; only the affordance moved.
- **Doubled-code fix** + shared pure helpers (`reviewRowText.ts`, NEW: `codeDescriptor` prints the code once,
  `ORIGIN_TEXT`) — DRY across the AI row, drawer, and needs-review row.

**Red-team cleared:** disposition `<select>` moved verbatim (value/onChange/aria/classes identical) — CRD
wiring intact; submit gate behavior unchanged (drawer is read-only, can't satisfy it); overflow fix is at the
shared grid item (all breakpoints) with no `overflow-x-clip` band-aid; disclosure is a real `<button>`, never
a row wrapping the interactive controls (no nested-interactive a11y break); assistant-seed effect depends only
on the nonce with an `askRef`, so message updates can't re-enter it; every file < 400 (panel 304, row 232,
new files 124/86/20, workbench 388, assistant 291). Note: the src components use `jsx:preserve`, which the
vitest transform can't import, so the row LOGIC is unit-tested (`reviewRowText.test.ts`: dedup, origin, the
provenance+section data threading) and the two render shells are E13-baselined; render behavior is verified in
the browser. Full suite green (2153, 0 fail); tsc/lint/sizes/E13/E14 clean.

## 2026-08-30 — PAS authoring bridge (the third artifact: CRD → DTR → PAS)

**Gap (owner close-out map, Tier 3):** the engine authored CRD + DTR but had NO PAS output — the third leg
of the chain the owner named. Architect trace found a RUNTIME PAS builder already exists
(`src/lib/pa/pasBundle.ts`, driven by a live PatientContext, using a loose `Record<string,unknown>` shape);
the authoring side needs its own preview/assembly that SHARES the FHIR types, not a third parallel shape.

**Change (architect design → SWE build → adversarial red-team-in-design):**
- New shared FHIR types `src/lib/fhir/pasTypes.ts` (`FhirClaim`, `FhirOrganization`, supporting) re-exported
  from `types.ts` (the `dtrPackageTypes` precedent), so authoring + runtime PAS can converge on one shape.
- New `src/lib/policy/pas/{types,specimenResponse,pasRequest}.ts` — the pure, deterministic builder
  `buildPasRequest(input)` over a discriminated union: `mode:'response'` (a real completed
  QuestionnaireResponse + patientRef) or `mode:'specimen'` (authored items → a SPECIMEN response via the
  real `buildQuestionnaireResponse` with EMPTY answers, so nothing clinical is fabricated and
  `missingForSubmission` lists what a real 278 would need). Assembles a self-contained Claim
  (use=preauthorization) + Patient + Coverage + Organization + Practitioner + QuestionnaireResponse Bundle;
  only PRIOR-AUTH-REQUIRED codes become `Claim.item` (never request preauth for a not-covered code); the
  davinci-pas profile is stamped ONLY in response mode (a specimen is `synthesized`/`conformanceAsserted:false`).
- New `PasPreviewPanel.tsx` + a third "Prior auth" tab in `GenerateArtifactsStage` (CRD | DTR | PAS), with an
  honest "specimen preview — not a conformance-tested submission" banner and a collapsible FHIR JSON view.

**Scope boundary (stated honestly):** authoring PREVIEW/assembly only — NO live X12-278 EDI transmission to a
clearinghouse (needs infra the payer controls). Shares TYPES with the runtime submission builder, not its code path.

**Verification:** pure/deterministic (injected `now`, derived ids — byte-identical output test); no fabricated
clinical data (specimen answers all unset; specimen Patient carries a `urn:rhtp:pas:specimen` identifier, never
a member id); not-covered/investigational codes excluded from the Claim. Full suite green (2140, 0 fail);
tsc/lint/sizes/E13/E14 clean; all files < cap (pasRequest 130, PasPreviewPanel 128, types.ts 366). New tests
`pasRequest.test.ts` (builder + specimen + response + determinism).

## 2026-08-30 — Code-table (Requirements By Product) path CRD parity

**Gap (owner close-out map, Tier 2):** the code-table path (product → procedure → code, e.g. Horizon)
emitted NO CRD coverage rules — its Generate stage was empty of coverage, and it had no coverage
disposition, so it was second-class vs the criteria path. (The related "NMN → not-covered rule" item was
already satisfied for the criteria path by the section-disposition work.)

**Change:** new `crd/codeTableCoverage.ts` builds CRD coverage rules for a code-table policy — every
enumerated code IS, by the table's own construction, a prior-authorization-REQUIRED covered procedure, so
each becomes a `covered · PA` rule (deduped across products) with a `covered-pa` default disposition. Wired
into the `code-table` branch of `processPolicyDocument`, which now returns `coverageRules` +
`questionnaireCanonical` + `dispositions` just like the criteria branch — so the maker's overrides reach
the published CRD via the SAME `projectCoverageRules` path (no parallel pipeline). Payer-agnostic (keys off
table structure); pure/deterministic. Horizon now yields 15 covered·PA rules (was 0).

**Verification:** full suite green (2135, 0 fail); tsc/lint/sizes/E13/E14 clean; `codeTableCoverage.ts` 44
lines, `policyReview.ts` 282 (< cap). New test `codeTableCoverage.test.ts` (unit dedup + real-Horizon
end-to-end). Note: the per-code disposition-OVERRIDE control in the code-table review UI
(`CodeTableReviewStage`) is a smaller follow-on — the confidence-flag review already covers code
correctness, and `covered · PA` is the correct default for a PA-requirements table.

## 2026-08-30 — Discrete documentation items + recover the silently-dropped BMI-band threshold

**Defect (owner, from the live workbench):** (1) all documentation evidence drained into ONE catch-all
"Attach clinical documentation" upload — the low-value pattern DTR exists to replace; (2) architect trace
found the comorbidity band ("BMI ≥ 35 WITH a qualifying comorbidity") had its `kind` overwritten
measure→choice in `encodeNode`, SILENTLY DROPPING the BMI ≥ 35 threshold from both the questionnaire and
evaluation — so "BMI 36 + a comorbidity" could not be distinguished from "BMI 36 alone".

**Coalition (architect design → SWE build → adversarial pass, tree-of-thought at each fork):**
1. **Discrete documentation items (payer-agnostic).** New `encode/documentation.ts` classifies a RESIDUAL
   attestation leaf that asks for evidence of a completed activity (generic cues: documentation/evaluation/
   clearance/education/treatment plan/attestation/… + a documentation-heading context), strictly AFTER
   measure/choice classification so an eligibility threshold or enumeration is never softened. Such a
   criterion (`kind:'documentation'`, new) emits a discrete item set via `fhir.ts docItems`: an attestation
   boolean (which STILL gates — it stays a BoolExpr leaf), its OWN targeted attachment gated on the
   attestation, and an optional typed datum — a completion `date`, an evaluating-provider `string`, or a
   named-complication `open-choice` built from the criterion's own tokens (obstruction/stricture/GERD/other).
   The generic catch-all in `engineQuestionnaireItems.ts` is now appended ONLY as a fallback (no discrete
   attachment present), so a policy with documentation criteria no longer forces a manual-review PDF dump; a
   policy without them is unchanged. Elevance CG-SURG-83 now yields 8 discrete evidence attachments, catch-all
   suppressed.
2. **Recover the BMI-band threshold.** `encodeNode`'s choice branch, when the node ALSO carries a measure,
   now KEEPS the measure and attaches the enumeration as a distinct CHILD choice (`${id}.comorbidity`) instead
   of overwriting kind. `fhir.ts critItems` renders a measure node's children (so BMI ≥ 35 AND the comorbidity
   choice both surface — distinct linkIds), and `evaluate.ts evalCriterion` requires them together (three-
   valued AND: BMI 36 + comorbidity → met; BMI 36 alone / comorbidity unanswered → unknown; comorbidity
   answered none → not-met; BMI 34 → not-met). Elevance now surfaces BOTH BMI thresholds (was 1).

**Scope boundary (stated honestly):** the fuller "BMI≥40 OR (BMI≥35 AND comorbidity)" *pathway-level* OR
auto-adjudication (leaf-replacement `crit.logic` + `groupExpr` expansion) was DESIGNED but deferred — it
depends on fragile one-of-N heading detection and would broaden the evaluation blast radius across every
nested-parent policy; deferred to its own batch rather than destabilize the heavily-tested engine now. The
shipped fix recovers the dropped threshold as a real, evaluable item (the visible defect), which is the safe,
contained correction.

**Red-team / verification:** documentation classification runs only on the residual-attestation case
(threshold/enumeration never reclassified); attestation booleans remain gating leaves (made more evaluable,
never dropped); measure-with-children is a NEW eval case (no existing measure node has children), so no
existing policy's evaluation changes; distinct linkIds avoid FHIR collisions; payer-agnostic (generic cues +
structure only). Full suite green (2125 tests, 0 fail); tsc + lint clean; sizes/E13/E14/E11 green; encode.ts
342, fhir.ts 342, evaluate.ts 362 (< cap). New tests: `documentationItems`, `comorbidityBmiGate`.

## 2026-08-30 — Reconnect review decisions into the generated CRD + section-inferred coverage defaults

**Defect (owner, from the live workbench):** at the Generate stage every harvested code showed CRD
`pending-review`, no matter what the human decided. Root cause (architect trace): `engineCoverageRulesForReview`
built each `ProcedureRule` with the coverage code OMITTED (honest "don't fabricate covered"), so every code fell
to role `referenced` → `pending-review`; and the two-list review + sign-off collected decisions that NEVER
re-flowed into the rules `GenerateArtifactsStage` renders (`review.coverageRules`, frozen at ingest). The
review was cosmetic w.r.t. published output.

**Coalition (architect design → SWE build → adversarial red-team, tree-of-thought at each fork):**
1. **Section-inferred defaults (payer-agnostic).** Codes are now tagged at harvest with the STRUCTURE they came
   from — `criteria.ts`/`criteriaCodes.ts` set `GuidelineCode.sourceSection` (`coding-appendix` |
   `requirements-table` | `inline-prose`, stronger-signal-wins on dedupe). `review/codeDisposition.ts`
   (`defaultDispositions`) infers a DEFAULT coverage disposition from the section + the not-medically-necessary
   statements (reusing `codeRouting.excludingStatement` + `classifyBasis`, now exported): a code in the policy's
   own code table → `covered-pa`; named in an investigational/NMN statement → `investigational`/`not-covered`;
   a bare prose mention → `pending`. NEVER `covered-pa` without a code-table tag. Keys off structure, never a
   payer name.
2. **One shared disposition truth table.** `crd/coverageDisposition.ts` (NEW) maps a `CodeDisposition` onto (a)
   the engine's ProcedureRule input (`dispositionToInput` — the engine stays the single coverage brain), and (b)
   the client projection (`applyDisposition`, idempotent). `coverageInfoFor` MOVED here (verbatim) so ingest and
   the client cannot drift. `engineCoverageRulesForReview` now accepts `dispositions` and seeds them from the
   defaults at ingest (`policyReview.ts`), so the 27-code Elevance case now arrives `covered · PA` instead of 27
   uniform pending-review. A not-covered/investigational code no longer re-attaches the DTR canonical the engine
   withheld (`wantsPathway` fix).
3. **Human overrides reach Generate.** `EncodingReviewPanel` renders a per-code coverage-disposition select
   (both the needs-review and AI-decided lists); `PolicyDtrWorkbench` holds the `dispositions` map (seeded from
   `review.dispositions`) and projects `review.coverageRules` through `workbench/generateInputs.projectCoverageRules`
   at the Generate stage — so the published CRD reflects the maker's decisions, not the frozen snapshot. The
   assistant dock was extracted to `workbench/AssistantDock.tsx` to keep the workbench under the size cap.

**Red-team cleared:** double-application (applyDisposition idempotent — fixed-point test); payer-agnostic
(defaults key only on structural section + generic negation matcher; test asserts no `covered-pa` without a
table tag); tsc narrowing (coverageInfoFor moved verbatim; disposition switches exhaustive with `never`;
sourceSection/props additive-optional so all call sites compile); size caps (new logic in new files; workbench
391→377 via extraction, panel 326, both < 400); fail-closed sign-off gate untouched (dispositions change WHAT
generates, never WHETHER). Projecting with the defaults reproduces the ingest rules byte-for-byte (consistency
verified). Full suite green (2119 tests, 0 fail); tsc + lint clean; E13/E14/E11/sizes green. New tests:
`coverageDisposition`, `codeDisposition`, `generateInputs`.

---

## 2026-08-29 — CRD honest coverage (general): no fake "Covered" + coded coverage-info

**Scope (core-logic paths):** `src/lib/policy/encode/ir.ts` (`ProcedureRule.coverageCode` now OPTIONAL — omitted = undetermined), `src/lib/policy/crd/engineCoverageRules.ts` (drop fabricated pre-review `coverageCode:'covered'`; add `coverageInfoFor`), `src/lib/policy/crd/coverageRule.ts` (`CoverageRule.coverageInfo` field). UI: `src/components/policy/workbench/GenerateArtifactsStage.tsx` (render `referenced` honestly + coverage-info pills). Test: `engineCoverageRules.test.ts` (re-pinned to the honest behavior).

**Problem:** the CRD table labelled EVERY code green "Covered" — a fabricated pre-review default (`coverageCode:'covered'`) indistinguishable from a real determination. Asserting coverage the policy/coding-map has not made.

**Design (GENERAL — not per-policy):** coverage is UNDETERMINED pre-review, so the code carries no `coverageCode`; the engine yields an honest `referenced` role with PA-required, and a Da Vinci `coverage-information` coding of `pending-review` (never `covered`). Real determinations (covered / not-covered / investigational / conditional) map to their proper coverage-info codings. Applies to every policy in the corpus; Horizon shows honest "Referenced — pending review", a policy with real determinations shows them. INVARIANT: never fabricate `covered`.

**Adversarial:** making `coverageCode` optional is safe — every use is a `===`/`!==` compare (undefined-safe) and the only `switch` has a `default → referenced`; full suite confirms. Per the payer's steer, this is a corpus-general fix, not a Horizon curation — to be validated on a cleaner (non-OCR) corpus policy next.

**Result:** mirror gate green — 377 tests, prettier + size ratchet clean. Delivered to device.

---

## 2026-08-29 — Production increment: LOINC-coded DTR items end-to-end

**Scope (core-logic paths):** `src/lib/policy/encode/fhir.ts` (MEASURE_LOINC map + `FhirItem.code`; attach coding in `measureItem`/`measureItemsMulti`), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (`fhirItemsToDefs` carries `code` + `answerOption` coding). Model: `src/lib/dtr/questionnaireResponse.ts` (`QuestionnaireItemDef.code` + `answerValueSet`; `QuestionnaireAnswerOption.coding`). UI: `src/components/dtr/QuestionnaireRenderer.tsx` (renders code + answerValueSet badges). Test: `tests/policy/measureCoding.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change adding terminology bindings to generated FHIR. Coalition required.

**Design (first production increment of the conformance work):** the engine's typed measures now carry their standard LOINC concept (BMI 39156-5, age 30525-0, systolic/diastolic BP, weight, height, HbA1c, glucose, eGFR, lipids, LVEF); the translation stops dropping `valueCoding.system`; the item model gained `code`/`answerValueSet`; the renderer shows the codes. INVARIANT: a field is coded only when a well-established LOINC concept exists — unmapped fields stay uncoded (never fabricated). Reuses the whole existing pipeline (engine → fhirItemsToDefs → renderer), no parallel generator.

**Adversarial:** LOINC map is a curated, well-known concept set (not runtime-invented). Choice `answerValueSet` binding + CRD `coverage-info` per code remain follow-ups; the OCR criteria-quality problem (run-on/duplicated criteria in the scanned bariatric doc) is a separate extraction concern not addressed here — coding a garbled criterion still leaves garbled text, so extraction cleanup is tracked as the next dependency.

**Result:** mirror gate green — 377 tests (374 + 3), prettier + size ratchet clean. Delivered to device. Proven target: `/policy-engine/conformance-demo` (the fully-conformant slice).

---

## 2026-08-29 — Da Vinci CONFORMANCE SLICE (CPT 43775): coded CRD + value-set-bound DTR

**Scope (core-logic paths):** `src/lib/policy/dtr/conformance/valueSets.ts` (new — curated FHIR terminology), `src/lib/policy/dtr/conformance/bariatricSlice.ts` (new — CRD coverage-info card + DTR R4 Questionnaire builder). UI: `src/app/(reviewer)/policy-engine/conformance-demo/page.tsx` (browser-testable demo route). Test: `tests/policy/bariatricConformanceSlice.test.ts`.

**Trigger:** new modules under `src/lib/policy/**` producing a coverage/medical-necessity artifact. Coalition required.

**Why:** the running engine produces prose, not coded FHIR — no `answerValueSet`, no ICD-10/LOINC/SNOMED/CPT `Coding`, no CRD `coverage-info`. User (correctly, per the Da Vinci CRD/DTR IG examples) required coded, value-set-bound artifacts. This is the agreed ONE-code vertical to prove the process before scaling.

**Design:** a payer authors the terminology (curated value sets: yes/no/unknown, obesity ICD-10/SNOMED, comorbidity, LOINC BMI, CPT) — the deterministic engine never fabricates codes. The builder binds to it: CRD card (cardType `coverage-info`, indicator `warning`, coded coverage classification, SMART link with `appContext.questionnaire`) and a DTR R4 Questionnaire (grouped, `item.code` LOINC/SNOMED, choices bound to `answerValueSet`, SDC `initialExpression` pre-population, `enableWhen` conditional). INVARIANTS: CRD link canonical === DTR Questionnaire.url; every coded concept carries a real system.

**Adversarial:** the codes are AUTHORED/curated, not extracted — honest (a payer maintains its coding map) and does not claim the extractor invented them. Slice is self-contained (not yet wired into the live GenerateArtifactsStage pipeline) — deliberately, so the target is proven and measurable before integration. Follow-up (the "enhance & complete" phase): extend the production models (`QuestionnaireItemDef`, `CoverageRule`) to carry these bindings, map all 21 codes + the full criteria set, wire the renderer.

**Result:** 374 tests (365 + 9 conformance assertions), prettier + size ratchet clean; demo route renders live at `/policy-engine/conformance-demo` (browser-verified: coverage-info card, answerValueSet, LOINC/ICD codings, enableWhen).

---

## 2026-08-29 — DTR questionnaire omits coverage EXCLUSIONS (no "check an exclusion" items)

**Scope (core-logic path):** `src/lib/policy/encode/fhir.ts` (`toQuestionnaire` — skip exclusion criteria when emitting Questionnaire items). Test: `tests/policy/questionnaireExclusions.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change touching a medical-necessity/coverage surface (what a DTR asks the provider to attest). Coalition required.

**Problem (found by investigation, tree-of-thought + adversarial):** the authoring Generate stage rendered exclusion/investigational statements ("…is considered investigational", "…does not meet …criteria for coverage") as attestation checkboxes. Root cause: criteria classification is heading-based (`extract/criteria.ts`), so inline exclusion sentences under a medically-necessary region leak into `cp.medicallyNecessary`; the engine then emits a Questionnaire item for every leaf criterion, exclusions included. A provider cannot meaningfully "check" an exclusion — it asserts the opposite of coverage.

**Design (leverage, not duplicate):** filter at the ONE questionnaire seam (`toQuestionnaire`) rather than re-classifying at extraction (which would ripple into evaluate/CRD/tests). Reuse the existing negation signals — `EncodedCriterion.negate`, `Measure.negatedLocally`, and `isNegationHeading` — broadened by a few exclusion phrases ("does not meet", "not eligible", "is/are excluded", "considered cosmetic"). INVARIANT: an exclusion criterion is never emitted as a Questionnaire item; it STAYS in the criteria registry so evaluation + CRD still see it — only the DTR questionnaire omits it.

**Adversarial:** false-positive risk on positively-phrased negation ("has not undergone prior surgery") — mitigated because the detectors are coverage-specific ("not medically necessary / investigational / does not meet criteria"), not general negation. Positive concurrent-procedure statements ("concurrent cholecystectomy is considered medically necessary") are NOT filtered — they are legitimately answerable DTR questions. Empty pathway (all-exclusion) degrades to population-only, no crash.

**Result:** mirror gate green — 365 tests (363 + 2 new), prettier clean, size ratchet ok (fhir.ts 247 lines). Delivered to device. Follow-ups (separate): value-set/coding binding on `QuestionnaireItemDef` (carry `valueCoding.system`, add `answerValueSet`); clinical grouping + EHR pre-population in the renderer; CRD|DTR tabs in `GenerateArtifactsStage`.

---

## 2026-08-29 — Encoding-review code ROUTING (honest per-code signal, no fabricated disposition)

**Scope (core-logic paths):** `src/lib/policy/review/codeRouting.ts` (new), `src/lib/policy/review/encodingReview.ts` (additive `routing?` field on `ReviewElementInput`), `src/lib/policy/review/fromPolicyReview.ts` (wire `routing` through the procedure elements + `CodingMapContribution`). UI consumer: `src/components/policy/EncodingReviewPanel.tsx` (grouping only).

**Trigger:** core `src/lib/policy/review/**` change + new module + a coverage/medical-necessity-adjacent surface (procedure-code disposition). Coalition mandatory.

**Problem:** the review screen showed every procedure code with the identical generic "Assign coverage role (covered / not-covered / investigational)" line — no signal. Root cause: `deterministicCodingMap` deliberately proposes no role (it "cannot invent coverage decisions"); the AI coding-map path is unconfigured in the demo.

**Architect design pass:** rather than propose a disposition, derive a *routing hint* — WHERE each code's evidence sits — from the one honest, provenance-anchored structural signal (`review.notMedicallyNecessary[]`). Codes named (word-boundary) in an exclusion/investigational statement route `excluded` with the statement as provenance + a `classifyBasis` basis; all others route `assign`. Additive model field; `deterministicCodingMap` left byte-identical (its defect pins stay green); UI groups the queue by routing so it isn't a wall of identical rows, stating the "assign role" instruction once per group.

**Adversarial BEFORE coding (payer-UM SME + encoding specialist — NO-GO on the first design, then revised):**
- The ORIGINAL proposal (auto-label each code "Covered · PA required" from code-in-guideline membership) was **NO-GO**: the extractor's `guidelineCodes` is a flat, context-free harvest, so "member of the covered set" does not exist as data; asserting coverage would be a fabricated determination, would anchor the maker (automation bias), and — by replacing the blocking `verify` flag — would let codes silently leave review via `bulkAcceptCleanExplicit` / the 60% `canSubmit`. "PA applies ⇐ policy has criteria" was also rejected (gold-carding, statutory carve-outs, site-of-service, benefit exclusion).
- Design revised to meet the adversarial's conditional-GO: routing NEVER sets `role`; every routed code `requiresAssignment: true` and keeps its blocking flag (cannot be bulk-accepted); fail-safe to `assign` on any missing/ambiguous signal; no PA assertion; `excluded` only from an explicit negation/exclusion statement, carrying that statement as provenance.

**Adversarial AFTER coding (INVARIANTs pinned as tests):** `tests/policy/codeRouting.test.ts` (8 tests) pins: excluded routing carries provenance + basis and never a `role`; word-boundary matching (43644 ≠ 436440/143644); a non-negation prose mention does NOT route excluded; benefit-exclusion vs investigational basis; empty inputs → `{}`; every routed code `requiresAssignment`. INVARIANT comments in `codeRouting.ts` mark the fail-safe and no-coverage-decision rules.

**Result:** mirror gate green — 363 tests pass (355 prior + 8 new), prettier + size ratchet clean, app compiles (`next dev`). Delivered to device.

**Honest limit:** for a policy whose codes are all in the coding list with no per-code exclusion statements, all codes route `assign` (one group) — differentiation appears only where the policy itself distinguishes codes. Richer per-code dispositions require the AI coding-map path (endpoint + key), which stays out of scope here. Full `PROMPT_MASTER_LOG.csv` provenance rows to be appended in the provenance close-out.

---

## 2026-08-28 — Clinical measure encoder: enterprise hardening

**Scope (core-logic paths):** `src/lib/policy/encode/{measure,measureScan,dimensions,dimensionResolve,encode,evaluate,fhir,time,ir,index}.ts`, `src/lib/policy/review/{fromPolicyReview,encodingReview}.ts`.

**Trigger:** core `src/lib/policy/**` change + new modules + new capability + touches fail-closed
defaults and a medical-necessity/eligibility decision. Coalition mandatory.

**Architect design pass:** field↔unit↔range dimension registry; clause-scoped field resolution
(field noun resolved at sentence scope, operator/value/unit in a tight local window); band-aware
parsing (ranges never shattered); fail-safe range gate (flag, never silent-drop); local polarity
detection; multi-measure per criterion wired through evaluate + FHIR + review.

**SWE implementation plan:** modular layout to keep every file ≤ 400 lines (`dimensions.ts`
registry split from `measure.ts`); back-compat shims (`parseScalarMeasure`/`encodeMeasure`) so the
existing suite stays green; explicit preserved-test list; per-defect regression pins.

**Adversarial BEFORE coding (two lenses — NO-GO):**
- Engineering/regression: silent range-drops flip eval outcomes; `measures[0]` reordering breaks the
  range tests; compound-BP regresses to scalar; threshold-variant attaches to the wrong field;
  half-wired multi-measure = false coverage. → design revised (bands-first, compound-BP preserved,
  flag-not-drop range gate, variant-by-field, multi-measure fully wired).
- Clinical/extraction: comma-clamped windows drop the modal "BMI, …, of at least 40 kg/m²"; the "or"
  clamp kills "40 or greater"; per-comparator scan shatters "35 to 39.9"; polarity inversion on
  "not medically necessary". → clause-scoped field resolution + postfix-atomic + bands-first + polarity flag.

**Adversarial AFTER coding (post-implementation — NO-GO, then fixed + pinned):**
- CRITICAL: `negatedLocally` was a dead flag → an exclusion evaluated as a positive eligibility gate
  (false approval). Fixed: encode raises a reviewFlag so it can never auto-approve. Pinned.
- HIGH: phantom same-field measure → duplicate FHIR linkId. Fixed: unit-owner precedence + same-field
  dedupe + index-based linkIds. Pinned.
- MEDIUM: compound BP bypassed the range gate. Fixed: routed through the gate. Pinned.
- LOW: word-numerals > twenty dropped silently. Fixed: extended + flag on unresolved. Pinned.

**Result:** mirror gate green — tsc clean, 355 tests, prettier + eslint clean. Delivered to device;
size ratchet passes. Tests: `tests/encode/measure.{registry,hardened,defects}.test.ts`,
`tests/policy/encodingReview.test.ts`.

**Note:** this entry is retroactive — the coalition was run before this protocol existed; logging it
here both records it and seeds the log the `g_coalition` gate now requires.

---

## Entry: DTR terminology-resolution layer — Phase 1 (inline/offline)

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — DTR choice items must bind to authoritative FHIR ValueSets ("propose the concept; the terminology infra establishes the code/value-set binding"); build a resolution layer, general across the payer corpus (Horizon, Elevance/Anthem, Aetna, UHC, state Medicaid), not a per-policy lookup.

**Architect verdict:** Proceed — additive, low-to-medium risk. Four corrections folded in:
1. Engine value-set `concept` is SYNTHETIC (`"<id> options"`, encode.ts:150) → the registry resolves off item heading text + option displays, not `concept`, and returns `undefined` unless confident (fail to "unset" = the prior behaviour = safe no-op).
2. `codingMap.ts` lives at `src/lib/policy/review/` — provider/selector/config pattern mirrored (`select* + *ConfigFromEnv + NotConfiguredError`).
3. Carrier fields (`QuestionnaireItemDef.code/.answerValueSet`, `answerOption.coding`) already existed — nothing thrown away.
4. Only the hydrate pass may be async; the sync generators stay pure.

**Deviation from the literal plan (architect-flagged concern, risk-reducing):** resolver placed in the DTR adapter layer (`engineQuestionnaireItems.fhirItemsToDefs`) rather than `encode/choiceItem`, so the `encode/` engine (`fhir.ts`) is UNTOUCHED — avoids the `encode → dtr` import the architect flagged as an engine-cleanliness risk. Same user-visible result (renderer already shows the `answerValueSet` pill). Registry decoupled from `encode` via a plain `ConceptSignal` (text + option displays), so `terminology/**` imports no engine types.

**Files:** new — `src/lib/policy/dtr/terminology/{registry,expansion,vsac}.ts`, `tests/policy/terminologyGolden.test.ts`; edited — `src/lib/policy/dtr/conformance/valueSets.ts` (+`ALL_VALUE_SETS`/`VS_BY_URL` inline corpus), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (resolve → `answerValueSet`; opt-in async `hydrateExpansions`).

**Invariants asserted (golden corpus, 18 tests):** unconfident/ambiguous → `undefined` (exactly-one-match rule; negative cases); CPT + `urn:rhtp:*` never leave the inline provider even when VSAC is "configured"; VSAC gated (`VsacNotConfiguredError`, no network offline); hydrate is fail-safe (never blanks options on miss/throw); sync generators stay non-Promise; NO payer-specific branch in `terminology/**` (keys on clinical concepts + code systems only).

**Gate (mirror, green):** vitest 395/395; tsc clean on all changed `.ts`; prettier clean; eslint clean (tests/policy). Sizes: all prod < 400, test < 500. Testlink: all three new modules imported by `terminologyGolden.test.ts` (real coverage incl. the VSAC gated-throw branch) — no testlink-baseline row needed; the VSAC network-success branch does not exist yet (Phase 2).

**Delivery:** written to working tree on `main` (uncommitted, staged for review). Device pre-commit (prettier + sizes + testlink) to confirm on commit.

---

## Entry: DTR terminology-resolution — Phase 3 (corpus expansion + generality proof); Phase 2 → roadmap

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — complete Phase 3, prove generality across payers/domains; stay inline (record live VSAC as roadmap).

**What changed:**
- `valueSets.ts` corpus 3 → 6, spanning TWO payers and THREE clinical domains: added `VS_CARDIAC_ARRHYTHMIA` (ICD-10 I47/I48 + SNOMED) and `VS_ABLATION_CPT` (CPT 93650/93653/93654/93656) grounded in **Aetna CPB 0165 (Cardiac Catheter Ablation & Radioablation)** — a different payer and specialty from the Horizon bariatric seed — plus a cross-cutting `VS_TOBACCO_STATUS` (SNOMED status codes).
- `registry.ts` +2 conservative rules (arrhythmia, tobacco). The ablation **procedure** (CPT) set is deliberately rule-less — a procedure is a coverage code, not a DTR answer, and an "ablation" rule would collide with real arrhythmia headings ("catheter ablation for the following arrhythmias …"). It stays corpus-only (expandable + inline-routed).

**Generality proven (golden corpus now 25 tests):** the SAME engine + resolver bind a cardiac arrhythmia choice end-to-end with zero payer/domain-specific code (`engineQuestionnaireItems` on a clean cardiac policy shape → `answerValueSet = …/cardiac-arrhythmia`, and NOT a metabolic set); cardiac ↔ metabolic never cross-bind; the CPT-bearing cardiac set stays inline even with VSAC "configured"; corpus spans ICD-10 + SNOMED + CPT; exactly-one-match safety holds across all 5 rules (procedure-shaped options → unset). No Horizon or payer name anywhere in `terminology/**` or the engine.

**Gate (mirror, green):** vitest **402/402**; tsc clean on all changed `.ts`; prettier + eslint clean; sizes — valueSets 180, registry 137 (prod < 400), golden test 302 (< 500).

**Roadmap (deferred, not built):** **Phase 2 — live VSAC `$expand`.** Committed posture is INLINE-ONLY: the `vsac.ts` provider + `selectExpansionProvider` routing seam are in place but inert (throws `VsacNotConfiguredError`; never selected unless `VSAC_ENDPOINT` + `VSAC_API_KEY` are set). Activating it is a future item — wire the UMLS/VSAC `$expand`, keep CPT + `urn:rhtp:*` inline. No code change needed elsewhere to turn it on.

**Delivery:** written to working tree on `main` (uncommitted, staged for review).

---

## Entry: Choice-detection fix — one-of-N + open enumerations become bound value-set choices

**Change class:** core `src/lib/policy/encode/**` + terminology (additive/behavioral). **Trigger:** on the real Elevance CG-SURG-83 policy the workbench Generate step produced 23 items with `choices=0, bound=0` — every "one of the following …" list flattened into booleans with dangling "; or", and the terminology layer was starved (no choice items to bind).

**Root causes (found by reproducing the pipeline on the real fixture, not the screen):**
1. `detectChoiceMin` only matched "one or more of / at least one of / any of the following" — it MISSED "one of the following" (the most common payer phrasing) and open enumerations ("including but not limited to"). So B (5 procedures) and the comorbidity lists never became choices.
2. Once they were choices, the resolver still returned `undefined` on the comorbidity list: the diagnosis rule fired on `obes`+`morbid` where "morbid" came from "co-**morbid**", and the comorbidity rule looked for "comorbid" (closed) while Elevance writes "co-morbid" (hyphenated) → two rules matched → ambiguous → unbound.
3. Option labels bypassed `clean()`, so "; or" litter stayed on the answer options.

**Fixes:**
- `encode/valueset.ts` `detectChoiceMin`: recognize "one of the following"; check "all/each of the following" FIRST so an AND list is never mis-read as one-of-N.
- `encode/encode.ts`: build a choice for a FLAT option list that is a one-of-N OR an open enumeration (`isOpenSet`); a node whose options themselves have children RECURSES (nested content preserved → inner comorbidity choice forms instead of being dropped).
- `dtr/terminology/registry.ts`: diagnosis rule anchored on the PHRASE "morbid obes…" (never bare "morbid"); comorbidity rule matches "co-?morbid" (both spellings).
- `encode/fhir.ts` `choiceItem`: run option displays through `clean()` (trailing "; or"/"; and"/";"/":" trimmed) — display only; sourceText stays verbatim for provenance.

**Proof (Elevance CG-SURG-83, reproduced end-to-end):** items 23→16, `choices 0→3`, `bound 0→2` — the 5 procedures collapse into one choice; BOTH comorbidity lists resolve to `answerValueSet=obesity-comorbidity`; option labels de-littered.

**Gate (mirror, green):** vitest **404/404** (added 2 regression tests pinning "one of the following" → choice and hyphenated "co-morbid" → obesity-comorbidity); tsc/prettier/eslint clean; sizes valueset 64, encode 285, fhir 298, registry 141 (all < 400). No legacy-path regressions (`detectChoiceMin` is engine-only).

**Known residue (separate seam, extraction boundary — NOT this fix):** a couple of section headings still bleed into an item ("…Reoperation", "…* Revision/…") and one revision run-on remains; deferred to the extraction-quality seam.

**Delivery:** working tree on `main` (uncommitted, staged for review).

---

## Entry: Authoring workflow UX — sign-off gating + honest submit footer (browser-diagnosed end-to-end)

**Change class:** core `src/lib/policy/workflow/**` + `review/**` + two workbench components. **Trigger:** driving the authoring flow end-to-end in the browser on the Elevance preset surfaced two defects the unit tests didn't (they proved the lifecycle is correct in isolation).

**Defect 1 — illegal-transition on approve.** `isStageUnlocked('signoff')` required only `hasPromotableDoc`, so the stepper let you jump to the checker-approve stage before the maker submitted; `checkerApprove` then hit `in-review → approved` ("✕ illegal transition"). The lifecycle itself was already fail-closed (a wrapper test pins it) — the gap was stage-gating.
- Fix: `isStageUnlocked('signoff') = hasPromotableDoc && submitted`, mirroring the existing generate/promote-until-approved lock. Reuses the lock pattern; no new machinery. Tests updated to pin the corrected gating (signoff locked until submitted; furthestUnlocked/resolveActiveStage follow).

**Defect 2 — footer label lied.** The review footer showed "Ready for maker sign-off" whenever `openDefects===0`, but the Submit button is disabled until `decided ≥ 60%` — so at 40% decided the label and the gate disagreed.
- Fix: expose the canonical threshold as `ReviewProgress.minDecided` (single source of truth, reused from the same `Math.ceil(total*fraction)` that drives `canSubmit`) and make the footer show `Decide N more to submit · decided/total` until `canSubmit`. No duplicated constant.

**Verified live (browser, Elevance CG-SURG-83):** Ingest → Review (45/45 decided) → Submit → Sign-off → **Approve with no illegal-transition** → Generate: 27 CRD coverage rules + 16 DTR items, comorbidity choices carry the `answerValueSet` pill. Full authoring chain green end-to-end.

**Gate (mirror):** vitest 404/404; tsc/prettier/eslint clean; sizes under cap.

**Known residual (extraction seam, deferred to hardening — NOT this fix):** two section headings still bleed into DTR items ("…surgery. Reoperation"; "…GERD). * Revision/ conversion indications…") because a criterion region isn't terminated at an unmarked following heading/note — same defect class as the tested evidence-appendix boundary.

**Delivery:** working tree on `main` (uncommitted, staged for review). Components (IngestStage preset, EncodingReviewPanel footer) delivered directly — outside the mirror's vitest scope, verified in the browser.

---

## Entry: Extraction boundary — criterion no longer absorbs a following heading or footnote (authoring complete)

**Change class:** core `src/lib/policy/extract/criteriaParse.ts` (the marker/nesting parser). **Trigger:** the two DTR heading-bleeds seen live on Elevance CG-SURG-83 ("…undergoing bariatric surgery. **Reoperation**" and "…documented GERD). **\* Revision/ conversion indications apply…**").

**Root cause:** `parseCriteria`'s continuation branch folds ANY non-marker line into the deepest open criterion. So a standalone section heading ("Reoperation", the label of the next determination) and a footnote line ("* Revision/…") were appended to the preceding criterion.

**Fix (two tight, general boundaries; reuses the existing group-start predicate):**
- A footnote line (`^[*†‡§]␠`) is a policy note, never criterion text — not folded.
- A SHORT standalone heading (≤40 chars, ≤3 words, title-case, no sentence-ending punctuation) whose NEXT meaningful line opens a determination (`isGroupStartLine`, factored out and shared with the region opener) is a section label — skipped, so it doesn't bleed onto the last item. Guarded tightly so a genuinely wrapped fragment is never dropped; the two determinations still split into two groups (heading skipped, not lost).

**Adversarial/red-team:** the lookahead skip fires only when the line looks like a heading AND the next line opens a determination — a lowercase sentence-fragment continuation (e.g. "documented within 6 months") is never dropped; a footnote skip can only remove a note, never criterion content.

**Gate (mirror):** vitest **405→407** (added `criteriaBoundary.test.ts`, 2 cases); the whole 400+ extraction suite (criteria/extract.*) stays green — no regression. tsc/prettier/eslint clean; file 162 lines (< 400).

**Verified live (browser, Elevance):** full chain reload → review → submit → approve → Generate; both DTR items clean, `bleedsRemaining {reoperation:false, revisionNote:false}`.

**Authoring status: COMPLETE.** Choice binding, Elevance preset, sign-off gating, honest submit footer, and extraction boundary all delivered + gated + browser-verified end-to-end. Next phase: CRD → DTR → PAS runtime.

**Delivery:** working tree on `main` (uncommitted, staged for review).

## 2026-08-29 — Comorbidity/documentation boundary: investigation + regression lock

**Trigger:** live browser showed the obesity-comorbidity DTR choice carrying 9 options — 4 true
conditions (diabetes, cardiovascular disease, hypertension, cardio-pulmonary) plus 5 DOCUMENTATION
criteria (weight-loss-program history, inadequate weight loss, pre-op evaluations, pre-op education,
treatment plan). Directive: bind only true conditions, but ensure the documentation criteria are still
captured as their own items, and ensure the fix generalizes.

**Finding (reproduction-driven, adversarial):** the CURRENT source is already correct. Running the real
pipeline (pdfIntake → extractCriteriaPolicy → engineQuestionnaireItems) on Elevance CG-SURG-83 in a
clean environment emits the comorbidity choice with EXACTLY 4 condition options bound to
`urn:rhtp:dtr/ValueSet/obesity-comorbidity`, and the 5 documentation criteria each as their own separate
boolean items. `criteria.test.ts` corroborates the extraction tree (C.2 = 4 comorbidities, D = 5
documentation items as a distinct top-level criterion). The "9 merged options" observed in the browser
was a STALE dev bundle (same class as the WorkQueuePage `slice`-of-undefined phantom seen earlier this
session, whose guard is already committed). No code defect; the encode `flatOptions` recursion fix from
earlier this session is what keeps C.2's value set to its own 4 children.

**Locked:** added `tests/policy/comorbidityDocumentationBoundary.test.ts` — a payer-agnostic synthetic
case (open-set comorbidity sub-list + a separate documentation branch) AND the real Elevance golden,
each asserting (a) the comorbidity value set contains only conditions (no documentation phrase leaks
into any choice option) and (b) each documentation criterion surfaces as its own non-value-set-bound
item. Full policy+dtr suite green in a clean run (269 tests + 3 new). Test-only change: E13 (changed
src empty), sizes (131 < 500 test cap), types clean.

**Generality probe (tip-of-the-iceberg):** ran the same probe over the other fixtures. `horizon.pdf` and
`sample-pa.pdf` are NOT medical-necessity criteria policies — they are PA-requirement / code-list
documents ("All items below require prior authorization" + CPT tables), so 0 criteria is CORRECT. BUT
both yielded 0 harvested CODES from their CPT tables — a real, separate gap on the CRD/code-extraction
side (not the comorbidity class). Logged for prioritization; not fixed in this pass.

## 2026-08-29 — Demo hardening: assistant BYO-key, graceful promote, requirement-table code harvest

**1) Encoding Assistant "bring your own key" (session-only).** Added a first-step config in the
assistant rail: the demonstrator enters `AI_CODING_ENDPOINT` + `ANTHROPIC_API_KEY` to switch from the
deterministic offline path to the live LLM. Key handling is SESSION-ONLY — held in React state, sent
per-request to our own BFF, never written to storage, never logged, cleared on refresh/disconnect. The
BFF route (`/api/policy/assistant`) now prefers request config over the env gate and still fails safe to
the deterministic answer. Files: `EncodingAssistantPanel.tsx`, `api/policy/assistant/route.ts`.

**2) Graceful promote — "queue for next release".** Replaced the unrealistic "✓ Promoted — live for the
tenant" with an operational release conclusion: a new pure module `workflow/release.ts` stamps a
calendar version, queues the next monthly release window, sets an effective date = window + provider-
notice period (default 60d), files a deterministic change-record id, carries the maker/checker sign-off,
and lists the stakeholder queues the change WOULD notify (modeled, labelled "queued" — never faked as
sent). The workbench renders a release-summary card with a rollback affordance (honest copy: a published
version is immutable; rollback opens a new change). Unit-tested (`release.test.ts`, 5 cases, clock-injected
deterministic). Files: `workflow/release.ts`, `PolicyDtrWorkbench.tsx`.

**3) Requirement-table code harvest (generality).** Closed the gap where PA-requirement/code-list policies
(horizon.pdf, sample-pa.pdf) harvested 0 codes. Added a requirements-table pass to `criteriaCodes.ts`:
inside a PA-requirements / CPT-HCPCS-table context it harvests EVERY valid code per line — handling leading
row indices ("1 43770 …"), many codes per line ("93451, 93452, 93453"), and wide table headers — with
CPT-range / HCPCS-format validation. Fail-closed: no context ⇒ no harvest, so prose 5-digit numbers are
never fabricated into codes; context closes at References/Rationale. Result: horizon 0→15 codes, sample-pa
0→7 (incl. E-series DME HCPCS), Elevance unchanged at 27. Payer-agnostic test `requirementTableCodes.test.ts`
(4 cases incl. the false-positive guard). Full policy+dtr suite green (278 tests) in a clean run.

All changes verified in a clean cloud reproduction (device vitest can't run — node_modules carries Windows
native bindings, device shell is Linux). gate:push + commit are user-side on Windows.

## 2026-08-29 — DTR determination sections (fix: two pathways read as duplicates)

**Defect (UX, confirmed in browser):** a policy with 2+ medical-necessity determinations (Elevance
CG-SURG-83: initial surgery + revision/reoperation) generated a DTR questionnaire that FLATTENED both
pathways into one undifferentiated list — so the second pathway's BMI/comorbidity/documentation items
looked like duplicated questions and undermined reviewer trust.

**Fix:** the pathway now carries the determination heading (`Pathway.label`, set in `encode.ts` from the
group heading; surfaced as the group text in `fhir.ts`). `fhirItemsToDefs` emits one non-answerable
`display` section header per top-level pathway group — but ONLY when the policy has 2+ determinations, so
single-determination policies are unchanged. A new `display` QuestionnaireItemType renders as a titled
section divider (`QuestionnaireRenderer`) and is excluded from the QuestionnaireResponse and from
required/valid accounting (`questionnaireResponse.ts`). The Generate-stage DTR tab count counts only
answerable items (so "Questionnaire 16" is unchanged though 2 headers were added → 18 total).

**Result:** Elevance now renders two titled sections — "Gastric bypass … medically necessary when all of
the following are met" and "Surgical repair/correction or reversal …" — each with its own items. New
regression test `dtrPathwaySections.test.ts` pins: 2+ determinations ⇒ one titled header each (colon
trimmed, non-answerable); a single determination ⇒ no header. Full policy+dtr suite green (280 tests) in a
clean run; types clean.

## 2026-08-29 — Review split into two lists (human exceptions vs AI-decided)

**Change (UX + model):** the Encoding Review stage no longer dumps all 45 items in one queue. `encodingReview.ts`
adds `reviewBucket()` (needs-review vs ai-decided), `acceptAiDecided()` (pre-accepts AI-decided items), and
`submitReadiness()` (gate = no open defects AND every exception decided). "Needs your review" holds genuine
exceptions — defect/ambiguous flags, codes named in a not-medically-necessary/investigational statement
(`routing.bucket==='excluded'`), and human-gated documentation. "AI-decided" holds everything the AI resolved
(clean explicit + AI-mapped codes, per product decision), pre-accepted and collapsed for sample-check; any row
reopens. The panel adds an explicit "I've reviewed the AI-decided items" acknowledgement; the editor submits the
WHOLE policy for maker→checker sign-off — nothing generates CRD/DTR on the AI's say-so alone. Existing
`reviewProgress`/`needsReview`/tests unchanged (new functions added alongside). New test `reviewTwoList.test.ts`;
full policy+dtr suite green (283). Types + lint clean. Panel 280 lines (< cap).

## 2026-08-29 — General-purpose hardening (architect + SWE + red-team coalition)

**Question (owner):** the engine must be general-purpose for ANY payer/state policy — a payer name should have no meaning in the code beyond the sample, unless we deliberately want per-payer adapters. Architect review VERIFIED the live authoring path (route → processPolicyDocument → extractCriteriaPolicy/extractStructuredPolicy → encode → review → DTR/CRD) is payer-agnostic: the only fork is structural (`/Requirements By Product/` → code-table, `/Medical(ly) Necess/` → criteria); zero payer-name branching in encode/dtr/crd/review. Payer names survive only as (a) provenance comments grounding reference value-sets, (b) the demo sample-loader.

**Changes (coalition: architect design → SWE build → adversarial red-team → fix):**
1. **PolicyProfile seam** (`profile/policyProfile.ts`, NEW) — the sanctioned optional per-payer/state extension: `detect` + `normalizeText` (INPUT pre-normalization only), a generic identity default, registry + selector, mirroring the terminology-expansion and coding-map provider seams. Wired as the first step of `processPolicyDocument` (identity by default ⇒ general path byte-for-byte unchanged). Test `policyProfile.test.ts`.
2. **Silent under-extraction guard** (`policyReview.ts`) — a substantial document (bodyChars>6000 or ≥3 necessity cues) that yields ≤2 TOTAL (nested) criteria now pushes a warning, surfaced as an amber "⚠ warnings" chip on the doc card + the review warnings box — a thin/prose extraction can no longer masquerade as fully authored.
3. **Legacy payer-classifier quarantined** — `extract/{index,fields,segment}.ts` (aetna-cpb vs pa-list classifier, off the authoring path, still test-covered) carry LEGACY/do-not-wire banners; `ingest/{aetnaCpb,uhcPaList}.ts` relabeled as mock-corpus seed adapters. Physical deletion deferred to a dedicated refactor-only change (mass test/baseline churn would otherwise risk the push gate).
4. **Assistant floating dock** (`PolicyDtrWorkbench.tsx`) — narrow screens (<lg) get a toggleable bottom-LEFT dock (clears the global Demo Navigator) instead of a buried bottom-stacked panel; sticky right rail retained on lg+.
5. **tsc fix** (`dtrPackageTypes.ts`) — added `display` to `FhirQuestionnaireItemType`, repairing a latent `check:types` break introduced by fix #1's `display` item type (caught by red-team). 

Red-team also cleared: param-reassign (no rule), guard false-positives (now counts nested criteria), fragment balance (removed the fragment entirely — dock nested in grid; 0 prettier warnings), two assistant instances (independent state, one visible per breakpoint). 287 policy+dtr tests green; tsc + lint clean; workbench 391<400.

## 2026-08-30 — Research-drawer source excerpt widened to a usable context window

**Question (owner):** on the redesigned Encoding Review, the per-code research drawer's "Source excerpt
(from the policy)" showed only ~three words either side of the code (`"…ux limb 150 cm or less) 43645
Laparoscopy, surgical, …"`) — too little for a reviewer to verify the code in context, and it sliced words
in half ("roux" → "ux").

**Change (coalition: architect → SWE → adversarial lens; ceremony scaled to a display-only pure fn):**
`extract/provenance.ts` — `SNIPPET_PAD` 24 → 100 (a full line of context each side; the same `snippet`
feeds both the drawer and the assistant's inline citation, so both improve consistently). `snippetAround`
now snaps a cut that lands INSIDE a word back to the nearest whole-word boundary (decided from the raw
neighbour chars before whitespace-collapse), so the excerpt never begins/ends on a fragment. The code sits
centred in the window, so snapping can never touch it.

**Adversarial lens (R4 engineering):** verification is span-based (`verifyAnchor` compares `text[span]` to
the recorded value) and is provably UNAFFECTED by any display-window change — the snippet is decoration, the
span is the evidence. No test asserts snippet content/length (`extract.provenance.test.ts` checks spans;
`encodingAssistant.test.ts` supplies its own snippet strings), so widening is non-breaking. Edge cases
cleared: a code at the text edge gets no ellipsis and no snap on that side; a code-only text yields the bare
code (no fragment, no ellipsis); snapping only fires when both the neighbour and boundary chars are
non-space, so it cannot eat a whole word or empty the body.

**Result:** new `extract.provenance.test.ts` cases pin the wide window (>120 chars), whole-word edges, and
the no-ellipsis-at-edge rule. Types + lint clean; full gate green (push tier).

## 2026-08-30 — Human-in-the-loop gating: AI recommends, human decides every item, checker can't rubber-stamp

**Owner intent:** AI may recommend, but every recommendation must be reviewed and passed by a human
(accept / modify+accept / reject) before the policy can gate for approval; the approver must do real
spot/sanity checks, not rubber-stamp; AI confidence + policy conflict should aid where to focus first.

**Architect → SWE (changes):**
1. **No auto-accept.** AI-decided elements are RECOMMENDATIONS (start `open`), not pre-accepted.
   `EncodingReviewPanel` no longer calls `acceptAiDecided`; the submit gate is `submitReadiness.everyItemDecided`
   (no open element anywhere, no open defect) — the single-ack checkbox is gone. `EncodingReviewAiRow`
   shows Accept / Reject (+ the coverage select as "modify") when open, state + Reopen once decided.
2. **Explicit safe bulk-accept.** `bulkAcceptRecommended` accepts ONLY clean (explicit, unflagged,
   non-`excluded`, ai-decided-bucket) codes; AI-mapped (low-confidence) and policy-conflicting codes are
   left open for individual decisions. Reopen now re-blocks the gate automatically (tracked, not a no-op).
3. **Conflict detector.** A code whose OWN descriptor reads not-medically-necessary / investigational
   (`descriptorFlagsExclusion`) — the signal the prose-only `excludingStatement` missed on CG-SURG-83's
   44238 — now routes `excluded` (→ needs-review) and defaults not-covered/investigational, not covered.
   One shared wording set; descriptor path uses adjectival cues only (no loose `investigation`/`exclud`
   stems that appear benignly in CPT text like "intestine, except rectum").
4. **Confidence + conflict triage** (`reviewTriage.ts`, split out for the size cap): `reviewAttention`
   flags AI-mapped + policy-conflicting codes "⚠ verify"; the AI-recommended list sorts them to the top.
   Confidence-to-extract ≠ safe: an explicit code the policy calls NMN is the top-priority review.
5. **Checker can't rubber-stamp** (`SignoffStage`): a decision summary (counts by disposition) shows
   what is being approved; every off-coverage code AND every code the maker pulled ONTO coverage against
   the policy default (`summarizeDispositions` with `overrideFrom`) must be individually spot-checked
   before Approve unlocks; Approve is disabled (not silently no-opped) for an empty / same-as-maker reviewer.

**Adversarial red-team (findings fixed before gate):**
- Size: `encodingReview.ts` hit 407/400 → triage helpers extracted to `reviewTriage.ts` (373).
- `everyItemDecided` failed OPEN on an empty review set → added `total>0` guard (mirrors `reviewProgress`).
- Spot-check was one-directional (denied codes only) → now also flags investigational→covered overrides.
- Descriptor regex used loose stems → tightened to explicit adjectival determinations; statement path
  broadened with common payer phrasings ("not reasonable and necessary", "does not meet … criteria").
- `DispositionSelect` rendered on diagnosis rows (phantom spot-check) → restricted to procedure codes.

**Known follow-up (documented, not in this batch):** the new maker/checker completeness gates are
enforced in the React shell; the pure lifecycle (`makerSubmit`/`checkerApprove`) still enforces only
maker≠checker. Threading review-completeness + spot-check into `applyTransition` as a fail-closed
precondition is a separate lifecycle change. Accepting a procedure row affirms its shown coverage
disposition (the select is on the row); bulk-accept is limited to clean, non-conflicting codes.

**Result:** 46 targeted + full policy suite green; tsc + lint clean; all changed files under the size cap.

## 2026-08-30 — DTR patient evaluation: the authored policy prepopulates from a real FHIR record

**Owner intent:** the CRD/DTR/PAS analysis proved the patient side was a disconnected fixture —
`/api/dtr/evaluate` returned a hardcoded lumbar-MRI scenario for ANY code and the evidence was baked-in
literals. Connect the AUTHORED policy to a patient: derive its computable criteria, run them against a
patient's FHIR record, and show what prepopulates vs what stays a documentation gap.

**Architect → SWE (new `src/lib/policy/dtr/evaluate/`):**
1. `patientData.ts` — minimal FHIR bundle types + pure query helpers (`ageInYears` from Patient.birthDate,
   `latestObservation` for LOINC 39156-5 BMI, `findCondition` for ICD-10 comorbidities) that return the
   matching resource WITH provenance, plus a bariatric patient fixture (Maria: BMI 42.3, active E11.9).
2. `patientEvaluation.ts` — `evaluateDtr(criteria, bundle, asOf)`: every computable group's status +
   evidence is READ FROM THE RECORD (age/BMI/comorbidity); documentation criteria stay `gap` (never
   auto-satisfied). Deterministic (`asOf` injected).
3. `dtrCriteriaFromPolicy.ts` — `dtrCriteriaFromReview` encodes the reviewed criteria (REUSE of the same
   engine the questionnaire/CQL use) and lifts the typed age/BMI thresholds + documentation, so the
   evaluation is driven by the authored policy. Comorbidity uses a documented standard obesity set.
4. `bariatricCriteria.ts` — the CG-SURG-83 computable-criteria fixture + CPT set for the server path.
5. Wiring: `devStubs.dtr.ts` routes bariatric CPTs through `evaluateDtr` (no longer the lumbar default);
   `PatientPrepopPanel.tsx` (Generate stage) evaluates the LIVE authored review against the sample patient.

**Adversarial red-team (findings fixed before gate):**
- Size: `devStubs.dtr.ts` was blown to 538 by a stray reformat → restored to the compact 240-line form
  (prettier rule is warn-level; scenario objects kept single-line under the cap).
- Comorbidity was marked `required` even when BMI ≥ 40 qualified alone → now required only when the band
  is the patient's actual qualifying path (`band && !bmiClearsThreshold`); a BMI-45 patient no longer
  reads a false comorbidity gap.
- `findCondition` excluded clinically-active `recurrence`/`relapse` → now included; `evaluateDtr` guarded
  against malformed/empty bundles (no `entry`, missing `code.coding`).
- Honesty: the server path is a FIXED fixture + fixed patient (the stateless endpoint can't reach the live
  review); comments corrected to say so, and the panel reports "N/M computable criteria auto-prepopulated
  · K gaps to resolve" rather than an absolute "all met".

**Result:** new `dtrPatientEvaluation.test.ts` + `dtrCriteriaFromPolicy.test.ts` (12 tests) pin age/BMI/band/
comorbidity/documentation status, provenance, the required-logic fix, and the derivation. tsc + lint clean;
full suite green; all files under the size cap; `PatientPrepopPanel.tsx` baselined in testlink.

## 2026-08-31 — CRD single-source: one coverage-card producer + a spec-shaped hosted service

**Owner intent:** the CRD/DTR/PAS review found CRD had TWO look-alike surfaces. Confirmed by
tracing: `/api/cds` (client → external gateway, mock = `devCrdCards`) does real coverage cards;
`/api/cds-hooks/order-sign` does drug-drug-interaction + STAT-note safety, NOT coverage — yet the
certification matrix attributed CRD to it. Two asks: (A) relabel so CRD ≠ DDI and fix the matrix;
(B) give CRD a spec-conventional hosted CDS Hooks service that shares ONE card producer with the
client mock, so all CRD coverage-card logic finally has a single source.

**Architect → SWE:**
1. `src/lib/policy/crd/coverageRequirementCards.ts` (NEW) — the single producer: `buildCrdCards`
   (pure, deterministic id seam), `crdIndeterminateCards` (fail-closed), `crdInputFromOrder`
   (structured-coding-only extraction). CrdCoverageCard carries uuid + source so both surfaces
   emit an identical shape.
2. `devStubs.cds.ts` — `devCrdCards` now delegates to `buildCrdCards` (demo default scenario stays
   confined to the client mock).
3. `src/app/api/cds-hooks/order-select/route.ts` (NEW) — hosted CRD service; resolves the SELECTED
   orders, builds cards via the producer, registered in discovery.
4. `cds-hooks/route.ts` — registers `order-select`; order-sign description corrected to DDI/safety.
5. `certification/matrix.data1.ts` — `crd-order-sign` (id kept for the R1-10-2 history) repointed to
   the producer + order-select with an honest "card production, not adjudication / no coverage-
   information system-actions" note; `cdshooks-order-sign` corrected to medication-safety (demoted to
   partial, live-DDI ci-pending); `cdshooks-order-select` added as a distinct transport claim (no
   coverage double-count).

**Adversarial red-team (pre-build, findings folded in):**
- R2 BLOCKER (fail-open): returning `{cards:[]}` on error would read to an EHR as "no PA needed".
  Fixed: every error / unknown-patient / no-CPT path emits the fail-closed indeterminate warning card;
  never an empty list.
- R2 BLOCKER (wrong-patient/PHI): the hosted service must not fall back to the demo (Maria) scenario.
  Fixed: it resolves via the production registry only; a miss → fail-closed card. Demo default stays
  in `devCrdCards`, structurally unreachable from the hosted route.
- R1/R2 (parity E15 + determinism): the producer owns uuid + source and uses a deterministic id seam,
  so mock and hosted outputs are shape-identical and byte-assertable.
- R1/R2 (PHI/injection): procedureName is derived from structured coding display only, never from
  `code.text`/notes; a free-text-only order fails closed rather than echoing clinician text.
- R1 (indicator): PA-required demoted `critical`→`warning` (administrative condition, not patient harm).
- R1 (selections): order-select keys off `context.selections`, not the whole draft bundle.
- R4 (governance): id `crd-order-sign` KEPT (referenced by risk-register R1-10-2); Partial status held;
  no silent upgrade; coverage-semantics vs transport claims kept disjoint.
- Verified against source: R4's "crdService.ts is dead / always returns a mock" was a MISREAD — the
  file feeds `parseCrdCards(r.data.cards)` into `deriveCrdResult`; not treated as a finding.

**Scope not taken (documented, not silently dropped):** hosting CRD on `order-sign` too (sign-time
determination) and emitting Da Vinci `coverage-information` system-actions remain gaps; the note says so.
order-sign's own `[]`-on-error DDI behaviour is unchanged (out of this change's scope) and logged as a
follow-up risk rather than altered here.

**Tests:** `tests/policy/crd/coverageRequirementCards.test.ts` (producer contract, fail-closed,
structured-coding-only, parity) + `tests/api/routes-cds.test.ts` extended (order-select happy path,
every fail-closed branch, malformed→400, discovery registration). vitest to be run natively on Windows
(rolldown native binding blocks vitest under the Linux device bridge); tsc/lint/testlink/wiring run here.

**Post-build red-team (verification on the shipped diff):** B1 fail-open, B2 wrong-patient, B3
parity, and PHI-echo all re-confirmed CLOSED by tracing every return path. One MAJOR new defect
found and FIXED: two selected orders sharing a CPT produced colliding card uuids (CDS Hooks
correlates feedback by uuid) — the order-select route now folds each order's id/index into a
deterministic id seam, so uuids are unique per order while card SHAPE parity with the mock holds.
Verified `getPatientById('')`/`getPatientByFhirId(<unknown>)` both return undefined (no demo
fallback — B2 fully closed). Residual minor (documented, not blocking): a non-CPT coding fallback in
`crdInputFromOrder` labels any coded order "(CPT <code>)" — over-warns in the fail-closed direction.

## 2026-08-31 — WPC core hardening (batch 1): startup wiring + lens surfacing

**Owner intent:** close the tractable, correctness-critical items from the WPC intelligence-core
hardening assessment as one gate-green batch: (P0) the production cold-start, (P1) the two lenses
computed-then-dropped, (P2) catalog accuracy. Feature-scale items (durable serverless projection,
5-dimension projection from FHIR feeds, hosted-CRD parity, sweep wiring) deferred to later batches.

**Changes:**
1. `src/instrumentation.ts` — the existing nodejs-guarded `register()` now also dynamic-imports and
   calls `bootstrapReliability()` at process start, so the projected-graph aggregator is registered
   and the projection drain scheduled without waiting for a first `/api/ops/health` hit. Closes the
   production 503 cold-start. (Guard + dynamic import keep Node-only reliability code off the edge bundle.)
2. `HolisticPatientContext` gains optional `careTeam` + `part2Restricted`; `mapCareTeam` / `mapPart2`
   (new pure mappers) surface the two previously-dropped lenses; the aggregator populates them and
   declares them in `contextProvenance.projectedSections`. Optional so the authored engine is untouched.
3. `dataMode.ts` — `wpcRecord` and `signalDisposition` seam labels corrected `registered`→`wired`
   (both have real production switch points). `reliability/bootstrap.ts` recon-placeholder comment made
   honest (the sweep is reserved, not yet wired — it needs the outbox apply/publish deps).

**Adversarial red-team (post-build, on the diff) — two MAJOR semantic defects found and FIXED:**
- `mapCareTeam` filtered on a single node kind (`CareTeamMember`), which DROPS the NPI-converged
  treating physician (a `ProviderIdentity` node) and `Practitioner` participants — the care-team lens
  returns all three via `HAS_CARE_TEAM`. Fixed to count every non-Member participant; role travels as a
  node property on all kinds. Test now seeds Practitioner + ProviderIdentity to pin it.
- `mapPart2` derived `restrictedNodeCount` from the consent-FILTERED lens output, so a no-consent read
  returned `0` even when restricted Part 2 data existed and was being WITHHELD — reading as "no Part 2
  data" on a 42 CFR Part 2 surface. Fixed: count is `null` (UNKNOWN) unless the scope actually disclosed
  Part 2; never asserted as zero. Type widened to `number | null`.
- Verified premises the reviewer raised that did NOT hold: edge-bundling is safe (guard + dynamic import,
  same pattern as the file's evidence-store import); the scheduler starts no background timer (jobs run
  only on an authenticated ops tick) so there is no timer leak in mock/build/serverless; running bootstrap
  in all modes is harmless (the aggregator is read only under `wpcRecord=production`).

**Tests:** `projectedAggregator.mappers.test.ts` (+ mapCareTeam multi-kind counting/dedupe, mapPart2
enforced-vs-disclosed + null-when-withheld, provenance) and `projectedAggregator.test.ts` (+ context
surfaces careTeam/part2Restricted with provenance). Node gates green on device (sizes, testlink E13,
wiring E14, page-boundaries, skill-mirror, provenance E11); tsc/lint/vitest to run natively on Windows.

## 2026-09-03 — Two-state FHIR seed: Connect360 UUIDv4/PUT projection (traditional pipeline preserved)

**Owner intent:** preserve the preexisting seed pipeline (human-readable slug ids, POST) exactly, and
add a SEPARATE Connect360 implementation (UUIDv4 resource ids, PUT-as-create) as new files, because
Connect360's FHIR server accepts only UUIDv4 ids and upserts by id. Checked-in Connect360 bundles +
a drift guard so the two states cannot silently diverge. This REVERSES an earlier in-place overwrite
of the committed bundles (which had replaced them with random-uuid/PUT); traditional is restored
byte-exact from git HEAD (90b74f4) and the mutated generator reverted.

**Coalition (framework employed on explicit owner request — full coalition + adversarial + tree-of-thought):**
- *Architect* — ratified the two-state design; ran tree-of-thought on the id-scheme fork.
- *FHIR interoperability SME* — PUT-as-create semantics, reference-form policy, UUIDv4 format contract.
- *EMPI/KG integrity SME* — traced ingestBundle → adapters → evidence join and EMPI resolution.
- *Software-architect / build-integration* — generator revert, gate wiring, size-gate exemption, collision scan.
- *Adversarial red-team (R1–R5)* — a NO-GO design pass BEFORE code and a SHIP pass AFTER code.

**Tree-of-thought — id-scheme fork (enumerate → score → prune):**
- Option A: promote each entry's existing random fullUrl uuid to be resource.id (mint only for the
  synthetic coding-gap fullUrl). Option B: deterministic UUIDv4-SHAPED id = sha1(namespace|slug) with
  version nibble 4 + variant 10xx. **Chose B** — its ids derive from the stable business key (the slug),
  so a PUT-upsert stays idempotent across regeneration and the drift guard is deterministic; Option A's
  ids ride on volatile random bytes and would create duplicate resources on the upsert server. Confirmed
  by an anti-Option-A regression test (re-minting every fullUrl leaves the connect360 ids unchanged).

**Reference-form fork (orchestrator adjudication):** the EMPI/KG SME leaned "normalize all refs to
relative Type/uuid"; I chose **PRESERVE-FORM, remap-id** (relational refs stay urn:uuid; logical
evidence refs stay Type/uuid) — it is trivially ingest-equivalent to traditional (identical reference
shapes) AND the most server-portable (relational refs resolve via the universal fullUrl mechanism;
logical evidence refs resolve via the PUT request.url and are the form our own KG SUPPORTED_BY join
requires). Only string values under a `reference` key that resolve in-bundle are rewritten; canonicals,
identifier.systems, extension urls, and unresolved refs pass through untouched.

**Adversarial BEFORE coding — conditional NO-GO, all findings folded into the build:**
- BLOCKER #1: the Connect360 server contract (UUIDv4-only, PUT) was asserted, never verified. Mitigation:
  preserve-form (universal resolution) + a structural conformance test + a 2-backend ingest-parity proof;
  an independent HL7 validator round-trip was attempted but the FHIR package servers are outside the CI
  network allowlist (403), so a live Connect360-sandbox round-trip is recorded as the deployment-time gate.
- #2 parity test must assert the coding-gap join by id-INDEPENDENT clinical content + an aggregate >0 guard.
- #3 scope reference rewriting to resolvable `reference` values; add a diff-scope assertion; ref-count parity.
- #4–#7 (documented v4-shaping consequence; serializer pinned to JSON.stringify(_,2) no trailing newline;
  drift guard = order-insensitive deep-equal; evidence node is Condition|Encounter, not only Condition).

**Adversarial AFTER coding — SHIP.** uuidForKey correct over 200k keys (version 4 / variant 8–b / lowercase,
always); byte-stable output matches committed bundles exactly; drift guard PROVED to fail on an injected
hand-edit; referential integrity exact (0 dangling, 0 type drift, slug↔uuid bijection); non-vacuity confirmed
(alex-kirby has 0 evidence refs → the aggregate totalSupportedBy>0 guard is load-bearing). One MINOR: a slug
survives inside an `ra-sourceDocument` provenance `valueString` (not a resource id/reference; target not
in-bundle in either state) — left verbatim per preserve-form, scope documented + proven byte-identical by
the diff-scope test.

**Verified finding that CORRECTED a coalition assumption (R5):** the EMPI/KG SME claimed both id schemes
resolve to the SAME golden memberId (demographics-anchored). Ingest-parity testing DISPROVED this: for these
seed patients `canonicalPersonKey` falls back to `rec:<sourceRecordId>` (the Patient resource.id), so the
golden memberId is DERIVED FROM the resource.id and legitimately DIFFERS between schemes. Harmless — the two
states never share a graph and Connect360 runs its own EMPI — and the clinical graph is identical (proven by
domain-census, quarantine-census, and coding-gap-signature parity across neo4j-fake + pg-mem). The parity
test asserts the correct (clinical, id-independent) invariant and documents the id-specificity.

**Changes (all additive except the two reverts):**
1. REVERT `fhir/seed/patients/*.bundle.json` (5) + `manifest.json` → git HEAD bytes (traditional slug/POST).
2. REVERT `tools/seed/gen-patient-bundles.mjs` → HEAD (traditional slug/POST; keeps exported CODING_GAPS + main-guard).
3. NEW `tools/seed/lib/connect360Transform.mjs` — pure deterministic transform (uuidForKey + transformBundle).
4. NEW `tools/seed/gen-connect360.mjs` — main-guarded driver; writes ONLY into fhir/seed/patients/connect360/.
5. NEW `fhir/seed/patients/connect360/` — 5 bundles + manifest.json + README.md (checked-in projection).
6. NEW `tests/seed/connect360.test.ts` (conformance + drift guard + anti-Option-A + evidence mapping) and
   `tests/seed/connect360IngestParity.test.ts` (2-backend clinical parity).
7. `package.json` — `seed:connect360`, `verify:connect360`. Stale UUIDv4 comments in the two wpc tests
   corrected to scheme-agnostic wording.

**Drift guard placement:** a vitest test (auto-run by g_unit in push/pre-merge/ci), matching the existing
codingGapDrift data-integrity pattern — no edit to the canonical gate. Connect360 bundles are size-gate-exempt
(check-file-sizes.sh scans only src/tests/e2e and only .ts/.tsx/.js/.jsx; fhir/ + .json are never scanned).

**Gate:** `bash scripts/ci-gates.sh push` → ALL GATES PASS (format, types, sizes+ratchet, lint, testlink E13,
page-boundaries, skill-mirror, unit 2593 tests, wired-path E14, provenance E11, coalition). E16 `next build`
unaffected (no src/app changes). Nothing committed by the agent — staged for the owner's own push.

## 2026-09-12 — Wave-10: LIVE-WIRED Analyst Workbench (in-app thin client over the real Wave-8/9 endpoints)

**Coalition:** architect + SWE design, adversarial R1–R5 before & after, verify gate.

**Goal:** prove the analyst workbench runs against the ACTUAL engine, not curated front-end data. A new
in-app route renders the real gated analyses + governed actions by calling the real backend and rendering
only what the endpoints return.

**Changes (all additive, behind `goldenThreadE2E`):**
1. NEW `src/app/(reviewer)/analyst-workbench/page.tsx` — server route, `force-dynamic`, flag-gated
   (off → plain "not enabled"). Mirrors golden-thread's `runOrderToCash` wiring (same deterministic ids)
   to PERSIST the Evidence Record + recovery draft into the shared store the Wave-9 route reads, then hands
   the client the record id + the REAL `ANALYSES` registry (mapped to id/label/party).
2. NEW `src/components/goldenThread/AnalystWorkbench.tsx` — `'use client'` thin client: party toggle +
   analysis picker (filtered by party) + Run (GET `/api/evidence/:id?party=&analysis=`) rendering the REAL
   AnalysisRun (plan/eval outcome, finding, interlock-gated action, routed ticket) + Approve (POST the Wave-9
   `/api/recovery/:id-recovery/action`) rendering the REAL governed-action outcome. NO `@/lib/evidence` barrel
   (deep-import discipline — analyses arrive as a plain prop, response types declared locally). PHI: the
   member-embedding record id is held only to build URLs, never rendered.
3. EDIT `src/app/(reviewer)/golden-thread/page.tsx` — a link to the workbench INSIDE the flag-gated body
   (flag-off byte-identical; no unconditional nav change).
4. NEW `tests/app/AnalystWorkbench.test.tsx` — E13 render/behavior (fetch mocked): RUN renders from the
   response, present-but-empty labeled, APPROVE POSTs the mapped governed action + renders the outcome, a
   PLAN-VALIDATE rejection + an auth/flag error surfaced truthfully, and the record id never leaks into the DOM.

**R1–R5 findings fixed:** (R4) removed a duplicated ticket-reason render; (R1) the UI states the analyst-action
→ governed-action mapping (`draft-appeal`→`appeal` submission; else `ticket-update`) rather than pretending a
`monitor` is an X12; (R3) an honest caption states the dev-mock GET returns a SEEDED record (no 835/seal), so
remittance/reconciliation-driven analyses are present-but-empty while the governed action still executes against
the sealed recovery in the store.

**Honest residual (dev-mock):** GET `/api/evidence` returns the seeded record (no remittance/reconciliation/
seal), so in the offline posture `denial-rca` + `integrity-check` return OK-but-present-but-empty,
`recovery-verification` is present-but-empty for payer / plan-rejected for provider, `member-cohort-drilldown`
is plan-rejected (PHI reads) and `denial-forecast` is eval-rejected (non-reproducible). No analysis yields a
rich anomaly in dev-mock because the seeded read carries no 835. The Approve path is genuinely end-to-end: the
Wave-9 route reads the sealed recovery persisted by the server thread. The published executive Artifact remains
a SEPARATE static prototype.

**Not core-logic:** no `src/lib/(policy|identity|consent|goldenThread|networkAdequacy)/` change — the coalition
gate does not require a log entry here, but one is recorded per framework discipline.

## 2026-09-12 — Wave-11: remediation increment (two-reviewer adversarial findings, Waves 1–10)

**Coalition:** architect + SWE design, adversarial self-review before & after, verify gate.

**Goal:** close the specific defects two independent adversarial reviewers found across Waves 1–10 —
reuse-first, additive, gate-green, PHI-safe, size caps held (new logic in helpers so the near-cap
decision + action routes stayed ≤400). Each fix carries a regression test.

**HIGH**
1. **C1 — cross-route double-submit.** The recovery DECISION route submits the appeal under
   `${recoveryId}-submission`; the ACTION route submitted an `appeal` under a governed-action id
   (`${recoveryId}-gact-appeal`) — DIFFERENT id schemes, so neither route's terminal short-circuit saw the
   other and one underpayment could be appealed TWICE. Both paths are now bound to ONE submission-intent:
   the action route refuses (409) a submission-class `appeal` once `terminalOutcome(record,recoveryId)`
   shows `submitted`; the decision route refuses (409) once a governed `appeal::executed` marker exists
   (checked on the base read AND the re-read latest). Test: `tests/goldenThread/recoveryCrossRoute.test.ts`
   (approve on one route → the other refused; exactly one submission on the ledger; a non-appeal governed
   action after a decision submit still allowed). FAKE_FIDELITY row 8 discloses the previously-under-disclosed
   cross-seam duplicate + the binding.

**MED**
2. **C2 — governed-action id ignored the recovery.** `governedActionId` now keys on the `recoveryId`
   (`${recoveryId}-gact-${actionType}`), and the route passes the RESOLVED recovery entry (the one the URL
   names) into refs/evidence-tier/priority resolution — so on a multi-claim record two `POST .../action`
   produce DISTINCT action ids and correct per-recovery refs (recovery B no longer silently dropped). Test:
   `tests/goldenThread/governedAction.test.ts` (distinct ids + per-recovery refs).
3. **C3 — verify-before-reseal didn't cover the re-read record.** Both routes now re-run
   `verifyLedgerIntegrity(latest, latest.seal, verifier)` (shared `recoveryGuards.verifyLedgerAtRead`) before
   re-sealing and refuse 409 on failure — a tamper landing in the read→re-read window is no longer laundered.
   Test: `tests/goldenThread/recoveryCrossRoute.test.ts` (both routes). The existing "concurrent unrelated
   append preserved" test now re-seals its simulated concurrent write (a real writer always re-seals).
4. **C4 — submission-class defined twice.** `isAutoApprovable`/`evaluateInterlock` now derive submission-class
   from the SINGLE `isSubmissionActionType` predicate (keyed on actionType) in `decisionGate.ts`;
   `governedAction.isSubmissionAction` delegates to it. The `isSubmission` boolean is a cache, not a second
   source — a submission-class actionType with the flag omitted still cannot auto-approve. Test:
   `tests/agents/governance/decisionGate.test.ts`.
5. **A2 — reproducibility proxy strengthened (NOT downgraded).** RESULT-EVALUATE now perturbs a SECOND
   injected axis (`nonce`) besides the clock; a correct analysis ignores both, so a nonce-dependent body is
   rejected. Added the `nonce-probe-demo` throwaway template (reads the nonce → eval-rejected). `denial-forecast`
   still fails on the clock axis. Test: `tests/goldenThread/ledgerAnalytics.test.ts`. FAKE_FIDELITY row 7
   updated (two-axis probe; full non-determinism sandboxing remains the production item).
6. **A3 — `appealableAmount = Σ CO` domain error.** CO is a NON-appealable contractual write-off. Dropped the
   `appealableAmount` field and the `appealable=` summary label; the CO sum is reported as `contractualAdjusted`
   / `contractual=`. Test updated in `ledgerAnalytics.test.ts`.
7. **A4 — recovery-verification failed OPEN on unknown PA.** An absent `pas-decision` no longer defaults to
   `'approved'` (which manufactured a recoverable verdict on a possibly-denied claim); it returns
   present-but-not-verifiable, like a missing remittance/reconciliation. Test in `ledgerAnalytics.test.ts`.
8. **A5 — workbench rubber-stamp risk.** The flag-gated party/analysis GET path now sources the analysis from
   the SAME persisted store record the Wave-9 action route acts on (when present) instead of the dev-mock seed
   skeleton — the finding shown IS the basis for the action. Other GET behavior unchanged. Test:
   `tests/api/evidenceAnalysisAudit.test.ts`.
9. **A6 — action mapping flattened semantics.** `governedActionFor` now maps each disposition to its faithful
   governed type (draft-appeal→appeal; draft-resubmission→x12-837-corrected; escalate-reconciliation-review→
   provider-notice; freeze-and-escalate-integrity→ the NEW internal `integrity-freeze` type; confirm/monitor→
   ticket-update) — no urgent integrity tamper or reconciliation escalation silently collapses into a generic
   ticket. `appeal`/`x12-837-corrected` stay submission-class (human-gated). Test in
   `tests/app/AnalystWorkbench.test.tsx`.

**LOW**
10. **C6 — `'high'` overloaded.** The unparseable-deadline recovery fallback is now the DISTINCT sentinel
    `'deadline-unknown'` (added to the `EscalationPriority` union); escalation SLA lookup normalizes it to the
    `high` tier so behavior is unchanged, but the recovery band no longer overloads the genuine `high`. Tests
    updated in `orderToCashRecoveryPriority.test.ts`.
11. **C7 — negative-PHI on the projection.** Test: applying a full governed-action lifecycle (with member-
    adjacent claim/auth/ref) then `projectForParty` asserts NO member/claim/auth substring leaks — making the
    `auditProjection` omission load-bearing (`tests/evidence/partyView.test.ts`).
12. **A-audit — evidence GET audit detail.** The `evidence.read` audit now records `party` + `analysis` id +
    gate outcome (ok/plan-rejected/eval-rejected), ids only. Test: `tests/api/evidenceAnalysisAudit.test.ts`.
13. **A-negPHI — ticket reason PHI-safety.** Test asserts a plan-rejected/eval-rejected ticket `reason` (which
    concatenates the analysis id + declared field NAMES) carries no member id VALUE / free-text
    (`ledgerAnalytics.test.ts`).

**NOTED backlog (NOT built this increment):** separation-of-duties (drafter≠approver second signature),
per-record action throttle, the three-terminal-detector duplication, `ProcessTierScope` unused fields,
reject-permanently-locks-action-type.

**Reuse-first:** new shared helper `src/app/api/recovery/[id]/recoveryGuards.ts` (verify-before-reseal) used by
both routes; the submission-class predicate is single-sourced in governance and delegated to. No duplication
introduced; all changes additive + behind `goldenThreadE2E` where route-facing; flag-off/param-absent
byte-identical; demoPreservation untouched; PHI-safe.

---

## Increment — Live-flow: Twin-Ladder D/A codes + exec legend · real-world transaction mix + evidence impact · NIST-per-record specifics (2026-09-14)

**Scope (user directives):** (1) restore D0–D3 / A0–A3 codes on the exec Twin-Ladder, paired with an executive legend that "pops"; (2) build a real-world transaction mix (270/271 eligibility, 276/277 status, 278 PA, 837P/I/D claims, 835 remittance, appeals) tied to its associated evidence-record impact; (3) as we go agentic, add NIST AI-RMF specifics to every sealed record. Files: `src/lib/goldenThread/flowSim.ts`, `src/components/goldenThread/flow/LiveProcessFlowBoard.tsx`.

**Framework engaged (adversarial-BEFORE → acted on):**
- **NIST NO-GO (category error):** per-record "subcategory/control" (e.g. "GOVERN 3.2") is an org/system-level outcome, not a per-event tag. RESOLVED — per record now carries FUNCTION (GOVERN/MAP/MEASURE/MANAGE) + trustworthiness CHARACTERISTIC + human-OVERSIGHT mode (HITL/HOTL/none), framed as alignment (illustrative), not conformance; NIST does not certify AI systems; subcategory conformance stays on the /nist-ai-rmf tab. Function single-sourced from one `NIST_SPEC` map; oversight derived from (human, rung).
- **Transaction-mix realism:** PA overweight (24%→6%); 835 remittance mis-modeled as real-time (→ payment-cycle pulse `runRemitCycle`, REMIT_CYCLE=220); latent `kind:'837'` overload (status/remit would get underpayment-pended / claim-rejected) → branch guards moved to `isClaimType(type)`. Real-time auto-spawn mix now eligibility 60 / status 30 / PA 6 / appeals 2. `spawnTxn` is type-driven (kind/startIdx/stopIdx from `TXN_TYPE_META`); `beginNext` ends at `stopIdx`; only surveillance-reaching journeys seal the watch + a fractional ticket.

**Adversarial-AFTER (R1–R5 + D1/D4/D5 + AI-governance) — verdict CONDITIONAL-GO:**
- **F1 (HIGH) — CLOSED:** `human` and `reproducible` were displayed/claimed (solid/hollow ring; reproducible vs pending) but were NOT in the hash, under a "any edit breaks the chain" banner. Both are now folded into `seal()` and re-derived identically in `ledgerIntact()`. Runtime-verified: seal stays intact across mixed traffic, batches, spotlight and maturity changes.
- **F2 (MED) — CLOSED:** `TXN_TYPE_META.nist` was a second work→NIST-function map contradicting "single source of truth." Field removed; legend no longer asserts a per-type NIST function. `NIST_SPEC` is the sole map.
- **F3–F9 (MED/LOW) — BACKLOG (scheduled, non-gating per verdict):** F3 276/277 status routes through remittance/reconciliation (wrong evidence); F4 every clean claim traverses `recovery` (implies universal disputes); F5 "Fair — Harmful Bias Managed" never emitted live (dead `fairness-screen`/`appeal`/`status` keys); F6 deemed-adverse-on-timeout (438.210) asserted in spine but not modeled; F7 spotlight PA hits D3 at CRD so evidence never binds (dial is the only link); F8 gold-card waiver executes PAS/PEND before short-circuit + drawn arc vs token-motion mismatch; F9 NIST mapping nits (md/determination→GOVERN; surveillance→MANAGE not MEASURE; "Safe" characteristic absent). Also noted: no tenant/payer scoping on the shared ledger; no Part 2 segmentation gate; no fail-closed on `ledgerIntact===false`.

**Verification:** `tsc --noEmit` clean; no `@/lib/evidence` barrel / `node:crypto` in the client files; deterministic (engine uses seeded `mulberry` + integer ticks only; `new Date` is display-only). Headless Playwright run: seal intact, mix populates (`typeCounts`), D0–D3/A0–A3 render, adverse case pins authority to A1 despite D3 proof. GIF captured.

**Landed byte-verified** to `C:\GBS\Clients\State of NY\Finalrhtpdemo` (flowSim.ts sha256 172794d3…, board bb2f957b…); nothing pushed to GitHub.

---

## Increment — F3–F6 engine fixes (Checkpoint 1 of the operating-loop build) (2026-09-14)

**Scope:** the four backlog items from the prior adversarial-after, corrected per a fresh adversarial-BEFORE pass (CONDITIONAL-GO, 3 HIGH conditions). File: `src/lib/goldenThread/flowSim.ts`. These make the live flow generate the RIGHT issues that drive tickets → analyst → workbench (Checkpoint 2).

**Framework engaged (adversarial-BEFORE → conditions cleared):**
- **F3 — 276/277 status.** Was routing remittance→reconciliation, sealing 835 + underpayment-delta records. Now a single read: startKey=stopKey='remittance', special-cased to seal ONE `fired='status'` record (D2→A2, "277 — claim status read, no authority exercised"), touching neither remittance nor reconciliation. Reviewer L1 upheld the synthetic-key approach (no "fired maps to a stage" contract exists; `records`/`determination`/`rfi` are already synthetic keys).
- **F4 — every claim/PA traversed `recovery` (dispute).** Added a `disputed` flag set only when the reconciliation gate pends (underpayment). Any clean txn continuing past reconciliation (approved PA or clean claim) now transits straight to surveillance, SKIPPING recovery; only disputed items + first-class appeals seal a dispute-packet. Verified: recovery seals dropped from ~all claims to the dispute cohort (8 at m=0.5, 2 at m=1.0). Reviewer M2 noted underpayment is one dispute class (denial-driven appeals ride the first-class `appeal` txn).
- **F5 — "Fair — Harmful Bias Managed" never emitted (HIGH H1 correction).** Replaced the planned per-txn fairness seal (a category error — four-fifths is a cohort statistic) with a periodic COHORT screen `runFairnessScreen` (every 260 ticks) over accumulated decision outcomes: seals ONE `fired='fairness-screen'` record referencing cohort n + a four-fifths ratio grounded in the observed deny rate, with honest period variance so it hovers near 0.80 and periodically breaches at ALL maturities; a breach mints the §1557 disparate-impact ticket to the Medical Director (A1 — advises, never an autonomous rule change). Labeled illustrative (cohort split modeled, not real member data).
- **F6 — deemed-adverse-on-timeout (HIGH H3 correction).** A pended PA's 438.210(d) clock may EXPIRE (`pDeemedTimeout`, floored at 0.05 so the safeguard fires even at full autonomy — not hidden by the maturity dial). On expiry: a `human:UM` (NOT MD) NABD sealed `fired='deemed-adverse'`, decision citing **438.404(c)(5)** + the 72h-expedited/7-day-standard clock + appeal & State fair-hearing rights — never an agent auto-deny. The existing MD-deny path was RELABELED to a medical-necessity denial (fired='md', "MEDICAL-NECESSITY DENY (MD-issued)"), so "deemed-adverse" now means only the timeout. Also: `md`/`nurse` NIST characteristic → "Safe" (the previously-absent 7th trustworthiness characteristic).

**Verification (deterministic, headless — `scripts/verify-f3f6.ts`):** same seed → same chainHead (eb008338); ledger intact across all runs; flipping a displayed field (`human`) breaks the chain; F3 status records present, F4 recovery = dispute cohort only, F5 Fair characteristic emitted + periodically flagged, F6 `human:UM` deemed-adverse fires at low AND (via floor) high maturity, MD medical-necessity denials distinct. `tsc --noEmit` clean; determinism preserved (engine still seeded mulberry + integer ticks only).

**Landed byte-verified** to `C:\GBS\Clients\State of NY\Finalrhtpdemo` (flowSim.ts sha256 762bb364…). Nothing pushed to GitHub.

**Deferred to Checkpoint 2:** the flow→ticket→analyst→workbench operating loop + Operations elevation (D/A codes, NIST-per-record single-sourced in the SPINE per H2, live counters/SLA off sim state per M1, drop unbacked "HMAC-sealed" on seed) + the Hex/Colab-style grounded analyst console with agent-produced RCA + curated NLQ grounded in real transaction facts.

---

## Increment — the operating loop: elevated Operations + Hex/Colab grounded workbench (Checkpoint 2) (2026-09-14)

**Scope:** connect the three tabs into ONE operating loop (flow issue → governed ticket → analyst persona → workbench) and make Operations "resonate" with the live board while the workbench becomes a Hex/Colab-style, grounded, contextually-aware analyst console. Files: `nistMap.ts` (new), `useOperatingSim.ts` (new), `opsShared.tsx` (new), `OperationsBoard.tsx` (rebuilt), `PartyWorkbench.tsx` (rebuilt), `LiveProcessFlowBoard.tsx` (refactored to consume the shared sim), `FlowBoards.tsx` (wires the loop), `flowSim.ts` (NIST map extracted + mint/propose changes).

**Architecture:** one shared `useOperatingSim` sim behind all three tabs (single truth — no two-sim incoherence). The NIST map + D/A code vocabulary are single-sourced in `nistMap.ts` (H2 from the before-pass: one work→NIST map, in the spine, used by engine and views). Determinism preserved (engine remains the only mutator of sealed state; the hook's rAF only accumulates integer ticks; display time never enters a sealed field).

**Adversarial-BEFORE (on the plan) → applied:** H1 fairness = periodic COHORT screen (not per-txn); H2 single-source NIST + back the "sealed" language with the real hash-chain; H3 deemed-adverse = human:UM + 438.404(c)(5) + timeout floor + MD-deny relabel; M1 drive Operations off live sim state. (Engine parts landed in Checkpoint 1; presentation parts here.)

**Adversarial-AFTER (on the build) → CONDITIONAL-GO, all gating findings closed before landing:**
- **F1 (HIGH, overclaim) — CLOSED:** three "live/connected/sealed" signals sat over seed data. Relabeled: header badge is "Live-wired" ONLY over the real-endpoint idle path, else "Analyst notebook · grounded on the ticket record (seed)"; Cell 1 → "Source systems · what this workbench reads (illustrative topology)" with neutral (not green-health) dots + honest note; Cell 2 → "from the governed ticket record (illustrative seed)" with every value labelled modeled.
- **F2 (HIGH, false append) — CLOSED:** the resolution cell claimed a ledger append that never happened. Added `proposeOutbound()` — a real `seal()` (human-gated → PROPOSED/A1, non-adverse → EXECUTED/A2, `fired='governed-action'`), wired through the hook; clicking Resolve now genuinely appends a sealed record (verified ledgerSeq +2, chain intact) and the copy says to watch the sealed-records count rise. This also begins closing the operating loop.
- **F3 (MED-HIGH, mint/route mismatch) — CLOSED:** `mintTicket` now takes an algorithm and mints the ticket that MATCHES what fired (disparate-impact→DENY-DISPARATE-IMPACT, underpayment→UNDERPAY-CONTRACT); MD-deny and deemed-adverse no longer mint a mismatched surveillance ticket (they are determinations with their own sealed record + event). "Role-routing is real" is now accurate.
- **F4 (MED, unearned vocabulary) — CLOSED:** dropped "WORM" and "tamper-evident"; the ledger is labelled "hash-chained · append-only" and "hash-chained integrity check (illustrative): any naive edit to a sealed field breaks the chain on re-read." The Operations forensic log IS the live ledger, so its seal indicator re-derives genuinely (closing the prior H2 gap — the language is now backed).
- **F5 (MED) — CLOSED:** NLQ caption "computed from this record" → "grounded in this ticket's facts".
- **F6 (LOW-MED) — CLOSED:** Cell 2 labelled illustrative once, consistently.
- **F7 (LOW) — CLOSED:** SLA past the window shows "PAST DUE" instead of ambiguous 00:00.
- **NOTED backlog (not built):** ticket lifecycle still doesn't fully close from the workbench; Part 2 consent gate not enforced in the presentation layer; no source-down state; no NLQ-answer→ledger-seq provenance link; color-only encoding (a11y); multi-tenancy on the shared sim.

**Verification:** `tsc --noEmit` clean; determinism holds (same seed → same chainHead); ledger intact; tamper (flip `human`) breaks chain; `proposeOutbound` appends real sealed records; live board GIF-capture path intact after the sim moved to the hook; headless run confirmed the full loop (flow → ticket → Operations → open → grounded workbench notebook) with no page errors (only the sandbox font-proxy block). Client-safe boundary confirmed (no `@/lib/evidence` barrel / `node:crypto` in any new client file).

**Landed byte-verified** to `C:\GBS\Clients\State of NY\Finalrhtpdemo` (8 files; flowSim.ts 6afc5b17…, nistMap.ts e21971ee…, PartyWorkbench.tsx df2c6587…). Nothing pushed to GitHub.

---

## Increment — operational surveillance console + free-form NLQ + provenance/access panel (Checkpoint 3) (2026-09-14)

**Scope:** (1) an operational surveillance console showing the 40-detector program-integrity library being leveraged, each live detection triggering action to the right analyst seat and showing addressing; (2) free-form NLQ so the analyst can ask their own questions; (3) [added mid-build by user] a provenance + access-controlled source-connection panel in the workbench. Files: `surveillanceMap.ts` (new), `SurveillanceConsole.tsx` (new), `FlowBoards.tsx` (Surveillance tab), `PartyWorkbench.tsx` (NLQ retriever + source/provenance panel), `flowSim.ts` (`addressed` tracking).

**Framework engaged — adversarial-BEFORE (design) then AFTER (code); both reshaped the build toward honesty (this audience's whole game):**

Adversarial-BEFORE reframed a naive "41 live detectors firing" plan: honest decomposition is 0 live analyses / 40 catalog / ~7 scripted narratives. So the console reuses the real governed detections (the tickets the engine mints, mapped to library ids) rather than faking scans, and shows the full catalog honestly badged.

Adversarial-AFTER (verified against the tree) returned CONDITIONAL-GO; all findings closed before landing:
- **F1 (HIGH) — CLOSED:** the "Not 41 live models" panel hardcoded a wrong count (catalog is 40). NOT_CLAIMING is now count-free; the summary tiles carry the live catalog/scripted numbers (single-sourced).
- **F2 (HIGH) — CLOSED:** the NLQ retriever returned wrong facts on the COB ticket (coverage IS the driver) and the §1557 ticket ($0 exposure). Added ticket-aware `coverageFact`/`exposureFact` (COB → coordination-is-the-finding; $0 → "regulatory/reprocessing, not $0 of harm"), added comparison operators (than/higher/lower/exceeds/…) to the refusal list, and tightened over-broad keywords.
- **F3 (HIGH/MED) — CLOSED:** live detection cards are labelled "scripted" (illustrative narrative), not implied live model output.
- **F4 (MED) — CLOSED:** added a NOT_CLAIMING line — "Not cryptographic non-repudiation — the live seal is an illustrative hash chain; production uses HMAC-SHA256 / server-side signing."
- **F5 (MED) — CLOSED:** the dominant real outcome "Cleared — not FWA" is now rendered (deterministic majority of non-critical detections) with its own summary tile — the feed is no longer 100% escalating.
- **F6 (MED) — CLOSED:** a §1557 disparate-impact detection now routes to "Medical Director + Compliance" with a civil-rights/governance authority string (suspend auto-deny rule, reprocess, NABDs, MHPAEA parity), not "medical-necessity PEND/deny".
- **F7 (LOW) — CLOSED:** "wired" → "scripted" narrative throughout.
- **F8 (LOW) — CLOSED:** 455.23 attributed to the State agency; the MCO acts under 438.608(a).
- Routing split (from the before-pass): Clinical (MD/UM) vs Investigative (SIU → State/MFCU 455.23 terminal) — the state's own seat is on the board.

**Provenance + access panel (user addition):** every grounded fact in the workbench is now provenance-tagged to its source system; Cell 1 is an access-controlled connection panel scoped to the analyst's seat — standard sources connect after a configure step; elevated (SIU / Member-PHI) and 42 CFR Part 2 (SUD) sources require an attestation before they load; out-of-scope party systems are "not permitted." A gated fact (BH cohort detail) shows "— connect … to load" until its Part 2 source is connected. This also closes the before-pass's provenance + Part-2 negative-space notes; honestly labelled illustrative (no live endpoints).

**Verification:** `tsc --noEmit` clean; determinism holds (same seed → same chainHead; `addressed` mutated only by the user action `proposeOutbound`, never in `advance()`; no wall-clock in sealed state); ledger intact; free-form NLQ refuses the "did we not recover…" negation trap live; client-safe (library.ts + surveillanceMap.ts are pure data; no `@/lib/evidence` barrel / `node:crypto` in the new client files); prior honesty vocabulary preserved. Headless screenshots confirmed the console, the scripted/cleared/routing labels, and the provenance/access panel with the elevated + Part-2 attestation flow — no page errors (only the sandbox font-proxy block).

**Landed byte-verified** to `C:\GBS\Clients\State of NY\Finalrhtpdemo` (5 files; flowSim.ts 65d6d1b7…, surveillanceMap.ts fbe8d62c…, SurveillanceConsole.tsx a5bee6ad…, PartyWorkbench.tsx b137182b…). Nothing pushed to GitHub.

---

## Increment — close the loop: ticket lifecycle + provenance link + genuine seal re-verification (Checkpoint 4) (2026-09-14)

**Scope (the group-1 "close the loop" items):** (1) the ticket lifecycle actually closes — grab → assigned → propose → **disposition & close** — and the ticket leaves the queue; (2) NLQ/workbench cite the **ledger entry** that backs the detection (answer→record→hash provenance); (3) a genuine **re-verify seal** on the forensic log. Files: `flowSim.ts`, `useOperatingSim.ts`, `PartyWorkbench.tsx`, `OperationsBoard.tsx`, `SurveillanceConsole.tsx`, `FlowBoards.tsx`, `ProcessFlowBoard.tsx`.

**Engine:** `LiveTicket` gained status `New|Assigned|Proposed|Closed` + `disposition` + `sealSeq` (the ledger seq of the minting detection) + `proposedLabels`. `proposeOutbound` keys on the live ticket and is idempotent (no double-seal, no seal on closed/evicted). `closeCase` appends a sealed CLOSURE record (evidence is never deleted) with an optional rationale. `verifyEntry(seq)` re-derives one entry's hash from its stored fields against the prior link — a real, deterministic integrity re-check (true on clean, false after tampering any field).

**Framework — adversarial-AFTER (verified against the tree) → CONDITIONAL-GO; all findings closed before landing:**
- **F1 (HIGH) — CLOSED:** the "sealed evidence #{seq}" cite could age out of the retained ledger window and dangle. The cite now checks retention and labels an aged-out seq honestly ("aged out of the retained window — full ledger server-persisted").
- **F2 (HIGH) — CLOSED:** a CRITICAL fraud lead could be cleared in one click with no rationale or second seat. Closing a critical case now requires a **sealed rationale**, and clearing a critical case requires a **second-reviewer (segregation-of-duties) sign-off**, with a 42 CFR 455.23 / MFCU-referral reminder; the rationale is sealed into the closure record.
- **F3 (HIGH) — CLOSED:** "resolved (governed action stands)" overclaimed a merely-proposed (human-gated, pending release) action. Closure wording is now "dispositioned (any proposed action remains pending human release)", aligned with the Surveillance disposition label.
- **F4 (MED) — CLOSED:** the sibling Process-flow (Inspect) board still said "WORM · append-only · HMAC-sealed" / "Ledger entry (WORM)". Reconciled to "hash-chained · append-only (re-derivable, illustrative)" across that board so the whole demo speaks one honest vocabulary.
- **F5 (MED) — CLOSED:** `proposeOutbound` is now engine-idempotent (seal moved inside the guard + dedupe per (ticket, action)); verified a duplicate propose adds one record, not two.
- **F6 (MED) — CLOSED:** the button carries the honest claim — "↻ Re-verify seal" / "✓ seal holds" (not "Reproduce"), so it no longer implies re-running the analysis.
- **F7 (LOW) — CLOSED:** disposition requires a resolvable live ticket (`canAct` gates on the live object, not a stale key) — no orphan seals on evicted tickets.
- **F8 (LOW) — CLOSED:** closed cases now leave the Surveillance feed and Operations selection too, so "leaves the queue" is uniform; the workbench banner says "open baskets."

**Verification:** `tsc --noEmit` clean; determinism holds (lifecycle functions consume zero RNG); `verifyEntry` genuine (true clean / false after tamper); idempotent propose (+1 not +2); post-close guards no-op; ledger intact; client-safe boundary intact in the changed files; screenshots confirmed the closed counter, the sealed CLOSURE record ("CASE CLOSED — cleared, not FWA · rationale: …"), the ✓-seal-holds re-verify, the provenance cite, and the critical-clear rationale+second-reviewer gate — no page errors (only the sandbox font-proxy block).

**Landed byte-verified** to `C:\GBS\Clients\State of NY\Finalrhtpdemo` (7 files; flowSim.ts 10e5dfd2…, PartyWorkbench.tsx 13fa00dd…). Nothing pushed to GitHub.

**Remaining backlog (from this pass's "missed"):** recorded rationale is now captured on close but there's no modeled REOPEN transition; no appeal-rights back-reference on an analyst closure; the provenance cite is one-directional (ledger row has no back-pointer to its case); segregation-of-duties is modeled only on critical clears. These, plus the earlier group-2/3 items (a genuinely-computed detector, real NLU, multi-tenancy, `next build` + a11y + a vitest suite), remain.

---

## Increment — Diane Novak · Medicare Advantage scenario (Steps 1–2): selectable MA scenario + clock-jeopardy governed advisory (2026-09-15)

**Scope:** add a second, selectable operating scenario — **Diane Novak · Medicare Advantage (Part C)** — alongside the default WA-Medicaid book, from the user's `Diane_Novak_PA_Story_Storyboard_v3.html`. Step 1 laid the scenario foundation (descriptor, hero seed, MA vocabulary, determinism isolation). Step 2 added the **clock-jeopardy detector** + a **governed UM advisory ticket** (Beat 8). Real names kept, labelled illustrative (user decision). Files: `scenarios.ts` (new), `flowSim.ts`, `e2eFlow.ts`, `nistMap.ts`, `OperationsBoard.tsx`, `FlowBoards.tsx`, `useOperatingSim.ts`, `tests/goldenThread/{dianeScenario,determinismPin}.test.ts`.

**Domain grounding (MA vs Medicaid):** the hero is an **administrative cert-gap** — the payer has no provider-certification attestation on file (non-clinical, a linkage gap, not a missing clinical document). Part C citations: 42 CFR **422.572** (72h expedited organization determination), **422.572(f)** (deemed adverse on timeout), **422.590/592** (reconsideration → CMS IRE), **422.402** (federal preemption of state UM), **CMS-10003** Integrated Denial Notice. The scenario carries none of the Medicaid vocabulary (438.x / NABD / 455.23) — the ticket routes to **Payer · UM Operations (timeliness)**, never the Medical Director, and the detector is advisory (it decides nothing; a human owns the clock).

**Framework — adversarial-BEFORE (design) then AFTER (shipped code); the AFTER pass reshaped the engine before landing.**

Adversarial-BEFORE (Step 2) caught a HARD timing bug pre-code: the detector anchored to `kbStart` (which resets every kickback phase) would NEVER fire — fixed with a stable `certPendStart` anchor set once at pend launch, `JEOPARDY_TICKS=6` < the ~12-tick kickback. Also folded in before coding: a single `seedTicketByRef` resolver (else empty detail panel), a distinct `CLOCK-JEOPARDY` algorithm (≠ the `DEEMED-ADVERSE-TIMEOUT` failure), and auto-close on the Path-A save.

Adversarial-AFTER (rhtp-delivery-framework:adversarial-reviewer, verified against the tree) returned **1 HIGH + 3 MED + LOWs**; the HIGH and the two load-bearing MEDs were fixed and re-verified before landing:

- **HIGH — CLOSED (badge ↔ provenance contradiction):** `seal()` clamped **every** non-human act down to the earned ceiling, so at cold-start A0 the clock-jeopardy **A1 advisory** record was rewritten to **A0 · watch** — contradicting its own A1 ticket badge (which `displayAuthority` correctly exempts as human-gated) and the "ledger shows the authority actually exercised" claim. Root cause: `seal()` and `displayAuthority` disagreed for advisory acts. Fix (single-sourced): the earned-clamp now fires **only for autonomous action above Advise** (`want > 1`) — an agent may always detect and advise a human, so A1 detection/advisory seals (clock-jeopardy **and** the pre-existing fairness-screen) record A1 honestly instead of A0. Systemic, not Diane-local. Re-pinned the determinism snapshot (`186448701 → 2487355187`; ledgerSeq/tick/ticket-count unchanged — a pure rung-recording correction, zero RNG/behavioral drift). Regression test asserts the detection seals A1 / oversight ≠ watch, and `earnedAuthority.test.ts` was corrected to the true invariant (autonomous-only cap; advisory A1 exempt and non-vacuously present).
- **MED — CLOSED (express bypass eats the narrative):** once the fleet earned A2, the cert-gap hero could be selected for the express (no-human) payer path, which skips the `rfi` substep where `certPendStart` and the whole clock-jeopardy story live — silently deleting the feature on stage. Fix: `txn.express = … && !txn.certGap` (RNG drawn regardless → determinism-neutral on the default book).
- **MED — CLOSED (gold-card bypass, same class — found while fixing the above):** at the autonomous band (A3) the hero was instead **gold-carded** (PA waived), which also skips UM. Domain-wrong besides — you cannot waive PA for a provider whose certification attestation isn't on file. Fix: `txn.goldCarded = … && !txn.certGap`. Test now asserts the hero takes **neither** bypass even at maturity 1.0 / earned A3, and clock-jeopardy still fires.
- **MED — CLOSED (Operations dead-ends after auto-close):** the single advisory ticket auto-closes ~6 ticks after it mints and nothing else mints on this scenario, so the tab fell back to a false "press Play" empty panel — the actual "resolved within clock" **win** was thrown away. Fix: the RESOLVED hero ticket stays selectable in its basket (badged **✓ RESOLVED**), the detail panel auto-selects it and shows a green "✓ Resolved within the expedited clock · caught at tick N — attestation located in the member evidence record; the 72h clock never lapsed; the advisory did not decide the outcome" banner, and the empty-state copy is scenario-aware.
- **NOTED (not built this pass):** the detector is a fixed pre-expiry delay, not modeled clock arithmetic (labelled "preemptive early-warning, NOT a determination"); the SLA bar (SPAN=120 ticks) is decoupled from the stated 3h expedited remainder (the RESOLVED state sidesteps it); minimum-necessary/segmentation note to carry onto the `evidenceRef` anchor before Step 3 attaches member-level data. Carried to Step 3 (cert-gap resolver + maturity ladder + evidence-record data product).

**Determinism isolation (the hard invariant):** the default `wa-medicaid` stream stays byte-identical — all `diane-ma` behaviour is gated on `txn.hero`/`txn.certGap` (set only under the Diane scenario), the detector/mint/close consume zero RNG, and the two engine gates above are drawn-regardless. Verified: `createSim(20260914)` default and diane-ma share the identical warm start-state hash (2487355187); the detector never fires and `TKT-DIANE-CLK` never mints on the default book.

**Verification:** `tsc --noEmit` clean; full golden-thread + property suite **268 passed** (incl. the new Step 2 + regression tests); ledger/analytics/timeline/integrity suites green (the advisory-clamp change rippled nowhere else). Live headless screenshots under `diane-ma` confirmed both states — the live advisory (D1 · A1 · Advise · HUMAN-GATED, queued to Payer · UM Operations, full RCA + recommendation) and the auto-closed RESOLVED card — with no page errors (only the sandbox font-proxy block). Client-safe boundary intact (scenarios.ts is pure data; no `@/lib/evidence` barrel / `node:crypto` in any changed client file).

---

## Increment — reconciliation agents end-to-end: CAS/CARC classification, sealed audit trail, four governed handoffs + a dedicated Reconciliation board (2026-09-15)

**Scope (user):** "have got the reconciliation agents working across the transaction end to end with necessary insights, audit trail, etc interacting with other processes/agents." Decisions taken: a **dedicated Reconciliation board/tab** + **all four handoffs** (recovery/appeal, SIU systematic-pattern, provider Rev-Integrity, payer re-adjudication). Files: `reconcile.ts` (new pure module), `flowSim.ts`, `e2eFlow.ts` (new `payer-config` role), `nistMap.ts`, `ReconciliationBoard.tsx` (new), `FlowBoards.tsx`, `useOperatingSim.ts`, `tests/goldenThread/reconAgent.test.ts` (new).

**What it does:** on every 837→835 settlement the recon agent classifies the CAS/CARC delta (clean / contractual-writeoff / underpayment / overpayment / bundling-downcode / timely-filing / member-liability-review), appends a per-claim row to a **reconciliation sub-ledger** (its own append-only hash chain), aggregates portfolio **insights** (recoverable, 60-day returnable, top-CARC drivers, systematic patterns), and drives **governed handoffs** across a **two-sided seat model**. Reuses the real domain primitives (X12 CO/PR/OA/PI group semantics per `carcGroup.ts`; the `isSubmission`/adverse gate in `decisionGate.ts`; `proposeOutbound`'s earned-gate).

**Framework — adversarial-BEFORE (design) then AFTER (shipped code); BOTH reshaped the build materially. This audience's whole game is honesty, and the recon layer crosses an institutional boundary.**

Adversarial-BEFORE (design, pre-code) returned **4 HIGH + 4 MED**, all folded in before a line was written:
- **HIGH — seat boundary:** the recon stage is provider-side; one agent cannot drive payer SIU/re-adjudication. → modelled **two-sided**: provider-side owns underpayment(→appeal)/bundling(→coding); payer-side owns overpayment(→60-day return)/systematic-pattern(→SIU)/fee-schedule(→config). Neither acts inside the other; a cross-wire finding is a governed submission.
- **HIGH — fail-open:** `837-corrected` ≠ the gate's `x12-837-corrected`. → dropped 837-corrected entirely (the tree's own TKT-4472 RCA forbids it for a payer config defect); used exact governance strings.
- **HIGH — one-ledger story:** a separate recon chain fragments tamper-evidence. → kept separate for determinism BUT `reconIntact` is ANDed into the earned-authority integrity gate (fail-closed extends to it) and records are **bidirectionally linked** to the main ledger (`mainSealSeq` up, `reconRecordSeq` down).
- **HIGH — wrong remedy:** 837-corrected for a mis-loaded fee schedule. → payer-internal reprocess (new `payer-config` seat), not a provider resubmission.
- **MED — dead pattern / thin insights:** claims enter once (~6). → warm the sub-ledger RNG-free (64 records) with a designed underpayment cluster so patterns + insights are real on first paint; the 835 remittance pulse also reconciles live each cycle.
- **MED — incoherent tuples:** independent hash slices could emit a CO row billed to the member. → ONE class drawn from the id-hash; group/CARC/member-liability from a frozen per-class spec (mirrors `deriveMemberLiability`).
- **MED — Medicaid PR:** members generally can't be balance-billed → a PR is a review signal, not a benign "member owes." → `member-liability-review` class that surfaces.
- **MED — role mismatch, + the missed overpayment/60-day direction:** added `payer-config`; added the compliance-heavy **overpayment → 42 USC 1320a-7k(d) 60-day report-and-return** direction the design had omitted.

Adversarial-AFTER (shipped code, verified against the tree) returned **2 HIGH + 4 MED + 2 LOW**; the HIGHs and load-bearing MEDs closed before landing:
- **HIGH — double-mint:** a live-disputed underpayment auto-minted `UNDERPAY-CONTRACT` AND showed on the board as un-routed (no back-link) → clicking "Draft appeal" minted a SECOND ticket (the exact duplicate-claim defect TKT-4472 warns of). **Fixed:** the pend branch stamps the auto-minted ticket with `reconRecordSeq` and marks the record routed → the board shows it resolved, never offers a second appeal (regression test added: a live-disputed underpayment links exactly one ticket).
- **HIGH — gate was a hand-set boolean:** `routeReconHandoff` gated on `spec.humanGated`, never the predicate, and `member-liability-review` already diverged (a refactor could fail-open). **Fixed:** gate = `actionRequiresHuman(actionType) || spec.humanGated` (the governance predicate is the source of truth); `member-liability-review` actionType → `balance-bill-review` so the adverse predicate itself requires a human. Test proves an appeal stays **PROPOSED even after the fleet earns A2** (the real invariant cold-start couldn't show).
- **MED — scenario leak:** the recon tab rendered WA content under diane-ma and routing bypassed the Medicaid-ticket suppression. **Fixed:** the tab is placeholdered under non-default scenarios; both route functions carry the `seedMedicaidTickets` guard.
- **MED — wrong owner:** member-liability routed to the fee-schedule desk. **Fixed:** → payer Program-Integrity.
- **MED — confounded tests / MED — unlabelled payers.** **Fixed:** added the earned-A2 PROPOSED test + member-liability/bundling coverage; labelled all recon payer names "(illustrative)".
- **LOW — fragile integrity input** (id parsed from a display string): **Fixed:** `claimId` is a first-class stored field the chain hashes/verifies against. **LOW — dead route** (timely-filing sealed nothing yet claimed routed): **Fixed:** it seals an internal advisory note and points `sealSeq` at it.
- **NOTED (deferred, disclosed):** 837↔835 line-level linkage (claim-level modelled); a live 60-day jeopardy detector (the clock is surfaced but not yet a detector like the PA clock); the classification is a modelled distribution over the real `reconciliation.ts` 835 settlement math, honestly labelled.

**Determinism isolation (the hard invariant):** the recon audit trail is RNG-free (id-hash derived) and adds no main-ledger `seal()` / no ticket inside `advance()`, so the default `wa-medicaid` pin is **byte-identical** — chainHead 2487355187, ledgerSeq 250, tick 684, tickets.length 9 — verified. The recon chain is separately pinned (reconSeq 89, reconHead 1792988571) so a non-deterministic classification fails CI even if the main ledger holds. Handoffs mint tickets only as user actions (never in advance()), so they never perturb the pin.

**Verification:** `tsc --noEmit` clean; full golden-thread + property suite **287 passed** (incl. 19 new recon-agent pins + the earned-A2 fail-open guard, the two-sided seat pin, tamper-evidence fail-closed, and the no-double-mint regression); ledger/analytics/timeline/integrity suites green (the new `payer-config` role rippled nowhere). Live headless screenshots confirmed the board — insights, two-sided seats, systematic-pattern routing (per-provider), the per-claim CAS/CARC delta table with human-gated vs earned-gated handoffs, the ⏱ 60-day clock, illustrative payer labels, the Part 2 minimum-necessary note — and the routed state (✓ routed advisory / ✓ routed → provider-revint) with no console errors. Client-safe boundary intact (reconcile.ts is pure; no `@/lib/evidence` barrel / `node:crypto` in any changed client file).

---

## Increment — "actions DO something": the underpayment→appeal governed WORKFLOW (artifact + timeline + queue + notifications + modelled response) (2026-09-15)

**Scope (client):** "all these actions need to SHOW something — right now when you click it is a dumb text message"; and, on the Agent Workbench, "run analysis produces nothing." Reflect on workflows-to-trigger, queues, notifications, then check other screens. Decision (after a scoping question): build ONE path end-to-end (underpayment→appeal), recipient side combining a working queue item + a modelled accept/deny response + artifact/notifications. Files: `workflow.ts` (new), `flowSim.ts`, `reconcile.ts`, `nistMap.ts`, `WorkflowPanel.tsx` (new), `NotificationStrip.tsx` (new), `ReconciliationBoard.tsx`, `OperationsBoard.tsx`, `PartyWorkbench.tsx`, `useOperatingSim.ts`, `tests/goldenThread/{reconAppealWorkflow,reconAgent}.test.ts`.

**Diagnosis (the audit the client asked for — "check other screens"):** the demo had **two disconnected data planes**. Plane 1 (live sim: Operations/Reconciliation/Surveillance) was data-rich but every action just sealed a one-line ledger record. Plane 2 (the Agent Workbench, genuinely wired to the real Wave-8/9 endpoints) ran over a **persisted Evidence Record with no remittance/recovery**, so "Run analysis" honestly returned "no denial to analyze" and "Approve" had "nothing to submit." Operations' "Open in workbench" bridged rich→empty. So "critical/action" badges were cosmetic and nothing was actionable.

**What a click now DOES (underpayment→appeal):** instantiates a `Workflow` that (a) auto-runs an agent step producing a rendered mock **appeal-packet artifact** ("not transmitted"), (b) advances a **provenance-linked status timeline** (assemble → review → release → payer response, each sealed to a ledger seq), (c) lands as a **work-item in the recipient seat's queue** with **notifications** (assigned / approval-needed / released / response-received / sla-warning), and (d) resolves via a **MODELLED payer accept/deny response** — accept posts a modelled 835 and only THEN asserts recovery; deny mints an arbiter (appeal-of-appeal) work-item. The workflow renders on the Reconciliation board, in Operations ticket detail, and in the Party workbench (so "Open in workbench" is no longer a dead end).

**Framework — adversarial-BEFORE (design) then AFTER (shipped code); BOTH reshaped the build.**

Adversarial-BEFORE reframed hard and prevented over-building: the pain is *invisibility of effect*, NOT the absence of a workflow platform. It flagged (all folded in): the queue/notification server modules are node-only (re-express client-side); do NOT run a parallel status machine (single-source `ticketStatusFor` projects the ticket status from the workflow); never assert "$ recovered / Resolved" over a not-transmitted mock (recovery only on a modelled 835); model the payer response as a real accept/deny branch, not a timer flip; integer-tick clocks (no wall-clock); idempotent per-step seals; segregation of duties on release; anchor SLA to the route tick; SLA sweep RNG-free + no-op until first user action; bidirectional audit linkage.

Adversarial-AFTER (verified against the tree) returned **0 HIGH** — it re-examined all five honesty invariants and confirmed each holds in the shipped code (submission always human-gated even at earned A3; recovered only after the modelled 835; modelled accept/deny not a timer; artifacts `transmitted:false`; SoD enforced), the pin byte-identical, no crash/fail-open. **5 MED** closed before landing:
- **MED (double-truth $):** the accept branch set `wf.recoveredUsd` but the board's "Recoverable" KPI still summed the same dollars → recovered + still-recoverable simultaneously. **Fixed:** accept back-writes `recoveredUsd` to the recon record; `reconInsights` adds `totalRealizedUsd`; the tile shows "open · realized" split (also closes the "one thread" back-write the sub-ledger was missing).
- **MED (mislabeled disposition):** a denied+escalated appeal read `cleared` (false-positive). **Fixed:** added `escalated` disposition; accepted→resolved, denied→escalated, rejected→cleared.
- **MED (eviction zombie):** the in-flight appeal ticket could be truncated off the 12-cap while the workflow lived on → its queue item vanished under load. **Fixed:** `capTickets` never evicts a ticket backing a non-terminal workflow (identical to newest-12 truncation when no workflows → warm-up byte-identical).
- **MED (two SLA clocks):** the Ops burn-down used a fixed 120-tick span while the workflow used 144 ticks. **Fixed:** single-sourced on `slaHours × TICKS_PER_HOUR`.
- **MED (dual entry):** `routeReconHandoff` and `startAppealWorkflow` could both fire on one underpayment. **Fixed:** the underpayment class now delegates to `startAppealWorkflow` (single entry).
- **NOTED (deferred):** partial/counter-offer payer response (binary accept/deny for now); notification strip shows all seats (single-presenter demo); the 835 back-write models a full reprocess (real accepts are often partial). Carried forward.

**Determinism isolation:** no workflow/notification exists during `createSim` warm-up, so `stepWorkflows` is a no-op there — the default pin is byte-identical (chainHead 2487355187, ledgerSeq 250, tick 684, tickets 9; reconSeq 89 / reconHead 1792988571). The modelled response is a pure hash of the workflow id (`mix32` finalizer for good accept/deny distribution — ~68/32), integer-tick clocks, no wall-clock. A new test pins that advancing a sim WITH a live workflow leaves `rngState` and `chainHead` identical run-to-run (the response path is RNG-free) — closing the near-vacuous empty-case-only determinism test the after-pass flagged.

**Verification:** `tsc --noEmit` clean; full golden-thread + property suite **301 passed** (incl. 14 new workflow pins — lifecycle, SoD, submission-human-gated-at-A3, no-recovery-until-835, deny→arbiter, KPI netting, eviction survival, determinism-with-workflow, notifications). Live headless screenshots confirmed the whole path with **zero console errors**: the review stage (notification + timeline + artifact + Approve/Reject), and the resolved deny stage (arbiter escalation, 4-notification trail, reviewer≠releaser, no fake recovery). Client-safe boundary intact (workflow.ts is pure; no `@/lib/evidence` barrel / `node:crypto` in any changed client file).

---

## Fix — the Agent Workbench entry point: real grounded analysis + clickable seat queue (2026-09-15)

**Scope (client):** "still not output when I run the analysis — this is the entry point when I go to workbench — bad feel"; and "I can't do anything when it says critical or action beneath — that feels wrong." Files: `SeatAnalysisPanel.tsx` (new), `PartyWorkbench.tsx`, `FlowBoards.tsx`. UI-only — no engine change.

**Diagnosis:** the workbench had two dead surfaces at its entry. (1) "Run analysis" called the real Wave-8 endpoint over a persisted Evidence Record that reads **empty in dev** — the in-memory store isn't shared between the RSC render (`persistSeedThread` → `runOrderToCash`) and the `/api/evidence` route process — so it honestly returned "no remittance on record — no denial to analyze." (2) The "LIVE TICKETS IN THIS SEAT" cards were plain `<div>`s badged critical/action but **not clickable** — nothing to act on.

**Fix:** ground the entry in the LIVE operating record (always populated, deterministic) instead of the empty server plane. `SeatAnalysisPanel` runs the same class of analysis (adjustment/denial root-cause over CARC groups) over the recon sub-ledger, side-scoped: Payer → overpayment returnable + PR member-liability; Provider → underpayment recoverable + bundling, with a one-click **"Draft appeal on the largest underpayment"** that starts the governed workflow AND opens it in the notebook. Every seat-queue card is now a button ("Open →") that loads the ticket into the actionable notebook (grounded RCA + connected sources + the governed WorkflowPanel). Honesty: labeled "grounded on the live operating record · real classification + arithmetic; mock channel, not transmitted" (the "LIVE-WIRED real endpoints" claim, which produced nothing, was replaced with the accurate grounding claim).

**Verification:** `tsc --noEmit` clean; full golden-thread + property suite **301 passed** (engine untouched → determinism pin unaffected). Live headless screenshots confirmed both lenses now render a real finding (Payer $1,226 returnable across post-pay-audit/PR-3; Provider $3,345 recoverable across CO-29/CO-97/CO-45) with clickable "Open →" seat queues — **zero console errors**. Client-safe boundary intact.

---

## Increment — the workbench as a LIVE analytic notebook: running queries, charts, multi-turn chat, collapsible cells (2026-09-15)

**Scope (client):** "everything is pre-load, nothing shows an actual running response to query — it looks like wireframe"; "we need scenarios where nothing is pre-loaded and analysis runs inquiry — scatter plot, trending chart"; "improve the analytic sophistication, the chat interactivity"; "Source systems cell takes too much screen — should pop out"; "the whole screen needs work"; "apply in other areas with the same analytic theme." Decisions (asked): all four analytic stories + a multi-turn conversation. Files: `analyticsTheme.ts`, `chartSpec.ts`, `analytics.ts`, `charts/Chart.tsx`, `flow/AnalystChat.tsx` (new); `flow/PartyWorkbench.tsx` (redesign). UI + pure analytics — no engine change.

**What shipped:**
- **A reusable analytic theme + chart kit** (dataviz-method): one VALIDATED categorical palette (six-checks passed on the light surface — CVD worst ΔE 9.6 deutan, normal-vision 17.3, contrast ≥3:1; ran `validate_palette.js`, did not eyeball), fixed-order hues never cycled, reserved status colors. `Chart.tsx` renders scatter / line / bar as dependency-free inline SVG with recessive grid/axes, ≥8px markers, 2px lines, threshold lines, direct labels, a legend for ≥2 series, and a hover tooltip on every mark. Reusable app-wide ("apply in other areas") — one `ChartSpec` contract.
- **A live analytics engine** (`analytics.ts`): four stories, each RUNS over the record and returns narrative + chart + flagged outliers + follow-ups. Program-integrity outlier hunt (service-hours scatter with the >24h impossible point; E&M upcode bar); Reconciliation financials (allowed-÷-contracted scatter over the REAL recon sub-ledger showing the underpayment cluster; CARC-driver bar); Fairness (§1557 four-fifths line with the 0.80 breach); Payer click-deny (overturn-on-appeal bar; decision-latency scatter). Deterministic (hash-seeded, no RNG, no wall-clock); each result labelled REAL (live recon) vs illustrative (modelled series).
- **A multi-turn conversation** (`AnalystChat.tsx`): ask free-text or a chip → a visible querying→computing→rendering state (never reads as pre-loaded) → the answer + chart + outlier flag + follow-up chips + (for the recon story) a one-click governed appeal. Deterministic intent-matching, honestly labelled "pattern-matched, not an LLM."
- **Notebook redesign** (the "screen needs work" + "Source systems hogs the screen"): `NotebookCell` is now collapsible; the Source-systems and Grounded-facts cells default COLLAPSED to a one-line "▸ show" with a summary subtitle; the analytic chat is the star surface at the top of both the idle console and the ticket notebook. The old empty seat-analysis panel and the text-only fielded-fact Ask are superseded / collapsed.

**Verification:** `tsc --noEmit` clean; full golden-thread + property suite **301 passed** (engine untouched → determinism pin unaffected); palette validated by script (light). Live headless screenshots confirmed the charts render and are readable — the CALENDAR-IMPOSSIBLE scatter (impossible point above the 24h line), the §1557 line with the breach threshold, multi-turn follow-ups, and the collapsed reference cells — with **zero console errors**. Client-safe boundary intact (theme/spec/analytics are pure; charts are barrel-free).

**Reusable, not yet everywhere:** the theme + Chart + analytics engine are drop-in for Surveillance and Reconciliation (the "apply in other areas" ask) — foundation laid this increment; extending those boards is the next step.

## Increment — Workbench IA: right-inspector, rebuilt chart, two-mode split, three-lens divergence

- **Design → coalition-before (adversarial-reviewer):** ran R1–R5 on the IA decision (payer/provider lenses over one shared ledger + separating analyst-led exploration from agent-led ticket response). Key findings folded in: the RCA's "widen to the book" step must stay in-frame on the ticket screen; party-specific starters must not become two disconnected BI tools; the click-deny self-audit belongs to the payer/oversight lens.
- **User decisions:** three co-equal seats (payer=program-integrity/click-deny, provider=revenue-integrity, neutral=State oversight), each with its own lead scenario; scope = separate modes + party lenses.
- **Build:**
  - `charts/Chart.tsx` — rebuilt: framed plot area, both-axis gridlines + real x/y tick labels, threshold pill, larger marks, title strip (fixes "chart is poor / disconnected").
  - `flow/PartyWorkbench.tsx` — Source systems / Grounded facts / Ask docked into a right-hand **Inspector** rail (click-to-toggle; no hover/click double-fire); ticket screen now leads with the agent **RCA**, followed by a **case-scoped** "Widen & analyse" chat seeded with the algorithm's book-wide query (`widenQueryForAlgorithm`); idle screen uses **party-specific starters** (`startersForSide`) and gates the appeal CTA to the provider seat.
  - `flow/AnalystChat.tsx` — accepts `starters` / `heading` / `subheading` so the same surface serves exploration (party lens) and ticket-scoped widening.
  - `lib/analytics.ts` — `startersForSide(side)` + `widenQueryForAlgorithm(algorithm)`.
- **Verify:** tsc clean; vitest 3090 passed / 1 expected-fail (determinism pin intact — UI/analytics are pure). Headless-browser checks: inspector expands on click; payer/provider/neutral seats render distinct starters; ticket RCA renders above the widen chat; single case-scoped starter on the ticket; 0 console errors.
- **Honesty:** modelled analytic series still labelled illustrative; recon-scatter/CARC remain REAL over the live recon sub-ledger.
- **Open (deferred, per user scope):** the "same sealed evidence seen through two lenses" side-by-side trust view; balancing real-vs-illustrative so the payer/State lens isn't all modelled; fairness auto-revoke wording ("fail-closed pending risk-adjusted review").

## Increment — Surveillance: the missing governed WORKFLOW/QUEUE hand-off (route → claim → open)

- **Coalition-before (adversarial-reviewer), verbatim user prompt:** "surveillance is running — but should detections trigger a WORKFLOW, build a QUEUE routed to personnel who then use the workbench? There's no workflow — the critical missing step. This doesn't land." Ranked findings that shaped the build:
  - HIGH — `dispositionFor` FABRICATED "Cleared — not FWA" via `stableHash % 3` on untouched `New` tickets → could contradict the same key's live "open, SLA running" state on Operations. Fixed: disposition is now PROJECTED from real ticket state (`dispositionOf`); "Cleared — not FWA" tile counts real human closures only.
  - HIGH — "Open in workbench" teleported past the queue (never claimed). Fixed: `openWorkbenchForTicket` grabs a `New` ticket (New→Assigned) before navigating; on surveillance, Open is gated until claimed.
  - HIGH — "Triggered to {seat}" was a UI caption with no sealed routing record. Fixed: new engine `routeDetection()` seals a `routing` GOVERN record (agent, HOTL·A1 advisory — not earned-clamped) and, for SIU credible fraud, a second `refer-out` HUMAN record (42 CFR 455.23 / 438.608(a)); ticket `sealSeq` re-points at the routing row. Card shows "routing sealed #N" / "refer-out #N · 455.23".
  - MED — "action" severity read as a verb and mapped to calm blue 'info'. Fixed: relabeled to "priority" with a purple variant, consistently on Surveillance + Operations.
  - MED — named owner + SLA + grab were claimed in prose but absent. Fixed: each card shows the named owner (`OPERATORS[role]` / `assignedTo`) and an SLA clock with jeopardy color.
- **User decision (scope):** hand-off + backlog & SoD surfacing.
- **Build:** `nistMap.ts` (routing/refer-out specs) · `flowSim.ts` (`routedSeal`/`referSeal` fields + `routeDetection`) · `useOperatingSim.ts` (`op.route`) · `FlowBoards.tsx` (claim-then-navigate) · `SurveillanceConsole.tsx` (real projection; route→claim→open lifecycle; named owner + SLA; **Queue-health backlog**: unrouted / in-queue / claimed / action-proposed / aging / past-SLA / referred-out; SoD investigative≠clinical at routing) · `OperationsBoard.tsx` (severity relabel) · `surveillanceMap.ts` (honest disposition labels).
- **Verify:** tsc clean; vitest 3090 passed / 1 expected-fail — determinism pin byte-identical (new fields unset at mint; `routeDetection` is UI-only, never in createSim/advance). Headless: 10 "Route to queue" actions; routing a card seals #251 and flips it to "Claim → / Open(gated)"; claiming flips to "Open in workbench"; backlog card + "priority" chips render; 0 console errors.
- **Honesty:** routing/refer-out sealed as real ledger events; still mock channel, nothing transmitted.

## Increment — Gain-Share made real & integrated (both, cleanly separated)

- **Coalition-before (adversarial-reviewer):** the frame was wrong-axis — recovery/reconciliation dollars are PAYMENT-INTEGRITY, not VBC. Must-fixes adopted: recovery never enters the shared-savings split; correctly-signed + MLR-aware flows (underpayment pays provider MORE = a correction; overpayment return reduces incurred claims / MLR numerator, 42 CFR 438.8); HCP-LAN ladder (Cat 3A→3B→4; sub-cap a mechanism within Cat 4, not a rung); actuarial inputs HELD CONSTANT + labelled; 438.4/438.7/438.6(c) governance stated; EPOCH-PIN everything.
- **User decision (frame):** BOTH, cleanly separated.
- **Build:**
  - `lib/gainShare/gainShareEconomics.ts` (NEW, pure, tested): `computeRecoveryRoi` (REAL, from recon sub-ledger — recoverable/realized/returnable, correctly signed, bidirectional MLR note, PHI-safe-synthetic caveat); `computeVbcScenario` (MODELLED — takes NO recovery input, so a leak is structurally impossible) with LAN tiers, held-constant inputs, real Medicaid gating (min-savings-rate + quality gate), multi-year rebasing.
  - `components/gainShare/RecoveryRoiPanel.tsx` (NEW, REAL) + `GainShareModeler.tsx` (NEW, MODELLED: LAN picker, levers, held-constant chips, split bar, **quarantined** recovery, rebasing table, A/B/C compare, 438.6(c) governance chip) + `GainShareBoard.tsx` (composes both) + `GainShareStandalone.tsx`.
  - Integration: new **Gain-Share tab** in `FlowBoards` fed by the shared `op`; `/gain-share` and `/gs-modeler` ported OFF the static iframe onto the real board.
- **Coalition-after (adversarial-reviewer) → fixed before ship:**
  - HIGH epoch-pin drift (panel pinned on mount, modeler `useMemo([op.sim])` — a stable mutating ref): lifted ONE pinned `roi` to `GainShareBoard`, passed to both surfaces; re-pin on scenario change + `key={op.scenario}` remount. Panel/modeler can no longer show different epochs.
  - HIGH/MED narrative reintroduced recovery-as-PMPM + "sub-cap as a rung": removed the recovery series/tile from `FollowTheMoneyChart`; relabelled the glide model to LAN Cat 4 (sub-cap a mechanism within).
  - MED overpayment tense ("reduces … when returned", identified vs returned); MED bidirectional MLR note; LOW held-constant chips no longer include the live MSR/quality levers; LOW PHI-safe-synthetic caveat carried onto the panel.
  - Noted, not in scope: `/gt-recovery` still iframes a since-deleted mock (pre-existing broken route) — flagged to the user.
- **Verify:** tsc clean; vitest 3098 passed / 1 expected-fail (+8 new gain-share tests); determinism pin byte-identical (pure/read-only; engine untouched). Headless: Gain-Share tab renders both surfaces, LAN ladder, governance chip, quarantined recovery, epoch stamps; narrative shows 0 recovery-PMPM tiles / 0 "sub-cap rung" / LAN Cat 4 aligned; 0 console errors.

## Increment — Prior-Auth / DTR package integration + generic policy registry

- **Source:** Richard's 17-file `prior-auth-dtr-changes` package (branch fix/cerner-smartapp-hardening). Assessment: target = THIS repo; 4 new + 13 updated files; async ripple (BARIATRIC_DTR_CRITERIA→getBariatricDtrCriteria) fully self-contained; 0 missing imports; runtime PDF asset present; no overlap with the golden-thread/gainShare engine or determinism pin.
- **Part A — drop-in (as-is):** applied all 17 after a pre-flight (all at clean committed baseline; all relative deps present). Headline: bariatric CG-SURG-83 DTR criteria now derive LIVE from the real policy PDF via the shared dtrCriteriaFromReview encoder (was a hand-typed 14-of-27-code fixture silently misrouting 13 codes to lumbar-MRI). tsc clean; full vitest 3100 pass; pin intact.
- **Part B — generalization (user goal: "work generically against any policy"):** replaced the hardcoded bariatric dispatch with a data-driven CPT→policy registry:
  - NEW `lib/policy/dtr/evaluate/policyRegistry.ts` + `policyRegistry.data.json` — generic loader (per-pdf cache) + `resolveLivePolicy`/`getDtrCriteriaForCpt`/`evaluateLivePolicy`/`policyById`. Adding a supported policy = a JSON row + a PDF.
  - `bariatricCriteria.ts` → thin compat shim (keeps BARIATRIC_CPT_CODES / getBariatricDtrCriteria for callers/tests); `devStubs.dtr.ts` dispatch → generic `evaluateLivePolicy`.
- **Coalition-after (adversarial-reviewer) → must-fixes applied before land:**
  - HIGH rejected-Promise cache poisoning + uncaught throw → permanent 500: loadReview now evicts a rejected promise; `/api/dtr/evaluate` wraps the stub call and returns a clean 502 (fail loud, never crash).
  - HIGH/MED misconfigured registered row fell OPEN to the lumbar-MRI canned scenario: `evaluateLivePolicy` now returns `undefined` ONLY for unregistered codes; a registered-but-broken row (missing bundle, parse failure, or hollow/unsupported criteria) THROWS — never falls open.
  - HIGH honesty: corrected the "any policy" claim in code/JSON to the real age/BMI/obesity-comorbidity boundary (generic plumbing, obesity-specific semantics); flagged CG-SURG-83 as an Elevance commercial exemplar, not a Medicaid criteria set.
  - MED magic-string shim: BARIATRIC_CPT_CODES now derived via `policyById('CG-SURG-83')` (throws loud if the row is renamed/removed) instead of a `resolveLivePolicy('43644') ?? []` empty-set-on-miss.
  - MED NLM BFF hardening: `/api/pa/code-lookup` now bounds the term (`^[A-Za-z0-9]{1,8}$`) and adds `AbortSignal.timeout(2500)`.
  - New `tests/policy/policyRegistry.test.ts` locks the sentinel/fail-loud/dup-free invariants.
- **Deferred (documented follow-up, not a blocker):** generalize `dtrCriteriaFromReview` to render arbitrary computable measures (LVEF/eGFR/HbA1c/…) so non-bariatric policies evaluate through the real engine rather than canned scenarios; a second-policy end-to-end test; dispatch observability metric; multi-tenant cache scoping.
- **Verify:** tsc clean; vitest 3105 pass / 1 expected-fail (+5 registry tests); determinism pin byte-identical. Runtime smoke: 43644 & the previously-misrouted 43848 → live Bariatric evaluation; unregistered 72148 → canned lumbar fallback; junk HCPCS term → rejected pre-call. 0 console errors.

## Increment — Generic computable-criteria encoder (the deferred DTR follow-up, made real)

- **Trigger:** the prior increment's documented follow-up — "generalize `dtrCriteriaFromReview` so non-bariatric policies (LVEF/eGFR/HbA1c/…) evaluate through the real engine, not canned scenarios." User: "address this … ensure agent coalition is engaged."
- **Coalition-before (adversarial-reviewer, R1–R5) → design changed:** the naive "widen the age/BMI lift" plan was rejected as making the demo LESS honest. Must-fixes adopted into the design: (1) don't flatten the boolean tree — lift from pathway leaves with AND/OR structural required-ness; (2) don't lift exclusions/negated as positive gates, and actually EXPORT the field→LOINC map (it wasn't exported — the "reuse single source" claim was fiction); (3) unit-mismatch must be a gap, never a cross-unit wrong "met"; (4) don't double-count nested children; (5) `isHollowCriteria` must count only VALID computables so a junk measure can't mask a parse failure. Key discovery: the repo ALREADY ships a three-valued, fail-closed, tree-aware engine (`evalMeasure`/`evalExpr`/`evaluatePolicy`) — so reuse its leaf comparator rather than build a parallel one.
- **Build:**
  - `encode/fhir.ts` + `encode/index.ts` — EXPORTED `MEASURE_LOINC`, `measureLoincCode`, `isExclusionCriterion` (the real single source of truth).
  - `dtr/evaluate/patientEvaluation.ts` — `ComputableCriterion` type + optional `computable[]` on `DtrCriteria`; `normUnit`/`unitsCompatible` (UCUM-aware fail-closed unit guard); `readField`/`factsForComputable` (record→facts, unit-guarded, LOINC-set match); a generic group appended per computable via the SHARED `evalMeasure`; scoped OR-alternative `orSatisfied` guard on `allMet`.
  - `dtr/evaluate/dtrCriteriaFromPolicy.ts` — `collectLeaves` walks each eligibility pathway's BoolExpr (tracks `underOr`, drops leaves under `not`); lifts non-age/BMI, non-excluded, non-review-flagged, LOINC-mapped measure leaves into `computable[]` with structural `required`; unmapped/review-flagged measures → documentation gaps (`addMeasureDoc`), never silently dropped.
  - `dtr/evaluate/patientData.ts` — `MEASURE_LOINC_ALIASES` (per-field LOINC set) + `latestObservationAny`; NEW `cardioRenalPatientBundle` test/demo fixture (LVEF 30 %, eGFR 22, HbA1c 8.2 %) proving live record reads.
  - `dtr/evaluate/policyRegistry.ts` — `isValidComputable` (compound-first; finite value + legal op + resolved concept) folded into `isHollowCriteria`; SCOPE note rewritten to the true boundary.
- **Coalition-after (adversarial-reviewer) → must-fixes applied before land:**
  - HIGH — `allMet` re-flattened the tree (fail-open on an all-alternatives-unmet OR). Fixed: scoped `orAltPresent`/`orAltMet` → `allMet` requires ≥1 alternative met when alternatives exist; bariatric (`computable=[]`) unaffected.
  - HIGH — `reviewFlag` bypassed (an OCR-ambiguous measure auto-evaluated). Fixed: `crit.reviewFlag` → documentation gap in the lift.
  - HIGH — `isValidComputable` rejected EVERY compound (BP) measure via dead code (scalar guards ran first) → a compound-only policy wrongly failed loud. Fixed: compound branch checks sub-measures first.
  - MED — single LOINC per field mislabeled a real variant-coded result as "no result." Fixed: `MEASURE_LOINC_ALIASES` + set match; gap copy softened.
  - MED — `normUnit` missed real UCUM (`mL/min/{1.73_m2}`, `µ`, `^`). Fixed: fold `µ/μ→u`, strip `^`/`{}`/`_`, `²→2`.
  - Claim narrowed to what's built (LOINC-mapped scalar/compound gates; single OR-pool); deferred workstream disclosed in both the `.ts` SCOPE note and the JSON `_note`.
- **Verify-the-fix (adversarial-reviewer, focused):** 6/6 RESOLVED. Caught ONE regression I introduced — the `glucose` alias set conflated fasting (1558-6) / glucometer (41653-7) with generic glucose (same mg/dL unit, so the unit guard can't separate them → a random glucose could satisfy a fasting-glucose gate). Fixed: `glucose` alias set trimmed to generic serum/plasma codes only; regression locked by a test.
- **Deferred (documented, not blockers — a full `evalExpr` verdict would subsume most):** distinct OR-pools evaluated independently; multi-pathway population gating; coverage-EXCLUSION denial in the group view; needs-info vs not-met distinction (collapsed to `gap` today); `sustainedOver`/temporal windows on a point reading; per-group policy-version provenance; a second live registered policy (needs its own PDF asset).
- **Honesty:** the ENGINE now evaluates any LOINC-mapped quantitative measure from the record (proven by tests over `cardioRenalPatientBundle`); no second live policy is claimed registered; bariatric CG-SURG-83 evaluation is byte-identical (`computable=[]`, pinned snapshot test).
- **Verify:** tsc clean; full vitest 3127 passed / 1 expected-fail (+22 new `computableCriteria` tests, net); determinism pin byte-identical (DTR path is isolated from the operating sim; `evalMeasure` reuse is pure/read-only). Client-safety: deep-module imports only — no encode barrel, no `node:crypto` in a client chain.

## Increment — $member-match input validation + closing the dev-mock "default-to-seed-member" class

- **Trigger:** user asked to clear the single `it.fails` (so CI/GitHub shows 0 non-passing) — `tests/security/input-validation.test.ts` recorded that `/api/match` returns a 200 default identity for a malformed `$member-match` body in dev-mock mode (the `devMockEnabled()` short-circuit ran before the `!parameters` check).
- **Coalition-before (adversarial-reviewer):** the naive "add a Parameters shape check" was too loose. Must-fixes adopted: (1) also require a `MemberPatient` selector — else a well-formed-but-selector-less body still defaults to the seed member AND skips the consent gate (keyed on the member id); (2) audit the dev-mock disclosure success (the route's own CMS-0057-F accounting-of-disclosures claim); (3) don't leave the identical class open at the sibling `bulk/status`; (4) state honestly that `devMockEnabled` is double-gated (demo/non-prod, synthetic seed), so severity is demo-scoped.
- **Build (round 1):**
  - `src/app/api/match/route.ts` — `isValidParametersBody` + MemberPatient-id presence check, both PHI-safe 400, AFTER auth and BEFORE the consent gate; dev-mock success `audit()`; removed the dead live-mode `!parameters` check.
  - `src/app/api/bulk/status/route.ts` — dev-mock branch now requires a well-formed `patientId` (`^[A-Za-z0-9_-]{1,64}$`) → PHI-safe 400.
  - `tests/security/input-validation.test.ts` — `it.fails` → positive 400; added selector-less→400, valid→200, bulk/status missing/injection→400, valid→200.
- **Coalition-after (adversarial-reviewer):** raised MED — the guards locked the front door but `profileFor`/`devMemberMatch`/`devBulkStatus` still `?? MARIA_SD_001`, so a well-formed UNKNOWN id (e.g. ZZZZ) returned the seed member's PHI mislabeled AND could sidestep consent. Recommended a root fail-closed. Round-2 build: added route-local `getPatientById()` → 404 for unknown members (match gate break-glass-exempt so emergency access to synthetic opt-out ids still 200; ordering keeps opted-out → 403 before the 404).
- **Verify-the-fix (adversarial-reviewer):** confirmed round-2 closed the two patched routes but found HIGH — the SAME class was still live at a THIRD, ungated consumer: `/api/fhir/[...path]/route.ts` ClaimResponse branch (`devBulkStatus(pid).paHistory`) returned the seed member's PA history under any unknown id; and a fourth (`pas/submit` → `devClaimResponseApproved`). Root cause: route-local patching is whack-a-mole; the `?? MARIA_SD_001` default must die at the source.
- **Root fix (round 3):** `src/lib/server/devStubs.profiles.ts` — `profileFor(unknown)` now returns a NEUTRAL `PLACEHOLDER_PROFILE` (zeroed counts, empty PA history, 'Unknown Member', no real prior-payer id) instead of `?? MARIA_SD_001`; added `isKnownProfile`. Every consumer (devMemberMatch, devBulkStatus, devClaimResponseApproved, CDS/DTR stubs, and the /api/fhir ClaimResponse branch) inherits the fail-closed default with no per-site guard. Intentional demo defaults (`patientId ?? 'MARIA_SD_001'`) pass a KNOWN id, so they still resolve to real Maria — unaffected. Break-glass with an unknown id now returns a placeholder (not Maria), so the break-glass exemption is benign.
  - `tests/security/seed-default-failclosed.test.ts` (NEW) — the source-level negative test the reviewer said was missing: `profileFor`/`devMemberMatch`/`devBulkStatus`/`devClaimResponseApproved` disclose NO seed-member data for an unknown id; a KNOWN member still resolves to real seeded data.
- **Residuals (logged, demo-acceptable):** the 404(unknown)/403(opted-out)/200(allowed) split is a minor existence/opt-out enumeration oracle on `$member-match` (production hardening: uniform 404 + rate-limit); break-glass to an unknown id returns the neutral placeholder (no real PHI). All dev-mock, synthetic seed, auth-required.
- **Verify:** tsc clean; full vitest 3141 passed / **0 expected-fail** / exit 0 (the recorded `it.fails` is gone — a standard CI check now goes green); determinism pin 2/2 byte-identical. 7 match/bulk/consent/fhir-adjacent suites green (110 passed).

## Increment — Governed ticket-action model across the ops surfaces (the "dumb Grab" + duplicate TKT-4472 fix)

- **Trigger:** user — "add expert process flow (as this grab as it is doesn't make a lot of sense — another dumb action), Operations, Surveillance, and the Party Workbench detail, engage agent coalition." The `LiveProcessFlowBoard` queue dead-ended (`New → Grab`, else a static "Assigned" span) and TKT-4472 appeared twice.
- **Coalition sequence (framework):** architect design → adversarial PRE-review (NO-GO) → user sign-off on 3 decisions → build → adversarial POST-review (GO w/ fixes) → authoritative gate → this entry.
- **Adversarial PRE-review (adversarial-reviewer, R1–R5) → NO-GO; design hardened before any code:**
  - CRITICAL — the architect's determinism claim was INVERTED. `seal()` hashes ONLY ledger fields (never ticket data), so `determinismPin` does NOT move; instead the dedup shrinks the seed ticket count, breaking three `tickets.length` assertions the design never named. Verified in source (`flowSim.ts` seal 625-639; three count tests). Re-baselined consciously.
  - HIGH — a coarse `ticketActions` keyed on the 4-state `TicketStatus` would be a SECOND transition authority contradicting the 8-state `WfState` machine (reviewer≠releaser SoD). Fix adopted: a workflow-backed ticket defers WHOLESALE (`open` only).
  - HIGH — the proposed UI human-gate had no valid input (LiveTicket carries no actionType/adverse). Fix adopted: the shared bar NEVER computes a gate — it executes only non-adverse verbs (grab/route) inline and defers ALL disposition to the workbench, where the engine's own gate + SoD already live.
- **User decisions:** (1) proceed with the mintTicket dedup guard + re-baseline; (2) Surveillance = seat-matched route/grab, defer propose/close (recommendation); (3) relabel the phantom `'action'` severity to a standard healthcare lifecycle label.
- **Build:**
  - `flowSim.ts` — `mintTicket` now returns `LiveTicket | undefined` with a ref-idempotency guard (matches `mintScenarioTicket`/`routeReconPattern`): cursor (`ticketSeq`) advances first, then a catalogue ref with an OPEN ticket returns the existing row instead of unshifting a duplicate. Seed queue 9 (duplicated refs) → 4 DISTINCT refs (TKT-4471..4474). Underpayment auto-mint back-link rewritten off the fragile `s.tickets[0]/bornTick` probe to the returned ticket, claim-once (`reconRecordSeq === undefined`). `notify()` added to grab/route/propose/close (all UI-only → pin-safe: `notify` draws no RNG, seals nothing; `routeReconHandoff`/`proposeOutbound` never run in `advance()`).
  - `surveillanceMap.ts` — new pure `ticketActions(status, ctx)` (single source of the action model): verbs limited to grab/route (inline) + open (defer); Closed→[]; hasWorkflow→[open]; surveillance defers disposition; Assigned/Proposed never dead-end.
  - `opsShared.tsx` — new shared `<TicketActionBar>` (renders `ticketActions`, calls `onAct(verb)`, holds no policy).
  - Adopted on all three ops surfaces, replacing each one's parallel action slice (DRY convergence): `LiveProcessFlowBoard` (dead-end killed; raw `severity` badge → `<LifecycleChip>`; `onOpenTicket` threaded from `FlowBoards`), `SurveillanceConsole` (bespoke detected/routed/assigned buttons → shared bar), `OperationsBoard` `TicketDetail` (lone button → shared bar; workflow tickets still route to the canonical `WorkflowPanel`).
  - Tests: NEW `ticketActions.test.ts` (exhaustive surface×status×routed×hasWorkflow — never emits a disposition verb) + `mintDedup.test.ts` (no duplicate ref in seed or after 400 advances; a manually-appealed record mints a DISTINCT RCLM ref, never a second TKT-4472); re-baselined 3 seed-count assertions 9→4.
- **Adversarial POST-review (adversarial-reviewer) → GO; required narrative fixes applied:**
  - MED — the "disputes fold into one appeal" language was fictional: the Reconciliation board still offers a per-claim "Draft appeal" (a distinct RCLM ticket via `startAppealWorkflow`, not deduped). Fix: corrected the comment + test titles to the honest scope (the QUEUE never shows a duplicate TKT-4472; a later disputed claim stays individually recoverable as its own distinct RCLM appeal — it does NOT silently fold), and added the missing distinct-appeal test.
  - MED — seat-authority: no RBAC guard was added to grab/propose/close. Logged as an intentional SINGLE-OPERATOR DEMO posture (no per-seat RBAC) — the load-bearing SoD that MUST hold (reviewer≠releaser on submissions, adverse always human-gated) is engine-enforced on the workflow path and untouched. Not claimed as an RBAC control.
  - LOW — `PartyWorkbench` still renders raw `'action'` severity at three static (non-CTA) pills; relabeling wrapped past the frozen 1221-line baseline, so it was REVERTED to keep the frozen file intact and logged as a deferred cosmetic follow-up (the flow board — the actual complaint — uses `LifecycleChip`; Surveillance/Operations relabel to 'priority').
  - LOW — corrected a stale "9→8" test comment to "9→4".
- **Honesty:** the bar never asserts an autonomy the engine hasn't granted (it can't dispose at all — disposition is workbench-only under the real gate). Determinism pin byte-identical (chainHead 2487355187 / ledgerSeq 250 / tick 684). No new file exceeds the 400-line cap (`surveillanceMap` 236, `opsShared` 289); `flowSim` baseline 2548→2581 and `OperationsBoard` 586→590 for real feature growth; four stale working-tree baseline entries corrected UP to their committed HEAD values (files unmodified — no masked growth).
- **Verify:** tsc clean; prettier clean; lint (changed files, gate mode) exit 0 (warnings pre-existing); size ratchet PASS; full vitest 3162 passed / 0 failed / 74 skipped (400 files), +the 2 new suites.

## Increment — Operations SLA spine, un-cloned evidence, reconciliation reporting, interactive what-if, multi-channel intake

- **Trigger:** user, after reviewing the running Operations/Process-flow screens — (1) Operations needs an overhaul for the new workflows/queues/notifications with SLA attainment first-class; (2a) make the Stage-1 governance card interactive (Path A — let me change D/A levels); (2b) inbound/outbound isn't only SMART (batch 278, portal, fax) — fix it; (2c) richer per-claim Reconciliation reporting (835 vs loaded contract), not all-or-exceptions. "proceed to end."
- **Coalition sequence (framework):** three thinking lenses (architect + adversarial + payer-SME) → file-level build blueprint → adversarial PRE-review (NO-GO → 6 fixes folded) → build (engine slice first, then 4 workstreams) → adversarial POST-review (GO w/ 2 required fixes, applied) → authoritative gate → this entry.
- **Diagnosis grounded first:** the "only the first case is clickable" Operations bug was the seed-clone — `TicketDetail` derived its whole body from `seedByRef(ticket.ref)`, so same-ref tickets rendered byte-identical (and a static catalogue constant sat under a "grounded in the record" header — the load-bearing honesty defect).
- **Adversarial PRE-review → NO-GO; 6 blockers fixed into the design before code:** (1) the un-clone must REPLACE seed identity, not sit beside it (else a real single-claim record contradicts a catalogue exemplar on one card); (2) SLA scorecard opens at n=0 closed/assigned → attainment over zero is NaN/fake-100% → floor to "—"; (3) the what-if must pass each stage's real actionType/adverse or it shows a submission as auto-executable; (4) recon-routed RCLM/RPAT tickets have no catalogue seed → the detail must render seedless without crashing; (5) labels — "expected realization if pursued" (gated to pursued $), "fee-schedule grouping (derived, illustrative)"; (6) export PHI allowlist + diane-ma empty-state.
- **Build:**
  - W1 — new pure `slaBook.ts` (per-seat + portfolio SLA with an attainment floor → null/"—" below n=5), new `OpsSlaScorecard.tsx`, `TicketExposureEvidence.tsx` (grounded per-claim figures come ONLY from the ticket's sealed recon record; catalogue exposure + RCA shown as a labelled illustrative pattern; renders seedless). flowSim.ts: `assignedTick`/`proposedTick` on LiveTicket (UI-only writes in grab/propose → pin-safe), `slaAtRisk` excludes Closed. OperationsBoard: scorecard mounted; TicketDetail un-cloned; "Queue exposure" (summed cloned constants) removed → "Oldest open" (money single-sourced to Reconciliation); seedless RCLM/RPAT branch added.
  - W2 — new `reconReport.ts` (read-time `feeScheduleVersionOf` id-hash — never persisted; roll-ups by provider/CARC/fee-schedule; `recoveryWaterfall` with expected-realization projected over PURSUED $ only at the real 0.68 accept rate; `claimsForPattern` drill), `reconExport.ts` (explicit PHI-safe `EXPORT_COLUMNS` allowlist + `maskClaimRef` truncating at the CPT token — caught a real leak where remit `claimRef` carried a raw id suffix), `ReconReportPanels.tsx`. ReconciliationBoard: panels mounted, "Recoverable" → "Identified underpayment (pre-appeal)". New `reconExport.test.ts` (allowlist + no raw claimId in a real export).
  - W3 — new `PathAWhatIf.tsx`: interactive D-tier/A-rung explorer recomputing through the SAME `verdict()`/`permittedRung()`, writing nothing to sim/ledger, labelled hypothetical. Gate sourced from new structured `stageGovernance.ts` (StageKey → actionType/adverse), NOT parsed from display prose.
  - W4 — new `intakeChannels.ts` (SMART/278/portal/fax mix per intake stage, per-channel provenance, CMS-0057-F note: PA FHIR API not mandated until 1/1/2027, 2026 clocks bind, not drug PA), `ChannelMixChip.tsx`. Mounted in ProcessFlowBoard StepDetail.
- **Adversarial POST-review → GO (conditional); both required fixes applied:** the what-if gate was recovered by parsing the display `reason` string (a fail-open seam — a reword would silently drop the gate) → replaced with the structured `stageGovernance.stageGate(key)`; and the enhancement honesty invariants had no regression guards → added `opsEnhancements.test.ts` (slaBook cold-start nulls; recoveryWaterfall inDispute≤identified & expected≤inDispute; a DRIFT GUARD asserting `stageGate` reproduces every STAGES stage's real `requiresHuman`; submission stays gated at autonomous·D3 while an ungated stage floats). POST-review verified all 6 PRE blockers resolved in source, determinism intact, export safe, waterfall math sound.
- **Honesty:** one money book (Operations shows operational counts, dollars live on Reconciliation); grounded = only the sealed recon record; catalogue figures labelled illustrative pattern; SLA rates "—" until worked; what-if writes nothing and preserves the submission/adverse gate at every tier; channel mix + 2027-vs-2026 timeline (never all-SMART); export minimum-necessary.
- **Verify:** tsc clean; prettier clean; lint (changed files) exit 0 (warnings pre-existing); size ratchet PASS (10 new files all <400; flowSim 2581→2587, OperationsBoard 590→609, ReconciliationBoard 516→520 for feature growth); full vitest 3169 passed / 0 failed / 74 skipped (+2 new suites, 7 new tests). Determinism pin byte-identical (2487355187 / 250 / 684).

## Increment (polish) — closed the 3 POST-review deferred items
- **Section 508 (WCAG 1.4.1):** the SLA aging bar no longer conveys severity by color alone — added a visible non-zero text breakdown ("<24h 2 · >72h 1") and a `role="img"` aria-label on the bar (OpsSlaScorecard.tsx).
- **diane-ma honesty:** the scenario's own advisory ticket (TKT-DIANE-CLK, $0 exposure) is no longer mislabelled a "catalogue pattern" — the fallback now claims only that no sealed per-claim record is joined, suppresses a $0 "exemplar exposure", and the RCA header reads "illustrative · not grounded in a per-claim record" (TicketExposureEvidence.tsx).
- **Projection wording:** the expected-realization caption now names the approximation explicitly — a per-case accept rate applied to pursued dollars as an indicative estimate that will not reconcile penny-for-penny with realized (ReconReportPanels.tsx).
- **Verify:** tsc clean; prettier clean; size ratchet PASS (no new/bumped baselines — all three files under the 400 cap); golden-thread suite green. No logic/determinism change.

## Increment — sub-tab IA across the Golden Thread boards + payment-integrity party lens

- **Trigger:** user, reviewing the running screens — (1) the surveillance screen "is short on algorithms… only payment-integrity; should surface provider and 3rd-party independent algorithms as well — bring in the coalition, the screen doesn't look optimal"; (2) "image 3 is like 3 screens on 1 — could these be tabs within Reconciliation, and can we apply the same concept to the other Golden Thread screens" — have the lead UI signer + UX-design + software-architect + lead-engineer agents assess, "as I think this problem is across the golden thread."
- **Coalition sequence (framework):** UX-lead + software-architect assessment (both delivered: progressive-disclosure sub-tabs via ONE shared primitive; the tier already lives on `Algorithm.tiers` so the party lens is a filter+reframe, not new data) → build (shared `BoardTabs` primitive → adopt on the top bar → thin the three dense boards into shell + per-sub-tab child panels) → authoritative gate → adversarial POST-review (R1–R5, GO with fixes) → remediation → re-gate → this entry.
- **Build:**
  - `BoardTabs.tsx` — the ONE shared tab primitive: `role="tablist"` + roving tabindex + Left/Right/Home/End + wrap, `level='top'` (underline) / `level='sub'` (pill), optional count badge. Exports `tabPanelProps(ariaLabel, activeKey)` (+ `boardTabId`/`boardPanelId`) so each shell completes the WAI-ARIA contract with a labelled, focusable `role="tabpanel"` the selected tab `aria-controls`.
  - `FlowBoards.tsx` — top tab bar → `BoardTabs level="top"`; content region wrapped as the controlled tabpanel.
  - `SurveillanceConsole.tsx` (581→126 shell) → three child panels: `LiveDetectionFeed.tsx` (feed + `dispositionOf`, exports `Detection`/`Side`), `DetectorLibraryPanel.tsx` (library + PARTY LENS), `QueueHealthPanel.tsx`. `detections` join computed ONCE in the shell and passed to all three (no divergent recompute).
  - `OperationsBoard.tsx` (609→126 shell) → `OpsTicketDetail.tsx` / `OpsWorkBaskets.tsx` / `OpsForensicLedger.tsx`; money stays OFF Operations (single-sourced to Reconciliation).
  - `ReconciliationBoard.tsx` (520→161 shell) → `ReconLedgerPanel.tsx` / `ReconAppealsPanel.tsx`; `openWfSeq` lifted to the shell so the Ledger's "View appeal" lands on the Appeals sub-tab.
  - PARTY LENS (`DetectorLibraryPanel`) — the tier (`Algorithm.tiers`: Payer P / Provider-counter Pr / Neutral N) was invisible, so the board read payer-only. A `role="radiogroup"` segmented control (roving tabindex + arrows) filters by accountable authority; every chip carries its tier label(s) color-keyed AND text-labelled (WCAG, never color alone). Catalogued counts Payer 22 / Provider-counter 15 / Neutral 14 (overlaps intended — a detector can serve two authorities).
- **Adversarial POST-review (adversarial-reviewer, R1–R5) → GO; findings remediated:**
  - HIGH — `BoardTabs` was a half tabs-pattern (no tab `id`/`aria-controls`, panels not `role="tabpanel"`), and the keyboard test was false-confidence (asserted the same key click already produced). Fixed: full tab↔panel ARIA contract via `tabPanelProps` on all four shells; keyboard test rewritten from the MIDDLE tab so Right/Left/Home/End must each resolve to a DISTINCT key, plus wrap + roving-tabindex assertions.
  - MED — Operations caption `{s.tickets.length} open` counted Closed tickets while the tiles/badge used open-only (two "open" numbers on one board). Fixed to `openCount`.
  - MED — party-lens headline/badges (40 / 22-15-14) carried no scripted qualifier → skim-readable as "all live-wired." Fixed: headline now "{40} catalogued ({7} scripted)"; a note states the live-scripted subset per authority (Payer 4 · Provider-counter 3 · Neutral 4); a test asserts "catalogued"+"scripted" qualifiers are present.
  - MED/LOW — R1 operator-boundary + neutral-label drift: canonicalised the neutral authority to "Neutral / 3rd-party" (headline prose matches the pill; chip uses compact `TIER_LABEL`).
  - LOW — the segmented control was `aria-pressed` toggles with no arrow nav → converted to a proper `radiogroup`/`radio` with roving tabindex + arrow/Home/End.
  - R2 negative-space: added a PHI regression guard rendering the new panels against real sim state and asserting NO PHI-shaped tokens (SSN / member-numeric-id / MRN·value / DOB·value) reach the surface.
  - UPHELD by the reviewer: client-safe boundary (no `@/lib/evidence` barrel / `node:crypto` in any new panel), single-source money, the shared-state split (`detections`/`openWfSeq`), and the 22/15/14 arithmetic (verified line-by-line vs `library.ts`).
- **Honesty:** behavior-neutral extraction — the sub-tabs render the same governed content, projected from real ticket state (a sub-tab can never disagree with the Operations queue on a key); the party lens surfaces a tier that already existed rather than inventing detectors; catalogued vs live-scripted counts are now both stated.
- **Verify:** tsc clean; prettier clean; lint (changed files, gate mode) exit 0; size ratchet PASS (all 9 new panels <400; the three boards dropped from the over-cap baseline — 609/520/581 → 126/161/126, ratchet tightened); E13 test-link PASS (13 candidates, 0 untested — `boardPanels.test.tsx` + `flowBoards.test.tsx`); full vitest 3202 passed / 0 failed / 74 skipped (406 files). Determinism pin untouched (no seal/hash path changed).

## Increment — Process-flow REDESIGN (duplicate): the "Authorization Spine" (v2 tab)

- **Trigger:** user — "the process flow screen needs the same love… definitely needs an agent coalition to make [the] flow more intuitive as it['s] hard to connect everything; for this screen DUPLICATE the screen first and work on adjust that one so the old version is retained for comparison (make sure you understand this)." User decisions taken via sign-off: keep the live animation PROMINENT (not behind a toggle); expose the redesign as its OWN top-level tab.
- **Coalition sequence (framework):** architect (Plan) + UX/payer-SME design lenses → user sign-off on concept + duplication mode → specialist build (one agent, frozen interface) → authoritative gate → adversarial POST-review (R1–R5) → remediation → re-gate → this entry.
- **Design (both lenses agreed):** the codebase shipped the two halves of the right answer as two disconnected screens — `ProcessFlowBoard` had stage-selection→governance detail but was static; `LiveProcessFlowBoard` had the real engine/seals/branches but no spine to hang them on. The redesign FUSES them: one `focusedStage` binds a numbered 11-stage keyboard stepper, a 4-column focus panel, the connected ledger and the live canvas.
- **Duplication mechanics (honoring "duplicate, keep the original"):** the original `LiveProcessFlowBoard.tsx` / `ProcessFlowBoard.tsx` / `flowSim.ts` are BYTE-UNTOUCHED (verified by mtime — all predate the build); the redesign is six NEW files reached from a NEW top-level tab `Process flow (v2)` beside the original `Process flow`. Presentation-only: no new file imports `createSim`/`advance`/`@/lib/evidence`/`node:crypto`; state read from `op.sim`, handlers called through `op`. Determinism pin byte-identical (2487355187 / 250 / 684).
- **Build (6 new + 1 wiring):** `IntuitiveFlowBoard` (container, owns focusedStage) · `AuthorizationSpine` (hero: 11-stage WAI-ARIA keyboard stepper, party stripes + TEXT party tags, ✓/👤 glyphs, persistent EDI connectors, two custody hand-off separators, three labeled detours, live "you are here" from spotlight, inline 7-step UM sub-process) · `StageFocusPanel` (who/what-sealed/authority/hand-off from real e2eFlow stage data) · `FlowCanvas` + `FlowCanvasTokens` (the animated grid duplicated, kept prominent, focus-column highlight) · `JourneyLedgerTrail` (NIST hash-chain band welded under the spine). `FlowBoards.tsx` got the `flow2` tab.
- **Adversarial POST-review (adversarial-reviewer, R1–R5) → GO after remediation; findings fixed:**
  - HIGH — the Focus panel showed a stage's STATIC capability (`permittedRung`) as the live authority, asserting A3-autonomous before any rung is earned — a governance-honesty regression against the "trust starts at zero" thesis. FIX: route the Authority column through the engine's own `displayAuthority()` clamp (shown/capped/ceiling), exactly as every other view does; added a test that a cold-start sim (earned A0) never displays a stage's autonomous capability as live.
  - HIGH — the JourneyLedgerTrail per-stage highlight was DEAD at payer-ops (it keyed on `LedgerEntry.fired === stageKey`, but the engine seals UM work under sub-step act keys — nurse/rfi/md/deemed-adverse — never 'payer-ops'), so the flagship connective feature lit nothing at the one governance-critical stage. FIX: a presentation-side fold of UM act keys → payer-ops (no engine change); added a unit test proving the fold and that it does not over-match.
  - MED — `onOpenTicket`/`operatorName` were accepted then dropped: the "detection → governed ticket → named operator acts" payoff was unreachable from v2. FIX: added a live governed-ticket rail to the container with grab/route-inline + open-workbench parity with the original board; removed the dead props from FlowCanvas.
  - MED — incomplete ARIA tabs contract (tabs not owned by the tablist; no aria-controls; focus panel not a tabpanel). FIX: `role="presentation"` on wrappers/connectors, tab `id` + `aria-controls`, and the StageFocusPanel is now the `role="tabpanel"` with `aria-labelledby`; test asserts the wiring.
  - MED — party/status conveyed by color alone on the spine (WCAG 1.4.1). FIX: a TEXT party tag (LANE_LABEL) on every node and a text status token (CLEAR/PEND/DENY/WAIVED/HUMAN) on the "you are here" marker; test asserts the party text.
  - MED — JourneyLedgerTrail auto-scroll had no dependency array and snapped to newest every tick, defeating the highlight and blocking inspection. FIX: gated the effect (deps + near-right-edge) and, on a stage match, scroll the FIRST highlighted entry into view.
  - LOW — relabeled the write column "What this stage writes" (was mislabeled "Sealed ledger entry"); the triplicated geometry/accent constants (sanctioned by the "duplicate" instruction) were left as-is.
  - UPHELD by the reviewer: determinism/client-safe boundary, spotlight-driven "you are here" (real, not faked), counter consistency with the original, and the roving-tabindex/arrow/Home/End keyboard mechanic.
- **Verify:** tsc clean; prettier clean; lint (changed files) exit 0; size ratchet PASS (all 6 new files <400: 199/287/174/285/394/157); E13 test-link PASS (7 candidates, 0 untested; 5 new v2 render/behavior suites + the router case); full vitest 3216 passed / 0 failed / 74 skipped (409 files). Original process-flow files byte-untouched. Determinism pin unchanged.

## Increment — Gain-Share review + improvements (coalition + adversarial + RED-TEAM)

- **Trigger:** user — "all our plan for improving the gain-share area (review to see if further improvements are necessary — pull in agent coalition members and use adversarial and red team on this one — ensure you're adhering to framework)." Deliverable = a rigorous review that decides what to improve, then implements it under the framework.
- **Coalition review (two lenses, read-only):** (1) adversarial-reviewer as a hostile-State-actuary RED-TEAM on the economics/claims; (2) UX-lead + architect on screen quality + IA. The frame was UPHELD (payment-integrity recovery is structurally quarantined from the VBC split — `computeVbcScenario` takes no recovery input, a leak is impossible by construction), but real execution defects were found.
- **Findings implemented (red-team Critical/High + the IA debt):**
  - CRITICAL — the money tiles were labelled "/mo" but the math is ANNUAL (PMPM × 120,000 ANNUAL member-months), a ~12× overstatement a State actuary circles first. FIX: tiles now "/ yr" with a "over 120,000 member-months" caption; member-months is a caption, not a 4th money tile; a dimensional-consistency test asserts poolTotal/mm == PMPM.
  - HIGH — the "two-sided (downside)" tiers could never show the provider OWING (benchmark/actual hard-coded, savings floored at 0). FIX: a `actualDeltaPmpm` performance lever drives actual over benchmark → a provider-owed liability, SYMMETRIC to the upside via a minimum-LOSS rate deadband (= the MSR rate, so within ±MSR neither shares nor owes), clamped by a per-tier stop-loss. Cat 3A stays upside-only (never negative). Rendered as a corridor band, a bridge downside row, net-dollar tiles, AND a per-year "Provider owes" column in the rebasing table.
  - HIGH — the net-dollar tiles dropped the liability (wrong sign in the exact downside scenario). FIX: provider net = share + infra − liability; payer net = share − infra + liability (the owed downside is a payer inflow); both tiles on the SAME net basis, reconciling to 0 at a fully-gated downside; `providerNetTotalUsd` exposed and rendered.
  - HIGH — the clamp + Cat 4 downside were unreachable through the UI (slider max +40 < the +55 gap). FIX: perf-lever max raised to +120 so the Cat 4 downside and the stop-loss clamp sit in a visible band; a test drives the clamp at a UI-reachable value.
  - HONESTY — "ROI · real" over a $0-realized, no-cost-basis number → renamed "Payment-integrity recovery · real" with identified/realized co-equal; "Every figure below is modelled" → "Every VBC figure below is modelled; the quarantined payment-integrity figure is real"; "governed disputes" → "governed handoffs"; the "never co-appear as summable" overclaim corrected to the accurate math-level-vs-screen-level statement.
  - IA (user's "same love across the golden thread") — the dense board (and its 414-line over-cap modeler) got the shared-`BoardTabs` sub-tab treatment: 3 PROVENANCE tabs (Payment integrity · real / VBC modeler · modelled / Glide-path · illustrative) with a persistent banner + pre-cert chip + provenance key + pinned-epoch strip. `GainShareModeler` decomposed 414 → 73 into `LanRungPicker`/`LeversRail`/`SplitOutputPanel`/`RebasingScenarioPanel` (all <400).
  - a11y/WCAG — real `<label htmlFor>`/`id` on every lever input (was a bare `<span>` — an actual defect), `aria-valuetext` on sliders, split bar shows % + $ on every segment with text-on-every-segment and a hue pair distinct from the recovery green/blue, a benchmark→pool waterfall bridge.
  - Cleanup — removed the now-dead, conflicting `corridorWidthPct` (the symmetric deadband is the MSR rate, computed at run time); fixed the A/B/C compare gate flag to key off `owes` (not `overBenchmark`) and both money columns to the net basis.
- **RED-TEAM RE-ATTACK (framework critical-finding protocol) → 6/6 CLOSED after a second remediation pass:** the first fix left the per-year downside computed-but-unrendered (STILL-OPEN) → added the "Provider owes" column + loss caption; the two LOW residuals (dead corridorWidthPct; A/B/C flag on overBenchmark) were also closed. Each fix carries a passing test (E12 claim-vs-evidence).
- **Deferred to BACKLOG (logged, not built — out of scope for this pass):** a sensitivity/tornado strip; a full per-year settlement-statement block; A/B/C delta columns vs a baseline; a numeric tie-out between the illustrative glide-path narrative and the modeler; an IBNR/run-out maturity indicator; and seeding an accepted-appeal so the "realized recovery" figure is non-zero at mount.
- **Verify:** tsc clean; prettier clean; lint (changed files) exit 0; size ratchet PASS (economics 350, SplitOutputPanel 306, every gainShare file <400 — the modeler decomposition cleared the 414 over-cap debt); E13 test-link PASS (8 candidates, 0 untested; 2 new gainShare test files + expanded economics tests); full vitest 3240 passed / 0 failed / 74 skipped (411 files). `flowSim.ts` + determinism pin untouched (2487355187 / 250 / 684) — the economics core is pure and off the seal path.

## Increment — five "cosmetic/partial → functional" demo fixes (coalition + adversarial PRE & POST + re-pin)

- **Trigger:** user, running the demo, found five panels that look inert/opaque/unrealistic: (1) Surveillance "Play" seems to do nothing + Queue-health inert; (2) Reconciliation "Appeals" tab empty; (3) systematic patterns can only be exported ("partial job"); (4) Forensic "Re-verify seal" is opaque ("no real action or insight… am I missing something"); (5) intake is single-channel — the multi-channel mix is a static chip on the EMR-launch step ("not realistic — I thought you were remedying this"). "Ensure agent coalition is involved with overall framework applied."
- **Coalition sequence (framework):** architect+SME root-cause of all five → adversarial PRE-review (3 NO-GO blockers folded before build) → build (pin-neutral gaps 1/3/4/5 first, proving determinism unmoved; then gap 2 the deliberate re-pin last) → authoritative gate → adversarial POST-review (R1–R5) → remediation → re-gate → this entry.
- **Root causes (all real; verbs mostly existed but were unwired):** Play DOES advance ticks — the detection list is frozen (7-ref catalogue saturates) and the live `s.events` stream was never rendered; Appeals was never seeded (`ReconAppealsPanel` returned null); `ReconReportPanels` was never passed `op` so it could not act; `verifyEntry` returned a bare boolean; the engine had NO channel/origin concept (channel was a label).
- **Adversarial PRE-review → NO-GO ×3, folded before build:** (a) DROPPED faking detection churn via cloned suffixed refs — it breaks the Operations single-source (two `seedByRef` sites) and reads as duplicate FWA hits; (b) for the Appeals seed, REJECTED the pin-preserving unsealed-workflow shortcut as fake provenance — used the sealed seed + a bounded re-pin instead; (c) DROPPED a fake "Reproduce" button — there is no decision-replay engine, so the affordance is honestly a hash re-derivation only.
- **Build:**
  - Engine (pin-safe, verified): `verifyEntryDetail(s,seq)` — pure tamper re-check exposing recomputed-vs-stored hash + prev-link; `Txn.channel` assigned deterministically in `spawnTxn` from `spawnSeq` (NO mulberry) + an unsealed channel intake event.
  - GAP 1: `LiveEventTicker` (renders the real `s.events`, incl. the channel intake narration) in the Live-queue; `QueueHealthPanel` rewritten to live per-seat oldest-open/worst-SLA recomputed from `s.tick`.
  - GAP 3: `ReconciliationBoard` passes `op`; `PatternActions` wires "Route to Claims-Config / Open PI case" (`op.routePattern`) + "Draft exemplar appeal" (`op.startAppeal`), idempotent routed-state, exemplar-vs-cluster honesty.
  - GAP 4: `OpsForensicLedger` "Re-derive hash" shows recomputed-vs-stored hex + prev-link; `ForensicEntryDetail` provenance drill; no fake reproduce.
  - GAP 5: `IntakeChannelBar` on the v2 board — live per-channel counts from `Txn.channel` + provenance + CMS-0057-F note (original `LiveProcessFlowBoard` untouched).
  - GAP 2 (the deliberate RE-PIN, done last): one real, SEALED in-flight underpayment→appeal seeded at the end of `createSim` warm-up, selected by a stable predicate (largest-|Δ| underpayment on the cluster provider). `startAppealWorkflow` draws no RNG → **tick 684 unchanged** (no reordered draw), +1 advisory seal → ledgerSeq 250→251, chainHead → 3794285767. Re-pinned in `determinismPin.test.ts` + updated the 4 warm-start/"no-workflow" assertions (dianeScenario, reconAgent, reconAppealWorkflow, mintDedup) to the new baseline (5 seed tickets, 1 seeded appeal, 1 notification).
- **Adversarial POST-review → GO after remediation; UPHELD: re-derive is a real independent recompute (no echo); channel is pin-safe (no mulberry, never sealed); the re-pin is bounded (tick invariant proves no stream reorder); NO dollar double-count (identified⊇inDispute⊇realized funnel, realized only on a modelled 835); the seeded appeal does NOT auto-resolve (awaiting-review, human review+release required, SoD + submission-human-gate intact); original board untouched; pattern honesty correct. Findings remediated:**
  - MED — `LiveEventTicker` mislabeled "sealed event stream" (it is unsealed narration) → relabeled "Live activity feed · run narration" and noted the tamper-evident SEALED record is the Forensic ledger.
  - MED — `IntakeChannelBar` counted outbound 835 remit / 276 status as "intake" → filtered to intake-bearing types (278/270/837 only; excl. remit/status).
  - MED — `QueueHealthPanel` "backlog/oldest-open" is bounded by the 12-ticket working-set cap → captioned as the live OPEN queue window (not cumulative backlog; throughput is the sealed-records count).
  - LOW — "tamper-evidence" overstated an unkeyed content hash → relabeled "chain-consistency" + noted a production seal is keyed/signed (HMAC/signature).
  - LOW — the ticker PHI guard was single-scenario → extended to diane-ma (the synthetic hero name is illustrative, not PHI) and scoped the docstring to PHI-shaped identifier tokens.
- **Deferred to BACKLOG (production-grade, already disclosed as illustrative):** keyed/signed (HMAC) seals for true tamper-EVIDENCE; sealing channel provenance so a sealed record back-links to "arrived via portal"; modeling the payer-outbound direction (835/276) distinctly; a monotonic backlog counter decoupled from the display window.
- **Verify:** tsc clean; prettier clean; lint (changed files) exit 0; size ratchet PASS (all new components <400; flowSim baseline bumped 2587→2650 for the sanctioned engine growth); E13 test-link PASS (12 candidates, 0 untested; 5 new test suites + updated engine tests); full vitest 3253 passed / 0 failed / 74 skipped (416 files). Determinism pin at the documented re-pin (3794285767 / 251 / 684).

## 2026-09-25 — Wave 1 Slice A: Agent Definition Language + authority lock

**Change class:** new module under `src/lib/**` (domain logic) + new capability → full coalition required.

**Coalition run**
- B1 Spine/Architect — ADL design pass: definitions as sole authored artifact; manifest and routing generated; `module` bodies keep the four existing agents untouched.
- Adversarial BEFORE coding — **NO-GO as a single slice; GO-WITH-CHANGES for Slice A alone.**
  - *Unacceptable 1:* byte-equality is tautological and self-healing — widening an allowlist and regenerating satisfies it. **Required: an authority lock compared against, not the compiler's own prior output.** → implemented as `authorityLock.ts` + `data/authority-lock.json`.
  - *Unacceptable 2:* the compiler now outranks the runtime ACL gate. **Required: ban inheritance, wildcards, templates and defaults in v1.** → implemented; the schema admits no such construct.
  - *Critical 3–5 (interpreter):* `onApprove` reachability is a lint not a control; guard predicates would become an expression language; `recall` crosses consent lenses. → **Slice B (step interpreter) NOT BUILT.** `parseAgentDefinition` refuses `kind:'steps'` with `ADL_UNSUPPORTED_BODY`; the conditions for unblocking are recorded in the module README.
  - *High 7:* canonicalisation unspecified. → frozen spec in `canonical.ts` with `CANONICAL_SPEC_VERSION` and tests.

**Verification (primary sources, not reports)**
- `node tools/adl/verify.mjs` → PASSED: 4 definitions, 4 lock entries, manifest + routing byte-identical.
- Negative test — widen `outreach-agent` allowlist with `claim.submit-appeal` → **REFUSED** by the lock (and by drift). This is the exact attack byte-equality alone would have passed.
- Negative test — escalate `outreach-agent` to `autonomous` → **REFUSED**, "exceeds locked HITL".
- Negative test — hand-edit `agent-manifests.json` HITL→HOTL → **REFUSED** by drift.
- Clean state re-verified after each.

**Behaviour change:** none. The four agent bodies were not touched. `agent-manifests.json` and `agent-routing.json` were rewritten in canonical form; `tests/agents/adl/compile.test.ts` asserts the parsed content still deep-equals the pre-ADL originals held in `tests/agents/adl/fixtures/`.

**Gate:** `adl:check` added and wired into `check:all`. `tsc`/`vitest` must be run on the developer machine — this session's Linux VM cannot execute the Windows-built native bindings in `node_modules`.

## 2026-09-25 — Wave 2: seams (authority vs binding) + Wave 3 core: fact provenance

**Change class:** new modules under `src/lib/**` + new capability → full coalition required.

**Design position carried from the Wave 1 coalition and the framework coalition:**
authority is decided at build time in a reviewed manifest gated by the authority lock;
*binding* — which provider serves an already-granted tool — is deployment-time configuration.
Deployment can change plumbing; it can never widen a grant.

**Built**
- `src/lib/agents/seams/` — `toolBindings` (parse, grant check, resolve, MCP bind-time
  conformance), `reasoner` (recorded-transcript mock / unconfigured production),
  `memoryRecall` (consent-scoped cross-run recall, codes only, Part 2 excluded absent a
  declared basis), `types`, `errors`, README.
- `data/tool-bindings.mock.json` (11 in-process bindings) and
  `data/tool-bindings.production.json` (**zero bindings — fails closed**).
- `src/lib/agents/provenance/factProvenance.ts` — typed fact origin
  (`human | system-of-record | model`), `assertAdverseEligible`, and the
  **counterfactual differential** that recomputes a disposition with model-sourced facts
  elided and asserts identity of outcome *and* fact set.

**Why fact provenance replaced the stubbed-model test:** the adversarial panel demoted
"model throws, rules still compute" — it proves the rule engine is reachable, not that the
model did not shape the outcome. If an LLM selects, extracts or normalises the typed facts a
rule consumes, it is upstream of the determination.

**Verification (primary sources)**
- `npm run seams:check` → PASSED: 11 granted tools; production has 0 bindings, so 11 granted
  tools FAIL CLOSED until bound at deployment.
- Negative — bind `member.delete-all` (granted by no manifest) → **REFUSED**, "a binding
  cannot create authority".
- Negative — MCP binding carrying member references with `baaOnFile: false` → **REFUSED**.
- `npm run adl:check` re-verified clean after every mutation.

**Not built, deliberately:** the declarative step interpreter (NO-GO, conditions in
`src/lib/agents/adl/README.md`); the credential slice (NO-GO — policy keyed on action class
where the statute keys on the enrollee's condition); MCP sampling and elicitation, which must
be hard-disabled at the client rather than configured off.

**Gate:** `adl:check` and `seams:check` wired into `check:all`. `tsc`/`vitest`/`lint` must be
run on the developer machine — this session's Linux VM cannot execute the Windows-built
native bindings in `node_modules` (vitest fails on `@rolldown/binding-wasm32-wasi`).

### Adversarial AFTER (same iteration) — findings fixed, with regression tests

The post-build panel returned two Unacceptable, three Critical and several High findings
against the implementation. All were fixed in-iteration and pinned with tests.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| U1 | A duplicate `agentId` in `authority-lock.json` silently widened authority — `new Map(entries.map(...))` is last-wins, and `loadAuthorityLock` returned `raw as AuthorityLockFile` with no structural check. | New `lockSchema.ts`: full hand validator, `assertUniqueLockEntries` called inside `assertWithinAuthorityLock`, `assertNoOrphanLockEntries`. The cast is gone. | `authorityLock.test.ts` — duplicate entry, malformed lock, orphan grant |
| U2 | `assertMcpToolConforms` took its hasher as a parameter (`s => s` passed) and never checked `expectedIssuer`, so any endpoint replaying a public descriptor could bind. | Issuer is checked FIRST and hard; `pinnedToolHash` and the produced digest must both match `sha256:<64 hex>`, which rejects a degenerate hasher. | `toolBindings.test.ts` — issuer mismatch, identity hasher, unqualified pin |
| C1 | `resolveBinding` was reachable without any grant check and had no notion of which agent was asking. | Branded `AgentBoundTable` with `bindTableForAgent` as the only constructor; `resolveBinding` accepts nothing else and refuses a tool outside that agent's grants. | `toolBindings.test.ts` — agent-bound refusal |
| C2 | 42 CFR Part 2 release was gated on `part2Basis` being a non-empty string. | `Part2Basis {consentId, memberId, purpose, expiresAtMs}` verified against the scope's member and an injected clock; released entries return marked `part2Disclosed`; `breadth` is now enforced against `owningModule` instead of being a declared-but-unread field. | `reasonerAndRecall.test.ts` — wrong member, expired, empty consentId/purpose, breadth |
| C3 | `sourceId` was built from the reasoner's self-reported `producedBy`, so a swapped reasoner could label model facts with human provenance. | `sourceId` is stamped from the STEP input; `assertAttribution` refuses output that misattributes itself. | `reasoningStep.test.ts` — attribution mismatch |
| H1 | `facts` was a plain object, so a suggested key of `__proto__` set the prototype and hid the fact from `Object.entries` — and therefore from the adverse gate. | `Object.create(null)`, a camelCase-identifier key pattern, a prototype denylist, and a `maxSuggestedRefs` budget. | `reasoningStep.test.ts` — real own `__proto__` key via `JSON.parse`, `constructor`, budget, null prototype |
| H2 | Provenance did not propagate: an enricher could read a model fact and re-stamp the result `system-of-record`. | `derivedFrom` plus `effectiveOrigin`, taking the weakest origin over the derivation graph, cycle-safe. `assertAdverseEligible` and the differential both use it. | `factProvenance.test.ts` — derived taint, clean derivation, cycle |
| H3 | Two canonicalisers: `canonicalAdvertisedTool` hand-built a literal, so nested schema keys hashed in server insertion order. | It now uses the single `serializeStable`. | `toolBindings.test.ts` — nested key-order independence |
| H4 | "Production fails closed" was half-vacuous: an empty table violates no grant, so the boot check passed. | `assertAllGrantsBound` enumerates granted-but-unbound tools. | `toolBindings.test.ts` |

**Two of my own defects were caught by the new tests themselves**, not by review: `bindTableForAgent`
was asserting the whole shared table against one agent's grants, and the prototype-pollution test
used an object literal, which sets the prototype and creates no own key — so it proved nothing until
it was rewritten with `JSON.parse`.

**Verification:** 99 tests across 7 files, all passing; `tsc` clean under `strict`,
`noUnusedLocals`, `noUnusedParameters`. Run in an isolated sandbox (a copy of `src` and `tests`
on local disk with its own tsconfig and a locally installed typescript + vitest), because the
repo's `node_modules` holds Windows-built native bindings that cannot execute in this Linux VM.
**This is NOT the repo gate:** no eslint, no size gate, no `moduleResolution: NodeNext`,
no `exactOptionalPropertyTypes`, no full suite. `npm run check:all` must still be run on the
developer machine before this is called done.

**Not fixed, carried to the risk register:** no runtime re-verification of the deployed manifest
against the running agent; no accounting-of-disclosure surface for Part 2 releases; no tenancy axis
on the authority lock or the recall scope; no expiry or rotation for `pinnedToolHash` / `baaOnFile`;
`isReadOnlyTool` is still an injected predicate rather than a `sideEffect` field on `ToolBinding`.

---

## Wave 3 close-out — authority on the live path, and the second adversarial pass

Two rounds. The first found defects in the Wave 1 output that had shipped as "green"; the second
was a full adversarial pass over everything new, and it landed hard.

### Round 1 — defects in work already reported as verified

| # | Finding | Fix | Regression test |
|---|---|---|---|
| R1-A | **Withdrawn.** I first reported that regeneration had dropped the file-level `version` from both generated artifacts, which would have made `parseAgentRouting` and `parseRegistry` throw at boot. It had not: the canonical key sort moved `version` to the end of the object. Recorded because a retracted finding is part of the record. | none needed | — |
| R1-B | `projectRouting` ordered the compiled routes by **agent id**, but `dispatcher.ts` resolves a signal with `routes.find(...)` — first match wins. The regeneration reordered the shipped routing table. Behaviour was unchanged only because `kindPrefix: "denial"` and `kindPrefix: "referral"` happen to be disjoint; renaming an unrelated agent would have re-prioritised routing with no diff in any behavioural test. | Route precedence is now an **authored** `dispatchOrder` on the definition, duplicates refused (`ADL_ROUTE_ORDER`), and `dispatchOrder` is deliberately not emitted so the loader contract is untouched. Original HEAD order restored. | `adl/routePrecedence.test.ts` — id-vs-order, read-order independence, duplicate refusal, and a genuinely overlapping pair resolving through the real loader and router |
| R1-C | `compile.test.ts` claimed to pin the routing artifact against the pre-ADL original but sorted both sides by id first, so it was blind to exactly this reorder. The manifest comparison sorting is correct (a lookup table); the routing one was not. | Routing is compared **in order**; the manifest still sorts, with the asymmetry explained in the test. | same test, now order-sensitive |
| R1-D | `assertNoDrift` says "regenerate, do not hand-edit", but the only generator was a one-off inverse-projection bootstrap. There was nothing to regenerate with. | `tools/adl/emit.mjs` (+ `npm run adl:emit`), which runs the authority lock first and writes nothing if it fails. Artifact versions moved out of the committed files into an authored `artifact-versions.json`, because a checker that reads the version from the file it is verifying can never detect a version change. | `adl/mirrorParity.test.ts` |

**Verification honesty:** the earlier run covered 99 tests in 7 files — my own. It never called
`loadAgentRouting()` or `loadAgentManifests()`. From this point the whole repository suite is run.

### Round 1b — the authority lock reaches runtime, and finds a live privilege escalation

The standing adversarial verdict — *"a parallel authority model with no production callers"* — was
correct and is now closed. The lock is enforced at load time, not only at build time, because
`setProductionManifestLoader` serves manifests the compiler never saw and `AgentManifestRegistry`
has a public constructor. One shared implementation in `src/lib/agents/authority/` serves both.

Doing so surfaced a **privilege escalation in the existing product**. `presetRegistry.ts` set the
recovery agent's autonomy tier from a thread preset; `presetIdFromRecoveryId` derives that preset by
scanning the request-supplied `recoveryId` for a token; the `aggressive` preset is `autonomous`.
So a recoveryId containing `-aggressive-` removed the human approval gate on an agent whose reviewed
ceiling is HITL — **authority decided by a URL segment**. The twin-ladder interlock still blocked
authoritative state changes and submissions, so defence in depth held; the outer layer did not.
Fixed by clamping DOWN to the locked ceiling and reporting the clamp (`ResolvedPresetTier`), chosen
over throwing so a demo control cannot take the page down. Pinned by `presetAuthorityClamp.test.ts`.

**Open decision for the reviewer:** `aggressive` now behaves identically to `balanced`. Either the
preset comes off the surface, or `revenue-cycle-agent`'s ceiling is raised in a reviewed lock diff.
That is an authority decision, deliberately not made here.

### Round 2 — adversarial pass over all of the above: 2 Unacceptable, 4 Critical, 5 High

| # | Finding | Fix | Regression test |
|---|---|---|---|
| U1 | **The prompt-integrity work was decorative.** `PromptBinding` carried `{promptId, promptVersion, templateHash}` and no text; `createPromptRegistry` verified the text against its pin and then discarded it; `runReasoningStep` called the reasoner with id and version only. The provider therefore resolved the id to text from somewhere else, so the registry verified a string the model was never shown and the digest written into provenance hashed a **different artifact** than the one that produced the determination. Worse than absent: the evidence record made a specific, checkable, false claim about which words decided a case. | The binding carries the verified `text`; `ReasoningRequest` carries `promptText` + `templateHash`; `assertBindingIntact` re-hashes at dispatch, the last point under our control, because a binding travels through workflow state and can be reconstructed. | `promptIntegrity.test.ts` — binding carries text, digest matches, tampered binding refused |
| U2 | `authorityGate.ts` held `authorityLockData as AuthorityLockFile` — a bare cast, unvalidated and unfrozen — and `shippedAuthorityLock()` handed out the live object with live arrays. One assignment would have permanently raised the ceiling for the registry gate **and** the preset clamp, which read the same singleton. I had removed exactly this cast from the ADL loader and reintroduced it here. The panel's phrasing stands: *validating what you govern and trusting what does the governing is backwards.* | `authority/lockSchema.ts`: full structural validation (including `tools` must be an array — a bare string would be iterated character by character and pass the subset check as nonsense) plus a deep freeze. | `authorityWiring.test.ts` — frozen at every level, value unchanged after an attempted write |
| C1 | The load-time gate called `assertManifestsWithinLock(loaded.list())` and returned `loaded`. `list()` is a **virtual method on a caller-supplied object**, and the natural shape of a store-backed registry is lazy — `list()` answers from a warm cache, `get()` hits the store. The gate would check the cache while every caller used `get()`. An empty `list()` also passed vacuously. My own test built a registry where the two agree by construction, so it exercised the case the gate handles and never the case that defeats it. | The gate **rebuilds** from the manifests it verified, so the checked set and the served set are the same object by construction; an empty set is refused outright. | `authorityGateRuntime.test.ts` — a `LyingRegistry` whose `get()` widens beyond its `list()`, and the empty-set refusal |
| C2 | `tools/adl/compile.mjs` — the gate CI actually runs — reimplemented the authority comparison inline rather than importing the shared one, so the "one implementation" claim was false. It compared tiers with `ORDER.indexOf(a) > ORDER.indexOf(b)`; `indexOf` returns `-1` for an unknown value and `-1 > 0` is false, so `"autonomyTier": "Autonomous"` cleared every authority check while the TypeScript path refused it. `"phiPosture": "FULL"` additionally skipped the override requirement, shipping a full-PHI agent with no approver and no ticket. | `rank()` returns `null` for an unrecognised value and every caller treats `null` as a failure. The lock's own ceilings are rank-checked too. | `adl/mirrorFailsClosed.test.ts` — case-variant tier, case-variant posture, unrecognised lock ceiling |
| C4 | The same mirror computed and returned the artifacts **unconditionally**, alongside the failure list. Any caller reading the output without reading `failures` would emit a fully-formed artifact from a definition set the lock had rejected. A parity test structurally cannot catch this, because parity compares outputs on inputs that pass. | `compileFromDisk` returns `null` artifacts when any gate failed; `verify.mjs` only compares when `failures` is empty, so the refusal is not buried under a symptom. | `adl/mirrorFailsClosed.test.ts` — null artifacts on a widened allowlist and on a promotion |
| H1 | `parseRegistry` took an optional `lock`, defended by a comment claiming the live path never passes one. **False**: `presetRegistry.ts` calls `parseRegistry` directly and hands the result to the decision engine. A safety property held only by the call sites that happen to exist is not a safety property. | `parseRegistry` has no lock parameter. `parseRegistryUnderLock` is kept out of the module barrel for the test path, and the constraint is **checked**, not asserted. | `authorityWiring.test.ts` — source sweep proving only the defining module names it, with a non-vacuity assertion on the sweep itself |
| H2 | The ledger recorded **before** the fact-budget and key checks. Both directions fail: an output that then breached a budget poisoned the key, wedging the step so every later legitimate retry diverged against a digest the system itself had rejected; and a breach caught before the ledger allowed unbounded retries until one output happened to pass, making the "first" recorded result merely the first lucky one. | Every boundary check runs before `ledger.submit`. | `reasoningIdempotency.test.ts` — budget breach and unsafe key both leave the ledger untouched and a valid retry still records |
| H3 | The result digest covered only the output and the template hash — not `refs`, `offeredTools` or `stepKey`. The same `stepId` run over a different member returning the same answer would "replay" clean, and the record would assert that reasoning about member B reproduced reasoning about member A. Idempotency without input binding is not reproducibility, which is the whole stated purpose. | The digest covers the step inputs; offered tools are sorted so order is not significant. | `reasoningIdempotency.test.ts` — same answer / different member, same answer / different tool set, order-insensitivity |
| M2 | `resolvePresetTier` used raw `indexOf`, so an unranked tier gave `-1`, `clamped: false`, and the garbage value was written into the manifest clone — taking the page down at `parseRegistry`, the exact outcome clamping exists to avoid. | Unknown requested tier throws with the valid set named; an unrecognised lock ceiling resolves to the **most restrictive** tier, never to an unranked value. | `presetAuthorityClamp.test.ts` |
| M6 | `FACT_KEY_DENYLIST` held three names while its own comment justified excluding every enumerable-shadowing prototype key. `facts` is returned as a plain Record, so the first downstream spread would shadow the real method. | The full set: `toString`, `toLocaleString`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable` added. | `reasoningStep.test.ts` |
| M4 | Three of my own tests proved nothing. `expect(ledger.size()).toBe(0)` asserted a module-scope ledger no test ever passed to the step was empty. The test titled "the digest covers the template" mutated `producedBy.promptVersion`, which is itself in the digest, so it could not distinguish the template's contribution from `producedBy`'s. Two authority tests re-asserted preconditions the call on the same line already guaranteed. | Replaced with tests that isolate the property named in their title. | as above |

**Where the panel was wrong:** it reported `adl/mirrorParity.test.ts` as non-existent. It exists; I
failed to stage it for review. That is an error in how I prepared the review, not a code defect —
and C4 survives it regardless, since a parity test cannot reach that class of drift.

**Verification:** the **whole repository** — 3323 tests across 422 files, 0 failures; both gates
green; `tsc` clean under `strict`, `noUnusedLocals`, `noUnusedParameters`; every new source file
under the 400-line limit and every test under 500. The three highest-value fixes were
mutation-checked: reverting the rebuild-not-inspect gate, the ledger ordering, and the deep freeze
each turns its pinning test red.

**Still not the repo gate.** Run in an isolated sandbox with its own toolchain, because the repo's
`node_modules` holds Windows-built native bindings. No eslint, no size gate, no
`moduleResolution: NodeNext`, no `exactOptionalPropertyTypes`, no `noUncheckedIndexedAccess`.
`npm run check:all` on the developer machine remains the verdict.

**Carried to the risk register — the panel's frame criticism, which I did not fix and accept:**
authority here is agent-scoped and static (`agentId` → tools, tier, posture). It cannot express
**tenancy** (one ceiling across every county, plan and tribal entity); **member-scoped** authority
(42 CFR Part 2 restriction and consent state are member properties, while `phiPosture` is an
agent-level enum); or **42 CFR 438.210(b)(3) qualification** — `HITL` names a gate, not a qualified
reviewer, which is the same gap already recorded against `decisionGate`. Three further gaps: every
control here **throws and none emits**, so a refused widening, a clamp or a divergence leaves no
audit trace and cannot be evidenced in a fair hearing; `AuthorityLockEntry` carries no effective
date, expiry, approver or ticket ref, while the lower-privilege `phiFullOverride` carries
`approvedBy` and `ticketRef`; and the reasoning ledger is in-memory, so on a multi-instance
deployment a retry landing on another instance records as new — **the divergence control is green in
test and off in production**, which is the worst configuration for a control of this kind.

---

## UI verification pass — the app running, and what only running it could find

The user asked for screenshots and a live test. Two things worth recording before the findings.

**The dev server was up the whole time, on port 4032** (`next dev -p 4032`). I probed 3000 and 3001,
concluded it was down, and told the user so. Reading `package.json` first would have taken ten
seconds. The wrong conclusion was mine, not the environment's.

**Running the app immediately falsified a fix I had reported as complete.**

### R3-A — the clamp covered one of three consumers (Unacceptable)

`golden-thread/page.tsx` uses the preset's autonomy tier in three places. The morning's fix clamped
the first:

| line | use | was clamped |
|---|---|---|
| 109 | `buildPresetRegistry(...)` → runtime registry | yes |
| 125 | `recoveryAgentTier` → `permittedRung()` → recorded rung | **no** |
| 236 | `presetAutonomyTier` → the interlock display | **no** |

The running page rendered **two Twin-Ladder interlocks that disagreed about the same agent on the
same run** — `A3 for a autonomous agent` beside `A1 for a HITL agent`. It read as harmless only
because evidence independently capped that scenario at A1; `permittedRung('autonomous','D3')` is A3,
so the settlement-grade path was still open. This is the panel's C1 (checking a copy rather than the
value used) committed a second time, by me, in the fix for C1. Fixed by resolving once and using the
applied tier for all three, plus a rendered disclosure so the picker stops advertising a tier the run
did not use.

### R3-B — `?preset=constructor` is an unauthenticated 500 (Critical, pre-existing)

`sp.preset in THREAD_PRESETS` walks the prototype chain. Confirmed against the running app:
`constructor`, `toString`, `valueOf`, `hasOwnProperty` and `__proto__` all returned **500**, and
`?scenario=` had the identical flaw. Own-key checks now; re-tested live, all **200**.

### R3-C — the parser failed open, and was injectable from the member id (Critical)

`DEFAULT_PRESET_ID` was `'balanced'` — an unidentifiable input granted the *middle* autonomy rather
than the safest. And `presetIdFromRecoveryId` scanned every `-` segment for a preset token, so a
SMART patient id of `123-aggressive` injected a preset into an id built for a `balanced` run, with
key-declaration order deciding the winner — the draft/decision drift the module claims to close. Now
positional from the end (`…-{preset}-{ts}-recovery`) and defaulting to `conservative`.

### R3-D — my regression tests were text, not behaviour (Critical)

They counted `resolvePresetTier(` occurrences and regex-matched `recoveryAgentTier: appliedTier`.
The panel defeated all of them in one line — `const { autonomyTier } = preset;` — which reopens the
display hole with every assertion green, while an innocent variable rename turned them red. The
display consumer, the one that produced the visible defect, was never pinned. Replaced with
behavioural tests: the applied tier never out-ranks the ceiling at **any** evidence tier, clamping
is monotone in the safe direction, a dashed member id cannot smuggle a preset, an unparseable id
falls back to the most restrictive, draft-time and decision-time registries agree, and no prototype
key resolves as a preset.

**Corrected on the record:** the panel's H4 (mutable `SHIPPED_LOCK`) was read from a stale staged
copy — it was already fixed earlier in the session by `parseAuthorityLockFile` + deep freeze.

**Verification:** whole repository, 3334 tests across 422 files, 0 failures; both gates green; `tsc`
clean. Live re-test of all three presets, the four `getAgentManifest` pages, the evidence API (200)
and every prototype-key probe. Still not `npm run check:all` — no eslint, no size gate.

### Carried, not fixed — the panel's strongest surviving points

1. **The clamp is a sentence, not an event.** Nothing durable records requested/applied/clamped or
   the lock version: no evidence entry, no audit event. An auditor pulling a sealed record in
   eighteen months sees `aggressive` in the recoveryId and `A1` in the rung and must *infer* which
   control acted. Worse, clamping removes the capNote the interlock would have written, so the
   sealed reason is strictly *less* informative than before. **This is the top remaining item.**
2. **The clamp silenced the only loud refusal on that path.** `buildPresetRegistry` now narrows
   before `parseRegistry`, so the lock gate can no longer fire there. A probe walking
   `?preset=aggressive` produces zero signal, by construction.
3. **Decision-time cannot disclose.** `presetRegistryForRecoveryId` discards the `ResolvedPresetTier`,
   so the half of the workflow where a human commits to a payer-facing action has no way to know a
   clamp occurred.
4. **`materiality` and `filingWindowDays` remain request-derived and unclamped** — they decide
   whether the governed path is entered at all, and the escalation SLA.
5. **The disclosure is `role="status"`** — a polite live region, present at first render, so likely
   announced to no screen-reader user. A §508/§1557 exposure on a state reviewer surface.
6. **Nothing renders the component under test.** The suite never mounts `GoldenThreadSurface`; the
   defect was found by driving the app, and the regression suite still cannot drive the app.
7. **No type makes the bug unrepresentable.** `buildPresetRegistry` takes raw and applied tiers
   indistinguishably; there is no branded "has passed the lock" type.

**Housekeeping:** `_rhtp_app.tgz`, a scratch bundle I created to move the app into the cloud
container before finding the server on 4032, was moved to `_to_delete/` — this session cannot delete
files in a connected folder.

---

## Whole-person care — 42 CFR Part 2 binding at agent dispatch

Refocused from golden thread at the user's direction. Recorded plainly: the drift was mine. Asked to
put the authority lock on a live execution path, I searched for callers of `getAgentManifest`, found
eight, and every one was a revenue-cycle surface — so I validated the governance against the only
agent that is NOT whole-person care. The right move was to report that the WPCO agents have no live
caller and stop.

### What the WPCO agent tier actually was

`src/app/uhg-orchestrate/agent-library/coalition.ts`, marked in its own header
`// SEAM: agent-dispatch — presentational demo dispatch`. Six dispatchable agents carrying
`{id, libId, name, role, color, trigger}` — no manifest, no tools, no tier, no PHI posture — over a
~32-agent library whose only routing logic is a free-text `matchConditions` string. None of the
governance built earlier this session applied to a single agent a viewer sees on the WPCO surface.

### The coalition ran BEFORE any code, and killed the first design

| finding | verdict |
|---|---|
| Put `consentScope` on the agent definition | **Wrong.** A static field has no subject, no counterparty, no clock and no revocation. Consent has all four. An agent's self-description of what consent it operates under is not evidence of consent. |
| Govern the six domain agents first; leave `consent`, `identity`, `graph-intel` as "infrastructure" | **Backwards.** Those three ISSUE the claims the other six trust. An identity mis-merge on name+DOB puts a Part 2 record into the wrong member's context while every agent stays inside its allowlist and the lock check stays green. Six precisely-capped agents drinking from an uncapped tap. |
| `autonomyTier: HITL` satisfies 42 CFR 438.210(b)(3) | **Insufficient, and NY binds harder.** PHL Article 49 §4903: a health care professional who is not a clinical peer reviewer may not render an adverse determination. HITL says *a* human approves; it cannot say *which*, nor "not if they touched it before", nor what the reviewer was shown. |

Then I verified the panel's claims against the tree rather than taking them on faith. Two came back
in the codebase's favour: `assertToolAllowed` fires **per tool call** (`engine.ts:145`, inside
`ctx.useTool`), not only at load; and `references-only` is honest here — `MemberContext` is
`memberId`, channel preference, closed measures, contact history, consent scopes, ED recency.

### The gap that was real

`Signal.part2Restricted` is set at intake, carried through the pipeline, labelled `42-CFR-Part-2` in
the graph mapping, and validated as a **required boolean** on the outbox envelope. `routeBatch` then
routes on `actionability` and `kindPrefix` and **never reads it**. The flag survived the entire
pipeline and was dropped at the one point where it decides whether a substance-use-disorder signal
reaches an agent. Consent scope, by contrast, IS enforced — `consentGate.ts:22`,
`dispositionEngine.ts:89`.

### What was built

**Authority now splits into two planes, deliberately.** The lock caps *capability* at build time,
per agent. A new decision plane decides *disclosure* at runtime, per event.

- `src/lib/agents/disclosure/` — `decideDisclosure(request, capability, bases)`, pure and total:
  never throws to mean "no". Decides over (subject × data class × purpose × requesting agent ×
  recipient org × as-of). Denial reasons are codes, so denials are countable. Permits carry
  **obligations** that travel with the disclosure — `part2-redisclosure-prohibited`,
  `notice-to-accompany-disclosure`, `minimum-necessary-projection`.
- `createDisclosureLedger()` — append-only, and it records **denials**. A control that logs only what
  it allowed cannot answer the first question a state privacy officer asks: *the member revoked on
  Tuesday; what had already flowed, to whom, and what was refused after?*
- ADL gains `dataCapability { purposeOfUse, dataClasses[] }` — a **capability declaration**, not a
  consent claim. Legitimately static, legitimately locked, and an INPUT to the decision, never the
  decision. The authority lock caps the declared classes; an omitted lock entry grants **none**.
- `dispatch/disclosureGate.ts` + `routeBatchGated()` — every routed signal is decided before it
  reaches an agent, refusals are **returned** rather than silently dropped, and
  `assertNoUngatedPart2()` throws if a Part 2 path is routed with no gate wired, so omitting the gate
  cannot quietly restore the original defect.

Data classes are separated by **regime, not clinical taxonomy**: `substance-use-disorder`
(42 CFR Part 2 §2.31), `mental-health` (NY MHL §33.13), `hiv` (NY PHL Article 27-F, DOH-2557).
`part2Restricted` maps to SUD only — deliberately not treated as a general "sensitive" flag, because
collapsing the three regimes would let one consent instrument stand in for another. MH and HIV need
their own signal-level markers before the gate can decide them; today it decides Part 2 only.

### Two defects my own tests caught

1. **Every ordinary signal was being refused.** I classed non-Part-2 dispatch as `clinical-general`,
   which no WPCO agent declares. The gate would have read as working while dispatching nothing. A
   signal is PHI-safe by construction (`Signal.refs` — references and codes), so dispatch discloses
   `demographic`.
2. **A Part 2 refusal was recorded citing HIPAA treatment/payment/operations.** The regime is now
   resolved before the agent-declaration check, so every denial is filed under the regime that
   governs the class. Misfiled is how a privacy officer fails to find a refusal during a breach review.

And a third, from the mirror: `adl/lockSchema.ts` silently **dropped** `dataClasses` while the gate
checked it, turning a grant into a refusal. Source and CI mirror disagreed again — this time the
source was the stricter one.

**Verification:** whole repository, **3349 tests / 423 files, 0 failures**; both gates green; `tsc`
clean. Negative-tested: widening an agent's declared classes without a lock change is refused by the
CI gate. Mutation-tested: making the gate ignore its own verdict turns **8** tests red.

### Carried

The panel's frame argument stands and is not addressed: authority here is still intra-organizational,
while the domain is inter-organizational — the same human is member (MMC), patient (provider), client
(CBO/SCN) and household member (graph), under four agreement types. Also absent: NY PHL Article 27-F
HIV, reproductive-health and minor self-consent dimensions; caregiver/proxy directionality including
shield-from; disclosure-accounting as a member-facing artifact; revocation *propagation* (what already
flowed); tenancy. And the panel's programme-framing challenge — that the roster is payer-shaped while
RHTP money is rural-provider-shaped, NY's WPC vehicle for MMC members being the 1115/Social Care
Networks construct — is a decision for the user, deliberately not made here.

---

## WPCO disclosure plane — coalition per `docs/framework/coalition-protocol.md`, both rounds

**Compliance note, first.** The earlier rounds this session ran the *generic* coalition summary, not
this repo's protocol. Deviations, recorded rather than smoothed over: the architect pass was mine
rather than a subagent's; the **SWE implementation-plan step was skipped entirely**; and the
adversarial seats were a single generic reviewer instead of the **derived domain-expert lens set**
(`personas.md` D1–D8 + R2–R5) selected by a lens-coverage map. `g_coalition` was satisfied. This
entry closes the Definition-of-Done requirement for findings from **both** rounds.

**Pre-flight classification.** Core-logic change under `src/lib/**`; new modules; new capability
(a gate); >40 lines; touches fail-closed defaults and stated INVARIANTs → coalition REQUIRED.

**Lens-coverage map.** Surfaces touched → owning lens: privacy/regulatory → **D4**; correctness,
security, concurrency, convention → **R4**; design forks → **architect**. Care-management workflow
(D3) and negative-space (R2) were not staffed this round — an acknowledged gap, not a claim of
coverage.

### Round 1 — adversarial BEFORE coding (design)

Returned a NO-GO on the original design and it was honoured:

- **`consentScope` on the agent definition — rejected.** A static field has no subject, no
  counterparty, no clock and no revocation; consent has all four. An agent's self-description of the
  consent it operates under is not evidence of consent. Replaced by a runtime decision plane, with
  the agent contributing only a static **capability declaration**.
- **The tranche was inverted — accepted.** `consent`, `identity` and `graph-intel` ISSUE the claims
  the other six trust; governing the spenders while leaving the issuers ungoverned is six capped
  agents drinking from an uncapped tap. Recorded; not yet acted on.
- **NY PHL Article 49 §4903** binds harder than 42 CFR 438.210(b)(3): a non-clinical-peer-reviewer
  may not render an adverse determination. `HITL` names *a* human, not *which*.

### Round 2 — adversarial AFTER coding (implementation), D4 + R4 in parallel

Both lenses converged independently on one verdict: **the control was demonstrated, not wired.**
Every finding below was verified against the tree before being accepted.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| U1 | **`projectManifest` dropped `dataCapability`.** Parsed at build time and discarded at projection, so the compiled manifest carried neither purpose nor classes, **nothing in `src/` ever constructed an `AgentCapability`** (the only one was in a test, by hand), and the lock's data-class cap read `undefined` on every manifest and passed vacuously. | Projected into the manifest — the artifact a store-backed loader actually supplies, per `authorityGate.ts`'s own argument that a build-time-only lock is a statement about the repository. New single producer `manifest/capabilities.ts`; `validateDataCapability` on load; the mirror projects it too. | `compile.test.ts` — every shipped agent declares a capability the lock caps |
| U2 | **Composed-touchpoint bypass.** The gate decided `tp.intents[0]` and dispatched the whole touchpoint, so a Part 2 intent bundled behind an ordinary opener reached the agent undecided and unrecorded. My fixture built one intent per touchpoint — shaped to the code's blind spot. | Per-intent decision (`decideTouchpointDisclosure`), refused intents stripped, channel re-derived, `touchpointId` preserved (the send-once guard is keyed on it), empty set ⇒ no dispatch. Branded `DisclosedTouchpoint` so the compiler enforces what a reviewer was enforcing. | `demoPathRefuses.test.ts` — mixed touchpoint, Part 2 intent withheld, rest dispatched |
| U3 | **The ledger was not append-only.** `copy` was a shallow spread; `obligations` shared its array reference, so `(ledger.all()[0].obligations as Obligation[]).length = 0` erased `part2-redisclosure-prohibited` from a stored permit permanently. The regression test mutated only a top-level scalar and passed while the defect stood. | Entries sealed on the way IN — deep copy of the array, `Object.freeze` on both. | `part2Dispatch.test.ts` — the obligations-array exploit, now throwing |
| C1 | **`decideDisclosure` was not total.** A malformed basis row, a null from the consent store, an unresolvable recipient — each threw, and threw *before* the ledger write, producing an **unrecorded decision on a Part 2 path**. `sde/consentGate.ts` had this right years earlier: it catches and fails closed. | Unreadable input is treated as absent, never as covering; injected callbacks wrapped fail-closed; an unresolvable recipient resolves to a named `org/unresolved` that can match nothing, so it denies `recipient-not-named` rather than throwing. | covered by the seam tests |
| C2 | **The gate was unreachable in the running app.** `demo/index.ts` — the only composition root that dispatches — called the ungated `routeBatch`, and **none** of `capabilities`, `basesFor` or `recipientFor` had a producer. | Composition root wired to `routeBatchGated` with all three producers; `demo/disclosureSources.ts` supplies seeded consent bases, stated plainly as seeded rather than production-shaped. | `demoPathRefuses.test.ts` |
| C3 | **The control was undemonstrated.** All nine signals in `demo-signal-batch.json` had `part2Restricted: false`, so `assertNoUngatedPart2` never fired and the demo ran ungated and green — the same failure one level out. | Added `sig-10`, a Part 2 restricted HEDIS IET care gap, composed into the **same** touchpoint as ordinary gaps. Adding it immediately turned three pre-existing tests red because they routed the real batch ungated — the assertion working, on real data, for the first time. | the acceptance suite |

**Acceptance criterion, met:** the demo path now refuses. The Part 2 intent is withheld, the
member's other outreach still dispatches (denying the bundle would withhold ordinary care *because*
the member has a substance-use record), both the permit and the denial are in the ledger, and the
**recipient is told nothing** — no count, no marker, no placeholder, since a "1 item withheld" chip
on an identified member is itself a disclosure under 42 CFR 2.13(c).

**Verification:** whole repository **3357 tests / 424 files, 0 failures**; both gates green; `tsc`
clean; every new file inside the size limits. Seeded acceptance counts moved 5/3/1 → 6/3/1 and were
updated in the open, with the reason recorded in the test.

### Carried — accepted, not fixed

1. **Purpose of use is self-asserted (D4 H1 / R4 C2).** `disclosureGate` sets the request's purpose
   from the requesting agent's own declaration and `decide.ts` then compares it to itself, so
   `agent-purpose-mismatch` is unreachable and the member's consent is tested against a purpose the
   recipient chose for itself. The architect's answer — derive it from the **signal taxonomy**, with
   the agent declaration as a set-valued **ceiling** — is designed and not built.
2. **`recipientFor` has the same tautology, third instance.** The recipient is derived from the
   requester, so `recipient-not-named` cannot fire correctly for a CBO referral. It needs a reviewed
   organisation registry: whether an org is internal or outside the covered entity is an
   organisational fact, not a function of who asked.
3. **`dataClassFor` is two-valued.** `mental-health` and `hiv` are declared, mapped to MHL §33.13 and
   PHL 27-F, and unreachable — `sig-7 bh.screening.indicated` ships today classed as `demographic`.
4. **Obligations do not travel.** `minimum-necessary-projection` is emitted and never discharged; the
   full `memberContext` goes to the agent on a permit. An obligation identified, recorded, and not
   performed is worse than none.
5. **The ledger is per-run and in-memory** — it cannot serve 42 CFR 2.25 accounting or MHL §33.13(f).
6. **`consentGate.ts:19` — `if (!scope) return true`** short-circuits before the hard opt-out check,
   and the dispatcher passes `consentScope ?? ''`. **Pre-existing, not introduced here**, and a
   member who opted out can be contacted on any signal whose taxonomy declares no scope.
7. The programme-framing question (payer-shaped roster vs rural-provider-shaped RHTP money; NY's WPC
   vehicle for MMC members being the 1115/SCN construct) remains the user's decision.

---

## Behavioral Health agent — identity, regime scope, and authority that narrows with acuity

Coalition per `docs/framework/coalition-protocol.md`. Pre-flight: core-logic change under
`src/lib/**`, a new agent definition, a new data class reaching a heightened regime, touches
fail-closed defaults → REQUIRED. Domain-architect seat: **D4 Policy/Regulatory**, run BEFORE code.

### Decisions taken from the D4 memo

**A — TWO agents, and the new one gets a NEW id.** The presentational object was
`{id: 'agent-appeals', libId: 'appeals', name: 'Behavioral Health Agent', role: 'COMPLIANCE'}` —
four answers to one question, on the most Part-2-exposed component in the set. Appeals and BH
clinical are **disjoint legal surfaces**: appeals under 42 CFR 438.406 and NY PHL §4904 (45 days to
file, 30 to determine, 2 business days expedited); BH clinical under NY MHL §33.13. An agent holding
both holds an authority union no single consent instrument can satisfy.
`agent-appeals` keeps its id and its COMPLIANCE role and gets its display name corrected to
**Appeals & Grievances Agent**; `bh-screening-triage-agent` is created fresh. **Never repurpose an
id** — every existing ledger row, escalation record and audit entry would silently change meaning.

**B — `mental-health` ONLY.** Substance-use-disorder and HIV are deliberately not granted. Part 2
§2.31 and MHL §33.13 are different statutes with different instruments, and one agent ships one
obligation set; PHL Art 27-F is an **enumerated** disclosure list that an automated agent is not on.
Clinical co-occurrence argues for a care *team* holding both, never an agent identity.

**C — authority NARROWS as acuity rises.** The counter-intuitive one, and load-bearing. NY MHL §9.46
reserves the likely-serious-harm determination to enumerated mental health professionals and reaches
DCJS and firearm licensure under Penal Law §400.00; MHL §33.13(c)(6) reserves serious-and-imminent
danger to a treating psychiatrist or psychologist. An agent can hold neither. So it proposes and
escalates — it never determines risk. Also recorded from the memo: **maternal depression is not
SSL §413 reportable**, and an automated route from a positive EPDS toward any child-welfare pathway
is both unauthorised and the documented mechanism by which screening programmes lose participation.

**D — its own escalation policy.** `escalationPolicyRef: 'bh-acute'`, pinned by the lock and asserted
unique to this agent. One shared `default` cannot be both a cost-optimisation path and a path where
an acute item sits unacknowledged over a weekend.

**E — no egress at any tier.** Allowlist is `person-context.read`, `work-queue.submit`,
`signal.report`. The lock grants no member-contact tool either, so it cannot acquire one by
declaring it. Outreach on a BH screen IS a disclosure: a voicemail on a shared line discloses a
mental-health fact to whoever answers — a foreseeable IPV scenario in a perinatal population.
**No route, deliberately**: a route would put it on the ordinary outreach path under the shared
escalation clock, so its absence from the routing table is a control, pinned in `namespaceIntegrity`.

### What was built

- **`mental-health` is reachable for the first time.** The taxonomy now carries a per-signal-type
  `dataClassFloor`. `sig-7 bh.screening.indicated` (EPDS, already shipping) was classed
  `demographic` and permitted with no basis check, while the constants naming MHL §33.13 and PHL
  Art 27-F read to a reviewer as "handled". They were decoration.
- **The floor is a FLOOR, not the authoritative class** — the D4 memo's Unacceptable finding, and the
  correction to my own earlier recommendation. The regime attaches to a record's **provenance**: the
  same EPDS is Part 2 material from an OASAS program, §33.13 material from an OMH clinic, and
  ordinary PHI from an OB practice. Making the taxonomy authoritative would freeze the regime as a
  compile-time constant of the vocabulary. Provenance may only escalate it.
- **Every applicable regime is decided, and all are recorded.** `part2Restricted` unions with the
  floor rather than replacing it, because 42 CFR 2.20 makes the stricter rule controlling and a
  record can be both §33.13 and Part 2 material. The returned denial names the regime that actually
  refused.
- A parser defect caught in passing, third instance of the same class: `sde/schema.ts` **dropped**
  `dataClassFloor` while the gate read it.

**Verification:** whole repository **3378 tests / 426 files, 0 failures**; both gates green; tsc
clean. 13 authority constraints and 8 disclosure behaviours pinned as tests, including "holds no
egress tool" against both the manifest and the lock.

### Carried

1. **Minors are NOT yet barred.** The memo's recommendation — `subjectAgeBand !== 'adult'` → DENY with
   `minor-consent-model-not-implemented`, shown on screen — is designed and not built. SHIN-NY §1.5.3
   bars disclosure of Minor Consent Services to a personal representative without the minor's written
   consent; MHL §33.21 and §22.11 are the underlying NY paths. `ConsentBasis` has `subjectId` and no
   grantor, so a parent-granted and a self-consented basis are indistinguishable today.
2. **`part2Restricted` is still a defaulting boolean.** The memo's tri-state
   (`part2 | not-part2 | unknown`, unknown ⇒ DENY) is not built; absent still reads false.
3. **`measure: 'EPDS'` in the payload contradicts `references-only`** — the instrument name IS the
   disclosure. Acuity banding belongs in a pre-agent step so the agent sees `{signalRef, dataClass,
   acuityBand}` and never the instrument or score.
4. **`ConsentBasis` has no instrument type or grantor**, so a HIPAA authorization and a §33.13
   disclosure are indistinguishable. NY's own DOH-5032 requires separate initialling per class.
5. **No `reproductive-health` class**, though the shipped signal is a perinatal instrument and
   SHIN-NY §1.4.1 names it Sensitive Health Information.
6. **SHIN-NY Level 1 / Level 2 purposes can be combined** in one basis, which §1.3.3 forbids.
7. Open and consequential: **whether the operating entity is a QE, a QE Participant, or neither** —
   the memo flags this as answerable in one conversation with NYSDOH and as determining roughly half
   the above.

## 2026-09-27 — WPCO agent disclosure plane: the 57-file tranche, logged retroactively (DoD violation closed)

**This entry is late, and that is the first thing it records.** The tranche below landed on the
user's machine with no entry here at all, which `coalition-protocol.md` §4 makes a
not-done condition. The `g_coalition` gate that exists to catch exactly that returned 0
(see "Why the gate did not catch this", below). Nothing here is marked CLOSED; per E12 a
CLOSED needs a live passing test I have personally run, and the five concurrent fix
specialists were still editing `src/lib/**` while this was written.

**Scope (57 files).**
`src/lib/agents/{dispatch,demo,disclosure,provenance,authority,adl,seams}/**` (the 42 CFR
Part 2 / NY MHL §33.13 disclosure decision plane, the dispatch disclosure gate, the
authority-lock parser, the fact-provenance and model-taint gates, the seam resolver);
`src/lib/sde/{consentGate,dataClassFloor,index}.ts` (the consent gate and the taxonomy data-class
floor); `src/lib/config/{dataMode,seamDispositions,seamDispositions.agents}.ts` (the E1
seam-disposition manifest and the data-mode resolver); `src/lib/deploy/schema.ts`; four new
routes under `src/app/api/ops/agents/` (`actions`, `authority`, `bindings`, `reasoning`);
and 23 test files. `src/lib/agents/adl/lockSchema.ts` was DELETED, merged into
`src/lib/agents/authority/lockSchema.ts`.

**Coalition that ran.** An architect pass (wiring plan, measured reachability); five parallel
build specialists on disjoint trees; an adversarial panel of five derived domain-expert seats
— R1 domain-fidelity specified to NY Medicaid / OMH-OPWDD-OASAS, R2 negative-space, R3
stub-legitimacy, R4 engineering, plus an architect — and an adversarial-AFTER round of five
seats (R5 cross-examiner, R4 engineering/security, D4+R1 regulatory, T6 mutation, R3+C1
stub-legitimacy/convention).

**Protocol steps that did NOT run, recorded plainly.**
1. **Step 3 — adversarial review of the fix design, before coding — did not run.** The
   "BEFORE" panel did not attack this wave's design. It attacked the **already-landed**
   tranche, which makes it step 5 of the *previous* wave run retroactively, not step 3 of
   this one. No design was hardened before code was written.
2. **The bundle was landed on the user's machine before the adversarial-AFTER round**,
   contrary to §4. The AFTER round therefore found defects in shipped code rather than in a
   candidate, and four of its findings are UNACCEPTABLE.
3. Consequently there is no §4-conformant design ref to cite for either the architect or the
   SWE step of this wave: the architect artifact is a wiring plan and reachability
   measurement, not a design memo predating the build.

**Findings from the adversarial-AFTER round.** All are IN-FLIGHT with other specialists as of
this entry; none is verified closed by me.

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | UNACCEPTABLE | The CBO referral is permitted unconsented on 45 CFR 164.506 — a basis that does not authorise disclosure to a **non-covered entity**. A regression this fix wave introduced. | IN-FLIGHT (disclosure/consent specialist) |
| 2 | UNACCEPTABLE | All four new ops routes return **403 to every real authenticated session**. The 200 path exists only because a test mocks a `role` field the real `SessionAuthContext` does not have. | IN-FLIGHT (`src/lib/server/**` specialist) |
| 3 | UNACCEPTABLE | The E1 manifest's `agentRuntime` `productionResolverRef` names `getAgentDemoActions()`, which the route does not call in production (it calls `runRealAgentDemo()`). | IN-FLIGHT (config/seam specialist) |
| 4 | UNACCEPTABLE | **This gate's own blindness** — `g_coalition` could not see the directories the tranche changed. | FIXED IN THIS CHANGE (receipts below) |
| 5 | CRITICAL | `assertNoOrphanLockEntries` has **zero `src` callers** while the module header claims the stricter rule won the merge. | IN-FLIGHT (authority specialist) |
| 6 | HIGH | `hiv` has zero taxonomy floors, so **PHL Art 27-F remains unreachable**; `sig-7` is consent-suppressed upstream, so `mental-health` still never reaches dispatch on the demo path. | IN-FLIGHT (sde specialist) |
| 7 | HIGH | The prettier hook reflows at 80 columns with **no `.prettierrc`** and pushes two files past the size cap, blocking the commit. | IN-FLIGHT (`.prettierrc` specialist) |
| 8 | — | Mutation: **19 of 75 survived, 17 real holes.** | IN-FLIGHT (`mutation-targets.json` specialist) |

**Why the gate did not catch this — two independent faults, not one.**

*Fault A — the path filter.* `CORE_RE` was a five-directory allowlist,
`^src/lib/(policy|identity|consent|goldenThread|networkAdequacy)/`, frozen from when those
five WERE the whole of `src/lib`; `src/lib` now holds 54 directories. Receipt — of the 71
reconstructed tranche paths, the number matching the old regex:

```
$ grep -cE '^src/lib/(policy|identity|consent|goldenThread|networkAdequacy)/' tranche-all.txt
0
```

So `g_coalition` printed `(no core-logic changes — coalition not required)` and returned 0.
The sharpest case: `src/lib/sde/consentGate.ts` **is** consent logic and `consent` was in the
allowlist — but the file lives under `sde/`, so it was invisible.

*Fault B — vacuity, which the regex fix alone would NOT have closed.* `ci-gates.sh` opened with
an unguarded `cd "$(git rev-parse --show-toplevel)"`. On the landing machine that is not a git
work tree; `git rev-parse` exits 128 and `cd ""` in bash **silently succeeds and stays put**.
Every changed-file gate then computed an EMPTY change set and printed PASS. Receipt from this
working copy:

```
$ git rev-parse --show-toplevel ; echo "rc=$?"
fatal: not a git repository (or any of the parent directories): .git
rc=128
$ ( cd "" && echo "cd-empty-ok pwd=$(pwd)" ) ; echo "rc=$?"
cd-empty-ok pwd=/home/claude/rhtp
rc=0
```

With an empty change set, a widened regex still matches nothing. Both faults had to be fixed.

**The fix (`scripts/ci-gates.sh`).**
1. **The path filter is inverted.** `CORE_RE='^src/lib/'` — which is what
   `coalition-protocol.md` §2 row 1 already declares the trigger to be — minus a short, named
   `CORE_EXEMPT_RE` for the non-decision layer only (`.tsx` under `src/lib`, which AGENTS.md's
   repo map defines as the React glue since `src/lib/<domain>/` is "pure domain logic, no
   React/Next imports"; `hooks|stores|context|client`; the seed/mock corpora and `*.data*.ts`
   / `data/` payloads that E13 and E14 already exempt; and `demoPreservation/`, the gate
   harness). A hand-kept allowlist rots every time a module is renamed and always toward
   passing; with the filter inverted a NEW domain directory is core **by default** and
   exempting one is a deliberate, reviewable edit. Deliberately NOT exempt: `config/` (the E1
   seam manifest), `deploy/` (fail-closed preflight), `server/` (audit, sessions, the trust
   boundary), `authz/`, `security/`, `evidence/`.
   **And deliberately no blanket `data/` exemption, which the first cut of this fix had and
   which would have re-opened the hole on the worst possible files.** Under a decision domain,
   `src/lib/**/data/` holds the decision content itself, not presentation seed rows:
   `agents/authority/data/authority-lock.json` **is** the authority lock,
   `agents/adl/data/*.agent.json` **are** the agent regime grants and escalation policies, and
   `sde/data/signal-taxonomy.json` carries the `dataClassFloor` values that finding #6 is
   about. Granting an agent substance-use authority is a one-line edit to one of those files.
   Nothing is lost by dropping the clause: there are **zero** `.ts` files under any
   `src/lib/**/data/`. Only `*.md` under `src/lib` (the feature READMEs) is added to the
   exemption.
   Relatedly, this gate's path predicate now reads the **full change set** rather than
   `changed_src()`, because `changed_src` globs only `*.ts/tsx/js/jsx` — so all 45 JSON files
   under `src/lib`, the authority lock and the agent grants among them, were invisible to it.
   An agent's regime grant is a legal authority statement, and under the old code a change to
   one triggered no gate in the repo: not format, not lint, not test-link, not this one.
2. **A second, path-independent predicate.** Any changed file carrying `INVARIANT:` or
   `CONTRACT: C-` — the safety markers AGENTS.md already mandates as grep anchors — triggers
   the coalition wherever it lives, so a rename cannot hide it. Cost is one `grep -l` over the
   changed-file list, never over the tree; deleted paths are skipped. Receipt that it is
   load-bearing rather than decorative: all four new `src/app/api/ops/agents/*/route.ts` files
   carry `INVARIANT:`, so this predicate alone catches the tranche **even with `src/lib`
   exempted entirely**.
3. **Indeterminate change set now FAILS.** A gate whose entire input is "what changed" has
   nothing to say when it cannot see what changed, and "nothing to say" printed as PASS is how
   this tranche landed. `g_coalition` returns 1 when the tree is not a git work tree, and when
   `$GATE_BASE` does not resolve **and** the work tree is clean (an already-committed landing
   being then indistinguishable from no landing). The `cd` is also guarded: the script now
   exits 2 rather than running from the wrong directory, and warns when the changed-file gates
   are blind.

**Receipts — the gate proven in both directions.** Driven by the reconstructed 71-path tranche
list (47 source files enumerated from disk + the deleted `agents/adl/lockSchema.ts` + 23 test
files), with the git plumbing stubbed to supply that list. `ci-gates.sh` itself is unmodified
by the harness; only the gate's INPUTS are substituted.

```
$ prove-coalition.sh tranche-all.txt without-log
== g_coalition  [tranche: 71 paths | coalition-log entry: without-log ] ==
COALITION-TRIGGERING CHANGE without a coalition-log entry:
  core-logic paths (src/lib/**, non-presentational):
    ... 44 paths ...
  files carrying INVARIANT: / CONTRACT: C- (path-independent trigger):
    ... 29 files, including all four src/app/api/ops/agents/*/route.ts ...
-- exit code: 1

$ prove-coalition.sh tranche-all.txt with-log
== g_coalition  [tranche: 71 paths | coalition-log entry: with-log ] ==
coalition triggered + coalition log updated
  core-logic paths (44): ...
  safety-marker files (29): ...
-- exit code: 0

$ # negative control — a trivial non-core change must NOT trigger
$ prove-coalition.sh trivial.txt without-log       # mockData.data.ts, appContext.tsx, hooks/, components/
(no core-logic path and no INVARIANT:/CONTRACT: C- marker in the change set — coalition not required)
-- exit code: 0

$ # fail-closed control — real invocation, no .git
INDETERMINATE change set: not a git work tree, so this gate cannot see what changed.
-- exit code: 1

$ # the authority lock ALONE must trigger (it is JSON; changed_src cannot see it)
$ prove-coalition.sh lockonly.txt without-log
COALITION-TRIGGERING CHANGE without a coalition-log entry:
  core-logic paths (src/lib/**, non-presentational):
    src/lib/agents/authority/data/authority-lock.json
-- exit code: 1

$ # a feature README under src/lib must NOT trigger
$ prove-coalition.sh readme.txt without-log        # src/lib/policy/README.md
(no core-logic path and no INVARIANT:/CONTRACT: C- marker in the change set — coalition not required)
-- exit code: 0
```

**E14 wiring ratchet — the shrink was verified and WITHHELD.** E14 says every hardening
iteration that wires an orphan removes it from the baseline. The gate reports 25 baseline
modules as now WIRED. Each was verified individually and **none is wired end-to-end**, so no
entry was removed; the review is recorded in `wiring-baseline.json` under `shrinkReview`.

```
$ node docs/build-provenance/check-wiring.mjs src --baseline docs/build-provenance/wiring-baseline.json
  entries: 274 | reachable: 1080 | lib orphans: 27 (baseline 52)
  ratchet: 25 baseline module(s) are now WIRED - drop them from .../wiring-baseline.json
PASS (E14)                                                                    # exit 0, before
  entries: 275 | reachable: 1082 | lib orphans: 27 (baseline 52)              # after; 52 -> 52
```

The reason, verified three ways: (a) all 25 become reachable through exactly ONE importer —
`grep` for non-internal importers of `@/lib/agents/demo`, `@/lib/agents/dispatch` and
`@/lib/sde` returns `src/app/api/ops/agents/actions/route.ts` **and nothing else**; (b) that
route is finding #2 above — it 403s for every real session, and E14's own rule is that a
capability is done only when a production caller reaches it end-to-end; (c) 13 of the 25 are
reachable only over `export … from` barrel or type-only edges, which `check-wiring.mjs`
counts as graph edges (`agents/dispatch/{dispatcher,types}.ts`,
`agents/{outreach,pa,referral}/**`, `sde/engine/explain.ts`) — barrel-reachable is not called.
Shrinking on this evidence would record 25 modules as wired on the strength of an unreachable
route, which is the ratchet rotting in the direction that flatters the report. The shrink is
owed as soon as findings #2 and #3 are fixed and a test drives the 200 path from a real
`SessionAuthContext`.

**Gate run, honestly.** `bash scripts/ci-gates.sh fast` — **2 of 7 rungs FAIL**, both
pre-existing or in-flight and neither in this change's files:

```
  PASS  format (prettier, changed files)      # "(no changed source files)" — vacuous here, no .git
  PASS  types (tsc --noEmit)
  FAIL  file sizes + ratchet                  # src/lib/server/smartSession.ts 417/400 <- NEW violation
  PASS  lint (changed files)                  # "(no changed lintable source files)" — vacuous, no .git
  PASS  test-link E13 (changed)               # candidates 975 | untested 259 (baseline 259)
  PASS  page boundaries (E16 shift-left)      # 272 files scanned, 0 findings
  FAIL  skill mirror in sync                  # ENOENT docs/framework/SKILL.md — the file does not exist
  GATES FAILED (fast)
```

`smartSession.ts` at 417/400 is the in-flight fix for finding #2 breaching the size cap
(E2: never grow past it — extract instead). `docs/framework/SKILL.md` is referenced by
`tools/gen/genSkillMirror.mjs` and by AGENTS.md line 138 and is **absent from the repo**, so
the fast tier has been red on this rung independently of this wave.

**No suite-green claim is made, and the reason is recorded.** Two full `vitest run` passes
during this work disagreed, because five specialists were editing `src/lib/**` concurrently:
run 1 gave `Test Files 2 failed | 452 passed | 2 skipped (456)` and
`Tests 3 failed | 3675 passed | 74 skipped (3752)`; run 2 reported 20+ failed files; a scoped
re-run of one of them (`tests/agents/manifest.test.ts`) then passed 6/6 in 2.59s, and a scoped
run of the two ops route files gave `Test Files 1 failed | 1 passed (2)`,
`Tests 1 failed | 40 passed (41)` — the survivor being
`routes-agents-ops > production mode runs the REAL agents and returns the run disclosure
record`, i.e. finding #3. A moving tree cannot produce a DoD receipt, so this entry asserts
none; the orchestrator owes one authoritative run (E5) after the concurrent wave converges.

**Other gates audited for the same blindness class (reported, not fixed).**
- `changed_src` globs only `src/**/*.{ts,tsx,js,jsx}` — two blind spots in one helper, shared by
  `g_format`, `g_lint` and `g_testlink`. (i) Nothing outside `src/`: not `tests/**` (all 23 of
  this tranche's test files), `.prettierrc`, `scripts/`, `tools/`,
  `docs/build-provenance/*.{mjs,json}` or `package.json` — finding #7 is in a file no
  changed-file gate can see. (ii) Nothing that is not TS/JS *inside* `src/`: the 45 JSON files
  under `src/lib`, including the authority lock and the agent regime grants. `g_coalition` now
  reads the full change set for its own predicate; the other three still cannot. Widening
  `changed_src` itself was NOT attempted here because `next lint --file` and the prettier batch
  would then receive paths they do not handle — it needs its own design pass.
- `g_mutation` (E13): `mutation-targets.json` names 10 targets, exactly ONE under
  `src/lib/agents/` (`agents/governance/decisionGate.ts`) and **ZERO** under `src/lib/sde/`.
  The consent gate, the disclosure decision plane, the authority-lock parser and the
  model-taint gate — everything this tranche rewrote — have no mutation target at all.
- `g_prov` (E11): `check-provenance.sh` runs its rule 4 (an `ITER*_REPORT.md` whose iteration
  has no log rows) only when passed a `ROOT` argument, and `ci-gates.sh` invokes it with **no
  argument**. So the "a phase that ran but has no rows is a failed gate" half of E11 never
  executes in CI.
- `g_wiring` (E14): not path-blind, but it counts `import type … from` and `export … from` as
  graph edges, and it only PRINTS the now-wired advisory before exiting 0 — so the ratchet can
  shrink only by hand and rots only toward flattering. See the shrink review above.
- `g_pageboundary` scans `src/app` only (by design), so it gives this tranche's `src/lib` code
  no coverage. `g_types` and `g_sizes` are whole-tree and not blind.

---

## 2026-09-27 — Wave 0 (refactor-only): the price of admission for the agent-manifest expansion

**Why this wave exists at all.** It is not a wave I planned. The adversarial-BEFORE round on the
W3 agent-expansion design (protocol step 3) returned **NO-GO from both seats**, and the
engineering seat named a refactor-only PR as "the price of admission" before any W3 code. Wave 0
is that PR. Nothing in it is a feature; every item is either a type made exhaustive, a gate that
did not exist, or a claim in a comment corrected to match measured behaviour.

### The NO-GO that produced it

**Seat 1 — R1 domain-fidelity + D4 policy, specified to a NY Medicaid MCO. BLOCKING:**
1. The design **manufactured a legal basis.** It seeded a third signed MHL instrument so the BH
   route would permit. NY MHL §33.13(d) makes MCO/BHO/health-home exchange a **permitted
   disclosure by statute** — no instrument exists or is required, and seeding one asserts the
   member executed a document they did not. `decide.ts:257` states the standard it violates.
2. **`dispatchOrder` does not do what the design said.** Partly wrong as phrased, and the
   conclusion still stands: `dispatchOrder` exists as an ADL **authoring** control
   (`adl/projections.ts:79` sorts by it; `adl/types.ts:114` documents that it is deliberately
   NOT emitted), so precedence is set by re-authoring the definition and re-emitting, never by
   a field on `RouteMatch`. And `bh.screening.indicated` carries
   `actionability: 'member-outreach'`, so the outreach route at index 0 wins regardless.
3. "The screens change, not the lock" understates it by four contracts.
4. `bh-acute` must not be able to park an urgent BH item.
5. Two demoted claims were stated wrongly: the `disenroll` control **forces a human, it does
   not refuse**, and the urgent BH park is **T+4h, not T+3h**.

**Seat 2 — R3 stub-legitimacy + R4 engineering. BLOCKING:** enumerated **14 artifacts required
to make an agent real**, of which **five are gated by nothing** — the bundled-source import key,
the escalation policy, `TASK_KINDS`, the disclosure basis, and the `consentScope`. Required a
refactor-only PR first (items F2, F3, F6, F7, F10 below).

**Content decision taken, and it is the user's call recorded as such.** The permitted-by-statute
branch is NOT built this wave and the instrument is NOT seeded. A live `no-basis-on-file`
refusal on an EPDS perinatal screen, filed under MHL §33.13, is the stronger governance
demonstration and it is honest; a `PERMITTED_BY_STATUTE` branch keyed on
`(dataClass × purposeOfUse × recipient.kind)` and gated on `!part2Restricted` is a named W4 item
with a real citation behind it.

### What landed

**[F2] The task-kind vocabulary is now DERIVED, and the drift started one layer above where the
seat placed it.** `routingSchema.ts:13` restated it as `['outreach','referral','pa']: string[]`,
AND `adl/types.ts:40` typed `RouteDefinition.taskKind` as an open `string` with no membership
test in the ADL hand validator. So a kind authored into a `.agent.json` parsed, compiled, emitted
and passed `adl:check` **byte-identically**, then `parseAgentRouting` rejected the artifact at
**module load** — before any dispatch, so the blast radius was every dispatch in the process
rather than the one new route.
- `AGENT_TASK_KINDS` + `isAgentTaskKind` now live beside `AgentTaskKind` in `dispatch/types.ts`,
  derived from an exhaustive `Record<AgentTaskKind, true>`; adding a union member without a key
  fails `tsc --noEmit` on that literal.
- Imported by both the runtime parser (`routingSchema.ts`) and the authoring schema
  (`adl/schema.ts`), which now throws `ADL_SHAPE` on a kind outside the set.
- `tools/adl/compile.mjs` restates the set (no TS imports by design) and **exports** it;
  `tests/agents/adl/mirrorParity.test.ts` asserts set equality member-for-member and drives
  `checkRoutes` with `taskKind: 'bh-triage'` to prove the mirror refuses it.
- **Why the existing parity tests could not have caught this:** both implementations are fed the
  same VALID definition set, so neither rejection path runs and the byte-identity assertions
  hold. A looser mirror is invisible to output comparison.
- **A test fixture was lying.** `tests/agents/adl/schema.test.ts:18` called a definition "a
  well-formed definition" with `taskKind: 'demo'`. Not a real kind. The suite was asserting
  validity the shipped loader would have refused. Corrected, with a rejection case added.

**[F7] `docs/build-provenance/check-ref-resolution.mjs` — the data cross-reference gate (new).**
Every hand validator in this repo refuses loudly on a malformed **blob** and not one can see
across two files, so a reference naming a key nothing defines is well-formed everywhere and
resolves nowhere.
- **It went RED on the tree that had just passed every other gate**, with two findings:
  `bh-screening-triage-agent` carried `escalationPolicyRef: "bh-acute"` in BOTH the manifest and
  the build-time authority lock, while `escalation-policies.json` defined only `"default"`.
  `getEscalationTier` (`agentRuntime/escalation.ts:119`) calls `req(set, …)` and **throws
  `EscalationPolicyError` at runtime inside `AgentEngine.propose()`** — i.e. the first time that
  agent tried to put anything in front of a human. A governed agent whose escalation path throws
  is worse than one with no policy: the manifest asserts an SLA and a hierarchy that cannot load.
- Why nothing saw it: `tsc` — `escalationPolicyRef: string`, and `"bh-acute"` is a string.
  `adl:check` — the definition, lock and manifest all AGREE on the spelling, and agreement is not
  existence. `vitest` — no test proposed an action as that agent. `seams`/`wiring` — a JSON key is
  not an import.
- Three rules ship: `escalation-policy-ref`, `escalation-policy-ref-lock`, `routing-agent-ref`.
  Wired as `g_refresolution` into the **fast** tier of `scripts/ci-gates.sh` and as
  `npm run check:refs`. Green: `3 rule(s), 13 reference(s) resolved`.
- **WITHDRAWN as written.** This read: "Made green by authoring the `bh-acute` policy set …
  urgent 4h / high 8h / routine 24h". **No `bh-acute` set exists on disk.** It was authored, then
  withdrawn on adversarial review (round 2; register G-007), and grep for `bh-acute` across `src/`
  now returns only the comment in `check-ref-resolution.mjs` describing the historical defect. The
  ACTUAL mechanism that makes the gate green: every reference was repointed to `default`
  (`agent-manifests.json`, `authority-lock.json`, `bh-screening-triage-agent.agent.json`), and
  `bhAuthority.test.ts` "is PROVISIONALLY on the shared default" pins that as a marker which FAILS
  the moment a BH-specific policy is authored.
- **OPEN (W1), not closed here:** `onExhaust` accepts only `'park'`, so escalation-as-data
  **cannot express a crisis-pathway handoff**, which is the clinically required terminal for an
  acute BH tier. Seat 1's item 4 is therefore NOT satisfied by this wave; it is bounded instead —
  `bh-screening-triage-agent` ships `routes: []`, so it receives no signal today. W1 must either
  extend `onExhaust` with a `'handoff'` kind carrying a named target, or cap the agent at `high`
  in code with a test. Convention by comment is not a cap.

**[F7-adjacent] Two further dangling-reference classes found, and deliberately NOT gated yet.**
`bh-screening-triage-agent` declares `owningModule: "src/lib/agents/behavioralHealth"` — **the
directory does not exist.** Measured:
```
owning-module: 1 finding(s)
  [bh-screening-triage-agent] owningModule "src/lib/agents/behavioralHealth" is not a directory that exists
```
Its two tests (`tests/agents/behavioralHealth/{bhAuthority,bhDisclosure}.test.ts`) assert the
manifest, the lock and the taxonomy — that is, they assert the **declaration against itself**.
There is no agent. E14 passed because it compares declared resolvers to imports, not
`owningModule` to the filesystem. The rule is written and its red output is recorded here, but it
is NOT landed: the repo hard rule is that a gate lands green or not at all, and making it green
requires building the module, which is W1's work and not a refactor.

**[F3] `projectResult` is exhaustive.** `agents/demo/index.ts` used two nested ternaries whose
final `else` was PA — the **third** PA-defaulting ternary in the dispatch path, after
`dispatchTasks.ts` and `dispatcher.ts`, and the last one. A fourth kind was labelled
`advance-pa-documentation` and given `{ thread, event }` refs read off a task carrying neither,
with no type error. On a governance surface that is not a mislabel: the screen would show a
behavioural-health triage task as a prior-authorisation advancement, and `refs` — the only thing
tying a row back to a record — would be `undefined`. Now a `switch` with
`const unhandled: never = task`.

**[F6] A false `INVARIANT:` in `dispatcher.ts`, and the silent drop it was covering.** The header
asserted that the remaining `continue`s "lose nothing: they hand the signal to the OTHER loop (its
route is of the other kind)". `routeDispositions` iterates `batch.dispositions` and skips
anything unapproved, so that handoff happens only for an opener carrying an **approved
disposition**, which nothing guarantees. Measured, one touchpoint routing to referral, no
dispositions:
```
PROBE tasks=0 refusals=[]
```
SDE had decided to contact the member; dispatch produced no task, no refusal, and no trace of
either fact — the exact class the `no-route` refusal was introduced to end. Now a
`touchpoint-route-not-outreach` refusal naming the agent the route WOULD have selected (not
`agent/none` — a reviewer needs to see who was on the other end of the lost handoff), recorded
only after **testing** whether an approved disposition will genuinely pick the opener up. The
header now states what is true and records what it used to claim.

**[F10] Mutation coverage extended, and it found a real hole immediately.**
`dispatchTotality.test.ts` and the new `dispatchFidelity.test.ts` added to the `dispatcher.ts`
entry; a `dispatchTasks.ts` entry added. First run:
```
src/lib/agents/dispatch/dispatchTasks.ts: 2/3 mutants killed (67%)
  SURVIVED [=== -> !==]  sig.priority === 'urgent' ? 'expedited' : 'standard'
```
Nothing distinguished an **expedited** prior authorisation from a **standard** one. Not cosmetic:
`slaHoursFor` puts expedited at 72h and standard at 168h, so with the operator inverted every
urgent denial is worked to a 168h clock and every routine one to 72h — wrong in both directions
at once, while the screens still show a clock. `tests/agents/dispatchFidelity.test.ts` pins all
three priority values (a test of `urgent` alone survives `!==` as long as nothing else is checked,
which is exactly how it hid) plus the differ-property. Re-run at the time: `dispatchTasks.ts` 3/3. **The `dispatcher.ts` figure written here was
WITHDRAWN** (adversarial-AFTER round 1, F2) as unproducible from the landed config; both are
superseded by the closing receipts at the end of this entry, which are measured from the config as
landed.

### Incident: the E13 gate corrupted the working tree, and its own header said it could not

A `check-mutation.mjs` run was **SIGKILLed** by a 2-minute harness cap with a mutant still
written into real source:
```
src/lib/agents/dispatch/disclosureGate.ts:178
-  if (signal.part2Restricted) return true;
+  if (signal.part2Restricted) return false;
```
`requiresDisclosureGate` is the fail-closed check deciding whether a signal may reach an agent
with no disclosure decision. Inverted, **every 42 CFR Part 2 substance-use-disorder signal
reported that it needed no gate** — `classesFor` adds `'substance-use-disorder'` for that flag and
it is in `HEIGHTENED_BASIS_REQUIRED`, so the mutant removed the one check standing between a Part 2
signal and an undecided disclosure.

- **Found by a failing test, not by a gate:** `part2Dispatch.test.ts` → "routing Part 2 signals
  with no gate throws rather than disclosing" expected a throw and got none. It was NOT assumed to
  be a local regression; both landed tranche copies and the authoritative file on the user's
  machine were compared, and all three read `return true`.
- **Blast radius measured, not assumed:** all 15 mutation-target files checksummed against the
  user's machine — 14 identical, 1 intended edit, **1 corrupted**, and nothing else. Restored from
  the authoritative copy; hash `5e6d7b18d55889e5` matches exactly and the only delta was that line.
- **The old header's claim was false.** It read: "an interrupted run can never corrupt the tree."
  It handled SIGINT/SIGTERM/SIGHUP. **SIGKILL cannot be handled**, and a harness cap that kills the
  process group is how this runs in practice. That is a claim-without-evidence of precisely the
  class E12 exists to catch, sitting inside a provenance gate.
- **Fixed with a second layer:** an on-disk sentinel (`docs/build-provenance/.mutation-inflight.json`)
  carrying the pristine bytes, written before the first mutant and removed only after the final
  restore. A later invocation finding it restores the file, reports it loudly, and **exits
  non-zero** — a tree that was silently wrong deserves a stop, not a silent heal, because anything
  run in between got a green or red it did not earn. A sentinel that cannot be written aborts the
  run (`exit 2`) rather than mutating unprotected.
- **Recovery proven, not asserted.** A SIGKILLed run was simulated (mutant written, sentinel left);
  the next invocation printed "A PRIOR MUTATION RUN WAS KILLED AND LEFT A MUTANT IN THE TREE",
  restored the file to `5e6d7b18d55889e5`, cleared the sentinel and exited 1.
- `.gitignore` updated on the user's machine beside the existing E11 scratch-artifact precedent.

### Receipts

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `bash check-file-sizes.sh` | PASS — no new violations; ratchet intact (129 frozen files) |
| `node tools/adl/verify.mjs` | PASS — 5 definitions, 5 lock entries, 3 routes, byte-identical |
| `node tools/seams/verify.mjs` | PASS — 11 granted tools, 0 production bindings, all fail closed |
| `node docs/build-provenance/check-ref-resolution.mjs` | **OK — 3 rules, 13 references resolved** (was 2 unresolved) |
| E13 test-link | PASS — untested 243 vs baseline 246 |
| E14 wired-path | PASS — lib orphans 27 vs baseline 52 |
| E16 page-boundaries | OK — 262 files, 0 findings |
| E13 mutation | **rows WITHDRAWN.** `dispatcher.ts 8/8` was unproducible from the config as landed (`maxMutants: 6` at the time, and `killed ≤ tested ≤ maxMutants`); it was measured with an ad-hoc `8` and written up as config-derived. An R5 cross-examination then found the withdrawal was filed in prose while **the false figure stayed in this table** — "the honesty landed in the shallowest layer", turned back on its author. Superseded by the closing receipts below, measured from the landed config across all 17 targets. |

### Protocol steps that did NOT run, recorded plainly

1. **Wave 0's own design had no adversarial-BEFORE round.** It came *out of* a review, which is
   not the same as having *been* reviewed. The reviewing seat's prescription was treated as its own
   authority. Defensible for a refactor-only wave; it is still a skipped step.
2. **Seat 1's blocking item 4 is bounded, not satisfied** — see the `onExhaust` OPEN item above.
3. **The `owningModule` resolution rule is written and red, not landed.** W1 owns it.
4. Two E13/E14 ratchets can now be tightened (3 modules newly tested, 25 newly wired). Not done
   here; tightening a baseline inside a refactor wave hides which change earned it.

### Adversarial-AFTER round 1 — seat R4 engineering + T6 test-effectiveness: **NO-GO**, and the demotions it forced

The seat returned **2 Unacceptable and 8 Significant** against the Wave 0 tree above. Its framing
criticism is recorded first because it is the one that matters most: *"the wave hardened the loud
instance and left the quiet one."* `taskKind` was the member of the defect class whose consumer
fails LOUD (`parseAgentRouting` throws at module load). The expensive member — an open-string
field cast into a closed union whose consumer fails **soft** — was in the same 40 lines and was not
touched. The wave read the finding as *the* defect rather than as *an instance*, and shipped
INVARIANT comments implying the class was closed.

**Claims DEMOTED from the receipts table above. Both were mine.**

- **`dispatcher.ts 8/8 (100%)` — WITHDRAWN as recorded.** The landed config carried
  `maxMutants: 6`, and `killed ≤ tested ≤ maxMutants`, so the figure is arithmetically impossible
  from the artifact under review. It was measured with an ad-hoc `8` on the command line and then
  written up as though it came from the landed config. That is a claim-vs-evidence failure (E12) in
  a receipts table, in the same wave that criticised a false INVARIANT comment. Both dispatch
  entries now declare `maxMutants: 8` and the numbers below are re-measured from the config as
  landed.
- **"Recovery proven, not asserted" — narrowed.** It was proven for the SEQUENTIAL SINGLE-PROCESS
  case only. Concurrency was not a threat model, and the design assumed one process.

**[F1, Unacceptable] The crash sentinel was an arbitrary-path file-write primitive.** It read
`rec.file` from `.mutation-inflight.json` and called `writeFileSync(rec.file, rec.original)` with
no root containment, no allowlist, and no proof this tool wrote the bytes on disk — from
`recoverFromSentinel()` at MODULE TOP LEVEL, before argv was parsed, inside a blocking CI step. A
committed sentinel naming `~/.npmrc` got that file overwritten while the tool printed
`file restored:` over it. The seat's sharpest turn: aimed at `disclosureGate.ts` with `return
false`, the gate would have **re-created the 42 CFR Part 2 fail-open that motivated its own
existence, and called the write a restore.** Four containments now, each proven by execution:

| # | Containment | Proof |
|---|---|---|
| C0 | ORDERING — recovery runs AFTER `loadTargets()`, which `exit 2`s on a usage error first, so a usage error touches nothing. (This row said "moved into `main()`"; **there is no `main()`** — a fictional mechanism in a containment table, in the wave whose headline sin was a false header comment. The property holds; the description did not. Corrected here and in the script's comments.) | usage error printed, `/tmp/ATTACK_TARGET` unchanged — **but see the re-run note below** |
| C1 | CONTAINMENT — `rec.file` must resolve inside the repo root | out-of-repo path REFUSED, `exit 2`, file unchanged |
| C2 | CONTAINMENT — and be a DECLARED mutation target | in-repo non-target REFUSED, `disclosureGate.ts` still `5e6d7b18d55889e5` |
| C3 | PROVENANCE — restore only when on-disk bytes hash to the recorded MUTANT; "differs from pristine" is equally a developer's edit | non-matching bytes REFUSED, `exit 2`, file unchanged |
| C4 | OWNERSHIP — per-PID sentinel; a LIVE pid is a peer, not a corpse | concurrent run REFUSED, `exit 2`, peer's mutant not reverted |
| C5 | the GENUINE case still recovers | real mutant on a declared target restored to `a5776e714139ce09`, sentinel cleared, `exit 1` — **but see the re-run note below** |

**C0 and C5 are DEMOTED to "re-run required".** Both exercise `runTarget`'s ordering and arming
sequence, and that region was amended TWICE after this table was written — `assertBaselineGreen`
inserted, `dedupeSites` inserted, arming moved after the zero-sites early return, `writeSentinel`
moved from function entry into the per-mutant loop. **A containment proven against superseded code is
not proven.** C1–C4 exercise `recoverFromSentinels()` and `isRecoverable()`, neither touched, and an
R5 cross-examination verified each against the current code line by line: **C1–C4 UPHELD.**

**[F7] The zero-sites path armed the exit handler over a file it never mutated.** `runTarget` set
`INFLIGHT_*` and wrote the sentinel at entry, then returned early on `sites.length === 0` BEFORE
the `finally` that disarms — so `process.on('exit')` wrote bytes captured at function entry over a
file this run never touched, silently reverting an edit made during a ten-minute run. Nothing is
armed and nothing is on disk until a mutant is about to be written, and every restore (signal
handler and `finally` alike) is provenance-guarded.

**[F4] `check-ref-resolution.mjs` was fail-OPEN three ways while its header claimed otherwise.**
Each closed and each proven by execution:
- A document parsing to a falsy non-object was silently skipped — `if (!refDoc.value) continue`.
  **Truncating `escalation-policies.json` to the four characters `null` was a PASS.** Now
  `parsed to null, not an object` is a finding.
- A rule whose collection key was renamed iterated nothing: `checked` dropped 13 → 10, `findings`
  stayed empty, `exit 0`. `checked` was printed and never asserted — **the same blind spot that
  made the coalition gate vacuous, in a gate wired in beside it.** Each rule now declares
  `minRefs`, a short count is a finding, and `checked >= MIN_TOTAL` gates the OK line. Proven:
  renaming `routes` → `route` now reports `found 0 reference(s) but the rule declares at least 3`.
- A throwing accessor produced a raw stack trace instead of the report. Proven: `agents` holding a
  string now reports `rule accessor threw`.
- One thing the seat checked and found sound, recorded because a clean finding is also evidence:
  `Object.keys()` gives own-enumerable keys only, so a ref named `constructor` or `__proto__` is
  correctly reported unresolved. No prototype-pollution hole. The `13 references` arithmetic
  (5 manifest agents + 5 lock entries + 3 routes) was **UPHELD**.

**[F5] The new `&& isApproved(d)` conjunct was untested, and the surviving mutant reopened the
exact drop D6 closed.** The `route()` helper's only lever was all-approved or none-at-all, so
`.some()` on `[]` is false regardless of the predicate — mutating `&&` to `||` left every test
green. Behaviourally: a touchpoint whose opener routes to referral **plus a `suppress` disposition
naming that opener** took `handledByDispositions === true`, recorded no refusal, and
`routeDispositions` skipped it — `tasks=0 refusals=[]`, the precise measurement this wave says it
ended. `route()` now takes an explicit `dispositions` lever and the suppressed case is asserted.

**[F6] The new INVARIANT in `demo/index.ts` over-claimed, and four more restatements were left
standing.** `DispatchedTask` RESTATED `'outreach' | 'referral' | 'pa'` as three inline literals, so
a union addition left it unchanged and the `const unhandled: never` did NOT fire — the guard
guarded the restatement, not the union. Fixed at the root rather than in the comment:
`AgentTaskPayload` is now the one place a kind is bound to its shape, and `DispatchedTask` and
`AgentWorkflows` are both MAPPED over `AgentTaskKind`. One union addition now breaks the payload
map, the task builder, the workflow record and both projections — every site that must decide
something. The comment now records what it used to claim and why that was false.

**[F3, the finding that mattered most] `route.pa` was still a blind cast, and its consumer reported
`executed` on failure.** `routingSchema.ts` did `route.pa = o.pa as AgentRoute['pa']` after a bare
`typeof === 'object'` check; `adl/types.ts` typed it `{ currentState: string; advanceEvent: { type:
string } }`; the ADL validator used `str()` only; the mirror checked `typeof === 'string'`. Both
closed unions were sitting in `paMachine.ts` the whole time. Authoring `"currentState": "denied"`
(lower-case d) passed `tsc`, passed `adl:check` byte-identically, and passed `parseAgentRouting` —
and then:
- `paMachine.ts` fails **SOFT**: an illegal transition returns `{ state: current, error }`. It does
  not throw.
- `paAgent.ts` returned `outcome: 'executed'` regardless, attaching `transitionError` as an
  optional field on the `executed` member — so the TYPE itself said "executed, with an error".
- `transitionError` was written by one line and **read by nothing in the repo**.
- So: a human approves, `evidence.append` fires, the PA thread does not move, and the audited row
  reads `executed`. That is precisely the harm `parseDemoOutcome`'s own docstring says it exists to
  prevent, reached through the outcome field instead of the outcome vocabulary.

Closed at four layers: `PA_STATES` / `PA_EVENT_TYPES` / `isPaState` / `isPaEventType` derived from
`Record<PaState, true>` and `Record<PaEvent['type'], true>` in `paMachine.ts`; `RouteDefinition.pa`
and `CompiledRoute.pa` narrowed to those unions; membership checks in
`routingSchema.validatePaTemplate`, `adl/schema.parseRoute` and `compile.mjs checkRoutes`; and
`PaResult` split so `not-advanced` carries a REQUIRED `transitionError` while `executed` carries
none — the type can no longer express "executed, with an error". `'not-advanced'` added to
`AGENT_DEMO_OUTCOMES` as its own member rather than folded into `executed`, because the difference
between "the thread advanced" and "it did not" is the entire content of the record.

**[F9, F10] Two corrections about where the pattern and the tests belong.**
- The mirror restates FOUR vocabularies and the first parity test pinned the one that is not an
  authority or state-machine control. `PA_STATES` and `PA_EVENT_TYPES` are now pinned by set
  equality and length in the same test. **Still OPEN:** `AUTONOMY_ORDER` and `PHI_ORDER`
  (`authority/types.ts:17-19`) remain hand-written `readonly string[]` against their unions — the
  autonomy and PHI **ceilings**, i.e. exactly where this pattern earns its cost. Deferred to W1
  rather than done here, because an ordered RANKING needs a `satisfies`-checked tuple plus a
  `Record` witness (`Object.keys` order is not a contract to lean on for a ranking), and that is a
  design question, not a mechanical substitution.
- The new rejection case was asserting `failures.length > 0` on a hand-built object, having widened
  `compile.mjs`'s public surface (`export function checkRoutes`) to reach it — while
  `mirrorFailsClosed.test.ts` already had a harness that drives the REAL inputs through
  `compileFromDisk` and can assert the property safety actually depends on: **`manifestJson ===
  null`, nothing emitted.** CLAUDE.md pre-flight #2 (REUSE FIRST) named that seam. The export is
  reverted and three cases now live in the existing harness — taskKind, PA state, PA event — each
  asserting nothing was emitted.

**Seat findings accepted and NOT yet done, carried as named W1 items rather than closed:**
`AUTONOMY_ORDER`/`PHI_ORDER` derivation and their mirror pinning (F9); `recordUnrouted`'s dedupe key
lacking `memberId`, so two members sharing a signalId collapse to one refusal (Minor, unreachable
from the seeded batch); `AGENT_TASK_KINDS` typed `readonly string[]` rather than
`readonly AgentTaskKind[]`; `dispatch/index.ts` not re-exporting `AGENT_TASK_KINDS` /
`isAgentTaskKind`, so `adl` reaches past the barrel; three further ref-resolution rules the seat
identified by inspection (`crosswalks.json` `assetId`, `risk-families.json` `activeAssetId`,
`toolAllowlist[]` → `tool-bindings.mock.json` `handlerId`); and **negative tests for the two new
gate scripts themselves** — every containment above is currently proven by a recorded execution in
this log, not by a test in `tests/`.

### Adversarial-AFTER round 2 — seat R1 domain-fidelity + D4 policy (NY Medicaid MCO): **NO-GO**

3 Unacceptable, 11 Significant. Its lead finding is a WITHDRAWAL of this wave's central claim, so that
comes first, and it is recorded with the trace that settles it rather than with either party's account.

#### WITHDRAWN: the demonstration this wave's policy decision rested on does not occur

This log states at the Wave 0 content decision: *"A live `no-basis-on-file` refusal on an EPDS perinatal
screen, filed under MHL §33.13, is the stronger governance demonstration."* **That is false, and the
decision to decline the permitted-by-statute branch was taken on the strength of it.**

The seat reported the live reason is `agent-class-not-declared`, reasoning that `bh.screening.indicated`
carries `actionability: 'member-outreach'` and therefore routes to `outreach-agent`, whose declared
classes are `['demographic','social-need']`. That routing analysis is correct and its conclusion —
that the claim in this log is false — is **UPHELD**. Its replacement claim is also wrong. Traced live
through `runRealDemo()` → `routeBatchGated`:

```
DROP    sig=sig-7   action=suppress  reason=consent-absent
REFUSAL sig=sig-10  agent=outreach-agent  reason=disclosure-denied
                    decisionReason=agent-class-not-declared
                    basis=42 CFR Part 2 §2.31 (written consent identifying the recipient)
REFUSAL sig=sig-2   agent=agent/none  reason=no-route
REFUSAL sig=sig-3   agent=agent/none  reason=no-route
TASK outreach-agent/outreach · referral-coordination-agent/referral · pa-documentation-agent/pa
```

`sig-7` — the EPDS screen — is **SUPPRESSED BY THE SDE with `reasonCode: 'consent-absent'` before
dispatch exists.** It produces no disclosure decision at all; the disclosure plane never sees it. So the
log named the wrong control (SDE consent gate, not the disclosure plane), the wrong layer, the wrong
reason code, and the wrong statutory filing — and a scope decision was then built on top of all four.
The refusal that DOES carry a heightened basis is `sig-10`, a `care-gap.opened` carrying
`part2Restricted: true`; its Part 2 §2.31 basis is CORRECT fail-closed behaviour, not a defect.

#### The finding that is larger than this wave: the heightened-regime plane is barely reached

Derived from `signal-taxonomy.json` (11 entries) and the trace above:
- **Ten of eleven** signal kinds floor at `demographic` or `social-need`.
- **Exactly one** floors at `mental-health` — `bh.screening.indicated`, which is suppressed upstream.
- **Nothing floors at `hiv` or `substance-use-disorder`.** SUD arrives only via the instance-level
  `part2Restricted` flag; the NY PHL Art 27-F branch has **no data path at all** and is reachable only
  from tests.

So the three-regime disclosure plane that `dispatcher.ts` presents as the heightened set is
exercised on the live path by ONE signal through ONE flag. R3: a declared regime with no data path is a
governance claim the demo cannot make. This is a WPCO-scope item, not a Wave 0 item, and it is named
here because this wave's entry implied the BH regime was demonstrated.

#### Confirmed independently, by direct check rather than on the seat's word

- **`rec.parked` is written and read by nothing in `src/`.** `engine.ts:310` sets it with the comment
  "parked with audit; re-activatable, NEVER silently expired". Grep: one write, zero reads in `src/`
  (two test reads are of the EVENT payload, not the record). The park branch emits an event, schedules
  no timer, does not re-enqueue the work item, does not change its queue, and never resolves
  `rec.resolve` — the workflow sits in `waiting-decision` permanently, and "re-activatable" names no
  mechanism. **DEMOTE** `escalation.ts:2-4` / `engine.ts:310` as a closed control: it never silently
  expires the EVENT; it silently abandons the ITEM. Identical class to `transitionError` above.
- **Prior authorisation is LIVE AND ROUTED**, while the dispatch modules asserted it was "WITHDRAWN by a
  standing scope decision". Trace: `TASK pa-documentation-agent/pa route=pa-appeal-documentation` on
  every demo run, off `sig-5` (`denial.issued`). The scope statement and the routing data disagree.
  Wave 0 then widened the side the scope statement says is closed, by adding `'not-advanced'` to
  `AGENT_DEMO_OUTCOMES` — a shared, screen-facing enum projected by `/api/ops/agents/actions`. **This
  needs a user scope ruling before W1**; it is not an engineering call and is not resolved here.
- **A real regulation cited for a proposition it does not support** — the class this programme keeps
  hitting. `disclosureGate.ts:144` and `:249` both assert "42 CFR 2.20 makes the stricter rule
  controlling". §2.20 is *Relationship to State laws*: it supports that for the Part 2 ↔ state-law pair
  only and says nothing about the HIPAA ↔ MHL pair, which is what both comments use it for. The honest
  citation for the HIPAA side is **45 CFR 160.203(b)**.

#### `bh-acute` must not land as authored — and the seat derived arithmetic this wave did not

| tier | hops fire | PARK at | vs `default` |
|---|---|---|---|
| urgent | T+4h, T+8h, T+12h | **T+16h** | **byte-identical to `default`** |
| high | T+8h, T+16h, T+24h | T+32h | default: 24h/2 levels |
| routine | T+24h, T+48h | **T+72h** | default: 72h/1 level |

Two defects the per-hop figure hid. **(a)** `hierarchy[0]` is `assigned-reviewer` — the person the
proposal has been waiting on since T+0 — so the first hop escalates to the existing owner and nobody
above the assignee sees an acute BH item until **T+8h**, no clinical supervisor until T+12h. **(b)** The
"acute" policy's `routine` tier parks at 72h, the same park as the revenue-cycle default's `high`. And
the urgent tier, the one that defines an acute policy, is a verbatim copy of the policy governing
`revenue-cycle-agent`, an underpayment-appeal drafter. **The name is the only clinical content.**

The hierarchy also names **no licensed clinician**: `assigned-reviewer` / `care-team-lead` /
`clinical-supervisor` are org-chart strings, `escalation.ts:20` types `hierarchy: string[]` with no
vocabulary, and an acute BH terminal that is a *supervisor* rather than a *crisis pathway* has the
direction wrong — escalating up a management chain is the response to a work-queue SLA breach, not to
an unanswered acute behavioural-health item. Nothing in the tree references 988, mobile crisis,
CORE/crisis intervention or psychiatric on-call.

**The bounding claim is UPHELD, on stronger grounds than this wave stated.** `bh-acute` is genuinely
unreachable, on three barriers: no route names the agent; **no `WorkflowDefinition` anywhere declares
`agentId: 'bh-screening-triage-agent'`** and `AgentWorkflows` is mapped over `AgentTaskKind`, so a
fourth kind has no workflow and `startTask` would refuse; and every app entry into escalation hardcodes
`getAgentManifest(REVENUE_CYCLE_AGENT_ID).escalationPolicyRef` → `'default'`. `getEscalationTier(…,
'bh-acute', …)` is called by **no production path**. Which makes the policy set a load-bearing stub in
production shape (R3), authored to turn `check-ref-resolution.mjs` green — **a gate made green by
authoring unreachable clinical content certified the wrong thing.**

#### Part 2 currency — flagged for independent verification, NOT accepted as fact here

The seat reports the Part 2 model is pre-February-2026: the 2024 final rule implementing CARES Act
§3221 had a compliance date of **16 Feb 2026** (seven months before today), after which a recipient
covered entity MAY redisclose Part 2 records received under a TPO consent per HIPAA, while the
prohibition surviving universally is use against the patient in proceedings. `decide.ts:212-220`
asserts `part2-redisclosure-prohibited` unconditionally on the data class and `OBLIGATIONS` has no
member for the proceedings prohibition — the two the wrong way round. Separately,
`ConsentBasis.recipientOrgIds` is a flat `readonly string[]`, so it **structurally cannot represent** a
post-2024 general-designation TPO consent, and every compliant one denies `recipient-not-named`.
Carried as a W1 verification task against primary sources, not recorded as established.

#### UPHELD by the seat, recorded because a confirmed claim is evidence too

- **MHL §33.13(d)** does name MCOs, BHOs and health homes and permits the exchange without a signed
  authorisation (verified verbatim against NY Senate / Justia). Declining to seed a fabricated third
  instrument was the right call and the reasoning stands.
- §33.13(d)'s own closing text requires consent where federal law mandates it, **citing 42 USC
  290dd-2** — so gating the future `PERMITTED_BY_STATUTE` branch on `!part2Restricted` has the statute
  behind it. But the permission's axis is "between **facilities** and" those entities, its object is
  "information … including identification" rather than "clinical records", and two conditions are
  load-bearing and unrepresentable today (DOH/OMH authorisation; enrolment). **`RecipientKind` has no
  member for facility, health home, BHO or MCO, so the proposed W4 branch keyed on `recipient.kind`
  cannot be written correctly against the current vocabulary.** NYS DOH's own guidance to MCOs/HHs/CMAs
  does not cite (d) for clinical content.
- `decide.ts:82-86` on 45 CFR 164.501 (operations names case management and care coordination) and
  `disclosureSources.ts:26-34` on the 164.508 core elements are **correct**.
- `slaHoursFor`'s 72h expedited / 168h standard pair aligns with 42 CFR 438.210(d) as amended for
  rating periods from 1 Jan 2026 (7 calendar days standard, 72 hours expedited).

#### Further blocking findings carried to W1, not closed

`denial.issued` floors at `['demographic']` and its recipient is `internal`, so a BH adverse
determination — overwhelmingly likely to name an OMH- or OASAS-licensed service for a HARP population —
is permitted on the HIPAA baseline **with no consent lookup**, which is verbatim the defect
`disclosureGate.ts:14-19` presents as closed for `bh.screening.indicated`. `TPO_REACHABLE_KINDS` is
wrong in both directions (no `health-care-provider` kind, so 164.506(c)(2)-(3) disclosures to a
non-covered-entity provider deny; and 164.506(c)(4)'s relationship conditions are unchecked).
`requiresDisclosureGate`'s docstring is false — it never reads `recipient.kind`, so a `social-need`
signal bound for an `outside-covered-entity` CBO returns "may be dispatched without the gate".
`deadline-unknown` maps to the `high` tier, i.e. a 32-hour park under an acute policy for an item whose
defining property is an undeterminable deadline. NY's heightened set is larger than the three modelled
(Civil Rights Law §79-l genetic; MHL §22.05 / 14 NYCRR Part 815 OASAS, binding independently of federal
Part 2; reproductive health). No §33.13 / Art 27-F / 164.528 disclosure-accounting projection exists.
`MHL §33.21` minor self-consent is unrepresentable — and the seeded signal is a perinatal screen whose
subject may be a minor. `evidence.append` fires BEFORE the transition in `paAgent.ts:86`, so a
`not-advanced` row leaves an orphaned evidence write the record does not name.

### Adversarial-AFTER round 3 — seat R3 stub-legitimacy + C1 convention steward: **NO-GO**

4 Unacceptable, 8 Significant. **Its framing objection is accepted and comes first: Wave 0 was
billed refactor-only and is not a refactor.** `AI-CODING-CONVENTIONS.md` §13.1 forbids mixing
refactor and feature work; §17 lists it as an anti-pattern ("neither intent is verifiable"). What
landed under the refactor banner includes a new observable refusal reason that changes the
`/api/ops/agents/actions` payload, a new `PaResult` union member on a live path, a new member in a
screen-facing enum, two new blocking CI gates, and a clinical escalation policy set authored then
deleted. The seat's words: *"a mixed wave whose behaviour changes are reviewed inside a diff nobody
is reading for behaviour."*

**[F1, Unacceptable] `check:all` was FAILING on the tree while the receipts table above reported the
size gate PASS.** `dispatcher.ts` reached **419 lines against a 400 cap**, unbaselined, and
`check-file-sizes.sh` exited 1 — the second rung of `check:all`, so it fails before ADL, lint or
vitest run. The receipt was true when written and went stale across the two adversarial amendments,
neither of which re-ran the gate. Cause, and it is the sharpest criticism in this round: **the wave's
own remediation mechanism is comment archaeology, and comment archaeology has a size budget.** ~90
lines of "what this used to say and why it was wrong" prose in one header. This log IS that record;
duplicating it into the module is the DRY violation E4 covers. Fixed by trimming the archaeology to
log pointers (419→409) and then extracting `startTask.ts` by responsibility — the same split this
file already took twice, for `routingSchema.ts` and `dispatchTasks.ts`. Now **326 + 107**, gate
exit 0.

**[F11, related] An earlier `replace` silently no-matched and left "the WITHDRAWN
prior-authorisation agent" in a RUNTIME ERROR STRING** — reaching logs and the ops API, telling
whoever debugs a dispatch refusal that a live routed agent is out of scope. The docblock was
corrected and the string the docblock is about was not. Conventions §13.3: *"markers are maintained
like code."* Corrected, and verified by grep rather than by assuming the replace applied.

**[F2, Unacceptable] The `not-advanced` fix does not reach the audit record.** `agent.task.executed`
is emitted by the engine at APPROVAL time, before the workflow body resumes and therefore before
`transition()` is attempted. `PaResult` has exactly one consumer (`projectResult`, feeding a demo
screen); the C2 stream is the durable record. The honesty landed in the shallowest layer and is
absent in the deepest. **PARTIAL DEMOTE of C-004/F3: closed in the type, open in the record.**
`WorkflowContext` exposes no emit, so this is a C2 envelope contract change with its own design
round — carried as **G-002** and, crucially, **carried by a test rather than by prose**:
`paDocumentation.test.ts` → `it.fails('TRIPWIRE: emits no agent.task.executed for a thread that did
not advance')`, which passes today because the assertion fails and goes red the day the emit is
corrected.

**[F3, Unacceptable] The wave's headline fix shipped with ZERO tests.** `not-advanced` existed in the
producer, the type and the enum, and nothing drove the branch. The seat also caught that
`demoSeam.test.ts`'s "the union is closed" case is tautological — `parseDemoOutcome` IS
`AGENT_DEMO_OUTCOMES.includes(raw)`, so iterating the array the implementation tests membership
against restates the implementation and passed with no new evidence when the member was added.
Closed: four real cases in `paDocumentation.test.ts` plus a DERIVATION test that turns
`AGENT_DEMO_OUTCOMES`'s "DERIVED FROM THE SHIPPED RESULT UNIONS" docstring into a set comparison —
because that docstring had already gone stale, the **fourth** false comment claim in this wave.

**[F4, Significant/blocking] The defect class was still open one field over, three lines from where
it was closed.** A `pa` route with **no template** passed `adl/schema.ts` and the mirror (both only
checked `pa` when present), emitted byte-identically, and then `parseAgentRouting` threw at module
load taking every dispatch — verbatim the failure `dispatch/types.ts`'s own comment says the wave
closed. Required-when-`pa` presence check added at both layers (C-005).

**[F5, Significant] `escalationPolicyNote` was not a legitimate field, and it proved a fail-open.** A
~1,200-character English essay in a machine-validated data file that **no type, gate or consumer
sees**: `AgentDefinition` has no such member, `parseAgentDefinition` silently DISCARDS unknown
top-level keys, `checkDefinition` has no whitelist, and `project()` never emits it. The fail-open is
the finding: the mirror whitelists keys at depth 2 (`match`) and depth 3 (`pa`) with the comment
*"the TS parser WHITELISTS match keys"* — the discipline exists, is written down, is tested, and was
applied at depths 2 and 3 but **not at depth 1**. This wave used the hole it did not close. Real
consequence beyond tidiness: `dataCapability` and `phiFullOverride` are OPTIONAL, so `"dataCapabilty"`
silently produced an agent declaring no data classes — fail-closed at the disclosure gate, as
`agent-class-not-declared`, i.e. the right refusal for entirely the wrong reason with no diagnostic.
Closed (C-006) with a `DEFINITION_KEYS` whitelist in both implementations and two rejection cases
asserting `manifestJson === null`. The note is removed; its content is now G-007.

The seat also caught the note **indicting the withdrawn policy for a property the adopted policy
has**: it criticised `bh-acute` for `hierarchy[0] === 'assigned-reviewer'`, which is exactly
`default`'s `hierarchy[0]`; and it framed sharing `default` as a bh-specific provisional gap when all
five agents share it. Prose in a data file cannot be checked; that is why it does not belong there.

**[F6, Significant] `check-mutation.mjs` scored a BROKEN TEST COMMAND as 100% catch-power.** Any
non-zero exit was read as "mutant killed" — a typo in `mutation-targets.json`, a renamed test file, a
config error, a module-resolution failure, a 180s timeout, an OOM — and each printed `PASS (E13):
every sampled mutant was killed - tests have real catch-power`. It is the same blind spot
`check-ref-resolution.mjs` names in its own header ("A GATE MUST VERIFY ITS OWN REACH"), fixed there
and not carried to the file edited in the same commit. Closed (C-011): the suite now runs on pristine
source first and `exit 2` on a non-green baseline, proven with a nonexistent test file. Second defect
in the same function: `sample`'s comment claimed it deduped overlapping sites and **never did**, so
`['>=','>']` and `['>','>=']` both matched a single `>=` and the second mutant produced `>==` — a
syntax error, tests fail, counted a **guaranteed false KILL**. Every `>=` and `<=` in a target
inflated the reported rate. `dedupeSites` by index, keeping the longest match.

**[F8, Significant] `minRefs` was an exact count dressed as a minimum.** 5/5/3 against a tree holding
exactly 5 agents, 5 lock entries and 3 routes — zero headroom. Withdrawing one agent (the ruling
already taken for W1) drops two rules to 4 and turns the gate RED on a change it should be
indifferent to; the obvious response is to decrement the literal, at which point the reach check is
maintained by hand by whoever wants it green — the exact vacuity it was built to prevent. Closed
(C-012) with a committed `ref-resolution-baseline.json` written by `--write-baseline`, the mechanism
`check-file-sizes.sh`, `check-wiring.mjs` and `check-testlink.mjs` already use: a DROP is a finding, a
RISE is fine, and changing the expectation is a visible diff in a separate artifact. Proven by
renaming the `routes` key. Also closed (C-014): `check:refs` was in no npm chain a developer runs
while `AGENTS.md` names `check:all` as the gate — now the third rung of it.

**[F7, Significant] Two blocking gate scripts with no tests, structurally outside the gate that would
require them.** `check-testlink.mjs` walks `src` only and filters to `.ts`/`.tsx`, so
`docs/build-provenance/*.mjs` is excluded twice over — by accident of the filter, not by a reviewed
decision, and nothing records the exemption. NOT closed; carried as **G-009** with the counter-design
(`execFileSync` against `mkdtempSync` fixture trees, asserting exit code and stderr per containment).
The seat's scenario is not hypothetical: `check-mutation.mjs` has already corrupted this tree once,
and `isRecoverable` returns `false` only while `DECLARED_TARGETS === null` — one reordered line
reverts it to an arbitrary-path write primitive.

**[F10] `bh-screening-triage-agent` graded "Risky as bounded, Unacceptable as ATTESTED."** Accepted.
`/api/ops/agents/authority` returns it under audit action `agents.authority.attest`. The seat's
process criticism is also accepted: the repo rule is that a gate is not landed permanently-red, and it
does not license leaving the red CONDITION in the tree while the gate sits in a log — there were two
green paths (withdraw the declaration, or land the rule with a baseline freezing the one finding, as
`wiring-baseline.json` and `testlink-baseline.json` already do) and this wave took neither. Carried as
**G-006** with the user's ruling: WITHDRAW in W1.

**E8 WAS NOT BEING HONOURED, and that is this round's structural finding.**
`docs/framework/enforcement-kit.md` E8 requires *"one cumulative register (Gap & Stub Risk
Register)"* read at iteration start and updated at iteration end. **No such file existed.** Findings
were landing here — a chronological narrative, correct for provenance and wrong for this job: a gap
recorded at line 3400 of a 3700-line log is "acknowledged and then forgotten" exactly as E8
describes. `docs/build-provenance/gap-stub-risk-register.md` now exists, carrying open items graded
Critical/High/Med and closed items per E12.

**"Every finding from all three adversarial-AFTER seats is in it" — WITHDRAWN.** That sentence stood
here and was FALSE, and it is the one sentence in this register's provenance that had to be true. An
R5 cross-examination found five findings recorded in this log with no register entry: the
`AGENT_TASK_KINDS: readonly string[]` typing; the `dispatch/index.ts` barrel bypass that lets `adl`
reach past it; NY MHL §33.21 minor self-consent (on a PERINATAL screen, where the subject may be a
minor); round 3's **accepted** §13.1/§17 refactor-vs-feature framing objection; and round 1's
narrowing of the recovery proof to sequential-single-process. All five are now G-026..G-030.

The sharper half of that finding, recorded because it is structural and not clerical: **the
register's disposition vocabulary had no slot for "the wave itself should not have been shaped this
way"** — so round 3's framing objection survived only in the narrative the register was created to
replace. That is the E8 failure recurring inside the E8 fix. The register now carries a
`PROCESS` section for exactly that class.

**Verified correct by the seat, recorded because a checked claim is evidence:** `routingSchemaGuards`'
`refusesAt` helper does NOT hide a weak assertion (a non-throwing parse leaves `err = null` and the
`toBeInstanceOf` fails); `dispatchFidelity` is not vacuous and every `route()` lever is exercised;
`mirrorFailsClosed` asserts `manifestJson === null` rather than `failures.length > 0`; the
`Record<T, true>` derivation works exactly as claimed at all three sites; `mirrorParity` now pins the
vocabularies by set equality AND length, closing the duplicate-entry hole; no Wave 0 file appears in
`quality-baseline.json`, so §3.3 is respected. And the seat's own assessment of
`check-ref-resolution.mjs`'s "a gate must verify its own reach" as *"the single best idea in the
wave"*, with its objection aimed at the `minRefs` implementation and not the principle — which is why
the principle was then propagated to `check-mutation.mjs` in the same round.

---

### Wave 0 CLOSING RECEIPTS — measured after every amendment, on the tree as it now stands

**Why this section exists.** An R5 cross-examination of the four entries above found that **no
suite-green receipt existed anywhere in Wave 0**: the receipts table had ten rows and no `vitest run`
total, while fourteen CLOSED items in the register assert "a test that exists AND PASSES in the
current suite". The earlier tables were also measured before two rounds of amendments and went stale.
Per E5 the orchestrator runs the authoritative gate after every wave; per G-025, a receipt carries
the point it was measured at. Everything below was measured after the last amendment, sequentially,
with nothing else running — the full suite is never run concurrently with the mutation gate, because
that gate mutates real source and produced 18 phantom failures earlier in this wave.

| gate | command | result |
|---|---|---|
| E12 types | `npx tsc --noEmit` | **0 errors** |
| §2 sizes + E2 ratchet | `bash check-file-sizes.sh` | **PASS** — no new violations, ratchet intact (129 frozen legacy files unchanged or smaller) |
| data ref resolution | `node docs/build-provenance/check-ref-resolution.mjs` | **OK** — 3 rules, 13 refs resolved, reach `{escalation-policy-ref:5, escalation-policy-ref-lock:5, routing-agent-ref:3}` against the committed baseline |
| ADL byte-identity | `node tools/adl/verify.mjs` | **PASSED** — 5 definitions, 5 lock entries, 3 routes in authored precedence, manifest + routing byte-identical |
| E1 seams | `node tools/seams/verify.mjs` | **PASSED** — 11 granted tools, 0 production bindings, all fail closed |
| E13 test-link | `check-testlink.mjs src tests` | **PASS** — untested 243 vs baseline 246 |
| E14 wired-path | `check-wiring.mjs src` | **PASS** — lib orphans 27 vs baseline 52 |
| E16 shift-left | `check-page-boundaries.mjs` | **OK** — 262 files, 0 findings |
| **full suite** | `npx vitest run` | **464 files passed, 2 skipped · 3,874 tests passed, 0 failed, 74 skipped · exit 0** |
| lint, Wave 0 files | `next lint --file` ×11 | **0 errors, 0 warnings** |

**E13 mutation — all 17 targets, from the config as landed, replacing every withdrawn figure:**

```
npi.ts 4/4 [4 of max 6]              goldenRecord.ts 6/6 [6/6]        membership.ts 3/3 [3 of 6]
authz.ts 6/6 [6/6]                   decisionGate.ts 8/8 [8/8]        auditLedger.ts 6/6 [6/6]
recordLifecycle.ts 6/6 [6/6]         meat.ts 6/6 [6/6]                deqmIngest.ts 5/5 [5 of 6]
coverageRequirementCards.ts 6/6 [6 of 8]
dispatcher.ts 8/8 [8 of max 8]       disclosureGate.ts 12/12 [12/12]  touchpointDisclosure.ts 2/2 [2 of 6]
consentGate.ts 3/3 [3 of 5]          dataClassFloor.ts 2/2 [2 of 4]
dispatchTasks.ts 3/3 [3 of max 8]    routingSchema.ts 8/8 [8 of max 8]
PASS (E13): every sampled mutant was killed — exit 0
```

`dispatcher.ts` **8/8 from `maxMutants: 8` as landed** — the figure that was withdrawn for being
unproducible from a `maxMutants: 6` config is now produced by the config that ships.
`routingSchema.ts` **8/8**, up from **4/8** when the target was added: the four survivors were all
`&& → ||` on shape guards, which only a TRUTHY wrong-shaped value or an empty string can distinguish,
and no test had ever fed one. The `[sampled N of max M]` column is new, added because deduping
overlapping operator sites after sampling silently shrank the denominator below `maxMutants` with no
diagnostic — dedupe now runs BEFORE sampling and the draw is printed.

### The gate the repo documents cannot pass, and it is not Wave 0's doing

`npm run check:all` was run END TO END for the first time here. **Exit 1, at the `lint` rung**, on 24
pre-existing ESLint errors in `src/app/uhg-orchestrate/**` — `no-empty-pattern`, `prefer-const`,
`react/no-unescaped-entities` — in five demo pages, none touched by this wave. `lint` is the sixth
rung of seven, so **`vitest run` never executes inside `check:all`, and cannot.** CLAUDE.md's stated
non-negotiable is therefore unsatisfiable as written, and `ci-gates.sh`'s `g_lint` lints CHANGED FILES
ONLY, which is why the tiered gate stayed green while the documented gate was red. Registered as
**G-031**. Not fixed here: fixing 24 errors in five unrelated demo pages inside a wave already
criticised for mixing refactor and feature work would be the same violation again (**G-030**).

### Standing corrections to this log, so a reader does not have to reconcile it themselves

- The `dispatcher.ts 8/8` mutation figure in the Wave 0 entry and its receipts table: **WITHDRAWN**,
  superseded above.
- "Made green by authoring the `bh-acute` policy set": **WITHDRAWN** — no such policy exists on disk.
- "Every finding from all three adversarial-AFTER seats is in it": **WITHDRAWN** — five were missing
  and are now G-026..G-030.
- The C0 containment row's `main()`: **fictional**, corrected. C0 and C5 **DEMOTED to re-run
  required** (the region they exercise was amended twice since). C1–C4 **UPHELD** by line-by-line
  cross-examination.
- Round 1 and 2 file:line citations were written against a 419-line `dispatcher.ts` that is now 316
  lines after a trim and the `startTask.ts` extraction. The two load-bearing ones are de-lined above;
  treat any remaining `file:line` in rounds 1–2 as measured at that round, not at this tree.
- The register's "one write" for `rec.parked` is **two** (initialiser plus set). Zero reads: upheld.
- `rec.parked`'s G-001, `denial.issued`'s G-003 and nine other open items were verified against code
  by the R5 seat and **UPHELD**; the eight CLOSED items citing tests were verified by reading each
  test body and **UPHELD**.

**Wave 0 status: the code is green on every runnable gate and the record now matches the tree. It is
NOT "done" — G-030 says this wave should not have been shaped this way, and G-009 says two blocking
gate scripts still have no tests of their own.**

---

## 2026-09-27 — W7.5b (blocker): one autonomy vocabulary, and a ledger that states what happened

**Trigger (skill §2):** domain/business logic in `src/lib/**`; new modules; a safety invariant and a
fail-closed default. Full coalition required — not a skip.

### Round 1 — architect + SWE (carried from the W7.5b design pass)
Four private rung→label maps (`flowSim.seal` inline, `e2eFlow.RUNG_AUTONOMY`,
`escalationSignals.RUNG_GATE`, `nistMap`'s oversight derivation), disagreeing at A0 — `'watch'` vs
`'assist'` — with nothing reading the label back.

### Round 2 — adversarial-BEFORE (3 BLOCK, all verified in the live tree before acting)
Home the map in `nistMap`, not `agents/authority`; keep `AUTONOMY_ORDER` as `readonly string[]`;
guard the clamp by a declared `kind` rather than a `·` test; bind `AnalystWorkbenchResult`'s `gate`
to a `ProcessGate` token; pin literals rather than derived-vs-derivation; add the clamp to the hash;
state the per-file line delta for the two baselined files. All actioned.

### Round 3 — BUILD, first cut
`nistMap` single rung→label map · `sealClamp.ts` extracted · `SealArgs.kind` · `clamped` hashed ·
`flowSim` 2650→2649 · `e2eFlow` 802→797 · `escalationSignals.RUNG_GATE` derived · `decisionGate`
exhaustive switch with a `never` witness (MED-9) · G-005 exhaustiveness witness.

**Defect found DURING the build, by a test rather than a gate:** `seal` hashed `clamped` while
`verifyEntryDetail` and `ledgerIntact` recomputed without it — three hand-copied 14-element field
literals — so every untouched row would have read as tampered. A tamper-evidence control that cries
wolf on clean records is a control nobody reads. Fixed at the root, then tripwire-proven by deleting
the field from the list and watching the test go red.

### Round 4 — adversarial-AFTER, derived lens set (R1 fail-closed semantics · R4 test effectiveness)
Two independent reviewers, dispatched in parallel, read-only. Every finding below was **re-verified
by hand against the live tree** before it was acted on (CLAUDE.md pre-flight #1); two reviewer claims
were rejected on that basis and are recorded at the end.

**BLOCK — the clamp was a record-rewriter, not a control.** Accepted and the design reversed. See
register **G-039**. The clamp fired after the act, produced the `A0 … EXECUTED` agent row
`proposeOutbound` says can never exist, and guaranteed that "what did your agents do above what they
had earned?" returned nothing. Replaced: `ceilingRecord.assessCeiling` OBSERVES — it returns no
`rung` and no `version`, so no caller can use it to rewrite a record — and the ledger carries
`earnedCeiling` + `overCeiling` as hashed facts. `sealClamp.ts` deleted.

**Findings verified and fixed:**

| # | Finding | Verified at | Fix |
|---|---|---|---|
| 1 | Clamp rewrote the record; act ran regardless | `flowSim.ts` `enterSubStep` | `ceilingRecord.ts`; rewrite removed |
| 2 | `minRung` returns the STRONGER rung when one is unranked (`undefined <= 3` is `false`) | `interlock.ts:43` | unranked floors to `A0` |
| 3 | `evaluateInterlock` discarded `gate.requiresHuman` → `{resolved:false, requiresHuman:false}` + a reason claiming auto-resolution | `interlock.ts:122` | `requiresHuman \|\| gate.requiresHuman`, and the same value into `buildReason` |
| 4 | `ledgerIntact` never compared `prevHash` past row 0 | `flowSim.ts` | link check added; negative test |
| 5 | `clampSeal` passed any rung outside `A0–A3` through **unclamped**, at full stated authority | `sealClamp.ts:66` | unreadable rung ⇒ `overCeiling: true` (unprovable ≠ within) |
| 6 | `rungLevel('A2·D2')` → `22`; `'A2.5'` → `25`; its `\|\| 0` fallback unreachable | `sealClamp.ts:55` | `-1` for anything that is not exactly one rung token |
| 7 | Duplicate rung parser shipped in this wave | `flowSim.ts:158` | `displayAuthority` reuses `rungLevel` |
| 8 | `ledgerHashParts` constrained its parameter, not its coverage — a 15th field compiles clean and ships unhashed | `flowSim.ts` | `Record<keyof LedgerHashable, true>` witness; parts derived from its keys |
| 9 | Untrusted tier interpolated into a documented PHI-safe reason returned in an API body | `decisionGate.ts` | fixed string |
| 10 | `kind` optional ⇒ "omitted means act" is still an inference | `flowSim.ts` `SealArgs` | `assertSealGrammar` throws on a `GRANT·`/`REVOKE·` version that did not declare itself |
| 11 | **My own false INVARIANT**: the new test claimed `rank()` returns `-1`; it **throws** | `assertAuthority.ts:21-25` | header corrected; G-005 closed by derivation instead |
| 12 | `nistMap` header pointed at one fail-open and named neither of the other two | `nistMap.ts:23` | corrected |

**Re-pin discipline.** The reviewer proposed proving the re-pin by re-deriving the old 13-field
digest and showing it still equalled `3794285767`. I ran it: **2394765267**. The proposed proof does
not hold, because this change also rewrites `rung`/`version`/`oversight` on 218 rows — so, unlike
re-pins 1 and 2, this one cannot be defended as "the field set changed, nothing else". Recorded that
way rather than shipping the tidier story. `determinismPin.test.ts` now carries `INVARIANT_DIGEST`
(829350661) over the fields no ledger-format change may alter — who acted, when, on what, in what
order — established at this re-pin as the forward guard, plus an explicit `218 / 251` over-ceiling
pin. Chain head `2719275098 → 1204273244`; `tick` 684 and `ledgerSeq` 251 unchanged.

**A green test was INVERTED, deliberately.** `earnedAuthority.test.ts:31` asserted "never RECORDS a
non-human autonomous act above the earned ceiling" and was green **because the clamp rewrote the
evidence**. A safety pin satisfied by falsifying the record is the one way a pin must never go green.
It now asserts the truth — the acts exist, and every one carries the disclosure — and G-039 owns the
prevention.

**Reviewer claims REJECTED after verification:** (a) that a production loader can deliver an unknown
autonomy tier to `evaluateDecision` — it cannot; `assertManifestsWithinLock` → `assertAuthority.rank`
throws first. The `never` switch stays as defence in depth and its comment now says so honestly, and
the *reachable* boundary is pinned for the first time in `authorityGateRuntime.test.ts`. (b) that the
E14 wiring baseline should shrink by 25 — the recorded C1 review withholding that shrink still holds
(barrel- and 403-route-reachable only); the slack was not spent.

**Deferred, registered, not smuggled in:** G-039 (admission control, W8) · G-040 (the disclosure
renders nowhere, W10) · recon sub-ledger hashes 13 of ~24 asserted fields including `memberLiability`
and `humanGated` (G-041) · revocation is silent at the A1 floor, and `earnedLookback` is a counter no
consumer reads and the next grant erases (G-042) · `mixHash` is unkeyed, so the chain proves
CONSISTENCY not cryptographic evidence — now stated in `ledgerSeal.ts`'s header rather than implied.

### Verify (E1–E16)
`tsc --noEmit` 0 · sizes PASS, **baselines tightened** flowSim 2650→2631 (now 2594) and e2eFlow
802→797 · `adl:check` byte-identical · seams PASS · ref-resolution PASS · **adverse-gate 1/1** ·
member-substitution 0 · maria ratchet 57=57 · E13 PASS, **baseline tightened 246→237** (9 verified
individually; one was a deleted file) · E14 PASS (shrink withheld, see above) · E16 page-boundaries 0
· **vitest 3943 passed / 0 failed / 74 skipped**.

New modules: `ceilingRecord.ts` (102) · `ledgerSeal.ts` (111). New tests:
`goldenThread/autonomyVocabulary` (27) · `agents/authorityVocabulary` · MED-9 block in
`agents/governance/decisionGate` · load-time refusal in `agents/authorityGateRuntime` · authority
ladders in `agents/adl/mirrorParity`.

Gate ratchets `check-testlink.mjs` and `check-wiring.mjs` gained `--list`: both reported a count of
modules whose slack could be taken up and refused to name them, which makes a ratchet a nag.

---

## 2026-09-28 — W7.5c adversarial-BEFORE: **NO-GO**, and W7.5c-0 (the prior fixes) landed

**Trigger:** new capability on the adverse-determination path + a safety invariant. Full coalition.

### The design that was returned NO-GO
A new `src/lib/agents/qualification/` module: `ReviewerQualification` anchored on a validated NPI via
`@/lib/identity/provider`, carrying licence / board certification / taxonomy and an `attestedBy`
grade; a MATCHED-EXPERTISE predicate computed as an NPPES taxonomy-family match; wired into the
adverse branch of `/api/pa/decision` beside `assertAdverseEligible`.

### Two seats, dispatched in parallel, read-only (R1 fail-closed binding · R5 regulatory)
Every load-bearing finding below was **re-verified by me against the live tree** before it was acted
on, and the regulatory text was checked against the primary source, not the reviewer's summary.

**R1 — NO-GO. R5 — GO-WITH-CHANGES (four blocking).** Both independently killed the central
predicate. Accepted in full. The five that decide the design:

1. **WRONG MODULE.** `src/lib/authz/approvalAuthority.ts` already is this seam — identity of record
   resolved from the session principal and never from the caller, one model in mock and production, a
   registered resolver that fails closed, and `ApproverIdentity.npi` already present. A new module
   would have made **three** reviewer-authorization mechanisms (that one at `/api/pas/submit:150`,
   the boolean at `decisionGate.ts:95`, and mine). Direct hit on pre-flight #2 and #5. W7.5c extends
   `approvalAuthority.ts`.
2. **WRONG BIND POINT — and it is the G-035 defect again.** Verified: `engine.signal()`
   (`agentRuntime/engine.ts:80-89`) hands `signal.decidedBy` straight to `decide()` with **no**
   qualification check, and `agents/demo/index.ts:185` reaches it over HTTP with the literal
   `'demo-reviewer'`. Wiring the route alone binds 1 of 8 paths. Registered **G-045, Critical**.
3. **WRONG ANCHOR, AND AN OVERCLAIM.** NPPES carries no licence, expiry, board certification,
   sanction or exclusion — `seedDirectory.ts` confirms it. Taxonomy is self-reported enumeration
   data. The seed's own `2084P0800X` (Psychiatry) family-matches `2084N0400X` (Neurology): pass, not
   a BH peer. And an LTSS personal-care reduction fails a taxonomy match against the RN care manager
   who is exactly the right reviewer. **Do not compute a match — attest it**, with a named attester,
   a standard-applied reference, and a timestamp. Compute only what the data supports: expiry as at
   the decision, jurisdiction, and a restricted flag.
4. **THE REGULATORY READING WAS WRONG.** Verified verbatim at eCFR: 438.210(b)(3) says *"appropriate
   expertise in addressing the enrollee's medical, behavioral health, or long-term services and
   supports needs"* — not "clinical expertise" (that is **438.406(b)(2)(ii)**, appeals, which adds
   *"as determined by the State"*), and not "physician". So there is **no computable federal appeal
   predicate to put in the floor** — federal law delegates it — and the "federal floor in code, packs
   may only narrow" rule is structurally false for appeals. The appeal floor is the two things
   federal law states unconditionally (not involved in a prior level; not a subordinate of someone
   who was) plus a pack-identified determination reference that fails closed when absent. Registered
   **G-044**; the false citation was also live in `e2eFlow.ts:512`.
5. **`attestedBy` IS THE SELF-REPORT HOLE**, and reusing `@/lib/agents/provenance` does not close it:
   `origin` there is also caller-stamped, and `assertAdverseEligible` checks derivation consistency,
   not who wrote the origin. `authorityGate.ts` is the pattern that does close it — rebuild from the
   verified set rather than inspect what was handed in. So: no `attestedBy` field, no exported
   constructor, and a resolver-minted opaque token the decision record is the only thing that accepts.

**Also missing from my design, both named:** §438.406(b)(2)(i) prior-involvement and subordination —
no field, no store, no org hierarchy anywhere in the tree, and an appeal gate without it would pass
the reviewer who issued the original denial. And the **deemed-adverse contradiction**: `e2eFlow.ts`
already models a 438.404(c)(5) clock-expiry deemed adverse determination, which **has no reviewer** —
so the new assert either makes that path unreachable or forces a fabricated reviewer record. Two
shipped controls contradict and nobody had decided which wins.

### W7.5c-0 — the prior, separable fixes, LANDED
The reviewers' sequencing point stands: the qualification work cannot start on top of these.

- **G-043** — the reviewer of record's NPI `1730154783` is check-digit invalid (computed 2). In 26
  files. Green because `goldenThread/validate.ts.validateNpi` was `/^\d{10}$/` — a second, weaker NPI
  validator — and `hardening.test.ts:33` asserted the invalid value was `ok`. Fixture corrected to
  `1730154782` everywhere; `validateNpi` delegates to the one `isValidNpi`; the regex deleted; the
  exact bad string is now a pinned negative assertion. Had this not landed first, anchoring
  qualification on `isValidNpi` would have thrown on the demo's own reviewer.
- **G-044** — the false §438.210(b)(3) citation corrected in `e2eFlow.ts` and four documents, against
  the primary source.
- **G-045, G-046** registered, owed in W7.5c.

### Verify
tsc 0 · sizes PASS · adl · seams · refs · adverse 1/1 · member 0 · maria 57=57 · E13 PASS · E14 PASS
· E16 0 findings · **vitest 3944 passed / 0 failed / 74 skipped**.

### Scope note, stated rather than absorbed
W7.5c as planned was "a data model". The BEFORE round establishes it is not: it is a **program-spine
change** — `WorkflowSignal` and `HumanDecision` gain a resolved reviewer reference across the engine
and four call sites, a new `credentialing` DATA_MODE seam, and a resolver-minted token type. That is
larger than the wave it was scheduled inside, and it is recorded here rather than quietly expanded.

---

## 2026-09-28 — W7.5c: reviewer qualification (C-REVQUAL), built on the corrected design

**Trigger:** new capability on the adverse-determination path + a safety invariant + a new seam.

### Round 1-2 — the BEFORE round returned **NO-GO**; see the previous entry
Five design choices were wrong: wrong module (a third reviewer-authorization mechanism), wrong bind
point (the route, not the engine), wrong anchor (NPPES carries no credentialing facts), an overclaimed
predicate (a taxonomy-family match the data cannot support), and `attestedBy` as a self-report. The
regulatory reading was also wrong — 438.210(b)(3) says "appropriate expertise", not "clinical
expertise" (that is 438.406(b)(2), appeals, which delegates to the State), and never "physician".

### Round 3 — BUILD, on the corrected design
`src/lib/authz/credentialing/` (a `credentialing` DATA_MODE seam, fail-closed in production; expertise
ATTESTED with a named attester and standard, never computed; NPI as optional enrichment, not the
anchor); the bind at `engine.signal()`; `isQualifiedHumanDecision` renamed `isNonAutomatedDecider`;
the demo driver resolving a real reviewer; `check-reviewer-qualification.mjs` wired into `check:all`.

**The bind proved itself immediately: 58 existing tests went red** because they could no longer forge
a decider. They now obtain a proof through the same door production uses.

### Round 4 — adversarial-AFTER (R1 fail-closed + R4 non-vacuity). **3 BLOCK, 3 HIGH, 5 MED.**
Every finding re-verified by me in the live tree before acting. The frame finding was correct and
uncomfortable: *the wave minted a rich, unforgeable proof and then compared one string*. All fixed:

| | Finding | Verified | Fix |
|---|---|---|---|
| **BLOCK-1** | `assertSignalDecider` never read the verdict — an `administrative` proof (no licence check, no attestation check) resolved a **clinical adverse** determination, and a `medical` proof resolved a **behavioral-health** one. The demo minted ONE proof for the whole batch. | yes | `verdict.boundTo` scope + `proofCovers`; `PendingRecord.determinationClass`/`needDomain` from the ACTION not the tier; a proof per proposal, and `awaitingScope` published so a driver mints the right one |
| **BLOCK-2** | **The client chose whether the clinical bar applied.** `isAdverseCoverageAction(body.actionType)` — free text. `actionType: 'pa-determination'` matched no adverse token → administrative → no licence, no attestation. An unlicensed reviewer could record a BH denial. | yes | a rejection is **clinical by default**; only an enumerated, server-validated `denialBasis` relaxes it, and it is recorded. Tripwired: 8 tests go red on the old logic |
| **BLOCK-3** | The gate self-bound (a function DECLARATION matched `name(`), and a two-line refactor deleting the engine bind left it printing `OK — 4/4`. | yes | `REQUIRED_SITES` by name, `DEFINERS` excluded, declaration-stripping, and the site markers + declaration rule now self-test. Tripwired: the exact escape is caught |
| **HIGH-4** | `runGovernedAction` — a full parallel resolution path, exported and unguarded, invisible to the gate. Its one caller qualified first; the function did not. | yes | `executionAuthority.assertExecutionAuthorised`, scoped to a human decision (an auto-proceed has no reviewer to name) |
| **HIGH-5** | **A date bomb.** Seed licences expired 2027-06-01 and every record went stale 2027-06-06 — on every route, which passes `now()`. The demo would have failed closed on a calendar date, blaming the reviewer's licence. | yes, arithmetic checked | seed timestamps are OFFSETS re-based onto the decision time; `lookup(ref, asOfMs)` is now point-in-time, which is the correct credentialing semantics anyway |
| **HIGH-6** | The demo evaluated licences against a frozen `SEED_EPOCH_MS` on a production-mode HTTP path — looking healthy while the routes would 403. | yes | the demo's own clock |
| **MED-7** | The bind was also too STRONG: every HITL proposal demanded a clinical peer, so approving an outreach call required one. | yes | class derived from `isAdverseCoverageAction`, not the tier |
| **MED-9** | **Nothing executed `/api/pa/decision`.** The qualification-before-taint ordering was pinned by neither execution nor grep. | yes | `paDecisionQualification.test.ts` drives the real handler — 13 cases, including the enumeration-oracle ordering case |
| **MED-10** | The brand is compile-time only; a cast, a spread or a future JSON boundary satisfied it. | yes | a module-private `WeakSet` + `isMintedProof`, checked at every consumption point |
| **MED-11** | The wave that fixed "two mechanisms disagreeing about the placeholder identity" shipped a **third**, normalising differently. | yes | one `PLACEHOLDER_IDENTITIES` in `authz/principal`, consumed by all three |
| **LOW-12/13** | A seed comment asserted the record beside it had no NPI; `FAKE_FIDELITY.md` said "nine reviewers" (ten) and oversold the binding and non-constructibility. | yes | all corrected; the binding paragraph now states what it does NOT verify |

**Two substantive misses the round found, both now built:** the qualification verdict was computed,
used, and **discarded** — the one artifact proving 438.210(b)(3) compliance never reached the durable
record, so `buildDecisionProvenance` now carries `reviewerQualification`; and `CredentialRecord` gains
`excluded` / `exclusionCheckedAtMs` with a `reviewer-excluded` refusal, because 42 CFR 455.436 monthly
exclusion screening is the higher-frequency audit finding and retrofitting it later is an interface
freeze. The seeded source does not screen, and FAKE_FIDELITY says so: **unscreened is not clear**.

**Registered, not smuggled in:** G-047 (deemed-adverse has no reviewer and the proposal parks — a
member neither approved, denied nor appealable) · G-048 (nothing MEASURES the gate; observed refusal
rate on any real path today is zero and nothing would say so) · G-049 (the gate can itself be an NQTL
under Subpart K) · G-050 (`isAdverseCoverageAction` is still a substring match over a client string
everywhere else it is used).

### Verify (E1–E16)
tsc 0 · sizes PASS (three extractions rather than baseline growth: `executionAuthority.ts`,
`seamDispositions.authz.ts`, `qualifyDecider.ts`) · adl · seams · refs · **adverse 1/1** ·
**revqual 4/4, tripwire-proven** · member 0 · maria 57=57 · E13 PASS · E14 PASS · E16 0 · lint: 16
pre-existing `uhg-orchestrate` errors (G-031), 0 in changed files · **vitest 4006 passed / 0 failed**
(from 3,944).

---

## W7.5d 92210 — 45 CFR 92.210 identification and mitigation

Anchor for the fairness lock's `evidenceRef` entries. The full wave entry follows below; this heading
is what `src/lib/fairness/data/fairness-lock.json` cites, so that following the evidence trail from
any mitigation lands somewhere real. The gate (`check-92210.mjs`) refuses an `evidenceRef` whose file
or anchor does not resolve, because the first cut of the record cited two anchors that existed
nowhere in the tree — thirteen assertions, zero of them checkable.

**What a reader arriving from a mitigation should know.** The record identifies 43 input variables
across `MemberContext`, `PolicyPack`, `Signal` and `TaxonomyEntry`; 30 are in scope with a mitigation
and 13 are administrative-excluded with a stated basis. Review dates are staggered across a six-month
window so the record cannot lapse on a single day. Six mitigations are partial and their residues are
itemised at **G-051 92210 residues** in the risk register rather than buried in prose.

**What it does not claim.** OCR declined to mandate documentation for §92.210; it encourages written
policies and procedures, and its reasonable-efforts factors include whether a methodology or process
exists for evaluating a tool. This record is EVIDENCE of reasonable efforts. It is not a compliance
finding, and a green gate is not one either.

---

## 2026-09-28 — W7.5d: 45 CFR 92.210 identification and mitigation (C-FAIRNESS)

**Trigger:** new capability on a member-affecting decision path + a new reviewed record + a gate.

### Round 1-2 — adversarial-BEFORE: GO-WITH-CHANGES, three blocking corrections
The design put a `decisionSupport: { protectedInputs: ['race'|'sex'|...] }` block on each agent. All
three corrections were upheld, and the first is the one that mattered:

1. **My paraphrase of (b) was wrong in the load-bearing word.** I wrote "employ race … as INPUT
   VARIABLES". Verified verbatim at eCFR, the rule says **"input variables OR FACTORS THAT MEASURE"**.
   A factor that measures race is not required to be called race, and that clause is what carries
   proxies into scope. Keying the schema on the six bases could only ever record the literal half.
2. **The unit of regulation is the INPUT, not the agent.** `outreach-agent.agent.json` holds no
   scoring logic; the factors live in `sde/engine/rules.ts` and a policy pack, and all of it can
   change without touching an agent definition. A per-agent record stays green while the scoring
   surface is edited.
3. **A declaration inside the artifact it governs is a self-attestation.** `authority-lock.json` is a
   control because it is separate, narrowing-only, re-applied at load and orphan-refusing. So:
   `fairness-lock.json`, with those four properties.

**Five live proxies the round found, every one of which an author would have declared `[]`:**
`channelPreference` · `recentEdWithinHours` · `Signal.measure` (sex/age-bounded by construction,
hiding behind a field its own comment calls PHI-safe) · `contactHistory` · the BH data-class floor.

### Round 3 — BUILD
`src/lib/fairness/` (types, lock, validator, enumeration), `check-92210.mjs`, the engine bind, and a
`/CODEOWNERS` file — which did not exist, so `authority-lock.json`'s own "CODEOWNERS-protected"
comment had been asserting a control that was not there, and this wave was about to inherit it.

### Round 4 — adversarial-AFTER: **2 BLOCK, 4 HIGH, 5 MED.** Its frame finding is the wave's lesson:

> **any gate whose three legs are all declarations will pass over code that reads none of them.**

All fixed. The two that made the record FALSE:

| | Finding | Verified | Fix |
|---|---|---|---|
| **BLOCK-1** | The gate walked 2 interfaces; the engine reads 4. `TaxonomyEntry.defaultChannel` — the input that **actually selects the member's channel** — was invisible, 10 of 11 taxonomy rows carry one, and `resolveChannel` took it BEFORE the member's stated preference. **A deaf member whose recorded preference was SMS received care-gap outreach on `portal`.** The lock's flagship entry claimed the opposite mechanism. | yes, in source and data | `resolveChannel` reordered (internal `task` routing exempt); gate walks `Signal` + `TaxonomyEntry`; lock grew 17→**43** entries; the two false bases corrected |
| **BLOCK-2** | **Every mitigation's evidence resolved to nothing.** Seven cited `#g-051` and `#w7-5d`, which existed nowhere; six cited the code being mitigated. Thirteen assertions, zero checkable. | yes, by grep | `evidenceResolves()` in the gate — a missing file, a missing anchor, or a ref into `src/` is now a finding; G-051/052/053 and the log anchor created |
| **HIGH-3** | The test titled "disposeBatch asserts identification on the real path" **never called `disposeBatch`** — delete the bind and it stayed green. The declared-and-unbound failure, inside the test written to refute it. | yes | drives the engine with a failing lock; tripwire-proven |
| **HIGH-4** | `staleMitigations` had **no caller** — the ongoing-duty half returning a list into the void. And all 13 entries shared one `reviewedAtMs`, so the whole record lapsed on **2027-06-01** — the same single-epoch cliff, on the same date, as the credentialing seed this module cites as its lesson | yes, arithmetic | bound into `DispositionBatch.fairnessDemotion` (demote, never brick); review dates staggered across 6 months |
| **HIGH-5** | The extractor returned `[]` — truthy — so a mis-parse would have skipped the whole check and printed OK | yes | empty read exits 2; self-test extended |
| **HIGH-6** | `check:92210` and `check:revqual` were in `package.json` and **not in `ci-gates.sh`** — which is the repo's own **G-024** ("E14's doctrine is not applied to the enforcement kit") | yes | both registered, plus `g_gateregistry`: a gate that fails when any `check-*.mjs` is not run here |
| MED-8 | The five proxies the header names are not the five in the lock — the BH data-class floor was dropped and the count preserved by substitution | yes | `TaxonomyEntry.dataClassFloor` given its own entry |
| MED-11 | `memberId`'s exclusion basis said "supports no clinical decision" — false; it gates the hard opt-out | yes | corrected to the real ground: an opaque identifier MEASURES nothing |

### The fix found a second §1557 effect, and the record says so
Honouring a member's single stated channel **concentrates** all their outreach onto it, so that
channel's per-channel frequency cap binds harder — **a member who names one accessible channel is
suppressed more than one who names none**, and those members are disproportionately members with a
disability. Visible in the engine's own test: supersede-off used to free a suppression; it now only
changes the reason to `frequency-cap`. Registered **G-053**, recorded as residue on two lock entries.

### Demo parity re-walked, deliberately
Acceptance shape **6/3/1 → 7/3/0**. The delay it used to show was this member being moved off their
stated `portal` preference onto `sms` and then caught by the quiet-hours window — an artifact of
overriding them. **G-052** records the cost: the seeded batch no longer exercises the delay path, and
the honest fix is a second demo member who prefers SMS, not re-introducing a delay this member should
never have had.

### Verify
tsc 0 · sizes PASS · adl · seams · refs · adverse · revqual · **92210 43/43** · member · maria · E13
· E14 · E16 · lint unchanged (16 pre-existing `uhg-orchestrate`) · **vitest 4031 passed / 0 failed**.

### Still owed, named
Outcome measurement is the largest: all 43 mitigations are design-time and structural, and the only
disparity capability in the repo is the SIMULATED fairness screen — which the lock correctly forbids
citing. **Banning the fake measurement without building a real one discharges the (c) duty by
documentation.** Also: no language field (LEP is cited as measured in three entries and the
architecture cannot express a remedy), no auxiliary-aid channel types, no §92.8 procedure, no §92.7
named Coordinator behind the role token, no tool provenance/vendor fields, and `memberFacingReason`
renders nowhere.

---

## W8 — the park/handoff terminal and the audit event (G-001, G-002)

**Trigger:** core-logic change to `src/lib/agentRuntime/**` — the C2 event vocabulary, the escalation
terminal, and the workflow terminal transitions. Full panel.

### Round 1–2 — architect + SWE
Two register entries, one wave, because they are the same defect seen from two ends: the runtime was
asserting things it had not observed. `agent.task.executed` at approval time asserted an EFFECT the
engine never performs (`useTool` does), before the body had even resumed to attempt its state
transition. `rec.parked = true` — two writes, zero reads in `src/` — asserted a RE-ACTIVATABLE hold
that named no mechanism, on a work item left indistinguishable from one still actively escalating.

### Round 3 — adversarial-BEFORE: **GO-WITH-CHANGES; items 1 and 3 NO-GO as written.**
All five of its load-bearing claims re-verified here rather than taken on report. The sharpest:
**my own register entry at G-047 said "the engine already models the clock", and it was false** —
`flowSim` has a Monte-Carlo probability, `nistMap` a label, `scenarios` a string, and there is no
deadline field, no clock and no notice artifact anywhere in the runtime. A declared-not-bound claim
written into the register that exists to catch them, and it was the premise the first design rested
on. Corrected before any code.

The NO-GOs killed a synthesised `HumanDecision` for the terminal: `decision` is
`'approved' | 'rejected'`, and `paAgent.ts:76`, `referralAgent.ts:65` and `governedAction.ts:299` all
test for `'rejected'` and treat everything else as approval — so widening that union would have
compiled clean and routed an abandonment into the EXECUTION branch. `'rejected'` would have been
worse: a timer-manufactured adverse benefit determination carrying 42 CFR 438.404 notice and appeal
duties that nothing here discharges.

### Round 4 — BUILD
`agent.task.executed` removed from `AGENT_C2_EVENT_TYPES`; `agent.task.settled` and
`agent.task.abandoned` added. Approval carries `effectPending: true`. `abandon()` moves the item to
its own `parked` queue, emits `agent.task.abandoned` and terminates the instance with status
`abandoned`. Three modules extracted under the ratchet: `escalationLadder.ts`, `memberTimers.ts`,
`instanceTerminal.ts`.

### Round 5 — adversarial-AFTER: four derived lenses, in parallel. **NO-GO on landing as built.**
Lenses: workflow-runtime lifecycle · 42 CFR 438 regulatory reading · refactor-fidelity and
concurrency · gate-and-evidence integrity. Three of the four independently found the same frame
failure, and none of them found it by reading the diff.

> **The escalation ladder cannot fire in the running application.** `advanceTime()` has zero callers
> in `src/`; every composition root pins `createManualClock(...)` and never moves it. W8 built,
> tested, extracted and documented a terminal that no production path can reach.

Verified here by grep before acceptance. Recorded as **G-057** and as its own numbered row in
`FAKE_FIDELITY.md` — the honest disclosure, not a fix; a wall-clock or sweep driver is its own wave.

**The finding that matters most is one of my own defects, and it is a new shape of the recurring one:**

| | Finding | Verified | Fix |
|---|---|---|---|
| **BLOCK-1** | **The G-002 tripwire did not go red at closure — I renamed it.** It asserted `ofType('agent.task.executed')).toHaveLength(1)`, the wrong-today value on purpose, so the day the emit was corrected it would go RED. W8's mechanical `executed`→`settled` replace across the suite made it true of the FIXED engine for a different reason. It stayed green; its header went on describing an approval-time emit that no longer existed; the register went on listing G-002 open. Found by the review, not by the control built to find it. | yes, by reading the test | Replaced with assertions that encode the fix: the settle event's OUTCOME (`not-advanced`) and its ORDER (after the approval, not at it). Closure and the procedural lesson recorded in the register's CLOSED (W8) section |
| **BLOCK-2** | **I shrank `wiring-baseline.json` by 25 entries on the strength of the gate's own advisory line, without reading the `SHRINK WITHHELD` verdict four lines above the list.** That file's own text calls this "the ratchet rotting in the direction that flatters the report, which is the failure E14 exists to prevent." | yes — re-checked all four recorded blockers: exactly ONE has since cleared | All 25 restored, with the re-verification recorded in the file. **A gate advisory is a measurement, not an authorisation.** |
| **BLOCK-3** | **`LadderPort`'s narrowness claim was false.** The header said the ladder "cannot resolve a proposal"; `PendingRecord.resolve` was passed straight in, so one line inside `abandon` would have compiled, resumed the abandoned body, and run its `useTool` effect with `settle()` early-returning so the effect never reached the stream. A throwing `resolve` in the test fixture was standing in for a capability boundary. | yes | `LadderRecord = Omit<PendingRecord, 'resolve'>` — the claim is now true at the type level. **G-054** |
| **HIGH-4** | The new `WorkflowTerminatedError` throw landed on a `void`ed promise chain (the auto-approve path) — an unhandled rejection, and `rec.resolve` never reached, so the workflow wedged at `waiting-decision` with no timer and no signal path. | yes | One `decidable()` funnel: loud only in `signal()`, where a human waits; silent on the machine paths. Chain gets `.catch(err => this.fail(...))`. The guard also fails CLOSED on a missing instance — `inst?.done.settled` would have read `undefined` and resumed the body the moment anything reaps the map |
| **HIGH-5** | **`fail()` emitted nothing.** An approved proposal whose body then throws left `approved{effectPending:true}` and silence — byte-identical to a crash between the two, which is the one case `effectPending` claims to make distinguishable. Its whole justification was false on the path that most needed it | yes | `failInstance` emits `settled{status:'failed', outcome:'errored', errorClass}`. Error TEXT excluded: `snapshot.error` can name a member, the class cannot. Pinned by the PA guardrail test |
| **HIGH-6** | **`settledOutcome` copied ANY string** the workflow returned into a payload declared "PHI-safe: refs + codes only" — while its docstring claimed parity with `parseDemoOutcome`, which is a closed-set membership test. The inverse of the control it cited | yes | `SETTLED_OUTCOMES` closed vocabulary; anything else sinks to `'unreported'` |
| **HIGH-7** | Widening `WorkflowSnapshot['status']` with `'abandoned'` walked into the exact trap `types.ts` argues against for `HumanDecision`, one union over. `driveAutoApprove` spun its full budget; `awaitSuspension` threw "never suspended within N turns" — a wrong diagnosis on a fail-closed path a route maps to a 500. No compile error at either site | yes, both sites | `TERMINAL_STATUSES` + `isTerminalStatus`, one vocabulary, both sites converted |
| **HIGH-8** | The ladder's hop re-arm was the LAST statement after two awaits on injected seams. One transient sink failure left `hopsSoFar` advanced, the item in `escalated`, and **no timer armed** — G-001 exactly, through the error path | yes | re-arm moved into `finally` |
| **HIGH-9** | `g_gateregistry` — the gate that watches the gates — `grep`ed the whole file including comments, so a check named only in a comment satisfied it; and it never checked a `g_*` is INVOKED. Verbatim the defect `g_adversegate` documents four lines above itself | yes | comment-masked, plus a leg derived from the `run` invocations; masker self-test added; **tripwire-proven** — deleting one `run` line prints `g_fairness is defined and never invoked` |
| MED-10 | One rejecting timer aborted the whole wheel, so every OTHER member's due timer in that window silently never fired — cross-member starvation in the module whose header claims per-member ordering | yes | per-timer isolation, errors raised as an `AggregateError` after the wheel drains |
| MED-11 | `cancel()` marked `cancelled` and retained the entry, so every decided proposal left a `fire` closure holding the whole `PendingRecord` (member id, action, refs) alive for the process lifetime | yes | cancel reclaims |
| MED-12 | Stale docs asserting removed behaviour: `README.md` still enumerated `.executed` four lines under the paragraph W8 corrected; `workQueue.ts` still said a parked row is "still ACTIONABLE" — the retracted claim, in the queue type definition; `escalation.ts`'s header still gave timer scheduling to the engine; four agent READMEs | yes, each by grep | all corrected |

### The register was lying about the live tree, and one of its figures was wrong in the safe direction
G-001 and G-002 sat under `OPEN — Critical` describing code that no longer exists. Both moved to a
new **CLOSED (W8)** section, each citing a test that exists and passes. And G-047's "measured" hop
arithmetic was short by one window on all three tiers — the terminal is itself a hop. Corrected:
urgent **16h**, high **72h**, routine **144h**. The correction surfaces what the entry was written to
warn about and missed: **the `high` tier abandons at exactly 72 hours, the expedited regulatory
number.** A coincidence at the precise hour where an untimely decision becomes a denial under
42 CFR 438.404(c)(5) will be read as enforcement of the 72-hour rule. It is the opposite.

### Filed rather than fixed, because each is its own wave
**G-055** the `onExhaust: 'park'` data vocabulary now misstates the behaviour · **G-056** (Critical)
`buildProposalWorkItem` computes a CMS-0057-F `dueBy` from `proposeAndWait` time and the reviewer
page RENDERS it, while 438.210(d) runs from receipt of the request for service, which this runtime
never observes · **G-057** no production driver for the ladder · **G-058** nothing consumes the C2
event stream, so `effectPending`'s open-interval join names something nothing performs.

### The recurring defect changed shape, and the detector has to change with it
Instances 1–8 were *a control declared and its binding not load-bearing*. **Instance 9 is a binding
that survived the fix by being renamed.** Grepping for unbound declarations will not find it:

> When a wave closes a defect, the tripwire that carried it MUST go red before it is rewritten. A
> tripwire edited in the same change that lands the fix is the thing to review hardest, and a
> mechanical find-and-replace across the suite is exactly the edit that hides it.

### Verify
tsc 0 · sizes PASS (ratchet intact, 129 frozen files unchanged or smaller; `engine.ts` 417/422) ·
adl · seams · refs · adverse · revqual · 92210 43/43 · member · maria · E13 (237/237 baseline, two
new modules carry a real suite) · E14 (baseline restored to 52) · E16 · gate-registry tripwire-proven
· **vitest 4040 passed / 0 failed / 74 skipped**.

---

## W9 — design round only. **Two NO-GOs, no production code, and the register grew by seven.**

**Trigger:** ADL → A2A Agent Card + ARD catalog projections (W9 as planned), then the internal
registry projection (W9b). Full panel on both. **Nothing was built.** Both rounds ended before code
because the adversarial-BEFORE findings were scope findings, not design defects.

### Research first, and it changed the design before the design existed
Two bounded rounds against the normative A2A proto and the official reference SDK (`@a2a-js/sdk`).
**The buildout plan's A2A field list was the v0.x shape** — emitting it would have produced a
well-formed card no v1.0 registry can read: no top-level `url`, `preferredTransport` and
`additionalInterfaces` gone, `protocolVersion` moved onto each interface, `stateTransitionHistory`
removed, `security` actually `securityRequirements` and double-nested, task states `TASK_STATE_`-
prefixed, and `protocolBinding` an **open-form string with no enum** whose value is `JSONRPC` with no
separator — so nothing would ever have rejected a typo. All landed into the plan's §3 and §5.2, so
whoever builds W15 inherits the correction rather than the error. Required-ness remains UNVERIFIED
(**G-061**): the JSON Schema was refused on provenance across two rounds, and this repo's rules
forbid routing around that with curl.

### W9 adversarial-BEFORE — **NO-GO.** Two lenses, same frame finding, reached separately.

> W9 as planned builds the projection with **no consumer**, and its output is the **exact
> complement** of what W10 needs.

W10's catalog needs tier, PHI posture, data classes, tools, escalation policy, routes, binding
status. The A2A card is specified to strip exactly those seven. **Overlap zero, by construction** —
and the wider record already exists in `agent-manifests.json`. All four of W9's design forks (no
endpoint, no signing key, no published media type, no authored public description) exist *because*
the consumer is six waves out. Filed **G-059**.

**My own worst defect:** I proposed `application/vnd.a2a.agent-card+json` for the ARD `type` field and
registered it as a knowing UNVERIFIED guess. The real value, **`application/a2a+json`**, was
`A2A_CONTENT_TYPE` in the package I had already installed and cited as my primary source — one grep
away, in a document whose §0 exists to prevent exactly this. *"Registered as UNVERIFIED" is not a
substitute for looking.* **G-060.** (And `vnd.a2a.*` would have been an RFC 6838 vendor-tree
ownership claim over a Linux Foundation project.)

Two more that were determinate build failures, not risks: the deny-list gate **can never pass** (all
five agents carry `escalationPolicyRef: "default"`; every valid card requires `defaultInputModes`),
and the recommended skill projection **contradicts that gate** — `revenue-cycle-agent`'s `purpose`
contains two of its own tool ids verbatim.

### W9b adversarial-BEFORE — **NO-GO**, and it found the two largest items of the wave.

**G-064 — a SECOND fabricated registry, larger than the first, on the demo happy path.** W10 was
scoped to retire `agent-coalition-monitor` as "the single largest credibility risk in the demo". It
is not the largest: `agent-library/page.tsx` renders **32 invented agents** under the heading *"Agent
Marketplace & Capability Registry"* and prints `REGISTRY ID: AGT_{(Math.random() * 900000 +
100000).toFixed(0)}` — **a registry identifier regenerated on every refresh**. It is **step 39 of the
39-step demo script**, and the talk-track PDF tells the presenter to call it *"the full 31-agent
registry"* where each agent *"has a performance record — activation count, resolution rate, escalation
rate"* (none exist; G-048). **Fixing one of the two makes the exposure worse**: the app would hold an
honest 5, a rendered 32 and a spoken 31, with the honest screen being what makes the contradiction
findable.

**G-063 — the authority lock is a COPY of the definitions it governs.** Measured, five agents, every
dimension: tools declined `[]`, tier HITL vs ceiling HITL, posture references-only vs ceiling
references-only. `generate-definitions.mjs` bootstrapped the lock from the manifest. So
`assertWithinAuthorityLock` — six checks, a hand validator, a plain-node mirror, a fail-closed
`rank()`, a dedicated test file — **cannot fail on the shipped set by construction.** Every mechanism
correct; none load-bearing.

This is the defect `assertFairnessLock.ts` was written to avoid, **in the artifact that module cites
as its exemplar**: it argues a declaration inside the thing it governs is not a control because it has
"nothing to compare against", and names four properties that make `authority-lock.json` one instead.
Properties 2–4 hold. Property 1 — separateness — holds in form and not in substance. The buildout
plan offers this lock as *the* answer to "how do we trust a third-party agent". It exists; it has
never been exercised.

### Built anyway, because they are right under every branch of both pending decisions

**G-062, closed and tripwire-proven.** `check-file-sizes.sh` scanned `src tests e2e` with extensions
`ts tsx js jsx` — so the plain-node mirror `adl:check` executes, `ci-gates.sh` itself, and all nine
`check-*.mjs` had no cap and no ratchet. **The files that police the ratchet were the files the
ratchet could not see.** Widening it exposed a second, sharper instance than the one reported: an
**844-line test file inside the scan directories all along**, invisible purely because of its
extension. Both pre-existing breaches baselined at current size — baselining a newly-SCANNED file is
a different act from growing an already-baselined one.

**`check-authority-narrowing.mjs` — the gate that would have caught G-063.** Nothing measured the one
property that makes the lock a control: that *something is narrower than something else*.
`assertWithinAuthorityLock` answers "is the definition within the ceiling", which a copy satisfies
perfectly. This answers the question underneath: **is there a ceiling at all, or is the ceiling the
floor?** A ratchet, not a hard failure, because authoring real ceilings is a governance act and
inventing them here would be the fabrication the register exists to catch — so the measurement is
*printed every run* and may only improve. **Deliberately not a tripwire**: W8 just closed a defect
whose tripwire had been mechanically renamed and stayed green, and a ratchet cannot be satisfied by
renaming.

**Tripwire-proven in four directions:** widening one ceiling reports `1/5` and `PROGRESS`; a baseline
of 1 against a reality of 0 exits **1** with *"a control that stopped existing"*; an empty read exits
**2** rather than reporting a green zero; and reordering the restated `AUTONOMY` ladder turns the
parity test red. The `g_gateregistry` check — itself repaired earlier this session — accepts the new
gate, and the newly-widened size gate is already watching the new `.mjs` file.

### Two decisions left open, with the preparatory work done
1. **W9 scope** — internal catalog now with A2A/ARD at W15/W16, or keep as planned and accept it as
   mechanism-only (G-059).
2. **The fabricated Marketplace** — retire both screens, relabel `agent-library` as an explicitly
   illustrative roadmap surface, or defer and record the exposure (G-064). Touches the 39-step demo
   script and the presenter talk track, so it is a delivery decision.

### Verify
tsc 0 · sizes PASS (131 frozen, ratchet intact) · adl · seams · refs · adverse · revqual · 92210 ·
**narrowing 0/5, baseline held** · member · maria · E13 237/237 · E14 · E16 · gate registry OK ·
**vitest 4044 passed / 0 failed / 74 skipped**.

---

## W9c — the browser pass. **The repo did not build, and nobody had looked at a screen.**

**Trigger:** the user asked whether the code was tested for a GitHub load, then asked directly
whether `npm run dev` had been used to check screens. **It had not — not once, in any wave this
session.** Every wave closed on gates, `tsc` and 4044 unit tests. CLAUDE.md pre-flight #4 names
"browser-verified on the running app" as part of the DoD, and it was skipped every time. This entry
exists because the first hour of actually looking found more than the previous three waves of static
analysis.

### What a browser found that 15 gates and 4044 tests did not

**1. `next build` FAILED (G-066).** A `'use client'` page imported the `@/lib/dataSources` barrel for
two pure string helpers; the barrel also re-exports `submissionGateway`, which imports `node:crypto`.
Webpack pulled a Node builtin into the browser bundle.

Two gates should have caught it and neither could. `check-page-boundaries.mjs` class C is *"a src/app
file importing a Node builtin"* — it scans DIRECT imports in `src/app`, and the builtin was three
hops away behind a `src/lib` barrel; it reported `OK (264 files scanned, 0 findings)`. And **E16 is
named as a CI gate in CLAUDE.md while `check:all` never ran `next build`** — the authoritative gate
was not in the chain anyone runs. Fixed by importing the leaf module; build passes, 129/129 pages.
`check:build` and `check:clientbundle` now run in `check:all`, ahead of `lint` so they execute.

**2. The screen W8 shipped had never been seen to render (G-067).** `/work-queue` sat on `Loading…`
forever. The error alert and the loading line were independent siblings, so a real 401 produced

```
Not authenticated
Loading…
```

— simultaneously, permanently. Both are authenticated BFF routes, so the failure the spinner hides is
an expired session. **The parked lane W8 built, tested, extracted and documented had never once been
observed on screen.** Fixed and tripwire-proven by reverting the guard. `evidence/[id]` and `access`
were checked individually and are CORRECT — two instances, not the four a pattern-grep suggested,
which is why each was verified rather than assumed.

**3. A hydration text mismatch on at least three screens (G-068), registered UNISOLATED.** Along the
way: these pages rendered `useState(() => clock.nowIso())` as text, and because they are statically
prerendered that string was baked in at BUILD time — the page told a reviewer "as of 12:40" at 13:00.
That is the fabricated-precision family independent of hydration, so it was fixed
(`useMountedInstant`, verified in the prerendered HTML on disk). **React #418 still fires afterwards,
so the timestamp was not the cause**, and the register says so rather than claiming a fix. Diffing
prerendered HTML against the hydrated DOM points at the nav chrome, but that diff cannot separate a
real mismatch from a CSS `text-transform` artifact, so no cause is named. Closing it needs an
unminified dev-mode React run.

### Two false alarms, caught by verifying rather than reporting

**A sweep reported all 74 nav routes returning HTTP 500** with `node:crypto`. Five of those same
routes had returned 200 and rendered correctly twenty minutes earlier. Rather than report 74 broken
screens, the dev server was restarted with `.next` cleared — every route returned 200. **The 500s
were my own hot-reload churn poisoning the dev compile**, not a code defect. The real build failure
was found afterwards, by running `next build`, which is deterministic.

**And a gate of my own was wrong on its first cut.** `check-client-bundle.mjs` reported findings
against a tree that builds green, because webpack tree-shakes an unused barrel re-export. A gate that
goes red on a passing build is worse than no gate — the next person disables it, which is the
self-detonating-gate failure this log keeps recording. It is now a ratchet over LATENT risk
(baseline 2: two client entries one value-import away from the failure that broke the build), with
`next build` as the authority. Tripwire-proven in two directions.

### The lesson, which is about this session and not about the code

Three waves of gates, adversarial panels and 4044 tests ran green over a repository that **could not
be built**, on screens that **could not finish loading**. Every one of those controls reads source.
None of them renders a page. The E16 build gate was declared in CLAUDE.md, absent from `check:all`,
and its shift-left companion was structurally blind to the only class that actually broke — the
declared-not-bound pattern, in the gate layer, on the one gate whose absence was load-bearing.

> A gate that reads source cannot see a page that does not render. If nothing in the chain starts the
> app, "green" means the source parses — not that the product works.

### Verify
tsc 0 · sizes PASS (131 frozen) · refs · adverse · revqual · 92210 · narrowing 0/5 · page-boundaries
· **client-bundle 2/2 baseline** · adl · seams · E13 237/237 · E14 · **E16 `next build` 129/129
pages** · **70/74 routes render clean against the production build** · vitest **4044 passed / 0
failed**.
