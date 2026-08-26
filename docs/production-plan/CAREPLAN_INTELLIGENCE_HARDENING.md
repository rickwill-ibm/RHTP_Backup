# Care-Plan Intelligence Hardening — Hardening / Execution Plan (DRAFT FOR REVIEW)

## Context & current state

**Domain modules.** `src/lib/carePlan/{analysis, builder, validator, templates, citations, careTeam, referrals, holistic, fhirMappers, types}` plus services `rootCauseAnalyzer`, `tieredInterventionGenerator`, `holisticContextEngine`.

**Determinism model.** Time flows only through the `@/lib/clock` seam (pinned in tests via `setClock`). Same input + same clock ⇒ identical plan. No `Date.now`, RNG, or IO inside the domain. **Correction carried from red-team (RT19/RT20):** the clock seam is a *domain-determinism* device only. It must be walled off from any legal/consent/audit/review timestamp — those derive from a real trusted server time in production, never the mockable seam.

**Stable UI entry points (must not break signature/behavior casually):** `generateComprehensiveCarePlan`, `generateHolisticCarePlan`, `toFhirCarePlan`, `validateGeneratedPlan`. Exact current signatures, the shape of `sdohSummary`, and the `referralStore`/consent/terminology/directory/review seam APIs are **unknown — needs grounding** from source before implementation. Every change below is designed additive-optional precisely to stay safe under that uncertainty.

**Invariants (DP-4), as restated after critique:**
- **P1** — no goal without ≥1 intervention; builder backfills. **Backfill must re-consult P2 (F2)** and, if no non-contraindicated alternative exists, leave the goal flagged "no safe intervention available" rather than backfilling a contraindicated one.
- **P2** — contraindication gating. Currently NOT implementable (no allergy/med input; FINDINGS F1). Ordering vs P1/P4 specified in Phase 6.
- **P3 (restated per adversarial F5)** — every goal/intervention carries ≥1 reference-level citation and a disclaimer that survives serialization; `smeReviewed` **defaults false and only becomes true via a review record**. The load-bearing invariant is *disclaimer survival*, not permanent `false`. The disclaimer text must remain truthful post-review (e.g. "reference-level; not a substitute for clinical judgment"), never "not clinically reviewed."
- **P4** — every detected SDOH barrier appears in `sdohSummary.addressed` or `sdohSummary.deferred` with a reason; never silently dropped. A barrier orphaned by a P2 block routes to `deferred` (F2).
- **Consent/sharing** — external sharing (specialist FHIR push, Health Plan) gated on the provider-access consent seam; degrades **CLOSED** on seam failure. **Insufficient alone (F1/RT1):** provider-access consent is *not* 42 CFR Part 2 consent. A distinct, recipient-specific, purpose-limited Part 2 gate is now required (Phase 2).
- **FHIR** — `toFhirCarePlan` never throws; Tier-A STRUCTURAL only; never claims profile conformance. "Never throws" now means "never crashes," **not** "never signals incompleteness" (RT18): omitted safety-critical elements must surface as `dataAbsentReason`/`OperationOutcome`, not silent drops.

**Analyzer/generator contracts.** `rootCauseAnalyzer.analyze(context) -> {primaryBlocker, secondaryBlockers, compoundingFactors, rootCause, criticalInsight, successProbability(with/without intervention)}`. `tieredInterventionGenerator.generate(context, analysis) -> tiered plan addressing root cause first`. Note (RT1): `rootCause`/`criticalInsight`/`sdohSummary` routinely embed SUD/behavioral-health signal — Part 2-implicating by nature.

**Known preserved defects (pinned by golden fixtures in `tests/carePlan/fixtures`):**
1. Keyword-based clinical matching (`mapModalityToType` substring match) — unsafe for clinical routing.
2. Generation-time `referralStore` mutation — side effect inside an otherwise pure generator.
3. Revenue-gated Health-Plan sharing — **live compliance exposure (RT5)**.
4. Fabricated care-team contact fields — **live clinical-safety/wrong-recipient exposure (RT4)**.
5. Holistic path silent fallback to comprehensive plan (logged, still silent to caller).
6. No contraindication input — **P2 unenforceable; interventions are not safety-screened today (RT6)**.
7. Citations reference-level, `smeReviewed:false`, SME sign-off pending (GB-3).

**Recent work.** Phase 4 (prior) routed the holistic path through the `wpcRecord` seam. **WPC-CD1 backlog = server-side member-in-context generation — the single highest-risk PHI surface (RT2), previously scoped out; now carries an explicit authz gate below.**

**Cross-cutting production concerns newly owned by this plan (from red-team):** 42 CFR Part 2 segmentation; object-level authz/IDOR at the generation seam; SSRF/egress allowlisting; PHI-in-logs; secrets/`NEXT_PUBLIC_*` hygiene and prod mock-mode refusal; audit trail (HIPAA §164.312(b)); CMS-0057-F misuse guardrail; RADV/HCC provenance separation; NCQA deployment gating; SDOH/§1557 equity; injection on untrusted free text; minimum-necessary context scoping; licensed-content redistribution.

