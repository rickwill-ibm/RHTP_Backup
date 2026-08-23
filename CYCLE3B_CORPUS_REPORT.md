# Cycle 3 — Corpus Scenario-Test Author Report (Iteration 0)

Turned the 70-case ACE Use-Case Corpus (`/home/claude/coalition/inputs/use_case_corpus.md`)
into a **living regression asset**: every case is now accounted for exactly once — either an
executable scenario that drives the real engine(s) end-to-end, or an explicit `it.skip` whose
title names the missing capability. New files live under `tests/scenario/` only; no `src` edits.

## Headline

- **Cases runnable-now: 15** (executable scenarios driving real engines)
- **Cases skipped-pending: 55** (registered `it.skip`, each naming the missing capability)
- **Total accounted: 70** (asserted by the registry meta-tests)
- **Verification:** `npx tsc --noEmit` → 0; `npx vitest run` → fully green
  (519 passed | 6 expected-fail | 64 skipped; the 6 expected-fails belong to the parallel
  `tests/security/*` author, not this work); `bash check-file-sizes.sh` → PASS.

## Coverage table (facet family → runnable-now / skipped-pending)

| Family | Cases | Runnable now | Skipped-pending | Engine(s) exercised |
|---|---|---:|---:|---|
| A Identity resolution | UC-01..06 | 3 | 3 | match/identity engine (`src/lib/identity/*`) |
| B Record assembly across C9 | UC-07..12 | 0 | 6 | — (needs record store + tier registry) |
| C Consent & Part 2 | UC-13..17 | 1 | 4 | provider-access opt-out + authz guard |
| D Graph & keystone reasoning | UC-18..21 | 0 | 4 | — (needs graph store) |
| E Signal disposition | UC-22..26 | 0 | 5 | — (no SDE runtime exists) |
| F Care planning | UC-27..31 | 3 | 2 | care-plan generator + DP-4 validator |
| G Referrals & network adequacy | UC-32..37 | 1 | 5 | network-adequacy engine |
| H Prior auth & gold carding | UC-38..41 | 3 | 1 | FC state machine + evidence ledger + policy + gold-carding |
| I Financial reconciliation | UC-42..46 | 1 | 4 | append-only evidence ledger |
| J Agents & HITL | UC-47..51 | 1 | 4 | backbone gating + deterministic engines |
| K Dashboards & measures | UC-52..55 | 0 | 4 | — (needs measure/view-model projectors) |
| L Operational pipelines/replay | UC-56..60 | 0 | 5 | — (needs pipeline/stream runtime) |
| M Privacy & security | UC-61..64 | 1 | 3 | repo secret-scan (BFF invariant) |
| N Household & pediatric | UC-65..68 | 1 | 3 | match/identity engine (DP-7 distinctness) |
| O Rural barriers | UC-69..70 | 0 | 2 | — (needs SDE runtime) |
| **Total** | **70** | **15** | **55** | |

## Executable cases (runnable-now) — 15

Grouped by facet family; each drives the real engine end-to-end and asserts the corpus
acceptance check (or the exercisable portion of it, with any deferred clause named).

