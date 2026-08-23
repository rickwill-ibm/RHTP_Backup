-- =============================================================================
-- 002_evidence_ledger_immutability_trigger.pg.sql  (O-1, ADR-005)
--
-- Database-level append-only guard. Refuses UPDATE and DELETE on the ledger so
-- that no mutation path exists even for a client issuing raw SQL — the code-level
-- guarantee (the ledger object exposes only append + read) plus this trigger
-- together make the ADR-005 immutability posture defense-in-depth.
--
-- REAL POSTGRES ONLY. The `.pg.sql` suffix marks it as such: the migration
-- applier skips it under pg-mem (which cannot parse plpgsql). The testcontainer
-- integration spec asserts this trigger actually blocks mutations on real
-- Postgres.
-- =============================================================================

CREATE OR REPLACE FUNCTION evidence_ledger_deny_mutation()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'evidence_ledger is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_evidence_ledger_no_mutation ON evidence_ledger;
CREATE TRIGGER trg_evidence_ledger_no_mutation
  BEFORE UPDATE OR DELETE ON evidence_ledger
  FOR EACH ROW EXECUTE FUNCTION evidence_ledger_deny_mutation();
