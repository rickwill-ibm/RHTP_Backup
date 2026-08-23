# Iteration 9 — verbatim agent prompts (exactly as sent, composed per v1.2)

Iteration-level master brief inherited by all: `coalition/inputs/iteration9_context.md`. Composed per v1.2 (ROLE / INHERITS / CONTEXT MANIFEST / SCOPE / DoD / OUTPUT / STYLE), captured verbatim at send-time (E10). Wave D appended at iteration close. Live pg/neo4j/external stay CI-pending + fail-closed (no faked green).

---

## Agent: 9 wave A — unified substrate (migration runner + bootstrap)
```
ROLE: Substrate/persistence specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration9_context.md (Wave A scope + partitions).
CONTEXT MANIFEST: read the brief; src/lib/evidence/store/{schema.ts, migrations/*.sql, pgEvidenceLedger.ts, index.ts}; src/lib/idempotency/pgIdempotencyStore.ts; src/lib/outbox/pgOutboxStore.ts; src/lib/graph/adapters/postgres/store.ts; src/lib/identity/crossReference/* + src/lib/terminology/governance/store.ts (memory-only - add pg adapter or explicit fail-closed disposition); src/lib/config/{dataMode,seamDispositions}.ts; how pg-mem is used in existing store tests. You OWN src/lib/substrate/ + tests/substrate/*. Add any pg adapter inside the OWNING store's dir with a clear "// I9 substrate" comment. Do NOT touch deploy/ (B) or lifecycle/ (C).
Working tree /home/claude/baseline; live.
SCOPE: 1) migration RUNNER: discover the per-store SQL migrations, apply idempotently, record a schema_migrations ledger (re-run = no-op; checksum mismatch on an applied migration fails loud). 2) substrate BOOTSTRAP: construct all pg-backed stores from one DATABASE_URL/config; without config throw SubstrateNotConfiguredError (fail closed); tests wire it against pg-mem. 3) pg adapter (or explicit fail-closed disposition) for crossReference + governance. 4) deterministic, <=400 lines/file. Tests (pg-mem): migrations idempotent; checksum-mismatch fails; bootstrap wires stores; unconfigured fails closed.
Verify: npx tsc --noEmit 0; npx vitest run tests/substrate tests/evidence tests/outbox green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove idempotent+checksum-guarded migrations, fail-closed bootstrap. E9: unconfigured substrate must fail closed, never serve a silent in-memory prod.
OUTPUT: /home/claude/baseline/ITER9_WAVEA_REPORT.md; reply ONLY: migration-runner y/n, idempotent y/n, checksum-guard y/n, bootstrap-fail-closed y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 9 wave B — deployment config + fail-closed startup preflight
```
ROLE: Deployment/config specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration9_context.md (Wave B scope).
CONTEXT MANIFEST: read the brief; src/lib/config/seamDispositions.ts (the 23 seams + production posture - the preflight reads these); src/lib/server/env.ts (ServerEnv + requireSessionSecret fail-closed pattern to mirror); an existing route + tests/api/_helpers.ts. You OWN src/lib/deploy/ + src/app/api/health/ + tests/deploy/* + tests/api/routes-health.test.ts. Shared file env.ts: append only your deployment keys block. Do NOT touch substrate/ (A) or lifecycle/ (C).
Working tree /home/claude/baseline; live.
SCOPE: 1) deployment config schema + validation (required keys per environment). 2) startup PREFLIGHT: read seamDispositions + env and FAIL CLOSED when any required-in-production seam is NotConfigured or a required env key missing/empty; return a structured PHI-safe readiness report naming the unmet seam/key. 3) readiness + liveness routes under src/app/api/health/ (readiness reflects the preflight -> 503 when not-ready; liveness = cheap process check -> 200). 4) deterministic, <=400 lines/file. Tests: preflight passes when all required configured; fails closed listing the specific unmet seam/key; readiness 200 ready / 503 not-ready; liveness 200; PHI-safe.
Verify: npx tsc --noEmit 0; npx vitest run tests/deploy tests/api green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove fail-closed preflight naming the unmet requirement + readiness reflecting it. E9: readiness must report not-ready, never default-ready; a missing prod key must fail the preflight.
OUTPUT: /home/claude/baseline/ITER9_WAVEB_REPORT.md; reply ONLY: preflight-fail-closed y/n, names-unmet y/n, readiness-route y/n, liveness-route y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 9 wave C — data lifecycle (retention/purge/right-to-delete) + runbook
```
ROLE: Data-lifecycle specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration9_context.md (Wave C scope).
CONTEXT MANIFEST: read the brief; the append-only evidence ledger (src/lib/evidence/store/* - IMMUTABLE, do not add a row-delete) + its immutability trigger migration; the mutable stores (fhir/store, carePlanStore, dead-letter); how consent/Part2 segmentation marks sensitive data; src/lib/clock.ts. You OWN src/lib/lifecycle/ + docs/runbooks/deployment-runbook.md + tests/lifecycle/*. Do NOT touch substrate/ (A) or deploy/ (B), and do NOT modify the evidence ledger store internals.
Working tree /home/claude/baseline; live.
SCOPE: 1) retention/purge: a policy-driven purge over the MUTABLE stores (select-by-policy: age, category, consent-withdrawal). 2) right-to-delete over the append-only evidence ledger done CORRECTLY: never a silent row delete - a governed, audited tombstone/segmentation per policy that preserves ledger immutability + auditability. 3) LEGAL-HOLD: a hold blocks purge/delete. 4) deployment runbook (docs/runbooks/deployment-runbook.md): migrate -> preflight -> deploy -> rollback. 5) deterministic, <=400 lines/file. Tests: retention selects by policy; right-to-delete tombstones without breaking ledger immutability; legal-hold blocks purge.
Verify: npx tsc --noEmit 0; npx vitest run tests/lifecycle green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove policy purge, immutability-preserving right-to-delete, legal-hold block. E9: a purge must not silently break ledger immutability or bypass a legal hold.
OUTPUT: /home/claude/baseline/ITER9_WAVEC_REPORT.md; reply ONLY: retention-policy y/n, right-to-delete-immutability-safe y/n, legal-hold y/n, runbook y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```
Note: composed COMPLETE prompts as sent.

---

## Agent: 9 wave D — convergence + red-team panel (COMPOSED v1.2; captured verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity = deployment/operability/data-integrity: migration safety + idempotency, backup/restore posture, zero-downtime, secret handling, purge-vs-immutability; R2 negative-space; R3 stub-legitimacy on pg/neo4j adapters + CI-pending live seams). Framework v1.2.
INHERITS: coalition/inputs/iteration9_context.md.
CONTEXT MANIFEST: working tree /home/claude/baseline (live). Read ITER9_WAVEA/B/C_REPORT.md; src/lib/substrate/**; src/lib/deploy/** + src/app/api/health/**; src/lib/lifecycle/** + docs/runbooks/deployment-runbook.md; src/lib/config/seamDispositions.ts; src/lib/server/env.ts; verification/GAP_AND_STUB_RISK_REGISTER.md. Edit any file to fix findings; add no new capability.
SCOPE: 1) CONVERGENCE to DRY: reconcile shared partitions (seamDispositions.ts, env.ts); the preflight (B) should consult the substrate bootstrap's (A) fail-closed disposition; the migration ledger + bootstrap are the single substrate entry; no duplicated config schemas. 2) E9 FAIL-OPEN SWEEP (deployment): a missing/empty required prod config must fail closed at startup, never boot serving a mock; a migration must be idempotent + non-destructive; the preflight must not pass with an unconfigured required seam; readiness must report not-ready not default-ready; a purge must not break ledger immutability or bypass legal hold. 3) RED-TEAM PANEL (mandatory, every persona produces findings): R1 deployment/operability - migration rollback safety, checksum drift, connection-pool exhaustion, secret exposure, backup/restore gap, zero-downtime migration hazards, purge-vs-immutability correctness; R2 negative-space missing-list; R3 stub-legitimacy - grade the pg/neo4j adapters + the CI-pending live seams (are they honestly fail-closed, not faked-green?). 4) Fix Unacceptable now. Update verification/GAP_AND_STUB_RISK_REGISTER.md with an Iteration 9 section; live pg/neo4j/external remain CI-pending residuals routed to certification.
DoD (composite v1.2): tsc 0; full suite green (orchestrator re-runs); size/ratchet PASS; no fail-open (E9); seams fail-closed (E1); convergence DRY; every persona produced findings; zero new Unacceptable; register updated.
OUTPUT: /home/claude/baseline/ITER9_WAVED_REPORT.md. Reply ONLY: convergence DRY y/n, E9 result, R1/R2/R3 counts, Unacceptable fixed y/n, register updated y/n, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
