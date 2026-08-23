# Deployment-Hardening Plan (adversarial review of Iterations 1-11)

Status: FOR APPROVAL. Produced by a 10-lens red-team panel (v1.4 framework, tree-of-thought
hypothesis generation) reading the real codebase, plus the open register backlog. Findings
only - no code changed. Detail per lens in `verification/hardening/{crud,audit,reconciliation,
reprocessing,ha-scale,testing,whole-person-care, security,ai-governance,financial-integrity}.md`.
The last three (security & multi-tenancy, AI-governance, financial/actuarial integrity) were
added after an external-expert review of the plan itself found them missing - they are the
highest-severity lenses. See the CONSOLIDATED SEQUENCE at the end (it supersedes the original 6).

## The dominant finding: UNWIRED REALNESS

This is NOT fail-open dishonesty - the substrate fails closed and is honestly labeled. The
deployment blocker is that production-shaped subsystems are BUILT AND TESTED AGAINST FAKES
but have NO PRODUCTION CALLER. The demo stays green because it runs on hand-authored
artifacts (hardcoded `patient-001`/Maria, an 804-line `wholePersonGraphData.ts`) in PARALLEL
to the real code. Examples the panel independently surfaced:
- the outbox has no live consumer wiring it to the graph projector (REC-01);
- `OutboxSweeper.sweep` and the reconciliation jobs are invoked by nothing outside tests (REC-03, HS-02);
- the holistic-context engine returns an empty context for every member except Maria (WPC-01);
- the real projected graph + lenses are wired to ZERO app routes; the UI renders authored data (WPC-02);
- merge/unmerge, right-to-delete, replay, held-identity adjudication all exist in lib with no operational surface (CRUD-03/05, RP-02/05, R1-DL1).

Hardening is therefore mostly WIRING + durability + the compliance/CRUD/care depth a real
payer operation needs - not green-field building. That is good news: the hard logic exists.

## Severity rollup (162 findings across 10 lenses)
- Critical: ~28 · High: ~76 · Med: ~58.
- The 3 added lenses alone: security 20 (2 Crit - no tenant/LOB isolation; BOLA on clinical FHIR
  reads), AI-governance 16 (3 Crit - HITL auto-approves on SLA timeout; autonomy-tier flip on
  coverage actions; zero fairness/equity testing), financial 17 (6 Crit - no MEAT/source linkage
  so every HCC is a RADV takeback; no encounter-submission pipeline so no risk revenue is earned;
  TCOC/PMPM/MLR are hardcoded demo strings; unsupported HCC cannot be retracted pre-submission).
- Plus the open register backlog: F2-b Part 2 residuals (R1-I7-2/3/4), R1-DL1 held-identity,
  R1-9-3/4/5 (pool/legal-hold-durability/migration-lock), terminology residuals (subsumption,
  live maps, HCC content), R1-8Ai-2 tiebreak, and the standing live-infra/licensing/accreditation ceiling (NS-05).

## GOVERNING CONSTRAINTS (owner-set; apply to EVERY iteration below)
These are non-negotiable and override any finding's suggested fix that would violate them:
1. **Seam-first, config-switched.** Every hardening capability is added as the PRODUCTION
   disposition of a `dataMode` seam (modes: mock | seeded | production; default `mock`).
   Switching mock->production is a CONFIG change (env / deploy.config.yaml), never code.
   Nothing is removed; the real path is added ALONGSIDE the demo path.
2. **Demo preserved AT ALL COSTS.** The MOCK disposition of every seam must reproduce the
   CURRENT demo behavior EXACTLY. No demonstration capability may regress. Enforced
   mechanically by a new DEMO-PRESERVATION golden-snapshot suite (see HW0) that gates every
   iteration - a demo screen/flow/data change fails the gate like a broken build.
3. **Front-end-only + mock install stays a first-class option.** The demo must install and run
   with ZERO backend (no Postgres / Neo4j / Docker / external feeds). Durable-store and
   external-feed work (HW1-HW4) must NOT make the frontend-only mock demo require infra.
4. **HEDIS/Stars measures are EXTERNAL.** This platform does not compute measures; it INGESTS
   an external measures system's feed into FHIR Measure / MeasureReport / Gaps-in-Care (DEQM)
   resources and derives care-gap + Stars views from them. Mock disposition = today's authored
   demo gaps (preserved); production disposition = the external feed. (Revises WPC-08.)