Anything not above is marked **unknown — needs grounding**.

## Approaches considered (tree-of-thought)

### Overall sequencing strategy

**Approach A — Purity & seams first, then semantics.** G2→G4→G6→G1→G3→G5→G7.
- *Pros:* clean seams before semantic change; determinism retired first.
- *Cons (fatal here):* defers three *live* production hazards — fabricated contacts (RT4), revenue-gated sharing (RT5), absent P2 (RT6) — and does not touch Part 2 (RT1) or generation-seam authz (RT2) at all. A payer would refuse this order.

**Approach B — Highest clinical/compliance risk first.** Stop the live bleeding, then build seams.
- *Pros:* retires the hazards a regulator/compliance reviewer reads as active harm.
- *Cons:* some safety logic (P2) still lands before the generator is pure; managed by using immediate *kill switches/flags* for the live hazards up front, deferring the full seam build.

**Approach C — Contract-freeze + parallel additive tracks behind flags.**
- *Pros:* fixtures/demo stay green longest; maximal reversibility.
- *Cons:* dual-path/flag debt with no sunset; determinism surface doubles; "temporary" old paths never die (the exact Phase 6 risk, F11).

**Approach D (adopted) — Hybrid: immediate kill switches for live hazards → security/compliance seams (Part 2, authz, egress, audit, logging) → purity → observability → semantics → data/governance-gated.** Additive-optional contract style from C where a contract changes, with an explicit fixture-versioning control (below) and a mandatory *sunset owner* on every flag.

### Per-defect option sketches (trade-offs that drive the choice)

- **G1 terminology (keyword→coded):** (a) wholesale replace — big blast radius; (b) terminology seam with keyword fallback — but fallback is to a *known-unsafe clinical* classifier (F3/RT17), so the fallback result must be stamped low-confidence, kept out of clinical routing/FHIR-as-coded, alerted on, and killable; (c) precomputed baked lookup — deterministic but stale. **Reality (F15):** real value sets (SNOMED/RxNorm) are IO and often licensed; "no IO in domain" *forces* an injected, versioned, baked snapshot — i.e. (c) wearing (b)'s seam. Chosen: seam interface over a versioned baked snapshot, licensing cleared before embed, plus the F3/RT17 provenance+kill-switch guardrails.
- **G2 referralStore side effect:** (a) `generate` returns `referralIntents[]`; a separate `commitReferrals(intents, store)` writes — **but orchestrated inside the entry point (F6), not the UI**, with idempotency keys and no "placed" status until commit confirms (RT13). First verify `generate` does not *read* the store (F7); a read is a second impurity to lift.
- **G3 P2 input:** (a) optional `contraindications` added; P2 enforces when present, honest "not evaluated" note when absent — **but coded (RxNorm/NDF-RT + class/cross-reactivity), not free-text string match (RT6)**, and the "evaluated" note may only appear once class logic exists. Blast radius of the "not evaluated" note across all existing plans/demo is acknowledged (F9), not "additive-invisible."
- **G4 holistic fallback:** (a) additive `provenance:{source,reason}` — with `reason` a **bounded deterministic enum, no raw error text, no PHI (F14/RT8)**, and a **serialization boundary stripping provenance from any external/FHIR payload (RT22)**.
- **G5 care-team contacts:** (a) directory seam; labeled placeholder on miss — **placeholders omitted or `dataAbsentReason`-masked in FHIR, never emitted as real telecom (F8/RT18)**; live fabrication killed immediately (RT4), not deferred.
- **G6 revenue gate:** (a) split — consent = clinical-necessity hard gate; revenue **demoted to advisory-logged now (RT5)**, not left live behind a default-current flag; full seam-split follows with product/compliance sign-off. SDOH signals prohibited from influencing sharing/referral eligibility (RT12/§1557).

## Recommended approach

**Adopt Approach D.** Order: **stop live hazards → build security/compliance seams → purity → observability → semantics → data/SME/governance-gated**, additive-optional where contracts change, every flag carrying a named sunset owner.

Rationale and corrections to the draft's stated logic:
- **F12 correction:** the draft claimed "adopt Approach A" but executed a different order and deferred G6. We now explicitly reject A's ordering: the two/three *live* hazards and the two unhandled security surfaces (Part 2, generation-seam authz) come first, because a payer/compliance reviewer treats them as active harm, not backlog.
- **F13 correction:** we do **not** claim referralStore is "the one impurity." We retire the *referral-write impurity in the generator core*, and separately confirm that logging (defect 5) and every seam — consent, `wpcRecord`, terminology, directory, review-record — sit at the boundary, injected/synchronous, with no `Date`/RNG/network in-domain.
- Determinism is still load-bearing, but it is **not an audit control (RT7)**: an immutable, tamper-evident audit log is added as its own phase.
- Non-negotiables through every phase: P1/P3(restated)/P4 hold; consent **and Part 2** fail CLOSED; `toFhirCarePlan` never crashes and never implies conformance, but does signal incompleteness; domain time only via clock seam, while consent/audit/review time come from trusted server time.

## Phased execution plan

