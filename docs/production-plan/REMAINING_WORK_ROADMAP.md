> **OWNER DIRECTIVE (overrides the plan below):** WPC-CD1 — server-side, member-in-context care-plan generation (the `careplan.generate` job / off-the-inbound-flow generation) — is **DE-SCOPED. Do not build.** The client-side care-plan path stays the fail-closed stopgap it is today. The **consent-decision seam / consent-scope-from-principal** work (fixing the `NO_CONSENT` degraded path) is a *separate* item and remains valid on its own. Where the plan below recommends WPC-CD1 as the next phase, the actual recommended next phase is: consent-decision seam (mock/sandbox only) + Iteration-5 (care-team/workflow domains) + the self-contained HW6 items. Re-scope on review.

---

# RHTP Remaining-Work Execution Roadmap (next phase) — Hardening / Execution Plan (DRAFT FOR REVIEW)

## Context & current state

**Branch `feat/wpc-graph-population` (local-only; GitHub push blocked; Docker-for-CI externally gated).** Committed and green under local gates:

- **Graph population arc (Phases 1–4):** process-shared projection stores; real-pipeline population (SDOH drop → outbox → projection); projected-graph holistic aggregator behind the `wpcRecord` seam (async, fail-closed on absent member; `contextProvenance` marks projected-vs-neutral sections); reads routed through the seam.
- **Job-driver seam (Phase 5 + follow-ups):** `Job` / `JobDriver` / `JobRegistry` + `InProcessJobDriver`; `projection.drain` and `ingest.cbo-sdoh` jobs; ops HTTP surface `POST /api/ops/jobs/run` + `GET /api/ops/jobs/status` (service-token auth, `OPS_JOBS_TOKEN`, fail-closed); config-selectable HTTP ops driver (`OPS_JOBS_REMOTE_URL`); production ingest `OutboxDeps` seam (fail-closed, real-deps factory registration point); Airflow `sdoh_nightly` DAG documented; wiring-baseline trimmed 122 → 66.
- **Framework v1.6:** canonical `scripts/ci-gates.sh` (fast/push/ci); E13 test-link ratchet; E14 wired-path ratchet; size ratchet (400 prod / 500 test LOC); E11 provenance; crash-safe mutation; `dataMode` seam registry (mock|seeded|production; production fail-closed); mock demo must stay green.

**Two named stopgaps still in place:**
- Care-plan holistic path routed through the seam **synchronously as a stopgap** (not off the inbound flow).
- `/api/wpc/context` derives consent scope by **defaulting to `NO_CONSENT`** (most restrictive) — fail-closed, but functionally degraded; it does not yet read the member's directives.

**Coverage / horizon:** Record coverage 7/20 domains (Iterations 0–4 complete). Iterations 5–10 defined in `docs/production-plan/BUILD_LESSONS_AND_ROADMAP.md`. ~7–9M tokens estimated. HW6 policy-fidelity register HW6-1..9 open. Iteration 7 scope **unknown — needs grounding**.

**Central reframe adopted from review (drives the whole plan):** consent is **not** a property of the principal. Part-2 disclosure scope is a function of *the member's stored consent directives × requesting entity × purpose-of-use × directive validity window*. Every mechanism below is re-cast on that basis, and a hard line is drawn between **sandbox/mock build work** (may proceed now, in the order below) and **real-data enablement** (bound to a compliance gate bundle: server-side CI + review, per-caller authz + audit on the ops/job surface, disclosure accounting, and completed Part-2 redaction/revocation).

## Approaches considered (tree-of-thought)

**Candidate A — Close the WPC client-delivery vertical (WPC-CD1) now, as a *sandbox-only* build.**
Member-directive-derived consent decision + `careplan.generate` job + retire the two stopgaps, with **real-data enablement gated** behind the compliance bundle.
- *Pros:* seams already exist; removes/converts two named stopgaps; repairs the degraded consent path; highest coherence with just-built code; small increments; mock demo protected.
- *Cons:* security-sensitive (consent widening is the single highest blast-radius change); coverage stays 7/20; the correctness primitives clinician-facing plans depend on (UCUM, survivorship, ConceptMap) are unbuilt.

