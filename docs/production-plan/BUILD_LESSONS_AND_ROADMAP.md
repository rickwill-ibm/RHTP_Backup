# Build lessons + sequenced roadmap (post Iterations 0-2)

Prepared 2026-08-22 after three completed build iterations (0 hardening, 1 foundation, 2 graph+SDE). Codebase: 670 tests green, tsc 0, ratchet intact, ~5,900 LOC net-new production + 8,773 LOC tests. This document (a) records build-phase lessons that change how the next iterations run, and (b) sequences the remaining work with per-iteration effort.

## Part A — Build lessons (apply before Iteration 3)

These are distinct from the planning-phase rules R1-R15. They come from what actually happened while building.

**L1 — Fakes are necessary, not sufficient; model the gap explicitly.** The outbox passed every pg-mem test but carried two real multi-writer Postgres bugs (sequence uniqueness, sweeper double-publish) that only adversarial reasoning caught. pg-mem does not model concurrency, constraints, or advisory locks; an in-memory graph fake does not model Cypher semantics. RULE: every component with a fake carries a short "fake fidelity ledger" naming what the fake does NOT model, and the Docker-guarded testcontainer spec is a REQUIRED CI gate for exactly those properties, not an optional extra. Never report a stateful component "done" on fake-green alone.

**L2 — Convergence waves earn their cost every time.** In all three iterations the convergence/adversarial pass found the material defect (blank-field match bug, outbox concurrency, seam-id collision), never the build waves. RULE: budget a convergence wave as first-class in every iteration, and point it specifically at cross-agent assumptions ("what did parallel agents assume about each other").

**L3 — Pre-allocate the namespace before fan-out.** Parallel agents cannot see each other's registrations; the SDE grabbed the `sde` seam id already owned by `sdResourceData`. RULE: the iteration context reserves seam ids, module paths, and event-type names up front, and agents claim from the reserved list rather than inventing. Zero-cost, removes a whole defect class.

**L4 — Concurrency correctness belongs in the DoD, not in convergence.** Carrying the outbox fix into Iteration 2 worked, but the fix should have been required by Iteration 1's definition of done. RULE: for any stateful/concurrent component, the DoD explicitly includes "correct under real-Postgres multi-writer semantics: unique constraints, atomic sequence, compare-and-set claim" as an authored testcontainer assertion.

**L5 — Track two progress numbers, never one.** "670 tests green" is real but many run against fakes; it must not imply live-proven. RULE: report (a) tests passing AND (b) count of components whose live testcontainer/integration spec has actually executed against real infra. Today that second number is 0 (no Docker in the build sandbox) - that is the honest maturity ceiling until CI runs them.

**L6 — The wave unit is right; keep it.** probe → 2-3 parallel build agents on disjoint trees → convergence → orchestrator authoritative gate → one tarball sync. This held for three iterations at ~600K-1M tokens and 60-90 min each. RULE: do not re-architect the unit; scale by adding domain waves, not by widening a single agent's scope.

**L7 — Templatize the repeatable unit before mass-producing it.** The next 16 record domains are the same shape (parse → normalize → tier → provenance → graph-map → test). We built the first three ad hoc. RULE: before the domain-coverage iterations, author ONE golden adapter template + checklist; each subsequent domain becomes a fill-in, which cuts tokens and guarantees uniformity.

**L8 — Never inline a disk sync between waves.** The bridge dropped roughly five times mid-run; R12's queue-and-flush absorbed it, but only because syncs were off the critical path. RULE: one sync per iteration boundary, always as a single tarball, never between waves.

Kept unchanged (worked well, do not touch): R1 artifact-existence verification, R15 orchestrator authoritative gate, the DRY convergence loop, prose-file agent outputs, tarball sync.

## Part B — Sequenced roadmap (Iterations 3-10)

Effort grammar: waves = parallel build agents; tokens/wall-clock from Iteration 0-2 actuals (~150-200K tokens per build agent, convergence ~1.5x, plus orchestrator gate); S/M/L = build complexity. All run the L1-L8-updated wave unit. Live-infra items are CI-pending by design (no Docker in build sandbox).