Fixtures change only by adding a new baseline file plus a manifest+changelog entry tied to a known DP/GB decision id (Phase 1). "Mock-demo-intact" means **tests pass after any re-baseline**; where a phase *visibly* changes the demo (badges, notes, reviewed citation), that is called out — "green" is the re-baselined sense, not "output unchanged" (adversarial minor (a)).

### Phase 0 — Immediate kill switches for live hazards (RT4, RT5, RT6, RT14)
- **Goal:** stop the three live production exposures *before* any seam work: fabricated care-team contacts, revenue-gated sharing, and unscreened interventions presented as safe; and refuse mock mode in prod.
- **Mechanism / seam:** feature kill switches (server-side, not `NEXT_PUBLIC_*`): (1) suppress emission of any unverified contact field — emit clearly-labeled placeholder only; (2) demote the revenue check to advisory-logged so it can no longer be the sole enabler/blocker of clinical-necessity sharing; (3) ensure no output claims interventions are safety-screened until real P2 exists; (4) prod build assertion that mock seams/`USE_MOCK_DATA` are absent from the production bundle (fail-safe, not fail-to-fake).
- **Fail-closed behavior:** sharing stays CLOSED on consent failure and is no longer *opened* by revenue; contacts fail to labeled placeholder, never to fabricated realistic data; prod boot **refuses** if mock seams are reachable.
- **Tests + gates (E13/E14/size/unit):** unit — fabricated contact never rendered as real; revenue check cannot open sharing; startup assertion fails the build when a mock seam is present in a prod bundle. E14 wired-path confirms the kill switches are on the live paths. E13 test-links. Size ratchet: net-negative or flat (removing fabrication).
- **Mock-demo-intact:** demo shows labeled placeholders and advisory-logged revenue; visibly changed and re-baselined.
- **Dependencies:** none external; product/compliance *notified* (full G6 decision is Phase 11).

### Phase 1 — Fixture-versioning + re-baseline control (enabler; strengthens F10)
- **Goal:** a real control (not free-text) that lets a *reviewed* contract change re-baseline pinned fixtures deliberately.
- **Mechanism / seam:** an explicit **manifest** mapping each pinned fixture → its DP/GB decision id. Test infra; no runtime seam.
- **Fail-closed behavior:** a pinned-fixture diff fails the gate unless it (a) references a *known* decision id in the manifest and (b) carries **CODEOWNERS review** on the fixture/manifest directory. Changelog text alone is not a control.
- **Tests + gates:** meta-test asserting the manifest binding and required review; runs under existing test gate + size ratchet.
- **Mock-demo-intact:** no runtime change.
- **Dependencies:** CODEOWNERS ownership of `tests/carePlan/fixtures` + manifest.

### Phase 2 — 42 CFR Part 2 segmentation gate (F1, RT1)
- **Goal:** a Part 2 gate distinct from provider-access consent, so SUD/behavioral-health-implicating data cannot egress under a consent that never satisfied Part 2.
- **Mechanism / seam:** (a) tag Part 2-implicating elements at generation time (med list entries like buprenorphine/methadone/naltrexone; SUD-clinic providers; `rootCause`/`criticalInsight`/`sdohSummary` free-text SUD signal); (b) a **recipient-specific, purpose-limited** Part 2 consent gate, separate from the HIPAA consent seam; (c) attach the §2.32 redisclosure-prohibition notice on any egress; (d) **default segment-out when provenance is unknown**; (e) suppress/`dataAbsentReason`-mask Part 2 fields in `toFhirCarePlan` when Part 2 consent is absent.
- **Fail-closed behavior:** unknown provenance ⇒ segmented out; absent Part 2 consent ⇒ redacted in FHIR and not shared — CLOSED, independent of the HIPAA seam.
- **Tests + gates:** "med list reveals SUD, no Part 2 consent ⇒ redacted in FHIR and not shared"; redisclosure notice present on egress; unknown-provenance ⇒ segment-out. E13/E14/size/unit.
- **Mock-demo-intact:** demo carries a Part 2 sample to show redaction; re-baselined.
- **Dependencies:** SME/compliance to define Part 2-implicating tagging rules; **must land before Phase 6 (P2 med/allergy input) and Phase 8 (care-team identities)**, which introduce exactly the revealing data.

### Phase 3 — Generation-seam authorization + egress controls (RT2, RT3, RT16, RT21, RT23)
- **Goal:** close the top PHI blast-radius surfaces before member-in-context generation (WPC-CD1) or external seams expand.
- **Mechanism / seam:** (a) object-level authz at the generation seam itself (treatment relationship / plan membership / minimum-necessary), never in the UI; tenant/member isolation; rate-limit + enumeration alerting; (b) egress **allowlist of pre-registered trading partners**; no data-derived URLs; mTLS/cert pinning; block link-local/RFC1918/metadata ranges; terminology/directory/FHIR-push seams resolve via fixed internal services only; (c) treat all member/provider free text as untrusted — validate classification outputs against a closed code set; no LLM tool-invocation on untrusted content without output validation/allowlists; never auto-fetch citation URLs; (d) scope the `wpcRecord`/holistic context pull to minimum-necessary elements with access logging.
- **Fail-closed behavior:** no treatment relationship ⇒ generation refused; non-allowlisted destination ⇒ egress refused; unresolved provenance ⇒ no share.
- **Tests + gates:** IDOR/enumeration test (varying member id without relationship ⇒ denied + alerted); SSRF test (metadata/RFC1918/data-derived URL ⇒ blocked); injection test (crafted free text cannot force keyword fallback or alter routing); minimum-necessary element-access assertion. E13/E14/size/unit.
- **Mock-demo-intact:** mock authz grants the demo member; demo unchanged functionally.
- **Dependencies:** infra — authz service, egress gateway/allowlist, secrets manager. **WPC-CD1 must not ship without this as an explicit gate.**

