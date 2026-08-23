-- =============================================================================
-- 001_create_dead_letter.sql  (NS-01)
--
-- Durable, append-only home for the three record kinds the pipeline used to
-- build then DROP: `quarantine`, `held-identity` (EMPI 60-90 band), and
-- `failed-outbox`. A held member can no longer silently disappear.
--
-- APPEND-ONLY BY CONSTRUCTION:
--   * every append (a creation OR a resolution) is a new immutable row;
--   * `seq` is a monotonic identity — distinct across concurrent writers,
--     ordering = commit order;
--   * `record_version` is the per-record snapshot number (1 = open, 2 =
--     resolved/dismissed/retried ...), so the full history of one record is
--     preserved and auditable.
--
-- PHI-SAFE: every column is an id / code / reference — member_ref is an anchored
-- member id (mem-xxxx) or a source handle, payload_ref points to where the raw
-- record lives. No name, DOB, SSN, or raw clinical payload is ever stored here.
--
-- Portable across real Postgres and the in-process pg-mem test engine. The
-- database-level immutability guard (a trigger refusing UPDATE / DELETE) lives in
-- 002_dead_letter_immutability_trigger.pg.sql — real Postgres only, because
-- plpgsql is beyond pg-mem's parser.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dead_letter (
  seq               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id         TEXT        NOT NULL,
  record_version    INTEGER     NOT NULL,
  kind              TEXT        NOT NULL,
  status            TEXT        NOT NULL,
  member_ref        TEXT        NOT NULL,
  reason_code       TEXT        NOT NULL,
  source_ref        TEXT        NOT NULL,
  payload_ref       TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,
  resolution_action TEXT,
  appended_at       TIMESTAMPTZ NOT NULL
);

-- Read path: latest snapshot per record, and the ordered history of one record.
CREATE INDEX IF NOT EXISTS idx_dead_letter_record
  ON dead_letter (record_id, seq);

-- Reviewer surface: list open items by kind / status.
CREATE INDEX IF NOT EXISTS idx_dead_letter_kind_status
  ON dead_letter (kind, status, seq);

-- One version number per (record_id, record_version): a second writer racing the
-- same version loses on this unique constraint rather than corrupting history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dead_letter_record_version
  ON dead_letter (record_id, record_version);
