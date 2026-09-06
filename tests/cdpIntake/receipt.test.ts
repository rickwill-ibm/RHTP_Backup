import { describe, it, expect } from 'vitest';
import { sha256, buildReceipt } from '@/lib/cdp-intake/receipt';
import type { ClassifiedFile } from '@/lib/cdp-intake/types';

const c: ClassifiedFile = {
  file: 'a.fhir.json',
  sourceSystem: 'EHR',
  format: 'fhir-json',
  adapter: 'fhir-bundle',
  arrivalMode: 'batch',
  path: '/x/a.fhir.json',
  bytes: 3,
  text: 'abc',
  sha256: sha256('abc'),
};

describe('cdp-intake/receipt', () => {
  it('sha256 is deterministic and content-sensitive', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });

  it('builds a PHI-safe receipt — counts/ids/hashes, never payload values', () => {
    const r = buildReceipt('/dir', [c], '1970-01-01T00:00:00.000Z');
    expect(r.files).toHaveLength(1);
    expect(r.files[0].sha256).toBe(sha256('abc'));
    expect(r.receiptId).toHaveLength(16);
    // The verbatim payload text must NEVER appear in the receipt.
    expect(JSON.stringify(r)).not.toContain('abc');
  });
});