### Phase 4 — Audit trail + PHI-safe logging + secrets hygiene (RT7, RT8, RT14, RT15, RT22)
- **Goal:** satisfy HIPAA §164.312(b) audit controls and make the new observability logging safe.
- **Mechanism / seam:** (a) immutable, tamper-evident audit log — generation events (actor, member, timestamp from trusted server time), consent-seam result at decision time, every external disclosure (recipient, payload class, consent basis, Part 2 basis), SME-review events, overrides; retained per policy; (b) allow-listed structured logging with hard PHI/Part 2 redaction; `provenance.reason`/deferral `reason` constrained to **safe enum codes**, no interpolated member data or raw error text; log stores inside the HIPAA/Part 2 boundary; (c) no secrets/real endpoints in `NEXT_PUBLIC_*`; credentials server-side; (d) runtime invariant that `smeReviewed:true` and real-shaped contact/provider data can only originate from an authenticated real seam — mock seams excluded from prod **by construction**, with a test asserting no mock provider/review path exists in prod.
- **Fail-closed behavior:** if redaction cannot be guaranteed, log nothing beyond a safe code; audit-write failure surfaces (does not silently succeed).
- **Tests + gates:** log-redaction test (no PHI/Part 2 in any log field); mock-seam-absent-in-prod test; audit-record completeness test. E13/E14/size/unit.
- **Mock-demo-intact:** demo logging shows safe codes only.
- **Dependencies:** infra — audit store, log pipeline, secrets manager.

### Phase 5 — Make the generator core pure: extract referral side effect (defect 2 / G2; F6, F7, RT13)
- **Goal:** `tieredInterventionGenerator.generate` performs no `referralStore` mutation and (F7) **no store read**; it returns `referralIntents[]`. Orchestration stays inside the entry point.
- **Mechanism / seam:** `generateComprehensiveCarePlan` calls pure `generate` then `commitReferrals(intents, store)` **internally** (F6 — behavior of the stable entry point preserved; the UI does not gain a new call). Idempotency keys on commit; reconciliation job comparing `referralIntents` to committed referrals (RT13).
- **Fail-closed behavior:** a referral is **not** represented as "placed" until commit confirms; `commitReferrals` failure surfaces (non-silent), never a silent no-op; retries are idempotent (no double-create, no duplicate PHI disclosure).
- **Tests + gates:** purity test (generate twice ⇒ identical, store untouched — *after* grounding confirms no store read; if a read exists, lift it by injecting resolved prior-referral data); commit-failure surfaces; idempotent double-commit test; **audit all callers of `generate` including tests before landing**. E14 confirms `commitReferrals` wired; E13/size/unit.
- **Mock-demo-intact:** entry point orchestrates commit; demo unchanged.
- **Dependencies:** grounding on `referralStore` read/write shape; idempotency-key support.

### Phase 6 — Real P2 via coded contraindication input (defect 6 / G3; F2, F9, RT6)
- **Goal:** add optional coded `contraindications?: {allergies, medications}` (RxNorm/NDF-RT/SNOMED substance codes) and implement validator P2 with class/cross-reactivity logic and clinician-defined rules.
- **Mechanism / seam:** additive optional input; P2 gating runs **before P1 backfill (F2)**; P1 backfill re-consults P2 and, if no clean alternative, flags the goal "no safe intervention available" (never backfills a contraindicated one); any barrier orphaned by a P2 block routes to `sdohSummary.deferred` with a reason (P4). Absent data ⇒ explicit "P2 not evaluated — no contraindication data" note. The "evaluated" note may appear only where coded class logic actually ran (RT6 — no false assurance from free-text matching).
- **Fail-closed behavior:** present + conflict ⇒ intervention blocked; absent ⇒ documented non-evaluation, never a silent "safe" claim.
- **Tests + gates:** present-conflict blocked; present-clear allowed; absent ⇒ not-evaluated note; **P2-blocks-sole-intervention ⇒ goal flagged, not backfilled contraindicated (F2)**; **P2-block orphans a barrier ⇒ routed to `deferred` (F2)**; class/cross-reactivity case (penicillin allergy vs amoxicillin) caught. E13/E14/size/unit.
- **Mock-demo-intact:** **Blast radius acknowledged (F9)** — the "not evaluated" note appears on *all* existing plans lacking the field, a broad validation-fixture re-baseline and a visible demo change; either gate the note behind a display flag for the demo or plan the broad re-baseline explicitly. Not "additive-invisible."
- **Dependencies:** SME — contraindication rules; licensed coded terminology (ties to Phase 7); depends on Phase 2 (Part 2) since the med list is Part 2-implicating.

