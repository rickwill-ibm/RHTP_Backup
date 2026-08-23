# Stub-Legitimacy / Production-Readiness Audit — Iterations 0-4

**Adversary question for each seam/stub/fake:** is a stub genuinely fine here
until its roadmap iteration (ACCEPTABLE), does it work for the demo but risk
silent-wrong-behavior or data corruption if treated as real (RISKY), or is it
load-bearing enough that leaving it a stub is a latent defect NOW — the way the
identity hash-stub was (UNACCEPTABLE)?

The litmus that convicts: **a stub that returns a plausible-but-fake value
instead of failing loud, on a path reachable in production, is a defect** — a
label does not save it. The platform has a *good* pattern for this
(`getDataMode(seam)==='production'` → throw `*NotConfiguredError`, callers
fail closed). The findings below are the places that pattern is **absent,
bypassed, or defaulted the wrong way**.

**Totals: 26 audited — 17 Acceptable · 5 Risky · 4 Unacceptable.**

---

## Full table

| # | Stub / seam | What it stubs vs the real thing | Fail-loud in prod? | Fidelity documented? | Grade |
|---|---|---|---|---|---|
| U1 | `devMockEnabled()` dev-stub path — `devClaimResponseApproved`, `devCrdCards`, `devMemberMatch` (`src/lib/server/devStubs*.ts`, routes `api/pas/submit`, `api/cds`, `api/match`, `api/evidence`, `api/financial-clearance`) | Canned CRD cards + a **canned "Prior authorization approved" ClaimResponse** + canned member-match, standing in for real CRD/PAS/EMPI adjudication | **NO — fail OPEN.** `allowDevMockAuth` **defaults to `'true'`** (`env.ts:49`, `runtimeConfig.ts:81`); routes gate only on that flag, NOT also on `!tokenUrl` the way `smartSession.ts` does | Partially (comment claims "never fires in production" — true for the session path, FALSE for the route stubs) | **UNACCEPTABLE** |
| U2 | `defaultProfileValidator` id `structural-profile-validator` (`src/lib/pipeline/load.ts:29`) | Presents as the stage-4 **"US Core / profile `$validate` gate"**; actually checks only that 4 fields are non-empty (memberId, resourceType, fhirResourceId, payload) | **NO.** Same structural validator in mock AND production — no mode switch, no fail-closed (unlike the sibling terminology gate) | Comment labels it "Default: structural"; the *masquerade* (named a `$validate` gate) is not disclosed at the call site | **UNACCEPTABLE** |
| U3 | `empiResolver` bound to `mockIdentitySource` (`empiResolver.ts:175,191` + `identitySource.ts:75`) | Real match engine (rules + probabilistic) — but in production it scores inbound records against the **3 hard-coded demo records** (Maria Redhawk) | **NO.** `createEmpiResolver()` defaults to `mockIdentitySource`; no production `IdentitySource` registration, no throw | Iter-4 summary lists "EMPI candidate registry is the mock IdentitySource" as a seam — but calls the seams "fail-loud"; this one does not | **UNACCEPTABLE** |
| U4 | Evidence production ledger seam is **dead wiring** (`evidence/store/index.ts` `getEvidenceStore()` vs callers) | `getEvidenceStore()` selects the real append-only Postgres ledger in prod — but **every caller uses `defaultEvidenceStore()` directly** (`api/evidence/[id]`, `api/financial-clearance`, `api/work-queue`), which returns a process-local `Map` | N/A — the selector is never called, so `DATA_MODE_EVIDENCE=production` is a **no-op** | Index doc admits "callers are NOT changed this iteration"; `dataMode.ts:46` still labels the seam **"wired"** | **UNACCEPTABLE** |
| R1 | `InMemoryWorkflowEngine` as the ONLY engine, incl. `agentRuntime=production` (`agentRuntime/index.ts:createRuntime` → `createInMemoryWorkflowEngine`) | Temporal-class durable engine; the fake keeps timers/state in in-process `Map`s | Production mode runs REAL agents on the fake — no throw, no Temporal drop-in yet | **Yes, L1** — `FAKE_FIDELITY.md` names all 5 gaps (durable timers, retries, crash recovery, visibility, replay) | **RISKY** |
| R2 | `createPgOutboxStore` exactly-once + per-member ordering (`outbox/pgOutboxStore.ts`) | Real multi-writer Postgres CAS (`UPDATE…WHERE status='pending'`) + `UNIQUE(member_id,sequence)` | Logic is correct-looking, but **only pg-mem-verified**; pg-mem does not model concurrent-transaction isolation, so the multi-writer race is **never actually executed** (Live-integration = 0) | Yes — Iter-2 table + README name the testcontainer spec as Docker-guarded/CI-pending | **RISKY** |
| R3 | Neo4j backend: `createNeo4jFakeGraphStore` + `cypher.ts` rendering (`graph/adapters/neo4j/`) | Real bolt-backed Cypher store | "Dual-backend parity CONFIRMED" is proven **fake-vs-pg-mem** (two in-memory impls); the fake is a *separate* reimplementation from the Cypher renderer, which is only string-unit-tested and **never run against a live Neo4j** | Yes — Iter-2 table marks real bolt CI-pending | **RISKY** |
| R4 | HCC crosswalk demo stub in `terminology-seed.json` → `seedTerminologyService.classify()` | Real CMS-HCC grouping service / VSAC crosswalk | Seeded mode returns plausible HCC groups for demo ICD-10s; production terminology service throws (fail-closed) — but the *seed* answers carry real-looking HCC labels | Flagged `stub:true` on every answer; seed `_comment` says "stub CMS-HCC mapping" | **RISKY** |
| R5 | `sessionSecret` default `'dev-only-insecure-session-secret-change-me'` (`env.ts:50`) | A real symmetric cookie-encryption key | **NO — fail OPEN.** Defaults to a public constant if `SESSION_SECRET` unset | Comment says "dev-only" but nothing enforces it in prod | **RISKY** |
| A1 | `defaultIdentityResolver` (djb2, `stages.ts:34`) | The original hash-stub defect — ignores demographics | Scoped to mock/seeded ONLY; production swaps to `empiResolver` (see U3) | Yes — comment states demo-stability intent | ACCEPTABLE |
| A2 | `pixPdqIdentityResolver` / PIX/PDQ HL7v2 stub | Real MLLP QBP/RSP EMPI | Throws `ExternalEmpiNotConfiguredError` naming exact config | Yes (honest stub header) | ACCEPTABLE |
| A3 | `pixmPdqmIdentityResolver` / PIXm/PDQm FHIR stub | Real FHIR `$ihe-pix` / PDQm | Throws `ExternalEmpiNotConfiguredError` | Yes | ACCEPTABLE |
| A4 | `productionTerminologyService` | FHIR terminology server (`$validate-code`/`$translate`/`$expand`) | Throws `TerminologyServiceNotConfiguredError`; semantic gate turns the throw into **fail-closed quarantine** (`semanticValidator.ts:86`) | Yes | ACCEPTABLE |
| A5 | `seedTerminologyService` | Real terminology server | Seeded/mock only; every answer `stub:true` | Yes | ACCEPTABLE |
| A6 | `valueSetRegistry.refresh()` | External authority feeds (VSAC/CMS/NLM) | Throws `TerminologyRefreshNotConfiguredError` naming authority+op | Yes | ACCEPTABLE |
| A7 | `createMemoryOutboxStore` | pg outbox (mock mode of cdc-relay) | Mock mode; contract-tested against the pg store | Yes (C3 "mock is a mode") | ACCEPTABLE |
| A8 | `mockProviderAccessConsentStore` + `getProviderAccessConsentStore()` | Real consent-management repo | **Model behavior:** prod throws; SDE consent gate treats throw as **fail-closed no-contact** | Yes | ACCEPTABLE |
| A9 | `goldCardRoster` seam | Real payer roster feed | Production loader throws `DataSourceNotConfiguredError` | Yes | ACCEPTABLE |
| A10 | `denialRateFeed` seam | Real denial-rate feed | Production throws | Yes | ACCEPTABLE |
| A11 | `providerDirectory` seam | Real provider directory | Production throws | Yes | ACCEPTABLE |
| A12 | `backbone/clients.ts` (eligibility 270/271, CRD/DTR/PAS, X12) | Live Tier-B HTTP services | `assertBackbone()` throws `BackboneNotConfiguredError` | Yes | ACCEPTABLE |
| A13 | `fhir/validate.ts` lightweight structural check | Full US-Core `$validate` | Honestly scoped "fast pre-flight only … delegated to the standards backbone + Inferno/Da Vinci" | Yes | ACCEPTABLE (see U2 caveat) |
| A14 | `wholePersonGraphData` (graph mock seam) | Projected graph store (prod read path) | Demo UI source only; not the production read path | Yes | ACCEPTABLE |
| A15 | `signalDisposition` / SDE demo seam + `agent-manifests.json` / `agent-routing.json` (policy/manifest as data) | Tunable governance data | Data-not-code; loud hand-validators reject malformed input | Yes | ACCEPTABLE |
| A16 | `pgEvidenceLedger` implementation itself | — (this is the real thing) | Correct append-only ledger + immutability trigger migration | The *code* is production-grade; its only defect is being **unreachable** (see U4) | ACCEPTABLE (code) |
| A17 | Outbox crash-recovery republish (at-least-once) | Exactly-once delivery | By-design at-least-once; downstream idempotent (projector upsert, SDE `eventId` dedupe) | Yes — Iter-2 carried finding | ACCEPTABLE |