| UC | Title | File | What is driven / asserted |
|---|---|---|---|
| UC-01 | Cross-source anchor at enrollment | `corpus_A_identity.test.ts` | `resolveIdentity` anchors Maria across EMR/payer/state-agency feeds to one identity; match score + rule path + tier persisted to a PHI-safe audit summary (passes `assertPhiSafe`); stranger → no anchor. |
| UC-03 | Wrong merge unmerged (twins) — **adversarial** | `corpus_A_identity.test.ts` | The identity DEFENSE the engine supports today: twins (shared DOB/zip/sex, differing first names) can never auto-link — structurally pinned to the 60–89 possible-match steward band. Class property over 4 sibling pairs. (Projector rekey / source-attribution after unmerge → registered pending.) |
| UC-06 | Re-entry identity continuity | `corpus_A_identity.test.ts` | A new Medicaid CIN with matching name+dob deterministically links to the prior identity; a changed subscriber id alone does not manufacture a new person; a real stranger → no-match. |
| UC-16 | Provider-access opt-out | `corpus_C_consent.test.ts` | Opt-out recorded (always attributed; empty actor throws); opted-out member → guard DENY with PHI-safe reason (passes `assertPhiSafe`); break-glass overrides with elevated audit; opt-in restores access. |
| UC-28 | Polypharmacy in a dual-eligible elder | `corpus_F_careplanning.test.ts` | Poly-pharmacy input → `Mitigate Poly-Pharmacy` goal + medication-review intervention; every citation `reference-level` / `smeReviewed:false`; disclaimer says NOT SME-reviewed; DP-4 validator clean. |
| UC-29 | Pregnancy plan with barriers addressed | `corpus_F_careplanning.test.ts` | Every detected SDOH barrier is addressed-or-deferred with a reason (DP-4 P4); no orphan goals (DP-4 P1); validator clean. |
| UC-31 | Data-limitation honesty flag — **adversarial** | `corpus_F_careplanning.test.ts` | Cycle-2 oracle finding: since the input carries no coded (T1) allergy data, the plan does **not** assert contraindication safety it cannot back — the `contraindication-checking-not-asserted` flag fires and no false-assurance phrase appears, across 3 fixtures (class, not instance). |
| UC-32 | Specialist desert (adequacy portion) | `corpus_G_referrals_adequacy.test.ts` | Frontier desert (Oglala Lakota / Pediatrics / Medicaid) fails the in-person time/distance standard (`validateCell` non-compliant); thresholds are config **data** — relaxing/tightening the standard flips compliance with no code change. (Telehealth candidate ranking → registered pending.) |
| UC-38 | Standard PA through the golden thread | `corpus_H_priorauth.test.ts` | FC machine threads Eligibility→MedNec→PriorAuth(approved)→Estimation→Cleared with every gate completed; PA persisted to the append-only evidence ledger and projected to PHI-safe audit — pipeline-real, no mock source. |
| UC-39 | Gold card earned from real feeds | `corpus_H_priorauth.test.ts` | 72148 requires PA (policy engine); a gold-carded provider → `pa-exempt-gold-card`, `requiresPA=false` (auto-approve, no manual review); threshold-crossing flips the path as a pure DATA change (below vs above 90%). |
| UC-40 | Denial then successful appeal | `corpus_H_priorauth.test.ts` | Appeal packet generated from ledger entries alone (`toAuditEvents`); denial + reversal are two distinct audited events with distinct actors; all PHI-safe. |
| UC-44 | Appeal outcome re-reconciled | `corpus_I_financial.test.ts` | Append-only ledger: `appendEntry` never mutates (original array reference + length untouched); denial→appeal→payment reconstructed in chronological order, each with its actor. |
| UC-51 | Graceful degradation without the LLM | `corpus_J_agents_hitl.test.ts` | With the backbone unconfigured, narration fails loud with `BackboneNotConfiguredError`, while deterministic clearance still reaches Cleared and adequacy analytics still compute — care actions are never blocked. |
| UC-63 | BFF invariant holds (secret scan) | `corpus_M_privacy_security.test.ts` | Repo scan across the full `src` tree finds ZERO secret-bearing `NEXT_PUBLIC_*` variables; guarded against a vacuous pass (>50 files scanned, ≥1 real NEXT_PUBLIC var present). (Route 401/403/… suite is the separate `tests/api/*` body.) |
| UC-68 | Newborn onto the household record | `corpus_N_household_pediatric.test.ts` | DP-7 new-identity-not-a-merge: a newborn sharing only household surname/zip never links to the mother (`no-match`), so no mother content can cross-attach at the identity layer. Class property over 4 given names. (Household related-person link record → registered pending.) |

## Pending cases (skipped-pending) — 55, with the missing capability named

Each is a single `it.skip` in `tests/scenario/corpus_coverage.test.ts` whose title names the gap.

**B Record assembly (6):** UC-07 tier registry across C9 domains · UC-08 CCD/document per-section
tier extraction · UC-09 flat-file ingestion + quarantine pipeline · UC-10 HL7v2 stream latency
budget · UC-11 PGD provenance projection · UC-12 C1 read with per-section tier labels.

**C Consent (4):** UC-13 segmentation-at-transform (envelope-only projector drop) · UC-14
consent-event → SDE touchpoint re-evaluation · UC-15 read-time per-requestor segment-consent
evaluation · UC-17 reporting-pipeline Part 2 label-scan exclusion.

**D Graph (4):** UC-18 keystone lens queries · UC-19 dated-edge temporal query · UC-20 graph
projector rebuild-from-replay · UC-21 hypothesis-edge HITL governance. *(all need the graph store)*