### Iteration 3 — Agent runtime (G4) + IDOR role model. HIGHEST LEVERAGE.
Why first: the SDE decides dispositions but nothing executes them; this closes the decide→act loop. Also closes the 2 deferred IDOR routes via the session-principal role model.
- Waves: A) minimal journey-lane runtime (Temporal-class interface + in-memory fake, CI-pending real Temporal) + agent manifest registry; B) the three first agents (outreach, referral-coordination, PA-documentation) HITL via the existing work queue, escalation-as-data; C) session-principal role model closing evidence + financial-clearance IDOR, convergence.
- Effort: 3 waves, ~700-900K tokens, ~75 min. Size: L.
- Exit: an SDE-approved touchpoint flows to an agent, proposes, waits at the work-queue human gate; both IDOR routes fixed; DRY.

### Iteration 4 — Domain template + clinical-core domains (record 3/20 → 7/20).
- Waves: A) the golden adapter+mapping template (L7) + medications and dispense adapters; B) labs/vitals + allergies adapters; C) procedures adapter + convergence. Each: pipeline adapter, graph mapping, C9 tier, provenance, tests.
- Effort: 3 waves, ~600-800K tokens, ~70 min. Size: M (template is the one-time L cost).
- Exit: 4 new domains land on the record via real pipeline, project to the graph, mock toggle off renders them; DRY.

### Iteration 5 — Care-team + workflow domains (record 7/20 → 11/20).
- Domains: care team/attribution, goals/tasks, referrals/service requests, immunizations.
- Waves: A) care team + goals/tasks; B) referrals + immunizations; C) convergence + a cross-domain lens test.
- Effort: 3 waves, ~600-750K tokens, ~65 min. Size: M.
- Exit: 4 domains; the care-team lens now reads real projected data; DRY.

### Iteration 6 — Sensitive + financial domains (record 11/20 → 17/20). HIGH CARE.
- Domains: behavioral health + SUD (42 CFR Part 2 segmentation end-to-end), claims/financial (golden-thread chain), PA lifecycle, assessments/member-reported, caregiver/household, documents.
- Waves: A) BH/SUD with Part 2 segmentation proven pipeline→graph→lens (the restricted-node path gets its real workload) + claims/financial; B) PA lifecycle + assessments + caregiver + documents; C) convergence + a Part 2 compliance test suite (break-glass, re-disclosure scrubbing — the UC-64/UC-17 corpus gaps).
- Effort: 3 waves, ~750-900K tokens, ~80 min. Size: L (Part 2 correctness is the risk).
- Exit: record at 17/20 (remaining 3 are gated on live feeds GB-6); Part 2 enforced end-to-end; DRY.

### Iteration 7 — Adequacy dashboards (O-3/4/5) + provider integration (O-6).
Independent of the domain track; could interleave.
- Waves: A) the four providernet_analytics dashboards ported onto shared view-models (not per-screen math); B) geospatial heatmap + one-click compliance report (O-5) from the same view-models + O-6 shared provider model linking gaps↔referrals↔PA; C) convergence.
- Effort: 3 waves, ~600-750K tokens, ~65 min. Size: M.
- Exit: adequacy experience complete; screen and audit report cannot disagree; DRY.

### Iteration 8A — Terminology services + value-set governance + external identity (EMPI). NEW, promoted from stubs.
Rationale: Iteration 4 landed the SEAMS and STUBS for these (internal EMPI resolver + PIX/PDQ/PIXm/PDQm external stubs; the terminology/semantic-validation stage-4 gate; the value-set registry facility seeded across 6 classification families). This iteration turns those stubs into the real governed sub-systems the owner specified. It is scheduled here because the domain-coverage track (I4-I6) exercises the terminology gate hardest, so its real content is most valuable once the sensitive/behavioral/social domains (I6) are in.

Scope has four pillars:

1. **External identity resolution via healthcare protocols.** Make the identity resolver configurable to an external EMPI/MPI, not only the internal match engine. Real adapters behind the Iteration-4 stubs: IHE **PIX** (patient identifier cross-reference) and **PDQ** (patient demographics query) over HL7v2, and **PIXm** ($ihe-pix) and **PDQm** (Patient search) over FHIR. Config carries endpoint, assigning-authority OID, sending/receiving app + facility (v2) or FHIR base + auth (FHIR). The external enterprise/global id becomes the anchored member id; the possible-match HELD semantics still apply to external results; survivorship (DP-7) reconciles internal-vs-external. Internal engine remains the default and the offline fallback.
   - Waves: A) PIX/PDQ HL7v2 adapter + connectathon-style test harness against a reference MPI; B) PIXm/PDQm FHIR adapter + the internal-vs-external reconciliation/survivorship; C) convergence + a mixed-source identity conformance suite. Live MPI is CI/integration-pending.

2. **Terminology server integration (real semantic validation).** Replace the seed-allowlist stub with real terminology operations: FHIR `$validate-code`, `$expand`, `$translate` against a terminology server (HAPI terminology, Ontoserver-class, or VSAC SVS/FHIR). Code systems: RxNorm, LOINC, SNOMED-CT, ICD-10-CM, CPT/HCPCS, CVX, UCUM. The stage-4 semantic gate then validates against live value sets, not a hand-seeded list.

3. **Classification/grouping engines (HCC and beyond).** HCC is one of several. Real classifiers/crosswalks for the risk-adjustment and grouping families: CMS-HCC, RxHCC, HHS-HCC, CDPS (risk); plus the pathway for behavioral (DSM-5-TR / F-code grouping, DC:0-5, LOCUS/CALOCUS acuity) and social (Gravity SDOH value sets, ICD-10 Z-code SDOH grouping, AHC-HRSN + PRAPARE instrument scoring) classification. Each is a versioned, source-stewarded asset, not a constant.

4. **Value-set governance console (the configuration utility the owner specified).** The Iteration-4 registry facility becomes a full governed sub-system with TWO access modes over ONE engine:
   - **Admin-as-code**: config/API path for engineers (declarative asset definitions, CI-driven imports from VSAC/CMS/Gravity/NLM feeds, version pinning in source).
   - **Specialist UI**: a workflow surface for a terminology/coding specialist (no code) to review, stage, and adopt new value-set/classification versions.
   - **Workflow gates with approvals**: a staged lifecycle (draft → proposed → approved → active → superseded → retired) with an explicit human approval gate before a version goes active, reusing the platform's HITL/work-queue governance pattern (no second inbox).
   - **Full versioning + traceability**: every asset version carries steward, effective/expiration dates, source provenance, and an immutable change history (who approved which version when, on what basis) — the same append-only/audit discipline as the evidence ledger.
   - **Version replay**: the ability to re-run validation/classification of records against a CHOSEN historical value-set version (not just the current one), so a coding decision can be reproduced as-of its date and the impact of a version change can be previewed before adoption — the terminology twin of the graph's rebuild-from-replay.
   - Waves: A) the governance engine (lifecycle state machine + approval gates + immutable version history over the registry) with admin-as-code; B) the specialist UI surface (staging, diff between versions, approve/adopt) behind the BFF, plus version-replay of validation against a selected version; C) real feed importers (VSAC/CMS/Gravity stubs → live) + convergence.

- Effort: this is the largest single item on the roadmap — effectively 3 sub-iterations (external identity; terminology + classification; governance console), ~2.2-2.8M tokens total, best run as three back-to-back iterations (8A-i, 8A-ii, 8A-iii). Size: XL. External dependencies: a terminology server + VSAC/CMS/Gravity feed access; a reference MPI for PIX/PDQ conformance.
- Exit: identity resolvable via real external EMPI (PIX/PDQ/PIXm/PDQm) with internal fallback; semantic validation against a live terminology server; HCC + behavioral + social classification real and versioned; the value-set governance console live with dual-mode access, approval gates, full traceability, and version replay; DRY.

### Iteration 8 — Care-plan depth (F1-F9) + clinical criteria + SME loop prep.
- Waves: A) contraindication input model + real drug-interaction/guideline criteria (replacing keyword typing) + remove hardcoded financial entanglement; B) O-7 criteria content from the Aetna/UHC policy sources, all flagged not-SME-reviewed; C) convergence + the DP-4 oracle re-run with real clinical fixtures, SME sign-off packet prepared (GB-3 handoff).
- Effort: 3 waves, ~700-850K tokens, ~75 min. Size: L. Depends on: clinical SME availability for GB-3 (external).
- Exit: care plan clinically defensible pending SME sign-off; F1-F9 closed; DRY.