---

## Ranked RISKY + UNACCEPTABLE with failure scenarios

### U1 — Dev-stub path defaults ON and fakes an approved prior authorization (most severe)
`allowDevMockAuth` **defaults to `'true'`** (`env.ts:49`, mirrored in `runtimeConfig.ts:81`).
The route-level `devMockEnabled()` checks *only* that flag; it does **not** also
require `!tokenUrl`, whereas `smartSession.ts` (145/178/233/244) double-gates the
auth path on `!env.tokenUrl && allowDevMockAuth`.
**Failure if shipped as-is:** a production deploy with WSO2 fully wired
(`tokenUrl` set) but `ALLOW_DEV_MOCK_AUTH` left unset authenticates real users yet
**`POST /api/pas/submit` returns `devClaimResponseApproved` — a canned
"Prior authorization approved (dev demo)" ClaimResponse** — and `/api/cds`,
`/api/match` return canned cards/matches. Fake PA approvals flow downstream as
real determinations. **Misleads:** the response is a well-formed FHIR
ClaimResponse with `disposition: "Prior authorization approved…"` — nothing at the
API boundary distinguishes it from a real adjudication. Fix: default the flag to
`false`, and require `NODE_ENV!=='production'` (or `!tokenUrl`) at every route
`devMockEnabled()` site — mirror the session-path double-gate.

