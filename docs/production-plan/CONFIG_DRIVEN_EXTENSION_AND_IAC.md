# Config-Driven Extension + Terraform/IaC Automation Completeness — Hardening / Execution Plan (DRAFT FOR REVIEW)

## Context & current state

**Config/deploy machinery.**
- `src/lib/deploy/schema.ts` — declares `REQUIRED_ENV_KEYS` per deploy posture (development `[]`, staging `[SESSION_SECRET]` — *pending grounding, see Open Questions*, production `[SESSION_SECRET + 4 WSO2 OAuth keys]`) and a **pure, side-effect-free map** from each fail-closed-stub seam → the backend-connection env key that configures its real production backend.
- `src/lib/deploy/preflight.ts` — startup readiness check; fails a production deploy when a required key is missing/empty OR when a seam whose effective `dataMode` is `'production'` has an unset connection key, naming the exact seam+key ahead of any request. **This is a presence gate, not a reachability gate** (see Adversarial #3 / Red-team #2).
- `src/lib/deploy/index.ts` — surface exists; internals **unknown — needs grounding**.

**Seam registry.**
- `dataMode.ts` — registry of ~28 seams (`consent, graph, sde, wpcRecord, carePlan, evidence, fhirStore, terminology, identity, profileValidation, idempotencyStore, deadLetterStore, providerIdentity, crossReference, valueSetGovernanceStore, tenancy, measures, clock, …`), each `mock|seeded|production`. Resolution order: session > env-seam (`DATA_MODE_<SEAM>`) > env-global (`DATA_MODE`) > legacy > default (`mock`). Many marked `wired: … fail-closed until wired`.
- `seamDispositions.ts` — classifies each seam's disposition.
- **`NEXT_PUBLIC_USE_MOCK_DATA`** is a build-time client flag that is **not** in the server-side resolution order above — a discrepancy this plan must close before relying on it (Adversarial #9).

**Existing extension patterns (engine unchanged, adapter per source).**
- Pipeline domain adapters — `src/lib/pipeline/adapters/*`.
- Policy ingestion adapters — `src/lib/policy/ingest/*` with `registerAdapter` / `ingestLibrary`.
- Graph mapping specs — `src/lib/graph/mapping/*` per-domain.
- Jobs registry — `src/lib/jobs/registry`.

Adding a capability today = new code (seam impl + a `dataMode` seam id + a `schema.ts` entry + an adapter/mapping spec) **plus** env wiring, hand-synchronized across three files.

**Infra today.** `PA-Standalone-SmartApp/infra/docker-compose.yml` + seed scripts (HAPI FHIR etc.); `install/install.sh`. **No Terraform / IaC.** The `schema.ts` seam→connection-key map is effectively a machine-readable description of what a real deployment must provision — but nothing consumes it for provisioning.

**Regulatory frame (this is a US healthcare-payer system).** The plan is gated as a payer would gate it: 42 CFR Part 2 (SUD consent), HIPAA (minimum-necessary, BAA, encryption), CMS-0057-F (PA decision timelines, Provider Access & Payer-to-Payer exchange, patient opt-out), RADV / HEDIS-NCQA (no synthetic data in regulated submissions). These reframe "fail-closed" from a slogan into a set of axis-specific, emit-time, per-resolution invariants (see Red-team findings).

**Invariants to preserve.** *Mock* demo (not seeded) stays green and zero-infra (`npm run dev`, mock flag); production fails closed **on the correct axis**; determinism is a property of the **mock/seeded** posture only; every change is behind a seam, gated by tests + E13 test-link ratchet + E14 wired-path ratchet + size ratchet.

## Approaches considered (tree-of-thought)

The charge has two coupled halves: **(A) declarative extension registry** and **(B) IaC layer**.

### Half A — make extensions declarative
- **A1. Central manifest, generated shims.** One declarative registry lists every extension slot and registered source; `dataMode.ts` / `schema.ts` / `seamDispositions.ts` become projections (or the manifest is derived + consistency-checked). *Pros:* one source of truth; drift becomes a build error; exact input an IaC generator needs. *Cons:* codegen/consistency step; over-centralization; migration must preserve the pure `schema.ts` map.
- **A2. Keep three files, add a conformance test that cross-checks them.** *Pros:* minimal, lands in one increment, no codegen, directly ratchetable. *Cons:* doesn't reduce edit sites; nothing new for IaC to consume.
- **A3. Plugin-directory auto-discovery.** *Pros:* true drop-in. *Cons:* auto-discovery fights determinism, the size ratchet, and fail-closed (a half-present plugin must fail closed, not silently no-op). **Rejected.**

### Half B — the IaC tool
- **B1. Terraform.** *Pros:* mature state/drift, huge provider ecosystem, plan/apply maps onto "config change then verify," broad payer-infra SME familiarity. *Cons:* HCL is a second language; state/backends to operate; **WSO2 provider coverage unknown — needs grounding**.
- **B2. Pulumi.** *Pros:* provision in TypeScript; the seam manifest imports directly. *Cons:* smaller payer-ops mindshare; couples infra lifecycle to the app's TS build. (Reasoning reconciled with A1 below — Adversarial #16b.)
- **B3. Helm / Kustomize.** Provisions only *inside* a cluster — not the cluster, managed DBs, secrets, or the FHIR backend. **Partial only**; nests under Terraform where the runtime is Kubernetes.

## Recommended approach

**Half A → A1 (central manifest as projection), landed via A2 first.** Start with the A2 conformance test (cheap, ratchetable, catches drift today plus the *semantic* policy checks from Red-team #22), then evolve toward A1 by making the manifest a derived, checked artifact — **with a small authored extension-registration section introduced in Phase 2** (resolving the Phase-2 circularity, Adversarial #6). A3 auto-discovery stays rejected.

**Half B → B1 Terraform, with B3 nested under it for the in-cluster layer.** Pulumi is rejected for infra *lifecycle* coupling to the app runtime (a blast-radius concern), which is a different axis from A1 importing a static TS manifest at *generation* time; the reasoning is now consistent (Adversarial #16b): we accept build-time data coupling, not runtime-lifecycle coupling.

**The core mechanism — restated correctly.** `schema.ts` seam→key map → a generator projects it into Terraform module inputs → `terraform apply` (in a controlled pipeline, never a laptop) provisions the backend → **non-secret outputs (endpoints) flow to env; secret outputs go to the secrets manager as handles, never as plain TF outputs** (Adversarial #2, Red-team #4) → `preflight.ts` verifies key *presence* → a **separate, explicitly-scoped readiness probe** verifies *reachability + identity* before "ready" (Adversarial #3, Red-team #2). The map drives provisioning and presence-checking; it does **not** by itself validate reachability, so "the map is the contract" is downgraded to "the map is the shared schema; two distinct gates enforce presence and reachability" (Adversarial #16a).

**Emit-time and per-resolution enforcement (the highest-leverage addition).** Disposition of security/regulated seams is an **enforced, audited, production-pinned invariant checked at every seam resolution and at every regulated emit** — not only at boot. This single change is what prevents the flagship demo from being a Part-2/HIPAA/RADV breach (Adversarial #1, Red-team #1/#5/#7).

## Phased execution plan

Gates: **E13** = test-link ratchet, **E14** = wired-path ratchet (against a **local compose/stub fixture**, never real cloud — Adversarial #11), **size** = size ratchet, **unit** = unit/integration tests. Per-phase, only the gates that *genuinely apply* are listed (Adversarial #16c); a `terraform validate` CI job is infra tooling, not a unit test and not E13-linkable.

### Phase 0 — Seam/schema/disposition conformance + semantic policy test (A2)
- **Goal:** the three seam sources-of-truth provably agree; *and* security/regulated seams are provably safe-by-policy, not merely consistent.
- **Mechanism / seam:** a pure test reading `dataMode.ts`, `schema.ts`, `seamDispositions.ts`. Coverage assertions **exclude an explicit "production-without-external-backend" (in-process) disposition** (e.g. `profileValidation`, `crossReference`, `clock`) so pure-logic seams aren't asserted to need a connection key, and **separate `REQUIRED_ENV_KEYS` (always-on) from per-seam conditional keys** (Adversarial #7). Semantic layer (Red-team #22): in prod posture every security/regulated seam MUST be production; no security seam may include `mock` in its allowed-prod set; `clock` MUST be production (Red-team #20).
- **Fail-closed behavior:** test failure blocks merge; no runtime change, so production still fails closed.
- **Tests + gates:** conformance + policy tests (unit); E13; size (test-only).
- **Mock-demo-intact:** no runtime code touched; mock path byte-for-byte unchanged.
- **Dependencies:** the security/regulated seam classification (SME sign-off).

### Phase 1 — Derive a read-only `platform.manifest` projection
- **Goal:** one machine-readable artifact describing every extension slot (seam id, disposition, connection key, adapter kind), plus a **cross-seam coupling map** (below) — the input IaC consumes.
- **Mechanism / seam:** a pure, side-effect-free builder that *derives* the manifest from the three files (no new authored source yet). Encodes the **PHI-data-seam ↔ consent/tenancy coupling** (Adversarial #1, Red-team #12): record-bearing seams (`fhirStore, wpcRecord, sde, evidence, carePlan, graph`) must fail closed unless `consent` and `tenancy` are at an equal-or-stronger posture. Add adapter-kind entries for the four existing families.
- **Fail-closed behavior:** derived, not authored; missing data already fails Phase 0. Not yet consumed at runtime — no new failure surface.
- **Tests + gates:** builder purity + snapshot test (unit); coupling-map coverage test (every record-bearing seam present); E13; size.
- **Mock-demo-intact:** derivation is build/test-time only.
- **Dependencies:** none beyond Phase 0.

### Phase 2 — Formalize one extension family + authored registration section
- **Goal:** prove "config + adapter drop-in, no engine edit" on **policy ingest** (lowest-risk; `registerAdapter`/`ingestLibrary` already exists).
- **Mechanism / seam:** introduce a **small authored section** of the manifest for extension-family registration (source id + adapter path), kept separate from the derived seam projection, both guarded by the Phase-0 test — resolving the derived-vs-authored contradiction (Adversarial #6). Registration stays explicit (auto-discovery rejected). Adding a source = one authored manifest entry + one adapter file, no engine edit.
- **Fail-closed behavior:** a declared source whose adapter is absent/misconfigured fails closed (ingestion refused), never silently no-ops.
- **Tests + gates:** add a sample source via manifest+adapter only, proving zero engine diff — E14 wired-path proof **against a local fixture, not real cloud** (Adversarial #11); unit; E13; size.
- **Mock-demo-intact:** demo uses mock/seeded; the new adapter is production-posture only, gated by dataMode.
- **Dependencies:** none beyond Phase 1.

### Phase 3 — Terraform module skeleton keyed to the connection-key map (no cloud yet)
- **Goal:** stand up the IaC layer structurally; one module per backend kind the map names (FHIR, Postgres-backed stores, secrets, OAuth/WSO2), with `terraform validate`/`plan` green against an **ephemeral throwaway dev target the modules actually run** (docker provider standing up its own HAPI/Postgres), *not* a hand-wavy "target the running compose stack" (Adversarial #13).
- **Mechanism / seam:** a generator reads the Phase-1 manifest and emits module inputs + a seam→module→output-name mapping. **Generation policy decided:** generate-at-plan-time; the generator (small) is under the size ratchet; generated HCL is **excluded from the size ratchet but validated in CI**, with a **golden-output test and stable sorted-key emitter** so generation is deterministic and doesn't churn (Adversarial #12). **Prerequisites baked in:** encrypted, access-logged, locked remote state backend (KMS, no public bucket, versioned); all credential outputs `sensitive = true`; secret outputs written to the secrets manager as handles, never plain outputs; `prevent_destroy` + lifecycle guards on every stateful/data module (Red-team #9); non-optional module invariants — KMS-at-rest, TLS-only, private subnets, no public endpoint, least-privilege SGs — enforced by policy-as-code (Red-team #17). Policy-as-code (OPA/Sentinel) also restricts provisioning to a **BAA-covered service allowlist** (Red-team #15) and pins+checksums all providers/modules; the manifest is signed and the emittable module set constrained (Red-team #16). WSO2 provider coverage **unknown — needs grounding** (may require a local-exec/API shim).
- **Fail-closed behavior:** not wired into runtime; a missing module output means the connection key stays unset and preflight fails the prod deploy as today.
- **Tests + gates:** generator-covers-every-production-capable-seam test (unit); golden-output determinism test (unit); `terraform validate`/`plan` + policy-as-code in CI (infra-gated, not E13/unit); E13 on the generator tests; size on the generator.
- **Mock-demo-intact:** mock demo invokes no Terraform at all — zero-infra by construction (Terraform only for staging/prod postures).
- **Dependencies (infra):** cloud target, remote-state backend, secrets manager (**must be chosen before Phase 4** — Adversarial #2), docker provider for the ephemeral dev target; policy-as-code engine.

### Phase 4 — Close the loop for the security-coupled record seam set, end to end
- **Goal:** turn a record seam production **without creating a Part-2 disclosure-without-consent violation** — the flagship worked example, corrected.
- **Mechanism / seam (concrete, corrected ordering):**
  1. **Turn on the security seams first:** `consent` and `tenancy` (and, per coupling, `identity`/`providerIdentity`/`crossReference` where the flow needs them) to production — never `fhirStore` alone (Adversarial #1, Red-team #1/#7).
  2. **Posture choice:** run the single-seam loop in **`staging`** posture first, whose `REQUIRED_ENV_KEYS` does **not** mandate the 4 WSO2 keys, so the minimal loop doesn't depend on the hardest unresolved gate; **or** sequence WSO2 provisioning (or a grounded shim) as an explicit prerequisite before any `production`-posture run (Adversarial #5). *Requires grounding of staging's required-key set.*
  3. **Config:** set `DATA_MODE_FHIRSTORE=production` (env-seam beats env-global).
  4. **Provision:** `terraform apply` in the pipeline stands up the FHIR module; endpoint = non-secret output → env; credentials → secrets manager handle.
  5. **Wire:** populate the exact connection key `schema.ts` names — **the map is authoritative; do not hardcode**.
  6. **Verify (two distinct gates):** `preflight.ts` checks key presence and names `fhirStore + <key>` if unset; then a **bounded, side-effect-free readiness probe** performs authenticated liveness + identity — TLS with expected issuer, expected FHIR `CapabilityStatement`, endpoint allowlist — before "ready" (Adversarial #3, Red-team #2). Presence ≠ reachability is documented.
  7. **Adapter:** the `fhirStore` production impl talks to the provisioned endpoint through an **egress allowlist** that blocks link-local/RFC1918 and requires IMDSv2, and canonicalizes any dynamically-discovered CMS-0057-F endpoint against a registry before use (Red-team #3).
- **Fail-closed behavior:** every step degrades safely — no apply → no output → key unset → preflight fails; present-but-wrong key → readiness probe fails; consent/tenancy not production → coupling guard refuses the record seam. **Fail-closed axis is explicit:** for *access* seams fail-closed = deny; the PA *decision* path gets a defined degraded mode, SLA timers, alerting, and a human fallback queue — never a silent block (Red-team #13).
- **Correct determinism claim:** determinism is a property of the **mock/seeded** posture used by demo and tests; production seams are permitted to be nondeterministic — routing a live FHIR call through a seam does **not** confer determinism (Adversarial #4). The real, separately-scoped guarantee: IaC values reach the app only as static config at boot, never as per-request lookups.
- **Emit-time provenance:** every regulated payload carries tamper-evident provenance tagging the effective disposition of each contributing seam; regulated/clinical endpoints refuse to emit non-production-sourced data; risk-adjustment/encounter/HEDIS-NCQA submission is gated on an all-contributing-seams-production assertion **at emit time** (Red-team #5/#8/#14).
- **Tests + gates:** preflight presence test + readiness-probe test for the `fhirStore` prod/missing/wrong-endpoint cases (unit); coupling-guard test (record seam refused unless consent+tenancy production); mock-consent-returns-DENY test (Red-team #7); E14 wired-path proof **against a local fixture**; E13; size.
- **Mock-demo-intact:** explicit test — with the mock flag set, a stray `DATA_MODE_FHIRSTORE=production` and connection key present, the demo still resolves to mock (depends on Phase 4a below).
- **Dependencies (infra/SME/licensed):** cloud FHIR backend choice (managed vs self-hosted HAPI) — SME; WSO2 shim or staging-posture confirmation — infra + grounding; readiness-probe identity expectations — SME.

### Phase 4a — Reconcile `NEXT_PUBLIC_USE_MOCK_DATA` with seam resolution
- **Goal:** make the demo-isolation invariant true, not hoped (Adversarial #9).
- **Mechanism / seam:** define `NEXT_PUBLIC_USE_MOCK_DATA` precisely — either it is the **highest-priority override at the top of the documented resolution order** (forcing all seams to mock regardless of stray env-seam vars), or it is declared unrelated and the "boots green regardless of stray env" claim is **dropped**. Recommend the former.
- **Fail-closed behavior:** in the demo, no override can silently promote a seam to production.
- **Tests + gates:** test setting a conflicting `DATA_MODE_*=production` alongside the mock flag and asserting mock resolution (unit); E13; size.
- **Mock-demo-intact:** this phase *is* the isolation guarantee.
- **Dependencies:** grounding of where `NEXT_PUBLIC_USE_MOCK_DATA` is currently read.

### Phase 4b — Import-boundary ratchet ("isolation by construction")
- **Goal:** prevent a future static import of a cloud SDK / IaC generator into any mock-path module (Adversarial #10).
- **Mechanism / seam:** a dependency-graph lint asserting **no static import edge** from mock-path modules into `infra/`, cloud SDKs, or IaC generators — enforced as a ratchet. This is the by-construction guarantee the boot test alone cannot give.
- **Fail-closed behavior:** a forbidden edge fails CI.
- **Tests + gates:** import-boundary lint (unit-style, ratcheted); E13; size.
- **Mock-demo-intact:** the mock path's zero-infra dependency surface is now provably fixed.
- **Dependencies:** none.

### Phase 5 — Wire IaC handoff into install.sh; provisioning stays in the pipeline
- **Goal:** one operator entry point without pulling cloud-admin creds or state secrets onto a laptop.
- **Mechanism / seam:** extend `install/install.sh` with a posture switch — `development` keeps pure docker-compose (unchanged default); `staging/production` **triggers/hands off to the controlled CI/CD pipeline** (scoped, ephemeral credentials), never `apply` locally (Red-team #18). The pipeline runs preflight **and** the readiness probe as the acceptance gate before declaring ready. `DATA_MODE_*` and connection keys are treated as **security-critical config**: privileged, multi-party-approved, immutably audited, with drift detection alerting on unauthorized change (Red-team #10). Provisioning actions are audit-logged (who ran apply, which workspace, when) with least-privilege state/provider credential custody (Red-team #15/#23 — no `TF_LOG=DEBUG` in prod, PHI scrubbed from DB logs).
- **Fail-closed behavior:** install refuses to report staging/prod success if preflight or the readiness probe fails; development never invokes the pipeline. A **production→mock reverse transition and per-seam teardown/rollback** is a first-class, tested operation, combined with a CI drift check so a dangling key pointing at a destroyed backend fails the readiness probe rather than passing presence (Adversarial #14).
- **Tests + gates:** install.sh dev-path smoke test unchanged-green (unit); staging-path plan-only dry-run where feasible (infra-gated); reverse-transition test (unit + infra-gated); E13; size.
- **Mock-demo-intact:** default/dev path is exactly today's compose flow; mock flag unaffected.
- **Dependencies (infra/SME):** CI/CD pipeline with scoped ephemeral creds; separation-of-duties policy; secrets custody model — SME.

### Phase 6 — Promote the manifest to authored source of truth (optional, A1 completion)
- **Goal:** invert the derivation so a new seam is one manifest entry + one adapter.
- **Mechanism / seam:** codegen with the Phase-0 conformance + policy tests flipped to guard generation. Only after Phases 0–5 prove the projection stable.
- **Fail-closed behavior:** build-time only; runtime untouched; do not land if it enlarges the mock-demo dependency surface.
- **Tests + gates:** codegen golden test; conformance + policy tests as guards (unit); E13; size; demo-boot test.
- **Mock-demo-intact:** enforced by the Phase-4b import boundary + a demo-boot test.
- **Dependencies:** stability evidence from Phases 0–5.

## Adversarial findings & resolutions

1. **Worked example = live 42-CFR-Part-2 violation by construction.** **RESOLVED** — Phase 1 encodes a PHI-data-seam ↔ consent/tenancy coupling map; Phase 4 turns on `consent`+`tenancy` *first*; a coupling guard refuses record seams unless consent+tenancy are equal-or-stronger; conformance test asserts coverage of every record-bearing seam.
2. **Terraform state/outputs = uncontrolled secret/PHI surface.** **RESOLVED** — Phase 3 splits non-secret (endpoint→env) from secret (→secrets manager handle) outputs, marks credential outputs `sensitive`, mandates encrypted/locked/access-logged remote state, and moves the secrets-manager choice to a **pre-Phase-4 prerequisite**.
3. **"Preflight is the acceptance gate" over-claimed.** **RESOLVED** — preflight is renamed a *presence gate*; a distinct, bounded, side-effect-free *readiness probe* (liveness/auth/identity) runs after preflight and before "ready," out of the request path. "Presence ≠ reachability" documented.
4. **Determinism claim for production is a category error.** **RESOLVED** — invariant restated: determinism is a mock/seeded property; production seams may be nondeterministic; the boot-time static-config guarantee is kept as a separate, correctly-scoped claim.
5. **Phase 4 infeasible without WSO2 first.** **RESOLVED** — run the single-seam loop in `staging` posture (no WSO2 in required keys, *pending grounding*) or sequence WSO2/shim as an explicit Phase-4 prerequisite; ordering made explicit.
6. **Phase 2 circular manifest dependency.** **RESOLVED** — Phase 2 adds a small *authored* registration section separate from the derived projection, both guarded by the Phase-0 test.
7. **Phase 0 false failures on backend-less seams / conflated key sets.** **RESOLVED** — Phase 0 adds a "production-without-external-backend" disposition excluded from key-coverage, and separates always-on `REQUIRED_ENV_KEYS` from per-seam conditional keys.
8. **`mock` vs `seeded` conflated; zero-infra only true for `mock`.** **RESOLVED** — the zero-infra invariant is pinned to `mock`; `seeded` is a separate compose-backed tier with its own boot test.
9. **Demo isolation relies on a switch not in the resolution order.** **RESOLVED** — Phase 4a defines `NEXT_PUBLIC_USE_MOCK_DATA` as the top-priority override (recommended) with a conflicting-env test, or drops the "regardless of stray env" claim.
10. **"Isolation by construction" only backed by a boot test.** **RESOLVED** — Phase 4b adds a ratcheted import-boundary lint forbidding static edges from mock-path modules into infra/cloud/IaC.
11. **E14 can't honestly cover cloud-only adapters.** **RESOLVED** — E14 is defined to prove reachability through the seam against a **local compose/stub fixture**; real-cloud reachability is an infra-gated staging/manual check outside E14.
12. **Generated Terraform vs size ratchet unresolved.** **RESOLVED** — generate-at-plan-time; generator under the size ratchet, generated HCL excluded but CI-validated, with a golden-output determinism test and sorted-key emitter.
13. **"Dev workspace targets docker-compose" hand-wavy.** **RESOLVED** — dev target is an ephemeral throwaway HAPI/Postgres the modules actually run (docker provider); the "plan against the running compose stack" framing is dropped.
14. **No rollback / orphaned-infra / dangling-key handling.** **RESOLVED** — Phase 5 adds a first-class tested production→mock reverse transition, per-seam teardown, CI drift check, and pairs the readiness probe so a dangling key fails closed.
15. **Part-2 accountability for the new provisioning entry point unaddressed.** **RESOLVED** — Phase 5 requires audit logging of provisioning actions and least-privilege credential custody as acceptance criteria (also Red-team #15/#23).
16. **Over-claims to trim.** **RESOLVED** — (a) "contract" downgraded to "shared schema + two distinct gates"; (b) Pulumi rejection reasoning reconciled (build-time data coupling accepted, runtime-lifecycle coupling rejected); (c) per-phase gates now list only those that genuinely apply (validate/plan marked infra-gated, not E13/unit).

## Red-team findings & mitigations

1. **Session/env override = runtime authz bypass of security seams. [CRITICAL]** — **MITIGATED:** in prod posture, forbid session/env-seam overrides that *lower* `consent, identity, tenancy, providerIdentity, crossReference, profileValidation` below production; runtime guard on *every* seam resolution (not just preflight); pin those seams production-only; reject rather than degrade; test that a session override cannot drop a security seam.
2. **Preflight validates presence, not identity/reachability (SSRF/integrity). [CRITICAL]** — **MITIGATED:** readiness probe (TLS + expected issuer, expected `CapabilityStatement`, endpoint allowlist) in Phase 4.
3. **SSRF via seam endpoints & CMS-0057-F dynamic discovery. [CRITICAL]** — **MITIGATED:** egress allowlist for all seam outbound calls; block link-local/RFC1918; require IMDSv2; canonicalize discovered endpoints against a registry; no raw config-string → outbound request (Phase 4 step 7).
4. **TF outputs → env route long-lived secrets through state/memory. [CRITICAL]** — **MITIGATED:** Phase 3 sensitive outputs, secrets-manager handles, encrypted/locked state, short-lived creds preferred, no env echoed in errors/logs.
5. **Mock/seeded output escaping into regulated/clinical surfaces = fabricated data (RADV/NCQA/FCA). [CRITICAL]** — **MITIGATED:** emit-time provenance tagging; regulated endpoints refuse non-production-sourced data; submissions gated on all-contributing-seams-production at emit time (Phase 4).
6. **Preflight "names seam+key" is a topology disclosure. [HIGH]** — **MITIGATED:** detailed diagnostics stay ops-only/structured/access-controlled; clients get a generic 503; seam/key names scrubbed from client-facing/broad logs (Phase 4/5).
7. **Consent mock may be fail-OPEN. [CRITICAL]** — **MITIGATED:** explicit test that mock/seeded consent returns DENY and closed-state disclosure is refused; production never resolves consent to mock/seeded (per #1).
8. **No signed provenance binding a submission to seam dispositions. [HIGH]** — **MITIGATED:** append-only, signed provenance log per submission/batch (effective dataMode of each contributing seam, backend identity, manifest/code version); block regulated submission if any contributing seam is non-production (Phase 4).
9. **`apply` can destroy/replace a stateful PHI backend. [CRITICAL]** — **MITIGATED:** `prevent_destroy` + lifecycle guards, mandatory human plan review with separation of duties, state locking, scoped CI role, no auto-apply to prod, destroy runbook with backups (Phase 3/5).
10. **`DATA_MODE_*` is the PHI control plane with no RBAC/approval. [HIGH]** — **MITIGATED:** treated as security-critical config — privileged, multi-party-approved, immutably audited, drift-alerted (Phase 5).
11. **deadLetterStore / idempotencyStore = unmonitored PHI reservoirs & replay vectors. [HIGH]** — **PARKED (design deferred, invariant recorded):** requires encrypting DLQ payloads, Part-2 tagging, access audit, capped retention, consent re-check on replay, server-generated per-tenant integrity-protected idempotency keys, production-pinned stores. **Parked** because these seams are outside the Phase-4 record-seam worked example and depend on the store-consolidation topology (an SME/infra gate, Open Questions); tracked as a required pre-production hardening item before either store goes production, enforced via the Phase-0 policy test once the topology is grounded.
12. **Cross-tenant isolation / patient-matching safety undefended. [HIGH]** — **MITIGATED (partial):** `tenancy` production-pinned and coupled (Phase 1/4); every store row tenant-keyed; cross-tenant isolation tests; `crossReference` match-confidence thresholds with sub-threshold human review and merge audit. Confidence-threshold tuning **PARKED** to SME (clinical safety sign-off).
13. **Fail-closed on the PA *decision* path conflicts with CMS-0057-F timelines. [HIGH]** — **MITIGATED:** axis split — access seams fail-closed = deny (safe); the PA decision path gets a defined degraded mode, SLA timers, alerting, human fallback queue (Phase 4).
14. **profileValidation/terminology downgrade admits invalid codes. [HIGH]** — **MITIGATED:** both production-pinned for regulated paths; closed-state = reject the resource, not accept unvalidated; test that closed-state validation rejects (Phase 0 policy + Phase 4).
15. **No BAA/HIPAA-eligibility enforcement on the generator. [HIGH]** — **MITIGATED:** policy-as-code (OPA/Sentinel) restricting provisioning to a BAA-covered allowlist; deny plan otherwise (Phase 3).
16. **Auto-generated Terraform = supply-chain/review gap. [HIGH]** — **MITIGATED:** pin+checksum providers/modules, sign the manifest, constrain the emittable module set, require human plan review, scan generated HCL (Phase 3).
17. **Encryption/isolation unspecified for provisioned PHI backends. [HIGH]** — **MITIGATED:** non-optional module invariants (KMS-at-rest, TLS, private subnets, no public endpoint, least-privilege SGs) enforced by policy-as-code (Phase 3).
18. **install.sh pulling cloud/PHI creds onto laptops. [HIGH]** — **MITIGATED:** staging/prod provisioning runs only in the CI/CD pipeline with scoped ephemeral creds; install.sh's non-dev path hands off, never applies locally (Phase 5).
19. **Session/env overrides not required to be audited. [MEDIUM]** — **MITIGATED:** immutably log every override (actor, seam, from→to, timestamp, request id), feeding the #8 provenance log (Phase 5).
20. **Clock downgrade corrupts audit/regulatory timestamps. [MEDIUM]** — **MITIGATED:** Phase 0 policy test asserts `clock` = production in prod posture; audit records use an attested time source; test that a seeded clock cannot resolve in prod.
21. **CMS-0057-F opt-out/attribution unmodeled. [MEDIUM–HIGH]** — **PARKED (needs grounding + SME):** model patient opt-out/attribution for Provider Access & Payer-to-Payer as its own production-pinned, audited seam, enforced on every such disclosure, with an opt-out-honored test. **Parked** because the current seam list shows `consent` but no distinct opt-out/attribution seam — confirming whether one exists is a grounding + product/SME decision (Open Questions); recorded as a required pre-production seam for any CMS-0057-F exchange surface.
22. **Structural conformance gives false safety assurance. [MEDIUM]** — **MITIGATED:** Phase 0 adds semantic policy tests (security/regulated seams MUST be production; no security seam may allow `mock` in prod; clock MUST be production).
23. **PHI/secrets in backend & TF logs. [MEDIUM]** — **MITIGATED:** disable/scrub PHI in DB logs; forbid `TF_LOG` debug in prod pipelines; enforce retention/encryption/access controls on new backends (Phase 3/5).
24. **Minimum-necessary not a design constraint on seams. [MEDIUM]** — **PARKED (design deferred):** define per-seam minimum-necessary scopes with field-level filtering by caller role/purpose and scoped-response tests. **Parked** because it is a cross-cutting per-seam contract redesign (~28 seams) orthogonal to the extension/IaC mechanism this plan delivers; recorded as a required HIPAA hardening workstream, seeded into the manifest as a per-seam scope field when undertaken.

## Open questions for review/approval

1. **`src/lib/deploy/index.ts` internals** — unknown; needs grounding before Phase 3 relies on any deploy-surface behavior.
2. **Staging posture's `REQUIRED_ENV_KEYS`** — does staging exclude the 4 WSO2 keys? The whole Phase-4 "single-seam loop without WSO2" path depends on this (Adversarial #5).
3. **WSO2 Terraform provider/module coverage** — exists, or shim required? Critical-path for any production posture.
4. **Secrets manager choice** — must be decided before Phase 4 (Adversarial #2 / Red-team #4).
5. **Target runtime** — Kubernetes (needs the Helm/Kustomize sub-layer) vs VM/managed. SME decision.
6. **Per-seam backend topology / store consolidation** — which of the ~28 seams share a Postgres vs need dedicated backends; gates Red-team #11 (DLQ/idempotency hardening).
7. **CMS-0057-F opt-out/attribution seam** — does a distinct seam exist, or must one be modeled (Red-team #21)?
8. **`NEXT_PUBLIC_USE_MOCK_DATA` semantics** — confirm it can be made the top-priority resolution override (Phase 4a / Adversarial #9).
9. **Licensed terminology/value-set content** — provisioning the store is IaC; the licensed *content* is out of scope and needs a licensing owner.
10. **Separation-of-duties / approval model** for `DATA_MODE_*` and `apply` (Red-team #9/#10/#18) — who approves, who holds state/provider credentials.
11. **Minimum-necessary scope ownership** (Red-team #24) — who defines per-seam scopes when that workstream is undertaken.

## Status

DRAFT — not implemented; for review/approval before a future phase.

---
*Generated by a coalition of agents (draft → adversarial critique → red-team → synthesis), grounded in the repo. DRAFT for review/approval — not implemented.*
