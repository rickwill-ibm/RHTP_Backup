# Deployment runbook — migrate → preflight → deploy → rollback

Owner: Data-lifecycle (Wave C). Scope: deploying a release that touches the
append-only evidence ledger, the mutable stores, and the data-lifecycle
subsystem (retention/purge, right-to-delete, legal-hold).

This runbook is **deterministic and ordered**. Each stage has an explicit gate;
do not advance to the next stage until the current stage's gate is green. Every
command is copy-pasteable and run from the repo root.

- **Verification gates (any stage may re-run these):**
  - `npm run check:types` → `tsc --noEmit`, 0 errors
  - `npm run check:sizes` → file-size ratchet PASS
  - `npx vitest run tests/lifecycle` → green
  - `npm run check:all` → types + sizes + lint + full test run

The `pretest` hook already runs types + sizes before any test, so a green
`vitest run` implies both gates passed.

---

## Stage 1 — MIGRATE

Apply database migrations **before** any new application code is live. The
evidence ledger is append-only; its migrations are additive and idempotent
(`IF NOT EXISTS` / `CREATE OR REPLACE`), so re-applying is a safe no-op.

1. **Snapshot the database first** (rollback insurance):
   ```bash
   pg_dump "$EVIDENCE_DATABASE_URL" --format=custom --file "backup-$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```
2. **Apply migrations in filename order** via the applier
   (`src/lib/evidence/store/schema.ts` → `applyMigrations`). On real Postgres,
   pass `realPostgres: true` so the `.pg.sql` immutability trigger
   (`002_evidence_ledger_immutability_trigger.pg.sql`) is installed; the pg-mem
   test path passes `realPostgres: false`.
   - `001_create_evidence_ledger.sql` — table + indexes (portable).
   - `002_evidence_ledger_immutability_trigger.pg.sql` — the plpgsql
     `BEFORE UPDATE OR DELETE` guard that refuses row mutation (real Postgres
     only, defense in depth).
3. **Migration gate:**
   - Both migrations report applied (or already-present).
   - The immutability trigger exists:
     ```sql
     SELECT tgname FROM pg_trigger WHERE tgname = 'trg_evidence_ledger_no_mutation';
     ```
   - A probe `UPDATE`/`DELETE` on `evidence_ledger` is **rejected** with
     `evidence_ledger is append-only`.

> **Never** write a migration that adds an `UPDATE`/`DELETE` path to
> `evidence_ledger` or drops the immutability trigger. Erasure is handled at the
> application layer by a governed tombstone (see the right-to-delete note below),
> never a schema-level row delete.

---

## Stage 2 — PREFLIGHT

Gate the artifact and the environment before shifting any traffic.

1. **Build + static gates (must all be green):**
   ```bash
   npm run check:types      # tsc --noEmit → 0 errors
   npm run check:sizes      # file-size ratchet → PASS
   npx vitest run tests/lifecycle
   npm run check:all        # types + sizes + lint + full vitest
   npm run build            # next build
   ```
2. **Data-mode + connection wiring:**
   - `DATA_MODE_EVIDENCE=production` and `EVIDENCE_DATABASE_URL` (or
     `DATABASE_URL`) are set. With production mode and **no** connection string,
     `getEvidenceStore()` fails loud
     (`EvidenceLedgerConnectionNotConfiguredError`) — verify it is configured, do
     not let it fall back silently.
   - The production evidence factory is registered at startup
     (`registerProductionEvidenceStore()` via `src/instrumentation.ts`).
3. **Lifecycle preflight (retention safety):**
   - Retention policies validate: every policy has at least one criterion
     (age / category / consent-withdrawal). A criteria-less policy is **refused**
     (`EmptyRetentionPolicyError`) so a purge can never sweep a whole store.
   - The **legal-hold registry is reachable** and holds are loaded. A purge or a
     right-to-delete consults it; if it is unavailable, **halt** — never run a
     purge that cannot see holds (E9: a purge must not bypass a legal hold).
   - Dry-run the purge planner (`planPurge`, pure — no removal) and review the
     `purge` / `heldBack` split. Confirm every expected legal hold appears in
     `heldBack` before executing anything.
4. **Preflight gate:** all build/static gates green, evidence connection
   verified, retention policies validated, legal-hold registry reachable, and the
   dry-run plan reviewed.

---

## Stage 3 — DEPLOY

1. **Release the new code** (blue/green or rolling). The evidence schema is
   already migrated (Stage 1), so new and old code both read a compatible ledger.
2. **Flip the seam** only after health checks pass: point evidence traffic at the
   production ledger (`DATA_MODE_EVIDENCE=production`). Mock/seeded modes stay
   byte-identical for demos.
3. **Post-deploy smoke (read-only first):**
   - `getEvidenceStore().get(<known id>)` returns the latest snapshot.
   - `readLedger(<known id>)` returns the ordered version history.
   - A **legal-hold block** works end to end: attempt a right-to-delete on a
     held subject → status `blocked-legal-hold`, **no new ledger version
     appended**.
   - A **right-to-delete** on an unheld test record → status `tombstoned`, a
     **new** version appended, prior versions still readable (immutability
     preserved), latest snapshot is the tombstone (`isTombstoned` true).
   - A **retention purge** dry-run then a scoped live run removes only
     policy-selected mutable-store records; held subjects land in `heldBack` and
     are untouched.
4. **Deploy gate:** smoke checks pass and error rates / latency are nominal for
   one observation window.

---

## Stage 4 — ROLLBACK

Trigger rollback when any deploy-gate check fails, error rates spike, or the
evidence read/write path regresses.

1. **Roll back application code** to the previous release (blue/green: shift
   traffic back to the known-good stack; rolling: redeploy the prior image).
2. **Do NOT roll back the evidence-ledger migrations by dropping data.** The
   ledger is append-only; migrations 001/002 are additive and forward-compatible
   with the previous release, so leaving the schema in place is correct.
   - If the immutability trigger itself must be re-asserted, re-apply
     `002_..._immutability_trigger.pg.sql` (idempotent `CREATE OR REPLACE`).
   - Only if a migration is proven incompatible: restore from the Stage 1
     `pg_dump` snapshot into a fresh database and repoint
     `EVIDENCE_DATABASE_URL`. Never issue ad-hoc `DELETE`s against
     `evidence_ledger` (the trigger will reject them anyway).
3. **Lifecycle rollback safety:**
   - A tombstone appended by a right-to-delete is a normal ledger version;
     rolling back code does not un-append it, and it must not be manually deleted.
   - **Preserve all legal holds across rollback.** If the hold registry is
     rebuilt, reload holds **before** re-enabling any purge job (E9).
   - Re-run the retention purge only after the legal-hold registry is confirmed
     loaded.
4. **Rollback gate:** the previous release is serving, evidence reads/writes are
   healthy, holds are loaded, and no purge job runs until the registry is
   confirmed.

---

## Quick reference

| Stage | Command / check | Gate |
|-------|-----------------|------|
| Migrate | `applyMigrations(pg, { realPostgres: true })` | trigger present; probe UPDATE/DELETE rejected |
| Preflight | `npm run check:all && npm run build` | all green; evidence conn set; policies valid; holds reachable |
| Deploy | flip `DATA_MODE_EVIDENCE=production` + smoke | tombstone appends, hold blocks, purge respects holds |
| Rollback | previous release + preserve ledger & holds | reads healthy; holds loaded; no purge until registry confirmed |