### Phase 7 — Terminology-driven classification over a versioned snapshot (defect 1 / G1; F3, F15, RT17)
- **Goal:** replace `mapModalityToType` substring matching with coded classification; keyword path retained only as a stamped, killable fallback.
- **Mechanism / seam:** terminology seam over an **injected, versioned, baked snapshot** (F15 — reconciles Section-3 option (c): the seam is real but the data is a pre-resolved snapshot; no in-domain IO). Coded classification preferred; on miss/failure, keep generation alive but **stamp `classificationSource:'keyword-fallback'` / low-confidence provenance (F3)**; a keyword-derived type must **not** feed clinical routing or FHIR mapping as if coded.
- **Fail-closed behavior:** distinguish *degrade-open for display* (acceptable) from *clinical routing* (must not silently use the buggy path): a **kill switch** blocks low-confidence clinical routing rather than routing wrong (RT17); crafted input cannot force the fallback (Phase 3 injection guard).
- **Tests + gates:** coded-input correct type; missing-code ⇒ stamped fallback + alert; **fallback-rate monitor with alert threshold**; kill-switch holds routing; determinism on the fallback branch (bounded enum `reason`, F14). E13/E14/size/unit.
- **Mock-demo-intact:** mock snapshot carries codes for sample modalities; uncoded still work; visibly shows provenance.
- **Dependencies:** **licensing review before embedding** the value-set snapshot; a versioned refresh process (staleness owned); infra for the snapshot. **Blast-radius grounding (adversarial minor (b)):** verify every consumer of `mapModalityToType` output (`rootCauseAnalyzer`/`successProbability`/downstream structure) before scoping the re-baseline to one fixture.

### Phase 8 — Observable holistic fallback (defect 5 / G4; F14, RT8, RT22)
- **Goal:** `generateHolisticCarePlan` returns `provenance:{source:'holistic'|'comprehensive-fallback', reason?}`; still never throws.
- **Mechanism / seam:** additive field; `reason` a **bounded deterministic enum, no raw error text, no PHI/Part 2 (F14/RT8)**; a **serialization boundary strips provenance from any external/FHIR payload (RT22)**.
- **Fail-closed behavior:** on holistic error, still falls back to comprehensive (safe default) but marks `comprehensive-fallback` with an enum reason — honest degradation, internal-only.
- **Tests + gates:** both branches (success ⇒ holistic; forced failure ⇒ fallback + enum reason); P1/P3/P4 asserted on both; **fallback-branch determinism** (enum reason, no interpolated data); provenance-never-serialized-outward test. E13/E14/size/unit.
- **Mock-demo-intact:** UI may show a degraded badge; visibly changed, re-baselined.
- **Dependencies:** none new.

### Phase 9 — Honest care-team contacts via directory seam (defect 4 / G5; F8, RT4, RT18)
- **Goal:** replace the Phase-0 kill-switched placeholders with real provider-directory data when available, else labeled placeholder.
- **Mechanism / seam:** provider-directory seam (fixed internal service per Phase 3); miss ⇒ labeled placeholder (`source:'placeholder'`); **placeholders omitted from FHIR export or carried with a `dataAbsentReason` extension — never emitted as real `Practitioner.telecom`/`CareTeam.participant` (F8/RT18)**; new mappers wrapped so they cannot crash.
- **Fail-closed behavior:** directory failure ⇒ labeled placeholder, never fabricated realistic data; external sharing of contacts still Part 2 + consent gated.
- **Tests + gates:** directory-hit real data; miss ⇒ labeled placeholder; **placeholder never appears as populated telecom in FHIR**; mapper never throws. E13/E14/size/unit.
- **Mock-demo-intact:** mock directory returns labeled sample providers.
- **Dependencies:** infra — real provider directory (Part 2 identity implications ⇒ Phase 2 precedes).

### Phase 10 — SME sign-off path for citations (defect 7 / G7; F4, F5, RT11, RT20, RT23)
- **Goal:** let a citation move `smeReviewed:false → true` without weakening P3 (restated) or the surviving disclaimer.
- **Mechanism / seam:** a review-record seam mapping citation → `{smeReviewed, reviewerId, reviewedAt, sourceRef}`. **`reviewedAt` is persisted data read from the review record — the real historical review time — NOT synthesized from the clock (F4/RT20)**; audit/review timestamps come from monotonic trusted server time, signed/immutable in the audit log. Domain reads review state; never self-asserts `true`.
- **Fail-closed behavior:** absent/failed review record ⇒ `smeReviewed:false`, disclaimer stays; never default `true`; a mock review seam cannot produce `true` in prod (Phase 4 invariant).
- **Tests + gates:** unreviewed ⇒ false + disclaimer present (P3); reviewed ⇒ true + **truthful post-review disclaimer still survives (F5)**; `reviewedAt` sourced from record not clock. E13/E14/size/unit.
- **Mock-demo-intact:** mock review seam marks one sample citation reviewed; visibly changed.
- **Dependencies:** **SME + licensed clinical content**; licensing review for citation redistribution on each egress path (RT23); **NCQA deployment gating (RT11)** — output stays out of accredited CM/PHM workflows until sign-off complete; track which programs consume the output.

