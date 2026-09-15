/**
 * orderToCashDedupe.ts — the UNAMBIGUOUS dedupe envelope for the order→cash
 * continuation (Wave-2 W2-2, FINDING 3). Extracted from orderToCash.ts to keep
 * that orchestrator under the file-size cap; the types are imported type-only so
 * there is no runtime import cycle.
 */
import { verifyLedgerIntegrity, summarize } from '@/lib/evidence';
import type { ThreadResult } from './threadOrchestrator';
import type { CashDeps, CashResult } from './orderToCash';

/**
 * FINDING 3: a replay is NOT a fresh adjudication, so it must never surface a live
 * `underpaid` reconciliation / recovery / integrity as if newly found. We PREFER
 * returning the previously PERSISTED record (loaded via the store) with a freshly
 * RECOMPUTED read-path integrity (the ledger is untrusted on read) — authoritative
 * and honest. When the persisted record is not available (no store, or a
 * different-store replay), we fall back to a minimal envelope: the base identity
 * fields plus `deduped: true`, with reconciliation/currentTier/recovery/integrity
 * all OMITTED.
 */
export async function dedupedResult(base: ThreadResult, deps: CashDeps): Promise<CashResult> {
  if (deps.store) {
    const persisted = await deps.store.get(base.evidence.id);
    if (persisted) {
      let integrity: CashResult['integrity'];
      if (deps.signer && persisted.seal) {
        const v = verifyLedgerIntegrity(persisted, persisted.seal, deps.signer);
        integrity = {
          intact: v.intact,
          signed: v.signed,
          alg: persisted.seal.alg,
          keyId: persisted.seal.keyId,
        };
      }
      return {
        ...base,
        evidence: persisted,
        summary: summarize(persisted),
        deduped: true,
        ...(integrity ? { integrity } : {}),
      };
    }
  }
  // Minimal, unambiguous: identity only. No live reconciliation/recovery/integrity.
  return { ...base, deduped: true };
}
