import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  appendEntry,
  entryHash,
  chainOfRecord,
  sealRecord,
  verifyLedgerIntegrity,
  type EvidenceEntry,
  type EvidenceRecord,
  type SigningKey,
} from '@/lib/evidence';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';

/**
 * Wave-2 W2-1 — ledger integrity: tamper-evident hash-chain + signing seal.
 * INTEGRITY / PROVENANCE only (no tier interaction is asserted or expected here).
 */

const TS = '2026-01-01T00:00:00.000Z';
const SIGNER: SigningKey = { keyId: 'demo-hmac-v1', secret: 'a'.repeat(64) };
const WRONG_KEY: SigningKey = { keyId: 'demo-hmac-v1', secret: 'b'.repeat(64) };

function note(id: string, text: string): EvidenceEntry {
  return { id, ts: TS, stage: 'eligibility', type: 'note', text };
}

function rec(id: string, memberId: string, entries: EvidenceEntry[]): EvidenceRecord {
  let r = createEvidenceRecord({ id, memberId, order: { code: 'CPT-1' }, createdAt: TS });
  for (const e of entries) r = appendEntry(r, e);
  return r;
}

const ENTRIES = () => [note('e1', 'first'), note('e2', 'second'), note('e3', 'third')];

describe('entryHash — deterministic + canonical (key-order invariant)', () => {
  it('is deterministic across calls', () => {
    const e = note('e1', 'first');
    expect(entryHash(e)).toBe(entryHash(e));
  });

  it('is stable under object KEY reorder (canonical JSON)', () => {
    const a = { id: 'e1', ts: TS, stage: 'eligibility', type: 'note', text: 'x' } as EvidenceEntry;
    const b = { text: 'x', type: 'note', stage: 'eligibility', ts: TS, id: 'e1' } as EvidenceEntry;
    expect(entryHash(a)).toBe(entryHash(b));
  });

  it('changes when any field value changes', () => {
    expect(entryHash(note('e1', 'first'))).not.toBe(entryHash(note('e1', 'FIRST')));
  });
});

describe('chainOfRecord — deterministic + order-sensitive', () => {
  it('is deterministic and links every entry', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    expect(chainOfRecord(r)).toEqual(chainOfRecord(r));
    expect(chainOfRecord(r)).toHaveLength(3);
  });

  it('is order-sensitive (reordering entries changes the chain head)', () => {
    const a = rec('recX', 'mem1', [note('e1', 'first'), note('e2', 'second')]);
    const b = rec('recX', 'mem1', [note('e2', 'second'), note('e1', 'first')]);
    const headA = chainOfRecord(a).at(-1);
    const headB = chainOfRecord(b).at(-1);
    expect(headA).not.toBe(headB);
  });
});

describe('sealRecord / verifyLedgerIntegrity — happy path', () => {
  it('a valid seal verifies intact + signed with the signing key', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    expect(seal.alg).toBe('HMAC-SHA256');
    expect(seal.keyId).toBe('demo-hmac-v1');
    expect(seal.entryCount).toBe(3);
    const res = verifyLedgerIntegrity(r, seal, SIGNER);
    expect(res.intact).toBe(true);
    expect(res.signed).toBe(true);
    expect(res.reasons).toEqual([]);
  });

  it('ts is caller-supplied and echoed on the seal (never minted)', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    expect(sealRecord(r, SIGNER, TS).ts).toBe(TS);
  });
});

describe('tamper-evidence — any edit/drop/reorder breaks intact', () => {
  it('editing an entry → intact:false', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    const tampered = rec('recX', 'mem1', [note('e1', 'first'), note('e2', 'EDITED'), note('e3', 'third')]);
    const res = verifyLedgerIntegrity(tampered, seal, SIGNER);
    expect(res.intact).toBe(false);
    expect(res.signed).toBe(false);
    expect(res.reasons.some((x) => x.includes('chainHead'))).toBe(true);
  });

  it('dropping an entry → intact:false (chainHead + entryCount)', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    const dropped = rec('recX', 'mem1', [note('e1', 'first'), note('e2', 'second')]);
    const res = verifyLedgerIntegrity(dropped, seal, SIGNER);
    expect(res.intact).toBe(false);
    expect(res.reasons.some((x) => x.includes('entryCount'))).toBe(true);
  });

  it('reordering entries → intact:false (count matches, chain differs)', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    const reordered = rec('recX', 'mem1', [note('e2', 'second'), note('e1', 'first'), note('e3', 'third')]);
    const res = verifyLedgerIntegrity(reordered, seal, SIGNER);
    expect(res.intact).toBe(false);
    expect(res.reasons.some((x) => x.includes('chainHead'))).toBe(true);
  });
});

