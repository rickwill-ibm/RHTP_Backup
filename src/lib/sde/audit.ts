// CONTRACT: ADR-005
/**
 * SDE audit sink seam. Every disposition and every fold emits a PHI-safe audit
 * entry (references, codes, counts only — never member PHI). The in-memory
 * default ships for tests and mock mode; a production deployment backs this with
 * the ADR-005 evidence ledger behind the same interface.
 */
import type { SdeAuditEntry, SdeAuditSink } from './types';

/** In-memory audit sink (default). Ordered, replayable, PHI-safe by contract. */
export function createMemoryAuditSink(id = 'mock-sde-audit'): SdeAuditSink {
  const log: SdeAuditEntry[] = [];
  return {
    id,
    record(entry: SdeAuditEntry): void {
      log.push(entry);
    },
    entries(): SdeAuditEntry[] {
      return [...log];
    },
  };
}
