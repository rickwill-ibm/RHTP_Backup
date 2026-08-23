/**
 * Right-to-delete over the APPEND-ONLY evidence ledger, done correctly.
 *
 * Runs against the REAL pg-mem-backed evidence ledger (the same store the app
 * uses in production), so we prove the property that matters: erasure is a
 * governed tombstone APPEND, never a row delete — the prior versions stay
 * readable (immutability + auditability), the latest snapshot is segmented, and
 * a legal hold refuses the erasure outright (E9).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newDb, type IMemoryDb } from 'pg-mem';
import * as clock from '@/lib/clock';
import {
  applyMigrations,
  createPgEvidenceLedger,
  type PgEvidenceLedger,
  type PgLike,
} from '@/lib/evidence/store';
import {
  createEvidenceRecord,
  appendEntry,
  type EvidenceRecord,
} from '@/lib/evidence';
import {
  executeRightToDelete,
  isTombstoned,
  TOMBSTONE_MARKER,
  createLegalHoldRegistry,
} from '@/lib/lifecycle';

async function freshLedger(): Promise<{ db: IMemoryDb; pool: PgLike; ledger: PgEvidenceLedger }> {
  const db = newDb();
  const PoolCtor = db.adapters.createPg().Pool;
  const pool = new PoolCtor() as unknown as PgLike;
  await applyMigrations(pool, { realPostgres: false });
  return { db, pool, ledger: createPgEvidenceLedger(pool) };
}

function seedRecord(id: string, memberId = 'mem-1'): EvidenceRecord {
  let r = createEvidenceRecord({
    id,
    memberId,
    order: { code: '72148', display: 'MRI lumbar' },
    createdAt: '2026-08-01T00:00:00.000Z',
  });
  r = appendEntry(r, { id: 'e1', ts: '2026-08-01T00:01:00.000Z', stage: 'eligibility', type: 'eligibility', requiresPA: true });
  r = appendEntry(r, { id: 'e2', ts: '2026-08-01T00:02:00.000Z', stage: 'prior-auth', type: 'note', text: 'clinical detail' });
  return r;
}

describe('right-to-delete — governed tombstone preserves ledger immutability', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-23T12:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('tombstones by APPENDING a new version; prior versions stay readable', async () => {
    const { ledger } = await freshLedger();
    await ledger.save(seedRecord('ev-1'));
    const registry = createLegalHoldRegistry();

    const before = await ledger.readLedger('ev-1');
    expect(before).toHaveLength(1);

    const res = await executeRightToDelete(ledger, registry, {
      recordId: 'ev-1',
      policyId: 'gdpr-erasure',
      legalBasis: 'GDPR Art.17',
      actor: 'dpo:1',
    });
    expect(res.status).toBe('tombstoned');
    expect(res.priorVersionCount).toBe(1);

    // A NEW version was appended (immutability: nothing deleted/updated).
    const after = await ledger.readLedger('ev-1');
    expect(after).toHaveLength(2);
    // The original version is byte-for-byte still there with its original entries.
    expect(after[0].record.entries.map((e) => e.id)).toEqual(['e1', 'e2']);

    // The LATEST snapshot is the segmented tombstone (erased entries removed).
    const latest = await ledger.get('ev-1');
    expect(latest && isTombstoned(latest)).toBe(true);
    expect(latest?.entries).toHaveLength(1);
    expect(latest?.entries[0].type).toBe('note');
    expect((latest?.entries[0] as { text: string }).text).toContain(TOMBSTONE_MARKER);
    expect((latest?.entries[0] as { text: string }).text).toContain('erasedEntries=2');
  });

  it('is idempotent — a second erasure is a no-op (already-tombstoned)', async () => {
    const { ledger } = await freshLedger();
    await ledger.save(seedRecord('ev-2'));
    const registry = createLegalHoldRegistry();
    const req = { recordId: 'ev-2', policyId: 'p', legalBasis: 'GDPR Art.17', actor: 'dpo:1' };

    await executeRightToDelete(ledger, registry, req);
    const versionsAfterFirst = (await ledger.readLedger('ev-2')).length;
    const second = await executeRightToDelete(ledger, registry, req);

    expect(second.status).toBe('already-tombstoned');
    // No further append happened.
    expect((await ledger.readLedger('ev-2')).length).toBe(versionsAfterFirst);
  });

  it('returns not-found for an unknown record (no append)', async () => {
    const { ledger } = await freshLedger();
    const registry = createLegalHoldRegistry();
    const res = await executeRightToDelete(ledger, registry, {
      recordId: 'nope',
      policyId: 'p',
      legalBasis: 'GDPR Art.17',
      actor: 'dpo:1',
    });
    expect(res.status).toBe('not-found');
    expect(await ledger.get('nope')).toBeNull();
  });
});

describe('right-to-delete — LEGAL HOLD blocks erasure (E9)', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-23T12:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('a hold on the member refuses the tombstone; the ledger is unchanged', async () => {
    const { ledger } = await freshLedger();
    await ledger.save(seedRecord('ev-3', 'mem-held'));
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'mem-held', reason: 'litigation', placedBy: 'legal:1' });

    const res = await executeRightToDelete(ledger, registry, {
      recordId: 'ev-3',
      policyId: 'gdpr-erasure',
      legalBasis: 'GDPR Art.17',
      actor: 'dpo:1',
    });

    expect(res.status).toBe('blocked-legal-hold');
    expect(res.audit.action).toBe('lifecycle.right-to-delete.blocked');
    expect(res.audit.outcome).toBe('blocked');
    // No append: still one version, not tombstoned.
    expect(await ledger.readLedger('ev-3')).toHaveLength(1);
    const latest = await ledger.get('ev-3');
    expect(latest && isTombstoned(latest)).toBe(false);
  });

  it('a hold on the record id also blocks; releasing it lets erasure proceed', async () => {
    const { ledger } = await freshLedger();
    await ledger.save(seedRecord('ev-4', 'mem-4'));
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'ev-4', reason: 'subpoena', placedBy: 'legal:2' });

    let res = await executeRightToDelete(ledger, registry, {
      recordId: 'ev-4', policyId: 'p', legalBasis: 'GDPR Art.17', actor: 'dpo:1',
    });
    expect(res.status).toBe('blocked-legal-hold');
    expect(await ledger.readLedger('ev-4')).toHaveLength(1);

    registry.release('ev-4', 'legal:2');
    res = await executeRightToDelete(ledger, registry, {
      recordId: 'ev-4', policyId: 'p', legalBasis: 'GDPR Art.17', actor: 'dpo:1',
    });
    expect(res.status).toBe('tombstoned');
    expect(await ledger.readLedger('ev-4')).toHaveLength(2);
  });
});