### Iteration 9 — Execution substrate + deployment configurator (X1/X3).
The real infra the fakes stood in for.
- Waves: A) the three lanes on real tech (Kafka-API broker adapter, Temporal deployment, worker pool) wired behind the interfaces already built, with the testcontainer specs from every prior iteration now runnable; B) Terraform modules per cloud (AWS + Azure), deploy.config.yaml driving Postgres-vs-Neo4j and managed-vs-self, the graph-tier and FHIR-store seams; C) convergence + a portability conformance run (no proprietary control-plane leak).
- Effort: 3 waves, ~800K-1M tokens, ~85 min. Size: L. Needs: your cloud accounts for real IaC apply (or dry-run/plan-only here).
- Exit: one config change deploys the stack; all deferred testcontainer specs now executable in CI; DRY.

### Iteration 10 — Certification pass (GB-7, conformance, load). GATED, LAST.
Cannot run earlier honestly.
- Waves: A) GB-7 security review (pen-test surface, secrets, PHI audit) + the live consent/Part 2 audit-evidence catalog; B) conformance runs (Inferno Da Vinci CRD/DTR/PAS, US Core, CARIN, X12) against the live backbone (GB-4) + full load gates (1K/5K/10K per DP-5 via k6); C) certification report + honesty-ledger final update.
- Effort: 3 waves + external runs, ~700K tokens of orchestration, wall-clock gated on infra + review calendars. Size: L.
- Exit: production-ready with evidence; the honesty ledger shows Tier-A across the board.

## Part C — Totals and critical path (updated)

Status as of this update: Iterations 0-4 are COMPLETE and DRY (hardening; foundation; graph + SDE; agent runtime + IDOR; domain template + 4 clinical-core domains + EMPI resolver + external-identity/terminology/value-set STUBS). Record coverage 7/20. 850 tests green.

Remaining: Iterations 5, 6, 7, 8A (three sub-iterations), 9, 10 — effectively ten more iteration-units. Iteration 8A (terminology + external identity + value-set governance console) is the largest, promoted from Iteration-4 stubs at the owner's direction; it is XL and best run as three back-to-back sub-iterations. Revised total remaining build-sandbox effort: roughly 7-9M tokens across sessions.

Genuine external dependencies, not solvable by more building: clinical SME time (GB-3, I8/care-plan); a terminology server + VSAC/CMS/Gravity feed access and a reference MPI for PIX/PDQ conformance (I8A); cloud accounts (I9); live backbone stand-up (GB-4) + conformance/pen-test calendars (I10). Live-infra proof for everything built so far is CI-pending on Docker, which the build sandbox lacks.

Owner directives folded into this roadmap (traceability):
- Neo4j co-equal with Postgres (v12.3 / OD-002) — DONE in Iteration 2.
- Real EMPI matching (litmus test) — internal engine wired in Iteration 4; external EMPI via PIX/PDQ/PIXm/PDQm stubbed in I4, real in I8A pillar 1.
- Semantic/terminology validation (RxNorm/LOINC/HCC/etc.) — stage-4 gate + stub in I4; real terminology server + classification in I8A pillars 2-3.
- Value-set currency/versioning across clinical + risk + quality + behavioral + social + privacy families — registry facility stubbed in I4 (6 families, 26 assets); full governance console (dual-mode admin-code + specialist-UI, approval workflow gates, versioning + traceability, version replay) in I8A pillar 4.

Sequencing note: I8A pillar-2/3 (real terminology + classification content) is most valuable AFTER Iteration 6 lands the behavioral and social domains, since those exercise the widest value-set families; pillar-1 (external identity) and pillar-4 (governance console) can start earlier if a terminology specialist or reference MPI becomes available.

Recommended NEXT to run: Iteration 5 (care-team + workflow domains) — it continues the proven, repeatable domain-template track toward record completeness, the highest-throughput progress available. Alternatively jump to I8A pillar-4 (value-set governance console) if terminology governance is the priority, since its stub foundation is freshly in place.
