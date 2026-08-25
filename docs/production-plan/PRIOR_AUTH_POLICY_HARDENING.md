# Prior-Auth (CRD / DTR / PAS + Policy/Intelligence Engine) Hardening — Hardening / Execution Plan (DRAFT FOR REVIEW)

## Context & current state

- **Policy/Intelligence engine (`src/lib/policy`)** — generalized, pure, deterministic, source-agnostic. `evaluate(member, order, library) -> CoverageDetermination { requiresPA, outcome, criteriaMet, deficiencies, propensityToDeny }`, reasoning over a `NormalizedPolicy` model. Ingestion via `registerAdapter`/`ingestLibrary` (reference adapters for Aetna CPBs, UHC PA lists). 17 seed policies (15 Aetna **Cardiac** CPBs + 2 UHC PA lists).
- **Criteria matching today** — an ICD-10 covered-set screen (member dx supports a covered ICD-10 on a ≥3-char root). Explicitly **not** executable CQL. Replacing it is increment **GT-9**.
- **PA services (`src/lib/pa`)**:
  - **CRD (`crdService`)** — posts an order-sign CDS hook to `/api/cds`; advisory, fires inside the provider EHR.
  - **DTR (`dtrService`)** — posts to `/api/dtr/evaluate`, which wraps the policy engine in live mode, else returns a Maria-specific mock.
  - **PAS (`pasService`)** — `buildPasBundle` builds a Da Vinci claim Bundle; submits to `/api/pas/submit` behind a HITL `approvedBy` gate; `ReviewSubmitView` collects the approver.
  - All three **fall back to a Maria-specific / canned mock whenever the BFF is unreachable** — live wiring is only partial.
- **`goldenThread/dtrFromPolicy.ts`** — deterministically builds a Da Vinci DTR Questionnaire from a policy's medical-necessity indications; emits status `'draft'` (human review before `'active'`). AI/LLM DTR path (Claude generator + reviewer) gated behind `aiDtrGeneration` flag + human-review gate.
- **cds-hooks routes** — `order-sign`, `patient-view`. **Governance principle** — AI proposes, policy validates, humans arbitrate; only a payer **ClaimResponse** moves the PA state machine.
- **Related modules** — `policy/goldCarding.ts`, `policy/propensity.ts`, `policy/denialRates.ts`, `lifecycle/policy.ts`, `graph/mapping/priorAuthLifecycle.ts`, `server/pasClient.ts`, `server/devStubs.{dtr,pas}.ts`.
- **Framework invariants** — small gated increments; every change behind a seam; mock demo stays green (`npm run dev`, `NEXT_PUBLIC_USE_MOCK_DATA=true`); production fails closed; determinism (clock seam only); gates = tests + E13 test-link ratchet + E14 wired-path ratchet + size ratchet.
- **Known-ungrounded items** (must be resolved before the phase that depends on them): where consent / 42-CFR-Part-2 is enforced today; whether "Maria" is fully synthetic; the exact Da Vinci PAS + US Core profile versions to target.

## Approaches considered (tree-of-thought)

### A. Criteria execution engine (GT-9)
- **A1 — CQL engine** (cql-execution over FHIR). Highest fidelity, Da Vinci-native, SME-authored logic library. Cost: heavy runtime, licensed/authored CQL content, determinism risk (CQL `now`/date functions must route through the clock seam), larger footprint, and — per red-team — arbitrary-logic execution surface.
- **A2 — Declarative JSON rules engine over `NormalizedPolicy`** — indications encoded as typed predicates (age ranges, prior-therapy flags, numeric thresholds, step/temporal/combination operators) run by a small pure interpreter. Deterministic by contract, testable, unlicensed, small. Ceiling: complex temporal/combination logic.
- **A3 — Keep ICD screen + manual SME overrides per policy.** Cheapest; does not actually deliver GT-9; scales poorly.

