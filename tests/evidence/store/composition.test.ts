/**
 * U4 fix — the evidence production ledger is no longer dead wiring.
 *
 * The route callers now go through getEvidenceStore(); this suite proves the
 * composition root that getEvidenceStore() resolves to in production: with a
 * connection configured it selects the append-only pg ledger; without one it
 * fails loud (never a silent in-memory Map). Mock mode still returns the
 * in-memory default (demo green) — covered here and in pgEvidenceLedger.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import {
  getEvidenceStore,
  setProductionEvidenceStoreFactory,
} from '@/lib/evidence/store';
import {
  registerProductionEvidenceStore,
  evidenceLedgerConnectionString,
  EvidenceLedgerConnectionNotConfiguredError,
} from '@/lib/evidence/store/composition';

const KEYS = ['EVIDENCE_DATABASE_URL', 'DATABASE_URL'] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  clearSessionDataModes();
  setProductionEvidenceStoreFactory(null);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function snapshotEnv(): void {
  for (const k of KEYS) saved[k] = process.env[k];
}

describe('evidence composition root (U4)', () => {
  it('mock mode returns the in-memory default store (demo stays green)', () => {
    setSessionDataMode('evidence', 'mock');
    const store = getEvidenceStore();
    expect(typeof store.save).toBe('function');
    // in-memory store has no ledger history surface
    expect((store as unknown as Record<string, unknown>).readLedger).toBeUndefined();
  });

  it('production + registered factory + NO connection string FAILS LOUD (never in-memory)', () => {
    snapshotEnv();
    delete process.env.EVIDENCE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    registerProductionEvidenceStore();
    setSessionDataMode('evidence', 'production');
    expect(() => getEvidenceStore()).toThrow(EvidenceLedgerConnectionNotConfiguredError);
  });

  it('production + connection string configured selects the pg append-only ledger', () => {
    snapshotEnv();
    process.env.EVIDENCE_DATABASE_URL = 'postgres://user:pw@localhost:5432/evidence';
    registerProductionEvidenceStore();
    setSessionDataMode('evidence', 'production');
    const store = getEvidenceStore();
    // The pg ledger exposes readLedger (version history); the in-memory Map does not.
    expect(typeof (store as unknown as Record<string, unknown>).readLedger).toBe('function');
    expect(evidenceLedgerConnectionString()).toContain('postgres://');
  });
});