**Candidate B — Advance coverage via Iteration 5 (care-team + workflow) on the domain-template track.**
- *Pros:* biggest strategic movement toward 20/20; template proven on 4 clinical-core domains; low per-domain risk.
- *Cons:* abandons a half-finished vertical to open a new front (poor increment hygiene); leaves fresh WPC stopgaps and a degraded consent path as debt; higher token cost.

**Candidate C — Sweep the self-contained HW6 policy-fidelity items.**
- *Pros:* each small, self-contained, cleanly gated.
- *Cons:* HW6-8 redaction and HW6-9 revocation **interlock with consent-scope**; doing them before member-directive-derived scope sequences backwards. No single through-line.

## Recommended approach

**Run Candidate A now, re-scoped as sandbox/mock build only, with real-data enablement bound to a compliance gate bundle.** It finishes what was just built, converts the degraded consent path to a correct member-directive evaluation, and correctly sequences the consent-family HW6 items to follow. Iteration 5 (Candidate B) is the right *next* phase, once the vertical is closed from a clean baseline.

Two headline corrections to the draft's framing:
1. It **retires the care-plan stopgap and *converts* the consent-default stopgap** into a fail-closed *failure* branch — it does not remove both.
2. It is **not "lowest risk to mock demo"**: it changes the consent path feeding context and flips the single source of truth for care-plan reads. Golden-snapshot regressions gate every increment.

The organizing rule: **all mock/seeded build work proceeds now in the order below; no real-data environment is enabled until the compliance bundle is complete.**

## Phased execution plan

### PHASE NOW — WPC-CD1 (sandbox/mock build; real-data enablement gated)