### U2 — "Profile `$validate` gate" that never validates a profile, and does not fail closed
`defaultProfileValidator` is the only `FhirProfileValidator`; `conformAndLoad`
runs it as "Gate 1: structural profile validity." It checks 4 non-empty fields.
There is **no production/US-Core validator** and **no mode switch** — the same
stub runs in production, and unlike the semantic gate it does **not** fail closed.
**Failure if shipped as-is:** in production a record that is structurally present
but violates US Core (wrong cardinality, missing must-support elements, invalid
references, wrong required-binding value set) **passes the "profile-validate
gate"** and is committed to the outbox → FHIR store → graph. **Misleads:** logs and
the stage contract report a passed `$validate` gate. This is the direct analog of
the identity hash-stub: honestly named "structural," but load-bearing as the
*profile* gate with a plausible-pass instead of a loud fail. Fix: add a
production `FhirProfileValidator` that fails closed (`profile-validation-
unavailable`) exactly like `selectSemanticValidator()`, selected by a dataMode
seam.

### U3 — Real EMPI engine scoring against a 3-record demo registry in production
`empiResolver = createEmpiResolver()` binds to `mockIdentitySource` (3 hard-coded
Maria Redhawk records). Production identity resolution (`getDataMode('identity')
==='production'`, kind `internal`) runs the *real* engine but the candidate pool
is the demo fixture. No production `IdentitySource` exists and nothing throws.
**Failure if shipped as-is:** every real inbound member fails to match the demo
pool → **`empi-minted-no-match` mints a brand-new anchored id for records that
should have linked**, silently fragmenting the whole-person record; worse, a real
member whose demographics happen to score 60-90 against a demo record is **HELD
for review against fake data**. **Misleads:** audit summaries read
`empi outcome=minted/held tier=… confidence=…` — indistinguishable from a real
EMPI decision. Fix: register a production `IdentitySource` or throw
`IdentitySourceNotConfiguredError` when `identity=production` and the source is the
mock (fail loud like every sibling seam).

