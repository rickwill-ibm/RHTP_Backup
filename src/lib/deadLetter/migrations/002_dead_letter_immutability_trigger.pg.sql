-- =============================================================================
-- 002_dead_letter_immutability_trigger.pg.sql  (NS-01)
--
-- Database-level append-only guard. Refuses UPDATE and DELETE on the dead-letter
-- table so no mutation path exists even for a client issuing raw SQL — the
-- code-level guarantee (the store exposes only append + resolve-by-append + read)
-- plus this trigger together make the immutability posture defense-in-depth.
--
-- REAL POSTGRES ONLY. The `.pg.sql` suffix marks it as such: the migration
-- applier skips it under pg-mem (which cannot parse plpgsql). The testcontainer
-- integration spec asserts this trigger actually blocks mutations on real
-- Postgres.
-- =============================================================================

CREATE OR REPLACE FUNCTION dead_letter_reject_mutation()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'dead_letter is append-only: % is refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dead_letter_no_update ON dead_letter;
CREATE TRIGGER trg_dead_letter_no_update
  BEFORE UPDATE OR DELETE ON dead_letter
  FOR EACH ROW EXECUTE FUNCTION dead_letter_reject_mutation();