## The iterative plan (sequenced; each is a full framework wave with its own red-team + E13)

### HW0 / Iteration 12 - Demo-preservation harness + installer profiles  [SAFETY NET - must be first]
Before ANY wiring: capture the current demo as golden snapshots (the key screens, flows, and
the mock data/graph they render) and add a DEMO-PRESERVATION test suite + an E-gate so every
later iteration is proven not to regress the demo. Confirm/lock the installer's
FRONTEND-ONLY + MOCK profile (installs the Next.js app in mock mode, zero backend) as a
supported, tested path. Establish the per-capability seam scaffolding pattern (mock disposition
= existing demo behavior) that HW1-HW5 all follow. Why first: constraint #2 is unenforceable
without this net; every subsequent iteration gates against it.

### HW1 / Iteration 13 - Durable state + HA foundation  [unblocks multi-instance deploy]
Move every in-memory store to the substrate (governance, legal-hold [R1-9-4], held-review,
session); WIRE the outbox->projector consumer with offset/checkpoint (REC-01) and SCHEDULE the
outbox sweep + reconciliation jobs (REC-03, HS-02); connection-pool sizing + a single-bootstrap
singleton (HS-04, R1-9-3); timeouts + retries + circuit-breakers on every external seam
(HS-03); readiness = real backend LIVENESS not config-presence (HS-06); member-ordering across
instances (HS-01); migration advisory-lock (R1-9-5).
Closes: HS-01/02/03/04/06, REC-01/03, R1-9-3/4/5. Why first: nothing is safe multi-instance until this holds.

### HW2 / Iteration 14 - Audit + disclosure integrity  [compliance go-live blocker]
Unify the audit spine INTO the durable tamper-evident ledger (AUD-01); real actor identity,
not `'session-user'` (AUD-02); PERSIST + TIME-BOX Part 2 / break-glass audit (R1-I7-2/3,
AUD-05/06); audit every mutating / admin / EMPI-merge / purge / PA action with before-after
(AUD-07/08/09); accounting-of-disclosures + read-audit + RADV/OCR export (AUD-10); retention
enforcement. Closes: the audit lens + F2-b audit residuals. Why second: audit gaps block a payer go-live.

### HW3 / Iteration 15 - CRUD lifecycle + correction/void + re-processing  [day-2 operations]
Add UPDATE/PATCH/DELETE + entered-in-error/void/amendment across records (CRUD-02); a real
consent-directive CRUD store (CRUD-01); care-plan persistence + versioning + status lifecycle
(CRUD-04); operational right-to-delete/purge surface (CRUD-03); EMPI merge/unmerge steward
surface + held-identity adjudication with candidate set + apply (CRUD-05, R1-DL1). Re-processing:
content-hash idempotency so a CORRECTION resend re-projects (RP-01); raw-payload retention for
dead-letter re-drive (RP-02); effective-time / bitemporal projection so a late older record does
not clobber newer state (RP-03); replay-from-log wired + re-derive-after-a-mapping-fix (RP-04/05);
834 full-file vs change-file reconciliation + implicit-term (REC-06). Why third: corrections, voids, and reprocessing are non-optional operationally.

### HW4 / Iteration 16 - Whole-person-care functional depth  [the value proposition]
ALL behind the dataMode seam: mock disposition = TODAY's authored demo (Maria, the authored
graph, the authored gaps) preserved EXACTLY; production disposition = the real path. Nothing
demonstrable is removed. Scope:
- Holistic context as a SEAM (WPC-01/02/04): mock -> the current authored context (demo intact);
  production -> aggregate the real graph + 20 domains. The UI reads one interface; the config
  chooses the source. De-hardcoding Maria = adding the production branch, NOT deleting the mock.
- MEASURES ARE EXTERNAL (revises WPC-08): add a Measure / MeasureReport / Gaps-in-Care (Da Vinci
  DEQM) FHIR INGESTION adapter behind a `measures` seam. This platform does NOT compute measures.
  mock -> today's authored HEDIS/STARS/MIPS gaps (gap-001.. preserved); production -> load the
  external measures system's Measure/MeasureReport/Gaps feed and derive care-gap + Stars views
  FROM the loaded resources. Care-gap CLOSURE writes back per DEQM, still seam-gated.