### Phase 11 — Revenue-gate seam split (defect 3 / G6; RT5, RT12)
- **Goal:** formalize the Phase-0 demotion into a clean split: consent = clinical-necessity hard gate; revenue = separate, labeled, advisory policy check that can never be the sole blocker/enabler of clinical sharing.
- **Mechanism / seam:** keep consent + Part 2 as hard gates; revenue logic in a named, separately-logged advisory function. **SDOH signals and revenue prohibited from influencing sharing/referral/access eligibility (RT12/§1557)**, with a bias/equity review of any path consuming SDOH.
- **Fail-closed behavior:** consent/Part 2 failure ⇒ CLOSED (unchanged); revenue/SDOH cannot open sharing.
- **Tests + gates:** consent-closed still closed; revenue-only/SDOH-only never opens; equity test asserts SDOH does not alter eligibility; **flag carries a named sunset owner + condition (F11)**; both flag states covered; **per-phase size budget confirmed with headroom for the dual path (F11)**. E13/E14/size/unit.
- **Mock-demo-intact:** unchanged post-Phase-0 (revenue already advisory).
- **Dependencies:** **product + compliance/legal sign-off (governance-gated)** — the code seam ships, the policy decision is not ours unilaterally.

### Phase 12 — CMS-0057-F / RADV guardrails (RT9, RT10)
- **Goal:** prevent structural-only FHIR from serving mandated interop APIs, and prevent AI-asserted diagnoses from entering risk adjustment unattested.
- **Mechanism / seam:** (a) a hard guardrail blocking Tier-A structural output from feeding any CMS-regulated endpoint (Provider Access / Payer-to-Payer / Prior-Auth); resources labeled non-conformant; roadmap real US Core / Da Vinci conformance behind an HL7-validator gate before any regulated use; (b) hard provenance separation marking all AI-derived clinical assertions (`rootCause`, conditions) as unconfirmed; block them from encounter/claims/HCC pipelines without explicit clinician attestation; audit the attestation event.
- **Fail-closed behavior:** unrecognized/regulated destination ⇒ structural output refused; unattested AI assertion ⇒ blocked from claims/HCC.
- **Tests + gates:** structural output cannot reach a regulated endpoint; AI assertion blocked from HCC pipeline absent attestation; non-conformant label present. E13/E14/size/unit.
- **Mock-demo-intact:** demo unaffected (guardrail on egress boundary).
- **Dependencies:** infra — endpoint classification; conformance roadmap; RADV/HCC pipeline owners.

### Phase 13 — Consent freshness / TTL / purpose-of-use (RT19)
- **Goal:** ensure fail-closed consent is not undermined by staleness, caching, or clock-seam ambiguity.
- **Mechanism / seam:** consent freshness/TTL with revocation propagation before any share; purpose-of-use checking (not mere presence); **consent-expiration and audit timestamps derive from real trusted server time, with a guard that the mockable test clock can never back a legal/consent/audit decision**.
- **Fail-closed behavior:** stale/expired/revoked or unknown-freshness ⇒ share refused; test-clock-backed consent decision ⇒ refused by guard.
- **Tests + gates:** revoked-but-cached ⇒ not shared; expired-by-real-time ⇒ not shared; guard rejects a consent/audit decision sourced from the mock clock. E13/E14/size/unit.
- **Mock-demo-intact:** demo consent unaffected; guard is prod-boundary.
- **Dependencies:** infra — consent freshness/revocation propagation, trusted time source.

## Adversarial findings & resolutions

