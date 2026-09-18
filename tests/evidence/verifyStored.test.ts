import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  appendEntry,
  sealRecord,
  loadVerifiedRecord,
  type EvidenceEntry,
  type EvidenceRecord,
  type SigningKey,
} from '@/lib/evidence';
import { createInMemoryEvidenceStore } from '@/lib/evidence/evidenceStore';

/**
 * Wave-2 W2-1 (fix) — verify-on-READ.
 *
 * The seal only earns its name if it is re-checked when the record is read BACK.
 * These tests pin the read-path verifier: a persisted, sealed record that is later
 * TAMPERED verifies as NOT intact; an untampered one verifies intact + signed; an
 * unsealed record reports integrity `null` (unsealed is distinct from tampered).
 */
const TS = '2026-01-01T00:00:00.000Z';
const SIGNER: SigningKey = { keyId: 'demo-hmac-v1', secret: 'a'.repeat(64) };

function note(id: string, text: string): EvidenceEntry {
  return { id, ts: TS, stage: 'eligibility', type: 'note', text };
}

function rec(id: string, entries: EvidenceEntry[]): EvidenceRecord {
  let r = createEvidenceRecord({ id, memberId: 'mem-1', order: { code: 'CPT-1' }, createdAt: TS });
  for (const e of entries) r = appendEntry(r, e);
  return r;
}

describe('loadVerifiedRecord — read-path integrity verifier', () => {
  it('detects tampering: mutated stored entries verify as NOT intact', async () => {
    const store = createInMemoryEvidenceStore();
    const record = rec('rec-tamper', [note('e1', 'first'), note('e2', 'second')]);
    const seal = sealRecord(record, SIGNER, TS);
    await store.save({ ...record, seal });

    // TAMPER: persist a record whose entries were edited but the seal left intact —
    // exactly the attack a write-time-only verifier cannot catch on read-back.
    const tampered: EvidenceRecord = {
      ...record,
      entries: [note('e1', 'EDITED'), note('e2', 'second')],
      seal,
    };
    await store.save(tampered);

    const loaded = await loadVerifiedRecord(store, 'rec-tamper', SIGNER);
    expect(loaded).not.toBeNull();
    expect(loaded!.integrity).not.toBeNull();
    expect(loaded!.integrity!.intact).toBe(false);
    expect(loaded!.integrity!.signed).toBe(false);
    expect(loaded!.integrity!.reasons.length).toBeGreaterThan(0);
    // PHI-free reasons only (no member data leaked into the attestation).
    expect(loaded!.integrity!.reasons.join(' ')).not.toContain('mem-1');
  });

  it('an untampered stored record verifies intact + signed', async () => {
    const store = createInMemoryEvidenceStore();
    const record = rec('rec-ok', [note('e1', 'first'), note('e2', 'second')]);
    const seal = sealRecord(record, SIGNER, TS);
    await store.save({ ...record, seal });

    const loaded = await loadVerifiedRecord(store, 'rec-ok', SIGNER);
    expect(loaded!.integrity).toEqual({ intact: true, signed: true, reasons: [] });
  });

  it('a record with NO seal reports integrity null (unsealed ≠ tampered)', async () => {
    const store = createInMemoryEvidenceStore();
    await store.save(rec('rec-unsealed', [note('e1', 'first')]));

    const loaded = await loadVerifiedRecord(store, 'rec-unsealed', SIGNER);
    expect(loaded).not.toBeNull();
    expect(loaded!.integrity).toBeNull();
  });

  it('returns null when no record exists for the id', async () => {
    const store = createInMemoryEvidenceStore();
    expect(await loadVerifiedRecord(store, 'missing', SIGNER)).toBeNull();
  });
});