describe('append-after-seal — entryCount mismatch breaks intact', () => {
  it('appending after sealing → intact:false', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    const appended = appendEntry(r, note('e4', 'later'));
    const res = verifyLedgerIntegrity(appended, seal, SIGNER);
    expect(res.intact).toBe(false);
    expect(res.reasons.some((x) => x.includes('entryCount'))).toBe(true);
  });
});

describe('identity binding — a seal is not transferable between records', () => {
  it('a valid seal from record X → intact:false on record Y (identical entries, different id/memberId)', () => {
    const entries = ENTRIES();
    const x = rec('recX', 'mem1', entries);
    const y = rec('recY', 'mem2', entries.map((e) => ({ ...e }))); // identical entry sequence
    // Chain heads coincide (entries identical) — only the bound identity differs.
    expect(chainOfRecord(x).at(-1)).toBe(chainOfRecord(y).at(-1));
    const sealX = sealRecord(x, SIGNER, TS);
    const res = verifyLedgerIntegrity(y, sealX, SIGNER);
    expect(res.intact).toBe(false);
    expect(res.reasons.some((r) => r.includes('recordId'))).toBe(true);
    expect(res.reasons.some((r) => r.includes('memberId'))).toBe(true);
  });
});

describe('signature — valid key signs, forged/wrong key does not (timing-safe)', () => {
  it('correct key → signed:true', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    expect(verifyLedgerIntegrity(r, sealRecord(r, SIGNER, TS), SIGNER).signed).toBe(true);
  });

  it('wrong-key verifier → intact:true but signed:false', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = sealRecord(r, SIGNER, TS);
    const res = verifyLedgerIntegrity(r, seal, WRONG_KEY);
    expect(res.intact).toBe(true); // record untouched
    expect(res.signed).toBe(false); // but not attested by this key
    expect(res.reasons.some((x) => x.toLowerCase().includes('signature'))).toBe(true);
  });

  it('forged signature → signed:false', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = { ...sealRecord(r, SIGNER, TS), signature: 'f'.repeat(64) };
    expect(verifyLedgerIntegrity(r, seal, SIGNER).signed).toBe(false);
  });

  it('malformed (wrong-length) signature → signed:false, no throw', () => {
    const r = rec('recX', 'mem1', ENTRIES());
    const seal = { ...sealRecord(r, SIGNER, TS), signature: 'abc' };
    expect(() => verifyLedgerIntegrity(r, seal, SIGNER)).not.toThrow();
    expect(verifyLedgerIntegrity(r, seal, SIGNER).signed).toBe(false);
  });
});

describe('degenerate — empty + single-entry records', () => {
  it('empty record: chain [], chainHead "" — seal verifies', () => {
    const r = rec('recEmpty', 'mem1', []);
    expect(chainOfRecord(r)).toEqual([]);
    const seal = sealRecord(r, SIGNER, TS);
    expect(seal.chainHead).toBe('');
    expect(seal.entryCount).toBe(0);
    const res = verifyLedgerIntegrity(r, seal, SIGNER);
    expect(res.intact).toBe(true);
    expect(res.signed).toBe(true);
  });

  it('single-entry record: seal verifies, edit breaks it', () => {
    const r = rec('recOne', 'mem1', [note('e1', 'only')]);
    const seal = sealRecord(r, SIGNER, TS);
    expect(verifyLedgerIntegrity(r, seal, SIGNER).signed).toBe(true);
    const tampered = rec('recOne', 'mem1', [note('e1', 'ONLY')]);
    expect(verifyLedgerIntegrity(tampered, seal, SIGNER).intact).toBe(false);
  });
});

describe('signingKey seam — the seeded demo key seals + verifies end-to-end', () => {
  it('seeded loader key produces a verifying seal', async () => {
    const material = await getSigningKeyLoader().load('2026-01-01');
    const key: SigningKey = { keyId: material.keyId, secret: material.secret };
    expect(key.keyId).toBe('demo-hmac-v1');
    const r = rec('recX', 'mem1', ENTRIES());
    const res = verifyLedgerIntegrity(r, sealRecord(r, key, TS), key);
    expect(res.intact && res.signed).toBe(true);
  });
});