### U4 — Evidence "production ledger" seam is never called; evidence lives in a volatile Map
`getEvidenceStore()` is the documented flip point to the append-only Postgres
ledger, but all three callers import `defaultEvidenceStore()` directly, which
returns `createInMemoryEvidenceStore()` (a process-local `Map`) unless
`EVIDENCE_DIR` is set (then a single-node file store). `dataMode.ts:46` labels the
seam "wired."
**Failure if shipped as-is:** `DATA_MODE_EVIDENCE=production` changes nothing;
Evidence Records — the compliance/audit artifact — are **lost on every restart,
invisible across instances**, and the immutability trigger
(`002_evidence_ledger_immutability_trigger.pg.sql`) never runs. An operator who set
the seam to production believes they have a tamper-evident ledger. **Misleads:**
`/api/config-status` and the seam registry report the evidence seam as
production-capable/"wired." Fix: point the three callers at `getEvidenceStore()`
and register the pg factory in the composition root; until then relabel the seam
"registered," not "wired."

### R1 — Production agent runtime runs on the non-durable fake
`createRuntime()` always builds `createInMemoryWorkflowEngine`; there is no
Temporal drop-in, so `agentRuntime=production` executes real agents on the fake.
**Failure:** after any deploy/restart, pending escalation SLA timers never fire
(FAKE_FIDELITY gap #1), a transient send failure drops the touchpoint (#2), and an
approved-but-mid-journey proposal never resumes (#3) — **an escalation silently
never happens**. Documented at L1, so this is RISKY not UNACCEPTABLE — but
production mode is reachable and non-durable with no runtime warning.

### R2 — Outbox exactly-once/ordering proven only on pg-mem
The multi-writer CAS + `UNIQUE(member_id,sequence)` backstop is correct by
inspection, but pg-mem is single-threaded and does not model READ-COMMITTED
concurrent `UPDATE` / row-lock semantics, so the writer-vs-sweep race and the
sequence-collision retry loop are **never actually executed**. **Failure if a
real-pg divergence exists:** a duplicate C2 publish or an out-of-order per-member
sequence under true concurrency — the exact class the design claims to close.
Documented CI-pending (Live-integration = 0).

### R3 — Neo4j "co-equal certified backend" is unverified against real Cypher
The contract/parity suites run the in-memory *fake*, a separate implementation
from the `cypher.ts` renderer that actually ships. The renderer is only
string-asserted; no test executes it against a live Neo4j. **Failure:** a
divergence between fake semantics and real Cypher (e.g. `MERGE` locking, label
scans, `NULL` `v_end` ordering, `labels(n)` including the `kind` label on
read-back) ships undetected — the neo4j backend a customer selects via config is
**untested code**. "Dual-backend parity CONFIRMED" is true only fake-vs-pg-mem.
Documented CI-pending.

### R4 — HCC crosswalk demo stub returns plausible risk groups
`classify(code,'HCC')` answers from a tiny seed crosswalk. Every answer is
`stub:true` and the production terminology service fails closed, so this is
RISKY-low — but if any consumer reads the HCC group for risk-adjustment or quality
math without checking `stub`, demo values (e.g. a superseded CMS-HCC V24 mapping)
look like real classifications.

### R5 — Session secret defaults to a public constant
`sessionSecret` falls back to `'dev-only-insecure-session-secret-change-me'`. If
`SESSION_SECRET` is unset in production, session cookies are encrypted with a
world-known key → **cookie forgery / session hijack**. Fail-open default, same
anti-pattern as U1; grouped as RISKY because it is a config-hardening miss rather
than a fake-value path.

---

## Cross-cutting observation
The platform has a **correct, repeatable safe-stub pattern** — `getDataMode(seam)
==='production'` → throw a named `*NotConfiguredError`, caller fails closed
(consent, terminology, all three dataSources, backbone). Every ACCEPTABLE row uses
it. **Every UNACCEPTABLE row is a place that pattern was skipped or inverted:**
U1/R5 default the flag the *unsafe* way, U2/U3 have no production branch at all,
U4 wired the selector but no caller uses it. The fix in each case is to make the
production path do what consent already does — refuse to serve a plausible-but-fake
value.