- Barrier / keystone analytics + risk stratification over the graph (WPC-04/07), LIVING care plan
  tracked to outcome + goal/referral loop-closure (WPC-05), SDOH capture->intervention->tracked
  (WPC-06), agent orchestration on RESOLVED data with real effects (WPC-13) - each a seam whose
  mock disposition is the current demo behavior and whose production disposition is the real logic.
Why fourth: depends on HW1 substrate + HW3 CRUD being real; and every item must pass the HW0
demo-preservation gate. This is the product depth - added without touching the demo.

### HW5 / Iteration 17 - Test-hardening + defect-weeding  [threads through all; net-new harnesses here]
Wire contract/Inferno/Newman into CI (T-01); real-Postgres testcontainer concurrency tests to
prove NS-04 races on the real engine (T-02); expand E13 mutation to the critical modules -
part2Basis, matchEngine, eligibility834, consent gate (T-03); execute the D4/DP-5 load/soak
harness (T-04); property/fuzz on the Part 2 SUD segmenter + engines + X12/FHIR parsers (T-05);
chaos/failure-injection (backend down, partial batch, poison message, clock skew); negative /
authz / PHI-safety boundary tests. Note: each HW iteration also ADDS its own tests; HW5 is the
net-new test INFRASTRUCTURE + the retroactive property/contract/load coverage.

### HW6 / backlog cleanup (fold into the above or a final pass)
Terminology residuals (SNOMED subsumption / ICD category rollup, reverse+transitive translate,
real HCC family content + V28 set, UCUM grammar parser, Gravity SDOH depth); survivorship
source-order tiebreak already noted (R1-8Ai-2); minimum-necessary field-level Part 2 (R1-I7-4);
consent revocation re-restriction propagation. These are MED/policy-fidelity, not blockers.

## Sequencing rationale (tree-of-thought)
Ordered by DEPENDENCY and DEPLOYMENT-RISK, not severity alone: HW1 first because multi-instance
data-loss/SPOF makes everything else moot; HW2 next because audit is a hard compliance gate;
HW3 before HW4 because whole-person-care depth needs real CRUD + reprocessing underneath it;
HW5 threads throughout but owns the net-new test harnesses. HW1-HW3 are the true
"robust-for-deployment" core; HW4 is value-depth; HW5 is confidence.

## What remains beyond code (unchanged, honest)
Live infrastructure cutover, licensed terminology content, and external accreditation
(Inferno/Touchstone/IHE) - the NS-05 ceiling. HW5 wires the suites so they RUN the moment infra exists.

---

## CONSOLIDATED SEQUENCE (10 lenses; SUPERSEDES the original 6) - FOR APPROVAL

All iterations carry the four GOVERNING CONSTRAINTS (seam-first / demo-preserved-at-all-costs /
frontend-only-mock-install / external-measures). Ordered by dependency + go-live risk, not
severity alone. Grouped into phases so a pilot can start after Phase 1.

### PHASE 1 - Go-live blockers (nothing pilots at a health plan until these hold)
- **HW0 / I12 - Demo-preservation harness + installer profiles + demo<->prod PARITY check.**
  Golden-snapshot the demo as the gate; lock the frontend-only+mock install; add a parity check
  so each seam's mock output stays a structurally-honest representation of its production output.
- **HW-SEC / I13 - Security & multi-tenancy.**  [security.md, 20 findings, 2 Crit]
  Define the TENANT/PLAN/LOB boundary (the core new data-model concept) and enforce it in authz,
  identity, graph, stores, and the BFF; fix BOLA on clinical FHIR reads (per-member authz on
  Coverage/Condition/etc.); authenticate config-status; secrets management + rotation; rate
  limiting/quotas; security headers/CSP/CSRF; SBOM + dependency posture; member IAL2 for Patient
  Access. Precedes HW1 so the durable stores are built tenant-aware (avoids retrofit rework).
