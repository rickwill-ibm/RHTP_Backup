-- =============================================================================
-- 001_create_evidence_ledger.sql  (O-1, ADR-005)
--
-- Append-only Postgres evidence ledger. System of record for the Golden Thread
-- Evidence Record: durable, ordered, attributed, PHI-safe.
--
-- APPEND-ONLY BY CONSTRUCTION:
--   * every save() is a new immutable row (never an UPDATE of an existing row);
--   * `seq` is a monotonic identity — distinct across concurrent writers,
--     ordering = commit order;
--   * `record_version` is the per-record snapshot number (1, 2, 3 ...), so the
--     full version history of one Evidence Record is preserved and replayable.
--
-- The `payload` is the full EvidenceRecord snapshot as JSONB (references, codes,
-- determinations — never raw PHI, per evidenceRecord.ts discipline). Retention
-- is enforced at the table level by policy (7-year default per ADR-005).
--
-- This migration is portable across real Postgres and the in-process pg-mem test
-- engine. The database-level immutability guard (a trigger that refuses UPDATE /
-- DELETE) lives in 002_evidence_ledger_immutability_trigger.pg.sql — real
-- Postgres only, because plpgsql is beyond pg-mem's parser.
-- =============================================================================

CREATE TABLE IF NOT EXISTS evidence_ledger (
  seq            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id      TEXT        NOT NULL,
  record_version INTEGER     NOT NULL,
  member_id      TEXT        NOT NULL,
  status         TEXT        NOT NULL,
  entry_count    INTEGER     NOT NULL,
  payload        JSONB       NOT NULL,
  actor          TEXT        NOT NULL,
  correlation_id TEXT,
  appended_at    TIMESTAMPTZ NOT NULL
);

-- Read path: latest snapshot per record, and the ordered history of one record.
CREATE INDEX IF NOT EXISTS idx_evidence_ledger_record
  ON evidence_ledger (record_id, seq);

-- Distinct-record listing and per-member scans.
CREATE INDEX IF NOT EXISTS idx_evidence_ledger_member
  ON evidence_ledger (member_id, seq);

-- One version number per (record_id, record_version): a second writer racing the
-- same version loses on this unique constraint rather than corrupting history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_ledger_record_version
  ON evidence_ledger (record_id, record_version);
