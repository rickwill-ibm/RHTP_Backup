/**
 * orderToCashDedupe.test.ts — E13 test-link + behavior for the dedupe envelope
 * (Wave-2 W2-2 / FINDING 3). A replay is NOT a fresh adjudication, so the deduped
 * result must never surface a live `underpaid` reconciliation / recovery / integrity
 * as if newly found; when the persisted record is available it is returned with a
 * freshly recomputed read-path integrity, else a minimal identity-only envelope.
 */
import { describe, it, expect } from 'vitest';
import { createEvidenceRecord, sealRecord } from '@/lib/evidence';
import { dedupedResult } from '@/lib/goldenThread/orderToCashDedupe';
import type { ThreadResult } from '@/lib/goldenThread/threadOrchestrator';
import type { CashDeps } from '@/lib/goldenThread/orderToCash';

function baseFor(id: string): ThreadResult {
  const evidence = createEvidenceRecord({
    id,
    memberId: 'M-1',
    order: { code: '72148' },
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  // Minimal ThreadResult — dedupedResult only reads base.evidence.id and spreads base.
  return { evidence, memberId: 'M-1', netRequiresPA: true } as unknown as ThreadResult;
}

function storeReturning(record: unknown) {
  return {
    async get(id: string) {
      return (record as { id: string }).id === id ? record : null;
    },
    async save() {
      /* no-op */
    },
  };
}

describe('dedupedResult — unambiguous replay envelope', () => {
  it('with no store: returns identity + deduped, OMITTING reconciliation/currentTier/recovery/integrity', async () => {
    const res = await dedupedResult(baseFor('ev-1'), {} as unknown as CashDeps);
    expect(res.deduped).toBe(true);
    expect(res.evidence.id).toBe('ev-1');
    expect((res as { reconciliation?: unknown }).reconciliation).toBeUndefined();
    expect((res as { currentTier?: unknown }).currentTier).toBeUndefined();
    expect((res as { recovery?: unknown }).recovery).toBeUndefined();
    expect(res.integrity).toBeUndefined();
  });

  it('with a store holding the persisted record: returns that record + summary + deduped (no live verdict)', async () => {
    const persisted = createEvidenceRecord({
      id: 'ev-2',
      memberId: 'M-1',
      order: { code: '72148' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const deps = { store: storeReturning(persisted) } as unknown as CashDeps;
    const res = await dedupedResult(baseFor('ev-2'), deps);
    expect(res.deduped).toBe(true);
    expect(res.evidence).toBe(persisted);
    expect(res.summary).toBeDefined();
    expect((res as { reconciliation?: unknown }).reconciliation).toBeUndefined();
    expect(res.integrity).toBeUndefined(); // no signer → no integrity block
  });

  it('with a sealed persisted record + signer: recomputes a read-path integrity verdict', async () => {
    const signer = { keyId: 'demo-hmac-v1', secret: 'deadbeef' };
    const plain = createEvidenceRecord({
      id: 'ev-3',
      memberId: 'M-1',
      order: { code: '72148' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const seal = sealRecord(plain, signer, '2026-01-01T00:00:00.000Z');
    const sealed = { ...plain, seal };
    const deps = { store: storeReturning(sealed), signer } as unknown as CashDeps;
    const res = await dedupedResult(baseFor('ev-3'), deps);
    expect(res.deduped).toBe(true);
    expect(res.integrity).toBeDefined();
    expect(res.integrity?.intact).toBe(true);
    expect(res.integrity?.signed).toBe(true);
  });
});