- **HW1 / I14 - Durable state + HA + OBSERVABILITY + DR.**  [ha-scale.md, reconciliation.md]
  In-memory stores -> substrate (TENANT-SCOPED); wire outbox->projector + scheduled sweep/recon;
  pool sizing + circuit-breakers + timeouts; readiness=liveness; migration lock. PLUS observability
  as a workstream (metrics/tracing/correlation/SLO/alerting/DLQ-inspection) and DR (RTO/RPO +
  a tested restore). Mock keeps running with ZERO backend.
- **HW2 / I15 - Audit + disclosure integrity + compliance breadth.**  [audit.md]
  Unify audit into the durable tamper-evident ledger; real actor identity; persist + time-box
  Part 2/break-glass; audit every mutating/admin/EMPI/purge/PA action; accounting-of-disclosures +
  read-audit + RADV/OCR export; retention enforcement. Name the compliance posture (Info Blocking,
  purpose-of-use end-to-end).
- **HW-AI / I16 - AI governance.**  [ai-governance.md, 16 findings, 3 Crit]
  A TIER-INDEPENDENT INVARIANT at the propose/decide seam: no coverage-affecting / adverse action
  resolves except by an explicit qualified-human decision (kills the SLA-timeout auto-approve and
  the autonomy-tier-flip); every AI-influenced decision records inputs + fired-rule/version +
  member-facing reason + appeal artifact; a pre-deploy EVAL GATE for decision behavior; fairness /
  disparate-impact monitoring (the equity claim); model/prompt versioning + drift + rollback.
  Precedes HW4 (where agents act on real data).

### PHASE 2 - Operational + financial correctness (before real member/claims volume)
- **HW3 / I17 - CRUD lifecycle + correction/void + re-processing + measures-feed robustness.**
  [crud.md, reprocessing.md] PUT/PATCH/DELETE + entered-in-error/void; consent-directive store;
  care-plan versioning; right-to-delete surface; EMPI merge + held-identity adjudication;
  content-hash idempotency (corrections re-project); raw-payload retention for dead-letter re-drive;
  effective-time projection; replay-from-log wired; 834 reconciliation. Measures-feed robustness
  (staleness/completeness/fallback) for the external feed introduced in HW4.
- **HW-FIN / I18 - Financial / actuarial integrity.**  [financial-integrity.md, 17 findings, 6 Crit]
  MEAT/source-document linkage on every captured HCC (RADV-defensible) + a diagnosis void/retract
  flow before submission; an ENCOUNTER-SUBMISSION pipeline (EDPS/RAPS/Medicaid) with 999/277CA/
  MAO-002 acceptance-rejection reconciliation + resubmission; COB order-of-benefits; duplicate/
  overpayment + FWA detection; TCOC/PMPM/MLR derived from ADJUDICATED dollars (mock keeps the demo
  numbers). All seam-gated; mock = demo, production = real submission.

### PHASE 3 - Value depth + confidence
- **HW4 / I19 - Whole-person-care depth + external MEASURE/MeasureReport/DEQM ingestion.**
  Holistic context, barrier/keystone analytics, living care plan, SDOH, agent orchestration - each
  a seam (mock=demo, production=real graph/20-domains). Measures INGESTED from the external system,
  not computed. Depends on HW1 substrate + HW3 CRUD + HW-AI governance.
- **HW5 / I20 - Test-hardening + defect-weeding + NAME the non-code go-live gates.**
  [testing.md] Contract/Inferno/Newman in CI; real-Postgres testcontainer concurrency; expand E13
  mutation to critical modules; execute the D4 load/soak; property/fuzz + chaos/failure-injection.
  Plus NAME (they have long lead times, they are process not code): third-party PEN-TEST, SOC 2
  Type II / HITRUST, a tested DR drill, a threat model + PIA, and the accreditation suites.
- **HW6 / I21 - Backlog / policy-fidelity cleanup.** Terminology residuals, min-necessary
  field-level Part 2, consent-revocation propagation, survivorship tiebreak.

## Recommendation
Phase 1 (HW0, HW-SEC, HW1, HW2, HW-AI) is the "safe-to-pilot" core - it closes the tenancy,
security, audit, HA, and AI-accountability blockers. Phase 2 makes money and operations correct
before real volume. Phase 3 adds the value depth and the confidence gates. I recommend approving
Phase 1 to start (HW0 first, always), and re-confirming Phase 2/3 scope after Phase 1 lands.