| # | Finding | Resolution |
|---|---------|-----------|
| F1 | Part 2 not actually handled; consent seam is wrong gate | **RESOLVED** — Phase 2 adds a distinct Part 2 segmentation gate (tag-at-source, recipient/purpose-specific consent, §2.32 notice, FHIR `dataAbsentReason` masking), landing before Phases 6/8. |
| F2 | P2 × P1 × P4 interaction unspecified | **RESOLVED** — Phase 6 specifies P2-before-backfill, backfill re-consults P2 (flag "no safe intervention" over contraindicated backfill), orphaned barrier → `deferred`; three tests named. |
| F3 | Degrade-open to known-unsafe keyword classifier | **RESOLVED** — Phase 7 stamps `classificationSource:'keyword-fallback'`/low-confidence, bars it from clinical routing/FHIR-as-coded, adds fallback-rate alert + kill switch (with RT17). |
| F4 | Clock misused for `reviewedAt` | **RESOLVED** — Phase 10 reads `reviewedAt` from the persisted review record; clock kept out of Phase 10 (with RT20). |
| F5 | P3 "false" vs Phase 7 "true"; disclaimer contradiction | **RESOLVED** — P3 restated (disclaimer survival is load-bearing; `smeReviewed` defaults false, true only via record); post-review disclaimer stays truthful, not "not reviewed." |
| F6 | Purity pushes side effect into UI, changing entry-point contract | **RESOLVED** — Phase 5 orchestrates `commitReferrals` *inside* the entry point; UI gains no new call; all `generate` callers audited before landing. |
| F7 | Assumes store is write-only | **RESOLVED (grounding-gated)** — Phase 5 requires confirming `generate` does not read the store; if it does, lift via injected prior-referral data; F13 over-claim also corrected. |
| F8 | Placeholders re-fabricate once mapped to FHIR | **RESOLVED** — Phase 9 omits placeholders from FHIR or masks with `dataAbsentReason`; never real telecom; mappers wrapped non-throwing; test added (with RT18). |
| F9 | P2 note changes essentially every existing plan/demo | **RESOLVED (acknowledged blast radius)** — Phase 6 states the broad validation-fixture re-baseline / visible demo change explicitly; note behind a display flag or planned broad re-baseline; not "additive-invisible." |
| F10 | Phase-0 gate cannot enforce "reviewed change" | **RESOLVED** — Phase 1 adds a decision-id manifest + CODEOWNERS review requirement; changelog text alone rejected. |
| F11 | Ratchets asserted without budget; Phase 6 flag debt indefinite | **RESOLVED** — per-phase size budget/headroom confirmed; every flag (esp. Phase 11) carries a named sunset owner + condition. |
| F12 | Phase order does not match claimed Approach A | **RESOLVED** — Approach A explicitly rejected; Approach D adopted; G6/revenue deliberately handled early-as-kill-switch (Phase 0) then late-as-seam-split (Phase 11), stated openly. |
| F13 | Over-claim "the one impurity" | **RESOLVED** — reframed to "the referral-write impurity in the generator core"; logging + all seams confirmed at boundary, injected/synchronous, no Date/RNG/network in-domain. |
| F14 | `reason` string threatens determinism + PHI | **RESOLVED** — `reason` is a bounded deterministic enum, no interpolated member data/raw error text; asserted on fallback-branch determinism tests (Phases 4/7/8). |
| F15 | Determinism forces baked snapshot that Section 3 rejected; staleness + licensing uncosted | **RESOLVED** — Phase 7 reconciles: seam over a versioned baked snapshot; licensing cleared before embed; refresh/versioning owned; near-term "seeded codes only" stated as the real state. |
| Minor (a) | "demo green" conflates tests-pass with output-unchanged | **RESOLVED** — "mock-demo-intact" defined as tests-pass-after-re-baseline; visible demo changes (Phases 6/7/8/9/10) called out. |
| Minor (b) | Phase 3 (now 7) re-baseline likely under-scoped | **RESOLVED** — Phase 7 requires grounding on every `mapModalityToType` consumer before scoping the re-baseline. |

## Red-team findings & mitigations

