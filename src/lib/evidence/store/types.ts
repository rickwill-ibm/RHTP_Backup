/**
 * Evidence ledger — shared types (O-1, ADR-005).
 *
 * A minimal `pg`-compatible surface so the same ledger code runs against the
 * real `pg` Pool (production / testcontainers) and the in-process `pg-mem`
 * adapter (unit tests) without a driver dependency leaking into the interface.
 */
import type { EvidenceRecord } from '../evidenceRecord';

/** The subset of node-postgres we depend on. `pg.Pool` and pg-mem both satisfy it. */
export interface PgQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

export interface PgLike {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PgQueryResult<Row>>;
}

/**
 * Provenance stamped on every append. Monotonic `seq` (distinct across
 * concurrent writers), per-record `version`, attributed `actor`, optional
 * `correlationId`, and the injected-clock `appendedAt`.
 */
export interface LedgerProvenance {
  seq: number;
  version: number;
  actor: string;
  correlationId: string | null;
  appendedAt: string; // ISO 8601
}

/** One immutable ledger row: a full EvidenceRecord snapshot plus its provenance. */
export interface LedgerEntry {
  provenance: LedgerProvenance;
  record: EvidenceRecord;
}

export interface PgEvidenceLedgerOptions {
  /**
   * Actor recorded on an append when the record carries none. The append path
   * prefers the record's latest entry actor; this is the floor.
   */
  defaultActor?: string;
  /** Correlation id stamped on appends; defaults to the record id. */
  correlationIdFor?: (record: EvidenceRecord) => string | null;
}