**Increment 1a — Consent-decision seam + wiring + fail-closed default + deterministic mock resolver.**
- **Goal:** replace the hardcoded `NO_CONSENT` default with a `ConsentDecisionResolver` seam whose signature is `(principal, member, purposeOfUse, asOf) → ConsentDecision`, returning a typed object `{scope, basis, consentId, expiry, source, decision: GRANTED|DENIED_BY_CONSENT|DENIED_BY_FAILURE}` — never a bare enum. This increment ships only the seam, wiring, default-deny, and a deterministic mock resolver.
- **Mechanism / seam:** `ConsentDecisionResolver` injected into the route via the factory registration point; selection flows through `dataMode`. Mock resolver evaluates a fixed directive fixture; **all validity-window checks route through the clock seam** (`asOf`). Prerequisite verified first: **authn middleware presence on `/api/wpc/context`** (if absent, adding/validating authn is an explicit prior step).
- **Fail-closed behavior:** default-deny on *any* scope not explicitly granted (not merely absent principal); production with no resolver registered → `DENIED_BY_FAILURE` → `NO_CONSENT` output. `DENIED_BY_CONSENT` and `DENIED_BY_FAILURE` produce identical restrictive output to the caller but distinct audit + metric.
- **Tests + gates (E13/E14/size/unit):** resolver unit; route tests asserting **exact scope equality** against known-directive fixtures (never "broader-than-`NO_CONSENT`"); negative tests that SUD/Part-2 segments stay restricted for an authenticated, otherwise-authorized principal; clock-seam-pinned determinism test (identical inputs → stable decision across `asOf`). Gates: **fast/push only; ci deferred** (Docker unavailable). E13 new tests linked; E14 route wired through seam (baseline updated explicitly, see Adversarial #17); size ratchet <400 prod.
- **Mock-demo-intact:** mock resolver deterministic (clock seam only); golden-snapshot of mock context asserted before/after.
- **Dependencies:** none external. SME (GB-3) consulted on directive model shape (async, non-blocking).

**Increment 1b — Real directive-evaluating resolver + disclosure accounting (build, not enable).**
- **Goal:** implement the resolver that evaluates the member's stored Part-2 directives × requesting entity × purpose-of-use × validity window; emit a disclosure-accounting record (HIPAA §164.528 / Part-2 §2.13) **before** any widened disclosure is emitted (fail-closed: no accounting write → no disclosure).
- **Mechanism / seam:** production resolver registered at the factory point but **left disabled** in real-data environments; `dataMode` shadow/dry-run mode logs "would have disclosed X" against the `NO_CONSENT` baseline.
- **Fail-closed behavior:** absent directive store, failed accounting write, or unresolvable window → `DENIED_BY_FAILURE`.
- **Tests + gates:** directive-evaluation unit against fixtures; accounting-write-before-emit ordering test; shadow-mode parity log test. fast/push; ci deferred. Split from 1a specifically to fit the size ratchet on a security-critical component.
- **Mock-demo-intact:** unaffected — production path disabled.
- **Dependencies:** disclosure-accounting store (infra); two-person review + server CI before *enablement* (compliance bundle).

**Increment 1c — Structural Part-2 redaction (HW6-8), pulled into PHASE NOW.**
- **Goal:** minimum-necessary field-level 42-CFR-Part-2 redaction, **structural not value-only** — protected sections indistinguishable from "member has no such data" (no empty-but-present sections, no source-naming provenance tags, no count deltas).
- **Mechanism / seam:** redaction applied at projection-read/aggregation; provenance emission suppressed for protected classes.
- **Fail-closed behavior:** unknown segment classification → redact.
- **Tests + gates:** inference-by-difference test comparing consented vs non-consented view of the same member (byte-identical for protected absence); exact-scope redaction tests. fast/push; ci deferred; size ratchet.
- **Mock-demo-intact:** golden-snapshot regression.
- **Dependencies:** none. **Gates real-data enablement of 1b** (no widening beyond segments with no Part-2 requirement until 1c lands).

**Increment 2 — `careplan.generate` job (server-side, consent-governed).**
- **Goal:** move holistic care-plan generation off the inbound flow into a job using `resolveHolisticContextAsync`, governed by an explicit consent context.
- **Mechanism / seam:** register `careplan.generate` in `JobRegistry`; **required job input `{principal, member, purposeOfUse}`** (or a pre-resolved `ConsentDecision`); dispatch authorizes `(caller × requested member)` through the **same resolver/entitlement path** as the live route (IDOR/enumeration guard). Output carries generation-time `{scope, provenance, projectionSnapshotVersion, generatedAt}`. Ops read/run authority segregated from member-content-read authority; ops surface must **not** return member-level Part-2 content to a bare service token.
- **Fail-closed behavior:** absent consent input, caller-without-relationship-to-member, absent member, or production without real deps → fail closed. Disclosure-accounting record written before any care-plan content is emitted.
- **Tests + gates:** job unit (present → projected sections with provenance + snapshot version; absent → fail closed); dispatch-authz test (caller not entitled to member → rejected); ops-token cannot read member content test; **determinism test** — single-threaded deterministic drain order, seeded ID generation, drain run twice → byte-identical output; token-authed ops-run integration. fast/push; **seeded-mode integration test of the job-backed path** (not mock-only); ci deferred; E14 shows `careplan.generate` reachable (baseline explicitly incremented this step); size ratchet.
- **Mock-demo-intact:** demo drives the job via `InProcessJobDriver` drain; **stopgap read retained as mock fallback through this increment**; a **shadow/parity test runs both paths on one fixture and asserts equality** (or documents intended differences) before Increment 3.
- **Dependencies:** disclosure-accounting store; per-caller ops-surface identity (see Red-team #6, staged — build authz-hook now, credential hardening bundled with enablement).

**Increment 3 — Retire the care-plan holistic stopgap (mock-path consolidation now; seeded/production serving gated).**
- **Goal:** make the seam + job the single path in mock; **defer seeded/production job-backed serving** behind the compliance bundle + HW6-8/HW6-9.
- **Mechanism / seam:** `dataMode` selects job-backed path in mock; seeded/production job-backed serving guarded by a **feature-flag with per-environment rollback to the synchronous path** and a **global `NO_CONSENT` kill-switch** independent of per-request fail-closed logic.
- **Fail-closed behavior:** production path requires job driver + real deps; absent → fail closed; kill-switch forces global `NO_CONSENT` without redeploy.
- **Tests + gates:** mock regression (care plan resolves); seeded-mode job-path integration test; kill-switch test; golden-snapshot before/after; E14 baseline **decremented explicitly** for the stopgap removal (add-then-remove across increments never occurs against a single monotonic baseline — see Adversarial #17). fast/push; ci deferred.
- **Mock-demo-intact:** explicit — mock uses `InProcessJobDriver` drain; demo green after switch; golden-snapshot asserted.
- **Dependencies:** staged cutover (canary/percentage + job-success-rate health check + automatic fallback) is part of the **enablement** bundle, not PHASE NOW.

### Ordered backlog (code-only) — after PHASE NOW

| # | Phase | Size | Dependency gate |
|---|-------|------|-----------------|
| B1 | **HW6-9 consent-revocation** — bounded revocation SLA; invalidate/re-filter **every derived-PHI store** (projection stores, `careplan.generate` outputs, outbox, DAG artifacts, caches, logs); staleness detection on persisted plans (provenance + scope re-evaluated at read) | M | Needs 1b + 1c |
| B2 | **HW6 self-contained fidelity:** HW6-2 ICD-10-CM rollup (**algorithm + vendored CMS/CDC tabular data — a data dependency, confirm vendored**); HW6-5 UCUM parser (**scoped to the subset the lab/units path uses**, not full grammar); HW6-7 survivorship source-order tiebreak (**deterministic before the job is authoritative**) | M | Data-vendoring for HW6-2 |
| B3 | **HW6-3 reverse+transitive ConceptMap translate** — algorithm against fixtures | S–M | Real published maps may be licensed (partial gate) |
| B4 | **Iteration 5** — care-team + workflow via domain-template track | L | Proven template |
| B5 | **Iteration 6** — behavioral + social via domain-template track (Gravity *modeling* code-only, real feed gated) | L | Code-only |

**Discrete unsequenced grounding task (no backlog position):** *Ground Iteration 7 scope* — owner assigned; sized only after grounding; inherits the **same real-data gates (CI, review, PIA)** as everything else. (Removed from the ordered backlog: positioning it asserted a sequence the plan cannot justify.)

### Infra / SME / licensed-content-gated (do NOT start now)

| Item | Gate |
|------|------|
| HW6-1 SNOMED-CT subsumption | Licensed SNOMED content (hard block, no workaround) |
| HW6-4 real HCC V28 set | Licensed CMS content (hard block); keep HCC/ICD coding logic **out of the care-delivery path** until this lands with lineage |
| HW6-6 Gravity SDOH real-feed depth | Gravity feed access (modeling code-only; real data gated) |
| Iteration 8A — terminology + external identity + value-set governance console | Terminology server + VSAC/CMS/Gravity + reference MPI (PIX/PDQ) + SME (GB-3) |
| Iteration 9 — cloud | Cloud accounts |
| Iteration 10 — certification (Inferno Da Vinci CRD/DTR/PAS, US Core, CARIN, X12; k6 1K/5K/10K; pen-test) | Live backbone (GB-4), Docker for CI, conformance + pen-test calendars |

**Compliance gate bundle (binds real-data enablement of Increments 1b/2/3):** server-side CI + PR review + immutable build (Red-team #14); per-caller auditable credentials + `(caller × member)` authz on ops/job surface (Red-team #6/#7); disclosure accounting live (Red-team #1/#13); Part-2 redaction (1c) + revocation (B1) complete (Red-team #3/#4/#19); DPIA/PIA + threat model + data-flow inventory (Red-team #20); US Core / CARIN / Da Vinci consent+provenance profile mapping captured as a decision record (Red-team #15). **Request the external stand-ups (terminology server, MPI, cloud, GB-4, GB-3, conformance/pen-test calendars) in parallel now** so they are ready as B1–B5 drains.

## Adversarial findings & resolutions

1. **Principal-keyed consent is wrong for Part-2 — RESOLVED.** Resolver re-signatured `(principal, member, purposeOfUse, asOf) → ConsentDecision`, evaluated against the member's stored directives; renamed to `ConsentDecisionResolver`.
2. **Redaction sequenced after the widening — RESOLVED.** HW6-8 pulled into PHASE NOW as Increment 1c; real widening cannot exceed what redaction enforces; 1b enablement gated on 1c.
3. **Route test asserts "broader than nothing" — RESOLVED.** Tests now assert exact scope equality against known-directive fixtures + negative Part-2 redaction tests.
4. **Job runs with no consent context — RESOLVED.** `{principal, member, purposeOfUse}` is a required job input; fail-closed if absent; governing consent recorded on output.
5. **Ops surface bypasses consent — RESOLVED.** Output carries/enforces generation scope; ops read/run split from member-content-read; bare service token cannot read member Part-2 content.
6. **Revocation ignores projected/persisted data — RESOLVED.** B1 (HW6-9) enumerates every derived-PHI store and invalidates/re-filters, with a revocation-removal test across projections and prior plans.
7. **"ci" listed as met while ci cannot run — RESOLVED.** All PHASE NOW increments state **fast/push only; ci deferred**. Stopped claiming ci as a met gate.
8. **Security-sensitive change ships unreviewed — RESOLVED.** Only mock/seeded resolver + fail-closed production build locally now; production-enabling registration held for the compliance bundle.
9. **No kill-switch/rollback — RESOLVED.** Increment 3 adds a `dataMode`/flag global `NO_CONSENT` kill-switch + per-environment rollback to the synchronous path.
10. **Determinism claim covers only wall-clock — RESOLVED.** Increment 2 specifies deterministic single-threaded drain order, seeded ID generation, and a run-twice byte-identical determinism test.
11. **Directive validity windows reintroduce time — RESOLVED.** All validity-window evaluation routes through the clock seam (`asOf`); pinned-clock stability test added.
12. **Dual-path window hides divergence — RESOLVED.** Increment 2 adds a shadow/parity test asserting stopgap-vs-job equality before Increment 3 retires the stopgap.
13. **Increment 3 enables seeded/production before redaction — RESOLVED.** Increment 3 re-scoped to mock-only consolidation now; seeded/production serving gated behind HW6-8 + the bundle.
14. **Unstated authn prerequisite — RESOLVED.** Increment 1a verifies authn middleware on the route as an explicit first step; adds it if absent before scope derivation.
15. **Missing disclosure audit logging — RESOLVED.** Disclosure-accounting record (member, principal, purpose-of-use, scope, timestamp via clock seam) added to Increments 1b and 2 as a fail-closed pre-emit deliverable.
16. **Increment 1 under-budgeted vs size ratchet — RESOLVED.** Split into 1a (seam/wiring/default/mock) and 1b (real directive-evaluating resolver), each under 400 prod.
17. **E14 direction ambiguous / may trip mid-arc — RESOLVED.** Plan states E14 counts wired paths; baseline updated **explicitly per increment** (2 increments the add, 3 decrements the removal) so no single increment both adds and removes against a monotonic direction. Wiring-baseline (122→66) and the E14 ratchet are named as distinct counters.
18. **"Removes both stopgaps" imprecise — RESOLVED.** Reworded: retires the care-plan stopgap; converts the consent-default stopgap into a fail-closed failure branch.
19. **"Lowest risk to mock demo" overstated — RESOLVED.** Claim softened; golden-snapshot regressions on mock context/care-plan output asserted before/after each increment.
20. **HW6-2/HW6-5 understate data/scope deps — RESOLVED.** B2 separates "algorithm present" from "reference data present" for HW6-2 (confirm ICD-10-CM tabular data vendored) and scopes HW6-5 to the used UCUM subset.
21. **Iteration 7 wrongly sequenced as B6 — RESOLVED.** Removed from the ordered backlog; made a discrete unsequenced grounding task with its own owner.
22. **Provenance goes stale on async plans — RESOLVED.** Output records generation-time scope + provenance + projection-snapshot version; B1 makes staleness detectable/invalidated on consent change.

## Red-team findings & mitigations

1. **Highest-risk change lacks disclosure accounting — RESOLVED.** Typed `ConsentDecision` object; accounting write before emit (fail-closed); default-deny on any un-granted scope; shadow/dry-run + two-person review before real-data enablement.
2. **`NO_CONSENT` ambiguous (denied vs broken) — RESOLVED.** `DENIED_BY_CONSENT` vs `DENIED_BY_FAILURE` distinguished internally (same caller output, different audit + metric); alert on failure-branch-rate threshold.
3. **Redaction/provenance leak by differential observation — RESOLVED.** Increment 1c redaction is structural; inference-by-difference test between consented and non-consented views of the same member.
4. **Revocation has no latency bound / cached-data coverage — RESOLVED.** B1 defines a bounded SLA and enumerates every derived-PHI store to purge/re-filter, with a stale-artifact resurfacing test.
5. **New derived PHI stores lack min-necessary/retention — RESOLVED (design) / PARKED (infra enablement).** Min-necessary at projection-write and store documentation are added as design requirements now; **encryption-at-rest + retention/TTL enforcement PARKED to the infra/PIA bundle** (no in-sandbox infra to configure at-rest encryption; captured in the data-flow inventory as a go-live gate).
6. **Ops runner behind a static shared token — PARTIALLY RESOLVED / PARKED.** `(caller × member)` authz hook and constant-time comparison built now; **short-lived per-principal credentials (mTLS/OIDC/signed), rotation/revocation, rate-limit + volume alerting PARKED to the enablement bundle** (require identity infra not present in sandbox). Real-data ops enablement is gated on this.
7. **`member` job input = IDOR/enumeration — RESOLVED.** Dispatch authorizes `(caller × member)` through the same resolver/entitlement path; fail closed on no relationship; every `(caller, member)` pair logged.
8. **`OPS_JOBS_REMOTE_URL` SSRF sink — RESOLVED (build) / PARKED (network policy).** Host allowlist, link-local/private-range + redirect ban, TLS-verify, and treat-as-security-sensitive-config are added as driver requirements now; **network-egress policy enforcement PARKED to infra**. Ops token never forwarded to an unvalidated host.
9. **Unvalidated external ingest → injection into graph — RESOLVED.** `ingest.cbo-sdoh` schema-validates + canonicalizes at the boundary; strong-typed member IDs; malformed → dead-letter (fail-closed, no partial write); CBO free-text never rendered to clinician surfaces without sanitization + provenance labeling.
10. **Increment 3 single-switch cutover, no prod rollback — RESOLVED.** Per-environment feature-flag rollback + seeded-mode integration test + staged canary with job-success-rate health check and automatic fallback (canary staging part of enablement).
11. **Fail-closed becomes silent clinical-availability failure — RESOLVED (design).** Availability SLOs + fail-closed-rate alerting defined; clinician UX must signal "context temporarily unavailable — do not treat as no-record" rather than an empty/neutral context. UX copy flagged as an Open Question for the clinical-safety owner.
12. **Determinism guard not a production-integrity control — RESOLVED.** Every generated context stamped with projection-snapshot version + generation timestamp; HW6-7 survivorship made deterministic (B2) before the job is authoritative; context-as-of surfaced to the clinician.
13. **No end-to-end audit trail — RESOLVED (design) / PARKED (retention infra).** Correlation ID threaded route→job→projection→disclosure; each hop records who/member/scope-decision/data-class/outcome. **Tamper-evident retained storage + accounting-of-disclosures query interface PARKED to the audit-infra bundle** and named as a go-live gate.
14. **Local-only, no server CI = no reviewed immutable record — RESOLVED (as a hard gate).** Consent-widening (1b) and the production job path are not enabled in any real-data environment until server-side CI, PR review, and an immutable build are restored. "Local gating only" is treated as a hard gate for these increments, not an inconvenience.
15. **CMS-0057-F conformance deferred but shaped now — RESOLVED.** `ConsentDecisionResolver` output + redaction designed against US Core / CARIN / Da Vinci consent+provenance profiles now; mapping captured as a decision record even though endpoints ship in Iteration 10.
16. **RADV lineage on projected/derived data — RESOLVED (policy).** Any risk-adjustment-relevant element must carry auditable lineage to its source encounter/document (not merely "projected"); derived/projected categorizations may not feed risk/coding processes without it; HCC/ICD coding logic kept out of the care-delivery path until HW6-4 uses licensed validated CMS content.
17. **Clinician-facing plans depend on unbuilt correctness primitives — RESOLVED.** Clinician-facing care-plan output is labeled decision-support / non-authoritative and requires human verification until UCUM (HW6-5), survivorship (HW6-7), ConceptMap (HW6-3), and redaction (HW6-8) land; it must not drive unsupervised clinical action.
18. **CBO SDOH into HEDIS/NCQA equity measures, no data-quality control — RESOLVED (policy) / PARKED (Gravity validation).** Data-quality scoring + provenance on SDOH ingest added; CBO SDOH kept out of measure/stratification computation until source validity and Gravity modeling (HW6-6) are validated (**PARKED to the gated HW6-6 work**); SDOH lineage documented for NCQA.
19. **Stopgap window is itself a risk period — RESOLVED.** Tightened the plan's own sequencing: **Increment 1 real-data enablement requires B1 (revocation) and 1c (redaction)**; sandbox/mock order proceeds now, real-data widening does not until Part-2 redaction + revocation land.
20. **No threat model / DPIA / data-flow inventory — RESOLVED (as a gate) / PARKED (production of artifacts).** Data-flow inventory, ops/job threat model, and PIA/DPIA are required before real-data enablement and are named in the compliance bundle; **authoring is PARKED to that bundle** (needs privacy/security review owners), not PHASE NOW build.
21. **"Iteration 7 unknown" must not inherit a lighter control regime — RESOLVED.** Grounding precedes sizing; Iteration 7 inherits the same real-data gates (CI, review, PIA) uniformly.

**PARK summary (nothing dropped, each reasoned):** #5 at-rest encryption/retention, #6 credential hardening/rotation/rate-limit, #8 network-egress enforcement, #13 tamper-evident retained audit store, #18 Gravity validation, #20 artifact authoring — all PARKED because they require infrastructure, identity, network, or review capacity **not available in the sandbox**, and all are bound into the compliance/enablement gate bundle that blocks real-data go-live. No sandbox/mock build work is blocked by any parked item.

## Open questions for review/approval

1. **Directive model & purpose-of-use taxonomy (SME GB-3):** what is the authoritative shape of stored Part-2 consent directives, and the enumerated purpose-of-use values the resolver must recognize? Needed to finalize 1b.
2. **Whose consent governs an async-generated care plan** when the requesting principal differs from the eventual reader? Confirm the `{principal, member, purposeOfUse}` recorded at generation is the correct authorization anchor, or whether re-evaluation at read is required.
3. **Revocation SLA target** for B1 — what bounded latency is acceptable for revoked PHI to disappear from projections, job artifacts, outbox, DAG outputs, caches, and logs?
4. **Approval to hold real-data enablement** of Increments 1b/2/3 behind the full compliance bundle (server CI + review + audit + redaction + revocation + PIA) — confirm this gating is acceptable to the delivery timeline, or whether a narrower interim enablement scope is desired.
5. **Clinician "context unavailable" UX signal** (#11) and **decision-support / non-authoritative labeling** (#17) — clinical-safety owner sign-off on wording and on which surfaces may show non-authoritative care-plan output.
6. **ICD-10-CM data vendoring** (#20) — confirm the tabular hierarchy is (or will be) vendored in-repo before B2 sizing.
7. **Ownership assignment for the Iteration 7 grounding task** and for the parked infra/audit/PIA bundle items.

## Status

DRAFT — not implemented; for review/approval before a future phase.

---
*Generated by a coalition of agents (draft → adversarial critique → red-team → synthesis), grounded in the repo. DRAFT for review/approval — not implemented.*
