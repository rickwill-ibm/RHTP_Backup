import { describe, it, expect } from 'vitest';
import { createSim, advance } from '@/lib/goldenThread/flowSim';
import { EXPORT_COLUMNS, buildReconCsv, buildReconJson } from '@/lib/goldenThread/reconExport';

/**
 * The reconciliation export is minimum-necessary: codes / refs / amounts only. These lock that the
 * export allowlist can NEVER widen to a PHI field — the single most likely place to leak a raw
 * claimId (a stored field on ReconRecord) is an unreviewed serializer.
 */
const PHI_FIELDS = ['claimId', 'memberId', 'member', 'mrn', 'ssn', 'dob', 'name'];

describe('reconExport — minimum-necessary, no PHI', () => {
  it('the export allowlist contains no PHI field', () => {
    for (const col of EXPORT_COLUMNS) {
      expect(PHI_FIELDS, `export column ${col}`).not.toContain(col);
    }
    // claimRef is the MASKED reference (••••); the raw claimId must never be a column
    expect(EXPORT_COLUMNS as readonly string[]).not.toContain('claimId');
    expect(EXPORT_COLUMNS as readonly string[]).toContain('claimRef');
  });

  it('a real export carries no raw claimId value from the sub-ledger', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 200; i += 1) advance(s);
    expect(s.reconLedger.length).toBeGreaterThan(0);
    const csv = buildReconCsv(s.reconLedger);
    const json = buildReconJson(s.reconLedger);
    // every record's raw claimId must be absent from both serializations (guard length so a short
    // numeric id can't coincidentally match an amount and flake the test)
    for (const r of s.reconLedger) {
      if (r.claimId.length >= 6) {
        expect(csv.includes(r.claimId)).toBe(false);
        expect(json.includes(r.claimId)).toBe(false);
      }
    }
    // the field name itself never appears as a column
    expect(csv.split('\n')[0].includes('claimId')).toBe(false);
    // header is exactly the allowlist
    expect(csv.split('\n')[0]).toBe(EXPORT_COLUMNS.join(','));
  });
});