### B. Live-wiring + fallback boundary
- **B1 — Environment-gated fail-closed seam.** One resolution point: `mock` (demo) vs `live` (prod); in `live`, BFF-unreachable throws a typed error, never mock. Clean, honest, touches all three services.
- **B2 — Per-call fallback flag.** Fail-open by omission — rejected.
- **B3 — Circuit breaker with cached last-good.** Stale PA data is clinically/contractually risky — deferred.

### C. PAS conformance + HITL
- **C1 — Pinned-profile offline validator + Inferno in CI.** Real conformance signal; infra-gated.
- **C2 — Hand-rolled assertions only.** Self-graded, drifts — rejected as the end state.

### D. Propensity / gold-carding honesty
- **D1 — Type-level separation + provenance ledger.** `outcome` structurally severed from a `decisionSupport` object; propensity withheld from the clinical arbiter; every decision journaled.
- **D2 — Lint/test-only guard.** Weaker, no runtime provenance — rejected as the end state.

### E. AI-DTR governance
- **E1 — Provenance stamp + two-key, human-reviewer promotion.** Each Questionnaire stamped origin; `draft→active` requires a distinct **human** credentialed reviewer; de-identified model input under BAA.

## Recommended approach

- **GT-9 → A2 behind a `CriteriaEvaluator` seam, A1 as a later seam-compatible upgrade — but gated on a feasibility spike** (see Adversarial #8 / Red-team #7). Encode 3–4 of the hardest cardiac CPBs (step-therapy, ≥N-agents-over-≥M-months, LVEF trend/recency) first; commit to A2 only if the predicate model covers them, else extend the model or pull A1 forward for those policies.
- **Wiring → B1**, the only option consistent with "production fails closed," with **CRD semantics distinguished from DTR/PAS** (CRD degrades to advisory-unknown, never blocks the clinical action).
- **PAS → C1**, but **profile versions pinned first**; offline validator and demo-bundle conformance land report-only, then ratchet to blocking; Inferno blocking **before** any live PAS submission.
- **Propensity → D1**, **AI-DTR → E1** — guardrails made structural, not disciplinary.
- **Sequencing correction (the two structural must-fixes):** (1) the fail-closed service boundary lands **before or with** any `live` binding of the rules engine — never a window where a `live` determination can be overwritten by mock; (2) **consent/Part-2, secrets/egress, authenticated approver identity, and timeliness/human-denial authority are preconditions of live enablement**, not trailing phases. Live stays disabled/infra-gated until they exist.
- Seams, one per concern: `CriteriaEvaluator`, `PAServiceMode`, `ConsentGate`, `PasConformance`, `DecisionLedger` / `DecisionSupport`, `DtrProvenance`.

## Phased execution plan

### Phase 0 — Seam scaffolding (inert)
- **Goal:** Introduce `CriteriaEvaluator` and `PAServiceMode` interfaces with default bindings that preserve today's behavior exactly.
- **Mechanism / seam:** `CriteriaEvaluator.evaluate(...)`; `resolveMode(): 'mock' | 'live'`. **Nothing consumes `resolveMode()` yet** — Phase 0 is a pure identity refactor (addresses Adv #9).
- **Fail-closed behavior:** none (identity). No service path changes.
- **Tests + gates:** unit — default evaluator == current ICD-screen output on all 17 seeds; unit — the unflagged dev/CI default still yields the mock path (proves `npm run dev` / `.env` forces `NEXT_PUBLIC_USE_MOCK_DATA=true`, so no environment silently flips to `live`). E13 test-link; size ratchet.
- **Mock-demo-intact:** yes — identity behavior.
- **Dependencies:** none.

### Phase 1 — Live-enablement preconditions (hard gate on all later `live` phases)
- **Goal:** Stand up the compliance/security seams that MUST exist before any `live` disclosure or adjudication: Part-2 consent, secrets/egress, authenticated approver identity, timeliness SLA, and human-denial authority.
- **Mechanism / seam:**
  - **`ConsentGate`** — consent modeled as `{ recipient, purpose, scope, expiry }`, checked with purpose-match at every disclosure point (not a global boolean); outbound Bundles/cards carry the Part-2 §2.32 redisclosure-prohibition notice; Part-2-protected elements are segregated and withheld absent a specific, verifiable consent record (Adv #3; RT #1).
  - **Secrets/egress** — vaulted, rotated, least-privilege credentials; egress allowlist for BFF/FHIR/model endpoints; `fhirServer`/`fhirAuthorization` from CDS hooks allowlisted to registered issuers, token audience/issuer validated and never forwarded, link-local/internal ranges blocked (RT #3, #17).
  - **Authenticated approver** — `approvedBy` bound to the authenticated session principal with an active, appropriate clinical credential/role; approval events signed with that identity; no caller-supplied approver string ever accepted (RT #4).
  - **Timeliness + denial authority** — every PA gets an intake SLA timer independent of service availability (CMS-0057-F: 72h expedited / 7 days standard) that auto-escalates unresolved/`undetermined`/service-unavailable cases to human review before deadline; structurally, **no automated path emits a member-facing denial** — medical-necessity denials originate only from a credentialed clinical peer, reflected in the payer `ClaimResponse` as the sole denial path (RT #5, #6, #18).
- **Fail-closed behavior:** this whole phase is the gate — until it is green, `resolveMode()` cannot return `live` for any disclosure/adjudication path; only mock runs.
- **Tests + gates:** unit — consent purpose-mismatch blocks disclosure; redisclosure notice present on every outbound artifact; `fhirServer` outside allowlist rejected + alerted; approver without valid credential rejected; SLA timer fires escalation before deadline; test that no automated path produces a member-facing adverse determination. E13; size ratchet (consent/profile/egress config externalized as data — see Adv #20).
- **Mock-demo-intact:** yes — mock path unaffected; demo records the same consent/approval event shapes.
- **Dependencies:** infra (vault, egress allowlist, issuer registry); SME/compliance (Part-2 rule mapping, credential model, SLA/notice obligations); **grounding task: locate/confirm today's consent enforcement point.**

### Phase 2 — Fail-closed service boundary (CRD advisory; DTR/PAS hard fail-closed)
- **Goal:** Make mock demo-only and prod fail closed on BFF-unreachable, with correct per-service semantics.
- **Mechanism / seam:** each service consults `resolveMode()`. Mock is **structurally impossible to return in `live`** — compile-time/binding separation, not a runtime string flag (RT #2). **CRD:** unavailable → degrade to a neutral "PA status unknown, not a coverage determination" card; never block order signing (Adv #4; RT #14). **DTR/PAS:** unavailable → typed `PAServiceUnavailable`, no fabricated determination, state machine does not advance. **PAS idempotency:** each submission carries a stable idempotency/claim-trace key; retries are idempotent (server dedups / returns prior response); the state model distinguishes "submitted, response unknown" from "not submitted" (Adv #5).
- **Fail-closed behavior:** no determination fabricated in `live`; no cross-patient payload; `undetermined`/unavailable states generate an audited work item with owner + SLA tie-in (never presented to the member as a decision).
- **Tests + gates:** unit — `live` + unreachable throws for DTR/PAS and never returns Maria mock; CRD degrades without blocking; test that **no member-scoped payload from a different member id can ever be returned in `live`**; idempotency-dedup test. **E14 defined precisely:** contract test against a stub mimicking the BFF contract, plus a **separate infra-gated e2e** — the ratchet certifies the wired contract, and does not claim live wiring when only stubs are present (Adv #10; RT #16). Size ratchet.
- **Mock-demo-intact:** yes — `NEXT_PUBLIC_USE_MOCK_DATA=true` keeps the full canned demo.
- **Dependencies:** infra (reachable BFF for e2e beyond `devStubs`); **grounding: confirm Maria is fully synthetic and non-attributable — if it derives from any real record, treat existing fallbacks as a reportable exposure** (RT #2).

### Phase 3 — GT-9 rules engine behind the seam (bound in `live` only after Phase 2)
- **Goal:** Replace the ICD screen with a declarative rules interpreter over `NormalizedPolicy` medical-necessity indications; the real path is exercised by the demo.
- **Mechanism / seam:** `RulesCriteriaEvaluator` runs in **both mock (over seeded/canned inputs) and live**, so the green demo exercises the actual GT-9 deliverable deterministically; `IcdScreenEvaluator` remains only as an explicit, labeled fallback for policies lacking authored rules (Adv #7). The determination seam stays **distinct from the DTR data-gathering seam**: DTR may *invoke* the evaluator for pre-population, but the evaluator's determination is advisory and never DTR's output-of-record (Adv #22). Determinism obligations are part of the interpreter contract: fixed evaluation order, stable map/set iteration, fixed numeric/locale handling, clock seam as the sole time source; in `live` the clock seam must resolve to real monotonic system time with an assertion that no frozen/seeded clock is bound (fail closed to human review otherwise) (Adv #19; RT #13).
- **Fail-closed behavior:** a policy with no executable rule set in `live` → `requiresPA=true, outcome='undetermined'`, routed to human review — never auto-approve, never silent fallback to the ICD screen. The per-policy **`executable` flag is a runtime kill-switch**: flipping it off returns the policy to `undetermined`/manual (not to the ICD screen in prod), recorded as an audit entry, so a bad rule set is pulled without redeploy (Adv #21). The `executable` transition itself requires **two-person, credentialed SME sign-off recorded as a signed immutable event**, with authz limiting it to the SME role (RT #8).
- **Tests + gates:** **feasibility spike first** — encode 3–4 hardest cardiac CPBs to confirm the predicate model covers step/temporal/combination logic before committing to A2 (Adv #8). `outcome='undetermined'` is a **managed enum expansion**: exhaustive-switch tests across every consumer (`lifecycle/policy.ts`, `graph/mapping/priorAuthLifecycle.ts`, propensity/goldCarding, UI) and an assertion that the evaluator's determination never advances the PA state machine (Adv #6). Per-policy rule unit tests; golden determinations per seed; bit-stability test on repeated evaluation. E14 (rules path exercised via mock + contract stub). Size ratchet with **SME rule content externalized as data/fixtures**, ratchet-exempt (Adv #20).
- **Mock-demo-intact:** yes — demo runs the rules engine over seeded inputs; `IcdScreenEvaluator` labeled fallback only.
- **Dependencies:** SME (rule predicate authoring + two-person sign-off); the spike outcome may pull A1/CQL forward (licensed/authored content).

### Phase 4 — Determination ledger + decision-support severance
- **Goal:** Journal every decision tamper-evidently and structurally sever decision-support from the determination — landed **before** the HITL audit writes so there is no audit-schema drift (Adv #16).
- **Mechanism / seam:** **`DecisionLedger`** — append-only, tamper-evident (content-hash chain or signatures) record for **every CRD/DTR/PAS decision**, capturing policy-version hash, evaluator identity/version, minimum-necessary member-input snapshot, clock-seam value, outcome, deficiencies, and decision-support shown; policy `NormalizedPolicy` versions are **immutable and content-hashed** so records reference a fixed artifact (RT #9; addresses "immutable" over-claim Adv #13). **`DecisionSupport`** — `propensityToDeny` moved into a `decisionSupport` sub-object `{ estimate, label, inputs, modelVersion }`; `outcome` computed with no access to it, enforced by the type boundary **plus an architecture/lint test forbidding the outcome-computing module from importing the propensity module** (Adv #18). Propensity is **not surfaced to the medical-necessity decision-maker** — restricted to operational routing/analytics audiences; if recorded, the ledger notes it was withheld from the clinical reviewer (Adv #15; RT #12). **Gold-carding is explicitly distinguished from propensity:** gold-carding's sanctioned, provenance-recorded effect on `requiresPA` is allowed; only `propensityToDeny` bleeding into `outcome` is forbidden, and the property test is scoped to the latter (Adv #17).
- **Fail-closed behavior:** the property/behavioral test (Phase 3) guards regression today; the **structural** guarantee begins here at the type boundary (honest scoping per Adv #18).
- **Tests + gates:** append-only/tamper-evidence test; ledger completeness test (every decision path writes a record); perturbing propensity never changes `outcome`; gold-carding effect on `requiresPA` preserved; provenance-present test. E14; size ratchet (codemod/adapter for existing `propensity.ts`/`goldCarding.ts`/`denialRates.ts`/UI/goldens landed in the same increment — Adv #16).
- **Mock-demo-intact:** yes — UI still shows the labeled propensity estimate in operational surfaces only, not on the clinical-review surface.
- **Dependencies:** infra (append-only store / signing).

### Phase 5 — HITL approval gate + canonical approval hash
- **Goal:** Tighten `approvedBy` into a signed approval event over a canonical, complete Bundle hash.
- **Mechanism / seam:** approval event `{ approverPrincipal, credential/role, timestamp(clock seam), canonicalBundleHash, policyVersionHash, decisionSupportWithheldFlag }` written to the `DecisionLedger` (schema from Phase 4) before `/api/pas/submit`. **Canonical hashing:** hash a canonical FHIR serialization (sorted keys, normalized whitespace, defined array ordering; embedded timestamps via the clock seam) covering **member identity, order, diagnoses, and clinical attachments** — everything material to the determination, so benign re-serialization does not false-reject and a member/dx swap after approval does reject (Adv #14; RT #10).
- **Fail-closed behavior:** `live` submit rejected if no valid signed approval event or hash mismatch; approver must hold an active clinical credential (Phase 1).
- **Tests + gates:** submit without valid approval rejected; benign re-serialization does **not** false-reject; any material field change **does** reject; approval attributed to authenticated principal only. E14; size ratchet.
- **Mock-demo-intact:** yes — `ReviewSubmitView` still collects the (now authenticated) approver; demo records the same event shape.
- **Dependencies:** Phase 1 (identity), Phase 4 (ledger schema).

### Phase 6 — PAS conformance hardening + minimum-necessary
- **Goal:** Move `buildPasBundle` to real Da Vinci PAS conformance and scope disclosure to minimum-necessary.
- **Mechanism / seam:** **first task — pin exact Da Vinci PAS + US Core profile versions** (grounding); only then build `PasConformance.validate(bundle)` (offline profile/slice/required-extension checks) — the offline validator is not available "immediately," it is blocked on the same grounding as Inferno (Adv #11; RT #16). Inferno Da Vinci PAS runs as an infra-gated CI job. A **minimum-necessary filter** scopes DTR prepopulation and Bundle construction to the data elements the specific policy indications require, logging the element set disclosed per determination (RT #15).
- **Fail-closed behavior:** in `live`, a Bundle failing offline conformance is **not** submitted; **Inferno must be blocking before any live PAS submission** (hard gate, not bypassable via the mock/stub path).
- **Tests + gates:** conformance unit tests on `buildPasBundle` output; min-necessary test (no out-of-scope resources included). **Demo-bundle conformance lands report-only first**, ratcheting to blocking only once the demo Bundle passes, so introduction does not turn the green demo/CI red (Adv #12). Inferno job non-blocking → blocking once green. Size ratchet (IG/profile packages externalized as data — Adv #20).
- **Mock-demo-intact:** yes — demo submit uses the stub; validator runs read-only/report-only over the demo Bundle until it conforms.
- **Dependencies:** infra (Inferno instance, CI capacity); **grounding: exact profile versions**; possibly SME to bring the demo Bundle to conformance.

### Phase 7 — AI-DTR governance
- **Goal:** Track provenance and enforce human clinical review on the AI path.
- **Mechanism / seam:** every DTR Questionnaire stamped `provenance: 'ai-pipeline' | 'deterministic-offline'`; `draft→active` requires a human-review event; **AI-origin requires a distinct human credentialed reviewer** — "reviewer ≠ generator" is not satisfiable by two AI steps (RT #11). Model input is **policy-text-only, de-identified, under confirmed BAA coverage**; no member-identifiable data sent to the model (RT #11).
- **Fail-closed behavior:** `aiDtrGeneration` off in prod by default; no AI-origin Questionnaire reaches `active` without a human review event.
- **Tests + gates:** `dtrFromPolicy` emits `deterministic-offline` + `draft`; AI path cannot self-promote and cannot reach `active` without a **human** review event; test that no member-identifiable data is included in model input. Size ratchet.
- **Mock-demo-intact:** yes — deterministic `dtrFromPolicy` is the demo default; AI path stays flag-gated.
- **Dependencies:** legal (BAA confirmation); SME (human reviewer credential model).

*Sequencing note (revised):* Phase 1 (compliance/security preconditions) and Phase 2 (fail-closed boundary) are hard gates on all `live` enablement and land before the rules engine is bound in `live` in Phase 3. Phases 4→5 are ordered so the ledger/decision-support schema precedes the approval writes. Phase 6 is gated on profile-version grounding; Phase 7 on BAA confirmation. Phases 4–7 can otherwise interleave.

## Adversarial findings & resolutions

1. **Live rules engine before fail-closed boundary (fail-open window).** RESOLVED — reordered: fail-closed boundary (now Phase 2) lands before the rules engine is bound in `live` (Phase 3); no `live` rules binding until service-level fallback is provably gone.
2. **Consent sequenced last but precondition for every live phase.** RESOLVED — consent is a hard gate in Phase 1; live stays disabled until it exists; grounding task moved to the front.
3. **Consent as a boolean insufficient for Part 2.** RESOLVED — modeled as `{recipient, purpose, scope, expiry}` with purpose-match at each disclosure point and a redisclosure notice on outbound artifacts (Phase 1).
4. **CRD fail-closed mis-modeled.** RESOLVED — Phase 2 distinguishes CRD (advisory neutral card, never blocks) from DTR/PAS (hard fail-closed).
5. **PAS retry has no idempotency (duplicate auths).** RESOLVED — idempotency/claim-trace key + "submitted, response unknown" state in Phase 2.
6. **`undetermined` is an unmanaged enum expansion.** RESOLVED — exhaustive-switch tests across all consumers + no-state-advance assertion in Phase 3.
7. **Mock/live run different evaluators; demo never exercises GT-9.** RESOLVED — `RulesCriteriaEvaluator` runs in mock too; ICD screen is labeled fallback only (Phase 3).
8. **A2 expressiveness may not cover the cardiac seed set.** RESOLVED (as a gate) — feasibility spike on 3–4 hardest CPBs precedes committing to A2; may pull A1 forward (Phase 3).
9. **Phase 0 not truly inert under `resolveMode()` default.** RESOLVED — nothing consumes `resolveMode()` in Phase 0; added test that unflagged dev default stays mock.
10. **E14 ratchet in tension with no-BFF design.** RESOLVED — E14 defined as contract test vs a BFF-contract stub + separate infra-gated e2e; does not claim live wiring from stubs (Phase 2).
11. **Offline validator "immediately" contradicts unknown profiles.** RESOLVED — pinning profile versions is the explicit first task of Phase 6; validator sequenced after grounding.
12. **Phase 3 conformance may turn the demo red.** RESOLVED — demo-bundle conformance lands report-only, ratchets to blocking only once the demo Bundle passes (Phase 6).
13. **"Immutable" audit over-claimed.** RESOLVED — Phase 4 specifies append-only + hash-chain/signature tamper-evidence; language elsewhere downgraded to "recorded/tamper-evident."
14. **`bundleHash` needs canonicalization.** RESOLVED — canonical FHIR serialization, clock-seam timestamps, hash covers material identity fields (Phase 5).
15. **Showing propensity to the arbiter biases the decision.** RESOLVED — propensity withheld from the clinical-review surface; recorded as withheld (Phase 4).
16. **Phase 5 type refactor is breaking with no migration.** RESOLVED — `decisionSupport`/ledger schema landed in Phase 4 (before approval writes) with codemod/adapter and goldens in the same increment.
17. **Strict "no decision-support in outcome" could break gold-carding.** RESOLVED — Phase 4 explicitly permits gold-carding's provenance-recorded effect on `requiresPA`; property test scoped only to propensity→`outcome`.
18. **Phase 1 property test over-states the guarantee.** RESOLVED — reframed as a behavioral regression guard; structural guarantee begins at Phase 4's type boundary + import-ban lint test.
19. **Determinism "by construction" overstated.** RESOLVED — explicit interpreter determinism obligations + bit-stability test + live-clock assertion (Phase 3).
20. **Size-ratchet optimism for conformance/rules work.** RESOLVED — profile/IG packages and SME rule content externalized as data/fixtures, ratchet-exempt; exceptions pre-cleared (Phases 3, 6).
21. **No kill-switch for a bad executable rule set.** RESOLVED — per-policy `executable` flag is a runtime kill-switch back to `undetermined`/manual with an audit entry (Phase 3).
22. **DTR-as-determination conflation.** RESOLVED — determination seam kept distinct from the DTR data-gathering seam; DTR may invoke the evaluator for pre-population only; determination is advisory, never DTR's output-of-record (Phase 3).

## Red-team findings & mitigations

1. **Consent/Part-2 sequenced last while live PHI is wired first.** MITIGATED — consent is a Phase 1 precondition gate; redisclosure notice on every outbound Bundle/card; Part-2 elements segregated and withheld absent specific consent.
2. **Maria mock is a cross-patient PHI contamination vector.** MITIGATED — mock structurally impossible to return in `live` (binding separation, not a runtime flag); test that no other member's payload can ever be returned in `live`. PARKED sub-item: confirming Maria is fully synthetic is a **grounding task**; if it derives from any real record, treat existing fallbacks as a reportable exposure (Phase 2 dependency).
3. **CDS Hooks SSRF / token exfiltration via `fhirServer`/`fhirAuthorization`.** MITIGATED — Phase 1: allowlist `fhirServer` to registered issuers, validate token audience/issuer, never forward it outbound, block internal ranges, alert on out-of-allowlist values.
4. **`approvedBy` is an unauthenticated string (approval spoofing).** MITIGATED — Phase 1: bound to authenticated principal with verified active clinical credential; approval events signed; credential/role recorded.
5. **Automated `undetermined`/deny as a denial without a clinical peer (NCQA UM4 / CA SB 1120).** MITIGATED — Phase 1: structurally, no automated path emits a member-facing denial; denials originate only from a credentialed clinical peer via the payer `ClaimResponse`; test enforces it.
6. **`undetermined`/unavailable collides with CMS-0057-F timeliness (constructive denial).** MITIGATED — Phase 1: intake SLA timer independent of availability, auto-escalation before deadline, CMS-0057-F specific-reason payload + reporting metrics as explicit deliverables.
7. **Ingestion adapters parse untrusted payer content into executable logic (poisoning).** MITIGATED — Phase 3: schema-validate/sandbox parsing, SME diff-review + sign-off before a policy version becomes active, immutable content-hashed `NormalizedPolicy` versions; any future CQL runs only signed libraries from a trusted registry in a no-ambient-authority sandbox.
8. **`executable` flag relies on discipline, not authority.** MITIGATED — Phase 3: two-person credentialed SME sign-off recorded as a signed immutable event; authz limits the transition to the SME role.
9. **No reconstructable determination ledger (RADV/appeals).** MITIGATED — Phase 4: append-only tamper-evident record for every CRD/DTR/PAS decision with policy-version hash, evaluator identity, min-necessary input snapshot, clock value, outcome, deficiencies, decision-support shown; immutable policy versions.
10. **Bundle-hash canonicalization + scope gaps.** MITIGATED — Phase 5: canonical form + hash covers member identity/order/dx/attachments; tested both directions.
11. **LLM-DTR sends PHI to model provider; "reviewer ≠ generator" satisfiable by two AI steps.** MITIGATED — Phase 7: de-identified policy-text-only input under confirmed BAA; promotion reviewer must be a human credentialed reviewer; off by default in prod; test enforces human review.
12. **Propensity shown to clinical decision-maker undermines independence and is discoverable.** MITIGATED — Phase 4: propensity not surfaced on the clinical-review surface (governance decision recorded); enforced by the type boundary; recorded as withheld.
13. **Clock-seam misconfiguration corrupts temporal criteria.** MITIGATED — Phase 3: `live` clock resolves to real monotonic time with an explicit no-frozen-clock assertion, fail closed to human review otherwise; alert on non-live clock binding; raw-`Date.now()` lint retained.
14. **ICD proxy screen at point of care deters/suppresses cardiac care.** MITIGATED — until executable criteria are SME-validated, CDS cards are advisory/informational only, never presented as coverage determinations, carrying an explicit "not a determination" disclaimer (Phase 2 CRD semantics + Phase 3 sequencing).
15. **DTR prepopulation / PAS Bundles exceed minimum-necessary.** MITIGATED — Phase 6: minimum-necessary filter scoping prepopulation and Bundle construction, with a test and per-determination disclosure log.
16. **Self-graded conformance drifts until Inferno lands.** MITIGATED — Phase 6: profile versions pinned first; Inferno blocking before any live PAS submission; non-conformant Bundles cannot submit in `live` via any path including stub.
17. **Secrets/egress for tokens/keys unaddressed.** MITIGATED — Phase 1: vaulted, rotated, least-privilege secrets + egress allowlisting as a prerequisite of the live boundary.
18. **`undetermined`/unavailable has no member notice or resolution SLA.** MITIGATED — Phase 2 + Phase 1: every terminal-for-now state creates an audited work item with owner + SLA tie-in, never presented to the member as a decision; backlog tracked and reported.

## Open questions for review/approval

1. **A2 vs A1 for cardiac CPBs** — pending the Phase 3 spike: does the declarative predicate model cover step/temporal/combination logic, or must A1/CQL be pulled forward (with its licensed/authored-content and sandbox burden)?
2. **Part-2 consent enforcement point (grounding)** — where, if anywhere, is consent enforced today? Confirmation blocks Phase 1's scope (build vs. wrap).
3. **Maria provenance (grounding)** — is "Maria" provably fully synthetic and non-attributable? A "no" reclassifies existing fallbacks as a reportable exposure.
4. **Da Vinci PAS + US Core profile versions (grounding)** — exact IG versions to target; blocks the Phase 6 offline validator and Inferno configuration.
5. **Propensity display policy** — confirm the governance decision that `propensityToDeny` is never shown to the medical-necessity decision-maker (operational/analytics audiences only).
6. **Denial authority + timeliness ownership** — who owns the CMS-0057-F specific-reason payload, reporting metrics, and the clinical-peer denial workflow, and are they in scope for this hardening track or a parallel one?
7. **BAA coverage for the AI-DTR model path** — confirmed for Phase 7 to proceed even flag-gated?
8. **Tamper-evidence mechanism** — hash-chain vs signing vs external append-only store for the `DecisionLedger`; determines infra dependency in Phase 4.

## Status

DRAFT — not implemented; for review/approval before a future phase.

---
*Generated by a coalition of agents (draft → adversarial critique → red-team → synthesis), grounded in the repo. DRAFT for review/approval — not implemented.*