**E Signal disposition (5):** UC-22 coordinated bundle · UC-23 frequency-cap suppression · UC-24
priority resolution · UC-25 versioned disposition-policy per batch · UC-26 out-of-order redelivery.
*(no G2 SDE runtime exists)*

**F Care planning (2):** UC-27 coded allergy/med input for DP-4 P2 gating (F1 — input shape carries
none) · UC-30 RelatedPerson/Task caregiver assignment + link-removal rerouting.

**G Referrals & adequacy (5):** UC-33 referral stall state machine + SDE · UC-34 closed-loop
platform + tracked human task · UC-35 C1 provider-context read endpoint · UC-36 provider-directory
language-concordance data (Provider model has no language field) · UC-37 closed-loop webhook →
graph edge close + SDE recompute.

**H Prior auth (1):** UC-41 PA/documentation agent driving the flow through the work queue (agent runtime).

**I Financial reconciliation (4):** UC-42 cross-stage claim/payment ledger reconstruction · UC-43
835 remittance reconciliation engine · UC-45 claims-pipeline idempotency dedupe · UC-46 graph
temporality + ledger milestone assembly.

**J Agents & HITL (4):** UC-47 outreach agent draft+execute via work queue · UC-48 SLA escalation
ladder · UC-49 autonomy-dial manifest gating · UC-50 captured model-call payload harness.
*(all need the agent runtime)*

**K Dashboards & measures (4):** UC-52 **measure/gap projector (F1)** emitting care-gap events
distinct from the SDE · UC-53 metric projections → view-models with read budget · UC-54 QARR report
from shared view-models (F3) · UC-55 geospatial choropleth + axe-core render checks.

**L Operational (5):** UC-56 837 quarantine + TTL alarm · UC-57 reconciliation gate + replay ·
UC-58 DLQ replay · UC-59 enrollment surge load budgets · UC-60 projector rebuild from offset zero.
*(all need pipeline/stream runtime)*

**M Privacy & security (3):** UC-61 section-level purpose projection · UC-62 access-trail query
store · UC-64 time-boxed break-glass read-time evaluation.

**N Household & pediatric (3):** UC-65 household links in the graph · UC-66 caregiver-reported
provenance on person-context · UC-67 read-time segmentation across three requestor contexts.

**O Rural (2):** UC-69 SDE disposition delay + adequacy substitution + NEMT composite · UC-70 SDE
channel-preference fallback ladder as policy-as-data.

## Files added (all under `tests/scenario/`, all ≤ 500-line test cap)

| File | Lines | Contents |
|---|---:|---|
| `corpus_coverage.test.ts` | 200 | The 70-case registry: partition asserts (15+55=70), per-case ledger (15 `it` + 55 `it.skip`), meta-tests proving no gaps/dupes and that every runnable entry names an on-disk family file. |
| `corpus_A_identity.test.ts` | 208 | UC-01, UC-03, UC-06 |
| `corpus_C_consent.test.ts` | 104 | UC-16 |
| `corpus_F_careplanning.test.ts` | 142 | UC-28, UC-29, UC-31 |
| `corpus_G_referrals_adequacy.test.ts` | 82 | UC-32 |
| `corpus_H_priorauth.test.ts` | 202 | UC-38, UC-39, UC-40 |
| `corpus_I_financial.test.ts` | 102 | UC-44 |
| `corpus_J_agents_hitl.test.ts` | 66 | UC-51 |
| `corpus_M_privacy_security.test.ts` | 61 | UC-63 |
| `corpus_N_household_pediatric.test.ts` | 66 | UC-68 |

## Notes on the adversarial-flagged cases

- **UC-03 (twin unmerge):** followed the instruction to test what match/identity supports today
  and skip the projector rekey. The engine's real defense — twins never auto-merge, always land in
  the steward-review band — is proven as a class property; the post-unmerge source-attribution
  audit is registered pending under the graph/projector capability.
- **UC-31 (T2 allergy tier honesty):** asserts the care plan does **not** claim contraindication
  safety it cannot back, using the Cycle-2 acceptance-oracle finding that
  `ComprehensivePlanInput` carries no coded allergy data, so `checkDataLimitations` emits
  `contraindication-checking-not-asserted` on every plan. Additionally asserts no false-assurance
  phrasing appears anywhere in the generated plan.
- **UC-52 (measure engine):** skipped as predicted and named — the F1 measure/gap projector that
  emits `care-gap.*` events as a role separate from the SDE does not exist yet.