| # | Dimension | Finding | Mitigation / phase |
|---|-----------|---------|--------------------|
| 1 | 42 CFR Part 2 | Single consent seam does not segment SUD/behavioral data | **Phase 2** — distinct Part 2 gate, tag-at-source, §2.32 notice, segment-out on unknown provenance. |
| 2 | Authz / IDOR | WPC-CD1 member-in-context generation is an IDOR at the top PHI surface | **Phase 3** — object-level authz at the generation seam, isolation, rate-limit/enumeration alerts, audit; WPC-CD1 blocked without this gate. |
| 3 | SSRF / exfil | FHIR-push/terminology/directory destinations attacker-controllable | **Phase 3** — trading-partner allowlist, no data-derived URLs, mTLS/pinning, block link-local/RFC1918/metadata. |
| 4 | Clinical safety | Fabricated contacts live now, deferred to Phase 5 | **Phase 0 (must-fix-now)** — suppress fabricated emission immediately; labeled placeholders until directory (Phase 9). |
| 5 | Compliance/legal | Revenue-gated sharing live, treated as backlog | **Phase 0** — demote revenue to advisory-logged now; escalate to compliance/legal; full split Phase 11. |
| 6 | Clinical safety | P2 absent; string design gives false assurance | **Phase 0** (no "safe" claim) + **Phase 6** (coded RxNorm/NDF-RT + class/cross-reactivity, clinician rules). |
| 7 | Auditability | No audit trail; determinism ≠ audit control | **Phase 4** — immutable tamper-evident audit log (actor, consent basis, disclosures, review, overrides). |
| 8 | PHI in logs | New fallback logging leaks PHI/Part 2 | **Phase 4** — allow-listed structured logging, hard redaction, enum `reason`, log store in-boundary. |
| 9 | CMS-0057-F | Structural-only FHIR misused on regulated APIs | **Phase 12** — hard guardrail + non-conformant labeling + conformance roadmap behind HL7 validator. |
| 10 | RADV / FCA | AI diagnoses leak into risk adjustment | **Phase 12** — provenance separation; block from claims/HCC without clinician attestation; audit attestation. |
| 11 | NCQA | `smeReviewed:false` unusable in accredited CM/PHM | **Phase 10** — gate output out of accredited workflows until sign-off; track consuming programs. |
| 12 | Equity / §1557 | SDOH + revenue → proxy discrimination in sharing | **Phase 11** — prohibit SDOH/revenue from influencing eligibility; bias/equity review + test. |
| 13 | Referral integrity | generate→commit split → fail-open / double-commit | **Phase 5** — idempotency keys, no "placed" until commit confirmed, surfaced failure, reconciliation job. |
| 14 | Secrets/config | `NEXT_PUBLIC_*` browser exposure; prod boots mock | **Phase 0** (prod refuses mock) + **Phase 4** (no secrets in `NEXT_PUBLIC_*`, server-side secrets manager). |
| 15 | Abuse | Mock seams inject false trust signals | **Phase 4** — mock seams excluded from prod by construction; runtime invariant that `true`/real data only from authenticated real seam; prod test. |
| 16 | Injection | Untrusted free text drives clinical routing | **Phase 3** — untrusted-text handling, closed-code-set output validation, no LLM tool-use without allowlist; fallback not forceable by input. |
| 17 | Failure mode | Silent fail-open of terminology has no kill switch | **Phase 7** — fallback-rate alert threshold + kill switch; display-degrade vs clinical-routing distinction. |
| 18 | Failure mode | `never throws` emits safety-incomplete FHIR silently | **P3/FHIR invariant restated** + **Phase 9** — `dataAbsentReason`/`OperationOutcome`, completeness check before transmit; "never throws" = never crashes, still signals incompleteness. |
| 19 | Consent correctness | Staleness/caching/clock ambiguity undermines fail-closed | **Phase 13** — TTL + revocation propagation, purpose-of-use, real trusted time, guard against test-clock-backed decisions. |
| 20 | Auditability | `reviewedAt` from mockable clock weakens provenance | **Phase 10** — `reviewedAt` from persisted record; audit/review time from monotonic trusted server time, signed/immutable; clock mockability walled off. |
| 21 | Minimum necessary | Holistic/`wpcRecord` pull exceeds minimum-necessary | **Phase 3** — scope context seam to consumed elements; document determination; log element access. |
| 22 | Info leak | `provenance`/`deferred reason` serialize outward | **Phase 8 (and Phase 6)** — internal-only with a serialization boundary stripping them from external/FHIR payloads; enum reasons. |
| 23 | Licensed content | Citations/terminology redistribution + auto-fetch SSRF | **Phase 7/Phase 10** — licensing review before embed/redistribute; never auto-fetch citation URLs; confirm redistribution rights per egress. |

**Cross-cutting gaps now owned:** (a) threat model + authz for the generation seam — Phase 3; (b) fail-closed specified for Part 2 (Phase 2), consent staleness (Phase 13), and audit (Phase 4), not just sharing; (c) the two/three live patient-safety/compliance hazards de-risked first — Phase 0; (d) PHI-in-logs, secrets, SSRF/egress — Phases 3–4.

## Open questions for review/approval

1. **Grounding (blocking several phases):** exact signatures of the four entry points; `sdohSummary` shape; APIs of `referralStore` (does `generate` *read* it? — F7), consent, terminology, directory, review seams; every consumer of `mapModalityToType` (minor (b)).
2. **42 CFR Part 2 (Phase 2):** who defines Part 2-implicating tagging rules; is recipient/purpose-specific consent capture available upstream, or must it be built?
3. **Generation-seam authz (Phase 3):** source of truth for treatment relationship / plan membership; is WPC-CD1 in scope for this plan or tracked separately with Phase 3 as a hard prerequisite?
4. **Revenue gate (Phase 0 + Phase 11):** compliance/legal sign-off to demote the revenue check to advisory *now*; product decision on the final split. Confirm the interim advisory-logged behavior is acceptable while the seam-split is pending.
5. **P2 (Phase 6):** SME to author contraindication/class/cross-reactivity rules; decision on the "P2 not evaluated" note — display-flag for demo vs planned broad validation-fixture re-baseline (F9).
6. **Licensed terminology (Phase 7):** which code system; redistribution rights for embedding a versioned snapshot in-repo/in-build; who owns snapshot refresh/versioning.
7. **Citation sign-off (Phase 10):** SME + licensed clinical content availability; which NCQA-accredited programs (if any) currently consume output and must be gated out until sign-off (RT11).
8. **CMS-0057-F (Phase 12):** are any regulated endpoints already (or soon) wired to `toFhirCarePlan`? Owner and timeline for real US Core / Da Vinci conformance.
9. **Audit + time (Phases 4/13):** approved audit store and retention policy; trusted server-time source; confirmation that the clock seam is barred from all consent/audit/review decisions.
10. **Size budget:** confirmed per-phase headroom under the size ratchet, including Phase 11's dual path and its named flag-sunset owner (F11).
11. **Sequencing sign-off:** approval of Approach D (live hazards → security/compliance seams → purity → observability → semantics → governance-gated) over the draft's Approach A, and of handling the revenue gate in two stages (Phase 0 kill switch, Phase 11 seam split).

## Status

DRAFT — not implemented; for review/approval before a future phase.

---
*Generated by a coalition of agents (draft → adversarial critique → red-team → synthesis), grounded in the repo. DRAFT for review/approval — not implemented.*
