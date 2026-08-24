/**
 * Accounting of disclosures + retention (HW2-B / I23, AUD-10).
 *
 * HIPAA gives a member the right to an ACCOUNTING OF DISCLOSURES: who received
 * their PHI, when, what, and for what purpose. The audit ledger (C-AUD) records
 * that an action happened; this records the DISCLOSURE dimension a member/OCR can
 * request, and enforces RETENTION (disclosures must be kept ≥ 6 years). PHI-safe:
 * references + purpose only, never the disclosed payload.
 */

export type DisclosurePurpose =
  | 'treatment'
  | 'payment'
  | 'operations'
  | 'patient-request'
  | 'required-by-law'
  | 'public-health'
  | 'break-glass'
  | 'audit';

export interface DisclosureRecord {
  id: string;
  memberId: string;
  /** Who received the PHI (a provider/org reference, never a raw name). */
  recipient: string;
  /** What resource(s) — references/types, never the payload. */
  resourceRef: string;
  purpose: DisclosurePurpose;
  tsMs: number;
  actor: string;
  correlationId: string;
}

/** Federal minimum retention for a disclosure accounting: 6 years. */
export const DISCLOSURE_RETENTION_MS = 6 * 365 * 24 * 3600_000;

export interface DisclosureLog {
  readonly id: string;
  record(entry: Omit<DisclosureRecord, 'id'>): Promise<DisclosureRecord>;
  /** The accounting for one member (newest first) — the HIPAA accounting response. */
  accountingFor(memberId: string): Promise<DisclosureRecord[]>;
  /** Records eligible for purge (older than retention). Never auto-deletes. */
  purgeable(nowMs: number): Promise<DisclosureRecord[]>;
}

/** In-memory disclosure log — the demo/mock default. */
export function createMemoryDisclosureLog(id = 'mock-disclosure-log'): DisclosureLog {
  const rows: DisclosureRecord[] = [];
  let seq = 0;
  return {
    id,
    async record(entry) {
      const rec: DisclosureRecord = { ...entry, id: `disc-${seq++}` };
      rows.push(rec);
      return rec;
    },
    async accountingFor(memberId) {
      return rows.filter((r) => r.memberId === memberId).sort((a, b) => b.tsMs - a.tsMs);
    },
    async purgeable(nowMs) {
      return rows.filter((r) => nowMs - r.tsMs > DISCLOSURE_RETENTION_MS);
    },
  };
}

export class DisclosureLogNotConfiguredError extends Error {
  constructor() {
    super('disclosure log durable=production but no durable factory registered (fail-closed)');
    this.name = 'DisclosureLogNotConfiguredError';
  }
}

let productionFactory: (() => DisclosureLog) | null = null;
export function setProductionDisclosureLogFactory(f: (() => DisclosureLog) | null): void {
  productionFactory = f;
}
let processLog: DisclosureLog | null = null;

/** Resolve the disclosure log; durable=production requires the factory. */
export function getDisclosureLog(durable: boolean): DisclosureLog {
  if (durable) {
    if (!productionFactory) throw new DisclosureLogNotConfiguredError();
    return productionFactory();
  }
  if (!processLog) processLog = createMemoryDisclosureLog();
  return processLog;
}

export function _resetDisclosureLog(): void {
  processLog = null;
}

/**
 * Whether a purpose counts as an accountable disclosure. Treatment/payment/
 * operations disclosures are exempt from the accounting under HIPAA; the rest
 * (patient-request, required-by-law, public-health, break-glass) ARE accountable.
 */
export function isAccountable(purpose: DisclosurePurpose): boolean {
  return !(purpose === 'treatment' || purpose === 'payment' || purpose === 'operations');
}
